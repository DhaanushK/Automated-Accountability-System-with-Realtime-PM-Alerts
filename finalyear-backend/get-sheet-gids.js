// Script to get sheet tab gids (Google Sheet tab IDs) for Team Lead sheets
// Run this script in the backend to find the correct gid values

import dotenv from 'dotenv';
import { sheets } from './src/services/googleSheets.js';

// Load environment variables
dotenv.config();

async function getSheetGids() {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '1KDj8ixj9oF5jSFEh-KXakLgJXjTwkgXn8uiHdxajaOc';
    
    console.log('Fetching sheet metadata for spreadsheet:', spreadsheetId);
    console.log('==================================================\n');
    
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
    });

    if (!spreadsheet.data || !spreadsheet.data.sheets) {
      throw new Error('Invalid spreadsheet structure');
    }

    console.log('Found sheets in spreadsheet:\n');
    
    spreadsheet.data.sheets.forEach((sheet, index) => {
      const title = sheet.properties.title;
      const sheetId = sheet.properties.sheetId;
      
      console.log(`${index + 1}. Sheet Name: "${title}"`);
      console.log(`   Sheet ID (gid): ${sheetId}`);
      console.log(`   URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`);
      console.log('');
    });

    console.log('==================================================');
    console.log('\nTo use these in the frontend:');
    console.log('1. Find "Praveen J A" sheet gid');
    console.log('2. Find "Kanishkka R" sheet gid');
    console.log('3. Update TeamLeadSheetViewer.jsx with these values\n');

  } catch (error) {
    console.error('Error fetching sheet data:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

getSheetGids();
