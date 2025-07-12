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
 * and file size for individual files and folders.
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

        // Fire event for the URI itself, in case it's a file whose size changed, or a folder whose content changed.
        this._onDidChangeFileDecorations.fire(uri);
        console.log(`[FileCount][Refresh] Fired decoration change for URI: ${uri.fsPath}`);

        // Fire event for the parent directory, as its contents (file count/size) might have changed.
        const parentUri = vscode.Uri.joinPath(uri, '..');
        // Avoid refreshing the parent if it's the root of a drive or a special URI
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
                console.log(`[FileCount][Provide] ${uri.fsPath} is a directory.`);

                const pathSegments = uri.fsPath.split(/[/\\]/); // Split by / or \
                const lastSegment = pathSegments[pathSegments.length - 1];
                const isIgnoredFolder = this.isGloballyIgnoredFolder(lastSegment);

                let totalFolderSize = 0;
                let formattedFolderSize = '';

                // Always get direct counts for a directory, even if ignored for size calculation
                const { files, folders } = await this.getDirectoryCounts(uri, token);

                if (isIgnoredFolder) {
                    console.log(`[FileCount][Provide] ${uri.fsPath} is an ignored folder. Skipping recursive size calculation.`);
                    // For ignored folders, we just show the direct item count, no size.
                    if (files === 0 && folders === 0) {
                        return undefined; // No decoration for empty ignored folders
                    }
                    const totalItems = files + folders;
                    const decoration = {
                        badge: `${totalItems}`, // Badge for total direct items
                        tooltip: `Contains: ${files} file(s), ${folders} folder(s) (Size calculation skipped)`,
                        color: new vscode.ThemeColor('descriptionForeground')
                    };
                    console.log(`[FileCount][Provide] Providing IGNORED directory decoration for ${uri.fsPath}: Badge="${decoration.badge}", Tooltip="${decoration.tooltip}"`);
                    return decoration;

                } else {
                    // For non-ignored folders, calculate the full size
                    console.log(`[FileCount][Provide] ${uri.fsPath} is NOT an ignored folder. Calculating full size.`);
                    totalFolderSize = await this.getFolderSize(uri, token); // Recursively get total size
                    formattedFolderSize = this.formatBytes(totalFolderSize);

                    // Check for cancellation again after the async operations.
                    if (token.isCancellationRequested) {
                        console.log(`[FileCount][Provide] Cancellation requested for ${uri.fsPath} after counting/sizing directory.`);
                        return undefined;
                    }

                    if (files === 0 && folders === 0 && totalFolderSize === 0) {
                        console.log(`[FileCount][Provide] Directory ${uri.fsPath} is empty, no decoration needed.`);
                        return undefined;
                    }

                    const totalItems = files + folders;
                    const decoration = {
                        badge: `${totalItems}`, // Badge for total direct items
                        label: ` (${formattedFolderSize})`, // Show folder size next to folder name
                        tooltip: `Contains: ${files} file(s), ${folders} folder(s)\nTotal Size: ${formattedFolderSize}`,
                        color: new vscode.ThemeColor('descriptionForeground')
                    };
                    console.log(`[FileCount][Provide] Providing directory decoration for ${uri.fsPath}: Badge="${decoration.badge}", Label="${decoration.label}", Tooltip="${decoration.tooltip}"`);
                    return decoration;
                }

            } else if (stat.type === vscode.FileType.File) {
                console.log(`[FileCount][Provide] ${uri.fsPath} is a file. Getting size...`);
                const fileSize = stat.size;
                const formattedSize = this.formatBytes(fileSize);

                const decoration = {
                    label: ` ${formattedSize}`, // Show file size next to file name
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
            // to ensure the parent's count/size gets updated if this file was part of its content.
            if (e.code === 'ENOENT') { // "No such file or directory"
                console.log(`[FileCount][Provide] File not found error for ${uri.fsPath}, triggering parent refresh.`);
                const parentUri = vscode.Uri.joinPath(uri, '..');
                this._onDidChangeFileDecorations.fire(parentUri);
            }
            return undefined; // Do not show any decoration on error.
        }
    }

    /**
     * Determines if a given entry name should be ignored during size/count *traversal*.
     * This is used when iterating contents of a parent folder.
     * @param {string} name The name of the file or folder.
     * @param {vscode.FileType} type The type of the file system entry.
     * @returns {boolean} True if the entry should be ignored, false otherwise.
     */
    shouldIgnoreEntryForTraversal(name, type) {
        if (type === vscode.FileType.Directory) {
            // Ignore folders starting with '.' (e.g., .git, .vscode)
            if (name.startsWith('.')) {
                return true;
            }
            // Ignore node_modules folders
            if (name === 'node_modules') {
                return true;
            }
        }
        return false;
    }

    /**
     * Determines if a folder, when being decorated *itself*, should have its size calculated.
     * This is different from `shouldIgnoreEntryForTraversal` because we still want to show
     * a badge for these folders, just not a size.
     * @param {string} folderName The name of the folder being decorated.
     * @returns {boolean} True if the folder's size calculation should be skipped, false otherwise.
     */
    isGloballyIgnoredFolder(folderName) {
        return folderName.startsWith('.') || folderName === 'node_modules';
    }


    /**
     * Counts the number of files and sub-folders directly inside a given directory, ignoring specified patterns.
     * @param {vscode.Uri} dirUri The URI of the directory.
     * @param {vscode.CancellationToken} token A token to signal cancellation.
     * @returns {Promise<{files: number, folders: number}>} An object with the counts.
     */
    async getDirectoryCounts(dirUri, token) {
        let files = 0;
        let folders = 0;

        console.log(`[FileCount][Count] Reading directory for direct counts: ${dirUri.fsPath}`);
        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            console.log(`[FileCount][Count] Found ${entries.length} entries for direct counts in ${dirUri.fsPath}.`);

            for (const [name, type] of entries) {
                if (token.isCancellationRequested) {
                    console.log(`[FileCount][Count] Cancellation requested for ${dirUri.fsPath} while counting direct entries.`);
                    break;
                }

                // Use the specific ignore logic for traversal (when counting contents of a parent)
                if (this.shouldIgnoreEntryForTraversal(name, type)) {
                    console.log(`[FileCount][Count] Ignoring entry for traversal: ${name} (Type: ${type}) in ${dirUri.fsPath}`);
                    continue; // Skip to the next entry
                }

                if (type === vscode.FileType.File) {
                    files++;
                } else if (type === vscode.FileType.Directory) {
                    folders++;
                }
            }
        } catch (error) {
            console.error(`[FileCount][Count] Error reading directory for direct counts ${dirUri.fsPath}:`, error);
        }
        console.log(`[FileCount][Count] Final direct counts for ${dirUri.fsPath}: ${files} files, ${folders} folders.`);
        return { files, folders };
    }

    /**
     * Recursively calculates the total size of a folder and its contents, ignoring specified patterns.
     * @param {vscode.Uri} dirUri The URI of the directory.
     * @param {vscode.CancellationToken} token A token to signal cancellation.
     * @returns {Promise<number>} The total size in bytes.
     */
    async getFolderSize(dirUri, token) {
        let totalSize = 0;
        console.log(`[FileCount][Size] Calculating total size for folder: ${dirUri.fsPath}`);

        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            console.log(`[FileCount][Size] Found ${entries.length} entries in ${dirUri.fsPath} for size calculation.`);

            for (const [name, type] of entries) {
                if (token.isCancellationRequested) {
                    console.log(`[FileCount][Size] Cancellation requested for ${dirUri.fsPath} while calculating size.`);
                    return 0; // Return 0 or current accumulated size if cancelled
                }

                // Use the specific ignore logic for traversal (when summing contents of a parent)
                if (this.shouldIgnoreEntryForTraversal(name, type)) {
                    console.log(`[FileCount][Size] Ignoring entry for traversal: ${name} (Type: ${type}) in ${dirUri.fsPath}`);
                    continue; // Skip to the next entry
                }

                const entryUri = vscode.Uri.joinPath(dirUri, name);
                try {
                    const stat = await vscode.workspace.fs.stat(entryUri);

                    if (stat.type === vscode.FileType.File) {
                        totalSize += stat.size;
                        console.log(`[FileCount][Size] Added file: ${entryUri.fsPath} (${this.formatBytes(stat.size)}). Current total: ${this.formatBytes(totalSize)}`);
                    } else if (stat.type === vscode.FileType.Directory) {
                        // Crucially, when recursing, we check if the sub-folder itself is ignored globally.
                        // If it is, we count its size as 0 for the parent's sum, but still traverse its non-ignored children
                        // IF we wanted to support calculating sub-parts of ignored folders.
                        // For simplicity and typical use-case, if it's an ignored folder, we add 0 to parent's size
                        // and don't recurse into it for *parent's* size calculation.
                        // But we still allow provideFileDecoration to count its direct items.
                        if (this.isGloballyIgnoredFolder(name)) {
                             console.log(`[FileCount][Size] Skipping recursive size for globally ignored sub-folder: ${entryUri.fsPath}`);
                        } else {
                            totalSize += await this.getFolderSize(entryUri, token); // Recursive call
                            console.log(`[FileCount][Size] Added directory size for: ${entryUri.fsPath}. Current total: ${this.formatBytes(totalSize)}`);
                        }
                    }
                } catch (entryError) {
                    // Ignore errors for individual entries (e.g., permission denied, symlink to non-existent target)
                    console.warn(`[FileCount][Size] Could not stat entry ${entryUri.fsPath}:`, entryError.message);
                }
            }
        } catch (dirReadError) {
            console.error(`[FileCount][Size] Error reading directory ${dirUri.fsPath} for size calculation:`, dirReadError);
        }

        console.log(`[FileCount][Size] Finished calculating total size for ${dirUri.fsPath}: ${this.formatBytes(totalSize)}`);
        return totalSize;
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