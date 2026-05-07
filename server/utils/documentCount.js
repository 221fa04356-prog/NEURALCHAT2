const fs = require('fs');
const path = require('path');

const getFileExtension = (fileName = '') => path.extname(String(fileName || '')).slice(1).toLowerCase();

const listZipEntryNames = (filePath) => {
    const bytes = fs.readFileSync(filePath);
    const minEocdOffset = Math.max(0, bytes.length - 0x10000 - 22);
    let eocdOffset = -1;

    for (let i = bytes.length - 22; i >= minEocdOffset; i -= 1) {
        if (bytes.readUInt32LE(i) === 0x06054b50) {
            eocdOffset = i;
            break;
        }
    }

    if (eocdOffset < 0) return [];

    const entryCount = bytes.readUInt16LE(eocdOffset + 10);
    let centralOffset = bytes.readUInt32LE(eocdOffset + 16);
    const names = [];

    for (let i = 0; i < entryCount && centralOffset < bytes.length; i += 1) {
        if (bytes.readUInt32LE(centralOffset) !== 0x02014b50) break;

        const fileNameLength = bytes.readUInt16LE(centralOffset + 28);
        const extraLength = bytes.readUInt16LE(centralOffset + 30);
        const commentLength = bytes.readUInt16LE(centralOffset + 32);
        const nameStart = centralOffset + 46;
        names.push(bytes.slice(nameStart, nameStart + fileNameLength).toString('utf8'));
        centralOffset += 46 + fileNameLength + extraLength + commentLength;
    }

    return names;
};

const countOfficeDocumentItems = (filePath, fileName = '') => {
    const ext = getFileExtension(fileName || filePath);
    if (!['xlsx', 'xlsm', 'xltx', 'pptx', 'pptm', 'potx', 'ppsx'].includes(ext)) return 0;

    try {
        const names = listZipEntryNames(filePath);
        if (['xlsx', 'xlsm', 'xltx'].includes(ext)) {
            return names.filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).length;
        }
        return names.filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).length;
    } catch (err) {
        console.error('[DOCUMENT COUNT] Office count failed:', err);
        return 0;
    }
};

module.exports = {
    countOfficeDocumentItems,
    getFileExtension
};
