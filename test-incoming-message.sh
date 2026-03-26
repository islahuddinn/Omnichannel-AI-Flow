#!/bin/bash
# Test incoming message flow locally

echo "🧪 Testing incoming message flow..."
echo ""
echo "This will simulate an incoming WhatsApp message"
echo "Make sure your server is running and you're logged in"
echo ""

# Get tenant ID and channel account ID from user
read -p "Enter your tenantId (or press Enter to use default lookup): " TENANT_ID
read -p "Enter your channelAccountId (or press Enter to use default lookup): " CHANNEL_ACCOUNT_ID

# Default phone number ID (from your logs)
PHONE_NUMBER_ID="587614997776033"
FROM="923001234567"  # Test sender phone
MESSAGE="Test incoming message $(date +%H:%M:%S)"

echo ""
echo "Sending test webhook with:"
echo "  - Phone Number ID: $PHONE_NUMBER_ID"
echo "  - From: $FROM"
echo "  - Message: $MESSAGE"
echo "  - Tenant ID: ${TENANT_ID:-'Will be resolved'}"
echo "  - Channel Account ID: ${CHANNEL_ACCOUNT_ID:-'Will be resolved'}"
echo ""

PAYLOAD="{\"phoneNumberId\":\"$PHONE_NUMBER_ID\",\"from\":\"$FROM\",\"message\":\"$MESSAGE\""

if [ ! -z "$TENANT_ID" ]; then
  PAYLOAD="$PAYLOAD,\"tenantId\":\"$TENANT_ID\""
fi

if [ ! -z "$CHANNEL_ACCOUNT_ID" ]; then
  PAYLOAD="$PAYLOAD,\"channelAccountId\":\"$CHANNEL_ACCOUNT_ID\""
fi

PAYLOAD="$PAYLOAD}"

curl -X POST http://localhost:3000/api/test/webhook \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  -w "\n\nHTTP Status: %{http_code}\n"

echo ""
echo "✅ Test webhook sent!"
echo "Check your server logs for:"
echo "  - 📥 Webhook processing logs"
echo "  - 💬 Incoming message processing"
echo "  - 📡 Socket emission logs"
echo "  - 💬 MessageListWithInfiniteScroll receiving the event"
echo ""
