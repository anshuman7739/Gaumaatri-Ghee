# 📊 Review System - Data Flow Diagram

## How Reviews Flow Through the System

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER SUBMITS REVIEW                       │
│                                                                   │
│  1. Fills out review form on website                             │
│  2. Clicks "Submit Review" button                                │
│  3. Frontend validates data locally                              │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                  FRONTEND VALIDATION                             │
│  ✓ Name present (max 50 chars)                                   │
│  ✓ Location present (max 50 chars)                               │
│  ✓ Rating selected (1-5)                                         │
│  ✓ Review 10-500 characters                                      │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│  submitReview() → POST /api/submit-review                        │
│  ────────────────────────────────────────────────────────────────│
│  {                                                                │
│    "name": "Priya Sharma",                                        │
│    "location": "Delhi, NCR",                                      │
│    "rating": 5,                                                   │
│    "review": "The ghee is amazing!"                               │
│  }                                                                │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│              SERVER: /api/submit-review                          │
│  ────────────────────────────────────────────────────────────────│
│  Backend Validation:                                              │
│  ✓ All fields present                                             │
│  ✓ Rating 1-5                                                     │
│  ✓ Review 10-500 chars                                            │
│                                                                   │
│  Create Review Object:                                            │
│  {                                                                │
│    id: 1714320000000,        ← Unique ID                          │
│    name: "Priya Sharma",                                          │
│    location: "Delhi, NCR",                                        │
│    rating: 5,                                                     │
│    review: "The ghee is amazing!",                                │
│    date: "2026-04-28T10:30:00Z",                                  │
│    approved: false           ← Needs moderation                   │
│  }                                                                │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
        ┌──────────────────────────┐
        │   SAVE TO MEMORY         │
        │                          │
        │  const reviews = [];     │
        │  reviews.push(obj)       │
        │                          │
        │  ✓ Server RAM            │
        │  ✓ Lost on restart       │
        │  ✓ ~6 hours on Vercel    │
        └──────────────┬───────────┘
                       │
        ┌──────────────┴───────────┐
        │                          │
        ▼                          ▼
  ┌──────────────┐        ┌──────────────────┐
  │ PENDING      │        │ APPROVED         │
  │ REVIEWS      │        │ REVIEWS          │
  │              │        │                  │
  │ Waiting for  │        │ Displayed on     │
  │ approval     │        │ website          │
  │ (approved:   │        │ (approved: true) │
  │ false)       │        │                  │
  └──────────────┘        └──────────────────┘
        │                           │
        │                           ▼
        │                ┌─────────────────────┐
        │                │ GET /api/get-reviews│
        │                │                     │
        │                │ Sends 10 approved   │
        │                │ reviews to website  │
        │                └────────┬────────────┘
        │                         │
        │                         ▼
        │                  ┌──────────────────┐
        │                  │ Website displays │
        │                  │ review cards in  │
        │                  │ "Recently        │
        │                  │ Submitted        │
        │                  │ Reviews" section │
        │                  └──────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│ ADMIN MODERATION                     │
│                                      │
│ 1. Check pending reviews:            │
│    GET /api/pending-reviews          │
│                                      │
│ 2. Approve review:                   │
│    POST /api/approve-review          │
│    { reviewId: 1714320000000 }       │
│                                      │
│ 3. Mark as approved: true            │
└──────────────────┬───────────────────┘
                   │
                   ▼
        ┌─────────────────────────┐
        │ Review moves to         │
        │ APPROVED list           │
        │                         │
        │ Now shows in website    │
        │ on next GET request     │
        └─────────────────────────┘
```

---

## Data Storage Architecture

### **Current: In-Memory Array**
```
┌──────────────────────────────────────────┐
│         Server.js Process (Node)         │
│  ┌────────────────────────────────────┐  │
│  │  const reviews = [                 │  │
│  │    {id: 1, name: "...", ...},      │  │
│  │    {id: 2, name: "...", ...},      │  │
│  │  ]                                 │  │
│  │                                    │  │
│  │  Only exists while server runs     │  │
│  │  Lost on restart                   │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
          ▲                    │
          │                    ▼
    Vercel         ⚠️ Vercel redeploys
    redeploys      every ~6 hours
    server              = data loss
```

### **Future: Persistent Database**
```
┌──────────────────────────────────────────┐
│         Server.js Process (Node)         │
│  ┌────────────────────────────────────┐  │
│  │  db.collection('reviews').find()   │  │
│  │                                    │  │
│  │  Queries MongoDB / Google Sheets   │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
          ▲                    │
          │                    ▼
    ┌─────┴──────┐        ┌────────────────┐
    │            │        │                │
MongoDB or    Query        Save reviews    │
Google Sheets  ▲           permanently    │
    │          │                │         │
    └──────────┴────────────────┴─────────┘
         Persistent Storage
         (survives server restart)
```

---

## API Endpoints Map

```
┌─────────────────────────────────────────────────────────────┐
│                    REVIEW API ENDPOINTS                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  POST /api/submit-review                                    │
│  ├─ Input: {name, location, rating, review}                │
│  ├─ Validation: Backend check                              │
│  ├─ Action: Save to reviews array                          │
│  ├─ Moderation: approved = false (default)                 │
│  └─ Output: {success, message}                             │
│                                                              │
│  GET /api/get-reviews                                       │
│  ├─ Input: None                                             │
│  ├─ Filter: approved === true                              │
│  ├─ Sort: Newest first                                     │
│  ├─ Limit: 10 reviews max                                  │
│  └─ Output: {success, reviews: [...]}                      │
│                                                              │
│  GET /api/pending-reviews                                   │
│  ├─ Input: None                                             │
│  ├─ Filter: approved === false                             │
│  ├─ Action: Show all unapproved                            │
│  └─ Output: {success, count, reviews: [...]}               │
│                                                              │
│  POST /api/approve-review                                   │
│  ├─ Input: {reviewId}                                       │
│  ├─ Action: Set approved = true                            │
│  ├─ Find: By ID in reviews array                           │
│  └─ Output: {success, message}                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Review Lifecycle

```
Step 1: SUBMISSION
   Customer submits review
   ↓
   Created with approved: false
   Saved to reviews array
   ↓

Step 2: PENDING
   Review in pending list
   Visible in /api/pending-reviews
   NOT visible to customers
   ↓

Step 3: ADMIN APPROVAL
   Admin calls /api/approve-review
   Review marked approved: true
   ↓

Step 4: PUBLISHED
   Review in /api/get-reviews
   Displayed on website
   Visible to all customers
   ↓

Step 5: PERSISTENCE
   ⚠️ Currently: Lost if server restarts
   ✓ Future: Saved to database/sheets
```

---

## Sample Review Storage

```javascript
// Reviews array in server memory (Line 133 of server.js)

const reviews = [
  {
    id: 1714320000000,
    name: "Priya Sharma",
    location: "Delhi, NCR",
    rating: 5,
    review: "The ghee smells exactly like what my grandmother used to make...",
    date: "2026-04-28T10:30:00Z",
    approved: false  // Waiting for admin approval
  },
  {
    id: 1714320123456,
    name: "Rahul Mehta",
    location: "Mumbai, Maharashtra", 
    rating: 5,
    review: "My doctor recommended A2 ghee for my digestion issues...",
    date: "2026-04-27T14:15:00Z",
    approved: true   // Already approved, shows on website
  }
];
```

---

## Key Insights

🔴 **Current Limitation:** In-memory storage
- ✓ Fast performance
- ✓ Works for local testing
- ✗ Lost on server restart
- ✗ Not suitable for production

🟢 **Solution:** Implement persistent storage
- Connect to Google Sheets (recommended for Vercel)
- Or use MongoDB / Firebase / SQL database
- Reviews survive server restarts
- Scalable for thousands of reviews

---

**Status:** Ready for testing! Reviews save to memory array and can be approved via API.
