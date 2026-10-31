#!/usr/bin/env bash
# Resets the labelled demonstration dataset through the API (requires the administrator account).
# Usage: API_URL=http://localhost:8000 DEMO_ADMIN_EMAIL=admin@boilerguard.demo DEMO_ADMIN_PASSWORD=Admin@12345 ./scripts/reset_demo.sh
set -euo pipefail

API_URL="${API_URL:-http://localhost:8000}"
EMAIL="${DEMO_ADMIN_EMAIL:-admin@boilerguard.demo}"
PASSWORD="${DEMO_ADMIN_PASSWORD:-Admin@12345}"

TOKEN=$(curl -fsS -X POST "$API_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])')

curl -fsS -X POST "$API_URL/api/admin/reset-demo" -H "Authorization: Bearer $TOKEN"
echo
