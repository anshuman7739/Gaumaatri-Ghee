# 📋 Review System - Quick Reference

## ✅ What's Integrated

| Component | Status | Location |
|-----------|--------|----------|
| Review Form (HTML) | ✅ Complete | `index.html` - #submit-review section |
| Form Validation (Frontend) | ✅ Complete | JavaScript in index.html |
| Review Display | ✅ Complete | Website - below form |
| API Endpoints | ✅ 4 endpoints | server.js |
| Local Storage | ✅ In-Memory | reviews array |
| Google Sheets | ✅ INTEGRATED | Persistent storage |
| Admin Moderation | ✅ Complete | /api/pending-reviews + /api/approve-review |

---

## 🚀 API Endpoints (All With Sheets Support)

### **1. Submit Review**
```
POST /api/submit-review
Body: { name, location, rating, review }
✓ Saves to local memory
✓ Saves to Google Sheets
```

### **2. Get Approved Reviews**
```
GET /api/get-reviews
✓ Fetches from Google Sheets (primary)
✓ Falls back to local if Sheets down
✓ Returns up to 10 reviews
```

### **3. Pending Reviews (Admin)**
```
GET /api/pending-reviews
✓ Shows unapproved reviews
✓ Fetches from Sheets or local
```

### **4. Approve Review (Admin)**
```
POST /api/approve-review
Body: { reviewId }
✓ Updates local memory
✓ Updates Google Sheets
```

---

## 📊 Data Storage Architecture

```
Dual Storage:
├─ Local Memory (Fast, Temporary)
│  └─ reviews array in server.js
│     └─ Lost on restart
│
└─ Google Sheets (Persistent, Permanent)
   └─ All reviews saved here
   └─ Survives restart
   └─ Can manually moderate
   └─ Analytics available
```

---

## 🔄 Review Lifecycle

```
SUBMIT REVIEW
    ↓
├─ Validate
│  ├─ Name: required, max 50
│  ├─ Location: required, max 50
│  ├─ Rating: 1-5 required
│  └─ Review: 10-500 chars required
    ↓
├─ Save
│  ├─ Local memory (instant)
│  └─ Google Sheets (API call)
    ↓
├─ PENDING STATUS
│  └─ approved: false
│  └─ Visible in /api/pending-reviews
│  └─ NOT visible to customers
    ↓
ADMIN REVIEWS & APPROVES
    ↓
├─ Update
│  ├─ Local memory
│  └─ Google Sheets
    ↓
├─ APPROVED STATUS
│  └─ approved: true
│  └─ Visible in /api/get-reviews
│  └─ Shows on website
    ↓
CUSTOMER SEES REVIEW
```

---

## 🔑 Environment Variables

Set these for Google Sheets:

```env
SHEETS_API_URL=https://script.google.com/macros/s/AKfycbzu7MvB-cE1oJ517NYxMyIxp7RaLfybK1rfTPutB_YBdgnbKIfL90xqLxdIQLCqaumpVg/exec
SHEETS_API_TOKEN=GAUMAATRI_SECRET_2026
```

---

## 📱 Frontend (Website)

### **Review Form Fields**
- ✅ Name (input, max 50)
- ✅ Location (input, max 50)
- ✅ Rating (5 clickable stars)
- ✅ Review (textarea, 10-500 chars, counter)
- ✅ Submit button (with loading state)

### **Review Display**
- ✅ Card grid layout
- ✅ Shows name, location, stars, review
- ✅ Auto-loads on page scroll
- ✅ Displays up to 10 reviews
- ✅ Newest first

---

## 🧪 Testing

### **Test Submit**
```bash
curl -X POST http://localhost:3000/api/submit-review \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test",
    "location": "Test City",
    "rating": 5,
    "review": "This is a comprehensive test review here"
  }'
```

### **Test Get Reviews**
```bash
curl http://localhost:3000/api/get-reviews | python3 -m json.tool
```

### **Test Pending**
```bash
curl http://localhost:3000/api/pending-reviews | python3 -m json.tool
```

### **Test Approve**
```bash
curl -X POST http://localhost:3000/api/approve-review \
  -H "Content-Type: application/json" \
  -d '{"reviewId": 1714320000000}'
```

---

## 📄 Files Modified

| File | Changes |
|------|---------|
| index.html | + 200 lines: form + display + JS functions |
| server.js | + review endpoints with Sheets integration |
| GOOGLE_SHEETS_INTEGRATION.md | NEW: Complete integration guide |
| REVIEW_SYSTEM_SUMMARY.md | NEW: System overview |
| REVIEW_SYSTEM_GUIDE.md | NEW: Setup and usage |
| REVIEW_STORAGE_DIAGRAM.md | NEW: Data flow diagrams |

---

## 🚀 Deployment

### **Local Testing**
```bash
node server.js
# Visit http://localhost:3000
# Test review submission
```

### **Push to Production**
```bash
git push
# Vercel auto-deploys
# Reviews sync with Google Sheets
```

### **Verify Live**
```bash
curl https://gaumaatri.co.in/api/get-reviews
```

---

## ✨ Key Features

✅ Form validation (frontend + backend)
✅ 5-star interactive rating
✅ Character counter (10-500 chars)
✅ Loading states
✅ Success/error notifications
✅ Moderation workflow
✅ Google Sheets persistence
✅ Fallback to local storage
✅ Auto-load reviews on scroll
✅ Beautiful responsive design
✅ Admin approval system
✅ Dual storage redundancy

---

## ⚙️ Configuration

### **Sheets Integration (server.js, lines 47-58)**
```javascript
const DEFAULT_SHEETS_API_URL = 'https://script.google.com/...';
const DEFAULT_SHEETS_API_TOKEN = 'GAUMAATRI_SECRET_2026';

const sheetsConfig = {
  url: SHEETS_API_URL || DEFAULT_SHEETS_API_URL,
  token: SHEETS_API_TOKEN || DEFAULT_SHEETS_API_TOKEN,
};
```

### **Review Array (server.js, line 133)**
```javascript
const reviews = [];  // In-memory storage
```

---

## 🔍 Monitoring

### **Check Logs**
```bash
# Server logs show Sheets syncs
✅ Review received and saved locally
✅ Review also saved to Google Sheets
✅ Loaded reviews from Google Sheets: 12
```

### **Verify Data**
1. Check local: `curl localhost:3000/api/pending-reviews`
2. Check Sheets: Open spreadsheet directly
3. Compare counts

---

## 📞 Support

**Issues with Sheets?**
- Check API URL is correct
- Check token is valid
- Verify Google Apps Script is deployed
- Check network connectivity

**Data Lost?**
- Check Google Sheets backup
- Local memory is temporary
- Sheets has permanent copy

---

## 🎯 Next Steps

1. ✅ Verify Google Sheets connection
2. ✅ Test review submission
3. ✅ Test approval workflow
4. ✅ Check data in Sheets
5. ✅ Deploy to production
6. ✅ Monitor Sheets syncs

---

**Status:** 🟢 READY FOR PRODUCTION
**Last Updated:** April 28, 2026
**Reviews Saved:** Locally + Google Sheets
**Live URL:** https://gaumaatri.co.in
