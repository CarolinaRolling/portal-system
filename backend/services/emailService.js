const nodemailer = require('nodemailer');

// Email configuration - use environment variables
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = process.env.EMAIL_PORT || 587;
const EMAIL_USER = process.env.EMAIL_USER || 'your-email@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'your-app-password';
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

// Create transporter
let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: EMAIL_PORT,
      secure: EMAIL_PORT === 465, // true for 465, false for other ports
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
      }
    });
  }
  return transporter;
}

/**
 * Send an email
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML content
 */
async function sendEmail(to, subject, html) {
  try {
    const mailOptions = {
      from: `"Order Portal" <${EMAIL_FROM}>`,
      to: to,
      subject: subject,
      html: wrapEmailTemplate(html)
    };

    const info = await getTransporter().sendMail(mailOptions);
    console.log(`✉️  Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Wrap email content in a nice template
 */
function wrapEmailTemplate(content) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f4f4f4;
        }
        .email-container {
          background-color: #ffffff;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h2 {
          color: #2c3e50;
          margin-top: 0;
          border-bottom: 3px solid #3498db;
          padding-bottom: 10px;
        }
        h3 {
          color: #34495e;
          margin-top: 20px;
        }
        ul {
          padding-left: 20px;
        }
        li {
          margin: 10px 0;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
          font-size: 12px;
          color: #7f8c8d;
          text-align: center;
        }
        strong {
          color: #2c3e50;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        ${content}
        
        <div class="footer">
          <p>This is an automated message from the Order Portal System.</p>
          <p>Please do not reply directly to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Test email configuration
 */
async function testEmailConfig() {
  try {
    await getTransporter().verify();
    console.log('✅ Email server connection verified');
    return true;
  } catch (error) {
    console.error('❌ Email server connection failed:', error.message);
    return false;
  }
}

module.exports = {
  sendEmail,
  testEmailConfig
};
