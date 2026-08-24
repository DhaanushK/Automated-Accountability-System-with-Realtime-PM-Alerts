import mongoose from 'mongoose';
import dotenv from 'dotenv';
import AlertRecord from './src/models/AlertRecord.js';

dotenv.config();

async function clearAlertRecords() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Count existing records
    const count = await AlertRecord.countDocuments();
    console.log(`📊 Found ${count} alert record(s) in database`);

    if (count === 0) {
      console.log('✅ No alert records to delete');
      process.exit(0);
    }

    // Delete all alert records
    console.log('🗑️  Deleting all alert records...');
    const result = await AlertRecord.deleteMany({});
    
    console.log(`✅ Successfully deleted ${result.deletedCount} alert record(s)`);
    console.log('🎉 Database cleared! Ready for fresh testing.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

clearAlertRecords();
