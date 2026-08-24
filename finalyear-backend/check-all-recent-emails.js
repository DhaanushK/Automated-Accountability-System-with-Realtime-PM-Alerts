import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, 'production.env') });

const EmailLogSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const EmailLog = mongoose.model('EmailLog', EmailLogSchema);

async function checkAllEmails() {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Find all emails in the last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const recentEmails = await EmailLog.find({
            createdAt: { $gte: oneDayAgo }
        }).sort({ createdAt: -1 }).lean();

        console.log(`📧 Found ${recentEmails.length} emails created in the last 24 hours:\n`);

        recentEmails.forEach((email, i) => {
            console.log(`${i + 1}. ${email.subject || 'No subject'}`);
            console.log(`   Type: ${email.type}`);
            console.log(`   From: ${email.sender?.name || 'Unknown'} (${email.sender?.email || 'Unknown'})`);
            console.log(`   To: ${email.recipients?.map(r => `${r.name} (${r.email})`).join(', ')}`);
            console.log(`   Status: ${email.status}`);
            console.log(`   Created: ${email.createdAt}`);
            console.log(`   ID: ${email._id}`);
            console.log('');
        });

        // Check for emails with type 'urgent'
        const urgentEmails = await EmailLog.find({ type: 'urgent' }).lean();
        console.log(`\n🚨 Found ${urgentEmails.length} emails with type='urgent'`);

        if (urgentEmails.length > 0) {
            console.log('\nUrgent emails:');
            urgentEmails.forEach((email, i) => {
                console.log(`  ${i + 1}. ${email.subject}`);
                console.log(`     From: ${email.sender?.email}`);
                console.log(`     To: ${email.recipients?.map(r => r.email).join(', ')}`);
                console.log(`     Created: ${email.createdAt}`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

checkAllEmails();
