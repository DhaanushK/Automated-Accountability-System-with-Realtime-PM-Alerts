// Script to check user names in database and compare with sheet names
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

// Import User model
const userSchema = new mongoose.Schema({
    name: {type: String, required: true},
    email: {type: String, unique: true, required: true},
    password: {type: String, required: true},
    role: {type: String, enum: ["team_member","team_lead","project_manager"], required: true}
});

const User = mongoose.model("User", userSchema);

async function checkUsers() {
  try {
    console.log('Connecting to MongoDB...');
    console.log('MongoDB URI:', process.env.MONGO_URI ? 'Set' : 'Not Set');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    console.log('=== Team Leads in Database ===');
    const teamLeads = await User.find({ role: 'team_lead' }).select('name email role');
    
    if (teamLeads.length === 0) {
      console.log('No team leads found in database!');
    } else {
      teamLeads.forEach((tl, index) => {
        console.log(`${index + 1}. Name: "${tl.name}"`);
        console.log(`   Email: ${tl.email}`);
        console.log(`   Role: ${tl.role}`);
        console.log('');
      });
    }

    console.log('=== Expected Google Sheet Names ===');
    console.log('1. "Praveen J A"');
    console.log('2. "Kanishkka R"');
    console.log('');

    console.log('=== Name Matching Check ===');
    const expectedNames = ['Praveen J A', 'Kanishkka R'];
    for (const expectedName of expectedNames) {
      const user = await User.findOne({ name: expectedName });
      if (user) {
        console.log(`✅ "${expectedName}" - FOUND in database`);
        console.log(`   Email: ${user.email}, Role: ${user.role}`);
      } else {
        console.log(`❌ "${expectedName}" - NOT FOUND in database`);
        const similar = await User.findOne({ 
          $or: [
            { name: { $regex: expectedName.split(' ')[0], $options: 'i' } },
            { email: { $regex: expectedName.toLowerCase().replace(/\s+/g, ''), $options: 'i' } }
          ]
        });
        if (similar) {
          console.log(`   Similar user found: "${similar.name}" (${similar.email})`);
        }
      }
      console.log('');
    }

    await mongoose.connection.close();
    console.log('Connection closed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();
