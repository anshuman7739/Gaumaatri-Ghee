# Go Live (Production Checklist)

This project is a Node/Express app (frontend + Razorpay API). Do not deploy it as a static website.

## 1) Rotate Razorpay Keys (Required)

If a secret key was ever pasted into chat/docs/screenshots, treat it as compromised.

- Razorpay Dashboard -> Settings -> API Keys
- Generate a NEW secret (or a new key pair)
- Disable/revoke the old secret/key

## 2) Deploy To Render (Recommended)

This repo includes `render.yaml` (Blueprint).

- Push latest code to GitHub
- Render -> New -> Blueprint -> select this repo
- After the service is created, set Environment variables:
  - `RAZORPAY_KEY_ID` = your live Key ID
  - `RAZORPAY_KEY_SECRET` = your live (rotated) secret
  - `NODE_ENV` is already set by `render.yaml`

## 3) Verify After Deploy

Open these URLs on your deployed domain:

- `GET /api/health` should return JSON
- `POST /api/create-order` should return JSON (order_id, amount, key_id)

If you see: `Unexpected token '<' ... is not valid JSON`
- It means the request returned HTML (usually your `index.html` or a 404 page)
- Confirm your host is running `server.js` (Node service), not static hosting
- Confirm `/api/*` routes are not being rewritten to `/`

## 4) Custom Domain

- Point your domain DNS to Render per their dashboard instructions.
- Enable HTTPS in Render (usually automatic once DNS is correct).

## 5) Operational Notes

- Never commit `.env` (already in `.gitignore`).
- Keep secrets only in the hosting provider environment variables.
- Use `/api/health` for uptime monitoring.

