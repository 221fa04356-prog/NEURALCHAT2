require('dotenv').config();

const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();

const generateEmailSignature = (email) => crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`email:${normalizeEmail(email)}`)
    .digest('hex');

(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

    const users = await User.find({}).select('email email_signature __enc_email');
    let updated = 0;

    for (const user of users) {
        if (!user.email_signature && normalizeEmail(user.email)) {
            await User.updateOne(
                { _id: user._id },
                { $set: { email_signature: generateEmailSignature(user.email) } }
            );
            updated += 1;
        }
    }

    console.log(JSON.stringify({ checked: users.length, updated }));
    await mongoose.disconnect();
})().catch(async (err) => {
    console.error(err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
