import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, 'production.env') });

// Old Email model
const EmailSchema = new mongoose.Schema({
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

const Email = mongoose.model('Email', EmailSchema, 'emails');

async function checkOldEmails() {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Check if old emails collection exists
        const collections = await mongoose.connection.db.listCollections().toArray();
        const emailCollectionExists = collections.find(c => c.name === 'emails');

        if (!emailCollectionExists) {
            console.log('❌ Old "emails" collection does not exist');
            return;
        }

        console.log('✅ Old "emails" collection exists\n');

        // Find emails for team leaders
        const tlEmail = 'kanishkka0208@gmail.com';
        
        const inboxEmails = await Email.find({
            'recipients.email': tlEmail,
            isDeleted: { $ne: true }
        }).lean();

        console.log(`📧 Found ${inboxEmails.length} emails in OLD Email collection for ${tlEmail}`);
        
        if (inboxEmails.length > 0) {
            console.log('\n⚠️ THIS IS THE PROBLEM! Emails are in the old "emails" collection.');
            console.log('The frontend might be fetching from here, but the backend routes');
            console.log('are querying the "emaillogs" collection.\n');
            
            console.log('Sample emails:');
            inboxEmails.slice(0, 5).forEach((email, i) => {
                console.log(`  ${i + 1}. ${email.subject}`);
                console.log(`     From: ${email.sender?.name || 'Unknown'}`);
                console.log(`     Type: ${email.type}`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

checkOldEmails();
