import express from 'express';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Scopes for Google Calendar API
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

const TOKEN_PATH = path.join(__dirname, '../config/calendar_token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../config/oauth_credentials.json');

/**
 * Generate authorization URL
 */
router.get('/calendar/authorize', async (req, res) => {
  try {
    const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent' // Force to get refresh token
    });

    res.json({
      success: true,
      authUrl,
      message: 'Please visit this URL to authorize Google Calendar access'
    });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate authorization URL',
      error: error.message
    });
  }
});

/**
 * OAuth callback - handles the redirect from Google
 */
router.get('/calendar/callback', async (req, res) => {
  try {
    const code = req.query.code;

    if (!code) {
      return res.status(400).send('Authorization code not found');
    }

    const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    // Exchange authorization code for tokens
    const { tokens } = await oAuth2Client.getToken(code);
    
    // Save the token
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));

    console.log('✅ Calendar authorization successful! Token saved.');

    // Redirect back to the authorization page with success parameter
    res.redirect('/calendar-authorize.html?success=true');
  } catch (error) {
    console.error('Error during OAuth callback:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Failed</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            text-align: center;
            max-width: 500px;
          }
          .error-icon {
            font-size: 64px;
            margin-bottom: 20px;
          }
          h1 {
            color: #f44336;
            margin: 0 0 20px 0;
          }
          p {
            color: #666;
            line-height: 1.6;
          }
          .error-details {
            background: #ffebee;
            padding: 15px;
            border-radius: 5px;
            margin-top: 20px;
            font-size: 14px;
            color: #c62828;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">❌</div>
          <h1>Authorization Failed</h1>
          <p>There was an error during the authorization process.</p>
          <div class="error-details">
            ${error.message}
          </div>
          <p style="margin-top: 20px; font-size: 14px;">
            Please try again or contact support if the problem persists.
          </p>
        </div>
      </body>
      </html>
    `);
  }
});

/**
 * Check authorization status
 */
router.get('/calendar/status', async (req, res) => {
  try {
    // Check if token file exists
    try {
      await fs.access(TOKEN_PATH);
      const token = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));
      
      res.json({
        success: true,
        authorized: true,
        message: 'Calendar is authorized',
        tokenInfo: {
          hasAccessToken: !!token.access_token,
          hasRefreshToken: !!token.refresh_token,
          expiryDate: token.expiry_date
        }
      });
    } catch (error) {
      res.json({
        success: true,
        authorized: false,
        message: 'Calendar is not authorized. Please authorize first.'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check authorization status',
      error: error.message
    });
  }
});

/**
 * Revoke calendar authorization
 */
router.post('/calendar/revoke', async (req, res) => {
  try {
    // Delete the token file
    try {
      await fs.unlink(TOKEN_PATH);
      res.json({
        success: true,
        message: 'Calendar authorization revoked successfully'
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.json({
          success: true,
          message: 'Calendar was not authorized'
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to revoke authorization',
      error: error.message
    });
  }
});

export default router;
