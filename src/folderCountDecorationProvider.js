const vscode = require('vscode');
const utils = require('./utils');
const { IgnoredFolderDecoration, FolderDecoration, FileDecoration } = require('./decorationModels');

class FolderCountDecorationProvider {
    _onDidChangeFileDecorations = new vscode.EventEmitter();
    onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
    watcher;

    constructor() {
        this.watcher = vscode.workspace.createFileSystemWatcher('**/*');
        this.watcher.onDidChange(uri => this.refreshDecorations(uri));
        this.watcher.onDidCreate(uri => this.refreshDecorations(uri));
        this.watcher.onDidDelete(uri => this.refreshDecorations(uri));
    }

    dispose() {
        this.watcher.dispose();
        this._onDidChangeFileDecorations.dispose();
    }

    refreshDecorations(uri) {
        if (!uri) return;
        this._onDidChangeFileDecorations.fire(uri);
        const parentUri = vscode.Uri.joinPath(uri, '..');
        if (parentUri.toString() !== uri.toString()) {
            this._onDidChangeFileDecorations.fire(parentUri);
        }
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRootUri = vscode.workspace.workspaceFolders[0].uri;
            if (workspaceRootUri.toString() !== uri.toString() && workspaceRootUri.toString() !== parentUri.toString()) {
                 this._onDidChangeFileDecorations.fire(workspaceRootUri);
            }
        }
    }

    async provideFileDecoration(uri, token) {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type === vscode.FileType.Directory) {
            const lastSegment = uri.fsPath.split(/[/\\]/).pop();
            const ignored = utils.isGloballyIgnoredFolder(lastSegment);

            const { files, folders } = await this.getDirectoryCounts(uri, token);

            if (ignored) {                
                if (files === 0 && folders === 0) return undefined;
                const totalItems = files + folders;
                return new IgnoredFolderDecoration(files, folders, totalItems);
            } else {
                const totalFolderSize = await this.getFolderSize(uri, token);
                const formattedFolderSize = utils.formatBytes(totalFolderSize);

                if (token.isCancellationRequested) return undefined;
                if (files === 0 && folders === 0 && totalFolderSize === 0) return undefined;

                const totalItems = files + folders;
                return new FolderDecoration(files, folders, totalItems, formattedFolderSize);
            }
        } else if (stat.type === vscode.FileType.File) {
            const fileSize = stat.size;
            const formattedSize = utils.formatBytes(fileSize);

            return new FileDecoration(formattedSize);
        } else {
            return undefined;
        }
    }

    async getDirectoryCounts(dirUri, token) {
        let files = 0;
        let folders = 0;

        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            for (const [name, type] of entries) {
                if (token.isCancellationRequested) break;
                if (utils.shouldIgnoreEntryForTraversal(name, type)) continue;
                if (type === vscode.FileType.File) files++;
                else if (type === vscode.FileType.Directory) folders++;
            }
        } catch (error) {
            // ...existing code...
        }
        return { files, folders };
    }

    async getFolderSize(dirUri, token) {
        let totalSize = 0;

        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            for (const [name, type] of entries) {
                if (token.isCancellationRequested) return 0;
                if (utils.shouldIgnoreEntryForTraversal(name, type)) continue;
                const entryUri = vscode.Uri.joinPath(dirUri, name);
                try {
                    const stat = await vscode.workspace.fs.stat(entryUri);
                    if (stat.type === vscode.FileType.File) {
                        totalSize += stat.size;
                    } else if (stat.type === vscode.FileType.Directory) {
                        if (!utils.isGloballyIgnoredFolder(name)) {
                            totalSize += await this.getFolderSize(entryUri, token);
                        }
                    }
                } catch (entryError) {
                    console.warn(`[FileCount][Size] Could not stat entry ${entryUri.fsPath}:`, entryError.message);
                }
            }
        } catch (dirReadError) {
            console.error(`[FileCount][Size] Error reading directory ${dirUri.fsPath} for size calculation:`, dirReadError);
        }
        return totalSize;
    }
}

module.exports = { FolderCountDecorationProvider };