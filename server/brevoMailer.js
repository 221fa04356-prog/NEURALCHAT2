const SibApiV3Sdk = require('sib-api-v3-sdk');

const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

const sendBrevoMail = async (to, subject, content, isHtml = true, fromEmail = process.env.EMAIL_USER, fromName = process.env.EMAIL_FROM_NAME || "NeuralChat Admin") => {
  try {
    let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.subject = subject;
    if (isHtml) {
      sendSmtpEmail.htmlContent = content;
    } else {
      sendSmtpEmail.textContent = content;
    }

    sendSmtpEmail.sender = {
      email: fromEmail,
      name: fromName
    };

    sendSmtpEmail.to = [{ email: to }];

    console.log("[BREVO DEBUG] Attempting to send email to:", to);
    console.log("[BREVO DEBUG] Sender:", sendSmtpEmail.sender.email);

    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log("Brevo email sent ✅:", response.messageId);
    return response;
  } catch (err) {
    console.error("Brevo error ❌ Full Details:");
    if (err.response && err.response.body) {
      console.error(JSON.stringify(err.response.body, null, 2));
    } else {
      console.error(err);
    }
    throw err;
  }
};

module.exports = sendBrevoMail;
