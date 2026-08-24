import nodemailer from 'nodemailer';

export async function initializeGmailService() {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    await transporter.verify();
    console.log('✅ Gmail service initialized successfully');
    return transporter;
  } catch (error) {
    console.error('❌ Failed to initialize Gmail service:', error);
    throw error;
  }
}

export async function sendEmail(to, subject, body) {
  try {
    const transporter = await initializeGmailService();
    
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject,
      html: body
    });

    console.log('✅ Email sent successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw error;
  }
}

export async function testEmailConnection() {
  try {
    const transporter = await initializeGmailService();
    await transporter.verify();
    console.log('✅ Gmail connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Gmail connection test failed:', error);
    throw error;
  }
}
