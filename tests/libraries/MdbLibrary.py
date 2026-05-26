"""Robot Framework library for driving the MPLAB Debugger (MDB).

MDB is Microchip's official command-line interface to the MPLAB X debug
toolchain. It supports the on-board PKoB4 (Curiosity / Starter Kit) debugger
out of the box, which means we can program a PIC32 target, halt it, and
inspect symbols / SFRs / memory entirely from a script -- no serial side-
channel required.

The library wraps mdb.sh as a long-lived subprocess. Each Robot keyword
sends a textual command and reads back the output up to MDB's '>' prompt.

Usage from Robot:

    *** Settings ***
    Library    libraries/MdbLibrary.py

    *** Test Cases ***
    Example
        Start Mdb
        Connect Pkob4    PIC32MZ2048EFM144
        Program          ${CURDIR}/../out/TejoOne/default.elf
        Halt
        ${value}=    Read Symbol    PR2
        Should Be Equal As Integers    ${value}    39061
        [Teardown]   Quit

Notes
-----
* Only ONE client can own the PKoB4 at a time. Close any active MPLAB X /
  VS Code debug session before running tests that use this library.
* MDB prints a lot of Java logging on stderr; we merge it into stdout so the
  prompt reader sees a single stream.
* The 'Print' MDB command resolves both C symbols (from the .elf debug info)
  and peripheral SFR names that ship with the device DFP (e.g. PR2, T2CON,
  U6BRG, LATJ). For raw addresses use ``Examine Memory`` instead.
"""

from __future__ import annotations

import os
import re
import select
import subprocess
import time
from typing import Optional

from robot.api import logger
from robot.api.deco import keyword


DEFAULT_MDB_PATH = "/opt/microchip/mplabx/v6.30/mplab_platform/bin/mdb.sh"
PROMPT = ">"


class MdbError(RuntimeError):
    """Raised when MDB returns an error or the subprocess misbehaves."""


class MdbLibrary:
    """Robot Framework library wrapping MPLAB's MDB command-line debugger."""

    ROBOT_LIBRARY_SCOPE = "SUITE"
    ROBOT_LIBRARY_VERSION = "0.1.0"

    def __init__(self, mdb_path: str = DEFAULT_MDB_PATH):
        self._mdb_path = mdb_path
        self._proc: Optional[subprocess.Popen] = None

    # ------------------------------------------------------------------ #
    # Lifecycle                                                          #
    # ------------------------------------------------------------------ #

    @keyword("Start Mdb")
    def start_mdb(self, startup_timeout: float = 30.0) -> None:
        """Spawn mdb.sh and wait for its first prompt."""
        if self._proc is not None and self._proc.poll() is None:
            logger.info("MDB is already running; reusing existing process.")
            return

        if not os.path.exists(self._mdb_path):
            raise MdbError(f"mdb.sh not found at {self._mdb_path}")

        logger.info(f"Launching MDB: {self._mdb_path}")
        self._proc = subprocess.Popen(
            [self._mdb_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # merge so prompt reader sees one stream
            bufsize=0,
            text=True,
        )
        banner = self._read_until_prompt(timeout=startup_timeout)
        logger.debug(f"MDB startup banner:\n{banner}")

    @keyword("Quit")
    def quit(self) -> None:
        """Send 'Quit' to MDB and wait for the process to exit."""
        if self._proc is None:
            return
        try:
            if self._proc.poll() is None:
                try:
                    assert self._proc.stdin is not None
                    self._proc.stdin.write("Quit\n")
                    self._proc.stdin.flush()
                except (BrokenPipeError, OSError):
                    pass
                try:
                    self._proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    logger.warn("MDB did not exit on Quit; killing.")
                    self._proc.kill()
                    self._proc.wait(timeout=5)
        finally:
            self._proc = None

    # ------------------------------------------------------------------ #
    # Device / tool selection                                            #
    # ------------------------------------------------------------------ #

    @keyword("Connect Pkob4")
    def connect_pkob4(self, device: str) -> None:
        """Select the target device and the on-board PKoB4 hardware tool."""
        self._send(f"Device {device}", timeout=15)
        # Selecting the tool can take a few seconds while MDB enumerates USB.
        # MDB's Java logging is noisy and full of words like "error" in
        # benign contexts, so we verify success by looking for the explicit
        # "Target device ... found" marker instead of grepping for failure.
        out = self._send("Hwtool pkob4", timeout=45)
        if not re.search(r"Target device .+ found", out):
            raise MdbError(
                "MDB could not select the PKoB4 / connect to the target. "
                "Make sure the board is plugged in and no other MPLAB X / "
                f"VS Code debug session is attached. MDB output:\n{out}"
            )

    # ------------------------------------------------------------------ #
    # Programming and run control                                        #
    # ------------------------------------------------------------------ #

    @keyword("Program")
    def program(self, elf_path: str, timeout: float = 120.0) -> None:
        """Program the target with the given .elf file."""
        if not os.path.isfile(elf_path):
            raise MdbError(f"ELF file not found: {elf_path}")
        out = self._send(f"Program \"{elf_path}\"", timeout=timeout)
        # Same reasoning as connect_pkob4: trust an explicit success marker
        # rather than grepping for "error" in MDB's verbose Java logging.
        if not re.search(r"Program(ming)?.*(complete|succeeded|success)",
                         out, re.IGNORECASE):
            raise MdbError(f"MDB did not report programming success:\n{out}")

    @keyword("Halt")
    def halt(self) -> None:
        """Halt the target CPU."""
        self._send("Halt", timeout=10)

    @keyword("Run")
    def run(self) -> None:
        """Resume target execution."""
        self._send("Run", timeout=10)

    @keyword("Wait")
    def wait(self, seconds: float) -> None:
        """Sleep for ``seconds`` while the target keeps running.

        Does not touch MDB -- the board simply continues executing whatever
        it was doing. Useful between ``Run`` and a subsequent ``Halt`` when
        you want to observe a register after letting the firmware run for a
        known duration.
        """
        time.sleep(float(seconds))

    # ------------------------------------------------------------------ #
    # Read access                                                        #
    # ------------------------------------------------------------------ #

    @keyword("Read Symbol")
    def read_symbol(self, name: str) -> int:
        """Read a symbol (C variable or named SFR) and return its integer value.

        Uses MDB's ``Print`` command. The MDB output format varies a little
        between symbol kinds, so we look for the *last* number-shaped token
        in the response and return it.
        """
        out = self._send(f"Print /x {name}", timeout=10)
        value = self._extract_integer(out)
        if value is None:
            raise MdbError(
                f"Could not parse a numeric value from MDB output for "
                f"symbol '{name}':\n{out}"
            )
        logger.info(f"{name} = {value} (0x{value:X})")
        return value

    # ------------------------------------------------------------------ #
    # Internals                                                          #
    # ------------------------------------------------------------------ #

    def _send(self, command: str, timeout: float) -> str:
        """Send a command and return everything MDB printed before the next prompt."""
        if self._proc is None or self._proc.poll() is not None:
            raise MdbError("MDB is not running. Did you forget 'Start Mdb'?")
        assert self._proc.stdin is not None
        logger.debug(f">>> {command}")
        self._proc.stdin.write(command + "\n")
        self._proc.stdin.flush()
        return self._read_until_prompt(timeout=timeout)

    def _read_until_prompt(self, timeout: float) -> str:
        """Read MDB stdout until we see the '>' prompt or hit the timeout."""
        assert self._proc is not None and self._proc.stdout is not None
        fd = self._proc.stdout.fileno()
        deadline = time.monotonic() + timeout
        chunks: list[str] = []

        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise MdbError(
                    f"Timed out after {timeout}s waiting for MDB prompt. "
                    f"Buffer so far:\n{''.join(chunks)}"
                )
            ready, _, _ = select.select([fd], [], [], remaining)
            if not ready:
                continue
            data = os.read(fd, 4096)
            if not data:
                # EOF -- process likely died
                raise MdbError(
                    "MDB process closed its output unexpectedly. "
                    f"Buffer so far:\n{''.join(chunks)}"
                )
            chunks.append(data.decode(errors="replace"))
            joined = "".join(chunks)
            # The prompt appears at the start of a line. Accept either a
            # trailing '\n>' or '> ' to be robust to MDB's spacing.
            stripped = joined.rstrip()
            if stripped.endswith(PROMPT):
                return joined

    _INT_TOKEN_RE = re.compile(r"(?:0x[0-9A-Fa-f]+|-?\d+)")

    def _extract_integer(self, text: str) -> Optional[int]:
        """Return the last integer-shaped token from text, or None."""
        # Drop the trailing prompt and any Java logging lines so we don't
        # accidentally match a timestamp like '2026'.
        cleaned_lines = []
        for line in text.splitlines():
            if not line.strip() or line.strip() == PROMPT:
                continue
            if re.match(r"^\w+ \d+, \d{4} ", line):  # 'May 24, 2026 ...'
                continue
            if line.startswith("INFO:") or line.startswith("WARNING:"):
                continue
            cleaned_lines.append(line)
        cleaned = "\n".join(cleaned_lines)
        tokens = self._INT_TOKEN_RE.findall(cleaned)
        if not tokens:
            return None
        last = tokens[-1]
        return int(last, 16) if last.lower().startswith("0x") else int(last)

    def __del__(self):
        try:
            self.quit()
        except Exception:
            pass
