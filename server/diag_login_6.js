const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

const dbUrl = process.env.MONGO_URI || 'mongodb://localhost:27017/chat-neural';

mongoose.connect(dbUrl)
    .then(async () => {
        const user = await User.findOne({ login_id: '6' });
        if (user) {
            console.log('NAME_FOUND:', user.name);
            console.log('LOGIN_ID_FOUND:', user.login_id);
        } else {
            console.log('USER_NOT_FOUND');
        }
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
