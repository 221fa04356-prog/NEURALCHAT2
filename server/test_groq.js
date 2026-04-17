require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function testGroq() {
    console.log("Testing Groq API with key ending in: ..." + (process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.slice(-4) : "NONE"));
    console.log("Using model: llama-3.3-70b-versatile");
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: "Hello, this is a test." }],
            model: "llama-3.3-70b-versatile",
        });
        console.log("Success! Response:", chatCompletion.choices[0]?.message?.content);
    } catch (error) {
        console.error("Groq API Error:", error.message);
        if (error.error) console.error("Details:", error.error);
    }
}

testGroq();
