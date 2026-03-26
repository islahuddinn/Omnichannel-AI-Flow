// src/components/webchat/WebChatTypingIndicator.jsx
/**
 * WebChat Typing Indicator Component
 * Shows when agent is typing with modern animation
 */

'use client';

import { motion } from 'framer-motion';

export default function WebChatTypingIndicator() {
  return (
    <motion.div
      className="flex justify-start mb-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      role="status"
      aria-label="Agent is typing"
    >
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-md px-5 py-3 shadow-sm">
        <div className="flex gap-1.5">
          <motion.div 
            className="w-2 h-2 bg-purple-500 dark:bg-purple-400 rounded-full"
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
          />
          <motion.div 
            className="w-2 h-2 bg-indigo-500 dark:bg-indigo-400 rounded-full"
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
          />
          <motion.div 
            className="w-2 h-2 bg-purple-500 dark:bg-purple-400 rounded-full"
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
          />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Agent is typing...</p>
      </div>
    </motion.div>
  );
}

