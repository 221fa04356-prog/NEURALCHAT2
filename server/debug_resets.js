const mongoose = require('mongoose');
require('dotenv').config();
const PasswordReset = require('./models/PasswordReset');

async function debugResets() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chat_app');
        console.log('Connected to DB');

        const allResets = await PasswordReset.find({});
        console.log(`Total Resets in DB: ${allResets.length}`);

        console.log('\n--- ALL RESETS ---');
        allResets.forEach(r => {
            console.log(`ID: ${r._id}, Status: ${r.status}, Created: ${r.created_at.toISOString()}, User: ${r.user_id}`);
        });

        // Test Aggregation logic (Day)
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

        console.log(`\nQuerying from: ${sevenDaysAgo.toISOString()} (${sevenDaysAgo.toString()})`);

        const dailyResets = await PasswordReset.aggregate([
            { $match: { created_at: { $gte: sevenDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at", timezone: "+05:30" } },
                    count: { $sum: 1 },
                    ids: { $push: "$_id" } // Collect IDs to see what's included
                }
            }
        ]);

        console.log('\n--- AGGREGATION RESULTS ---');
        console.log(JSON.stringify(dailyResets, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

debugResets();
