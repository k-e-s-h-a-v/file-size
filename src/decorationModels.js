const vscode = require('vscode');

class BaseDecoration {
    constructor() {
        this.color = new vscode.ThemeColor('descriptionForeground');
    }

    static countLabel(count, singular, plural) {
        if (count === 0) return '';
        if (count === 1) return `1 ${singular}`;
        return `${count} ${plural}`;
    }

    static joinCounts(files, folders) {
        const fileLabel = this.countLabel(files, 'file', 'files');
        const folderLabel = this.countLabel(folders, 'folder', 'folders');
        if (fileLabel && folderLabel) return `${fileLabel}, ${folderLabel}`;
        return fileLabel || folderLabel;
    }
}

class IgnoredFolderDecoration extends BaseDecoration {
    constructor(files, folders, totalItems) {
        super();
        this.badge = `${totalItems}`;
        this.label = totalItems > 0 ? ` (${totalItems})` : '';
        const counts = BaseDecoration.joinCounts(files, folders);
        this.tooltip = counts ? `Contains: ${counts} (Size calculation skipped)` : 'Size calculation skipped';
    }
}

class FolderDecoration extends BaseDecoration {
    constructor(files, folders, totalItems, formattedFolderSize) {
        super();
        this.badge = `${totalItems}`;
        this.label = formattedFolderSize ? ` (${formattedFolderSize})` : '';
        const counts = BaseDecoration.joinCounts(files, folders);
        this.tooltip = counts
            ? `Contains: ${counts}\nTotal Size: ${formattedFolderSize}`
            : `Total Size: ${formattedFolderSize}`;
    }
}

class FileDecoration extends BaseDecoration {
    constructor(formattedSize) {
        super();
        this.label = formattedSize ? ` ${formattedSize}` : '';
        this.tooltip = formattedSize ? `Size: ${formattedSize}` : '';
    }
}

module.exports = {
    IgnoredFolderDecoration,
    FolderDecoration,
    FileDecoration
};
