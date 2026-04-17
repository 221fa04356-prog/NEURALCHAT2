require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const fs = require('fs');

async function checkUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const users = await User.find({}).lean();
        fs.writeFileSync('users_dump_utf8.json', JSON.stringify(users, null, 2), 'utf8');
        console.log('Done exporting to users_dump_utf8.json');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkUsers();
