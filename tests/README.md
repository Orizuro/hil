# TejoOne — Robot Framework tests

These tests drive the firmware on the real PIC32MZ board through the on-board
**PKoB4** debugger. They do **not** rely on UART traffic — assertions are made
by reading symbols, peripheral registers, and memory directly via Microchip's
MDB command-line debugger.

## Layout

```
tests/
  smoke.robot              # the suite (currently one test)
  libraries/
    MdbLibrary.py          # Python wrapper around mdb.sh
  README.md                # this file
```

## Prerequisites

- The `.venv/` at the project root with `robotframework` installed
  (already present).
- MPLAB X v6.30 installed at `/opt/microchip/mplabx/v6.30/` (the path is
  hard-coded as `DEFAULT_MDB_PATH` in `MdbLibrary.py` — change it there if
  your install lives elsewhere).
- The PIC32MZ Curiosity board connected over USB.
- A current build at `out/TejoOne/default.elf` (the suite does **not**
  build for you — build via VS Code or CMake first).

## Running the suite

From the project root:

```bash
.venv/bin/robot tests/
```

That's it. Results land in `report.html`, `log.html`, and `output.xml` in the
current directory.

To validate suite syntax without touching the board (useful in CI or before
committing):

```bash
.venv/bin/robot --dryrun tests/
```

## ⚠️ Only one client at a time on the PKoB4

The PKoB4 debugger can only be owned by one process at a time. **Before
running the tests, close any active MPLAB X or VS Code debug session.** If
MDB fails with "tool not found" or similar, this is almost always the cause.

## What the current test does

`PR2 Matches MCC Configuration` walks through:

1. Spawn `mdb.sh` as a subprocess.
2. `Device PIC32MZ2048EFM144` + `Hwtool pkob4` — select target & debugger.
3. `Program out/TejoOne/default.elf` — flash the board.
4. `Halt` — stop the CPU so the registers are stable.
5. `Print /x PR2` — read the Timer 2 period register.
6. Assert it equals `39061` (the value MCC sets via `tmr2.yml`).

If MCC config drifts, or somebody hand-edits `plib_tmr2.c`, this test fails.

## Extending the suite

Adding more checks is mostly a matter of writing more `Test Cases`. The
`Read Symbol` keyword works for both C variables (resolved via the .elf's
debug info) and named peripheral SFRs that ship with the device pack
(`T2CON`, `U6BRG`, `U6MODE`, `LATJ`, ...).

A few examples worth adding next:

| What to check                | How                                              |
|------------------------------|--------------------------------------------------|
| Timer is started             | `Read Symbol  T2CON` → assert bit 15 (`ON`) set  |
| UART6 baud divisor           | `Read Symbol  U6BRG` → assert `== 53`            |
| TMR2 callback was registered | `Read Symbol  tmr2Obj.callback_fn` → non-zero    |
| LED line toggles             | Halt, read `LATJ`, `Run`, wait, Halt, read again |

When you start needing the same setup steps in multiple suites, lift them
into a `resources/` folder as a `.resource` file.
