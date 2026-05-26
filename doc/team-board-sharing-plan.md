# TejoOne — Team Development & Board-Sharing Plan

**Status:** Draft for team review
**Author:** Alexandre
**Last updated:** 2026-05-27

---

## TL;DR

We have one PKoB4-equipped PIC32MZ board, a remote team of 5-10 developers,
a CI/CD pipeline that also needs the board, and a hard requirement to keep
the full VS Code experience (build, flash, breakpoints, Robot tests from the
editor). The PKoB4 can only be owned by one client at a time.

**The plan:**

1. The board lives on a single **lab host** (a Dell R620 we already own).
   The R620 physically owns the PKoB4 over USB and runs the CI runner.
2. Developers connect with **VS Code Remote-SSH** — the IDE feels local,
   but everything (MPLAB X, XC32, debug session, USB) runs on the lab host.
3. A small **reservation broker** mediates exclusive access to the PKoB4.
   Developers, CI, and any future automation are all clients of the broker.
4. A **custom VS Code extension** wraps the broker so claim/release is a
   status-bar interaction, and `Launch TejoOne: default` automatically
   acquires the board as a `preLaunchTask`.
5. Robot Framework tests already work end-to-end via `MdbLibrary.py`. From
   VS Code we run them through the existing `Robot Code` extension, with
   the broker gating access.

Roughly two engineering-weeks of work, no new hardware needed for the
core plan. A second board for CI is the highest-ROI follow-up.

---

## The problem

### What works today

- VS Code is already wired up: MPLAB extension, clangd, `mplab-core-da`
  debug type, build/launch tasks. See `.vscode/launch.json` and
  `.vscode/settings.json`.
- A Robot Framework suite (`tests/smoke.robot`) drives the on-board PKoB4
  through `mdb.sh`, asserting on real peripheral registers
  (currently `LATJ`). The wrapper is in `tests/libraries/MdbLibrary.py`.
- A self-hosted CI runner sits near the board.

### What hurts

> **From `tests/README.md`:** "The PKoB4 debugger can only be owned by one
> process at a time. Before running the tests, close any active MPLAB X
> or VS Code debug session."

That rule is enforced by humans today. With one developer, fine. With 5-10
remote developers plus CI, it becomes:

- Developer flashes a build, walks away with the debug session still open.
- CI tries to run the HIL suite, fails with "tool not found", retries,
  fails again, blocks the pipeline.
- Two developers race to grab the board, both see flaky `mdb.sh` output.
- Nobody knows who has the board right now or how long they'll keep it.

### Constraints

- **Hardware:** One PKoB4-equipped board. Tight budget for additional boards
  in the short term.
- **People:** 5-10 developers, **all remote** — nobody is physically near
  the board.
- **CI:** Self-hosted runner with physical USB access to the board.
- **IDE:** Full VS Code experience must remain. Breakpoints, build, flash,
  one-button Robot test run from the editor.
- **Existing test infrastructure:** Robot suite + `MdbLibrary.py` are
  working and should not be rewritten.

---

## The decision

We will adopt **Path A: "move the developer to the board."** The lab host
physically owns the PKoB4, and developers reach the board by reaching the
host (via VS Code Remote-SSH).

Two alternatives were considered and rejected for now:

**Path B — USB-over-IP (rejected):** Expose the PKoB4 over the network with
`usbip` or VirtualHere so each developer's laptop sees it as a local USB
device. Technically possible, but PKoB4 debug traffic is timing-sensitive
and known to be fragile across VPNs and NATs. We'd be spending complexity
to preserve "USB on my laptop" when nobody actually needs it there.

**Path C — Per-developer boards (deferred):** Buy 5-10 boards, one per dev.
Cleanest from a contention standpoint but ruled out by budget. Worth
revisiting later. **A single extra board for CI** (~$150) is the lowest-cost
exception and removes the most-frequent collision (CI vs. dev) — we
recommend it as a Phase 4 stretch.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Developer laptop (anywhere)                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  VS Code (local UI)                                    │  │
│  │    └─ Remote-SSH ──────────────────────────────────┐   │  │
│  │  Custom VS Code extension (status bar, commands)   │   │  │
│  └────────────────────────────────────────────────────│───┘  │
└─────────────────────────────────────────────────────── │ ────┘
                                                         │
                       VPN (Tailscale / WireGuard)       │
                                                         │
┌─────────────────────────────────────────────────────── │ ────┐
│  Lab host (Dell R620, Ubuntu 22.04)                    │     │
│                                                        ▼     │
│  ┌──────────────────────┐    ┌──────────────────────────┐    │
│  │  VS Code Server      │    │  Reservation broker      │    │
│  │  (per-user)          │◄──►│  (HTTP API,              │    │
│  │  ├─ MPLAB extension  │    │   single-board lease)    │    │
│  │  ├─ clangd           │    └────────────▲─────────────┘    │
│  │  ├─ Robot Code ext.  │                 │                  │
│  │  └─ Shell / build    │                 │                  │
│  └──────────────────────┘                 │                  │
│                                           │                  │
│  ┌──────────────────────┐                 │                  │
│  │  CI runner           │─────────────────┘                  │
│  │  (gitlab-runner /    │                                    │
│  │   github-actions)    │                                    │
│  └──────────────────────┘                                    │
│                                                              │
│  ┌──────────────────────┐                                    │
│  │  MPLAB X 6.30        │ ── mdb.sh ──┐                      │
│  │  XC32 5.10           │             │                      │
│  └──────────────────────┘             ▼                      │
│                                ┌───────────┐                 │
│                                │ Powered   │                 │
│                                │ USB hub   │── USB ──► PKoB4 │
│                                │ (uhubctl) │           board │
│                                └───────────┘                 │
└──────────────────────────────────────────────────────────────┘
```

### What runs where

| Component | Location | Why there |
|---|---|---|
| VS Code UI | Developer laptop | The thing the developer sees |
| VS Code Server, language servers, extensions | Lab host (per-user) | So MPLAB extension can talk to local USB |
| MPLAB X 6.30 + XC32 5.10 + DFPs | Lab host (system-wide) | One install, everyone uses it |
| Reservation broker | Lab host (systemd service) | Single source of truth for who owns the board |
| CI runner agent | Lab host | Same machine that owns the USB |
| Custom VS Code extension | Developer laptop + Server | UI on laptop, calls broker on host |
| Robot Framework | Lab host (per-user venv) | Needs `mdb.sh` and the board |

---

## System spec — the lab host (Dell R620)

### What we have

- Dell PowerEdge R620, 1U
- 2× Intel Xeon E5-26xx (~16 cores / 32 threads, 3.2 GHz boost)
- 96 GB DDR3 ECC RDIMM
- iDRAC7 (out-of-band remote management)
- Dual redundant PSUs
- Dual onboard 1 GbE

### How it fits the role

| Axis | R620 | What we need | Verdict |
|---|---|---|---|
| CPU | 16c/32t | 8-16 cores | Comfortable |
| RAM | 96 GB | 32-64 GB | Exceeds |
| Network | Dual 1 GbE | ~50 Mbps symmetric | Plenty |
| Remote mgmt | iDRAC7 | Smart PDU / IPMI | Better — built-in |
| Power | Dual redundant PSU | UPS recommended | Add UPS anyway |

For this workload (XC32 cross-compile, CMake, clangd indexing, Python)
the Xeons' age does not matter — XC32 produces PIC32 MIPS code and does
not care about host SIMD or clock speed.

### Things to verify and remediate on this specific machine

1. **Storage.** If the R620 still has its original 10k SAS HDDs, CMake
   builds and clangd indexing will be painfully slow. **Recommended
   upgrade: 2× 1 TB SATA SSDs in RAID-1 on the PERC H710** (~$200).
   This is the single highest-ROI change to this box.

   Check current disks:
   ```bash
   sudo lsblk -d -o name,size,rota,model
   # rota=1 means spinning rust
   ```

   Skip NVMe: the R620's BIOS predates NVMe boot. SATA SSDs on the
   existing backplane are the path of least resistance.

2. **iDRAC.** Update firmware, set a strong password, **put it on the
   VPN side of the network only** — older iDRACs have a poor CVE
   history; never expose to the public internet.

3. **UPS.** Dual PSUs protect against a PSU failure, not against grid
   power loss. A small CyberPower 1500VA in front of the R620 is enough
   to ride out a blip and gracefully shut down longer outages.

4. **Fan noise.** R620s ramp aggressively when they see non-Dell-OEM
   drives. If the host sits anywhere near humans, either use Dell-branded
   SSDs or tune the fan curve via `ipmitool` (manual mode + script).

5. **USB topology.** The PKoB4 goes through a **powered, per-port
   switchable USB hub** (e.g. a `uhubctl`-compatible Plugable / Anker
   unit), then into the rear USB of the R620. Rationale:
   - Per-port power switching lets the broker or CI power-cycle a hung
     board over software, no human in the lab.
   - Stable device addressing by bus/port path (udev rule), not by
     `/dev/ttyUSB*` or USB serial.
   - Adding a second board later is plug-and-go.

### Operating costs

- Idle ~100-130 W, busy ~250 W.
- At ~$0.15/kWh, expect **$150-350/year** in electricity for 24/7
  operation. Worth knowing for the team.

---

## Software stack on the lab host

- **OS:** Ubuntu 22.04 LTS (matches the existing
  `/opt/microchip/mplabx/v6.30/` path convention).
- **Toolchain (system-wide, one install):**
  - MPLAB X v6.30 at `/opt/microchip/mplabx/v6.30/`
  - XC32 v5.10 at `/opt/microchip/xc32/v5.10/`
  - PIC32MZ-EF_DFP v1.6.179 (matches `TejoOne.mplab.json`)
- **Build:** CMake 3.25+, Ninja, Git.
- **Python 3.12** with a shared venv under `/opt/tejoone/venv` containing
  `robotframework` and the broker client.
- **VS Code Remote-SSH** — no server-side install needed; VS Code drops
  its server bits into each user's home on first connect.
- **Reservation broker** as a systemd service (`tejoone-broker.service`).
- **CI runner agent** (gitlab-runner / GitHub Actions runner / Jenkins
  agent), configured `concurrent: 1` for HIL jobs.
- **VPN:** Tailscale (recommended) or WireGuard. Magic DNS gives every
  dev a stable hostname like `lab-host.our-tailnet.ts.net`.

---

## Reservation broker

### Scope

A small HTTP service running on the lab host. Single source of truth for
who currently owns the PKoB4. All access to `mdb.sh` and the
`mplab-core-da` debug type goes through it.

### Minimum API

| Endpoint | Purpose |
|---|---|
| `POST /acquire` | Claim the board. Body: `{client, ttl_minutes, reason}`. Returns lease token + expiry. Blocks (with timeout) if already held. |
| `POST /release` | Release a lease. Idempotent. |
| `GET /status` | Returns current holder, queue depth, lease expiry. Cheap, used by the status bar. |
| `POST /admin/force-release` | Steal the lease. Requires admin role. Logs loudly. |
| `POST /admin/power-cycle` | Toggle the PKoB4's USB port off/on via `uhubctl`. |

### Behaviour

- One global lease at a time (one board).
- Leases have a TTL (default 30 minutes). Auto-renew while a session is
  active; expire if a client goes silent.
- Audit log every acquire/release/force-release to a file and to a Slack
  webhook so the team can see contention without asking.
- Persist lease state to disk so a broker restart doesn't lose ownership.

### Build vs. buy

- **Build (recommended for our scale):** ~200 lines of FastAPI + a
  `flock`-style lock file. We own it, it's small, and it does exactly
  what we need for one board / ten clients.
- **Buy / adopt:** [LabGrid](https://labgrid.readthedocs.io/) is the
  off-the-shelf Python tool for hardware board farms. Worth considering
  if we expect to grow to multiple boards / device types. For one PKoB4
  it is more machinery than the problem deserves.

### Where things plug in

- Robot tests: `MdbLibrary.start_mdb()` calls the broker first, refuses
  to spawn `mdb.sh` without a valid lease. Releases on `quit()`.
- VS Code MPLAB debug: a `preLaunchTask` in `.vscode/launch.json` that
  calls a `claim-board.sh` script. A `postDebugTask` releases.
- CI HIL stage: `acquire → robot → release` wrapper.

---

## Custom VS Code extension

This is where the "even if it requires a custom plugin" budget is best
spent. The extension is *thin* — it doesn't reimplement debugging, it just
wraps the broker.

### Scope

- **Status bar item** showing board state, with click-to-claim:
  - `Board: free` (green)
  - `Board: yours (23m left)` (blue)
  - `Board: alice (12m, queue #2)` (yellow)
  - `Board: offline` (red — broker unreachable or USB unplugged)
- **Commands** (Command Palette):
  - `TejoOne: Reserve Board`
  - `TejoOne: Release Board`
  - `TejoOne: Force-Release (admin)`
  - `TejoOne: Power-cycle Board (admin)`
  - `TejoOne: Show Board Activity Log`
- **Hooks** into the existing setup:
  - Adds itself as a `preLaunchTask` requirement for `mplab-core-da`
    debug configurations.
  - Wraps `robot tests/` runs (auto-claim before run, auto-release after).
- **Settings:**
  - `tejoone.brokerUrl`
  - `tejoone.defaultLeaseMinutes`
  - `tejoone.autoReleaseOnDebugStop`

### Distribution

- Internal `.vsix` shipped via a private registry or just dropped in the
  repo at `tools/vscode-extension/`.
- No public marketplace listing.

### Effort

3-5 engineering days for v1. TypeScript, official VS Code extension API.

---

## CI/CD integration

The self-hosted CI runner becomes just another client of the broker.

### Pipeline shape (conceptual)

```yaml
stages:
  - lint
  - build
  - hil    # hardware-in-the-loop, gated by broker

hil_smoke:
  stage: hil
  tags: [self-hosted, lab-host]
  concurrency:
    group: pkob4-board
    cancel-in-progress: false
  script:
    - /opt/tejoone/bin/claim-board.sh ci-${CI_PIPELINE_ID}
    - .venv/bin/robot --dryrun tests/   # cheap sanity
    - cmake --build _build/TejoOne/default --target all
    - .venv/bin/robot tests/
  after_script:
    - /opt/tejoone/bin/release-board.sh
  artifacts:
    paths: [report.html, log.html, output.xml]
```

Key points:

- `concurrency.group: pkob4-board` ensures CI never collides with itself.
- The broker enforces against developers too — if Alice is debugging when
  CI fires, CI waits in the queue (with a sane timeout).
- The same `claim-board.sh` / `release-board.sh` is what developers use
  from the CLI, so there's one code path.

---

## Security posture

- **SSH:** Public-key only, no passwords. SSH server reachable only via VPN.
- **VPN:** Tailscale (or WireGuard) — every team member, every CI runner,
  the iDRAC interface. Nothing public-facing.
- **iDRAC:** Strong password, firmware updated, VPN-side only. Audit log
  for console access.
- **Broker:** Listens on loopback or the VPN interface, never publicly.
  All acquires/releases written to a file + Slack channel.
- **udev / groups:** A `pkob4` group; only the broker service account and
  the CI runner account are members. Developers cannot bypass the broker
  to run `mdb.sh` directly.
- **No sudo for developers** on the toolchain or udev rules. Toolchain is
  system-installed and immutable from a dev's perspective.

---

## Phased rollout

### Phase 0 — Architecture sign-off (½ day)

Get team buy-in on this document. Confirm the "move the developer to the
board" model.

### Phase 1 — Stand up the lab host (2-3 days)

- Provision Ubuntu 22.04 LTS on the R620.
- Swap to SSDs if needed; configure RAID-1 on H710.
- Install MPLAB X 6.30 + XC32 5.10 + DFPs to match the current project.
- Set up Tailscale (or chosen VPN), iDRAC on the VPN side.
- Create per-user accounts, set up `pkob4` group.
- Configure powered USB hub + udev rule for the board.
- Validate: one developer connects via VS Code Remote-SSH, builds the
  project, flashes the board, runs the Robot suite — all from the IDE.

### Phase 2 — Reservation broker (2-3 days)

- Build the FastAPI broker. Persist leases to disk.
- Write `claim-board.sh` / `release-board.sh` CLI clients.
- Integrate into `MdbLibrary.py` — refuse to start `mdb.sh` without a
  lease, release on `Quit`.
- Wire CI's HIL stage to acquire/release.
- Slack audit channel.

### Phase 3 — Custom VS Code extension (3-5 days)

- TypeScript scaffold, talk to broker.
- Status bar + commands.
- `preLaunchTask` hook for `Launch TejoOne: default`.
- Auto-release on debug stop.
- Package as `.vsix`, drop in `tools/vscode-extension/`.
- Write a one-page onboarding doc for the team.

### Phase 4 — Stretch: second board for CI (when budget allows)

A second PIC32MZ + PKoB4 (~$150) on the lab host removes the most-frequent
collision (CI blocking devs and vice versa). The broker design already
supports N boards — this is mostly a hardware change plus extending the
broker's lease model from "one global lease" to "per-board lease."

### Phase 5 — Tier-1 simulator, tier-2 hardware (future)

The MPLAB Simulator is already configured in `TejoOne.mplab.json`. For
pure-logic changes, iterate against the simulator (no board needed at
all). Reserve real-board runs for changes that touch peripherals or
timing. Split the Robot suite into `tests/sim/` and `tests/hil/`.

---

## Costs

### One-shot

| Item | Estimate | Notes |
|---|---|---|
| 2× 1 TB SATA SSD | $200 | If current disks are HDD |
| Powered USB hub (`uhubctl` compatible) | $50 | Plugable / Anker |
| UPS (CyberPower 1500VA) | $200 | Or equivalent |
| Cables, rack space, miscellaneous | $100 | |
| **One-shot total** | **~$550** | |

Engineering cost: ~2 engineering-weeks for the broker + VS Code extension.

### Recurring

| Item | Estimate | Notes |
|---|---|---|
| Electricity (24/7 R620) | $150-350/yr | Depends on rate and load |
| Tailscale (free tier sufficient) | $0 | Free for small teams |
| GitHub Actions / GitLab CI runner | $0 | Self-hosted, just compute |
| **Recurring total** | **~$200-400/yr** | |

### Stretch — Phase 4

| Item | Estimate | Notes |
|---|---|---|
| Second PIC32MZ Curiosity board | ~$150 | Eliminates CI ↔ dev collisions |

---

## Open questions and risks

1. **Time zones.** With a fully remote team, what's the spread? VS Code
   Remote-SSH degrades gracefully up to ~150 ms RTT. Beyond that, typing
   feels mushy. If anyone is on the opposite side of the planet from
   where the R620 lives, we may need to revisit.
2. **Where does the R620 live?** A real server room is ideal. A back
   office means fan-noise mitigation matters. A home office is a hard sell.
3. **Who is "admin"?** The broker has force-release and power-cycle
   commands. Need an agreed list of who holds those keys.
4. **Build artifact storage.** Per-user `_build/` trees on the R620 will
   grow. Need a disk-monitoring alert and an occasional cleanup job.
5. **MPLAB X version drift.** Today everyone implicitly uses v6.30 from
   the lab host. When we upgrade, it's a single operation — good. But it
   also means we can't have two MPLAB X versions installed simultaneously
   without conflicts. Future tradeoff to be aware of.

---

## Explicitly out of scope / not chosen

- **Per-developer boards.** Budget says no for now. Revisit in 6 months.
- **USB-over-IP.** Too fragile for the PKoB4's debug traffic across
  remote links. Not pursuing.
- **A cloud CI runner with no board access.** Some teams split this —
  cloud CI for fast software-only checks, self-hosted for HIL. Fine to
  add later; not part of this plan's critical path.
- **Replacing the Robot suite.** It works. We extend it (more keywords,
  more test cases), we don't rewrite it.
- **Rewriting `MdbLibrary.py`.** Small surgical change: a call to the
  broker before `start_mdb()`. That's the whole diff.
