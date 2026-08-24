import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/User.js';
import SMTPEmailService from './src/services/smtpEmailService.js';

dotenv.config();

async function testEmailSystems() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check all users and their roles
    console.log('📊 Checking Users and Roles:');
    console.log('═'.repeat(80));
    const users = await User.find({}).select('name email role');
    
    if (users.length === 0) {
      console.log('❌ No users found in database!');
    } else {
      users.forEach(user => {
        console.log(`👤 ${user.name}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Role: ${user.role}`);
        console.log('');
      });
    }

    // Check PM user specifically
    console.log('\n🔍 Checking Project Manager User:');
    console.log('═'.repeat(80));
    const pm = await User.findOne({ email: 'dhaanushk1110@gmail.com' });
    if (pm) {
      console.log(`✅ Found PM: ${pm.name}`);
      console.log(`   Email: ${pm.email}`);
      console.log(`   Role: "${pm.role}"`);
      console.log(`   Role Type: ${typeof pm.role}`);
      console.log(`   Role Match: ${pm.role === 'project_manager' ? '✅ YES' : '❌ NO'}`);
    } else {
      console.log('❌ PM user not found!');
    }

    // Check email configuration
    console.log('\n📧 Email Configuration:');
    console.log('═'.repeat(80));
    console.log(`EMAIL_USER: ${process.env.EMAIL_USER || '❌ NOT SET'}`);
    console.log(`GMAIL_APP_PASSWORD: ${process.env.GMAIL_APP_PASSWORD ? '✅ SET' : '❌ NOT SET'}`);
    
    // Test SMTP connection
    console.log('\n🧪 Testing SMTP Connection:');
    console.log('═'.repeat(80));
    try {
      await SMTPEmailService.initialize();
      console.log('✅ SMTP Connection successful!');
    } catch (error) {
      console.log('❌ SMTP Connection failed:', error.message);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('✅ Test complete!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testEmailSystems();
