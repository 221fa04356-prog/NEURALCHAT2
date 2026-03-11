require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function verifyFilter() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        // Simulating the backend query logic
        async function fetchUsersMock(userRole) {
            let query = { status: 'approved' };
            if (userRole !== 'admin') {
                query.role = { $ne: 'admin' };
            }
            return await User.find(query).select('name role');
        }

        console.log('--- FETCHING AS USER ---');
        const asUser = await fetchUsersMock('user');
        console.log('Users visible to "user":', asUser.length);
        const hasAdmins = asUser.some(u => u.role === 'admin');
        console.log('Contains admins:', hasAdmins);
        if (hasAdmins) {
            console.log('ADMINS FOUND:', asUser.filter(u => u.role === 'admin'));
        }

        console.log('\n--- FETCHING AS ADMIN ---');
        const asAdmin = await fetchUsersMock('admin');
        console.log('Users visible to "admin":', asAdmin.length);
        const adminCount = asAdmin.filter(u => u.role === 'admin').length;
        console.log('Admin users found:', adminCount);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verifyFilter();
