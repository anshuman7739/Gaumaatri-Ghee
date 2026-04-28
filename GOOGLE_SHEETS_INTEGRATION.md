# 🔗 Review System - Google Sheets Integration Guide

## Overview

The review system is now fully integrated with **Google Sheets**. Reviews are automatically saved to your Google Sheets spreadsheet for:
- ✅ Permanent storage (survives server restarts)
- ✅ Admin moderation (approve/reject reviews)
- ✅ Data analytics and reporting
- ✅ Backup and recovery

---

## How It Works

### **Review Submission Flow**

```
Customer submits review
        ↓
Frontend validates
        ↓
POST /api/submit-review
        ↓
    ┌───┴───┐
    ↓       ↓
  Local  Google
  Memory Sheets
  Array  ✓
    ↓       ↓
  Keep in  Save to
  memory   spreadsheet
           (persistent)
```

### **Data Storage**

**Dual Storage (Redundancy):**
- **Local (In-Memory):** Fast access, temporary
- **Google Sheets:** Permanent, backed up

**Benefits:**
- Reviews survive server restarts
- Can view reviews in Google Sheets directly
- Easy manual moderation in Sheets
- Data backup and analytics

---

## Google Sheets Configuration

### **Current Setup**

Your system uses:
- **API URL:** `https://script.google.com/macros/s/AKfycbzu7MvB-cE1oJ517NYxMyIxp7RaLfybK1rfTPutB_YBdgnbKIfL90xqLxdIQLCqaumpVg/exec`
- **Token:** `GAUMAATRI_SECRET_2026`

These are defined in:
- File: `server.js` - Lines 47-48
- Backup: Environment variables `SHEETS_API_URL` and `SHEETS_API_TOKEN`

### **API Format**

The Google Sheets API receives these actions:

**1. Submit Review**
```json
{
  "action": "submitReview",
  "reviewId": 1714320000000,
  "name": "Priya Sharma",
  "location": "Delhi, NCR",
  "rating": 5,
  "review": "The ghee is amazing...",
  "date": "2026-04-28T10:30:00Z",
  "approved": "No",
  "token": "GAUMAATRI_SECRET_2026"
}
```

**2. Get Reviews**
```json
{
  "action": "getReviews",
  "token": "GAUMAATRI_SECRET_2026"
}
```

**3. Approve Review**
```json
{
  "action": "approveReview",
  "reviewId": 1714320000000,
  "token": "GAUMAATRI_SECRET_2026"
}
```

---

## Review API Endpoints (With Sheets Integration)

### **1. POST /api/submit-review**

**Saves review to both local memory AND Google Sheets**

**Request:**
```bash
curl -X POST http://localhost:3000/api/submit-review \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Priya Sharma",
    "location": "Delhi, NCR",
    "rating": 5,
    "review": "The ghee is exactly like my grandmother used to make..."
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Review submitted! Thank you for your feedback. It will appear after approval.",
  "sheetsSaved": true,
  "sheetsError": null
}
```

**What Happens:**
1. ✓ Validates all fields
2. ✓ Saves to `reviews` array (local memory)
3. ✓ Attempts to save to Google Sheets
4. ✓ Returns status of both saves
5. ✓ Default: `approved: false` (needs moderation)

---

### **2. GET /api/get-reviews**

**Fetches approved reviews from Google Sheets (fallback to local)**

**Request:**
```bash
curl http://localhost:3000/api/get-reviews
```

**Response:**
```json
{
  "success": true,
  "reviews": [
    {
      "name": "Priya Sharma",
      "location": "Delhi, NCR",
      "rating": 5,
      "review": "The ghee is exactly like my grandmother used to make...",
      "date": "2026-04-28T10:30:00Z",
      "approved": true
    },
    // ... more reviews
  ],
  "source": "google-sheets"
}
```

**Features:**
- Tries Google Sheets first
- Falls back to local memory if Sheets unavailable
- Returns up to 10 approved reviews
- Sorts by newest first
- Shows data source (google-sheets or local)

---

### **3. GET /api/pending-reviews**

**View all unapproved reviews (from Sheets or local)**

**Request:**
```bash
curl http://localhost:3000/api/pending-reviews
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "reviews": [
    {
      "id": 1714320000000,
      "name": "New Customer",
      "location": "Mumbai",
      "rating": 4,
      "review": "Great product!",
      "date": "2026-04-28T11:20:00Z",
      "approved": false
    }
  ],
  "source": "google-sheets"
}
```

---

### **4. POST /api/approve-review**

**Approve a review (updates local AND Google Sheets)**

**Request:**
```bash
curl -X POST http://localhost:3000/api/approve-review \
  -H "Content-Type: application/json" \
  -d '{"reviewId": 1714320000000}'
```

**Response:**
```json
{
  "success": true,
  "message": "Review approved successfully",
  "sheetsSaved": true,
  "sheetsError": null
}
```

**What Happens:**
1. ✓ Finds review by ID
2. ✓ Marks as `approved: true` locally
3. ✓ Updates Google Sheets
4. ✓ Review now appears in `/api/get-reviews`

---

## Google Sheets Spreadsheet Structure

Your Google Sheet should have columns:

| Column | Type | Example |
|--------|------|---------|
| Review ID | Number | 1714320000000 |
| Name | Text | Priya Sharma |
| Location | Text | Delhi, NCR |
| Rating | Number | 5 |
| Review | Text | The ghee is amazing... |
| Date | Date | 2026-04-28 |
| Approved | Yes/No | No |
| Submitted At | Timestamp | 2026-04-28T10:30:00Z |

---

## Moderation Workflow

### **Admin Process:**

**Step 1: View Pending Reviews**
```bash
curl http://localhost:3000/api/pending-reviews
```

**Step 2: Review Submitted Review** (Check content in response or Google Sheet)

**Step 3: Approve Review**
```bash
curl -X POST http://localhost:3000/api/approve-review \
  -H "Content-Type: application/json" \
  -d '{"reviewId": 1714320000000}'
```

**Step 4: Verify in Google Sheets**
- Check review is marked "Yes" in Approved column

**Step 5: Website Update**
- Review appears in 10 minutes (or immediately on next `GET /api/get-reviews`)

### **Alternative: Direct Moderation in Google Sheets**

You can also:
1. Open your Google Sheet
2. Find pending review (Approved = "No")
3. Change to "Yes"
4. It will appear on website on next page refresh

---

## Server Logging

When integrated, you'll see logs like:

```
✅ Review received and saved locally: {...}
✅ Review also saved to Google Sheets
✅ Loaded reviews from Google Sheets: 12
✅ Review approved locally: 1714320000000
✅ Review approval also saved to Google Sheets
```

### **Troubleshooting Logs**

If integration fails:

```
⚠️ Failed to save review to Sheets: Authentication failed
✓ Using local reviews: 5
⚠️ Failed to update Sheets: Invalid token
✓ Review still approved locally
```

---

## Fallback Behavior

**If Google Sheets is unavailable:**

✓ Reviews still save to local memory
✓ Website continues to work
✓ Use local in-memory data temporarily
⚠️ Data lost on server restart
✓ Automatically syncs when Sheets comes back online

**Example Response When Sheets Down:**
```json
{
  "success": true,
  "message": "Review submitted!",
  "sheetsSaved": false,
  "sheetsError": "Authentication failed"
}
```

---

## Environment Variables

Set these to customize Sheets integration:

**In `.env` file:**
```env
SHEETS_API_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
SHEETS_API_TOKEN=YOUR_SECRET_TOKEN
```

**Or Docker/Vercel:**
```bash
SHEETS_API_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
SHEETS_API_TOKEN=YOUR_SECRET_TOKEN
```

---

## Testing Integration

### **Test 1: Submit Review**
```bash
curl -X POST http://localhost:3000/api/submit-review \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "location": "Test City",
    "rating": 5,
    "review": "This is a comprehensive test review to verify Google Sheets integration"
  }'
```

**Expected:**
```json
{
  "success": true,
  "sheetsSaved": true
}
```

### **Test 2: Check Sheets**
1. Open your Google Sheet (link from API URL)
2. Verify review appears in new row
3. Check Approved = "No"

### **Test 3: Get Pending**
```bash
curl http://localhost:3000/api/pending-reviews
```

**Expected:** Your test review appears

### **Test 4: Approve Review**
```bash
curl -X POST http://localhost:3000/api/approve-review \
  -H "Content-Type: application/json" \
  -d '{"reviewId": 1714320000000}'
```

### **Test 5: Verify in Sheets**
1. Refresh Google Sheet
2. Approved should now = "Yes"

### **Test 6: Get Published Reviews**
```bash
curl http://localhost:3000/api/get-reviews
```

**Expected:** Approved review appears

---

## Data Flow Diagram

```
┌─────────────────────────────────┐
│  Customer Submits Review        │
└────────────────┬────────────────┘
                 ↓
    ┌────────────────────────┐
    │ POST /api/submit-review│
    └────────────┬───────────┘
                 ↓
        ┌────────┴────────┐
        ↓                 ↓
   Local Memory      Google Sheets
   reviews[] ↓        API POST ↓
    Stored         "submitReview"
    ↓
   {id, name,     → {action, token,
    location,       reviewId, name,
    rating,         location, rating,
    review,         review, date,
    date,           approved}
    approved}       ↓
                "Review added to
                 spreadsheet"

Next: Customer visits website
                ↓
    GET /api/get-reviews
                ↓
        ┌────────────────────┐
        │ Sheets API GET     │
        │ "getReviews"       │
        └────────┬───────────┘
                 ↓
         Returns approved reviews
                 ↓
         Display on website
```

---

## Monitoring

### **Check Sheets Status**

```bash
curl http://localhost:3000/api/health
```

Sheets status is part of overall health check.

### **Monitor Logs**

```bash
# Watch server logs for Sheets integration
tail -f server.log | grep "Sheets"
```

### **Verify Data Consistency**

1. Check local in-memory count: `GET /api/pending-reviews` (count field)
2. Check Sheets row count manually
3. Should match (approximately)

---

## Next Steps

1. ✅ **Integration Complete** - Review system now saves to Google Sheets
2. 🔄 **Test Locally** - Submit a review and check Sheets
3. 📊 **Verify Data** - Confirm review appears in spreadsheet
4. 🚀 **Deploy** - Push to Vercel/production
5. ⚙️ **Monitor** - Watch logs for any sync issues
6. 📈 **Analyze** - Use Google Sheets for analytics

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Reviews save locally but not to Sheets | Check API URL and token in server.js |
| Sheets integration fails | Verify Google Apps Script is deployed and accessible |
| Reviews don't appear after approval | Refresh page, check Sheets Approved = "Yes" |
| Server says Sheets disabled | Set SHEETS_API_URL and SHEETS_API_TOKEN env vars |

---

**Status:** ✅ COMPLETE - Google Sheets integration ready for production!
