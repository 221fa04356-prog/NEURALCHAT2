const axios = require('axios');
axios.get('http://localhost:3000/api/chat/p2p/67bfdc47a810f6bd3992d99d/67c13a055daafff918ee97e4', { headers: { Authorization: 'Bearer invalid' } }).catch(e => console.log(e.response.status));
