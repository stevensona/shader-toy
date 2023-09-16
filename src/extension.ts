'use strict';

import * as vscode from 'vscode';
import { compareVersions } from 'compare-versions';
import { Context } from './context';
import { ShaderToyManager } from './shadertoymanager';

export function activate(extensionContext: vscode.ExtensionContext) {
    const shadertoyExtension = vscode.extensions.getExtension('stevensona.shader-toy');

    if (shadertoyExtension) {
        const lastVersion = extensionContext.globalState.get<string>('version') || '0.0.0';
        const currentVersion = <string | undefined>shadertoyExtension.packageJSON.version || '9.9.9';
        if (compareVersions(currentVersion, lastVersion) > 0) {
            vscode.window.showInformationMessage('Your ShaderToy version just got updated, check out the readme to see what\'s new.');
            extensionContext.globalState.update('version', currentVersion);
        }
    }

    let context = new Context(extensionContext, vscode.workspace.getConfiguration('shader-toy'));
    if (context.getConfig<boolean>('omitDeprecationWarnings') === true) {
        vscode.window.showWarningMessage('Deprecation warnings are omitted, stay safe otherwise!');
    }

    const shadertoyManager = new ShaderToyManager(context);

    let timeout: ReturnType<typeof setTimeout>;
    let changeTextEvent: vscode.Disposable | undefined;
    let changeEditorEvent: vscode.Disposable | undefined;
    const registerCallbacks = () => {
        clearTimeout(timeout);
        if (changeTextEvent !== undefined) {
            changeTextEvent.dispose();
        }
        if (changeEditorEvent !== undefined) {
            changeEditorEvent.dispose();
        }

        if (context.getConfig<boolean>('reloadOnEditText')) {
            const reloadDelay: number = context.getConfig<number>('reloadOnEditTextDelay') || 1.0;
            changeTextEvent = vscode.workspace.onDidChangeTextDocument((documentChange: vscode.TextDocumentChangeEvent) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    shadertoyManager.onDocumentChanged(documentChange);
                }, reloadDelay * 1000);
            });
        }

        changeEditorEvent = vscode.window.onDidChangeActiveTextEditor((newEditor: vscode.TextEditor | undefined) => {
            shadertoyManager.onEditorChanged(newEditor);
        });
    };

    registerCallbacks();

    vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
        if (e.affectsConfiguration('shader-toy')) {
            const lastActiveEditor = context.activeEditor;
            context = new Context(extensionContext, vscode.workspace.getConfiguration('shader-toy'));
            if (context.activeEditor === undefined) {
                context.activeEditor = lastActiveEditor;
            }
            shadertoyManager.migrateToNewContext(context);
        }
    });

    const previewCommand = vscode.commands.registerCommand('shader-toy.showGlslPreview', () => {
        shadertoyManager.showDynamicPreview();
    });
    const staticPreviewCommand = vscode.commands.registerCommand('shader-toy.showStaticGlslPreview', () => {
        shadertoyManager.showStaticPreview();
    });
    const standaloneCompileCommand = vscode.commands.registerCommand('shader-toy.createPortableGlslPreview', () => {
        shadertoyManager.createPortablePreview();
    });
    const pausePreviewsCommand = vscode.commands.registerCommand('shader-toy.pauseGlslPreviews', () => {
        shadertoyManager.postCommand('pause');
    });
    const saveScreenshotsCommand = vscode.commands.registerCommand('shader-toy.saveGlslPreviewScreenShots', () => {
        shadertoyManager.postCommand('screenshot');
    });
    extensionContext.subscriptions.push(previewCommand);
    extensionContext.subscriptions.push(staticPreviewCommand);
    extensionContext.subscriptions.push(standaloneCompileCommand);
    extensionContext.subscriptions.push(pausePreviewsCommand);
    extensionContext.subscriptions.push(saveScreenshotsCommand);
}

export function deactivate() {
}
