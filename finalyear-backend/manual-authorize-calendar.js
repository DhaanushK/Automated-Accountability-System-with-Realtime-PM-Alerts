import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

const TOKEN_PATH = path.join(__dirname, 'src/config/calendar_token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'src/config/oauth_credentials.json');

async function manualAuthorize() {
  try {
    console.log('\n🔐 Manual Google Calendar Authorization\n');
    console.log('='.repeat(60));

    const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id } = credentials.web || credentials.installed;

    // Use a simple redirect URI that's easier to configure
    const redirectUri = 'http://localhost:5001';

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirectUri
    );

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });

    console.log('\n📋 STEP 1: Authorize Application');
    console.log('='.repeat(60));
    console.log('\n👉 Open this URL in your browser:\n');
    console.log(authUrl);
    console.log('\n');
    
    console.log('📌 After authorizing:');
    console.log('   1. You will be redirected to a page that says "API is running..."');
    console.log('   2. Look at the browser URL bar');
    console.log('   3. Copy ONLY the CODE from the URL');
    console.log('\n   Example URL:');
    console.log('   http://localhost:5001/?code=4/0AanRRrt...xyz&scope=...');
    console.log('   \n   ↓ Copy this part ↓');
    console.log('   4/0AanRRrt...xyz');
    console.log('\n' + '='.repeat(60) + '\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve, reject) => {
      rl.question('📥 Paste the authorization code here: ', async (code) => {
        rl.close();
        
        if (!code || code.trim() === '') {
          console.error('\n❌ No code provided!');
          reject(new Error('No authorization code provided'));
          return;
        }

        try {
          console.log('\n⏳ Exchanging code for tokens...');
          
          const { tokens } = await oAuth2Client.getToken(code.trim());
          
          await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
          
          console.log('\n✅ SUCCESS! Calendar authorized!\n');
          console.log('='.repeat(60));
          console.log('\n📁 Token saved to:', TOKEN_PATH);
          console.log('\n🎉 Your calendar widget should now work!');
          console.log('\n💡 Next steps:');
          console.log('   1. Refresh your PM Dashboard in the browser');
          console.log('   2. The Calendar Widget should now display your events');
          console.log('   3. You can now schedule weekly reports and create events\n');
          console.log('='.repeat(60) + '\n');
          
          resolve();
        } catch (error) {
          console.error('\n❌ Error exchanging code for tokens:');
          console.error('   ', error.message);
          console.log('\n💡 Common issues:');
          console.log('   - Code was already used (codes expire after first use)');
          console.log('   - Code was copied incorrectly');
          console.log('   - Redirect URI mismatch\n');
          console.log('   Please run this script again and get a fresh code.\n');
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n💡 Make sure oauth_credentials.json exists in src/config/\n');
    process.exit(1);
  }
}

manualAuthorize().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
