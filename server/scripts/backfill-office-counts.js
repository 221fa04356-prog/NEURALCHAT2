const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { countOfficeDocumentItems } = require('../utils/documentCount');

const loadEnv = () => {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) process.env[match[1].trim()] = match[2].trim();
    });
};

const getUploadCounts = () => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    const counts = new Map();
    if (!fs.existsSync(uploadDir)) return counts;

    fs.readdirSync(uploadDir)
        .filter(name => /\.(xlsx|xlsm|pptx|pptm|ppsx)$/i.test(name))
        .forEach((name) => {
            const fullPath = path.join(uploadDir, name);
            const originalName = name.replace(/^\d+-/, '');
            const size = fs.statSync(fullPath).size;
            const count = countOfficeDocumentItems(fullPath, originalName);
            if (count > 0) counts.set(`${originalName}|${size}`, count);
        });

    return counts;
};

const backfillModel = async (Model, label, counts) => {
    const docs = await Model.find({ type: 'file' }).sort({ created_at: -1 }).limit(500);
    let updated = 0;

    for (const doc of docs) {
        const obj = doc.toObject();
        const key = `${obj.fileName || ''}|${obj.fileSize || 0}`;
        const count = counts.get(key);
        if (count && Number(obj.pageCount || 0) !== count) {
            await Model.updateOne({ _id: doc._id }, { $set: { pageCount: count } });
            console.log(`${label}: ${obj.fileName} ${obj.fileSize} -> ${count}`);
            updated += 1;
        }
    }

    return updated;
};

(async () => {
    loadEnv();
    const Message = require('../models/Message');
    const GroupMessage = require('../models/GroupMessage');
    await mongoose.connect(process.env.MONGO_URI);
    const counts = getUploadCounts();
    const messages = await backfillModel(Message, 'Message', counts);
    const groups = await backfillModel(GroupMessage, 'Group', counts);
    console.log(JSON.stringify({ updated: { messages, groups } }));
    await mongoose.disconnect();
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
