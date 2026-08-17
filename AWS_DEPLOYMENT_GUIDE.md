# AWS EC2 Production Deployment & Operations Guide

## Overview
This document provides step-by-step instructions for deploying, configuring, securing, and maintaining the **HRMS Management Software** on an **AWS EC2 Ubuntu Instance** (`niss.pro`).

---

## 🏗️ Architecture Overview

```
+-------------------------------------------------------------------------+
|                              AWS EC2                                    |
|                                                                         |
|  [ User Browser ] ---> Port 443 (HTTPS) ---> [ Nginx Reverse Proxy ]    |
|                             |                          |                |
|                    Static React Build          Proxy /api/ & /socket.io/|
|                     (/var/www/hrflow)                  v                |
|                                             [ Laravel Backend ]         |
|                                              (127.0.0.1:8000)           |
|                                                        |                |
|                                                 [ MySQL Database ]      |
+-------------------------------------------------------------------------+
```

- **Domain**: `https://niss.pro`
- **EC2 Instance**: `ubuntu@ip-172-31-36-37`
- **Web Server Root**: `/var/www/hrflow/`
- **Backend Directory**: `/home/ubuntu/salary-slip-bac/`
- **Database**: Local MySQL / AWS RDS

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

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=salary_slip_db
DB_USERNAME=salary_user
DB_PASSWORD=YourSecurePassword

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

# 5. Start Backend Service on Port 8000 via PM2
pm2 start "php artisan serve --host=127.0.0.1 --port=8000" --name laravel-backend
pm2 save
pm2 startup
```

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

# 4. Restart backend processes
pm2 restart laravel-backend || pm2 start "php artisan serve --host=127.0.0.1 --port=8000" --name laravel-backend
php artisan queue:restart || true

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

### Check PM2 Status:
```bash
pm2 status
pm2 logs laravel-backend
```

### Check Nginx Status & Error Logs:
```bash
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### Test Local Port 8000 Response:
```bash
curl -I http://127.0.0.1:8000/api/login
```
