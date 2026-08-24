// Script to update team lead names to match Google Sheet tab names
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

async function fixTeamLeadNames() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    // Update Praveen
    const praveenUpdate = await User.updateOne(
      { email: 'japraveen1212@gmail.com', role: 'team_lead' },
      { $set: { name: 'Praveen J A' } }
    );
    
    console.log('Updating Praveen:');
    console.log(`  Matched: ${praveenUpdate.matchedCount}`);
    console.log(`  Modified: ${praveenUpdate.modifiedCount}`);

    // Update Kanishkka
    const kanishkkaUpdate = await User.updateOne(
      { email: 'kanishkka0208@gmail.com', role: 'team_lead' },
      { $set: { name: 'Kanishkka R' } }
    );
    
    console.log('\nUpdating Kanishkka:');
    console.log(`  Matched: ${kanishkkaUpdate.matchedCount}`);
    console.log(`  Modified: ${kanishkkaUpdate.modifiedCount}`);

    // Verify updates
    console.log('\n=== Updated Team Leads ===');
    const teamLeads = await User.find({ role: 'team_lead' }).select('name email role');
    teamLeads.forEach((tl, index) => {
      console.log(`${index + 1}. Name: "${tl.name}"`);
      console.log(`   Email: ${tl.email}`);
      console.log('');
    });

    await mongoose.connection.close();
    console.log('Connection closed - Names updated successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixTeamLeadNames();
