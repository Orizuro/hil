import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Bench state persistence.
 *
 * The TejoOne VS Code extension writes the user's bench selection to a
 * project-local file (`<workspace>/.tejoone/state.json`). The Robot
 * Framework library (`MdbLibrary.py`) reads that file when the
 * `TEJOONE_BENCH` env var is not set — which is exactly the case when
 * Robot is invoked by the Robot Framework Test Explorer (or any other
 * runner that doesn't go through our terminal commands).
 *
 * This is how the IDE's bench selection stays consistent across:
 *   - our own "Run on simulator/hardware" commands (set env directly)
 *   - the Robot Framework Test Explorer (reads the state file)
 *   - a plain terminal `.venv/bin/robot tests/` (reads the state file)
 *   - CI invocations that explicitly set TEJOONE_BENCH (env wins)
 */

export type Bench = 'sim' | 'pkob4';

export const STATE_DIR_NAME = '.tejoone';
export const STATE_FILE_NAME = 'state.json';

interface StateJson {
    bench: Bench;
    /** ISO timestamp of the last write — purely informational. */
    updatedAt: string;
}

function stateDir(folder: vscode.WorkspaceFolder): string {
    return path.join(folder.uri.fsPath, STATE_DIR_NAME);
}

function statePath(folder: vscode.WorkspaceFolder): string {
    return path.join(stateDir(folder), STATE_FILE_NAME);
}

/**
 * Write the bench to <workspace>/.tejoone/state.json, creating the
 * directory and a defensive `.gitignore` inside it on first write.
 */
export async function writeBenchState(
    folder: vscode.WorkspaceFolder,
    bench: Bench,
): Promise<void> {
    const dir = stateDir(folder);
    await fs.promises.mkdir(dir, { recursive: true });

    // Drop a .gitignore inside .tejoone/ as a safety net in case the
    // root .gitignore is missing the entry. Idempotent.
    const innerGitignore = path.join(dir, '.gitignore');
    if (!fs.existsSync(innerGitignore)) {
        await fs.promises.writeFile(
            innerGitignore,
            '# Written by the TejoOne VS Code extension.\n' +
            '# Local IDE state — never commit.\n' +
            '*\n',
            'utf8',
        );
    }

    const payload: StateJson = {
        bench,
        updatedAt: new Date().toISOString(),
    };
    await fs.promises.writeFile(
        statePath(folder),
        JSON.stringify(payload, null, 2) + '\n',
        'utf8',
    );
}

/**
 * Read the bench from <workspace>/.tejoone/state.json. Returns undefined
 * if the file is missing, malformed, or contains an unknown bench value.
 */
export function readBenchState(folder: vscode.WorkspaceFolder): Bench | undefined {
    try {
        const raw = fs.readFileSync(statePath(folder), 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.bench === 'sim' || parsed.bench === 'pkob4')) {
            return parsed.bench;
        }
    } catch {
        // File missing or malformed — fall through.
    }
    return undefined;
}
