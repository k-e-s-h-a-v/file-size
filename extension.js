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
 * files and folders within a directory as a badge in the file explorer,
 * and file size for individual files.
 */
class FolderCountDecorationProvider {
    // A private event emitter that we will use to signal to VS Code that a decoration has changed.
    _onDidChangeFileDecorations = new vscode.EventEmitter();
    // The public event that VS Code subscribes to.
    onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    // A file system watcher to detect when files or folders are created, changed, or deleted.
    watcher;

    constructor() {
        console.log('[FileCount] FolderCountDecorationProvider constructor called.');
        // Create a watcher that listens for changes to any file in the workspace.
        // The '**/*' pattern watches all files and folders recursively.
        this.watcher = vscode.workspace.createFileSystemWatcher('**/*');
        console.log('[FileCount] File system watcher created.');

        // When a file/folder changes, we need to update the decoration of its parent directory and itself.
        this.watcher.onDidChange(uri => {
            console.log(`[FileCount][Watcher] onDidChange triggered for: ${uri.fsPath}`);
            this.refreshDecorations(uri);
        });
        this.watcher.onDidCreate(uri => {
            console.log(`[FileCount][Watcher] onDidCreate triggered for: ${uri.fsPath}`);
            this.refreshDecorations(uri);
        });
        this.watcher.onDidDelete(uri => {
            console.log(`[FileCount][Watcher] onDidDelete triggered for: ${uri.fsPath}`);
            this.refreshDecorations(uri);
        });
        console.log('[FileCount] File system watcher event listeners registered.');
    }

    /**
     * Cleans up the resources (the watcher and the event emitter) when the extension is deactivated.
     */
    dispose() {
        console.log('[FileCount] Disposing provider resources: watcher and event emitter.');
        this.watcher.dispose();
        this._onDidChangeFileDecorations.dispose();
        console.log('[FileCount] Provider resources disposed.');
    }

    /**
     * Fires the onDidChangeFileDecorations event for the parent of the changed URI and the URI itself.
     * This tells VS Code to re-run `provideFileDecoration` for that directory and the file.
     * @param {vscode.Uri} uri The URI of the file or folder that changed.
     */
    refreshDecorations(uri) {
        if (!uri) {
            console.log('[FileCount][Refresh] No URI provided for refresh, skipping.');
            return;
        }

        console.log(`[FileCount][Refresh] Initiating decoration refresh for: ${uri.fsPath}`);

        // Fire event for the URI itself, in case it's a file whose size changed.
        this._onDidChangeFileDecorations.fire(uri);
        console.log(`[FileCount][Refresh] Fired decoration change for URI: ${uri.fsPath}`);

        // Fire event for the parent directory, as its contents (file count) might have changed.
        const parentUri = vscode.Uri.joinPath(uri, '..');
        // Avoid refreshing the parent if it's the root of a drive or a special URI
        // Check if the parent is different from the current URI to prevent infinite loops for root directories
        if (parentUri.toString() !== uri.toString()) {
            this._onDidChangeFileDecorations.fire(parentUri);
            console.log(`[FileCount][Refresh] Fired decoration change for parent URI: ${parentUri.fsPath}`);
        } else {
            console.log(`[FileCount][Refresh] Parent URI is same as current URI (${uri.fsPath}), skipping parent refresh.`);
        }

        // Also fire an event for the workspace root to ensure overall consistency,
        // especially for changes at the top level or when adding/removing workspace folders.
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRootUri = vscode.workspace.workspaceFolders[0].uri;
            // Only fire if the root hasn't already been covered by the current or parent URI refresh
            if (workspaceRootUri.toString() !== uri.toString() && workspaceRootUri.toString() !== parentUri.toString()) {
                 this._onDidChangeFileDecorations.fire(workspaceRootUri);
                 console.log(`[FileCount][Refresh] Fired decoration change for workspace root: ${workspaceRootUri.fsPath}`);
            } else {
                console.log(`[FileCount][Refresh] Workspace root already covered by current or parent URI refresh.`);
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
        console.log(`[FileCount][Provide] provideFileDecoration called for: ${uri.fsPath}`);

        // Only process URIs that are part of the file system.
        // 'vscode-remote' is crucial for WSL/remote development.
        if (uri.scheme !== 'file' && uri.scheme !== 'vscode-remote') {
            console.log(`[FileCount][Provide] Skipping non-file system URI: ${uri.fsPath} (Scheme: ${uri.scheme})`);
            return undefined;
        }

        try {
            // Check if the operation has been cancelled early.
            if (token.isCancellationRequested) {
                console.log(`[FileCount][Provide] Cancellation requested for ${uri.fsPath} before stat.`);
                return undefined;
            }

            const stat = await vscode.workspace.fs.stat(uri);
            console.log(`[FileCount][Provide] Stat for ${uri.fsPath}: type=${stat.type}, size=${stat.size}`);

            if (stat.type === vscode.FileType.Directory) {
                console.log(`[FileCount][Provide] ${uri.fsPath} is a directory. Counting contents...`);

                const { files, folders } = await this.getDirectoryCounts(uri, token);

                // Check for cancellation again after the async counting operation.
                if (token.isCancellationRequested) {
                    console.log(`[FileCount][Provide] Cancellation requested for ${uri.fsPath} after counting directory contents.`);
                    return undefined;
                }

                if (files === 0 && folders === 0) {
                    console.log(`[FileCount][Provide] Directory ${uri.fsPath} is empty, no decoration needed.`);
                    return undefined;
                }

                const total = files + folders;
                const decoration = {
                    badge: `${total}`, // Badge for folder count
                    tooltip: `${files} file(s), ${folders} folder(s)`,
                    color: new vscode.ThemeColor('descriptionForeground')
                };
                console.log(`[FileCount][Provide] Providing directory decoration for ${uri.fsPath}: Badge="${decoration.badge}", Tooltip="${decoration.tooltip}"`);
                return decoration;

            } else if (stat.type === vscode.FileType.File) {
                console.log(`[FileCount][Provide] ${uri.fsPath} is a file. Getting size...`);
                const fileSize = stat.size;
                const formattedSize = this.formatBytes(fileSize);

                const decoration = {
                    label: ` ${formattedSize}`, // Show file size next to file name (not as a badge)
                    tooltip: `Size: ${formattedSize}`, // Keep tooltip for full info on hover
                    color: new vscode.ThemeColor('descriptionForeground') // Optional: color for the label
                };
                console.log(`[FileCount][Provide] Providing file decoration for ${uri.fsPath}: Label="${decoration.label}", Tooltip="${decoration.tooltip}"`);
                return decoration;

            } else {
                console.log(`[FileCount][Provide] ${uri.fsPath} is neither a file nor a directory (Type: ${stat.type}), no decoration.`);
                return undefined; // SymbolicLink, Unknown, etc.
            }

        } catch (e) {
            // Common errors: file deleted, permission denied, or temporary file system issues.
            console.error(`[FileCount][Provide] Error providing decoration for ${uri.fsPath}:`, e);
            // If the error is due to the file not existing, fire a refresh for its parent
            // to ensure the parent's count gets updated if this file was part of its count.
            if (e.code === 'ENOENT') { // "No such file or directory"
                console.log(`[FileCount][Provide] File not found error for ${uri.fsPath}, triggering parent refresh.`);
                const parentUri = vscode.Uri.joinPath(uri, '..');
                this._onDidChangeFileDecorations.fire(parentUri);
            }
            return undefined; // Do not show any decoration on error.
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

        console.log(`[FileCount][Count] Reading directory: ${dirUri.fsPath}`);
        const entries = await vscode.workspace.fs.readDirectory(dirUri);
        console.log(`[FileCount][Count] Found ${entries.length} entries in ${dirUri.fsPath}.`);

        for (const [name, type] of entries) {
            if (token.isCancellationRequested) {
                console.log(`[FileCount][Count] Cancellation requested for ${dirUri.fsPath} while counting.`);
                break;
            }
            if (type === vscode.FileType.File) {
                files++;
            } else if (type === vscode.FileType.Directory) {
                folders++;
            }
        }
        console.log(`[FileCount][Count] Final counts for ${dirUri.fsPath}: ${files} files, ${folders} folders.`);
        return { files, folders };
    }

    /**
     * Formats bytes into a human-readable string (B, KB, MB, GB, TB).
     * @param {number} bytes The size in bytes.
     * @returns {string} The formatted size string.
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';

        const k = 1024;
        const dm = 1; // One decimal place for better readability
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        let formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
        if (formatted % 1 === 0) { // If it's a whole number, remove decimal
            formatted = parseInt(formatted);
        }
        return `${formatted} ${sizes[i]}`;
    }
}

module.exports = {
    activate,
    deactivate
};
