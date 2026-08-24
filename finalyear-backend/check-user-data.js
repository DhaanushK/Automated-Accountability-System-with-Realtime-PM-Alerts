import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './production.env' });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
};

const checkUsers = async () => {
  await connectDB();

  const User = mongoose.model('User', new mongoose.Schema({
    name: String,
    email: String,
    role: String
  }));

  console.log('\n=== All Users in Database ===\n');
  const users = await User.find({});
  
  users.forEach((user, index) => {
    console.log(`${index + 1}. Name: "${user.name}"`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Name Length: ${user.name.length} characters`);
    console.log('');
  });

  console.log(`Total users: ${users.length}\n`);

  // Specifically check for Winnish
  const winnish = users.find(u => u.name.includes('Winnish'));
  if (winnish) {
    console.log('=== Winnish User Details ===');
    console.log(`Full Name: "${winnish.name}"`);
    console.log(`Email: ${winnish.email}`);
    console.log(`Role: ${winnish.role}`);
    console.log(`Expected Sheet Name: "${winnish.name}"`);
  } else {
    console.log('⚠️ No user found with "Winnish" in name');
  }

  await mongoose.connection.close();
  console.log('\n✅ Database connection closed');
};

checkUsers().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
