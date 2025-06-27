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
//ここから挿入
		webviewView.webview.onDidReceiveMessage(async (data) => {
			if (data.type === 'promptEntered') {
				webviewView.webview.postMessage({
					type: 'addElement',
					text: data.text
				});
				
				const models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4.1' });
				const model = models[0];
				const messages = [vscode.LanguageModelChatMessage.User(data.text)];
				const response = await model.sendRequest(messages);

				let returnTextFromVscodeLm = '';
				for await (const fragment of response.text) {
					returnTextFromVscodeLm += fragment;
				}
				webviewView.webview.postMessage({
					type: 'addElement',
					text: returnTextFromVscodeLm
				});
			}
		});
//ここまで挿入
		webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Agent</title>
</head>
<body>
	Hello World!
<!-- ここから挿入 -->
	<textarea id="input-textarea" data-testid="input-textarea" rows="4" style="width:100%" placeholder="Enter text and press Enter..."></textarea>
	<div id="output" data-testid="output"></div>

	<script>
		const vscode = acquireVsCodeApi();
		const textarea = document.getElementById('input-textarea');
		const output = document.getElementById('output');
		
		textarea.addEventListener('keydown', function(event) {
			// Enterキーが押された時
			if (event.key === 'Enter') {
				// IMEの変換中（composing状態）でない場合のみ処理
				if (!event.isComposing) {
					event.preventDefault(); // デフォルトの改行を防ぐ
					
					const text = textarea.value.trim();
					if (text) {
						// VS Codeにメッセージを送信
						vscode.postMessage({
							type: 'promptEntered',
							text: text
						});
						textarea.value = '';
					}
				}
			}
		});
		
		// VS Codeからのメッセージを受け取る
		window.addEventListener('message', event => {
			const message = event.data;
			if (message.type === 'addElement') {
				const newDiv = document.createElement('div');
				newDiv.textContent = message.text;
				output.appendChild(newDiv);
			}
		});
		
		// composition系のイベントも念のため処理
		let isComposing = false;
		textarea.addEventListener('compositionstart', function() {
			isComposing = true;
		});
		textarea.addEventListener('compositionend', function() {
			isComposing = false;
		});
	</script>
<!-- ここまで挿入 -->
</body>
</html>`;
	}
}
