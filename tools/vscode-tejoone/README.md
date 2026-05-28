# TejoOne Bench — VS Code extension

A small VS Code extension that wraps the `TEJOONE_BENCH` environment variable
with a status-bar bench selector and one-click "Run Robot Tests" commands.

The test code (the `.robot` suites under `tests/` and the `MdbLibrary.py`
wrapper) is bench-agnostic — this extension just decides which bench to
point it at.

## What it does

- **Status bar item:** shows the current bench (`Bench: hardware` or
  `Bench: simulator`). Click to switch.
- **Commands** (Command Palette):
  - `TejoOne: Pick Bench…`
  - `TejoOne: Switch Bench → Simulator`
  - `TejoOne: Switch Bench → Hardware (PKoB4)`
  - `TejoOne: Run Robot Tests (current bench)`
  - `TejoOne: Run Robot Tests on Simulator`
  - `TejoOne: Run Robot Tests on Hardware (PKoB4)`
- **CodeLens** on `.robot` files: two run buttons at the top of every suite.
- **Settings:**
  - `tejoone.bench` — `"sim"` or `"pkob4"` (default `"pkob4"`).
  - `tejoone.robotCommand` — the shell command used to invoke Robot.
    Default: `${workspaceFolder}/.venv/bin/robot tests/`.

Each "Run Robot Tests" command opens a **fresh terminal** with
`TEJOONE_BENCH` set, so the env is always correct and sim/hardware runs
stay visually separated.

### Where results land

Unless you pass your own `-d` / `--outputdir` in `tejoone.robotCommand`,
the extension sets `ROBOT_OPTIONS` so output lands in:

```
<workspaceFolder>/results/<suite-slug>/<bench>/
```

The suite slug is derived from the last path token of your robot
command — e.g. running `.venv/bin/robot tests/` on simulator puts files
in `results/tests/sim/`; running `tests/smoke.robot` on hardware puts
them in `results/smoke/pkob4/`.

If your `tejoone.robotCommand` already contains `-d` or `--outputdir`,
your choice wins and the extension does not override it.

## Build and install

From this folder:

```bash
npm install
npm run compile
npm run package        # produces tejoone-bench-X.Y.Z.vsix
```

Then install into your VS Code:

```bash
code --install-extension tejoone-bench-0.1.0.vsix
```

To uninstall:

```bash
code --uninstall-extension tejoone.tejoone-bench
```

## How it integrates with the rest of the project

The extension does not modify Robot suites or the `MdbLibrary` library. It
only sets `TEJOONE_BENCH` before invoking Robot.

`MdbLibrary.connect_pkob4()` reads `TEJOONE_BENCH` at runtime:

| `TEJOONE_BENCH` | Result                       |
|-----------------|------------------------------|
| *(unset)*       | PKoB4 hardware (default)     |
| `pkob4`         | PKoB4 hardware (explicit)    |
| `sim`           | MPLAB Simulator              |

So the extension and the CLI are interchangeable — running

```bash
TEJOONE_BENCH=sim .venv/bin/robot tests/
```

is the same as pressing "Run on simulator" in the editor.

## Future work

- Per-test-case CodeLens (needs a Robot Framework parser).
- Integration with the (future) board reservation broker — auto-claim the
  PKoB4 before a hardware run, auto-release after. The status bar will
  show queue position when someone else has the board.
- Windows + macOS testing (the extension should work today, but only
  Linux has been validated).
