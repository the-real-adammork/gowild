#!/bin/bash
set -e

# Test script: creates a remotely-managed Cloudflare tunnel via API
# Usage: ./test-tunnel.sh
# Cleanup: ./test-tunnel.sh --cleanup
#
# Reads CF_DOMAIN and CF_SUBDOMAIN from .env (or prompts if missing).
# Creates tunnel named "${CF_SUBDOMAIN}-test" on "${CF_SUBDOMAIN}-test.${CF_DOMAIN}"

CF_API="https://api.cloudflare.com/client/v4"

# ---- Load .env if present ----
if [ -f "$(dirname "$0")/.env" ]; then
  set -a
  # Strip carriage returns and trailing whitespace
  eval "$(sed 's/\r$//' "$(dirname "$0")/.env" | grep -v '^\s*#' | grep -v '^\s*$' | sed 's/[[:space:]]*$//')"
  set +a
fi

# ---- Collect credentials (skipped if already in env) ----
if [ -z "$CF_API_TOKEN" ]; then
  read -p "Cloudflare API Token: " CF_API_TOKEN
fi
if [ -z "$CF_ACCOUNT_ID" ]; then
  read -p "Cloudflare Account ID: " CF_ACCOUNT_ID
fi
if [ -z "$CF_ZONE_ID" ]; then
  read -p "Cloudflare Zone ID: " CF_ZONE_ID
fi

if [ -z "$CF_DOMAIN" ]; then
  read -p "Domain (e.g., example.com): " CF_DOMAIN
fi
if [ -z "$CF_SUBDOMAIN" ]; then
  read -p "Subdomain (default: gowild): " CF_SUBDOMAIN
  CF_SUBDOMAIN=${CF_SUBDOMAIN:-gowild}
fi

TUNNEL_NAME="${CF_SUBDOMAIN}-test"
HOSTNAME="${TUNNEL_NAME}.${CF_DOMAIN}"
AUTH_HEADER="Authorization: Bearer ${CF_API_TOKEN}"

# ---- Cleanup mode ----
if [ "$1" = "--cleanup" ]; then
  echo "Cleaning up ${TUNNEL_NAME}..."

  # Find and delete Access app
  APPS=$(curl -s "${CF_API}/accounts/${CF_ACCOUNT_ID}/access/apps" -H "${AUTH_HEADER}")
  APP_ID=$(echo "$APPS" | jq -r ".result[] | select(.domain == \"${HOSTNAME}\") | .id" 2>/dev/null || echo "")
  if [ -n "$APP_ID" ]; then
    curl -s -X DELETE "${CF_API}/accounts/${CF_ACCOUNT_ID}/access/apps/${APP_ID}" -H "${AUTH_HEADER}" > /dev/null
    echo "  Deleted Access app: ${APP_ID}"
  fi

  # Find and delete DNS record
  DNS=$(curl -s "${CF_API}/zones/${CF_ZONE_ID}/dns_records?type=CNAME&name=${HOSTNAME}" -H "${AUTH_HEADER}")
  DNS_ID=$(echo "$DNS" | jq -r '.result[0].id // empty')
  if [ -n "$DNS_ID" ]; then
    curl -s -X DELETE "${CF_API}/zones/${CF_ZONE_ID}/dns_records/${DNS_ID}" -H "${AUTH_HEADER}" > /dev/null
    echo "  Deleted DNS record: ${DNS_ID}"
  fi

  # Find and delete tunnel
  TUNNELS=$(curl -s "${CF_API}/accounts/${CF_ACCOUNT_ID}/cfd_tunnel?name=${TUNNEL_NAME}&is_deleted=false" -H "${AUTH_HEADER}")
  TUNNEL_ID=$(echo "$TUNNELS" | jq -r '.result[0].id // empty')
  if [ -n "$TUNNEL_ID" ]; then
    curl -s -X DELETE "${CF_API}/accounts/${CF_ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}" -H "${AUTH_HEADER}" > /dev/null
    echo "  Deleted tunnel: ${TUNNEL_ID}"
  fi

  echo "Cleanup complete."
  exit 0
fi

# ---- Verify token ----
echo "Verifying API token..."
VERIFY=$(curl -s "${CF_API}/accounts/${CF_ACCOUNT_ID}/tokens/verify" -H "${AUTH_HEADER}")
if [ "$(echo "$VERIFY" | jq -r '.success')" != "true" ]; then
  echo "ERROR: Token verification failed"
  echo "$VERIFY" | jq .
  exit 1
fi
echo "  OK"

# ---- Step 1: Create tunnel ----
echo ""
echo "Step 1: Creating tunnel '${TUNNEL_NAME}'..."
TUNNEL_RESP=$(curl -s -X POST \
  "${CF_API}/accounts/${CF_ACCOUNT_ID}/cfd_tunnel" \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  --data "{\"name\":\"${TUNNEL_NAME}\",\"config_src\":\"cloudflare\",\"tunnel_secret\":\"$(openssl rand -base64 32)\"}")

if [ "$(echo "$TUNNEL_RESP" | jq -r '.success')" != "true" ]; then
  echo "  Already exists, looking up..."
  EXISTING=$(curl -s "${CF_API}/accounts/${CF_ACCOUNT_ID}/cfd_tunnel?name=${TUNNEL_NAME}&is_deleted=false" \
    -H "${AUTH_HEADER}")
  TUNNEL_ID=$(echo "$EXISTING" | jq -r '.result[0].id // empty')
  if [ -z "$TUNNEL_ID" ]; then
    echo "  ERROR: Could not create or find tunnel."
    exit 1
  fi
  echo "  Found existing tunnel: ${TUNNEL_ID}"
else
  TUNNEL_ID=$(echo "$TUNNEL_RESP" | jq -r '.result.id')
  echo "  Created tunnel: ${TUNNEL_ID}"
fi

# ---- Step 2: Configure ingress ----
echo ""
echo "Step 2: Configuring ingress (${HOSTNAME} -> localhost:3000)..."
INGRESS_RESP=$(curl -s -X PUT \
  "${CF_API}/accounts/${CF_ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}/configurations" \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  --data "{\"config\":{\"ingress\":[{\"hostname\":\"${HOSTNAME}\",\"service\":\"http://localhost:3000\"},{\"service\":\"http_status:404\"}]}}")

if [ "$(echo "$INGRESS_RESP" | jq -r '.success')" != "true" ]; then
  echo "  FAILED:"
  echo "$INGRESS_RESP" | jq '.errors'
else
  echo "  OK"
fi

# ---- Step 3: Create DNS CNAME ----
echo ""
echo "Step 3: Creating DNS CNAME (${HOSTNAME} -> ${TUNNEL_ID}.cfargotunnel.com)..."
DNS_RESP=$(curl -s -X POST \
  "${CF_API}/zones/${CF_ZONE_ID}/dns_records" \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  --data "{\"type\":\"CNAME\",\"proxied\":true,\"name\":\"${HOSTNAME}\",\"content\":\"${TUNNEL_ID}.cfargotunnel.com\"}")

if [ "$(echo "$DNS_RESP" | jq -r '.success')" != "true" ]; then
  echo "  FAILED:"
  echo "$DNS_RESP" | jq '.errors'
else
  echo "  OK"
fi

# ---- Step 4: Create Access application ----
echo ""
echo "Step 4: Creating Access application..."
APP_RESP=$(curl -s -X POST \
  "${CF_API}/accounts/${CF_ACCOUNT_ID}/access/apps" \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  --data "{\"type\":\"self_hosted\",\"name\":\"GoWild Test\",\"domain\":\"${HOSTNAME}\",\"session_duration\":\"24h\"}")

if [ "$(echo "$APP_RESP" | jq -r '.success')" != "true" ]; then
  echo "  FAILED:"
  echo "$APP_RESP" | jq '.errors'
else
  APP_ID=$(echo "$APP_RESP" | jq -r '.result.id')
  echo "  OK: ${APP_ID}"
fi

# ---- Step 5: Create Access policy ----
if [ -n "$APP_ID" ]; then
  echo ""
  read -p "Email to allow access (e.g., you@gmail.com): " ACCESS_EMAIL
  echo "Step 5: Creating Access policy (allow ${ACCESS_EMAIL})..."
  POLICY_RESP=$(curl -s -X POST \
    "${CF_API}/accounts/${CF_ACCOUNT_ID}/access/apps/${APP_ID}/policies" \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    --data "{\"name\":\"Allow owner\",\"decision\":\"allow\",\"include\":[{\"email\":{\"email\":\"${ACCESS_EMAIL}\"}}]}")

  if [ "$(echo "$POLICY_RESP" | jq -r '.success')" != "true" ]; then
    echo "  FAILED:"
    echo "$POLICY_RESP" | jq '.errors'
  else
    echo "  OK"
  fi
fi

# ---- Step 6: Get tunnel token ----
echo ""
echo "Step 6: Retrieving tunnel token..."
TOKEN_RESP=$(curl -s "${CF_API}/accounts/${CF_ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}/token" \
  -H "${AUTH_HEADER}")
TUNNEL_TOKEN=$(echo "$TOKEN_RESP" | jq -r '.result // empty')

if [ -n "$TUNNEL_TOKEN" ]; then
  echo "  OK"
  echo ""
  echo "======================================"
  echo " Test tunnel ready!"
  echo "======================================"
  echo ""
  echo "  URL: https://${HOSTNAME}"
  echo "  Tunnel ID: ${TUNNEL_ID}"
  echo ""
  echo "  To connect this machine:"
  echo "    sudo cloudflared service install ${TUNNEL_TOKEN}"
  echo ""
  echo "  To clean up when done:"
  echo "    ./test-tunnel.sh --cleanup"
else
  echo "  WARNING: Could not get token"
  echo "$TOKEN_RESP" | jq .
fi
