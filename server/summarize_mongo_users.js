require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function summarizeUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const users = await User.find({}).lean();
        const total = users.length;
        const approved = users.filter(u => u.status === 'approved').length;
        const pending = users.filter(u => u.status === 'pending').length;
        const admins = users.filter(u => u.role === 'admin').length;
        const appNonAdmin = users.filter(u => u.status === 'approved' && u.role !== 'admin').length;
        console.log(`TOTAL:${total}, APP:${approved}, PEND:${pending}, ADMIN:${admins}, APP_NON_ADMIN:${appNonAdmin}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

summarizeUsers();
