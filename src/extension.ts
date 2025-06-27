import * as vscode from 'vscode';

// ここから追加
interface FileInfo {
	path: string;
	content: string;
}
//ここまで追加
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
	private _readFiles: FileInfo[] = [];
	private _executedTools: string[] = []; //この行を追加

	constructor(private readonly extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
		this._context = context;
	}
	public async resolveWebviewView(webviewView: vscode.WebviewView) {
		this._view = webviewView;
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

				this._readFiles = []; //この行を追加
				this._executedTools = []; //この行を追加

				let filesContext = '';
				if (this._readFiles.length > 0) {
					filesContext = '\n\nこれまでに読み込んだファイル:\n';
					this._readFiles.forEach((fileInfo, index) => {
						filesContext += `【ファイル${index + 1}】パス: ${fileInfo.path}\n内容:\n${fileInfo.content}\n\n`;
					});
				}
//ここから追加
				let isFinished = false;
				let iterationCount = 0;
				const maxIterations = 10;

				while (!isFinished && iterationCount < maxIterations) {
					iterationCount++;

					let toolHistoryContext = '';
					if (this._executedTools.length > 0) {
						toolHistoryContext = '\n\nこれまでに実行したツール:\n';
						this._executedTools.forEach((tool, index) => {
							toolHistoryContext += `${index + 1}. ${tool}\n`;
						});
					}
//ここまで追加					
					const prompt = `ユーザーの依頼：${data.text}${filesContext}${toolHistoryContext}

ユーザーの依頼を実現するために、適切なアクションを決定してJSONで回答してください。

回答は必ず以下のJSON形式で返してください：
{"tool":"利用するツール","args":["ツールに渡すパラメータ1","ツールに渡すパラメータ2"]}

使用可能なツール：
- "readfile": ファイルを読み込む場合。argsは["ファイルパス"]
- "writefile": ファイルを作成・編集する場合。argsは["ファイルパス","ファイル内容"]
- "message": ユーザーにメッセージを返す場合。argsは["ユーザに見せたいメッセージ"]
- "finish": 依頼が完了した場合。argsは["完了メッセージ"]

ユーザーの依頼内容を分析し、ファイル操作が必要な場合は"writefile"または"readfile"、説明やメッセージが必要な場合は"message"、すべてが完了した場合は"finish"を選択してください。
JSON以外の文字は一切含めず、純粋なJSONのみを返してください。`;
					// ↑の最初に${toolHistoryContext}を追加。また、使用可能なツール：にfinishの行を追加。
					const messages = [vscode.LanguageModelChatMessage.User(prompt)];
					const response = await model.sendRequest(messages);

					let returnTextFromVscodeLm = '';
					for await (const fragment of response.text) {
						returnTextFromVscodeLm += fragment;
					}

					try {
						// LLMからの応答をJSONとしてパース
						const returnJSON = JSON.parse(returnTextFromVscodeLm);

						// 実行したツールを履歴に追加
						this._executedTools.push(`${returnJSON.tool}(${returnJSON.args.join(', ')})`);

						if (returnJSON.tool === 'message') {
							// メッセージツールの場合：Webviewにメッセージを表示
							webviewView.webview.postMessage({
								type: 'addElement',
								text: returnJSON.args[0]
							});
						} else if (returnJSON.tool === 'readfile') {
							// ファイル読み込みツールの場合：ファイルを読み込んでフィールドに保存
							const filePath = returnJSON.args[0];

							// 現在のワークスペースフォルダを取得
							const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
							if (workspaceFolder) {
								try {
									// ワークスペースフォルダ内のファイルパスを構築
									const fullPath = vscode.Uri.joinPath(workspaceFolder.uri, filePath);

									// ファイルを読み込み
									const fileData = await vscode.workspace.fs.readFile(fullPath);
									const fileContent = new TextDecoder().decode(fileData);

									// すでに読み込み済みかチェック
									const existingIndex = this._readFiles.findIndex(f => f.path === filePath);
									if (existingIndex >= 0) {
										// 既存のエントリを更新
										this._readFiles[existingIndex].content = fileContent;
									} else {
										// 新しいエントリを追加
										this._readFiles.push({ path: filePath, content: fileContent });
									}

									// 成功メッセージを表示
									webviewView.webview.postMessage({
										type: 'addElement',
										text: `ファイル "${filePath}" を読み込みました！（現在${this._readFiles.length}個のファイルを保持中）`
									});
								} catch (error) {
									webviewView.webview.postMessage({
										type: 'addElement',
										text: `ファイル "${filePath}" の読み込みに失敗しました: ${error}`
									});
								}
							} else {
								webviewView.webview.postMessage({
									type: 'addElement',
									text: 'ワークスペースが開かれていません。'
								});
							}
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
									text: `ファイル "${filePath}" を作成しました！`
								});
							} else {
								webviewView.webview.postMessage({
									type: 'addElement',
									text: 'ワークスペースが開かれていません。'
								});
							}
//ここから追加
						} else if (returnJSON.tool === 'finish') {
							// finishツールの場合：完了メッセージを表示してループを終了
							webviewView.webview.postMessage({
								type: 'addElement',
								text: returnJSON.args[0]
							});
							isFinished = true; // ループを終了
//ここまで追加
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
						isFinished = true; // エラーの場合もループを終了 //この行を追加
					}
//ここから追加
				} // whileループの終了
				// 最大反復回数に達した場合の警告メッセージ
				if (iterationCount >= maxIterations) {
					webviewView.webview.postMessage({
						type: 'addElement',
						text: '⚠️ 最大反復回数に達しました。処理を終了します。'
					});
				}
//ここまで追加
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