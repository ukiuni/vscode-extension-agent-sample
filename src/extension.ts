import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const provider = new MagiViewProvider(context.extensionUri, context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"main.view",
			provider,
		),
	);
}
class MagiViewProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;
	private _context: vscode.ExtensionContext;

	constructor(private readonly extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
		this._context = context; 
	}
	public async resolveWebviewView(webviewView: vscode.WebviewView) {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
		};
		webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Agent</title>
</head>
<body>
	Hello World!

</body>
</html>`;
	}
}