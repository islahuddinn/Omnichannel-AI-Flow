// src/components/chat/MessageStatus.jsx
'use client';

import { Clock, Check, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MessageStatus({ status, direction, className, channel, errorMessage }) {
  // Only show status for outbound messages
  if (direction !== 'outbound') return null;

  const isEmail = channel === 'email';

  const getStatusIcon = () => {
    const isWhatsApp = channel === 'whatsapp';
    
    switch (status) {
      case 'pending':
      case 'queued':
      case 'sending':
        // ⏰ Clock icon for pending (waiting to send) - Shows for all channels
        return <Clock className="h-3 w-3 text-gray-600 dark:text-gray-400" />;
      
      case 'sent':
        // ✅ Single gray tick for ALL channels when sent (sent to server)
        // WhatsApp: Single gray tick (sent to server, recipient may be offline)
        // Email/SMS: Single gray tick (sent to server, waiting for delivery confirmation)
        return <Check className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />;
      
      case 'delivered':
        // ✅✅ Double gray ticks (delivered to recipient's device)
        // For WhatsApp: Delivered when recipient is online
        // For Email/SMS: Delivered when message reaches recipient
        return <CheckCheck className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />;
      
      case 'read':
        // ✅✅ Double BLUE ticks (read by recipient)
        // Only applicable for WhatsApp (read receipts)
        // For other channels, this can be manually set if read tracking is enabled
        return <CheckCheck className="h-3.5 w-3.5 text-primary drop-shadow-sm" />;
      
      case 'retrying':
        return (
          <span className="text-amber-500 text-xs font-semibold animate-pulse" title={errorMessage || 'Retrying...'}>
            ↻
          </span>
        );

      case 'failed':
        return (
          <span className="text-red-500 text-xs font-semibold" title={errorMessage || 'Failed to send'}>
            ✗
          </span>
        );

      default:
        return null;
    }
  };

  return (
    <span 
      className={cn('inline-flex items-center', className)} 
      title={`Message ${status}`}
    >
      {getStatusIcon()}
    </span>
  );
}
