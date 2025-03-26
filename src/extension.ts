import * as vscode from "vscode";
import { createServer, Server } from "http";

let panel: vscode.WebviewPanel | undefined;
let server: Server | undefined;

async function renderPanel(session: vscode.DebugSession) {
  // open WebView, if it's not opened yet
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      "imagePreview",
      "Preview",
      {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
      },
      {
        enableScripts: false,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );

    panel.onDidDispose(() => {
      panel = undefined;
    });
  }

  panel.webview.html = await getHtml(session);
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "virtual-dom-preview.render",
    async () => {
      const session = vscode.debug.activeDebugSession;
      if (!session) {
        vscode.window.showErrorMessage("Debug session not found!");
        return;
      }
      renderPanel(session);
      startWatchingBreakpoints(
        session,
        () => renderPanel(session),
        () => {
          panel?.dispose();
        }
      );
    }
  );

  context.subscriptions.push(disposable);

  // Register command to open browser
  const openBrowserCommand = vscode.commands.registerCommand(
    "virtual-dom-preview.openBrowser",
    async () => {
      const session = vscode.debug.activeDebugSession;
      if (!session) {
        vscode.window.showErrorMessage("Debug session not found!");
        return;
      }

      // Ask user for port
      const userInput = await vscode.window.showInputBox({
        placeHolder: "6060",
        prompt: "Enter port for preview server",
      });

      const port = (userInput && parseInt(userInput)) || 6060;

      if (server) {
        server.close();
        server = undefined;
      }
    
      let html: string = await getHtml(session);

      const htmlUpdateEventListeners = new Set<Function>();

      server = createServer((req, res) => {
        if (req.url === "/" || req.url === "/index.html") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html + `
            <script>
                const eventSource = new EventSource('/events');

                eventSource.onmessage = function(event) {
                    if (event.data === 'reload') {
                        window.location.reload();
                    }
                };
            </script>
          `);
        } else if (req.url === '/events') {
            // Отправляем события клиенту
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });

            const onUpdate = () => {
                res.write('data: reload\n\n');
            };
            htmlUpdateEventListeners.add(onUpdate);
    
            req.on('close', () => {
                htmlUpdateEventListeners.delete(onUpdate);
            });
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
        }
      });
      server.listen(port);

      startWatchingBreakpoints(
        session,
        async () => {
          const newHtml = await getHtml(session);
          if (newHtml !== html) {
            htmlUpdateEventListeners.forEach((listener) => listener());
            html = newHtml;
          }
        },
        () => {
          server?.close();
        }
      );

      const url = `http://localhost:${port}`;
      vscode.env.openExternal(vscode.Uri.parse(url));
    }
  );

  context.subscriptions.push(openBrowserCommand);
}

async function getHtml(session: vscode.DebugSession): Promise<string> {
  const stackTrace = await session.customRequest("stackTrace", { threadId: 1 });
  const frameId = stackTrace.stackFrames[0].id;

  const document = await session.customRequest("evaluate", {
    expression: `globalThis.document.documentElement.outerHTML;`,
    frameId,
  });

  return document.result.substr(1, document.result.length - 2);
}

function startWatchingBreakpoints(
  debugSession: vscode.DebugSession,
  onBreakpointChange: () => void,
  onTerminate: () => void
) {
  const disposable = vscode.debug.onDidChangeActiveStackItem((event) => {
    onBreakpointChange();
  });

  vscode.debug.onDidTerminateDebugSession((session) => {
    if (session.id === debugSession.id) {
      disposable.dispose(); // stop watching breakpoints
      onTerminate();
    }
  });
}

export function deactivate() {}
