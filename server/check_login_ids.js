require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkLoginIds() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const users = await User.find({ status: 'approved', role: { $ne: 'admin' } }).lean();
        const withLoginId = users.filter(u => u.login_id).length;
        const withoutLoginId = users.filter(u => !u.login_id).length;
        console.log(`APPROVED_NON_ADMINS:${users.length}, WITH_LOGIN_ID:${withLoginId}, WITHOUT_LOGIN_ID:${withoutLoginId}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkLoginIds();
