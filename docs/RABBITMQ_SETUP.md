# RabbitMQ Setup Guide

This application uses **RabbitMQ** for message queuing (replacing BullMQ/Redis). We recommend using **CloudAMQP** (managed RabbitMQ service) for production.

## Quick Start with CloudAMQP

1. **Sign up for CloudAMQP** (free tier available): https://www.cloudamqp.com/

2. **Create a new instance** and copy your connection URL:
   ```
   amqp://user:password@host:port/vhost
   ```

3. **Add to your `.env.local` file**:
   ```bash
   # CloudAMQP URL (recommended)
   CLOUDAMQP_URL=amqp://user:password@host:port/vhost
   ```

## Manual RabbitMQ Setup

If you prefer to run RabbitMQ locally or on your own server:

```bash
# .env.local
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VHOST=/
```

## Environment Variables

| Variable | Description | Default |
|----------|-----------|---------|
| `CLOUDAMQP_URL` | Full CloudAMQP connection URL (recommended) | - |
| `RABBITMQ_HOST` | RabbitMQ server host | `localhost` |
| `RABBITMQ_PORT` | RabbitMQ server port | `5672` |
| `RABBITMQ_USERNAME` | RabbitMQ username | `guest` |
| `RABBITMQ_PASSWORD` | RabbitMQ password | `guest` |
| `RABBITMQ_VHOST` | RabbitMQ virtual host | `/` |

## Queues Used

The application uses the following RabbitMQ queues:

- **`message_outbound`** - Outbound messages (WhatsApp, Email, SMS, etc.)
- **`webhook_process`** - Incoming webhooks from all channels
- **`message_status`** - Message status updates
- **`conversation_merge`** - Conversation merging operations
- **`notification`** - System notifications
- **`contact_import`** - Contact CSV imports
- **`deal_import`** - Deal CSV imports

## Benefits of RabbitMQ

✅ **No Redis connection issues** - Separate service, no connection limit conflicts  
✅ **Better message routing** - Exchanges, queues, and bindings  
✅ **More reliable** - Message acknowledgments and persistence  
✅ **Better for production** - Handles high throughput, clustering support  
✅ **Better monitoring** - Management UI for monitoring queues  

## Migration from BullMQ

All message queuing has been migrated from BullMQ (Redis) to RabbitMQ:

- ✅ Message outbound worker
- ✅ Webhook processing worker
- ✅ All channel message sending
- ✅ All webhook handlers

**Redis is still used for:**
- Socket.IO pub/sub
- Caching
- Session storage

## Troubleshooting

### Connection Issues

If you see connection errors:

1. **Check your CloudAMQP URL** - Make sure it's correct and includes credentials
2. **Check firewall** - Ensure port 5672 (or your custom port) is open
3. **Check credentials** - Verify username/password are correct
4. **Check vhost** - Ensure the virtual host exists and you have permissions

### Queue Not Processing

If messages are queued but not processed:

1. **Check workers are running** - Look for "Worker started" logs in server output
2. **Check RabbitMQ Management UI** - Verify queues exist and have consumers
3. **Check logs** - Look for error messages in worker logs

## CloudAMQP Free Tier Limits

- **20 connections** - Should be enough for most applications
- **1 million messages/month** - Free tier limit
- **Upgrade** if you need more capacity

## Production Recommendations

1. **Use CloudAMQP** - Managed service is easier and more reliable
2. **Enable persistence** - Queues are already configured as durable
3. **Monitor queues** - Use CloudAMQP dashboard to monitor queue depth
4. **Set up alerts** - Configure alerts for queue depth and connection issues

