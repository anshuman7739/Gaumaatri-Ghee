export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { name, location, rating, review } = req.body;

  // Validation
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: "Name is required" });
  }
  if (!location || !location.trim()) {
    return res.status(400).json({ success: false, message: "Location is required" });
  }
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: "Rating must be 1-5" });
  }
  if (!review || !review.trim()) {
    return res.status(400).json({ success: false, message: "Review is required" });
  }
  if (review.trim().length < 10) {
    return res.status(400).json({ success: false, message: "Review must be at least 10 characters" });
  }
  if (review.trim().length > 500) {
    return res.status(400).json({ success: false, message: "Review must be under 500 characters" });
  }

  try {
    // For now, store in memory (in production, use database or Google Sheets)
    // This will be replaced with proper storage
    const reviewData = {
      name: name.trim(),
      location: location.trim(),
      rating: parseInt(rating),
      review: review.trim(),
      date: new Date().toISOString(),
      approved: false // Default to unapproved for moderation
    };

    // TODO: Save to Google Sheets or database
    console.log("Review received:", reviewData);

    return res.status(200).json({ 
      success: true, 
      message: "Review submitted! Thank you for your feedback. It will appear after approval." 
    });
  } catch (error) {
    console.error("Error submitting review:", error);
    return res.status(500).json({ success: false, message: "Error submitting review" });
  }
}
