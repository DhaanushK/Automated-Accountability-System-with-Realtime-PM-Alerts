import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/User.js';

dotenv.config();

async function updateAllTeamMemberNames() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Update Reddy
    const reddy = await User.findOne({ email: 'reddyvuppu3@gmail.com' });
    if (reddy) {
      console.log(`Updating: ${reddy.name} → Vuppu Reddy Kalyan`);
      reddy.name = 'Vuppu Reddy Kalyan';
      await reddy.save();
      console.log('✅ Updated Reddy\n');
    }
    
    // Update Sam
    const sam = await User.findOne({ email: 'jsam01@gmail.com' });
    if (sam) {
      console.log(`Updating: ${sam.name} → Sam J`);
      sam.name = 'Sam J';
      await sam.save();
      console.log('✅ Updated Sam\n');
    }
    
    // Verify all updates
    console.log('=== Verification ===');
    const allUsers = await User.find({ role: 'team_member' }).select('name email');
    allUsers.forEach(user => {
      console.log(`✓ ${user.name} (${user.email})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
  }
}

updateAllTeamMemberNames();
