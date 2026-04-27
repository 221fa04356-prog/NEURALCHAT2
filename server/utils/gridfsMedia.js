const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MISSING_MEDIA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
<rect width="320" height="180" fill="#0f1f33"/>
<rect x="16" y="16" width="288" height="148" rx="10" fill="#102b42" stroke="#2b4b68" />
<circle cx="125" cy="88" r="16" fill="#6f8aa1"/>
<path d="M72 126l46-34 28 20 36-28 66 42H72z" fill="#36536d"/>
<text x="160" y="152" fill="#b8cadd" font-family="Segoe UI, Arial, sans-serif" font-size="14" text-anchor="middle">Media unavailable</text>
</svg>`;

const BUCKET_NAME = 'voiceFiles';

const getBucket = () => {
    if (!mongoose.connection?.db) {
        throw new Error('Mongo connection is not ready for GridFS');
    }
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
};

const uploadLocalFileToGridFS = (absPath, filename, metadata = {}) => new Promise((resolve, reject) => {
    const bucket = getBucket();
    const readStream = fs.createReadStream(absPath);
    const uploadStream = bucket.openUploadStream(filename, { metadata });

    readStream.on('error', reject);
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => {
        resolve({
            fileId: uploadStream.id,
            length: uploadStream.length
        });
    });

    readStream.pipe(uploadStream);
});

const parseRangeHeader = (range, fileSize) => {
    if (!range || !range.startsWith('bytes=')) return null;
    const parts = range.replace('bytes=', '').split('-');
    const start = Number.parseInt(parts[0], 10);
    const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= fileSize) {
        return null;
    }
    return { start, end };
};

const getContentTypeFromName = (name = '') => {
    const ext = path.extname(name).toLowerCase();
    const typeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
        '.ogg': 'audio/ogg',
        '.opus': 'audio/ogg',
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.mp4': 'video/mp4',
        '.wav': 'audio/wav',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.m4v': 'video/x-m4v'
    };
    return typeMap[ext] || 'application/octet-stream';
};

const normalizeLegacyPath = (legacyPath = '') => {
    if (!legacyPath || typeof legacyPath !== 'string') return '';
    const withoutHost = legacyPath.replace(/^https?:\/\/[^/]+/i, '');
    const withoutQuery = withoutHost.split('#')[0].split('?')[0];
    const stripped = withoutQuery.replace(/^\/+/, '');
    return stripped.startsWith('uploads/') ? `/${stripped}` : `/${stripped.replace(/^uploads\/?/i, 'uploads/')}`;
};

const resolveGridFSFileDoc = async (bucket, fileId, fallbackName = '', fallbackLegacyPath = '') => {
    let fileDoc = null;
    let streamId = null;

    if (mongoose.Types.ObjectId.isValid(fileId)) {
        streamId = new mongoose.Types.ObjectId(fileId);
        fileDoc = await bucket.find({ _id: streamId }).next();
    }

    if (!fileDoc && fallbackLegacyPath) {
        const normalizedLegacy = normalizeLegacyPath(fallbackLegacyPath);
        const legacyCandidates = [fallbackLegacyPath, normalizedLegacy].filter(Boolean);
        for (const legacy of legacyCandidates) {
            fileDoc = await bucket.find({ 'metadata.legacyPath': legacy }).sort({ uploadDate: -1 }).next();
            if (fileDoc) {
                streamId = fileDoc._id;
                break;
            }
        }
    }

    if (!fileDoc && fallbackName) {
        fileDoc = await bucket.find({ filename: fallbackName }).sort({ uploadDate: -1 }).next();
        if (fileDoc) {
            streamId = fileDoc._id;
        }
    }

    return { fileDoc, streamId };
};

const streamGridFSFileWithRange = async (req, res, fileId) => {
    const bucket = getBucket();
    const fallbackName = String(req.query.name || '');
    const fallbackLegacyPath = String(req.query.legacyPath || req.query.path || '');
    const { fileDoc, streamId } = await resolveGridFSFileDoc(bucket, fileId, fallbackName, fallbackLegacyPath);

    if (!fileDoc || !streamId) {
        const accept = String(req.get('accept') || '').toLowerCase();
        const wantsVideo = accept.includes('video/');
        res.set('Cache-Control', 'private, max-age=300');
        if (wantsVideo) {
            res.status(204).end();
            return;
        }
        const svgBuffer = Buffer.from(MISSING_MEDIA_SVG, 'utf8');
        res.status(200);
        res.set('Content-Type', 'image/svg+xml; charset=utf-8');
        res.set('Content-Length', String(svgBuffer.length));
        res.end(svgBuffer);
        return;
    }

    const fileSize = fileDoc.length;
    const contentType = getContentTypeFromName(fileDoc.filename);
    const parsedRange = parseRangeHeader(req.headers.range, fileSize);

    if (parsedRange) {
        const { start, end } = parsedRange;
        const chunkSize = (end - start) + 1;
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
            'Cache-Control': 'private, max-age=86400'
        });
        bucket.openDownloadStream(streamId, { start, end: end + 1 }).pipe(res);
        return;
    }

    res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=86400'
    });
    bucket.openDownloadStream(streamId).pipe(res);
};

module.exports = {
    uploadLocalFileToGridFS,
    streamGridFSFileWithRange
};
