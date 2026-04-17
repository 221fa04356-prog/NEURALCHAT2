const axios = require('axios');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'neural_secret_77';
const userId = '697a36c86a24bf240c7fad4c'; // From screenshot

const token = jwt.sign({ id: userId, role: 'user', name: 'john' }, JWT_SECRET);

async function test() {
    try {
        console.log('Testing /api/chat/users with token for userId:', userId);
        const res = await axios.get(`http://localhost:3000/api/chat/users?currentUserId=${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('SUCCESS:', JSON.stringify(res.data, null, 2).slice(0, 500) + '...');
    } catch (err) {
        console.error('FAILED:', err.response?.status, err.response?.data || err.message);
    }
}

test();
