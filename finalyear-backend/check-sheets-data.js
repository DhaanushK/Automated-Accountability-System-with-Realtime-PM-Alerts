import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function checkSheetsData() {
  try {
    console.log('🔍 Checking Google Sheets Data...\n');

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
        // Get data from this sheet
        const range = `${sheetName}!A2:I100`; // Get rows 2-100, columns A-I
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range,
        });

        const rows = response.data.values || [];
        console.log(`   Total rows: ${rows.length}`);
        
        if (rows.length > 0) {
          console.log('\n   📋 Sample Data (First 3 rows):');
          console.log('   ' + '─'.repeat(66));
          console.log('   Headers: Date | Name | Email | Assigned | Resolved | SLA | Reopened | ClientInt | Remarks');
          
          rows.slice(0, 3).forEach((row, idx) => {
            const [date, name, email, assigned, resolved, sla, reopened, clientInt, remarks] = row;
            console.log(`   Row ${idx + 2}: ${date || 'N/A'} | ${name || 'N/A'} | ${email || 'N/A'} | ${assigned || 0} | ${resolved || 0} | ${sla || 0} | ${reopened || 0} | ${clientInt || '❌ 0'} | ${remarks || 'N/A'}`);
          });

          // Check clientInteractions column (column H, index 7)
          const clientInteractionsData = rows.map(row => parseInt(row[7]) || 0);
          const totalInteractions = clientInteractionsData.reduce((sum, val) => sum + val, 0);
          const hasData = clientInteractionsData.some(val => val > 0);

          console.log('\n   📊 Client Interactions Analysis:');
          console.log('   ' + '─'.repeat(66));
          console.log(`   Total Client Interactions: ${totalInteractions}`);
          console.log(`   Rows with interactions > 0: ${clientInteractionsData.filter(v => v > 0).length}`);
          console.log(`   Has Data: ${hasData ? '✅ Yes' : '❌ No - All values are 0 or empty!'}`);

          if (!hasData) {
            console.log('\n   ⚠️  WARNING: Column H (Client Interactions) has no data!');
            console.log('   Please add data to column H in Google Sheets.');
          }
        } else {
          console.log('   ⚠️  No data rows found (might be empty sheet)');
        }
      } catch (err) {
        console.error(`   ❌ Error reading sheet: ${err.message}`);
      }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('✅ Analysis Complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\nPossible issues:');
    console.log('1. Credentials file not found or invalid');
    console.log('2. Google Sheets API not enabled');
    console.log('3. Service account not shared with spreadsheet');
    console.log('4. Spreadsheet ID incorrect\n');
  }
}

checkSheetsData();
