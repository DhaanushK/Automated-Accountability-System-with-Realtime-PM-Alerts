import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, 'production.env') });

const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
    role: String
});

const User = mongoose.model('User', UserSchema);

async function checkUsers() {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        const users = await User.find({ 
            role: { $in: ['team_member', 'team_lead'] } 
        }).select('email name role');

        console.log(`Found ${users.length} team members/leads:\n`);
        users.forEach(user => {
            console.log(`  ${user.role.padEnd(15)} - Name: "${user.name || 'MISSING'}" - Email: ${user.email}`);
        });

        if (users.some(u => !u.name)) {
            console.log('\n⚠️  WARNING: Some users are missing names in the database!');
            console.log('This is why recipient names show as "No Name" in emails.');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkUsers();
