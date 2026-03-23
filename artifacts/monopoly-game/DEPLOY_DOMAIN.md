# Host on Your Own Domain (VPS + Nginx + PM2)

This project already runs as a Node server from `server/server.js`.

## 1) DNS setup

At your domain provider (or Cloudflare), create:

- `A` record: `@` -> `<YOUR_SERVER_PUBLIC_IP>`
- `A` record: `www` -> `<YOUR_SERVER_PUBLIC_IP>`

Wait for DNS propagation (usually a few minutes).

## 2) Server prerequisites (Ubuntu)

```bash
sudo apt update
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

## 3) Upload project to server

Place the repo at e.g. `/var/www/monopoly-game`.

```bash
cd /var/www/monopoly-game/artifacts/monopoly-game
npm install
```

## 4) Run app with PM2

```bash
cd /var/www/monopoly-game/artifacts/monopoly-game
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

App will run on `127.0.0.1:8001`.

## 5) Nginx reverse proxy

Copy the template and replace domain names:

- Source template: `deploy/nginx-monopoly.conf`
- Replace `example.com` and `www.example.com` with your real domain.

Then apply:

```bash
sudo cp /var/www/monopoly-game/artifacts/monopoly-game/deploy/nginx-monopoly.conf /etc/nginx/sites-available/monopoly
sudo ln -s /etc/nginx/sites-available/monopoly /etc/nginx/sites-enabled/monopoly
sudo nginx -t
sudo systemctl reload nginx
```

## 6) Enable HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot will update Nginx for TLS and set auto-renewal.

## 7) Verify

- `https://yourdomain.com` loads game
- `pm2 logs monopoly-game` shows no errors
- `sudo systemctl status nginx` is active

## Common issues

- **502 Bad Gateway**: app not running -> `pm2 status`, restart app.
- **Domain not resolving**: DNS record incorrect or not propagated yet.
- **Websocket issues**: keep `Upgrade` and `Connection` headers in Nginx config.

## Optional: push to GitHub first

If not already pushed:

```bash
git add .
git commit -m "Prepare production domain deployment"
git push origin <your-branch>
```
