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

async function checkUserRole() {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Find the PM user
        const pmUser = await User.findOne({ email: 'dhaanushk1110@gmail.com' });

        if (!pmUser) {
            console.log('❌ PM user not found');
            return;
        }

        console.log('Project Manager User:');
        console.log(`  Name: ${pmUser.name}`);
        console.log(`  Email: ${pmUser.email}`);
        console.log(`  Role: "${pmUser.role}"`);
        console.log(`  Role type: ${typeof pmUser.role}`);
        console.log(`  Role length: ${pmUser.role?.length}`);
        console.log(`  ID: ${pmUser._id}`);

        // Check if role matches exactly
        console.log(`\nRole checks:`);
        console.log(`  pmUser.role === 'project_manager': ${pmUser.role === 'project_manager'}`);
        console.log(`  pmUser.role === 'Project Manager': ${pmUser.role === 'Project Manager'}`);
        console.log(`  pmUser.role === 'pm': ${pmUser.role === 'pm'}`);

        // Show all users
        console.log('\nAll users:');
        const allUsers = await User.find({}).select('name email role');
        allUsers.forEach(user => {
            console.log(`  ${user.name}: "${user.role}"`);
        });

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

checkUserRole();
