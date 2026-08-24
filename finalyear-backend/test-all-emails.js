import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

async function testEmailAccount(email, password, role) {
    try {
        console.log(`\n🔄 Testing ${role} email: ${email}`);
        
        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: email,
                pass: password
            }
        });

        console.log('📧 Verifying connection...');
        await transporter.verify();
        console.log('✅ Connection verified successfully!');
        
        console.log('📨 Sending test email...');
        const info = await transporter.sendMail({
            from: email,
            to: process.env.EMAIL_USER, // Send to PM email for testing
            subject: `Test Email from ${role}`,
            text: `This is a test email from ${role} (${email})`,
            html: `<b>This is a test email from ${role} (${email})</b>`
        });

        console.log('✅ Test email sent! Message ID:', info.messageId);
        return true;
    } catch (error) {
        console.error('❌ Email test failed:', error.message);
        return false;
    }
}

async function runAllTests() {
    console.log('🚀 Starting email configuration tests...\n');

    // Test Team Leaders
    await testEmailAccount(process.env.TL1_EMAIL, process.env.TL1_APP_PASSWORD, 'Team Leader 1');
    await testEmailAccount(process.env.TL2_EMAIL, process.env.TL2_APP_PASSWORD, 'Team Leader 2');

    // Test Team Members
    await testEmailAccount(process.env.TM1_EMAIL, process.env.TM1_APP_PASSWORD, 'Team Member 1');
    await testEmailAccount(process.env.TM2_EMAIL, process.env.TM2_APP_PASSWORD, 'Team Member 2');
    await testEmailAccount(process.env.TM3_EMAIL, process.env.TM3_APP_PASSWORD, 'Team Member 3');
    await testEmailAccount(process.env.TM4_EMAIL, process.env.TM4_APP_PASSWORD, 'Team Member 4');

    console.log('\n✨ Email configuration tests completed!');
}

runAllTests();