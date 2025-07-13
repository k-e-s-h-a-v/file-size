const vscode = require('vscode');
const { FileExplorerViewProvider } = require('./src/providers/fileExplorerViewProvider');

function activate(context) {
    console.info('[FileCount] Extension activated.');

    // const decorationProvider = new FolderCountDecorationProvider();
    // context.subscriptions.push(
    //     vscode.window.registerFileDecorationProvider(decorationProvider)
    // );
    // context.subscriptions.push(decorationProvider);

    // const helloWorldCommand = vscode.commands.registerCommand('file-size.helloWorld', () => {
    //     vscode.window.showInformationMessage('Hello World from FileCount!');
    // });
    // context.subscriptions.push(helloWorldCommand);

    // Register the custom file explorer sidebar view
    const explorerProvider = new FileExplorerViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('fileExplorerView', explorerProvider)
    );
}

function deactivate() {
    console.info('[FileCount] Extension deactivated.');
}

module.exports = {
    activate,
    deactivate
};