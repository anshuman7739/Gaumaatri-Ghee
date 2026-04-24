# Gaumaatri - Pure Desi Cow Ghee

Premium single-page e-commerce website for Gaumaatri, a pure desi cow ghee brand.

## Features
- **Luxury Design**: Premium, clean, and minimal aesthetic.
- **Single Page Layout**: Smooth scroll navigation through Hero, About, Products, Benefits, How to Order, Reviews, and FAQ sections.
- **Order Functionality**: Integrated order form with variant selection, quantity control, and payment method (UPI/COD).
- **Email System**: Ready for EmailJS integration for order confirmations and business notifications.
- **Order Tracking**: Visual tracking timeline based on `localStorage` persistent data.
- **Responsive**: Fully optimized for mobile and desktop browsers.
- **Marketing Optimized**: Sticky header with CTA, trust badges, and floating WhatsApp support button.

## Tech Stack
- HTML5
- CSS3 (Vanilla)
- JavaScript (Vanilla)
- EmailJS (Integration Ready)

## How to use
1. Clone the repository.
2. For the full site (including payments), run the server and open `http://localhost:3000`:
   - `npm install`
   - `npm start`
3. To enable emails:
   - Sign up at [EmailJS](https://www.emailjs.com/).
   - Update the configuration in the `<script>` section of `index.html`.

## Deployment
This project now includes a Node/Express payment backend, so it should be deployed to a Node host instead of GitHub Pages.

### Recommended: Render
1. Push this repo to GitHub.
2. In Render, create a new **Web Service** from the repository.
3. Render will detect `render.yaml` automatically.
4. Add these environment variables in Render:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
5. Deploy the service and point your domain to the Render URL.

The health check endpoint is available at `/api/health`.

For a complete, production go-live checklist, see `GO_LIVE.md`.

---
*Created with 🧡 for Gaumaatri.*
