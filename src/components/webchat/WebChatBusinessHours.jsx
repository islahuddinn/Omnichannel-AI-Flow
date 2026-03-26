// src/components/webchat/WebChatBusinessHours.jsx
/**
 * Business Hours Component for WebChat
 * Displays availability status and business hours
 */

'use client';

import { Clock, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';

export default function WebChatBusinessHours({ isAvailable, businessHours, offlineMessage }) {
  const { theme } = useTheme();

  if (!isAvailable) {
    const defaultOfflineMessage = offlineMessage || 
      "We're currently offline. Please leave a message and we'll get back to you soon!";

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-500 p-4 rounded-lg mb-4"
      >
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
              Currently Offline
            </h4>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              {defaultOfflineMessage}
            </p>
            {businessHours && (
              <div className="mt-2 text-xs text-yellow-700 dark:text-yellow-300">
                <p className="font-medium">Business Hours:</p>
                <p>{businessHours}</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  return null; // Don't show anything if available
}

