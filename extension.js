const vscode = require('vscode');
const { FolderCountDecorationProvider } = require('./src/folderCountDecorationProvider');

function activate(context) {
    console.info('[FileCount] Extension activated.');

    const decorationProvider = new FolderCountDecorationProvider();

    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(decorationProvider)
    );
    context.subscriptions.push(decorationProvider);

    const helloWorldCommand = vscode.commands.registerCommand('file-size.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from FileCount!');
    });
    context.subscriptions.push(helloWorldCommand);
}

function deactivate() {
    console.info('[FileCount] Extension deactivated.');
}

module.exports = {
    activate,
    deactivate
};