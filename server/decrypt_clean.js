require('dotenv').config();
const mongoose = require('mongoose');
const Community = require('./models/Community');
const Group = require('./models/Group');

mongoose.set('strictQuery', false);

async function run() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    
    // Read all communities, decrypting them in memory via the plugin getter
    const communities = await Community.find();
    console.log(`Found ${communities.length} communities.`);

    const groups = await Group.find();
    console.log(`Found ${groups.length} groups.`);

    const db = mongoose.connection.db;
    
    for (const c of communities) {
        console.log(`Decrypting Community ID: ${c._id}`);
        await db.collection('chatcommunities').updateOne(
            { _id: c._id },
            { 
                $set: { name: c.name, description: c.description || '' }, 
                $unset: { __enc_name: "", __enc_description: "" } 
            }
        );
    }

    for (const g of groups) {
        console.log(`Decrypting Group ID: ${g._id}`);
        await db.collection('groups').updateOne(
            { _id: g._id },
            { 
                $set: { name: g.name || '' }, 
                $unset: { __enc_name: "" } 
            }
        );
    }

    console.log("Decryption complete.");
    process.exit(0);
}
run().catch(err => {
    console.error(err);
    process.exit(1);
});
