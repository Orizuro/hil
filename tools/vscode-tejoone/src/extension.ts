import * as vscode from 'vscode';
import { Bench, readBenchState, writeBenchState } from './state';
import { BenchTreeProvider } from './benchView';

/**
 * TejoOne Bench extension.
 *
 * Owns the "which bench am I running tests on" state for the workspace.
 * That state is exposed in three places so every Robot runner sees it:
 *
 *   1. TEJOONE_BENCH env var, set by our own "Run Robot Tests" commands.
 *   2. <workspace>/.tejoone/state.json, written on every bench change.
 *      Read by MdbLibrary.py when the env var isn't set — this is what
 *      lets the Robot Framework Test Explorer (which spawns `robot`
 *      directly) honour the IDE's bench choice.
 *   3. The "tejoone.bench" workspace setting (so the user can also
 *      change it through Settings UI).
 *
 * UI surfaces:
 *   - Status bar item, right side: "Bench: hardware" or "Bench: simulator".
 *   - Activity-bar tab ("TejoOne") with a Bench tree view + title actions.
 *   - CodeLens at the top of .robot files: Run on sim / Run on hardware.
 */

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
    const target = vscode.workspace.workspaceFolders
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    await cfg.update(BENCH_SETTING, bench, target);
    // The configuration listener in activate() handles status-bar refresh,
    // tree refresh, and the state-file write — keeping all reactions in
    // one place avoids races between this update and the listener.
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
    const cleaned = last.replace(/[/\\]+$/, '');
    const base = cleaned.split(/[/\\]/).pop() ?? cleaned;
    const slug = base.replace(/\.robot$/, '').trim();
    return slug || 'default';
}

function userSpecifiesOutputDir(robotCmd: string): boolean {
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
 * set to the requested bench. ROBOT_OPTIONS is also injected to route
 * output to results/<slug>/<bench>/ unless the user has already
 * specified an output directory in their command.
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

    const env: { [key: string]: string } = { TEJOONE_BENCH: bench };
    if (!userSpecifiesOutputDir(rawCmd)) {
        const slug = deriveSuiteSlug(rawCmd);
        const outputDir = `${folder.uri.fsPath}/results/${slug}/${bench}`;
        env.ROBOT_OPTIONS = `--outputdir "${outputDir}"`;
    }

    const terminal = vscode.window.createTerminal({
        name: `Robot (${benchHumanName(bench)})`,
        cwd: folder.uri.fsPath,
        env,
    });
    terminal.show();
    terminal.sendText(cmd);
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

/**
 * Persist the current bench to <workspace>/.tejoone/state.json so that
 * Robot runners outside this extension (Robot Framework Test Explorer,
 * plain terminal, etc.) honour the same selection via MdbLibrary's
 * file-fallback path.
 */
async function persistBenchToStateFile(bench: Bench): Promise<void> {
    const folder = activeWorkspaceFolder();
    if (!folder) {
        return; // No workspace; nothing to persist.
    }
    try {
        await writeBenchState(folder, bench);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showWarningMessage(
            `TejoOne: failed to write .tejoone/state.json — ${msg}`
        );
    }
}

/**
 * On activation, reconcile the workspace setting with whatever is on disk.
 * If the state file exists and differs from the setting, the setting wins
 * (it's user-facing, lives in settings.json, and is the source of truth);
 * we rewrite the state file to match.
 */
async function reconcileStateOnActivation(): Promise<void> {
    const folder = activeWorkspaceFolder();
    if (!folder) {
        return;
    }
    const settingBench = currentBench();
    const fileBench = readBenchState(folder);
    if (fileBench !== settingBench) {
        await persistBenchToStateFile(settingBench);
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

    // ----- Activity-bar tree view -------------------------------------------
    const benchTree = new BenchTreeProvider(currentBench, robotCommand);
    const treeView = vscode.window.createTreeView('tejoone.bench', {
        treeDataProvider: benchTree,
        showCollapseAll: false,
    });
    context.subscriptions.push(treeView);

    // ----- CodeLens provider for .robot files --------------------------------
    const codeLensProvider = new RobotCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            [{ pattern: '**/*.robot' }, { language: 'robotframework' }],
            codeLensProvider,
        )
    );

    // ----- React to setting changes -----------------------------------------
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration(`${CONFIG_NAMESPACE}.${BENCH_SETTING}`)) {
                refreshStatusBar();
                benchTree.refresh();
                codeLensProvider.refresh();
                await persistBenchToStateFile(currentBench());
            }
            if (e.affectsConfiguration(`${CONFIG_NAMESPACE}.${ROBOT_COMMAND_SETTING}`)) {
                benchTree.refresh();
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
            vscode.window.showInformationMessage('TejoOne bench → simulator');
        }),

        vscode.commands.registerCommand('tejoone.switchBenchToHardware', async () => {
            await setBench('pkob4');
            vscode.window.showInformationMessage('TejoOne bench → hardware (PKoB4)');
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

    // ----- Initial reconcile -------------------------------------------------
    void reconcileStateOnActivation();
}

export function deactivate(): void {
    // All disposables are managed via context.subscriptions.
}
