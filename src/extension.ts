import { log } from 'console';
import * as vscode from 'vscode';

let panel: vscode.WebviewPanel | undefined;

async function render(session: vscode.DebugSession) {
    const stackTrace = await session.customRequest('stackTrace', { threadId: 1 });
    const frameId = stackTrace.stackFrames[0].id;


    const document = await session.customRequest('evaluate', {
         expression: `globalThis.document.documentElement.outerHTML;`,
         frameId 
        }
    );
 
    // Открываем Webview, если его нет
    if (!panel) {
        panel = vscode.window.createWebviewPanel(
            'imagePreview',
            'Результат выполнения',
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );

        panel.onDidDispose(() => {
            panel = undefined;
        });
    }

    panel.webview.html = document.result.substr(1, document.result.length - 2);
}

// export function activate(context: vscode.ExtensionContext) {
//     const disposable = vscode.commands.registerCommand('react-testing-library-preview-renderer.render', async () => {
//         render(vscode.debug.activeDebugSession);
//         vscode.debug.onDidChangeActiveDebugSession((session) => {
//             render(session);
//         });
//     });

//     context.subscriptions.push(disposable);
// }

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('react-testing-library-preview-renderer.render', async () => {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            vscode.window.showErrorMessage('Нет активного дебаг сеанса!');
            return;
        }
        render(session);
        startWatchingBreakpoints(session);
        
    });
        
    context.subscriptions.push(disposable);
}

function startWatchingBreakpoints(debugSession: vscode.DebugSession) {
    const disposable = vscode.debug.onDidChangeActiveStackItem(async event => {
        await render(debugSession);
    });

    vscode.debug.onDidTerminateDebugSession(session => {
        if (session.id === debugSession.id) {
            disposable.dispose(); // Отписываемся, когда отладка завершена
        }
        panel?.dispose();
    });
}


export function deactivate() {}
