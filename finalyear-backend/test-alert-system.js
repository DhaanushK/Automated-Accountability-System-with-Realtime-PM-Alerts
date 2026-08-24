/**
 * Test script for Alert Notification System
 * Run: node test-alert-system.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

// Import services
import { alertNotificationService } from './src/services/alertNotificationService.js';
import { analyzeTicketsForDefaulters } from './src/services/ticketAnalysisService.js';
import connectDB from './src/config/db.js';

console.log('🧪 Alert Notification System - Test Script\n');

async function runTests() {
  try {
    // 1. Connect to database
    console.log('1️⃣ Connecting to database...');
    await connectDB();
    console.log('✅ Database connected\n');

    // 2. Initialize alert service
    console.log('2️⃣ Initializing alert notification service...');
    await alertNotificationService.initialize();
    console.log('✅ Alert service initialized\n');

    // 3. Test ticket analysis
    console.log('3️⃣ Testing ticket analysis...');
    const defaulters = await analyzeTicketsForDefaulters();
    console.log(`✅ Found ${defaulters.length} defaulter(s)\n`);
    
    if (defaulters.length > 0) {
      console.log('📊 Defaulters Summary:');
      defaulters.forEach((defaulter, index) => {
        console.log(`\n   ${index + 1}. ${defaulter.name} (${defaulter.email})`);
        console.log(`      Ticket: ${defaulter.ticketNo}`);
        console.log(`      Severity: ${defaulter.severity}`);
        console.log(`      Pending Tasks: ${defaulter.pending}`);
        console.log(`      SLA Breaches: ${defaulter.late}`);
        console.log(`      Issues: ${defaulter.incompleteFields.join(', ')}`);
      });
      console.log('\n');
    } else {
      console.log('✅ No defaulters found - all employees are on track!\n');
    }

    // 4. Test alert sending (dry run - set to false to actually send)
    const DRY_RUN = true;
    
    if (DRY_RUN) {
      console.log('4️⃣ Alert sending: DRY RUN (no emails will be sent)');
      console.log('   To actually send alerts, set DRY_RUN = false in this script\n');
    } else {
      console.log('4️⃣ Triggering alert analysis and sending...');
      const result = await alertNotificationService.analyzeAndSendAlerts();
      console.log('✅ Alert analysis complete');
      console.log(`   Total Defaulters: ${result.totalDefaulters}`);
      console.log(`   Alerts Sent: ${result.alertsSent}`);
      console.log(`   Alerts Failed: ${result.alertsFailed}\n`);
    }

    // 5. Test database queries
    console.log('5️⃣ Testing database queries...');
    const AlertRecord = (await import('./src/models/AlertRecord.js')).default;
    
    const totalAlerts = await AlertRecord.countDocuments();
    const activeAlerts = await AlertRecord.countDocuments({ status: 'Active' });
    const resolvedAlerts = await AlertRecord.countDocuments({ status: 'Resolved' });
    
    console.log(`   Total Alerts in DB: ${totalAlerts}`);
    console.log(`   Active Alerts: ${activeAlerts}`);
    console.log(`   Resolved Alerts: ${resolvedAlerts}\n`);

    // 6. Summary
    console.log('✅ All tests completed successfully!\n');
    console.log('📋 Summary:');
    console.log('   ✅ Database connection: Working');
    console.log('   ✅ Alert service: Working');
    console.log('   ✅ Ticket analysis: Working');
    console.log('   ✅ Database queries: Working');
    console.log('\n🎉 Alert Notification System is ready to use!\n');

    // Disconnect
    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('\nError details:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
