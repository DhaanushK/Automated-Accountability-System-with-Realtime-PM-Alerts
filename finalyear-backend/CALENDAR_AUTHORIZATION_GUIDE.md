# Google Calendar Authorization Guide

## Overview
This guide will help you authorize Google Calendar API access for your application. Once completed, the Calendar Widget in the PM Dashboard will display upcoming events and allow scheduling.

---

## Prerequisites
✅ Google Cloud Project with Calendar API enabled  
✅ OAuth 2.0 credentials configured  
✅ oauth_credentials.json file in `finalyear-backend/src/config/`

---

## Authorization Methods

You have **TWO options** to authorize Google Calendar:

### 🚀 **Option 1: Using the Authorization Script (Recommended)**

This is the quickest method using a command-line script.

#### Step 1: Navigate to Backend
```bash
cd finalyear-backend
```

#### Step 2: Run Authorization Script
```bash
node authorize-calendar.js
```

#### Step 3: Follow the Prompts
1. The script will display a Google authorization URL
2. **Copy the URL** and open it in your browser
3. **Sign in** to your Google account
4. **Grant permissions** when prompted
5. You'll see an authorization code in the browser
6. **Copy the code** and paste it into the terminal
7. Press Enter

#### Step 4: Verify Success
You should see:
```
✅ Authorization successful!
📁 Token saved to: src/config/calendar_token.json
🎉 Your application now has access to Google Calendar!
```

#### Step 5: Restart Backend
```bash
# Stop current server (Ctrl+C if running)
npm start
```

---

### 🌐 **Option 2: Using the Web Interface**

This method uses browser-based authorization through your application.

#### Step 1: Ensure Backend is Running
```bash
cd finalyear-backend
npm start
```

#### Step 2: Get Authorization URL
Open your browser and visit:
```
http://localhost:5001/api/google/calendar/authorize
```

You'll get a JSON response with an `authUrl`:
```json
{
  "success": true,
  "authUrl": "https://accounts.google.com/o/oauth2/auth?...",
  "message": "Please visit this URL to authorize Google Calendar access"
}
```

#### Step 3: Visit Authorization URL
1. **Copy the `authUrl`** from the response
2. **Paste it** into your browser's address bar
3. **Sign in** to your Google account
4. **Grant permissions** for Calendar access

#### Step 4: Automatic Callback
- After granting permissions, Google will redirect you back to your application
- You'll see a success page confirming authorization
- The token is automatically saved

#### Step 5: Verify Authorization
Check the status:
```
http://localhost:5001/api/google/calendar/status
```

Expected response:
```json
{
  "success": true,
  "authorized": true,
  "message": "Calendar is authorized"
}
```

---

## Verification Steps

### 1. Check Token File
Verify the token file exists:
```bash
# Windows
dir finalyear-backend\src\config\calendar_token.json

# Linux/Mac
ls -la finalyear-backend/src/config/calendar_token.json
```

### 2. Test Calendar API
Open your PM Dashboard in the browser and check the Calendar Widget:
- It should display "Loading calendar..." initially
- Then show your upcoming Google Calendar events
- The "Schedule" button should work

### 3. Backend Console
Check your backend terminal for:
```
✅ Calendar service initialized
```

---

## Troubleshooting

### ❌ "Failed to load calendar events"

**Cause:** Token not found or invalid

**Solution:**
1. Re-run the authorization process
2. Make sure `calendar_token.json` exists in `src/config/`
3. Restart the backend server

---

### ❌ "Calendar integration requires Google Calendar authorization"

**Cause:** No authorization token available

**Solution:**
- Follow Option 1 or Option 2 above to authorize

---

### ❌ "Error: redirect_uri_mismatch"

**Cause:** OAuth redirect URI not configured in Google Cloud Console

**Solution:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Add these to **Authorized redirect URIs**:
   - `http://localhost:5001/api/google/calendar/callback`
   - `http://localhost:5001`
5. Save changes and try again

---

### ❌ "Calendar API has not been used"

**Cause:** Google Calendar API not enabled

**Solution:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Library**
3. Search for "Google Calendar API"
4. Click **Enable**
5. Wait a few minutes and try again

---

### ❌ Token expired or refresh failed

**Cause:** Access token expired and refresh token not working

**Solution:**
1. Delete the old token:
   ```bash
   # Windows
   del finalyear-backend\src\config\calendar_token.json
   
   # Linux/Mac
   rm finalyear-backend/src/config/calendar_token.json
   ```
2. Re-authorize using Option 1 or Option 2

---

## Revoking Authorization

If you need to revoke calendar access:

### Method 1: Via API
```
POST http://localhost:5001/api/google/calendar/revoke
```

### Method 2: Manually Delete Token
```bash
# Windows
del finalyear-backend\src\config\calendar_token.json

# Linux/Mac
rm finalyear-backend/src/config/calendar_token.json
```

### Method 3: Via Google Account
1. Go to https://myaccount.google.com/permissions
2. Find your application
3. Click "Remove Access"

---

## Google Cloud Console Setup (If Not Done)

If you haven't set up Google Calendar API yet:

### Step 1: Enable Calendar API
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: **civic-shell-471423-u1**
3. Go to **APIs & Services** → **Library**
4. Search for "Google Calendar API"
5. Click **Enable**

### Step 2: Configure OAuth Consent Screen
1. Go to **APIs & Services** → **OAuth consent screen**
2. Add scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
3. Save changes

### Step 3: Add Authorized Redirect URIs
1. Go to **APIs & Services** → **Credentials**
2. Click your OAuth 2.0 Client ID
3. Under **Authorized redirect URIs**, add:
   - `http://localhost:5001/api/google/calendar/callback`
   - `http://localhost:5001`
4. Click **Save**

---

## Testing the Integration

### 1. Create a Test Event
Use your Google Calendar to create a test event for today or tomorrow.

### 2. Refresh PM Dashboard
Open the Project Manager Dashboard and the Calendar Widget should display:
- Your upcoming events
- Color-coded by type (alerts, reports, milestones)
- Smart time formatting ("Today", "Tomorrow", etc.)

### 3. Schedule a Weekly Report
1. Click the **Schedule** button in the Calendar Widget
2. Select "Weekly Performance Report"
3. Check your Google Calendar - a recurring Monday 9 AM event should appear

---

## Calendar Features

Once authorized, you can:

✅ **View upcoming events** (next 7 days)  
✅ **Schedule weekly performance reports** (recurring every Monday)  
✅ **Create milestone events** (project milestones)  
✅ **Set SLA alerts** (task deadline warnings)  
✅ **Create custom events** (meetings, reminders)  
✅ **Auto-refresh** events manually  

---

## Security Notes

🔒 **Token Storage:**  
- Tokens are stored locally in `calendar_token.json`
- This file should NOT be committed to Git
- Add to `.gitignore` if not already present

🔒 **Access Scope:**  
- Limited to Calendar API only
- Cannot access other Google services
- Can be revoked at any time

🔒 **Token Expiration:**  
- Access tokens expire after 1 hour
- Refresh tokens are used to get new access tokens automatically
- If refresh fails, re-authorization is required

---

## Quick Reference

### Check Authorization Status
```bash
curl http://localhost:5001/api/google/calendar/status
```

### Get Authorization URL
```bash
curl http://localhost:5001/api/google/calendar/authorize
```

### Revoke Authorization
```bash
curl -X POST http://localhost:5001/api/google/calendar/revoke
```

### Test Calendar Events
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:5001/api/calendar/upcoming?days=7
```

---

## Support

If you encounter issues:

1. Check the backend console for error messages
2. Verify `oauth_credentials.json` exists and is valid
3. Ensure Google Calendar API is enabled in Google Cloud Console
4. Check that redirect URIs match in Google Cloud Console
5. Try deleting `calendar_token.json` and re-authorizing

---

## Success Checklist

- [ ] Google Calendar API enabled in Google Cloud Console
- [ ] OAuth redirect URIs configured correctly
- [ ] Authorization completed (using Option 1 or 2)
- [ ] `calendar_token.json` file created
- [ ] Backend server restarted
- [ ] Calendar Widget displays events without errors
- [ ] Can schedule weekly reports successfully

---

**Last Updated:** November 2025  
**Contact:** Check backend logs for detailed error messages
