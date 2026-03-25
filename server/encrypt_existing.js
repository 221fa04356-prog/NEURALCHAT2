require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Message = require('./models/Message');
const GroupMessage = require('./models/GroupMessage');
const Community = require('./models/Community');
const Group = require('./models/Group');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected for migration...');
    } catch (err) {
        console.error('Connection error:', err);
        process.exit(1);
    }
};

const migrateCollection = async (Model, name) => {
    console.log(`Starting migration for ${name}...`);
    const docs = await Model.find();
    let count = 0;
    for (const doc of docs) {
        // Just calling save() will trigger the encryption plugin
        await doc.save();
        count++;
    }
    console.log(`Finished ${name}. Migrated ${count} documents.`);
};

const startMigration = async () => {
    await connectDB();
    
    try {
        await migrateCollection(User, 'Users');
        await migrateCollection(Message, 'Messages');
        await migrateCollection(GroupMessage, 'GroupMessages');
        await migrateCollection(Community, 'Communities');
        await migrateCollection(Group, 'Groups');
        
        console.log('Migration completed successfully!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        mongoose.connection.close();
    }
};

startMigration();
