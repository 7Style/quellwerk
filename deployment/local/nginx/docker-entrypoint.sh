#!/bin/bash
set -e

echo "bp-monolith Nginx SSL Proxy (HARDENED)"
echo "========================================="
echo ""
echo "Environment: ${ENVIRONMENT:-local}"
echo "Domain: ${DOMAIN:-bp-local.7style.net}"

# Generate self-signed certificate for local development
if [ "${ENVIRONMENT}" = "local" ] || [ "${ENVIRONMENT}" = "development" ]; then
    if [ ! -f /etc/nginx/ssl/cert.pem ]; then
        echo "Generating self-signed SSL certificate..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout /etc/nginx/ssl/key.pem \
            -out /etc/nginx/ssl/cert.pem \
            -subj "/CN=${DOMAIN:-bp-local.7style.net}"
        echo "SSL certificate generated"
    fi
fi

# Create nginx config (HARDENED)
cat > /etc/nginx/conf.d/default.conf << 'NGINX_CONF'
# ==============================================================================
# Rate Limiting Zones
# ==============================================================================
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=1r/s;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

upstream frontend {
    server frontend:3000;
}

upstream backend {
    server backend:3011;
}

# ==============================================================================
# HTTP -> HTTPS redirect
# ==============================================================================
server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# ==============================================================================
# HTTPS Server (HARDENED)
# ==============================================================================
server {
    listen 443 ssl http2;
    server_name _;

    # ------------------------------------------------------------------
    # SSL/TLS Configuration
    # ------------------------------------------------------------------
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # ------------------------------------------------------------------
    # Security Headers
    # ------------------------------------------------------------------
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # Hide server information
    server_tokens off;
    proxy_hide_header X-Powered-By;
    proxy_hide_header Server;

    # ------------------------------------------------------------------
    # Request Limits
    # ------------------------------------------------------------------
    client_max_body_size 50M;
    client_body_buffer_size 1M;

    # Connection limits
    limit_conn conn_limit 50;

    # ------------------------------------------------------------------
    # Gzip Compression
    # ------------------------------------------------------------------
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json
               application/javascript application/rss+xml
               application/atom+xml image/svg+xml;

    # ------------------------------------------------------------------
    # Auth API routes (stricter rate limiting)
    # ------------------------------------------------------------------
    location /api/auth/login {
        limit_req zone=login_limit burst=3 nodelay;
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    location /api/auth/register {
        limit_req zone=login_limit burst=3 nodelay;
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    # ------------------------------------------------------------------
    # General API routes
    # ------------------------------------------------------------------
    location /api {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    # ------------------------------------------------------------------
    # WebSocket
    # ------------------------------------------------------------------
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # ------------------------------------------------------------------
    # Health check (no rate limiting)
    # ------------------------------------------------------------------
    location /health {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # ------------------------------------------------------------------
    # Static files caching
    # ------------------------------------------------------------------
    location /_next/static {
        proxy_pass http://frontend;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # ------------------------------------------------------------------
    # Frontend (catch-all)
    # ------------------------------------------------------------------
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # ------------------------------------------------------------------
    # Error pages
    # ------------------------------------------------------------------
    error_page 404 /404.html;
    error_page 500 502 503 504 /500.html;

    location = /404.html {
        root /etc/nginx/error-pages;
        internal;
    }

    location = /500.html {
        root /etc/nginx/error-pages;
        internal;
    }
}
NGINX_CONF

echo "Nginx configuration created (hardened)"
echo "Starting Nginx..."

exec "$@"
