# Render Deployment Guide

Deploy your Monopoly game on Render (PaaS) in 5 minutes with zero DevOps.

## Quick Start

### 1. Create Render Account
- Go to [render.com](https://render.com)
- Sign up with GitHub (recommended for auto-deployment)

### 2. Create Web Service
1. Click **New +** → **Web Service**
2. Select **Deploy an existing repository**
3. Connect your GitHub account (authorize if needed)
4. Choose repo: `Aether-123/Monopoly`
5. Click **Connect**

### 3. Configure Service
Fill in the form:

| Field | Value |
|-------|-------|
| **Name** | `monopoly-game` |
| **Region** | `Ohio` (or closest to you) |
| **Branch** | `master` |
| **Runtime** | `Node` |
| **Build Command** | `pnpm install` |
| **Start Command** | `cd artifacts/monopoly-game && pnpm start` |

### 4. Environment Variables
Click **Advanced** → **Add Environment Variable**

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `GAME_PORT` | `8001` |

### 5. Deploy
- Click **Create Web Service**
- Render builds & deploys automatically (~2 min)
- Your app is live at `https://monopoly-game.onrender.com`

---

## Change Default Domain

Render auto-generates the domain above. To use a custom domain:

### A. Add Custom Domain in Render (easiest)
1. In Render dashboard, go to your service
2. **Settings** tab → scroll to **Custom Domain**
3. Enter your domain (e.g., `monopoly.yourdomain.com`)
4. Click **Add Custom Domain**
5. Copy the **CNAME record** Render shows

### B. Update DNS at Your Registrar
1. Log into your domain registrar (GoDaddy, Namecheap, etc.)
2. Go to **DNS Settings**
3. Create a **CNAME record**:
   ```
   Name:  monopoly
   Type:  CNAME
   Value: monopoly-game.onrender.com
   TTL:   3600
   ```
4. **Save** and wait 5–30 minutes for DNS propagation

### C. Enable HTTPS (Auto)
- Render auto-generates Let's Encrypt SSL cert for custom domains
- Your site becomes `https://monopoly.yourdomain.com` in ~2 min
- No action needed

---

## Auto-Deploy on GitHub Push

After connecting Render to your GitHub repo, every `git push origin master` triggers:
1. Render fetches latest code
2. Runs build & start commands
3. Restarts service (30 sec downtime)

**To push updates:**
```powershell
git add .
git commit -m "Gameplay update"
git push origin master
```

---

## Environment & Limits

| Resource | Limit | Note |
|----------|-------|------|
| **Memory** | 512 MB free / ∞ paid | Sufficient for 20–50 players |
| **CPU** | Shared | Single-threaded Node OK |
| **Bandwidth** | ∞ | Built-in CDN |
| **Concurrent Connections** | Unlimited via WebSocket |
| **Idle Timeout** | 15 min (free plan) | Service restarts if no traffic |

**Activate paid plan** when you want persistent uptime (no idle shutdown).

---

## Verify Deployment

Test your live game:
```
https://monopoly-game.onrender.com
```

Check logs:
1. Render dashboard → Service → **Logs**
2. Tail in real-time
3. Errors appear immediately

---

## Updating Code

Edit `/artifacts/monopoly-game/server/engine.js` or `/public/game/game.js`, then:
```powershell
git add .
git commit -m "Fix description"
git push origin master
```

Render auto-detects push, rebuilds with `pnpm install`, and deploys (2–3 min).

---

## Rollback (if needed)

1. Render dashboard → Service → **Deployments**
2. Click prior deployment → **Redeploy**

---

## Next: Custom Domain + HTTPS

Once DNS CNAME propagates:
- Render auto-provisions SSL cert
- Visit `https://monopoly.yourdomain.com`
- Browser shows green lock

---

## Support

- **Render Docs:** https://render.com/docs
- **Node.js Build Issues:** Check Logs tab in Render dashboard
- **DNS Not Working:** Wait 1 hour for global propagation; verify CNAME is set correctly

Done! Your game is live. 🎲
