// src/components/webchat/WebChatMessageList.jsx
/**
 * WebChat Message List Component
 * Displays messages in the chat window with modern styling
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import WebChatMessageBubble from './WebChatMessageBubble';
import WebChatWelcomeMessage from './WebChatWelcomeMessage';

export default function WebChatMessageList({ messages, session, messagesEndRef, showWelcome = true, welcomeMessage, agentName, companyName, companyInfo, agentInfo, onLoadMore, isLoadingMore, hasMoreMessages }) {
  const scrollContainerRef = useRef(null);
  const [isNearTop, setIsNearTop] = useState(false);
  const [firstUnreadIndex, setFirstUnreadIndex] = useState(-1);

  // Track the first unread message for the "New Messages" separator
  useEffect(() => {
    const index = messages.findIndex(m => m.direction === 'outbound' && !m.isRead);
    setFirstUnreadIndex(index);
  }, []); // Only on mount to prevent it from updating as messages are read

  // ✅ Handle scroll for infinite loading
  const handleScroll = useCallback((e) => {
    const container = e.currentTarget || e.target;
    if (!container) return;
    
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    // Check if near top (within 200px) and not already loading
    if (scrollTop < 200 && hasMoreMessages && !isLoadingMore && onLoadMore) {
      setIsNearTop(true);
      onLoadMore();
    } else {
      setIsNearTop(false);
    }
  }, [hasMoreMessages, isLoadingMore, onLoadMore]);

  // ✅ Scroll to bottom when new messages arrive (but not when loading more)
  useEffect(() => {
    if (messagesEndRef?.current && !isLoadingMore) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, messagesEndRef, isLoadingMore]);

  // ✅ Attach scroll handler to the actual scrollable container (parent)
  useEffect(() => {
    if (!scrollContainerRef.current) return;

    let attachedParent = null;

    // Find the scrollable parent - wait a bit for DOM to be ready
    const findScrollableParent = () => {
      let current = scrollContainerRef.current?.parentElement;
      while (current) {
        const styles = window.getComputedStyle(current);
        if (styles.overflowY === 'auto' || styles.overflowY === 'scroll' || current.classList.contains('overflow-y-auto')) {
          return current;
        }
        current = current.parentElement;
        if (current === document.body || current === document.documentElement) break;
      }
      return null;
    };

    const attachListener = (parent) => {
      if (parent) {
        attachedParent = parent;
        parent.addEventListener('scroll', handleScroll, { passive: true });
      }
    };

    // Try immediately, then retry after a short delay
    const scrollableParent = findScrollableParent();
    if (scrollableParent) {
      attachListener(scrollableParent);
    } else {
      const timeout = setTimeout(() => {
        const deferredParent = findScrollableParent();
        attachListener(deferredParent);
      }, 100);
      return () => {
        clearTimeout(timeout);
        if (attachedParent) {
          attachedParent.removeEventListener('scroll', handleScroll);
        }
      };
    }

    return () => {
      if (attachedParent) {
        attachedParent.removeEventListener('scroll', handleScroll);
      }
    };
  }, [handleScroll]);

  // ✅ Early returns AFTER all hooks
  if (messages.length === 0 && showWelcome) {
    return <WebChatWelcomeMessage 
      welcomeMessage={welcomeMessage} 
      agentName={agentName || agentInfo?.name || companyName} 
      companyName={companyName || session?.companyInfo?.name}
      companyInfo={companyInfo || session?.companyInfo}
      agentInfo={agentInfo || session?.agentInfo}
    />;
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">💬</div>
          <p className="text-gray-500 dark:text-gray-400 text-lg">No messages yet. Start the conversation!</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={scrollContainerRef} 
      className="space-y-1"
    >
      {/* Load More Indicator */}
      <AnimatePresence>
        {isLoadingMore && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex items-center justify-center py-4"
          >
            <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Loading previous messages...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {messages.map((message, index) => {
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const showDateSeparator = !prevMessage || 
          new Date(message.createdAt).toDateString() !== new Date(prevMessage.createdAt).toDateString();

        // ✅ CRITICAL: Generate unique key combining _id, tempId, and index
        const uniqueKey = message._id
          ? `msg_${message._id}_${index}`
          : message.tempId
            ? `temp_${message.tempId}_${index}`
            : `msg_fallback_${index}`;

        return (
          <div key={uniqueKey}>
            {showDateSeparator && (
              <div className="text-center text-xs text-gray-400 dark:text-gray-500 my-6 flex items-center justify-center">
                <div className="bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
                  {format(new Date(message.createdAt), 'MMMM d, yyyy')}
                </div>
              </div>
            )}
            {index === firstUnreadIndex && firstUnreadIndex > 0 && (
              <div className="flex items-center gap-3 my-4 px-4">
                <div className="flex-1 h-px bg-blue-400/50" />
                <span className="text-xs font-medium text-blue-500 dark:text-blue-400 whitespace-nowrap">New Messages</span>
                <div className="flex-1 h-px bg-blue-400/50" />
              </div>
            )}
            <WebChatMessageBubble
              message={message} 
              isOwn={message.direction === 'inbound'} // ✅ Invert: Inbound messages (from visitor) are their own messages (right side)
              onReact={message.onReact}
              onReply={message.onReply}
              onCopy={message.onCopy}
              currentContactId={message.currentContactId} // ✅ Pass currentContactId
              socket={message.socket}
              conversationId={message.conversationId}
            />
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}

