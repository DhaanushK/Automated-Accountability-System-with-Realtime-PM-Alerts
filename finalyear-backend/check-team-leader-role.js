import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from './src/models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

async function checkTeamLeaderRole() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    if (!mongoUri) {
      console.error('❌ No MongoDB URI found in environment variables');
      console.log('Looking for: MONGODB_URI or MONGO_URI');
      process.exit(1);
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find all users
    const users = await User.find({}).select('email name role');
    
    console.log('\n📋 All Users:');
    console.log('═'.repeat(80));
    users.forEach(user => {
      console.log(`Name: ${user.name}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role: ${user.role}`);
      console.log('─'.repeat(80));
    });

    // Find team leaders specifically
    const teamLeaders = await User.find({ role: 'team_lead' }).select('email name role');
    console.log('\n👨‍💼 Team Leaders:');
    console.log('═'.repeat(80));
    if (teamLeaders.length === 0) {
      console.log('❌ No users found with role "team_lead"');
    } else {
      teamLeaders.forEach(tl => {
        console.log(`Name: ${tl.name}`);
        console.log(`Email: ${tl.email}`);
        console.log(`Role: ${tl.role}`);
        console.log('─'.repeat(80));
      });
    }

    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkTeamLeaderRole();
