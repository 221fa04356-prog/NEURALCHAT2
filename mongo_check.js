const mongoose = require('mongoose');
const User = require('./server/models/User');
const Message = require('./server/models/Message');

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nechat58')
  .then(async () => {
    const users = await User.find({}).lean();
    console.log("Total Users in DB:", users.length);
    users.forEach(u => console.log(`- ${u.name} | Role: ${u.role} | Status: ${u.status}`));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
