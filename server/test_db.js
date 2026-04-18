const mongoose = require('mongoose');
const fs = require('fs');
mongoose.connect('mongodb+srv://neuraladmin:neuralchat@neuralchat-1.d5hkbnk.mongodb.net/?appName=neuralchat-1')
    .then(() => require('./models/Message').find().sort({ created_at: -1 }).limit(5).lean().then(docs => {
        fs.writeFileSync('out.json', JSON.stringify(docs, null, 2));
        process.exit(0);
    }));
