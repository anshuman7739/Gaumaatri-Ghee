// =====================================================
// CRO OPTIMIZATION JAVASCRIPT
// Add this to index.html <script> section
// =====================================================

// ========== 1. PAYMENT SUCCESS HANDLER ==========
function showPaymentSuccess(orderId, amount, paymentId) {
  document.getElementById('successOrderId').textContent = orderId;
  document.getElementById('successAmount').textContent = amount;
  document.getElementById('successPaymentMethod').textContent = 'Razorpay';
  
  // Show modal
  document.getElementById('paymentSuccessModal').classList.remove('hidden');
  
  // Hide other modals
  document.getElementById('paymentFailedModal').classList.add('hidden');
  
  // Track event
  trackEvent('Purchase', {
    orderId,
    amount,
    paymentId,
    method: 'razorpay'
  });

  console.log('✅ Payment Success:', { orderId, amount, paymentId });
}

// ========== 2. PAYMENT FAILURE HANDLER ==========
function showPaymentFailed(reason) {
  document.getElementById('failureReason').textContent = reason || 'Payment could not be processed. Please try again.';
  document.getElementById('paymentFailedModal').classList.remove('hidden');
  document.getElementById('paymentSuccessModal').classList.add('hidden');
  
  trackEvent('PaymentFailed', { reason });
  console.log('❌ Payment Failed:', reason);
}

// ========== 3. RETRY PAYMENT ==========
function retryPayment() {
  document.getElementById('paymentFailedModal').classList.add('hidden');
  // Trigger payment flow again
  payWithRazorpay();
}

// ========== 4. CLOSE FAILURE MODAL ==========
function closeFailureModal() {
  document.getElementById('paymentFailedModal').classList.add('hidden');
  // Show COD option
  selectPaymentMethod('cod');
}

// ========== 5. TRACK ORDER ==========
function trackOrder() {
  const orderId = document.getElementById('successOrderId').textContent;
  trackOrderById(orderId);
}

// ========== 6. TRACK ORDER BY ID ==========
async function trackOrderById(orderId) {
  try {
    const response = await fetch(`/api/order-status/${orderId || document.getElementById('trackingOrderId').value}`);
    const data = await response.json();
    
    if (data.success) {
      const html = `
        <div class="order-status">
          <p><strong>Order ID:</strong> ${data.order_id}</p>
          <p><strong>Status:</strong> ${data.status}</p>
          <p><strong>Est. Delivery:</strong> ${data.estimated_delivery}</p>
          <a href="${data.tracking_url}" target="_blank">View Full Tracking</a>
        </div>
      `;
      document.getElementById('trackingResult').innerHTML = html;
    }
  } catch (err) {
    console.error('Tracking error:', err);
    alert('Could not retrieve order status');
  }
}

// ========== 7. GO HOME ==========
function goHome() {
  document.getElementById('paymentSuccessModal').classList.add('hidden');
  window.location.href = '/';
}

// ========== 8. EXIT INTENT POPUP ==========
document.addEventListener('mouseleave', (e) => {
  if (e.clientY <= 0) {
    showExitIntentPopup();
  }
});

function showExitIntentPopup() {
  const popup = document.getElementById('exitIntentPopup');
  if (popup && !popup.classList.contains('hidden')) {
    return; // Already shown
  }
  
  setTimeout(() => {
    document.getElementById('exitIntentPopup').classList.remove('hidden');
    trackEvent('ExitIntent');
  }, 1000);
}

function closeExitPopup() {
  document.getElementById('exitIntentPopup').classList.add('hidden');
}

function applyExitDiscount() {
  const email = document.getElementById('exitPopupEmail').value;
  if (!email) {
    alert('Please enter your email');
    return;
  }
  
  // Save discount to session
  sessionStorage.setItem('exitDiscount', '50');
  sessionStorage.setItem('exitEmail', email);
  
  closeExitPopup();
  alert('✅ ₹50 discount applied! Proceed to checkout.');
  
  trackEvent('ExitDiscountClaimed', { email });
}

// ========== 9. PAYMENT METHOD SELECTOR ==========
function selectPaymentMethod(method) {
  const methods = document.querySelectorAll('.method input[name="paymentMethod"]');
  methods.forEach(m => m.value === method ? m.click() : null);
  
  trackEvent('PaymentMethodSelected', { method });
  
  if (method === 'cod') {
    alert('Cash on Delivery selected. Proceed with checkout for COD option.');
  } else {
    alert('Prepaid selected. Get 10% discount! Proceed to payment.');
  }
}

// ========== 10. COUNTDOWN TIMER ==========
function startCountdownTimer(minutes = 10) {
  let timeLeft = minutes * 60;
  
  const timer = setInterval(() => {
    const hours = Math.floor(timeLeft / 3600);
    const mins = Math.floor((timeLeft % 3600) / 60);
    const secs = timeLeft % 60;
    
    const display = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    document.getElementById('timerDisplay').textContent = display;
    document.getElementById('timerMessage').textContent = `Offer ends in ${display}`;
    
    if (timeLeft <= 0) {
      clearInterval(timer);
      alert('⏳ Offer has expired!');
      document.getElementById('countdownTimer').classList.add('hidden');
    }
    
    timeLeft--;
  }, 1000);
}

// ========== 11. BUNDLE OFFERS ==========
function addBundle(quantity) {
  const discounts = {
    2: 10,
    3: 15,
    5: 20
  };
  
  const discount = discounts[quantity] || 0;
  const basePrice = 299;
  const totalPrice = basePrice * quantity;
  const discountAmount = (totalPrice * discount) / 100;
  const finalPrice = totalPrice - discountAmount;
  
  sessionStorage.setItem('bundleQty', quantity);
  sessionStorage.setItem('bundleDiscount', discount);
  sessionStorage.setItem('bundlePrice', finalPrice);
  
  alert(`✅ Bundle selected: ${quantity} packs\n💰 Discount: ${discount}%\n🏷️ Final Price: ₹${finalPrice}`);
  
  trackEvent('BundleSelected', { quantity, discount, price: finalPrice });
}

// ========== 12. URGENCY MESSAGING ==========
function updateUrgencyMessages() {
  const stockLeft = Math.floor(Math.random() * 10) + 1; // 1-10
  document.getElementById('stockMessage').textContent = `Only ${stockLeft} packs left in stock`;
  
  // Start countdown
  startCountdownTimer(10);
}

// ========== 13. STICKY BUY BUTTON (Mobile) ==========
window.addEventListener('scroll', () => {
  const btn = document.getElementById('stickyBuyBtn');
  if (window.innerWidth < 768 && window.scrollY > 300) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
});

document.getElementById('stickyBuyBtn')?.addEventListener('click', () => {
  payWithRazorpay();
});

// ========== 14. LIVE VISITOR COUNTER ==========
function updateLiveVisitors() {
  const count = Math.floor(Math.random() * 50) + 5; // 5-55
  document.getElementById('visitorCount').textContent = count;
}

setInterval(updateLiveVisitors, 10000); // Update every 10 seconds

// ========== 15. CUSTOMER REVIEWS ==========
const sampleReviews = [
  {
    name: 'Rajesh Kumar',
    location: 'Delhi',
    rating: 5,
    text: '100% pure ghee! My family loves it. Best quality.',
    image: 'https://via.placeholder.com/40',
    verified: true
  },
  {
    name: 'Priya Singh',
    location: 'Jaipur',
    rating: 5,
    text: 'Amazing taste and aroma. Delivery was super fast!',
    image: 'https://via.placeholder.com/40',
    verified: true
  },
  {
    name: 'Amit Patel',
    location: 'Mumbai',
    rating: 5,
    text: 'Great quality ghee. Highly recommended to everyone.',
    image: 'https://via.placeholder.com/40',
    verified: true
  }
];

function loadCustomerReviews() {
  const container = document.querySelector('.reviews-container');
  if (!container) return;
  
  container.innerHTML = sampleReviews.map(review => `
    <div class="review-card">
      <div class="review-header">
        <img src="${review.image}" alt="${review.name}" class="review-avatar" />
        <div>
          <p><strong>${review.name}</strong> ${review.verified ? '✅' : ''}</p>
          <p style="font-size: 12px; color: #666;">${review.location}</p>
        </div>
      </div>
      <div class="review-rating">${'⭐'.repeat(review.rating)}</div>
      <p class="review-text">"${review.text}"</p>
    </div>
  `).join('');
}

// ========== 16. ANALYTICS TRACKING ==========
const trackEvent = (eventName, eventData = {}) => {
  // Google Analytics
  if (typeof gtag !== 'undefined') {
    gtag('event', eventName, eventData);
  }
  
  // Facebook Pixel
  if (typeof fbq !== 'undefined') {
    fbq('trackCustom', eventName, eventData);
  }
  
  // Custom logging
  console.log(`📊 Event: ${eventName}`, eventData);
};

// ========== 17. PERFORMANCE OPTIMIZATION ==========
// Lazy load images
if ('IntersectionObserver' in window) {
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.add('loaded');
        imageObserver.unobserve(img);
      }
    });
  });
  
  document.querySelectorAll('img[data-src]').forEach(img => imageObserver.observe(img));
}

// ========== 18. INIT CRO ON PAGE LOAD ==========
document.addEventListener('DOMContentLoaded', () => {
  updateUrgencyMessages();
  updateLiveVisitors();
  loadCustomerReviews();
  startCountdownTimer(10);
  
  // Track page view
  trackEvent('PageView', {
    page: window.location.pathname,
    timestamp: new Date().toISOString()
  });
  
  console.log('✅ CRO Optimization loaded');
});

// ========== 19. WHATSAPP ORDER TEMPLATE ==========
function sendWhatsAppOrder(orderId, amount) {
  const message = encodeURIComponent(`Hi! I just placed order #${orderId} for ₹${amount}. Excited to receive my Gaumaatri Ghee! 🐄`);
  window.open(`https://wa.me/919999999999?text=${message}`);
}

// ========== 20. DISCOUNT APPLICATION ==========
function applySessionDiscounts() {
  const exitDiscount = sessionStorage.getItem('exitDiscount') || 0;
  const bundleDiscount = sessionStorage.getItem('bundleDiscount') || 0;
  
  const totalDiscount = Math.max(exitDiscount, bundleDiscount);
  
  if (totalDiscount > 0) {
    console.log(`💰 Discount applied: ${totalDiscount}%`);
    return totalDiscount;
  }
  
  return 0;
}

console.log('✅ CRO JavaScript loaded and ready');
