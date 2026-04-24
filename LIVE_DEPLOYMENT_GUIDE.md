# 🚀 LIVE DEPLOYMENT GUIDE — GAUMAATRI GHEE

## Deploy Your E-Commerce Store to Production

---

## ⚡ OPTION 1: Heroku (Easiest - FREE)

### Step 1: Create Heroku Account
```bash
# Visit: https://www.heroku.com/
# Sign up for free account
```

### Step 2: Install Heroku CLI
```bash
# macOS
brew tap heroku/brew && brew install heroku

# Verify installation
heroku --version
```

### Step 3: Login to Heroku
```bash
heroku login
# Opens browser to authenticate
```

### Step 4: Create Heroku App
```bash
cd /Users/shubhamkumar/Desktop/RAZOR
heroku create gaumaatri-ghee
# This creates your app and sets remote
```

### Step 5: Configure Environment Variables
```bash
# Set live Razorpay keys
heroku config:set RAZORPAY_KEY_ID=rzp_live_ShHI5Ujmhwtila
heroku config:set RAZORPAY_KEY_SECRET=WXBlbJlc310XqkE59JxCeeWl
heroku config:set PORT=80

# Verify
heroku config
```

### Step 6: Create Procfile (if not exists)
```bash
cat > Procfile << 'EOF'
web: node server.js
EOF
```

### Step 7: Deploy to Heroku
```bash
git push heroku main
# Deploys your code and starts server
```

### Step 8: Open Live Website
```bash
heroku open
# Opens your live website in browser
```

### Step 9: View Live Logs
```bash
heroku logs --tail
# Watch real-time server logs
```

**Your Live URL:** `https://gaumaatri-ghee.herokuapp.com`

---

## 🌍 OPTION 2: Render (Free Alternative)

### Step 1: Visit Render.com
```
https://render.com
```

### Step 2: Sign Up with GitHub
- Click "Sign up with GitHub"
- Authorize Render.com
- Connect to your repository

### Step 3: Create New Web Service
- Click "New +"
- Select "Web Service"
- Select your `Gaumaatri-Ghee` repository

### Step 4: Configure
- **Name:** gaumaatri-ghee
- **Environment:** Node
- **Build Command:** `npm install`
- **Start Command:** `node server.js`

### Step 5: Add Environment Variables
- RAZORPAY_KEY_ID = `rzp_live_ShHI5Ujmhwtila`
- RAZORPAY_KEY_SECRET = `WXBlbJlc310XqkE59JxCeeWl`
- PORT = `3000`

### Step 6: Deploy
- Click "Create Web Service"
- Wait for deployment (2-3 minutes)

**Your Live URL:** `https://gaumaatri-ghee.onrender.com`

---

## ☁️ OPTION 3: AWS Lightsail (Scalable)

### Step 1: Create AWS Lightsail Instance
```
1. Go to aws.amazon.com/lightsail
2. Click "Create Instance"
3. Select "Linux" + "Node.js"
4. Choose $5/month plan
5. Create instance
```

### Step 2: Connect via SSH
```bash
# Download key pair from AWS Console
chmod 600 ~/Downloads/LightsailDefaultKey.pem

# SSH into instance
ssh -i ~/Downloads/LightsailDefaultKey.pem ubuntu@<instance-ip>
```

### Step 3: Clone Your Repository
```bash
cd ~
git clone https://github.com/anshuman7739/Gaumaatri-Ghee.git
cd Gaumaatri-Ghee
```

### Step 4: Install Dependencies
```bash
npm install
```

### Step 5: Create .env File
```bash
cat > .env << 'EOF'
RAZORPAY_KEY_ID=rzp_live_ShHI5Ujmhwtila
RAZORPAY_KEY_SECRET=WXBlbJlc310XqkE59JxCeeWl
PORT=80
NODE_ENV=production
EOF
```

### Step 6: Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
pm2 start server.js --name "gaumaatri"
pm2 startup
pm2 save
```

### Step 7: Configure Firewall
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Step 8: Get Your IP
```bash
curl http://ipinfo.io/ip
# Your live URL: http://<your-ip>
```

---

## 🔒 OPTION 4: DigitalOcean App Platform

### Step 1: Create DigitalOcean Account
```
https://www.digitalocean.com/
```

### Step 2: Connect GitHub
- Dashboard → Apps → Create App
- Select "GitHub"
- Authorize and connect

### Step 3: Select Repository
- Choose `Gaumaatri-Ghee`
- Select `main` branch

### Step 4: Configure Service
- **Name:** gaumaatri-ghee
- **Source Type:** GitHub
- **HTTP Port:** 3000
- **Run Command:** `npm start`

### Step 5: Add Environment Variables
```
RAZORPAY_KEY_ID=rzp_live_ShHI5Ujmhwtila
RAZORPAY_KEY_SECRET=WXBlbJlc310XqkE59JxCeeWl
NODE_ENV=production
```

### Step 6: Deploy
- Review and launch
- DigitalOcean builds and deploys

**Your Live URL:** `https://gaumaatri-ghee-[random].ondigitalocean.app`

---

## 🎯 RECOMMENDED DEPLOYMENT

### For Beginners: **Heroku**
- ✅ Easiest setup
- ✅ Free tier available
- ✅ Auto-deploys from GitHub
- ✅ Perfect for starting out

### For Small Business: **Render**
- ✅ Easy GitHub integration
- ✅ Always free tier
- ✅ Better uptime than Heroku
- ✅ Good performance

### For Scale: **DigitalOcean/AWS**
- ✅ Better performance
- ✅ Full control
- ✅ Scalable infrastructure
- ✅ Custom domain support

---

## 📋 PRE-DEPLOYMENT CHECKLIST

- [ ] All code committed to GitHub
- [ ] `.env` file NOT in git (check .gitignore)
- [ ] Razorpay live credentials ready
- [ ] server.js has `PORT` environment variable support
- [ ] package.json has start script
- [ ] No console.log spam in production code
- [ ] Static files served correctly
- [ ] CORS configured if needed

---

## ✅ POST-DEPLOYMENT VERIFICATION

### Test These URLs

1. **Main Website**
   ```
   https://your-live-url.com
   ```

2. **Health Check**
   ```
   https://your-live-url.com/api/health
   ```

3. **Create Order**
   ```bash
   curl -X POST https://your-live-url.com/api/create-order \
     -H "Content-Type: application/json" \
     -d '{"amount":29900,"currency":"INR"}'
   ```

4. **Check Logs**
   - Heroku: `heroku logs --tail`
   - Render: Dashboard → Logs
   - AWS: SSH and check `/var/log/`

---

## 🔧 TROUBLESHOOTING LIVE DEPLOYMENT

### Issue: "Cannot find module 'express'"
```bash
# Solution: Install dependencies on server
npm install
```

### Issue: "Port 80 permission denied"
```bash
# Solution: Run with sudo or use port 3000
# In .env: PORT=3000
# Or proxy through Nginx
```

### Issue: "RAZORPAY_KEY_SECRET is undefined"
```bash
# Solution: Set environment variables
heroku config:set RAZORPAY_KEY_SECRET=your_secret_key
```

### Issue: "Static files not loading"
```bash
# Solution: Check if index.html is in root
# Verify: ls -la index.html
# If missing: Copy from your local project
```

### Issue: "Payment verification fails"
```bash
# Solution: Check if RAZORPAY_KEY_SECRET matches exactly
# Ensure no trailing spaces in .env
```

---

## 🚀 QUICK DEPLOYMENT (1-Click)

### Deploy on Heroku (Fastest)
```bash
cd /Users/shubhamkumar/Desktop/RAZOR

# 1. Create Procfile
echo "web: node server.js" > Procfile

# 2. Install Heroku CLI (if needed)
brew tap heroku/brew && brew install heroku

# 3. Login to Heroku
heroku login

# 4. Create app
heroku create gaumaatri-ghee

# 5. Set environment variables
heroku config:set RAZORPAY_KEY_ID=rzp_live_ShHI5Ujmhwtila
heroku config:set RAZORPAY_KEY_SECRET=WXBlbJlc310XqkE59JxCeeWl

# 6. Deploy
git push heroku main

# 7. Open live website
heroku open
```

**Total Time: ~5 minutes** ⚡

---

## 💡 PERFORMANCE TIPS FOR LIVE

### 1. Enable Caching
```javascript
// Add to server.js
app.set('view cache', true);
```

### 2. Use CDN for Images
- Upload images to Cloudinary or AWS S3
- Replace image URLs in HTML

### 3. Minify CSS & JavaScript
```bash
# Install minifiers
npm install --save-dev minify

# Minify before deployment
minify index.html > index.min.html
```

### 4. Enable Gzip Compression
```javascript
// Add to server.js
const compression = require('compression');
app.use(compression());
```

### 5. Use Production Logger
```bash
npm install morgan
```

---

## 📊 MONITORING LIVE DEPLOYMENT

### Track Performance
- **Heroku:** `heroku metrics`
- **Render:** Dashboard → Analytics
- **AWS:** CloudWatch dashboard

### Set Up Alerts
- CPU usage > 80%
- Memory usage > 512MB
- Error rate > 1%
- Response time > 2s

### View Logs
```bash
# Heroku
heroku logs --tail

# AWS Lightsail
tail -f /var/log/app.log
```

---

## 🎉 AFTER GOING LIVE

### 1. Test Payment Flow
- Complete test transaction
- Verify order creation
- Check email notifications

### 2. Monitor Performance
- Watch server logs
- Check error rates
- Monitor response times

### 3. Set Up Analytics
- Add Google Analytics ID
- Configure Facebook Pixel
- Track conversion events

### 4. Optimize Conversion
- Run A/B tests
- Analyze user behavior
- Implement improvements

### 5. Scale When Ready
- Upgrade to paid Heroku
- Add database (MongoDB/PostgreSQL)
- Set up automatic backups
- Configure CDN

---

## 📞 DEPLOYMENT SUPPORT

### Getting Help

**Heroku Issues:**
```bash
heroku help
# or visit: https://devcenter.heroku.com
```

**GitHub Issues:**
```bash
# Visit your repo
https://github.com/anshuman7739/Gaumaatri-Ghee/issues
```

**Server Logs:**
```bash
# Always check logs first
heroku logs --tail
# or
pm2 logs
```

---

## 🎊 CONGRATULATIONS!

Your **Gaumaatri Ghee** e-commerce store is now ready to go LIVE! 🚀

### Next Steps:
1. Choose deployment option
2. Follow quick deployment guide
3. Test live payment flow
4. Share your live URL
5. Start accepting real orders!

### Expected Results:
- ✅ Live payment processing
- ✅ Real customer orders
- ✅ Email notifications
- ✅ Order tracking
- ✅ CRO optimization active
- ✅ Revenue generation

---

**Ready to launch?** 🚀

Choose your deployment method and follow the steps above!

**Questions?** Check the GitHub documentation or server logs.

**Good luck with your live store!** 🐄💰
