import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, 'production.env') });

const EmailLogSchema = new mongoose.Schema({
    sender: {
        email: String,
        name: String,
        role: String
    },
    recipients: [{
        email: String,
        name: String,
        role: String,
        readAt: Date
    }],
    subject: String,
    content: {
        text: String,
        html: String
    },
    type: String,
    status: String,
    isDeleted: Boolean,
    isArchived: Boolean,
    createdAt: Date
}, { timestamps: true });

const EmailLog = mongoose.model('EmailLog', EmailLogSchema);

const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
    role: String
});

const User = mongoose.model('User', UserSchema);

async function checkTLEmails() {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Find all team leaders
        const teamLeaders = await User.find({ role: 'team_lead' }).select('email name');
        
        if (teamLeaders.length === 0) {
            console.log('❌ No team leaders found in database');
            return;
        }

        console.log(`Found ${teamLeaders.length} team leader(s):\n`);

        for (const tl of teamLeaders) {
            console.log(`\n📧 Team Leader: ${tl.name} (${tl.email})`);
            console.log('─'.repeat(60));

            // Check inbox emails (don't filter by isDeleted or status)
            const inboxEmails = await EmailLog.find({
                'recipients.email': tl.email
            }).sort({ createdAt: -1 }).lean();

            console.log(`\n📥 INBOX: ${inboxEmails.length} emails`);
            
            if (inboxEmails.length > 0) {
                console.log('\nRecent emails:');
                inboxEmails.slice(0, 5).forEach((email, i) => {
                    const isRead = email.recipients.find(r => r.email === tl.email)?.readAt !== null;
                    console.log(`  ${i + 1}. [${isRead ? 'READ' : 'UNREAD'}] ${email.subject}`);
                    console.log(`     From: ${email.sender.name} (${email.sender.email})`);
                    console.log(`     Type: ${email.type}, Status: ${email.status}`);
                    console.log(`     Date: ${email.createdAt}`);
                });
            }

            // Check outbox emails (don't filter by isDeleted or status)
            const outboxEmails = await EmailLog.find({
                'sender.email': tl.email
            }).sort({ createdAt: -1 }).lean();

            console.log(`\n📤 OUTBOX: ${outboxEmails.length} emails`);
            
            if (outboxEmails.length > 0) {
                console.log('\nRecent sent emails:');
                outboxEmails.slice(0, 5).forEach((email, i) => {
                    console.log(`  ${i + 1}. ${email.subject}`);
                    console.log(`     To: ${email.recipients.map(r => r.name).join(', ')}`);
                    console.log(`     Type: ${email.type}, Status: ${email.status}`);
                    console.log(`     Date: ${email.createdAt}`);
                });
            }

            // Count unread
            const unreadCount = inboxEmails.filter(email => {
                const recipient = email.recipients.find(r => r.email === tl.email);
                return recipient && !recipient.readAt;
            }).length;

            console.log(`\n📊 Stats:`);
            console.log(`   Total Inbox: ${inboxEmails.length}`);
            console.log(`   Unread: ${unreadCount}`);
            console.log(`   Total Outbox: ${outboxEmails.length}`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

checkTLEmails();
