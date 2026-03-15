#!/bin/sh
set -eu

TEMPLATE_DIR="/etc/nginx/templates"
CONF_FILE="/etc/nginx/conf.d/default.conf"
CERT_DIR="/etc/letsencrypt/live/${APP_DOMAIN:-localhost}"
FULLCHAIN="${CERT_DIR}/fullchain.pem"
PRIVKEY="${CERT_DIR}/privkey.pem"

if [ -f "$FULLCHAIN" ] && [ -f "$PRIVKEY" ]; then
  echo "[nginx] SSL certificate found for ${APP_DOMAIN:-localhost}, enabling HTTPS config"
  envsubst '${APP_DOMAIN} ${NGINX_CLIENT_MAX_BODY_SIZE}' < "${TEMPLATE_DIR}/https.conf.template" > "$CONF_FILE"
else
  echo "[nginx] SSL certificate not found, using HTTP config only"
  envsubst '${APP_DOMAIN} ${NGINX_CLIENT_MAX_BODY_SIZE}' < "${TEMPLATE_DIR}/http.conf.template" > "$CONF_FILE"
fi

exec nginx -g 'daemon off;'
