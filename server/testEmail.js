require('dotenv').config();
const nodemailer = require('nodemailer');

const testEmail = async () => {
    console.log('--- Email Configuration Test ---');
    console.log('Host:', process.env.EMAIL_HOST);
    console.log('Port:', process.env.EMAIL_PORT);
    console.log('Secure:', process.env.EMAIL_SECURE);
    console.log('User:', process.env.EMAIL_USER);
    console.log('From Name:', process.env.EMAIL_FROM_NAME);

    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('Verifying connection...');
        await transporter.verify();
        console.log('Connection verified successfully!');

        console.log('Sending test email to ' + process.env.ADMIN_EMAIL + '...');
        const info = await transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'Admin'}" <${process.env.EMAIL_USER}>`,
            to: process.env.ADMIN_EMAIL,
            subject: 'Test Email from NeuralChat',
            text: 'This is a test email to verify credentials.',
            html: '<b>This is a test email to verify credentials.</b>'
        });
        console.log('Test email sent successfully! Message ID:', info.messageId);
    } catch (error) {
        console.error('Email test failed:', error);
    }
};

testEmail();
