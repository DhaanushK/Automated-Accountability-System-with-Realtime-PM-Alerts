import dotenv from 'dotenv';
import mongoose from 'mongoose';
import EmailLog from './src/models/EmailLog.js';
import Email from './src/models/Email.js';
import AlertRecord from './src/models/AlertRecord.js';
import { alertNotificationService } from './src/services/alertNotificationService.js';

dotenv.config();

async function testAlertEmailIntegration() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/finalyear_metrics');
    console.log('✅ Connected to MongoDB\n');

    // Get counts before triggering
    console.log('📊 BEFORE TRIGGERING ALERT:');
    console.log('═'.repeat(50));
    
    const emailLogCountBefore = await EmailLog.countDocuments({ type: 'team_alert' });
    const pmOutboxBefore = await Email.countDocuments({ 
      senderEmail: process.env.EMAIL_USER,
      folder: 'outbox',
      messageType: 'alert'
    });
    const alertRecordsBefore = await AlertRecord.countDocuments();

    console.log(`📝 EmailLog entries (team_alert): ${emailLogCountBefore}`);
    console.log(`📤 PM Outbox emails (alert): ${pmOutboxBefore}`);
    console.log(`📋 Alert Records: ${alertRecordsBefore}\n`);

    // Get sample of recent emails
    console.log('📬 Recent Alert Emails in EmailLog:');
    const recentEmailLogs = await EmailLog.find({ type: 'team_alert' })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    
    if (recentEmailLogs.length > 0) {
      recentEmailLogs.forEach((log, idx) => {
        console.log(`  ${idx + 1}. To: ${log.recipients.map(r => r.email).join(', ')}`);
        console.log(`     Subject: ${log.subject}`);
        console.log(`     Created: ${log.createdAt.toLocaleString()}`);
        console.log(`     Status: ${log.status}\n`);
      });
    } else {
      console.log('  (No alert emails found)\n');
    }

    console.log('📤 Recent PM Outbox Alerts:');
    const recentOutbox = await Email.find({
      senderEmail: process.env.EMAIL_USER,
      folder: 'outbox',
      messageType: 'alert'
    })
      .sort({ timestamp: -1 })
      .limit(5)
      .lean();
    
    if (recentOutbox.length > 0) {
      recentOutbox.forEach((email, idx) => {
        console.log(`  ${idx + 1}. To: ${email.receiverEmail} (${email.receiverName})`);
        console.log(`     Subject: ${email.subject}`);
        console.log(`     Severity: ${email.metadata?.alertSeverity || 'N/A'}`);
        console.log(`     Sent: ${email.timestamp.toLocaleString()}\n`);
      });
    } else {
      console.log('  (No alerts in PM outbox)\n');
    }

    console.log('📥 Sample Recipient Inbox Alerts:');
    const recentInbox = await Email.find({
      folder: 'inbox',
      messageType: 'alert'
    })
      .sort({ timestamp: -1 })
      .limit(5)
      .lean();
    
    if (recentInbox.length > 0) {
      recentInbox.forEach((email, idx) => {
        console.log(`  ${idx + 1}. To: ${email.receiverEmail} (${email.receiverName})`);
        console.log(`     From: ${email.senderName}`);
        console.log(`     Subject: ${email.subject}`);
        console.log(`     Severity: ${email.metadata?.alertSeverity || 'N/A'}`);
        console.log(`     Received: ${email.timestamp.toLocaleString()}\n`);
      });
    } else {
      console.log('  (No alerts in recipient inboxes)\n');
    }

    console.log('\n🚨 TRIGGERING ALERT ANALYSIS NOW...');
    console.log('═'.repeat(50));
    
    const result = await alertNotificationService.analyzeAndSendAlerts();
    
    console.log('\n✅ ALERT TRIGGER COMPLETED');
    console.log('═'.repeat(50));
    console.log('Result:', JSON.stringify(result, null, 2));

    // Get counts after triggering
    console.log('\n📊 AFTER TRIGGERING ALERT:');
    console.log('═'.repeat(50));
    
    const emailLogCountAfter = await EmailLog.countDocuments({ type: 'team_alert' });
    const pmOutboxAfter = await Email.countDocuments({ 
      senderEmail: process.env.EMAIL_USER,
      folder: 'outbox',
      messageType: 'alert'
    });
    const alertRecordsAfter = await AlertRecord.countDocuments();

    console.log(`📝 EmailLog entries (team_alert): ${emailLogCountAfter} (${emailLogCountAfter > emailLogCountBefore ? '+' + (emailLogCountAfter - emailLogCountBefore) : 'no change'})`);
    console.log(`📤 PM Outbox emails (alert): ${pmOutboxAfter} (${pmOutboxAfter > pmOutboxBefore ? '+' + (pmOutboxAfter - pmOutboxBefore) : 'no change'})`);
    console.log(`📋 Alert Records: ${alertRecordsAfter} (${alertRecordsAfter > alertRecordsBefore ? '+' + (alertRecordsAfter - alertRecordsBefore) : 'no change'})\n`);

    // Show the newest emails created
    if (emailLogCountAfter > emailLogCountBefore) {
      console.log('📬 NEW EmailLog Entries:');
      const newEmailLogs = await EmailLog.find({ type: 'team_alert' })
        .sort({ createdAt: -1 })
        .limit(emailLogCountAfter - emailLogCountBefore)
        .lean();
      
      newEmailLogs.forEach((log, idx) => {
        console.log(`  ${idx + 1}. To: ${log.recipients.map(r => r.email).join(', ')}`);
        console.log(`     Subject: ${log.subject}`);
        console.log(`     Priority: ${log.priority}`);
        console.log(`     Created: ${log.createdAt.toLocaleString()}\n`);
      });
    }

    if (pmOutboxAfter > pmOutboxBefore) {
      console.log('📤 NEW PM Outbox Entries:');
      const newOutbox = await Email.find({
        senderEmail: process.env.EMAIL_USER,
        folder: 'outbox',
        messageType: 'alert'
      })
        .sort({ timestamp: -1 })
        .limit(pmOutboxAfter - pmOutboxBefore)
        .lean();
      
      newOutbox.forEach((email, idx) => {
        console.log(`  ${idx + 1}. To: ${email.receiverEmail} (${email.receiverName})`);
        console.log(`     Subject: ${email.subject}`);
        console.log(`     Severity: ${email.metadata?.alertSeverity || 'N/A'}`);
        console.log(`     Sent: ${email.timestamp.toLocaleString()}\n`);
      });
    }

    console.log('\n✅ VERIFICATION:');
    console.log('═'.repeat(50));
    
    if (emailLogCountAfter > emailLogCountBefore) {
      console.log('✅ EmailLog entries created successfully');
    } else {
      console.log('⚠️  No new EmailLog entries (possibly no defaulters or alerts sent recently)');
    }

    if (pmOutboxAfter > pmOutboxBefore) {
      console.log('✅ PM Outbox entries created successfully');
    } else {
      console.log('⚠️  No new PM Outbox entries');
    }

    console.log('\n💡 TIP: Check the PM Dashboard Email Management section:');
    console.log('   - Tab: 📤 Outbox - Should show sent alert emails');
    console.log('   - Tab: 📊 Alert Records - Should show alert tracking\n');

  } catch (error) {
    console.error('❌ Error during test:', error);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testAlertEmailIntegration();
