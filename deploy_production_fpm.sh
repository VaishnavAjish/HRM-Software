#!/bin/bash
# ==============================================================================
# HRMS CAREER PORTAL - ZERO-DOWNTIME PRODUCTION DEPLOYMENT SCRIPT
# ==============================================================================
# This script deploys the production architecture: Nginx + FastCGI PHP-FPM.
# It MUST NOT run `php artisan serve`.
# ==============================================================================

set -euo pipefail

echo "======================================================================"
echo "🚀 Starting Production Deployment (Nginx + PHP-FPM Architecture)..."
echo "======================================================================"

# 1. Directory Resolution & Clone/Sync
BUILD_DIR="$HOME/HRM-Software-build-$(date +'%s')"
echo "📦 Cloning latest code from repository..."
git clone --depth 1 https://github.com/VaishnavAjish/HRM-Software.git "$BUILD_DIR"

# 2. Sync Backend Application Files
echo "🔄 Updating Backend (salary-slip-bac)..."
sudo chown -R ubuntu:ubuntu ~/salary-slip-bac/
cp -r "$BUILD_DIR/salary-slip-bac/app" ~/salary-slip-bac/
cp -r "$BUILD_DIR/salary-slip-bac/routes" ~/salary-slip-bac/
cp -r "$BUILD_DIR/salary-slip-bac/database" ~/salary-slip-bac/
cp -r "$BUILD_DIR/salary-slip-bac/config" ~/salary-slip-bac/
cp -r "$BUILD_DIR/salary-slip-bac/bootstrap" ~/salary-slip-bac/

cd ~/salary-slip-bac

# 3. Install Optimized PHP Dependencies
echo "⚙️ Installing Composer dependencies..."
composer install --no-dev --optimize-autoloader --no-interaction

# 4. Clear & Rebuild Laravel Caches
echo "🧹 Rebuilding Laravel Production Caches..."
php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan cache:clear

php artisan migrate --force

php artisan config:cache
php artisan route:cache
php artisan view:cache

# 5. Restart Background Queue Workers
echo "🔄 Restarting Queue Workers..."
php artisan queue:restart || true

# 6. Deploy Prebuilt Frontend Assets
echo "🎨 Deploying Frontend Web Assets (/var/www/hrflow)..."
sudo mkdir -p /var/www/hrflow
sudo rm -rf /var/www/hrflow/*
sudo cp -r "$BUILD_DIR/salary-slip-front/salary-slip-front/main/"* /var/www/hrflow/
sudo chown -R www-data:www-data /var/www/hrflow
sudo chmod -R 755 /var/www/hrflow

# 7. Update Nginx & PHP-FPM Configurations
echo "🌐 Updating Web Server Configurations..."
sudo cp "$BUILD_DIR/hrflow-nginx-fpm-ssl.conf" /etc/nginx/sites-available/default
sudo rm -f /etc/nginx/sites-enabled/hrflow*
sudo ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# 8. Reload PHP-FPM & Nginx (Zero Downtime)
echo "⚡ Reloading PHP-FPM & Nginx Services..."
sudo systemctl reload php8.3-fpm || sudo systemctl reload php-fpm
sudo nginx -t && sudo systemctl reload nginx

# 9. Cleanup Temporary Build Scratch Directory
rm -rf "$BUILD_DIR"

# 10. Automated Health Check Verification
echo "🩺 Verifying Readiness Endpoint..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/api/ready || echo "000")

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "======================================================================"
    echo "🎉 SUCCESS: Production Deployment Complete & System Ready (HTTP 200)!"
    echo "======================================================================"
else
    echo "⚠️ WARNING: System responded with status $HTTP_STATUS on /api/ready probe."
    echo "Check logs: /var/log/nginx/error.log & storage/logs/laravel.log"
fi
