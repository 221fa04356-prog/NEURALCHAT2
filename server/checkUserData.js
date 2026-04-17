require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const checkUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const users = await User.find().sort({ created_at: -1 });

        console.log('--- USER LIST ---');
        users.forEach(u => {
            const login = u.login_id || 'NO_ID';
            const name = u.name || 'NO_NAME';
            const email = u.email || 'NO_EMAIL';
            console.log(`ID: ${login.toString().padEnd(10)} | Name: ${name.padEnd(20)} | Email: ${email}`);
        });
        console.log('--- END LIST ---');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.connection.close();
    }
};

checkUsers();
