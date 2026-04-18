#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mongoose = require('mongoose');
const connectDB = require('../database');
const Message = require('../models/Message');
const GroupMessage = require('../models/GroupMessage');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? Math.max(0, parseInt(limitArg.split('=')[1], 10) || 0) : 0;

const uploadsDir = path.resolve(__dirname, '..', 'uploads');

function ensureFfmpeg() {
    const check = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (check.status !== 0) {
        throw new Error(
            'ffmpeg is not installed or not in PATH. Install ffmpeg first, then rerun this script.'
        );
    }
}

function convertWebmToOgg(inputAbsPath, outputAbsPath) {
    const cmd = [
        '-y',
        '-i', inputAbsPath,
        '-vn',
        '-c:a', 'libopus',
        '-b:a', '48k',
        outputAbsPath
    ];
    const run = spawnSync('ffmpeg', cmd, { stdio: 'pipe' });
    return run.status === 0;
}

function toUploadsPath(absPath) {
    const rel = path.relative(uploadsDir, absPath).replace(/\\/g, '/');
    return `/uploads/${rel}`;
}

function buildOutputPath(inputAbsPath) {
    const parsed = path.parse(inputAbsPath);
    return path.join(parsed.dir, `${parsed.name}.ogg`);
}

async function updateDocs(Model, oldPath, newPath) {
    let updated = 0;
    const docs = await Model.find({ type: 'audio', file_path: oldPath });
    for (const doc of docs) {
        doc.file_path = newPath;
        if (typeof doc.fileName === 'string' && doc.fileName.toLowerCase().endsWith('.webm')) {
            doc.fileName = doc.fileName.replace(/\.webm$/i, '.ogg');
        }
        await doc.save();
        updated += 1;
    }
    return updated;
}

async function main() {
    console.log(`[migrate-legacy-voice] Starting ${isDryRun ? '(dry-run)' : ''}`);
    if (!fs.existsSync(uploadsDir)) {
        throw new Error(`Uploads directory not found: ${uploadsDir}`);
    }

    ensureFfmpeg();
    await connectDB();

    const query = { type: 'audio', file_path: { $regex: /\.webm$/i } };
    const [p2pDocs, groupDocs] = await Promise.all([
        Message.find(query).select('file_path'),
        GroupMessage.find(query).select('file_path')
    ]);

    const uniquePaths = new Set();
    for (const d of p2pDocs) uniquePaths.add(String(d.file_path || ''));
    for (const d of groupDocs) uniquePaths.add(String(d.file_path || ''));

    const candidates = Array.from(uniquePaths).filter(p => p.startsWith('/uploads/') && p.toLowerCase().endsWith('.webm'));
    const workList = limit > 0 ? candidates.slice(0, limit) : candidates;

    console.log(`[migrate-legacy-voice] Found ${candidates.length} unique legacy webm paths. Processing ${workList.length}.`);

    let converted = 0;
    let skippedMissing = 0;
    let failed = 0;
    let updatedP2P = 0;
    let updatedGroup = 0;

    for (const oldPath of workList) {
        const rel = oldPath.replace(/^\/+uploads\/?/i, '');
        const inputAbsPath = path.join(uploadsDir, rel);
        const outputAbsPath = buildOutputPath(inputAbsPath);
        const newPath = toUploadsPath(outputAbsPath);

        if (!fs.existsSync(inputAbsPath)) {
            console.warn(`[skip] Missing file: ${inputAbsPath}`);
            skippedMissing += 1;
            continue;
        }

        if (!isDryRun) {
            let ok = true;
            if (!fs.existsSync(outputAbsPath)) {
                ok = convertWebmToOgg(inputAbsPath, outputAbsPath);
            }
            if (!ok || !fs.existsSync(outputAbsPath)) {
                console.warn(`[fail] Conversion failed: ${inputAbsPath}`);
                failed += 1;
                continue;
            }
        }

        converted += 1;

        if (!isDryRun) {
            updatedP2P += await updateDocs(Message, oldPath, newPath);
            updatedGroup += await updateDocs(GroupMessage, oldPath, newPath);
        }

        console.log(`[ok] ${oldPath} -> ${newPath}`);
    }

    console.log('\n[migrate-legacy-voice] Summary');
    console.log(`- Converted/ready: ${converted}`);
    console.log(`- Missing source: ${skippedMissing}`);
    console.log(`- Failed convert: ${failed}`);
    console.log(`- Updated Message docs: ${updatedP2P}`);
    console.log(`- Updated GroupMessage docs: ${updatedGroup}`);

    await mongoose.connection.close();
}

main().catch(async (err) => {
    console.error('[migrate-legacy-voice] ERROR:', err.message);
    try {
        await mongoose.connection.close();
    } catch (_) { }
    process.exit(1);
});

