
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("MongoDB Connected");

        const count = await User.countDocuments({
            $or: [{ password_signature: { $exists: false } }, { password_signature: null }],
            password: { $exists: true, $ne: null }
        });

        console.log(`Legacy Users Count: ${count}`);

        // Also check total users
        const total = await User.countDocuments({});
        console.log(`Total Users: ${total}`);

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

connectDB();
