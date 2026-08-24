# Email Tracking Fix Documentation

## Problem Description
Urgent alerts and other emails sent from the Project Manager's dashboard were being delivered to Gmail successfully, but were not appearing in the application's email interface (inbox/outbox).

## Root Cause
The `EmailLog` documents were storing `sender.email` as the SMTP email address (`process.env.EMAIL_USER`) instead of the actual Project Manager's email address. This caused the outbox query `{'sender.email': pmEmail}` to return no results, making sent emails invisible in the PM's mailbox.

## Solution
Updated all Project Manager email routes and services to:
1. Fetch the authenticated user's details from the database
2. Pass the actual sender information to email services
3. Store the real user email in EmailLog documents
4. Preserve SMTP email in metadata for debugging

## Files Modified

### 1. `finalyear-backend/src/routes/projectManagerEmailRoutes.js`
**Updated Routes:**
- `POST /send-urgent-alert` (Line 182-210)
- `POST /send-team-report` (Line 75-91)
- `POST /send-individual-feedback` (Line 133-148)
- `POST /send-metrics-reminder` (Line 248-260)

**Changes Applied:**
```javascript
// Before each email send, fetch sender details
const senderUser = await User.findById(req.user.id).select('email name');

// Pass to both services
await nodemailerService.sendEmailType(data, senderUser);
await smtpEmailService.sendEmailType(data, senderUser);
```

### 2. `finalyear-backend/src/services/nodemailerService.js`
**Updated Methods:**
- `sendUrgentAlert()` - Line 14
- `sendTeamPerformanceReport()` - Line 49
- `sendIndividualFeedback()` - Line 119
- `sendMetricsReminder()` - Line 191

**Changes Applied:**
```javascript
// Method signature updated
async sendEmailType(data, senderUser = null) {
    // ...
    const emailLog = new EmailLog({
        sender: {
            email: senderUser?.email || process.env.EMAIL_USER,
            name: senderUser?.name || 'Team Performance Dashboard'
        },
        metadata: {
            smtpEmail: process.env.EMAIL_USER // Preserve SMTP email
        }
        // ...
    });
}
```

### 3. `finalyear-backend/src/services/smtpEmailService.js`
**Updated Methods:**
- `sendUrgentAlert()` - Line 101
- `sendTeamPerformanceReport()` - Line 39
- `sendIndividualFeedback()` - Line 75
- `sendMetricsReminder()` - Line 144

**Changes Applied:**
```javascript
// Method signatures updated to accept senderUser parameter for consistency
async sendEmailType(data, senderUser = null) {
    // No internal changes needed as this service doesn't create EmailLog entries
}
```

## Expected Behavior After Fix

### Before Fix:
- ❌ Email sent successfully to Gmail
- ❌ Not visible in PM's "Sent" mailbox
- ❌ EmailLog.sender.email = "noreply@domain.com" (SMTP email)
- ❌ Query `{'sender.email': pmEmail}` returns empty

### After Fix:
- ✅ Email sent successfully to Gmail
- ✅ Visible in PM's "Sent" mailbox
- ✅ EmailLog.sender.email = "pm@company.com" (actual PM email)
- ✅ Query `{'sender.email': pmEmail}` returns sent emails
- ✅ SMTP email preserved in metadata.smtpEmail for reference

## Testing Instructions

### 1. Test Urgent Alert
```
1. Log in as Project Manager
2. Navigate to Email Dashboard
3. Click "Compose" → "Send Urgent Alert"
4. Fill in subject and message
5. Send alert to all team members
6. Check "Sent" tab - alert should now appear
7. Verify team members receive email in Gmail AND app inbox
```

### 2. Test Team Performance Report
```
1. Send team performance report from PM dashboard
2. Check "Sent" tab - report should appear
3. Verify team members receive report
```

### 3. Test Individual Feedback
```
1. Send individual feedback to a team member
2. Check "Sent" tab - feedback should appear
3. Verify recipient receives feedback
```

### 4. Test Metrics Reminder
```
1. Send metrics reminder
2. Check "Sent" tab - reminder should appear
3. Verify recipients receive reminder
```

## Database Changes
All new EmailLog documents will have:
```javascript
{
    sender: {
        email: "actual.pm@company.com",  // Real PM email
        name: "John Doe"                 // Real PM name
    },
    metadata: {
        smtpEmail: "noreply@domain.com"  // SMTP email preserved
    }
    // ... other fields
}
```

## Backward Compatibility
- Old EmailLog documents (with SMTP sender) remain unchanged
- New emails use correct sender information
- No migration needed for existing data
- Query logic unchanged - works with both old and new format

## Technical Details
- **Authentication**: Uses `req.user.id` from JWT auth middleware
- **Database Query**: `User.findById(req.user.id).select('email name')`
- **Fallback Logic**: `senderUser?.email || process.env.EMAIL_USER`
- **Services Updated**: Both nodemailerService and smtpEmailService
- **Routes Updated**: All 4 PM email routes

## Verification
Run these commands to verify the fix:
```bash
# Check for syntax errors
node finalyear-backend/src/routes/projectManagerEmailRoutes.js

# Start backend server
cd finalyear-backend
npm start

# Monitor email sending
# Look for log messages showing actual PM email instead of SMTP email
```

## Future Improvements
1. Consider migrating old EmailLog documents to use actual sender emails
2. Add email analytics showing sent/received counts
3. Implement email search/filter in mailbox
4. Add email status tracking (delivered/read/failed)

---
**Fix Applied**: December 2024  
**Affected Email Types**: Urgent Alerts, Team Reports, Individual Feedback, Metrics Reminders  
**Status**: ✅ Complete - Ready for Testing
