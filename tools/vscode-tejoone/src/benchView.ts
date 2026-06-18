import * as vscode from 'vscode';
import { Bench } from './state';

/**
 * Tree view shown in the TejoOne activity-bar tab.
 *
 * Intentionally minimal for v1 — it shows the current bench and the
 * configured Robot command. Run/switch actions live in the view title
 * (the icon row at the top of the view).
 *
 * Designed so that future views (board reservation status, recent runs,
 * MDB log tail, etc.) can be added as siblings without re-architecting.
 */

class BenchInfoItem extends vscode.TreeItem {
    constructor(label: string, description: string, iconId: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.iconPath = new vscode.ThemeIcon(iconId);
    }
}

export class BenchTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    constructor(
        private readonly getCurrentBench: () => Bench,
        private readonly getRobotCommand: () => string,
    ) {}

    refresh(): void {
        this._onDidChange.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        if (element) {
            return [];
        }
        const bench = this.getCurrentBench();
        const benchLabel = bench === 'sim' ? 'Simulator' : 'Hardware (PKoB4)';
        const benchIcon = bench === 'sim' ? 'server-process' : 'circuit-board';

        const benchItem = new BenchInfoItem('Current bench', benchLabel, benchIcon);
        benchItem.command = {
            command: 'tejoone.pickBench',
            title: 'Switch bench',
        };
        benchItem.tooltip = 'Click to switch bench';

        const cmdItem = new BenchInfoItem(
            'Robot command',
            this.getRobotCommand(),
            'terminal',
        );
        cmdItem.tooltip = this.getRobotCommand();

        return [benchItem, cmdItem];
    }
}
