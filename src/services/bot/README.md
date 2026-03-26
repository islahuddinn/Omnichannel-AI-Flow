# AI Bot Integration Service

This service provides extensible AI bot integration for automatic message responses when conversations are in `auto` mode.

## Features

- ✅ Automatic bot responses for conversations in `auto` mode
- ✅ Extensible architecture for multiple bot providers
- ✅ Configurable via environment variables
- ✅ Works with all channels (WhatsApp, Email, SMS, WebChat, etc.)
- ✅ Non-blocking async processing (doesn't delay message delivery)
- ✅ Comprehensive error handling and logging

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Enable/disable bot service (default: true)
AI_BOT_ENABLED=true

# Bot API base URL (default: http://localhost:8000)
AI_BOT_BASE_URL=http://localhost:8000
```

## How It Works

1. **Inbound Message Received**: When an inbound message arrives (via webhook, email, or webchat)
2. **Mode Check**: System checks if conversation `mode === 'auto'`
3. **Text Message Check**: Only processes text messages (skips media, attachments, etc.)
4. **Bot API Call**: Calls the configured bot API with message context
5. **Response Sent**: Bot response is automatically sent back to the user on the same channel

## Bot API Format

The service calls your bot API with the following payload:

```json
{
  "tenant_id": "handyman_co",
  "conversation_id": "conv_abc123",
  "contact_id": "user_xyz",
  "message": "My light switch is broken",
  "platform": "whatsapp",
  "contact_name": "Alice"
}
```

**Expected Response:**
```json
{
  "response": "I can help you with that! Let me connect you with a technician..."
}
```

## Supported Channels

- ✅ WhatsApp
- ✅ Email
- ✅ SMS
- ✅ WebChat
- ✅ Facebook
- ✅ Instagram

## Adding New Bot Providers

To add a new bot provider, update `src/config/bot.js`:

```javascript
providers: {
  // Your new provider
  mybot: {
    enabled: true,
    baseUrl: 'https://api.mybot.com',
    endpoint: '/v1/chat',
    timeout: 30000,
    // ... other config
  },
}
```

Then set `AI_BOT_PROVIDER=mybot` in your environment.

## Conversation Mode

Conversations have two modes:
- **`auto`**: Bot automatically responds to inbound messages
- **`manual`**: Only human agents respond (bot is disabled)

You can change conversation mode via the API:
```
PATCH /api/conversations/[conversationId]/mode
{
  "mode": "auto" | "manual"
}
```

## Error Handling

- Bot failures are logged but don't break message processing
- Failed bot calls don't prevent messages from being delivered
- All errors are logged with full context for debugging

## Logging

The service provides comprehensive logging:
- 🤖 Bot API calls
- ✅ Successful responses
- ❌ Errors and failures
- ℹ️ Skipped calls (manual mode, non-text messages)

