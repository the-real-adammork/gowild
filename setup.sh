#!/bin/bash
set -e

echo "======================================"
echo " GoWild Flight Tracker — Setup"
echo "======================================"
echo ""

cd "$(dirname "$0")"

# ---- Helper: load .env ----
load_env() {
  if [ -f .env ]; then
    set -a
    eval "$(sed 's/\r$//' .env | grep -v '^\s*#' | grep -v '^\s*$' | sed 's/[[:space:]]*$//')"
    set +a
  fi
}

# ---- Helper: save a value to .env ----
save_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i '' "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

# ---- Helper: prompt for a value if not set, save to .env ----
require_env() {
  local key="$1" prompt="$2" default="$3"
  eval "local current=\${$key}"
  if [ -z "$current" ]; then
    if [ -n "$default" ]; then
      read -p "${prompt} (default: ${default}): " value
      value=${value:-$default}
    else
      read -p "${prompt}: " value
    fi
    eval "export ${key}='${value}'"
    save_env "$key" "$value"
  fi
}

# ---- Check prerequisites ----
echo "Checking prerequisites..."

if ! command -v brew &>/dev/null; then
  echo "ERROR: Homebrew is not installed."
  echo "  Install it from https://brew.sh"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is not installed."
  echo "  Install it with: brew install node"
  exit 1
fi

# Auto-install jq if missing
if ! command -v jq &>/dev/null; then
  echo "  Installing jq..."
  brew install jq
fi

echo "  Homebrew: $(brew --version | head -1)"
echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"
echo "  jq: $(jq --version)"

# ---- Install npm dependencies ----
echo ""
echo "Installing npm dependencies..."
npm install

# ---- Environment file ----
if [ ! -f .env ]; then
  echo ""
  echo "Creating .env from .env.example..."
  cp .env.example .env
fi

load_env

# ---- Gmail credentials ----
echo ""
echo "========================================="
echo " Email Notifications"
echo "========================================="
echo ""
echo "  To get a Gmail app password:"
echo "    1. Go to https://myaccount.google.com/security"
echo "    2. Enable 2-Step Verification"
echo "    3. Go to https://myaccount.google.com/apppasswords"
echo "    4. Create an app password, copy the 16-char code"
echo ""

require_env "GMAIL_USER" "Gmail address"
require_env "GMAIL_APP_PASSWORD" "Gmail app password (16 chars, no spaces)"

# ---- Database ----
echo ""
echo "Setting up database..."
npx prisma db push
npx prisma db seed

# ---- Build ----
echo ""
echo "Building Next.js app..."
npm run build

# ---- Cloudflare Tunnel + Zero Trust Access (optional) ----
echo ""
echo "========================================="
echo " Cloudflare Tunnel + Zero Trust (optional)"
echo "========================================="
echo ""
echo "  This exposes the app publicly with email-gated auth."
echo "  Requires a domain on Cloudflare and an API token."
echo ""
read -p "Set up Cloudflare Tunnel? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then

  # Install cloudflared if missing
  if ! command -v cloudflared &>/dev/null; then
    echo ""
    echo "Installing cloudflared..."
    brew install cloudflared
  fi

  load_env

  # Collect Cloudflare config — prompt only for missing values
  echo ""
  echo "  You need a Cloudflare API token. See README.md for how to create one."
  echo ""

  require_env "CF_API_TOKEN" "Cloudflare API Token"
  require_env "CF_ACCOUNT_ID" "Cloudflare Account ID (dash.cloudflare.com > domain > Overview > right sidebar)"
  require_env "CF_ZONE_ID" "Cloudflare Zone ID (same location as Account ID)"
  require_env "CF_DOMAIN" "Your domain (e.g., example.com)"
  require_env "CF_SUBDOMAIN" "Subdomain for the tracker" "gowild"
  require_env "CF_ACCESS_EMAIL" "Your email for Access policy"

  HOSTNAME="${CF_SUBDOMAIN}.${CF_DOMAIN}"
  CF_API="https://api.cloudflare.com/client/v4"
  AUTH_HEADER="Authorization: Bearer ${CF_API_TOKEN}"

  # ---- Verify token ----
  echo ""
  echo "Verifying API token..."
  VERIFY=$(curl -s "${CF_API}/accounts/${CF_ACCOUNT_ID}/tokens/verify" -H "${AUTH_HEADER}")
  if [ "$(echo "$VERIFY" | jq -r '.success')" != "true" ]; then
    echo "ERROR: Token verification failed."
    echo "$VERIFY" | jq .
    echo ""
    echo "Check that your CF_API_TOKEN is correct in .env"
    exit 1
  fi
  echo "  Token verified."

  # ---- Create tunnel (remotely managed) ----
  echo ""
  echo "Creating tunnel '${CF_SUBDOMAIN}'..."
  TUNNEL_RESP=$(curl -s -X POST \
    "${CF_API}/accounts/${CF_ACCOUNT_ID}/cfd_tunnel" \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    --data "{\"name\":\"${CF_SUBDOMAIN}\",\"config_src\":\"cloudflare\",\"tunnel_secret\":\"$(openssl rand -base64 32)\"}")

  if [ "$(echo "$TUNNEL_RESP" | jq -r '.success')" != "true" ]; then
    echo "  Already exists, looking up..."
    EXISTING=$(curl -s "${CF_API}/accounts/${CF_ACCOUNT_ID}/cfd_tunnel?name=${CF_SUBDOMAIN}&is_deleted=false" \
      -H "${AUTH_HEADER}")
    TUNNEL_ID=$(echo "$EXISTING" | jq -r '.result[0].id // empty')
    if [ -z "$TUNNEL_ID" ]; then
      echo "ERROR: Could not create or find tunnel."
      echo "$TUNNEL_RESP" | jq .
      exit 1
    fi
    echo "  Found existing tunnel: ${TUNNEL_ID}"
  else
    TUNNEL_ID=$(echo "$TUNNEL_RESP" | jq -r '.result.id')
    echo "  Created tunnel: ${TUNNEL_ID}"
  fi

  # ---- Configure ingress ----
  echo ""
  echo "Configuring tunnel (${HOSTNAME} -> localhost:3000)..."
  INGRESS_RESP=$(curl -s -X PUT \
    "${CF_API}/accounts/${CF_ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}/configurations" \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    --data "{\"config\":{\"ingress\":[{\"hostname\":\"${HOSTNAME}\",\"service\":\"http://localhost:3000\"},{\"service\":\"http_status:404\"}]}}")

  if [ "$(echo "$INGRESS_RESP" | jq -r '.success')" != "true" ]; then
    echo "  WARNING: Ingress configuration may have failed."
    echo "$INGRESS_RESP" | jq '.errors'
  else
    echo "  OK"
  fi

  # ---- Create DNS CNAME ----
  echo ""
  echo "Setting up DNS (${HOSTNAME})..."
  EXISTING_DNS=$(curl -s "${CF_API}/zones/${CF_ZONE_ID}/dns_records?type=CNAME&name=${HOSTNAME}" \
    -H "${AUTH_HEADER}")
  EXISTING_DNS_ID=$(echo "$EXISTING_DNS" | jq -r '.result[0].id // empty')

  if [ -n "$EXISTING_DNS_ID" ]; then
    curl -s -X PUT \
      "${CF_API}/zones/${CF_ZONE_ID}/dns_records/${EXISTING_DNS_ID}" \
      -H "${AUTH_HEADER}" \
      -H "Content-Type: application/json" \
      --data "{\"type\":\"CNAME\",\"proxied\":true,\"name\":\"${HOSTNAME}\",\"content\":\"${TUNNEL_ID}.cfargotunnel.com\"}" > /dev/null
    echo "  Updated existing DNS record."
  else
    DNS_RESP=$(curl -s -X POST \
      "${CF_API}/zones/${CF_ZONE_ID}/dns_records" \
      -H "${AUTH_HEADER}" \
      -H "Content-Type: application/json" \
      --data "{\"type\":\"CNAME\",\"proxied\":true,\"name\":\"${HOSTNAME}\",\"content\":\"${TUNNEL_ID}.cfargotunnel.com\"}")
    if [ "$(echo "$DNS_RESP" | jq -r '.success')" != "true" ]; then
      echo "  WARNING: DNS creation may have failed."
      echo "$DNS_RESP" | jq '.errors'
    else
      echo "  OK"
    fi
  fi

  # ---- Create Access application ----
  echo ""
  echo "Setting up Zero Trust Access..."
  EXISTING_APP=$(curl -s "${CF_API}/accounts/${CF_ACCOUNT_ID}/access/apps" \
    -H "${AUTH_HEADER}")
  APP_ID=$(echo "$EXISTING_APP" | jq -r ".result[] | select(.domain == \"${HOSTNAME}\") | .id" 2>/dev/null || echo "")

  if [ -n "$APP_ID" ]; then
    echo "  Access app already exists."
  else
    APP_RESP=$(curl -s -X POST \
      "${CF_API}/accounts/${CF_ACCOUNT_ID}/access/apps" \
      -H "${AUTH_HEADER}" \
      -H "Content-Type: application/json" \
      --data "{\"type\":\"self_hosted\",\"name\":\"GoWild Tracker\",\"domain\":\"${HOSTNAME}\",\"session_duration\":\"24h\"}")

    if [ "$(echo "$APP_RESP" | jq -r '.success')" != "true" ]; then
      echo "  WARNING: Access app creation may have failed."
      echo "$APP_RESP" | jq '.errors'
    else
      APP_ID=$(echo "$APP_RESP" | jq -r '.result.id')
      echo "  Access app created."
    fi
  fi

  # ---- Create Access policy ----
  if [ -n "$APP_ID" ]; then
    echo "  Creating Access policy (allow ${CF_ACCESS_EMAIL})..."
    POLICY_RESP=$(curl -s -X POST \
      "${CF_API}/accounts/${CF_ACCOUNT_ID}/access/apps/${APP_ID}/policies" \
      -H "${AUTH_HEADER}" \
      -H "Content-Type: application/json" \
      --data "{\"name\":\"Allow owner\",\"decision\":\"allow\",\"include\":[{\"email\":{\"email\":\"${CF_ACCESS_EMAIL}\"}}]}")

    if [ "$(echo "$POLICY_RESP" | jq -r '.success')" != "true" ]; then
      echo "  (policy may already exist — OK)"
    else
      echo "  OK"
    fi
  fi

  # ---- Install cloudflared service ----
  echo ""
  echo "Retrieving tunnel token..."
  TOKEN_RESP=$(curl -s "${CF_API}/accounts/${CF_ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}/token" \
    -H "${AUTH_HEADER}")
  TUNNEL_TOKEN=$(echo "$TOKEN_RESP" | jq -r '.result // empty')

  if [ -n "$TUNNEL_TOKEN" ]; then
    echo "Installing tunnel service..."
    # Uninstall existing service if present
    sudo cloudflared service uninstall 2>/dev/null || true
    sudo cloudflared service install "$TUNNEL_TOKEN"
    echo "  Tunnel service installed."
  else
    echo "  WARNING: Could not get tunnel token."
    echo "  Get it from: Cloudflare dashboard > Networks > Tunnels > ${CF_SUBDOMAIN}"
    echo "  Then run: sudo cloudflared service install <TOKEN>"
  fi

  echo ""
  echo "Cloudflare setup complete!"
  echo "  URL: https://${HOSTNAME}"
  echo "  Auth: ${CF_ACCESS_EMAIL}"
fi

# ---- pm2 ----
echo ""
echo "========================================="
echo " Process Manager (pm2)"
echo "========================================="
echo ""

# Auto-install pm2 if missing
if ! command -v pm2 &>/dev/null; then
  echo "Installing pm2..."
  npm install -g pm2
fi

read -p "Start the app with pm2? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  pm2 start ecosystem.config.js
  pm2 save

  echo ""
  echo "Setting up pm2 to start on boot..."
  STARTUP_CMD=$(pm2 startup launchd -u "$(whoami)" --hp "$HOME" 2>&1 | grep "sudo" | head -1)
  if [ -n "$STARTUP_CMD" ]; then
    echo ""
    echo "  Run this command to persist pm2 across reboots:"
    echo ""
    echo "    $STARTUP_CMD"
    echo ""
    read -p "  Run it now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      eval "$STARTUP_CMD"
      echo "  pm2 will now start on boot."
    fi
  fi
fi

# ---- Done ----
echo ""
echo "======================================"
echo " Setup complete!"
echo "======================================"
echo ""
echo "  Local:  http://localhost:3000"
if [[ -n "$HOSTNAME" ]]; then
  echo "  Public: https://${HOSTNAME}"
fi
echo ""
echo "  Next steps:"
echo "    1. Open the app and add your routes (e.g., SFO -> SLC)"
echo "    2. Go to Settings, configure email and fare tabs"
echo "    3. Click 'Scrape Now' to test"
echo "    4. The scheduler runs automatically 4x/day"
echo ""
