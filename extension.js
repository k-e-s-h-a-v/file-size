// The module 'vscode' contains the VS Code extensibility API
const vscode = require('vscode');

// Top-level log to confirm the extension file is loaded by VS Code.
// This should be one of the very first things you see.
console.log('[FileCount] Extension file (extension.js) is being loaded.');

/**
 * This method is called when your extension is activated.
 * Your extension is activated the very first time the command is executed.
 * @param {vscode.ExtensionContext} context The extension context provided by VS Code.
 */
function activate(context) {
    console.log('[FileCount] Extension is now active!');

    // Create a new instance of our decoration provider
    const decorationProvider = new FolderCountDecorationProvider();
    console.log('[FileCount] Decoration provider created.');

    // Register the provider with VS Code.
    // This tells VS Code to use our provider for explorer decorations.
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(decorationProvider)
    );
    console.log('[FileCount] Decoration provider registered.');


    // The provider itself needs to be disposed of when the extension is deactivated.
    // Pushing it to subscriptions ensures its `dispose` method is called.
    context.subscriptions.push(decorationProvider);

    // You can keep this command for testing or other purposes.
    const helloWorldCommand = vscode.commands.registerCommand('file-size.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from FileCount!');
    });
    context.subscriptions.push(helloWorldCommand);
}

/**
 * This method is called when your extension is deactivated.
 */
function deactivate() {
    console.log('[FileCount] Extension is now deactivated.');
}

/**
 * Implements the FileDecorationProvider interface to show the number of
 * files and folders within a directory as a badge in the file explorer.
 */
class FolderCountDecorationProvider {
    // A private event emitter that we will use to signal to VS Code that a decoration has changed.
    _onDidChangeFileDecorations = new vscode.EventEmitter();
    // The public event that VS Code subscribes to.
    onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    // A file system watcher to detect when files or folders are created, changed, or deleted.
    watcher;

    constructor() {
        // Create a watcher that listens for changes to any file in the workspace.
        this.watcher = vscode.workspace.createFileSystemWatcher('**/*');
        console.log('[FileCount] File system watcher created.');

        // When a file/folder changes, we need to update the decoration of its parent directory.
        this.watcher.onDidChange(uri => {
            console.log(`[FileCount] onDidChange triggered for: ${uri.fsPath}`);
            this.refreshDecorations(uri);
        });
        this.watcher.onDidCreate(uri => {
            console.log(`[FileCount] onDidCreate triggered for: ${uri.fsPath}`);
            this.refreshDecorations(uri);
        });
        this.watcher.onDidDelete(uri => {
            console.log(`[FileCount] onDidDelete triggered for: ${uri.fsPath}`);
            this.refreshDecorations(uri);
        });
    }

    /**
     * Cleans up the resources (the watcher and the event emitter) when the extension is deactivated.
     */
    dispose() {
        console.log('[FileCount] Disposing provider resources.');
        this.watcher.dispose();
        this._onDidChangeFileDecorations.dispose();
    }

    /**
     * Fires the onDidChangeFileDecorations event for the parent of the changed URI.
     * This tells VS Code to re-run `provideFileDecoration` for that directory.
     * @param {vscode.Uri} uri The URI of the file or folder that changed.
     */
    refreshDecorations(uri) {
        if (uri) {
            const parentUri = vscode.Uri.joinPath(uri, '..');
            console.log(`[FileCount] Refreshing decorations for parent: ${parentUri.fsPath}`);
            // Fire the event to update the parent directory's decoration
            this._onDidChangeFileDecorations.fire(parentUri);
            // We also need to fire an event for the root to handle top-level changes
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                this._onDidChangeFileDecorations.fire(vscode.workspace.workspaceFolders[0].uri);
            }
        }
    }

    /**
     * Provides the decoration for a given file or folder URI.
     * VS Code calls this method for each visible item in the file explorer.
     * @param {vscode.Uri} uri The URI of the item to decorate.
     * @param {vscode.CancellationToken} token A token to signal if the operation should be cancelled.
     * @returns {Promise<vscode.FileDecoration | undefined>} The decoration object or undefined if no decoration should be shown.
     */
    async provideFileDecoration(uri, token) {
        // **FIX:** Only process URIs that are part of the file system.
        // This prevents errors with special URIs like 'walkThrough' or 'untitled'.
        // 'vscode-remote' is the scheme for WSL.
        if (uri.scheme !== 'file' && uri.scheme !== 'vscode-remote') {
            return undefined;
        }

        console.log(`[FileCount] provideFileDecoration called for: ${uri.fsPath}`);
        try {
            // Check if the operation has been cancelled.
            if (token.isCancellationRequested) {
                console.log(`[FileCount] Cancellation requested for ${uri.fsPath}`);
                return undefined;
            }

            // Get file information. We only want to decorate directories.
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.type !== vscode.FileType.Directory) {
                // This is expected for files, so no log is needed unless debugging.
                return undefined; // Not a directory, so no decoration.
            }
            console.log(`[FileCount] ${uri.fsPath} is a directory.`);

            // It's a directory, so let's count its contents.
            const { files, folders } = await this.getDirectoryCounts(uri, token);

            // Check for cancellation again after the async counting operation.
            if (token.isCancellationRequested) {
                console.log(`[FileCount] Cancellation requested for ${uri.fsPath} after counting.`);
                return undefined;
            }

            // Don't show a badge for empty folders to keep the UI clean.
            if (files === 0 && folders === 0) {
                console.log(`[FileCount] ${uri.fsPath} is empty, no decoration needed.`);
                return undefined;
            }

            const total = files + folders;
            const decoration = {
                badge: `${total}`,
                tooltip: `${files} file(s), ${folders} folder(s)`,
                color: new vscode.ThemeColor('descriptionForeground')
            };
            console.log(`[FileCount] Providing decoration for ${uri.fsPath}:`, decoration);
            return decoration;

        } catch (e) {
            // Errors are common here (e.g., a file is deleted while being processed).
            // We'll log them for debugging but won't show an error to the user.
            console.error(`[FileCount] Error providing decoration for ${uri.fsPath}:`, e);
            return undefined;
        }
    }

    /**
     * Counts the number of files and sub-folders directly inside a given directory.
     * @param {vscode.Uri} dirUri The URI of the directory.
     * @param {vscode.CancellationToken} token A token to signal cancellation.
     * @returns {Promise<{files: number, folders: number}>} An object with the counts.
     */
    async getDirectoryCounts(dirUri, token) {
        let files = 0;
        let folders = 0;

        const entries = await vscode.workspace.fs.readDirectory(dirUri);
        console.log(`[FileCount] Reading directory ${dirUri.fsPath}, found ${entries.length} entries.`);

        for (const [name, type] of entries) {
            if (token.isCancellationRequested) {
                break;
            }
            if (type === vscode.FileType.File) {
                files++;
            } else if (type === vscode.FileType.Directory) {
                folders++;
            }
        }
        console.log(`[FileCount] Counts for ${dirUri.fsPath}: ${files} files, ${folders} folders.`);
        return { files, folders };
    }
}

module.exports = {
    activate,
    deactivate
};
