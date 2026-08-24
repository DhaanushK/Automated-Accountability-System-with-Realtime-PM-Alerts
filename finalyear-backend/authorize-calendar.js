import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Scopes for Google Calendar API
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

const TOKEN_PATH = path.join(__dirname, 'src/config/calendar_token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'src/config/oauth_credentials.json');

async function authorize() {
  try {
    console.log('\n🔐 Google Calendar Authorization Setup\n');
    console.log('━'.repeat(50));

    // Load OAuth credentials
    const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    // Generate authorization URL
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });

    console.log('\n📋 Step 1: Authorize this app');
    console.log('━'.repeat(50));
    console.log('\n👉 Open this URL in your browser:\n');
    console.log('   ', authUrl);
    console.log('\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve, reject) => {
      rl.question('📥 Enter the authorization code from the browser: ', async (code) => {
        rl.close();
        
        try {
          console.log('\n⏳ Exchanging code for tokens...');
          
          // Exchange authorization code for tokens
          const { tokens } = await oAuth2Client.getToken(code);
          
          // Save the token
          await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
          
          console.log('\n✅ Authorization successful!');
          console.log('━'.repeat(50));
          console.log('\n📁 Token saved to:', TOKEN_PATH);
          console.log('\n🎉 Your application now has access to Google Calendar!');
          console.log('\n💡 Next steps:');
          console.log('   1. Restart your backend server');
          console.log('   2. Refresh your frontend application');
          console.log('   3. The calendar widget should now display your events\n');
          
          resolve();
        } catch (error) {
          console.error('\n❌ Error getting access token:', error.message);
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error('\n❌ Error during authorization:', error.message);
    console.error('\n💡 Make sure oauth_credentials.json exists in src/config/\n');
    process.exit(1);
  }
}

// Run the authorization
authorize().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
