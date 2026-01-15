'use strict';

import * as vscode from 'vscode';

const runBestEffortEditorCommand = async (command: string, args?: unknown): Promise<boolean> => {
    try {
        await vscode.commands.executeCommand(command, args);
        return true;
    }
    catch {
        return false;
    }
};

export const tryFocusOrCreateBelowGroup = async (): Promise<void> => {
    await runBestEffortEditorCommand('workbench.action.newGroupBelow');
    await runBestEffortEditorCommand('workbench.action.focusBelowGroup');
    await runBestEffortEditorCommand('workbench.action.focusDownGroup');
};

export const tryMovePanelBelowGroup = (panelToMove: vscode.WebviewPanel): void => {
    setTimeout(() => {
        const run = async () => {
            try {
                panelToMove.reveal(panelToMove.viewColumn, false);
            }
            catch {
                // ignore
            }

            if (
                (await runBestEffortEditorCommand('workbench.action.moveEditorToBelowGroup')) ||
                (await runBestEffortEditorCommand('moveActiveEditor', { to: 'down', by: 'group' })) ||
                (await runBestEffortEditorCommand('workbench.action.moveActiveEditor', { to: 'down', by: 'group' }))
            ) {
                return;
            }

            await runBestEffortEditorCommand('workbench.action.newGroupBelow');
            await runBestEffortEditorCommand('workbench.action.focusBelowGroup');
            await runBestEffortEditorCommand('workbench.action.focusDownGroup');
            await runBestEffortEditorCommand('workbench.action.moveEditorToBelowGroup');
        };

        void run();
    }, 150);
};
