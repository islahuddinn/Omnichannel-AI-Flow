// src/components/chat/SalesforceToastListener.jsx
// Listens for real-time Salesforce update events and shows toast notifications
'use client';

import { useCallback } from 'react';
import { useSocketEvent } from '@/hooks/useSocket';
import { toast } from 'sonner';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function SalesforceToastListener() {
  useSocketEvent('salesforce:update', useCallback((data) => {
    if (!data?.updates?.length) return;

    for (const update of data.updates) {
      const objName = update.object === 'Deal__c' ? 'Deal' : 'Contact';

      if (update.status === 'success') {
        toast.success(
          `Salesforce ${objName} updated: ${update.fields?.join(', ') || 'fields updated'}`,
          {
            description: data.outcomeName ? `Triggered by: ${data.outcomeName}` : undefined,
            icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
            duration: 5000,
          }
        );
      } else if (update.status === 'failed') {
        toast.error(
          `Salesforce ${objName} update failed`,
          {
            description: update.error || 'Unknown error',
            icon: <XCircle className="h-4 w-4 text-red-500" />,
            duration: 8000,
          }
        );
      }
    }
  }, []));

  return null; // No visual output — just a listener
}
