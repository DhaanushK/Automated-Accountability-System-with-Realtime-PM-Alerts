import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/User.js';

dotenv.config();

async function updateWinnishName() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Find Winnish by email
    const user = await User.findOne({ email: 'winnish0703@gmail.com' });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('Current name:', user.name);
    console.log('Email:', user.email);
    console.log('Role:', user.role);
    
    // Update to full name
    user.name = 'Winnish Allwin G J';
    await user.save();
    
    console.log('\n✅ Updated successfully!');
    console.log('New name:', user.name);
    
    // Verify update
    const verified = await User.findById(user._id);
    console.log('\nVerified in database:', verified.name);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
  }
}

updateWinnishName();
