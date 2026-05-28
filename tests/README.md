# TejoOne — Robot Framework tests

These tests drive the firmware through Microchip's MDB command-line debugger,
asserting on symbols, peripheral registers, and memory directly — they do
**not** rely on UART traffic.

Tests can run against one of two **benches**:

- **`pkob4`** (default): the real PIC32MZ board via the on-board PKoB4
  debugger. Catches real hardware behaviour, but only one client can own the
  board at a time.
- **`sim`**: the MPLAB Simulator. No physical board required — useful for
  iterating locally, running tests in parallel, and not blocking your
  teammates. See [Choosing the bench](#choosing-the-bench) below.

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
- A current build at `out/TejoOne/default.elf` (the suite does **not**
  build for you — build via VS Code or CMake first).
- The PIC32MZ Curiosity board connected over USB — **only** for the
  `pkob4` bench. The `sim` bench needs no hardware.

## Running the suite

From the project root:

```bash
.venv/bin/robot tests/
```

That's it. By default Robot writes `report.html`, `log.html`, and
`output.xml` to the current directory.

### Where results land

When tests are launched **through the TejoOne VS Code extension**, results
are auto-organised under:

```
results/
  <suite-slug>/
    sim/    or   pkob4/
      output.xml
      log.html
      report.html
```

For example, running the suite on the simulator from VS Code lands files
in `results/tests/sim/`. The extension does this by setting
`ROBOT_OPTIONS=--outputdir results/<slug>/<bench>` before invoking Robot.

When running Robot from a **plain terminal**, you can get the same layout
manually:

```bash
TEJOONE_BENCH=sim   ROBOT_OPTIONS='--outputdir results/tests/sim'   .venv/bin/robot tests/
TEJOONE_BENCH=pkob4 ROBOT_OPTIONS='--outputdir results/tests/pkob4' .venv/bin/robot tests/
```

The `results/` folder is in `.gitignore` — test artifacts shouldn't be
committed.

To validate suite syntax without touching the board (useful in CI or before
committing):

```bash
.venv/bin/robot --dryrun tests/
```

## Choosing the bench

The suite picks its backend from the `TEJOONE_BENCH` environment variable.
The `.robot` files don't change — only the runner's environment does.

| `TEJOONE_BENCH` | Backend                  | Board required? |
|-----------------|--------------------------|-----------------|
| *(unset)*       | PKoB4 (default)          | yes             |
| `pkob4`         | PKoB4 (explicit)         | yes             |
| `sim`           | MPLAB Simulator          | no              |

Examples:

```bash
# Default: hits the real board
.venv/bin/robot tests/

# Simulator — no board, runs anywhere
TEJOONE_BENCH=sim .venv/bin/robot tests/

# Explicit hardware
TEJOONE_BENCH=pkob4 .venv/bin/robot tests/
```

The **TejoOne VS Code extension** (under `tools/vscode-tejoone/`) wraps this
with a status-bar bench selector and one-click "Run on Simulator" /
"Run on Hardware" commands. Behind the scenes it just sets `TEJOONE_BENCH`
and invokes Robot — exactly the same as the CLI above.

### Sim vs. hardware: what to watch out for

The MPLAB Simulator models the CPU and many peripherals, but **not every
peripheral**. Things that work well in sim:

- Reading SFRs that MCC initialises (timer periods, UART baud divisors,
  GPIO output latches like `LATJ`, etc.) — these are deterministic at
  reset and after a short run.
- Reading C globals and computed memory.
- Cycle-accurate timer/counter behaviour (within the simulated clock).

Things that **don't** work well in sim (these tests should run on `pkob4`
only):

- UART RX, ADC readings, external interrupts, or anything that depends on
  real-world input.
- Anything that requires a peripheral the simulator doesn't model. When in
  doubt, run the test on both benches and compare.

As the suite grows, tag tests that require hardware (e.g. `[Tags] hil`) so
they can be filtered out of sim runs:

```bash
TEJOONE_BENCH=sim .venv/bin/robot --exclude hil tests/
```

## ⚠️ Only one client at a time on the PKoB4

**This caveat applies only to the `pkob4` bench.** The `sim` bench has no
such restriction — multiple developers can run sim suites in parallel on
the same machine or different machines.

The PKoB4 debugger can only be owned by one process at a time. Before
running tests against `pkob4`, close any active MPLAB X or VS Code debug
session that has the board open. If MDB fails with "tool not found" or
similar, this is almost always the cause.

## What the current test does

`LATJ Matches MCC Configuration` walks through:

1. Spawn `mdb.sh` as a subprocess.
2. `Device PIC32MZ2048EFM144` + `Hwtool <bench>` — select target & debugger
   (where `<bench>` is `pkob4` or `sim`, picked from `TEJOONE_BENCH`).
3. `Program out/TejoOne/default.elf` — load the firmware (flashes the board
   on `pkob4`, loads into simulated memory on `sim`).
4. `Run` → `Sleep 5.05` → `Halt` — let the firmware execute briefly, then
   stop the CPU so the registers are stable.
5. `Print /x LATJ` — read the Port J output latch.
6. Assert it equals `80` (the value MCC sets via the GPIO configuration).

If MCC config drifts, or somebody hand-edits the generated peripheral code,
this test fails on both benches.

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
