import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

async function testEmailConnection() {
    try {
        console.log('🔄 Testing email connection...');
        console.log('Email User:', process.env.EMAIL_USER);
        
        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });

        console.log('📧 Verifying connection...');
        await transporter.verify();
        console.log('✅ Email connection verified successfully!');
        
        console.log('📨 Sending test email...');
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: "Test Email Connection",
            text: "This is a test email to verify the connection.",
            html: "<b>This is a test email to verify the connection.</b>"
        });

        console.log('✅ Test email sent! Message ID:', info.messageId);
        return true;
    } catch (error) {
        console.error('❌ Email test failed:', error.message);
        return false;
    }
}

testEmailConnection();