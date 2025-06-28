import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const provider = new MagiViewProvider();
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"main.view",
			provider,
		),
	);
}
class MagiViewProvider implements vscode.WebviewViewProvider {

	public async resolveWebviewView(webviewView: vscode.WebviewView) {
		webviewView.webview.options = {
			enableScripts: true,
		};
		webviewView.webview.onDidReceiveMessage(async (data) => {
			if (data.type === 'promptEntered') {
				webviewView.webview.postMessage({
					type: 'addElement',
					text: data.text
				});

                const models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4.1' });
		        const model = models[0];
//この行を削除    const messages = [vscode.LanguageModelChatMessage.User(data.text)];

//ここから挿入
		        const prompt = `ユーザーの依頼：${data.text}

ユーザーの依頼を実現するために、適切なアクションを決定してJSONで回答してください。

回答は必ず以下のJSON形式で返してください：
{"tool":"利用するツール","args":["ツールに渡すパラメータ1","ツールに渡すパラメータ2"]}

使用可能なツール：
- "writefile": ファイルを作成・編集する場合。argsは["ファイルパス","ファイル内容"]
- "message": ユーザーにメッセージを返す場合。argsは["ユーザに見せたいメッセージ"]

ユーザーの依頼内容を分析し、ファイル操作が必要な場合は"writefile"、説明やメッセージが必要な場合は"message"を選択してください。
JSON以外の文字は一切含めず、純粋なJSONのみを返してください。`;

				const messages = [vscode.LanguageModelChatMessage.User(prompt)];
//ここまで挿入
				const response = await model.sendRequest(messages);

				let returnTextFromVscodeLm = '';
				for await (const fragment of response.text) {
					returnTextFromVscodeLm += fragment;
				}
/* ここから削除
				webviewView.webview.postMessage({
						type: 'addElement',
						text: returnTextFromVscodeLm
				});
ここまで削除 */
//ここから挿入				
				try {
					// 生成AIからの応答をJSONとしてパース
					const returnJSON = JSON.parse(returnTextFromVscodeLm);
					
					if (returnJSON.tool === 'message') {
						// メッセージツールの場合：Webviewにメッセージを表示
						webviewView.webview.postMessage({
							type: 'addElement',
							text: returnJSON.args[0]
						});
					} else if (returnJSON.tool === 'writefile') {
						// ファイル書き込みツールの場合：ファイルを作成
						const filePath = returnJSON.args[0];
						const fileContent = returnJSON.args[1];
						
						// 現在のワークスペースフォルダを取得
						const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
						if (workspaceFolder) {
							// ワークスペースフォルダ内のファイルパスを構築
							const fullPath = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
							
							// ファイルを作成
							await vscode.workspace.fs.writeFile(fullPath, Buffer.from(fileContent, 'utf8'));
							
							// 成功メッセージを表示
							webviewView.webview.postMessage({
								type: 'addElement',
								text: `ファイル "${filePath}" を作成しました。`
							});
						} else {
							webviewView.webview.postMessage({
								type: 'addElement',
								text: 'ワークスペースが開かれていません。'
							});
						}
					} else {
						// 未知のツールの場合
						webviewView.webview.postMessage({
							type: 'addElement',
							text: `未知のツール: ${returnJSON.tool}`
						});
					}
				} catch (error) {
					// JSONパースエラーの場合は元のテキストをそのまま表示
					webviewView.webview.postMessage({
						type: 'addElement',
						text: `JSONパースエラー: ${returnTextFromVscodeLm}`
					});
				}
//ここまで挿入
			}
		});
		webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Agent</title>
</head>
<body>
	Hello World!
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
</body>
</html>`;
	}
}
