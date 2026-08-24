import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function checkNewSheets() {
  try {
    console.log('🔍 Checking New Google Sheets Structure...\n');

    // Load credentials
    const credPath = path.join(__dirname, 'src/config/credentials.json');
    const credentials = JSON.parse(await fs.readFile(credPath, 'utf8'));

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '1KDj8ixj9oF5jSFEh-KXakLgJXjTwkgXn8uiHdxajaOc';

    // Get spreadsheet metadata
    console.log('📊 Spreadsheet ID:', spreadsheetId);
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    
    console.log('\n📑 Available Sheets:');
    console.log('─'.repeat(70));
    
    for (const sheet of metadata.data.sheets) {
      const sheetName = sheet.properties.title;
      console.log(`\n📄 Sheet: "${sheetName}"`);
      
      try {
        // Get headers first
        const headerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A1:Z1`,
        });

        const headers = headerResponse.data.values?.[0] || [];
        console.log(`   📋 Headers (${headers.length} columns):`);
        console.log(`   ${headers.join(' | ')}`);
        
        // Get first few data rows
        const dataResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A2:Z5`,
        });

        const rows = dataResponse.data.values || [];
        console.log(`\n   📊 Sample Data (${rows.length} rows):`);
        
        rows.forEach((row, idx) => {
          console.log(`   Row ${idx + 2}:`, row.slice(0, 5).join(' | '), '...');
        });

      } catch (err) {
        console.error(`   ❌ Error reading sheet: ${err.message}`);
      }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('✅ Analysis Complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\nPossible issues:');
    console.log('1. Service account not shared with new spreadsheet');
    console.log('2. Spreadsheet ID incorrect');
    console.log('3. Google Sheets API not enabled\n');
  }
}

checkNewSheets();
