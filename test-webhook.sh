#!/bin/bash
# Test webhook endpoint accessibility

echo "Testing webhook endpoint..."
echo ""

echo "1. Testing GET (verification):"
curl -X GET "http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test&hub.challenge=test123" -v 2>&1 | grep -E "HTTP|GET|challenge" | head -5
echo ""

echo "2. Testing POST (webhook):"
curl -X POST "http://localhost:3000/api/webhooks/whatsapp" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=test" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "changes": [{
        "value": {
          "metadata": {
            "phone_number_id": "587614997776033"
          },
          "messages": [{
            "id": "wamid.test123",
            "from": "923001234567",
            "type": "text",
            "text": {
              "body": "Test message"
            },
            "timestamp": "1234567890"
          }]
        },
        "field": "messages"
      }]
    }]
  }' -v 2>&1 | grep -E "POST|HTTP|📥|EVENT" | head -10
echo ""

echo "3. Checking if server is running:"
netstat -tuln 2>/dev/null | grep ":3000" || ss -tuln 2>/dev/null | grep ":3000" || echo "Port 3000 not listening"
echo ""

