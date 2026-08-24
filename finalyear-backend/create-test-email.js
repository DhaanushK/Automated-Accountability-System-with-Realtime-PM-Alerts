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
        role: String,
        userId: String
    },
    recipients: [{
        email: String,
        name: String,
        role: String,
        userId: String,
        readAt: Date
    }],
    subject: String,
    content: {
        text: String,
        html: String
    },
    type: String,
    status: String,
    priority: String,
    isDeleted: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    messageId: String,
    inReplyTo: String,
    references: [String],
    attachments: [{
        filename: String,
        path: String,
        contentType: String,
        size: Number
    }]
}, { timestamps: true });

const EmailLog = mongoose.model('EmailLog', EmailLogSchema);

const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
    role: String
});

const User = mongoose.model('User', UserSchema);

async function createTestEmail() {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Get a PM and TL
        const pm = await User.findOne({ role: 'project_manager' });
        const tl = await User.findOne({ role: 'team_lead', email: 'kanishkka0208@gmail.com' });

        if (!pm || !tl) {
            console.log('❌ Could not find PM or TL');
            return;
        }

        console.log(`Creating test email from PM to TL...`);
        console.log(`From: ${pm.name} (${pm.email})`);
        console.log(`To: ${tl.name} (${tl.email})\n`);

        const testEmail = new EmailLog({
            sender: {
                email: pm.email,
                name: pm.name,
                role: pm.role,
                userId: pm._id.toString()
            },
            recipients: [{
                email: tl.email,
                name: tl.name,
                role: tl.role,
                userId: tl._id.toString(),
                readAt: null
            }],
            subject: 'Test Email - Urgent Alert',
            content: {
                text: 'This is a test email to verify the Team Leader inbox is working correctly.',
                html: '<p>This is a test email to verify the <strong>Team Leader inbox</strong> is working correctly.</p>'
            },
            type: 'urgent_alert',
            status: 'sent',
            priority: 'high',
            isDeleted: false,
            isArchived: false,
            messageId: `test-${Date.now()}@localhost`
        });

        await testEmail.save();
        console.log('✅ Test email created successfully!');
        console.log(`Email ID: ${testEmail._id}`);
        console.log('\nNow refresh the Team Leader inbox - you should see 1 unread email.');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

createTestEmail();
