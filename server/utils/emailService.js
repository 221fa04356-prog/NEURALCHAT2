const nodemailer = require('nodemailer');
const sendBrevoMail = require('../brevoMailer');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false
    }
});

/**
 * Send an email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - Email body (HTML)
 */
const sendEmail = async (to, subject, html, options = {}) => {
    try {
        if (process.env.BREVO_API_KEY) {
            const fromMatch = String(options.from || '').match(/"?(.*?)"?\s*<([^>]+)>/);
            const fromName = fromMatch?.[1] || process.env.EMAIL_FROM_NAME || 'Admin';
            const fromEmail = fromMatch?.[2] || process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
            return await sendBrevoMail(to, subject, html, true, fromEmail, fromName, options.replyTo);
        }

        const info = await transporter.sendMail({
            from: options.from || `"${process.env.EMAIL_FROM_NAME || 'Admin'}" <${process.env.EMAIL_USER}>`,
            replyTo: options.replyTo,
            to,
            subject,
            html,
        });
        console.log('Message sent: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending email:', error);
        // We generally don't want to crash the request if email fails, but we should log it
        // Depending on requirements, we might want to throw error.
        throw error;
    }
};

module.exports = { sendEmail, transporter };
