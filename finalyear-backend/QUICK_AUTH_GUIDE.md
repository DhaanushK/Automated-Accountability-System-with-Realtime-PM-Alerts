# Quick Calendar Authorization Guide

## The Issue
You're getting **Error 400: redirect_uri_mismatch** because Google Cloud Console doesn't have the correct redirect URIs configured.

## ✅ EASY FIX - Use the Web Authorization Tool

### Step 1: Make Sure Backend is Running
```bash
cd finalyear-backend
npm start
```

### Step 2: Open the Authorization Page
Open this URL in your browser:
```
http://localhost:5001/calendar-authorize.html
```

### Step 3: Click "Get Authorization URL"
The page will fetch the authorization URL from your backend.

### Step 4: Click "Authorize Google Calendar"
This will open Google's authorization page. Sign in and grant permissions.

### Step 5: Done!
After granting permissions, you'll be redirected back with a success message.

---

## 🔧 Alternative: Fix Google Cloud Console

If you prefer to use the command-line script, add these redirect URIs to Google Cloud Console:

1. Go to: https://console.cloud.google.com/apis/credentials?project=civic-shell-471423-u1
2. Click on your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", add:
   - `http://localhost:5001`
   - `http://localhost:5001/api/google/calendar/callback`
4. Save and wait 1-2 minutes

Then run:
```bash
node authorize-calendar.js
```

---

## Verification

After authorization, verify it worked:

1. **Check Token File:**
   ```bash
   dir src\config\calendar_token.json
   ```
   
2. **Check API Status:**
   Open: http://localhost:5001/api/google/calendar/status
   
3. **Test Calendar Widget:**
   - Open your PM Dashboard
   - Calendar Widget should show events (no error)

---

## Current Status

✅ Backend routes created  
✅ Authorization HTML page created  
✅ Calendar service ready  
⏳ **Waiting for you to authorize**  

**Next:** Open http://localhost:5001/calendar-authorize.html
