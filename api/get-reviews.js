// Sample reviews data (in production, fetch from Google Sheets or database)
const sampleReviews = [
  {
    name: "Priya Sharma",
    location: "Delhi, NCR",
    rating: 5,
    review: "The ghee smells exactly like what my grandmother used to make. The golden colour, the grainy texture — it's 100% authentic. I've tried many brands but Gaumaatri is the best I've found in years!",
    date: "2026-04-25",
    approved: true
  },
  {
    name: "Rahul Mehta",
    location: "Mumbai, Maharashtra",
    rating: 5,
    review: "My doctor recommended A2 ghee for my digestion issues. After 3 weeks of using Gaumaatri ghee daily, the difference is night and day. Lighter stomach, better energy. Absolutely worth every rupee!",
    date: "2026-04-24",
    approved: true
  },
  {
    name: "Ananya Gupta",
    location: "Jaipur, Rajasthan",
    rating: 5,
    review: "Ordered the 1L pack for my parents who are very particular about their food. They loved it so much, they asked me to order 3 more! The packaging is also super premium with glass jars. Hats off!",
    date: "2026-04-23",
    approved: true
  },
  {
    name: "Vikram Singh",
    location: "Pune, Maharashtra",
    rating: 5,
    review: "As a fitness enthusiast, I put ghee in my morning coffee for energy. Gaumaatri ghee is so pure it melts perfectly with no weird taste. Been using it for 4 months and my performance has improved!",
    date: "2026-04-22",
    approved: true
  },
  {
    name: "Sunita Agarwal",
    location: "Lucknow, UP",
    rating: 5,
    review: "Switched from market ghee to Gaumaatri 6 months ago. My kids are healthier, my cooking tastes better and the whole house smells amazing when I cook with it. Will never go back!",
    date: "2026-04-21",
    approved: true
  },
  {
    name: "Karan Malhotra",
    location: "Bengaluru, Karnataka",
    rating: 5,
    review: "Free delivery was the reason I tried it first, but the quality is the reason I keep coming back. On my 5th order now. Customer support via WhatsApp is also very responsive. 10/10!",
    date: "2026-04-20",
    approved: true
  }
];

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    // Filter only approved reviews and sort by date (newest first)
    const approvedReviews = sampleReviews
      .filter(r => r.approved === true)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6); // Return latest 6 reviews

    // TODO: Fetch from Google Sheets or database
    
    return res.status(200).json({
      success: true,
      reviews: approvedReviews
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return res.status(500).json({ success: false, message: "Error fetching reviews" });
  }
}
