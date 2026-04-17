#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('../database');
const Message = require('../models/Message');
const GroupMessage = require('../models/GroupMessage');
const { uploadLocalFileToGridFS } = require('../utils/gridfsMedia');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? Math.max(0, parseInt(limitArg.split('=')[1], 10) || 0) : 0;

const uploadsDir = path.resolve(__dirname, '..', 'uploads');

const isUploadsAudioPath = (p) => {
    if (!p || typeof p !== 'string') return false;
    const lower = p.toLowerCase();
    return lower.startsWith('/uploads/') && (
        lower.endsWith('.webm') ||
        lower.endsWith('.ogg') ||
        lower.endsWith('.mp3') ||
        lower.endsWith('.m4a') ||
        lower.endsWith('.wav') ||
        lower.endsWith('.mp4')
    );
};

const toAbsoluteUploadPath = (p) => {
    const rel = p.replace(/^\/+uploads\/?/i, '');
    return path.resolve(uploadsDir, rel);
};

async function migrateDoc(doc, modelName) {
    const currentPath = String(doc.file_path || '');
    if (!isUploadsAudioPath(currentPath)) return { skipped: true, reason: 'not_uploads_path' };

    const absPath = toAbsoluteUploadPath(currentPath);
    if (!absPath.startsWith(uploadsDir)) return { skipped: true, reason: 'unsafe_path' };
    if (!fs.existsSync(absPath)) return { skipped: true, reason: 'file_missing' };

    const filename = doc.fileName || path.basename(absPath);
    const metadata = {
        sourceModel: modelName,
        sourceDocId: String(doc._id),
        legacyPath: currentPath
    };

    if (!isDryRun) {
        const { fileId } = await uploadLocalFileToGridFS(absPath, filename, metadata);
        doc.file_path = `/api/chat/media/file/${String(fileId)}`;
        await doc.save();
    }

    return { migrated: true };
}

async function main() {
    console.log(`[backfill-audio-to-gridfs] Starting ${isDryRun ? '(dry-run)' : ''}`);
    if (!fs.existsSync(uploadsDir)) {
        throw new Error(`Uploads directory not found: ${uploadsDir}`);
    }

    await connectDB();

    const query = { type: 'audio', file_path: { $regex: '^/uploads/' } };
    let [p2pDocs, groupDocs] = await Promise.all([
        Message.find(query).select('_id file_path fileName type'),
        GroupMessage.find(query).select('_id file_path fileName type')
    ]);

    if (limit > 0) {
        const half = Math.ceil(limit / 2);
        p2pDocs = p2pDocs.slice(0, half);
        groupDocs = groupDocs.slice(0, Math.max(0, limit - half));
    }

    console.log(`[backfill-audio-to-gridfs] Candidates: Message=${p2pDocs.length}, GroupMessage=${groupDocs.length}`);

    const stats = {
        migrated: 0,
        missing: 0,
        skipped: 0,
        failed: 0
    };

    for (const doc of p2pDocs) {
        try {
            const r = await migrateDoc(doc, 'Message');
            if (r.migrated) stats.migrated += 1;
            else if (r.reason === 'file_missing') stats.missing += 1;
            else stats.skipped += 1;
        } catch (err) {
            stats.failed += 1;
            console.error(`[Message ${doc._id}] failed:`, err.message);
        }
    }

    for (const doc of groupDocs) {
        try {
            const r = await migrateDoc(doc, 'GroupMessage');
            if (r.migrated) stats.migrated += 1;
            else if (r.reason === 'file_missing') stats.missing += 1;
            else stats.skipped += 1;
        } catch (err) {
            stats.failed += 1;
            console.error(`[GroupMessage ${doc._id}] failed:`, err.message);
        }
    }

    console.log('[backfill-audio-to-gridfs] Summary');
    console.log(`- Migrated: ${stats.migrated}`);
    console.log(`- Missing source files: ${stats.missing}`);
    console.log(`- Skipped: ${stats.skipped}`);
    console.log(`- Failed: ${stats.failed}`);

    await mongoose.connection.close();
}

main().catch(async (err) => {
    console.error('[backfill-audio-to-gridfs] ERROR:', err.message);
    try {
        await mongoose.connection.close();
    } catch (_) { }
    process.exit(1);
});

