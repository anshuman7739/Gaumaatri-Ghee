# 📝 Gaumaatri Ghee - Review System Guide

## Overview
The review system allows customers to submit reviews on the website, which are stored and displayed with a moderation workflow.

---

## Where Reviews Are Saved

### **Current Storage: In-Memory Array (Server)**
- **Location:** `server.js` - Line 133
- **Array Name:** `const reviews = [];`
- **How It Works:**
  - When a review is submitted via `/api/submit-review`, it's added to this array
  - Reviews are stored as JavaScript objects with: `id`, `name`, `location`, `rating`, `review`, `date`, `approved` fields
  - Reviews persist as long as the server is running
  - **WARNING:** Reviews are lost when the server restarts

### **Example Review Object:**
```javascript
{
  id: 1714320000000,                    // Timestamp ID for unique identification
  name: "Priya Sharma",
  location: "Delhi, NCR",
  rating: 5,
  review: "The ghee smells exactly like what my grandmother used to make...",
  date: "2026-04-28T10:30:00.000Z",    // ISO timestamp
  approved: false                        // Default to false (needs moderation)
}
```

---

## API Endpoints

### **1. Submit a Review** 
**Endpoint:** `POST /api/submit-review`

**Request Body:**
```json
{
  "name": "Customer Name",
  "location": "City, State",
  "rating": 5,
  "review": "Your detailed review text here..."
}
```

**Validation Rules:**
- `name` - Required, max 50 characters
- `location` - Required, max 50 characters
- `rating` - Required, must be 1-5
- `review` - Required, 10-500 characters

**Response (Success):**
```json
{
  "success": true,
  "message": "Review submitted! Thank you for your feedback. It will appear after approval."
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Rating must be 1-5"
}
```

---

### **2. Get Approved Reviews**
**Endpoint:** `GET /api/get-reviews`

**Request:** No parameters needed

**Response:**
```json
{
  "success": true,
  "reviews": [
    {
      "name": "Priya Sharma",
      "location": "Delhi, NCR",
      "rating": 5,
      "review": "The ghee smells exactly like what my grandmother used to make...",
      "date": "2026-04-25",
      "approved": true
    },
    // ... more reviews
  ]
}
```

**Features:**
- Returns up to 10 approved reviews
- Combines sample reviews + user-submitted approved reviews
- Sorted by newest first
- Only shows reviews with `approved: true`

---

### **3. Get Pending Reviews (Moderation)**
**Endpoint:** `GET /api/pending-reviews`

**Request:** No parameters needed

**Response:**
```json
{
  "success": true,
  "count": 3,
  "reviews": [
    {
      "id": 1714320000000,
      "name": "New Customer",
      "location": "Mumbai, Maharashtra",
      "rating": 4,
      "review": "Great product, fast delivery!",
      "date": "2026-04-28T11:20:00.000Z",
      "approved": false
    }
  ]
}
```

---

### **4. Approve a Review**
**Endpoint:** `POST /api/approve-review`

**Request Body:**
```json
{
  "reviewId": 1714320000000
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Review approved successfully"
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Review not found"
}
```

---

## Workflow

### **Customer Journey:**
1. Customer fills out review form on website
2. Click "Submit Review →"
3. Frontend validates form locally
4. Frontend sends data to `/api/submit-review`
5. Backend validates and saves to `reviews` array
6. Response message: "Review submitted! Thank you for your feedback. It will appear after approval."
7. Review appears in "Recently Submitted Reviews" section once approved

### **Moderation Process:**
1. Admin checks `/api/pending-reviews` to see unapproved reviews
2. Admin calls `/api/approve-review` with `reviewId` 
3. Review is marked `approved: true`
4. Review now appears in `/api/get-reviews` 
5. Review displays on website in "Recently Submitted Reviews" section

---

## Frontend Implementation

### **Review Form** (index.html)
- Located in `#submit-review` section
- Fields: Name, Location, Rating (star selector), Review textarea
- Auto-loads reviews on page scroll

### **JavaScript Functions:**
- `submitReview(event)` - Handles form submission, calls `/api/submit-review`
- `loadReviews()` - Fetches reviews from `/api/get-reviews`, displays cards
- `updateStarDisplay()` - Interactive 5-star rating selector
- Character counter for review field

---

## Future Enhancements

### **To Make Reviews Persistent (Production):**

**Option 1: Google Sheets (Recommended)**
- Store reviews in Google Sheets like orders
- Modify `/api/submit-review` to call `sheetsPost()` 
- Modify `/api/get-reviews` to fetch from sheets instead of array
- Add admin approval interface in Google Sheets

**Option 2: Database**
- Use MongoDB, Firebase, or SQL database
- Add database integration to submit and fetch endpoints

**Option 3: File Storage**
- Save reviews to JSON file on server
- Load reviews from file on startup

### **Implementation Steps:**
1. Replace `reviews` array with database queries
2. Update submit endpoint to save to database
3. Update get endpoint to fetch from database
4. Add database queries for pending reviews
5. Add database update for approval

---

## Testing

### **Test Submit Review (Curl):**
```bash
curl -X POST http://localhost:3000/api/submit-review \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Test User",
    "location":"Test City",
    "rating":5,
    "review":"This is a test review with enough characters for validation"
  }'
```

### **Test Get Reviews:**
```bash
curl http://localhost:3000/api/pending-reviews
```

### **Test Approve Review:**
```bash
curl -X POST http://localhost:3000/api/approve-review \
  -H "Content-Type: application/json" \
  -d '{"reviewId": 1714320000000}'
```

---

## Current Status

✅ **Completed:**
- Review submission form in HTML
- `/api/submit-review` endpoint with validation
- `/api/get-reviews` endpoint showing approved reviews
- `/api/pending-reviews` endpoint for moderation
- `/api/approve-review` endpoint for approval
- Reviews stored in-memory array on server
- Frontend form with interactive stars and character counter
- Auto-loading reviews on page scroll

⏳ **Pending (For Production):**
- Persistent storage (database or Google Sheets)
- Admin approval interface
- Email notification when reviews are approved
- Review spam detection
- Review edit/delete functionality

---

## Notes

- Reviews are currently stored in server memory (`reviews` array)
- Reviews will be lost when server restarts
- For Vercel deployment, use persistent storage (Google Sheets, database, etc.)
- Default moderation: All reviews are `approved: false` until manually approved
- Sample data includes 6 pre-approved reviews to show on initial load

