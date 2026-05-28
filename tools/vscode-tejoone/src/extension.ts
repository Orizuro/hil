import * as vscode from 'vscode';

/**
 * TejoOne Bench extension.
 *
 * Wraps the `TEJOONE_BENCH` environment variable with a status-bar
 * selector and one-click "Run Robot Tests" commands. The test code
 * (Robot suites and the MdbLibrary wrapper) is bench-agnostic: this
 * extension just decides which bench to point it at.
 */

type Bench = 'sim' | 'pkob4';

const CONFIG_NAMESPACE = 'tejoone';
const BENCH_SETTING = 'bench';
const ROBOT_COMMAND_SETTING = 'robotCommand';
const DEFAULT_BENCH: Bench = 'pkob4';
const DEFAULT_ROBOT_COMMAND = '${workspaceFolder}/.venv/bin/robot tests/';

function getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
}

function currentBench(): Bench {
    const value = getConfig().get<string>(BENCH_SETTING, DEFAULT_BENCH);
    return value === 'sim' ? 'sim' : 'pkob4';
}

async function setBench(bench: Bench): Promise<void> {
    const cfg = getConfig();
    // Prefer Workspace scope so each workspace remembers its own bench.
    // Fall back to Global if no workspace is open (e.g. for ad-hoc command runs).
    const target = vscode.workspace.workspaceFolders
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    await cfg.update(BENCH_SETTING, bench, target);
}

function robotCommand(): string {
    return getConfig().get<string>(ROBOT_COMMAND_SETTING, DEFAULT_ROBOT_COMMAND);
}

function resolveVariables(input: string, folder: vscode.WorkspaceFolder | undefined): string {
    if (!folder) {
        return input;
    }
    return input.replace(/\$\{workspaceFolder\}/g, folder.uri.fsPath);
}

/**
 * Derive a short "suite slug" from the configured robot command, used to
 * group results in the results/ tree. Examples:
 *   ".venv/bin/robot tests/"            -> "tests"
 *   ".venv/bin/robot tests/smoke.robot" -> "smoke"
 *   ".venv/bin/robot --include hil tests/integration/" -> "integration"
 *
 * Falls back to "default" if we can't make sense of the command.
 */
function deriveSuiteSlug(robotCmd: string): string {
    const tokens = robotCmd.trim().split(/\s+/);
    if (tokens.length < 2) {
        return 'default';
    }
    const last = tokens[tokens.length - 1];
    if (!last || last.startsWith('-')) {
        return 'default';
    }
    const cleaned = last.replace(/[/\\]+$/, ''); // trim trailing slashes
    const base = cleaned.split(/[/\\]/).pop() ?? cleaned;
    const slug = base.replace(/\.robot$/, '').trim();
    return slug || 'default';
}

/**
 * True if the configured robot command already specifies an output
 * directory; in that case we respect the user's choice and don't inject
 * one of our own via ROBOT_OPTIONS.
 */
function userSpecifiesOutputDir(robotCmd: string): boolean {
    // Match `-d <arg>`, `--outputdir <arg>`, `--outputdir=<arg>`.
    return /(^|\s)(-d|--outputdir)(\s|=)/.test(robotCmd);
}

function benchDisplayLabel(bench: Bench): string {
    return bench === 'sim'
        ? '$(server-process) Bench: simulator'
        : '$(circuit-board) Bench: hardware';
}

function benchHumanName(bench: Bench): string {
    return bench === 'sim' ? 'simulator' : 'hardware';
}

function activeWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    // Prefer the folder of the active editor (handles multi-root cleanly).
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (folder) {
            return folder;
        }
    }
    return vscode.workspace.workspaceFolders?.[0];
}

/**
 * Run the configured Robot command in a fresh terminal with TEJOONE_BENCH
 * set to the requested bench. A fresh terminal is intentional: it
 * guarantees the env is correct, and lets the user keep parallel
 * sim/hardware terminals visible in the panel.
 *
 * Result organization: unless the user explicitly passes -d/--outputdir
 * in their robotCommand, we set ROBOT_OPTIONS so output lands in
 *   <workspaceFolder>/results/<suite-slug>/<bench>/
 * Robot Framework auto-creates missing directories.
 */
function runRobot(bench: Bench): void {
    const folder = activeWorkspaceFolder();
    if (!folder) {
        vscode.window.showErrorMessage(
            'TejoOne: no workspace folder open — cannot run Robot tests.'
        );
        return;
    }

    const rawCmd = robotCommand();
    const cmd = resolveVariables(rawCmd, folder);

    let fullCmd = cmd;

    // ROBOT_OPTIONS injection
    if (!userSpecifiesOutputDir(rawCmd)) {
        const slug = deriveSuiteSlug(rawCmd);
        const outputDir = `${folder.uri.fsPath}/results/${slug}/${bench}`;
        fullCmd = `ROBOT_OPTIONS="--outputdir '${outputDir}'" ${fullCmd}`;
    }

    // 🔥 CRITICAL FIX: THIS is what was missing
    fullCmd = `TEJOONE_BENCH=${bench} ${fullCmd}`;

    const terminal = vscode.window.createTerminal({
        name: `Robot (${benchHumanName(bench)})`,
        cwd: folder.uri.fsPath,
    });

    terminal.show();
    terminal.sendText(fullCmd);
}

class RobotCodeLensProvider implements vscode.CodeLensProvider {
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChange.event;

    refresh(): void {
        this._onDidChange.fire();
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (!document.fileName.endsWith('.robot')) {
            return [];
        }
        // Place lenses at the very top of the file. Per-test-case lenses
        // would need a Robot Framework parser; that's a v2 nicety.
        const range = new vscode.Range(0, 0, 0, 0);
        return [
            new vscode.CodeLens(range, {
                title: '$(server-process) Run on simulator',
                command: 'tejoone.runTestsOnSim',
            }),
            new vscode.CodeLens(range, {
                title: '$(circuit-board) Run on hardware',
                command: 'tejoone.runTestsOnHardware',
            }),
        ];
    }
}

export function activate(context: vscode.ExtensionContext): void {
    // ----- Status bar item ---------------------------------------------------
    const statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBar.command = 'tejoone.pickBench';
    statusBar.tooltip = 'TejoOne — click to switch bench (simulator / hardware)';

    const refreshStatusBar = () => {
        statusBar.text = benchDisplayLabel(currentBench());
    };
    refreshStatusBar();
    statusBar.show();
    context.subscriptions.push(statusBar);

    // ----- CodeLens provider for .robot files --------------------------------
    const codeLensProvider = new RobotCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            [
                { pattern: '**/*.robot' },
                { language: 'robotframework' },
            ],
            codeLensProvider
        )
    );

    // ----- React to setting changes ------------------------------------------
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(`${CONFIG_NAMESPACE}.${BENCH_SETTING}`)) {
                refreshStatusBar();
                codeLensProvider.refresh();
            }
        })
    );

    // ----- Commands ----------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('tejoone.pickBench', async () => {
            const picked = await vscode.window.showQuickPick(
                [
                    {
                        label: '$(server-process) Simulator',
                        description: 'MPLAB Simulator — no board required',
                        value: 'sim' as Bench,
                    },
                    {
                        label: '$(circuit-board) Hardware (PKoB4)',
                        description: 'On-board debugger — exclusive access',
                        value: 'pkob4' as Bench,
                    },
                ],
                {
                    placeHolder: 'Choose bench for TejoOne Robot tests',
                    title: 'TejoOne bench',
                }
            );
            if (picked) {
                await setBench(picked.value);
            }
        }),

        vscode.commands.registerCommand('tejoone.switchBenchToSim', async () => {
            await setBench('sim');
            vscode.window.showInformationMessage(
                'TejoOne bench → simulator'
            );
        }),

        vscode.commands.registerCommand('tejoone.switchBenchToHardware', async () => {
            await setBench('pkob4');
            vscode.window.showInformationMessage(
                'TejoOne bench → hardware (PKoB4)'
            );
        }),

        vscode.commands.registerCommand('tejoone.runTests', () => {
            runRobot(currentBench());
        }),

        vscode.commands.registerCommand('tejoone.runTestsOnSim', () => {
            runRobot('sim');
        }),

        vscode.commands.registerCommand('tejoone.runTestsOnHardware', () => {
            runRobot('pkob4');
        })
    );
}

export function deactivate(): void {
    // Nothing to clean up — all disposables are managed via context.subscriptions.
}
