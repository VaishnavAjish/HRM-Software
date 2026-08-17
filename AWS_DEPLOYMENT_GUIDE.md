# AWS EC2 Production Deployment & Operations Guide

## Overview
This document provides step-by-step instructions for deploying, configuring, securing, and maintaining the **HRMS Management Software** on an **AWS EC2 Ubuntu Instance** (`niss.pro`).

---

## 🏗️ Architecture Overview

```
+-------------------------------------------------------------------------+
|                              AWS EC2                                    |
|                                                                         |
|  [ User Browser ] ---> Port 443 (HTTPS) ---> [ Nginx ]                 |
|                             |                    |                      |
|                    Static React Build   fastcgi_pass /api/*.php         |
|                     (/var/www/hrflow)             v                     |
|                                       [ PHP-FPM Worker Pool ]           |
|                                       (unix:/run/php/php8.3-fpm.sock)   |
|                                                    |                    |
|                                          [ SQLite (database.sqlite) ]   |
+-------------------------------------------------------------------------+
```

- **Domain**: `https://niss.pro`
- **EC2 Instance**: `ubuntu@ip-172-31-36-37`
- **Web Server Root**: `/var/www/hrflow/`
- **Backend Directory**: `/home/ubuntu/salary-slip-bac/`
- **Database**: SQLite (`database/database.sqlite`) — single file, single-writer; see §7 for concurrency notes
- **App server**: PHP-FPM (migrated 2026-08-17 off `php artisan serve`, a single-threaded dev
  server that crash-looped under a 10K-concurrent-login spike — see pool config in §3.5)

---

## 📋 1. AWS Security Group Rules

Ensure the following inbound rules are active in your **AWS EC2 Security Group**:

| Type | Protocol | Port Range | Source | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **SSH** | TCP | 22 | My IP / Anywhere | Terminal Access |
| **HTTP** | TCP | 80 | `0.0.0.0/0` | Plain Web Traffic & 301 Redirect |
| **HTTPS** | TCP | 443 | `0.0.0.0/0` | Secure SSL Web Traffic |

---

## 🛠️ 2. Initial Server Dependencies

Run on EC2 terminal:

```bash
# 1. Update system packages
sudo apt update && sudo apt upgrade -y

# 2. Install PHP 8.3 & required extensions
sudo apt install -y php8.3 php8.3-cli php8.3-fpm php8.3-mysql php8.3-xml \
php8.3-mbstring php8.3-curl php8.3-zip php8.3-gd php8.3-sqlite3 composer

# 3. Install Node.js 20 & PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# 4. Install Nginx & Certbot
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

## 📂 3. Backend Setup (`salary-slip-bac`)

```bash
# 1. Prepare directory permissions
sudo chown -R ubuntu:ubuntu /home/ubuntu/salary-slip-bac/
cd /home/ubuntu/salary-slip-bac

# 2. Install PHP dependencies
composer install --no-dev --optimize-autoloader

# 3. Configure production .env file
cp .env.example .env
```

### Production `.env` Essentials:
```env
APP_NAME=HRMS
APP_ENV=production
APP_DEBUG=false
APP_URL=https://niss.pro

DB_CONNECTION=sqlite
# The live database is a single SQLite file (database/database.sqlite) —
# it allows only one writer at a time. Under real concurrency this showed
# up as "SQLSTATE[HY000]: database is locked" (found 2026-08-17), because
# CACHE_STORE below was silently defaulting to the `database` cache store,
# which writes to SQLite on every single request via the rate limiter.

CACHE_STORE=file
# Laravel 11+ renamed CACHE_DRIVER to CACHE_STORE; config/cache.php falls
# back to 'database' if this key is missing. Must be set explicitly, or
# every request's rate-limiter hit becomes a SQLite write and concurrent
# requests start throwing "database is locked" 500s.
SESSION_DRIVER=file

MAIL_MAILER=smtp
MAIL_HOST=smtp.titan.email
MAIL_PORT=587
MAIL_USERNAME=admin@niss.pro
MAIL_PASSWORD=YourTitanPassword
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS="admin@niss.pro"
MAIL_FROM_NAME="${APP_NAME}"
```

```bash
# 4. Clear & cache configurations
php artisan key:generate
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan migrate --force

# 5. Production PHP-FPM & Nginx Setup
# DO NOT run `php artisan serve` in production — single-threaded serve creates concurrency bottlenecks.
# FastCGI PHP-FPM handles high-concurrency worker pools:
sudo systemctl enable php8.3-fpm
sudo systemctl start php8.3-fpm
```

### 3.5. PHP-FPM Pool Configuration (`/etc/php/8.3/fpm/pool.d/www.conf`)

Sized for this instance's ~900MB RAM (SQLite has no separate DB process to budget around; each
idle worker runs ~40-55MB RSS). Started at `pm.max_children = 6`, raised to `12` on 2026-08-17
after the Employee Master page (which fires 4 parallel `limit=1000` requests per load) timed out
under worker exhaustion — the underlying queries were fast (<35ms), the pool just had too few
workers to serve normal concurrent staff usage. Verified safe with a 24-concurrent-request burst
(peak FPM memory 74MB, ~400MB RAM stayed available). Re-apply these if the pool config is ever
regenerated (fresh instance, package reinstall):

```bash
sudo sed -i \
  -e 's/^user = .*/user = ubuntu/' \
  -e 's/^group = .*/group = ubuntu/' \
  -e 's/^listen.owner = .*/listen.owner = ubuntu/' \
  -e 's/^listen.group = .*/listen.group = ubuntu/' \
  -e 's/^pm.max_children = .*/pm.max_children = 12/' \
  -e 's/^pm.start_servers = .*/pm.start_servers = 4/' \
  -e 's/^pm.min_spare_servers = .*/pm.min_spare_servers = 2/' \
  -e 's/^pm.max_spare_servers = .*/pm.max_spare_servers = 6/' \
  /etc/php/8.3/fpm/pool.d/www.conf
grep -q "^pm.max_requests" /etc/php/8.3/fpm/pool.d/www.conf || echo "pm.max_requests = 500" | sudo tee -a /etc/php/8.3/fpm/pool.d/www.conf
sudo systemctl restart php8.3-fpm
```

**Follow-up worth doing, not done tonight**: `EmployeeMasterTable.jsx` fires 4 separate
`limit=1000` requests (trial/appointment/pending/employee status filters) in parallel on every
page load via `Promise.all`. Combining these into one backend endpoint that returns all four
groups from a single query would cut this page's worker consumption from 4 to 1 and reduce load
on the rest of the site.

**`listen.owner`/`listen.group` must match whichever user nginx's worker processes actually run
as** (`ps -ef | grep "nginx: worker"` — confirmed `ubuntu` on this box, not the apt default
`www-data`), or nginx gets `(13: Permission denied)` connecting to the FPM socket despite the
socket having correct file permissions. `user`/`group` (the FPM worker processes themselves) are
set to `ubuntu` to match the existing app file ownership from §3 step 1, avoiding a broader
permissions rework.

---

## 🌐 4. Nginx SSL & Reverse Proxy Configuration

Create or update `/etc/nginx/sites-available/default`:

```bash
sudo bash -c 'cat << "EOF" > /etc/nginx/sites-available/default
# 1. HTTP Server - Redirect Port 80 to HTTPS Port 443
server {
    listen 80;
    listen [::]:80;
    server_name niss.pro www.niss.pro;
    return 301 https://$host$request_uri;
}

# 2. HTTPS Server - SSL Port 443
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name niss.pro www.niss.pro;

    ssl_certificate /etc/letsencrypt/live/niss.pro/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/niss.pro/privkey.pem;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    # Frontend Static Web Root
    location / {
        root /var/www/hrflow;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Laravel API Reverse Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Socket.IO WebSocket Reverse Proxy
    location /socket.io/ {
        proxy_pass http://127.0.0.1:8000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF'
```

### Activate Configuration & Test:
```bash
# Link site & remove stale conflicts
sudo rm -f /etc/nginx/sites-enabled/hrflow*
sudo ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Test Nginx syntax & restart
sudo nginx -t && sudo systemctl restart nginx
```

---

## 🔒 5. Let's Encrypt SSL Certificate Setup

```bash
# Issue certificate & configure auto-renewal
sudo certbot --nginx -d niss.pro -d www.niss.pro --non-interactive --agree-tos --email admin@niss.pro --redirect

# Test automatic renewal dry run
sudo certbot renew --dry-run
```

---

## 🚀 6. One-Click Automated Update Script

To update your live production site with new code changes from GitHub, copy and execute this script on EC2:

```bash
#!/bin/bash
set -euo pipefail

echo "🚀 Starting 1-Click Production Update..."

# 1. Clone into a timestamped build dir, never a fixed name — a fixed
#    ~/HRM-Software directory means a concurrent/failed run's rm -rf can
#    delete a clone that's still in progress.
BUILD_DIR="$HOME/HRM-Software-build-$(date +'%s')"
git clone --depth 1 https://github.com/VaishnavAjish/HRM-Software.git "$BUILD_DIR"

# 2. Sync backend application files (app/routes/database/config — not
#    vendor, dependencies aren't part of this update path)
sudo chown -R ubuntu:ubuntu ~/salary-slip-bac/
cp -r "$BUILD_DIR/salary-slip-bac/app" ~/salary-slip-bac/
cp -r "$BUILD_DIR/salary-slip-bac/routes" ~/salary-slip-bac/
cp -r "$BUILD_DIR/salary-slip-bac/database" ~/salary-slip-bac/
cp -r "$BUILD_DIR/salary-slip-bac/config" ~/salary-slip-bac/

# 3. Clear Laravel caches, run migrations, then rebuild the caches.
#    Clearing without rebuilding leaves the app running uncached in
#    production — every request re-parses every config file and
#    re-resolves the full route table from scratch instead of reading
#    the compiled cache, which is a significant, silent slowdown on
#    every single request until the next deploy clears it again.
cd ~/salary-slip-bac
php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan cache:clear
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache

# 4. Restart PHP-FPM so opcache picks up the new code (reload alone respawns
#    workers gracefully but can leave stale opcode cache; restart is safe here
#    since it only briefly drops in-flight requests, not all connections at once
#    the way `php artisan serve` did every deploy).
sudo systemctl restart php8.3-fpm

# 5. Deploy prebuilt frontend assets
sudo rm -rf /var/www/hrflow/*
sudo cp -r "$BUILD_DIR/salary-slip-front/salary-slip-front/main/"* /var/www/hrflow/
sudo chown -R www-data:www-data /var/www/hrflow
sudo chmod -R 755 /var/www/hrflow

# 6. Redeploy the nginx config. This box loads /etc/nginx/sites-enabled/default
#    (confirmed 2026-08-17 via `nginx -T`) — write only there. A duplicate
#    copy also existed at /etc/nginx/conf.d/hrflow.conf; that was removed as
#    a one-time cleanup and must NOT be recreated, or nginx will again log
#    "conflicting server name" and silently ignore one of the two copies.
sudo cp "$BUILD_DIR/hrflow-nginx-ssl.conf" /etc/nginx/sites-available/default

# 7. Cleanup & reload
rm -rf "$BUILD_DIR"
sudo nginx -t && sudo systemctl reload nginx

echo "🎉 PRODUCTION DEPLOYMENT COMPLETED SUCCESSFULLY!"
```

---

## 🛠️ 7. Useful Operational Commands

### Check PHP-FPM Status:
```bash
sudo systemctl status php8.3-fpm --no-pager
ps aux | grep "php-fpm: pool"
sudo journalctl -u php8.3-fpm --since "10 minutes ago" --no-pager
```

### Check backend errors:
```bash
sudo tail -50 /var/log/nginx/error.log
sudo -u ubuntu tail -50 /home/ubuntu/salary-slip-bac/storage/logs/laravel.log
```

### SQLite concurrency note:
The database is a single SQLite file — only one writer at a time. If `storage/logs/laravel.log`
shows `SQLSTATE[HY000]: General error: 5 database is locked` under real load, first confirm
`CACHE_STORE=file` and `SESSION_DRIVER=file` are actually set in `.env` (Laravel silently falls
back to the `database` cache store if `CACHE_STORE` is missing — this caused exactly this error
on 2026-08-17). If genuine app-data writes (not cache/session) start contending under load, the
next lever is enabling SQLite's WAL journal mode and a `busy_timeout`, not re-adding a queue.

### Check Nginx Status & Error Logs:
```bash
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### Test Local Port 8000 Response:
```bash
curl -I http://127.0.0.1:8000/api/login
```
