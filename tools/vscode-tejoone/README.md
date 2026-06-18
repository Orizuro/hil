# TejoOne Bench — VS Code extension

A small VS Code extension that wraps the `TEJOONE_BENCH` environment variable
with a status-bar bench selector and one-click "Run Robot Tests" commands.

The test code (the `.robot` suites under `tests/` and the `MdbLibrary.py`
wrapper) is bench-agnostic — this extension just decides which bench to
point it at.

## What it does

- **Activity-bar tab ("TejoOne"):** a dedicated sidebar with a Bench view.
  Title-bar icons run the suite on simulator or hardware in one click. The
  view shows the current bench and the configured Robot command.
- **Status bar item:** glance-anywhere indicator (`Bench: hardware` or
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

## How the bench selection reaches every runner

The extension persists the bench choice in two places so that **any**
Robot runner — not just our own commands — uses the right backend:

1. **`TEJOONE_BENCH` env var** is set on every "Run Robot Tests" command
   the extension launches.
2. **`<workspace>/.tejoone/state.json`** is written on every bench switch
   (and reconciled on activation). `MdbLibrary.py` reads this file when
   the env var isn't set.

That covers all the realistic invocation paths:

| Runner                                 | How bench is found        |
|----------------------------------------|---------------------------|
| Our `Run Robot Tests on …` commands    | `TEJOONE_BENCH` env       |
| Robot Framework Test Explorer (LSP)    | `.tejoone/state.json`     |
| Plain `.venv/bin/robot tests/`         | `.tejoone/state.json`     |
| CI explicitly setting `TEJOONE_BENCH`  | env var (wins)            |

The `.tejoone/` folder is gitignored (root `.gitignore` plus a defensive
`.tejoone/.gitignore` written by the extension).

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

The extension does not modify `.robot` test files. It owns three small
seams:

1. Sets `TEJOONE_BENCH` env var when launching Robot itself.
2. Writes `<workspace>/.tejoone/state.json` on every bench change.
3. Sets `ROBOT_OPTIONS=--outputdir results/<slug>/<bench>` so output
   lands in an organised tree.

`MdbLibrary.connect_pkob4()` resolves the bench with this precedence:

1. `TEJOONE_BENCH` environment variable (if set).
2. `.tejoone/state.json` walking up from CWD until `.git`.
3. Default: `pkob4`.

So the extension and the CLI are interchangeable — running

```bash
TEJOONE_BENCH=sim .venv/bin/robot tests/
```

is the same as pressing "Run on simulator" in the editor. And tests
launched through the Robot Framework Test Explorer — which spawns
`robot` directly without env injection — still find the right bench via
the state file.

## Future work

- Per-test-case CodeLens (needs a Robot Framework parser).
- Integration with the (future) board reservation broker — auto-claim the
  PKoB4 before a hardware run, auto-release after. The status bar will
  show queue position when someone else has the board.
- Windows + macOS testing (the extension should work today, but only
  Linux has been validated).
