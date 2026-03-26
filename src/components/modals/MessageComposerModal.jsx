// src/components/modals/MessageComposerModal.jsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import MessageComposer from '@/components/chat/MessageComposer';
import MessageListWithInfiniteScroll from '@/components/chat/MessageListWithInfiniteScroll';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSocketEvent } from '@/hooks/useSocket';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, AlertCircle, Building2 } from 'lucide-react';

export default function MessageComposerModal({
  open,
  onClose,
  conversationData,
  contactData,
  channelAccount,
  availableAccounts,
  channelType,
  identifier,
  contactName
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [isCheckingConversation, setIsCheckingConversation] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState([]);
  const [departmentError, setDepartmentError] = useState(null);
  const messagesEndRef = useRef(null);

  // Check if conversation exists when modal opens
  useEffect(() => {
    if (open) {
      // For webchat, check if we have either identifier or contactData with webchat identifier
      if (channelType === 'webchat') {
        const hasWebchatIdentifier = identifier || contactData?.identifiers?.webchat || contactData?.webchatLink;
        if (hasWebchatIdentifier && channelAccount?._id) {
          checkExistingConversation();
        } else if (contactData?._id && channelAccount?._id) {
          // Try with contact ID as fallback
          checkExistingConversation();
        }
      } else if (channelType && identifier && channelAccount?._id) {
        checkExistingConversation();
      }
    }
  }, [open, channelType, identifier, channelAccount?._id, contactData?._id, contactData?.identifiers?.webchat, contactData?.webchatLink]);

  const checkExistingConversation = async () => {
    setIsCheckingConversation(true);
    try {
      // For webchat, use webchat identifier from contact if available
      const effectiveIdentifier = channelType === 'webchat' && contactData?.identifiers?.webchat 
        ? contactData.identifiers.webchat 
        : (channelType === 'webchat' && contactData?.webchatLink 
          ? contactData.webchatLink.split('/').pop() 
          : identifier);
      
      const response = await apiClient.post('/conversations/start', {
        channel: channelType,
        identifier: effectiveIdentifier,
        contactName: contactName || contactData?.name || contactData?.displayName,
        channelAccountId: channelAccount?._id
      });

      const data = response?.data;

      if (data?.type === 'existing' && data?.conversationId) {
        // Conversation exists - close modal and navigate directly
        toast.success('Opening existing conversation');
        setIsClosing(true);
        setTimeout(() => {
          onClose();
          router.push(`/c/conversations/${data.conversationId}`);
        }, 300);
        return;
      } else {
        // No conversation exists - set up for new conversation
        setConversationId('new');
        setConversation({
          channel: channelType,
          contact: contactData,
          channelAccount: channelAccount,
          status: 'active',
          ...(data?.conversation || {})
        });
      }
    } catch (error) {
      console.error('Error checking conversation:', error);
      
      // ✅ Handle department access error
      const errorData = error.response?.data || error.data || {};
      if (errorData.errorCode === 'CONVERSATION_EXISTS_IN_OTHER_DEPARTMENT' || 
          errorData.error?.includes('already exists in')) {
        setDepartmentError({
          message: errorData.error || 'A conversation with this contact already exists in another department',
          departmentName: errorData.departmentName || 'another department'
        });
        // Don't set up for new conversation if there's a department access error
        return;
      }
      
      // Even on error, set up for new conversation so user can still send messages
      setConversationId('new');
      setConversation({
        channel: channelType,
        contact: contactData,
        channelAccount: channelAccount,
        status: 'active'
      });
    } finally {
      setIsCheckingConversation(false);
    }
  };

  // Listen for new conversation events in real-time
  useSocketEvent('conversation:new', useCallback((data) => {
    if (!data?.conversation) return;
    
    const newConv = data.conversation;
    const newConvContactId = newConv.contact?._id || newConv.contact;
    const currentContactId = contactData?._id || conversationData?.contact?._id;
    
    const channelMatches = newConv.channel === channelType;
    const contactMatches = String(newConvContactId) === String(currentContactId) || 
                          (contactData?.phone && newConv.contact?.phone === contactData.phone) ||
                          (contactData?.email && newConv.contact?.email === contactData.email) ||
                          (channelType === 'webchat' && contactData?.identifiers?.webchat && newConv.contact?.identifiers?.webchat === contactData.identifiers.webchat);
    const accountMatches = newConv.channelAccount?._id === channelAccount?._id ||
                          String(newConv.channelAccount?._id) === String(channelAccount?._id);
    
    if (channelMatches && contactMatches && accountMatches) {
      setConversationId(newConv._id);
      setConversation({
        ...newConv,
        contact: data.contact || contactData,
        channelAccount: newConv.channelAccount || channelAccount
      });
      
      queryClient.setQueryData(['conversation', newConv._id], {
        data: {
          ...newConv,
          contact: data.contact || contactData,
          channelAccount: newConv.channelAccount || channelAccount
        }
      });
      
      // ✅ Close modal and reload page if this is a new conversation that was just created
      if (conversationId === 'new') {
        setIsClosing(true);
        // Store conversationId for selection after reload
        sessionStorage.setItem('newConversationId', newConv._id);
        setTimeout(() => {
          onClose();
          // Reload the conversations page after 2 seconds
          setTimeout(() => {
            window.location.href = '/c/conversations';
          }, 2000);
        }, 600);
      }
    }
  }, [channelType, channelAccount, contactData, conversationData, queryClient, conversationId, router, onClose]));

  // Listen for new messages in real-time
  useSocketEvent('message:new', useCallback((data) => {
    if (!data?.message) return;
    
    const messageConvId = String(data.conversationId || data.message?.conversation || data.message?.conversationId || '');
    const currentConvId = String(conversationId || '');
    
    // If we're waiting for a new conversation and this message has a conversationId
    if (conversationId === 'new' && messageConvId && messageConvId !== 'new') {
      // This is likely our message that created the conversation
      setConversationId(messageConvId);
      
      // ✅ Store conversationId for selection after reload
      sessionStorage.setItem('newConversationId', messageConvId);
      
      // Close modal and reload page after 2 seconds
      setIsClosing(true);
      setTimeout(() => {
        onClose();
        // Reload the conversations page after 2 seconds
        setTimeout(() => {
          window.location.href = '/c/conversations';
        }, 2000);
      }, 600);
      return;
    }
    
    if (messageConvId === currentConvId && conversationId && conversationId !== 'new') {
      if (conversation) {
        setConversation(prev => ({
          ...prev,
          lastMessageAt: new Date(),
          lastMessageContent: data.message?.text || data.message?.content?.text || '',
          messageCount: (prev.messageCount || 0) + 1
        }));
      }
      
      // Remove optimistic message if it exists
      setOptimisticMessages(prev => 
        prev.filter(msg => {
          const tempId = msg.tempId || msg._id;
          const realTempId = data.message?.tempId || data.message?.metadata?.tempId;
          return tempId !== realTempId;
        })
      );
    }
  }, [conversationId, conversation, router, onClose]));

  // Handle message sent - close modal with animation
  const handleMessageSent = useCallback((messageData) => {
    // Add optimistic message
    if (messageData && !messageData.conversationId && messageData._id) {
      setOptimisticMessages(prev => [...prev, messageData]);
    }
    
    // If messageData has conversationId, it means a conversation was created
    if (messageData?.conversationId) {
      setConversationId(messageData.conversationId);
      
      // Start closing animation
      setIsClosing(true);
      
      // ✅ For new conversations: Store conversationId and reload page after 2 seconds
      // Store in sessionStorage so it can be selected after reload
      sessionStorage.setItem('newConversationId', messageData.conversationId);
      
      // Close modal, then reload page after 2 seconds
      setTimeout(() => {
        onClose();
        // Reload the conversations page after 2 seconds
        setTimeout(() => {
          window.location.href = '/c/conversations';
        }, 2000);
      }, 600);
    } else if (conversationId && conversationId !== 'new') {
      // Existing conversation - close modal with animation immediately
      setIsClosing(true);
      setTimeout(() => {
        onClose();
        router.push(`/c/conversations/${conversationId}`);
      }, 600);
    } else if (conversationId === 'new') {
      // New conversation - wait for socket event to get conversationId
      // The socket event handler will close the modal
      // But also set a timeout as fallback
      setTimeout(() => {
        // If still no conversationId after 3 seconds, check again
        if (conversationId === 'new') {
          checkExistingConversation();
        }
      }, 3000);
    }
  }, [conversationId, router, onClose]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [optimisticMessages, conversation]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setConversationId(null);
      setConversation(null);
      setIsCheckingConversation(false);
      setIsClosing(false);
      setOptimisticMessages([]);
      setDepartmentError(null);
    }
  }, [open]);

  return (
    <>
      <Dialog open={open && !isClosing} onOpenChange={onClose}>
        <DialogContent 
          className="p-0 gap-0 max-w-[80vw] w-[80vw] max-h-[80vh] h-[80vh] flex flex-col overflow-hidden"
          style={{ width: '80vw', height: '80vh', maxWidth: '80vw', maxHeight: '80vh' }}
          showCloseButton={false}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 30,
              duration: 0.4
            }}
            className="flex flex-col h-full w-full"
          >
              {/* Department Access Error Display */}
              {departmentError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mx-4 mt-4 mb-0"
                >
                  <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-lg p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1.5">
                          Conversation Already Exists
                        </h3>
                        <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                          A conversation with this contact already exists in{' '}
                          <span className="font-semibold inline-flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {departmentError.departmentName}
                          </span>
                          . Each department maintains separate conversations with contacts.
                        </p>
                        <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800">
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            💡 <strong>Tip:</strong> To access this conversation, you need to be assigned to that department or contact your administrator.
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDepartmentError(null);
                          onClose();
                        }}
                        className="h-8 w-8 p-0 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Header */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="px-6 py-4 border-b shrink-0 bg-white dark:bg-gray-900 relative"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle asChild>
                      <motion.h2
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 }}
                        className="text-xl font-semibold text-gray-900 dark:text-gray-100"
                      >
                        {conversationId === 'new' ? 'New Conversation' : 'Conversation'}
                      </motion.h2>
                    </DialogTitle>
                    {contactData && (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mt-1 text-sm text-gray-600 dark:text-gray-400"
                      >
                        <span className="font-medium">{contactData.name || contactData.displayName || 'Unknown'}</span>
                        {identifier && (
                          <span className="ml-2">
                            {channelType === 'email' ? identifier : `(${identifier})`}
                          </span>
                        )}
                      </motion.div>
                    )}
                  </div>
                  
                  {/* Single Close Button with Animation */}
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8, rotate: -90 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 300, 
                      damping: 20,
                      delay: 0.2
                    }}
                    onClick={onClose}
                    className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                  >
                    <X className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    <span className="sr-only">Close</span>
                  </motion.button>
                </div>
              </motion.div>

              {/* Messages Area */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
                {isCheckingConversation ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex-1 flex items-center justify-center"
                  >
                    <div className="text-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="mx-auto mb-4"
                      >
                        <Loader2 className="h-8 w-8 text-gray-400" />
                      </motion.div>
                      <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-sm text-gray-600 dark:text-gray-400"
                      >
                        Checking for existing conversation...
                      </motion.p>
                    </div>
                  </motion.div>
                ) : conversationId ? (
                  <>
                    {/* Messages List */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3, duration: 0.4 }}
                      className="flex-1 overflow-y-auto min-h-0"
                    >
                      <AnimatePresence mode="wait">
                        {conversationId !== 'new' ? (
                          <motion.div
                            key="message-list"
                            initial={{ opacity: 0, y: 30, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -30, scale: 0.95 }}
                            transition={{ 
                              type: "spring",
                              stiffness: 300,
                              damping: 30,
                              duration: 0.5
                            }}
                            className="h-full"
                          >
                            <MessageListWithInfiniteScroll
                              conversationId={conversationId}
                              conversation={conversation}
                              optimisticMessages={optimisticMessages}
                            />
                            <div ref={messagesEndRef} />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="empty-state"
                            initial={{ opacity: 0, scale: 0.8, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8, y: -20 }}
                            transition={{ 
                              type: "spring",
                              stiffness: 200,
                              damping: 20,
                              duration: 0.5
                            }}
                            className="flex-1 flex items-center justify-center p-8"
                          >
                            <div className="text-center">
                              <motion.div
                                initial={{ scale: 0, rotate: -180 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ 
                                  delay: 0.3, 
                                  type: "spring", 
                                  stiffness: 200,
                                  damping: 15
                                }}
                                className="text-6xl mb-4"
                              >
                                💬
                              </motion.div>
                              <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4, duration: 0.4 }}
                                className="text-gray-500 dark:text-gray-400 text-lg font-medium"
                              >
                                Start the conversation
                              </motion.p>
                              <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5, duration: 0.4 }}
                                className="text-gray-400 dark:text-gray-500 text-sm mt-1"
                              >
                                Send your first message below
                              </motion.p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>

                    {/* Message Composer - Fixed at bottom */}
                    <motion.div
                      initial={{ opacity: 0, y: 50, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ 
                        delay: 0.4,
                        type: "spring",
                        stiffness: 300,
                        damping: 25,
                        duration: 0.5
                      }}
                      className="border-t bg-white dark:bg-gray-900 shrink-0 shadow-lg"
                    >
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="p-4"
                      >
                        <MessageComposer
                          conversationId={conversationId}
                          conversation={conversation}
                          contactData={contactData}
                          channelAccount={channelAccount}
                          availableAccounts={availableAccounts || (channelAccount ? [channelAccount] : [])}
                          onMessageSent={handleMessageSent}
                        />
                      </motion.div>
                    </motion.div>
                  </>
                ) : null}
              </div>
            </motion.div>
          </DialogContent>
      </Dialog>
      
      {/* Closing Animation Overlay */}
      <AnimatePresence>
        {isClosing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-gradient-to-br from-blue-600/90 via-purple-600/90 to-pink-600/90 backdrop-blur-md z-[100] flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
              exit={{ scale: 1.2, opacity: 0, y: -20, rotate: 10 }}
              transition={{ 
                type: "spring",
                stiffness: 300,
                damping: 20,
                duration: 0.6
              }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1] }}
                transition={{ 
                  delay: 0.1,
                  type: "spring",
                  stiffness: 200,
                  damping: 10
                }}
                className="text-7xl mb-4"
              >
                ✨
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-white text-3xl font-bold mb-2"
              >
                Message sent!
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-white/80 text-lg"
              >
                Redirecting to conversation...
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
