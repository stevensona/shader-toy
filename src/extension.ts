'use strict';

import * as vscode from 'vscode';
import { Context } from './context';
import { ShaderToyManager } from './shadertoymanager';

export function activate(extensionContext: vscode.ExtensionContext) {

    let mainShadertoyExtension = vscode.extensions.getExtension('stevensona.shader-toy');
    if (mainShadertoyExtension) {
        console.log('Web version of Shader toy (jakearl.shader-toy) disabled due to `stevensona.shader-toy` being installed.');
        return;
    }

    let context = new Context(extensionContext, vscode.workspace.getConfiguration('shader-toy-web'));
    if (context.getConfig<boolean>('omitDeprecationWarnings') === true) {
        vscode.window.showWarningMessage('Deprecation warnings are omitted, stay safe otherwise!');
    }

    let shadertoyManager = new ShaderToyManager(context);

    let timeout: ReturnType<typeof setTimeout>;
    let changeTextEvent: vscode.Disposable | undefined;
    let changeEditorEvent: vscode.Disposable | undefined;
    let registerCallbacks = () => {
        clearTimeout(timeout);
        if (changeTextEvent !== undefined) {
            changeTextEvent.dispose();
        }
        if (changeEditorEvent !== undefined) {
            changeEditorEvent.dispose();
        }

        if (context.getConfig<boolean>('reloadOnEditText')) {
            let reloadDelay: number = context.getConfig<number>('reloadOnEditTextDelay') || 1.0;
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
        if (e.affectsConfiguration('shader-toy-web')) {
            let lastActiveEditor = context.activeEditor;
            context = new Context(extensionContext, vscode.workspace.getConfiguration('shader-toy-web'));
            if (context.activeEditor === undefined) {
                context.activeEditor = lastActiveEditor;
            }
            shadertoyManager.migrateToNewContext(context);
        }
    });

    let previewCommand = vscode.commands.registerCommand('shader-toy-web.showGlslPreview', () => {
        shadertoyManager.showDynamicPreview();
    });
    let staticPreviewCommand = vscode.commands.registerCommand('shader-toy-web.showStaticGlslPreview', () => {
        shadertoyManager.showStaticPreview();
    });
    let standaloneCompileCommand = vscode.commands.registerCommand('shader-toy-web.createPortableGlslPreview', () => {
        shadertoyManager.createPortablePreview();
    });
    let pausePreviewsCommand = vscode.commands.registerCommand('shader-toy-web.pauseGlslPreviews', () => {
        shadertoyManager.postCommand('pause');
    });
    let saveScreenshotsCommand = vscode.commands.registerCommand('shader-toy-web.saveGlslPreviewScreenShots', () => {
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
