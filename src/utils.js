const vscode = require('vscode');
const { FolderCountDecorationProvider } = require('./folderCountDecorationProvider');

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

// utils.js content
function shouldIgnoreEntryForTraversal(name, type) {
    if (type === 2) { // vscode.FileType.Directory === 2
        if (name.startsWith('.')) return true;
        if (name === 'node_modules') return true;
    }
    return false;
}

function isGloballyIgnoredFolder(folderName) {
    return folderName.startsWith('.') || folderName === 'node_modules';
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = 1;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    let formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
    if (formatted % 1 === 0) {
        formatted = parseInt(formatted);
    }
    return `${formatted} ${sizes[i]}`;
}

module.exports = {
    shouldIgnoreEntryForTraversal,
    isGloballyIgnoredFolder,
    formatBytes
};