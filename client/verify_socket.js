import { io } from "socket.io-client";

// Hardcoded for verification based on .env content read previously
const SOCKET_URL = "http://localhost:3000";

console.log(`Attempting to connect to: ${SOCKET_URL}`);

const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true
});

socket.on("connect", () => {
    console.log(`SUCCESS: Connected to server with ID: ${socket.id}`);
    // Emit a test event that the server listens to
    socket.emit('debug_hello', { message: 'Verification script saying hello' });
});

socket.on("connect_error", (err) => {
    console.error(`ERROR: Connection failed: ${err.message}`);
});

socket.on("disconnect", (reason) => {
    console.log(`Disconnected: ${reason}`);
});

socket.on("debug_hello", (data) => {
    console.log(`RECEIVED: debug_hello response:`, data);
    console.log("TEST PASSED: Socket connection and event exchange working.");
    // Exit successfully
    process.exit(0);
});

// Timeout if no connection after 10 seconds
setTimeout(() => {
    console.error("TIMEOUT: Could not connect within 10 seconds.");
    process.exit(1);
}, 10000);
