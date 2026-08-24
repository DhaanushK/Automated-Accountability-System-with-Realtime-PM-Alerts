/**
 * Test Script for Email Tracking Fix
 * 
 * This script helps verify that emails are being stored correctly in EmailLog
 * and can be retrieved from both inbox and outbox.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple .env file locations
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, 'production.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import models
const EmailLogSchema = new mongoose.Schema({
    type: String,
    subject: String,
    recipients: [{
        email: String,
        name: String,
        status: String,
        messageId: String,
        sentAt: Date,
        readAt: Date
    }],
    content: {
        text: String,
        html: String
    },
    priority: String,
    metadata: Map,
    sender: {
        email: String,
        name: String
    }
}, { timestamps: true });

const EmailLog = mongoose.model('EmailLog', EmailLogSchema);

async function testEmailTracking() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        
        // Check if MongoDB URI is available (try both common names)
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        
        if (!mongoUri) {
            console.error('❌ MONGODB_URI or MONGO_URI not found in environment variables');
            console.log('Available env vars:', Object.keys(process.env).filter(k => k.includes('MONGO')));
            process.exit(1);
        }
        
        console.log(`Connecting to: ${mongoUri.replace(/\/\/.*@/, '//***@')}`);
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Get all email logs
        const allEmails = await EmailLog.find().sort({ createdAt: -1 }).limit(10);
        console.log(`📧 Total recent emails in database: ${allEmails.length}\n`);

        // Display each email
        allEmails.forEach((email, index) => {
            console.log(`Email #${index + 1}:`);
            console.log(`  Type: ${email.type}`);
            console.log(`  Subject: ${email.subject}`);
            console.log(`  Sender: ${email.sender.name} <${email.sender.email}>`);
            console.log(`  Recipients (${email.recipients.length}):`);
            email.recipients.forEach(r => {
                console.log(`    - ${r.name || 'No Name'} <${r.email}> [${r.status}]`);
            });
            console.log(`  Created: ${email.createdAt}`);
            console.log(`  Metadata SMTP: ${email.metadata?.get('smtpEmail') || 'N/A'}`);
            console.log('');
        });

        // Test inbox query for a specific user
        console.log('\n🔍 Testing Inbox Query:');
        const testEmail = 'test@example.com'; // Replace with actual email
        const inboxEmails = await EmailLog.find({ 'recipients.email': testEmail })
            .sort({ createdAt: -1 })
            .limit(5);
        console.log(`  Found ${inboxEmails.length} emails in inbox for ${testEmail}`);

        // Test outbox query
        console.log('\n📤 Testing Outbox Query:');
        const pmEmail = process.env.PM_EMAIL || 'pm@example.com'; // Replace with actual PM email
        const outboxEmails = await EmailLog.find({ 'sender.email': pmEmail })
            .sort({ createdAt: -1 })
            .limit(5);
        console.log(`  Found ${outboxEmails.length} emails in outbox for ${pmEmail}`);

        // Check for emails with missing recipient names
        console.log('\n⚠️  Checking for emails with missing recipient names:');
        const emailsWithoutNames = await EmailLog.find({
            'recipients.name': { $exists: false }
        }).limit(5);
        console.log(`  Found ${emailsWithoutNames.length} emails with missing recipient names`);
        
        if (emailsWithoutNames.length > 0) {
            console.log('  ⚠️  WARNING: Some emails are missing recipient names!');
            emailsWithoutNames.forEach((email, index) => {
                console.log(`    Email #${index + 1}: ${email.subject}`);
                console.log(`      Recipients: ${email.recipients.map(r => r.email).join(', ')}`);
            });
        }

        // Check for emails with SMTP sender
        console.log('\n🔍 Checking for emails with SMTP sender (old format):');
        const smtpEmail = process.env.EMAIL_USER;
        const oldFormatEmails = await EmailLog.find({ 
            'sender.email': smtpEmail 
        }).limit(5);
        console.log(`  Found ${oldFormatEmails.length} emails with SMTP sender`);
        
        if (oldFormatEmails.length > 0) {
            console.log('  📝 These are old emails before the fix');
        }

        console.log('\n✅ Email tracking test complete!');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

// Run the test
testEmailTracking();
