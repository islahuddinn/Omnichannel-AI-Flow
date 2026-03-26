// src/components/webchat/WebChatWelcomeMessage.jsx
/**
 * Welcome Message Component for WebChat
 * Displays welcome banner/message when conversation starts
 */

'use client';

import { motion } from 'framer-motion';
import { MessageCircle, Sparkles } from 'lucide-react';
import { useTheme } from 'next-themes';

export default function WebChatWelcomeMessage({ welcomeMessage, agentName, companyName, companyInfo, agentInfo }) {
  const { theme } = useTheme();
  
  const defaultMessage = welcomeMessage || `Hello! 👋 Welcome to our support chat. How can we help you today?`;
  const displayAgentName = agentName || companyName || 'Support Team';
  const displayCompanyName = companyName || 'Support Team';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center py-8 px-4 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        className="mb-4"
      >
        <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-500 dark:from-purple-600 dark:to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
          <MessageCircle className="w-10 h-10 text-white" />
        </div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2"
      >
        {displayCompanyName && displayCompanyName !== 'Support Team' ? (
          <>Welcome to {displayCompanyName}!</>
        ) : (
          <>Welcome to {displayAgentName}!</>
        )}
      </motion.h2>

      {agentInfo?.name && agentInfo.name !== displayCompanyName && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="text-sm text-gray-700 dark:text-gray-300 mb-2 font-medium"
        >
          Chatting with {agentInfo.name}
        </motion.p>
      )}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-md leading-relaxed"
      >
        {defaultMessage}
      </motion.p>
      
      {companyInfo && (companyInfo.email || companyInfo.phone) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-4 text-xs text-gray-500 dark:text-gray-400 space-y-1"
        >
          {companyInfo.email && (
            <p>📧 {companyInfo.email}</p>
          )}
          {companyInfo.phone && (
            <p>📞 {companyInfo.phone}</p>
          )}
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="mt-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500"
      >
        <Sparkles className="w-4 h-4" />
        <span>We're here to help!</span>
      </motion.div>
    </motion.div>
  );
}

