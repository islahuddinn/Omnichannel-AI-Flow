// // src/components/chat/MessageList.jsx
// 'use client';

// import { useEffect, useRef } from 'react';
// import { useSocketEvent } from '@/hooks/useSocket';
// import { useQueryClient } from '@tanstack/react-query';
// import MessageItem from './MessageItem';
// import TypingIndicator from './TypingIndicator';
// import { ScrollArea } from '@/components/ui/scroll-area';

// export default function MessageList({ messages, conversationId }) {
//   const scrollRef = useRef(null);
//   const queryClient = useQueryClient();

//   // Auto-scroll to bottom on new messages
//   useEffect(() => {
//     if (scrollRef.current) {
//       scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
//     }
//   }, [messages]);

//   // Listen for new messages via socket
//   useSocketEvent('message:new', (data) => {
//     if (data.conversationId === conversationId) {
//       queryClient.invalidateQueries(['messages', conversationId]);
//     }
//   });

//   // Listen for message status updates
//   useSocketEvent('message:status', (data) => {
//     queryClient.invalidateQueries(['messages', conversationId]);
//   });

//   return (
//     <ScrollArea className="h-full p-4" ref={scrollRef}>
//       <div className="space-y-4">
//         {messages.map((message) => (
//           <MessageItem key={message._id} message={message} />
//         ))}
//         <TypingIndicator />
//       </div>
//     </ScrollArea>
//   );
// }











// // src/components/chats/MessageList.jsx
// 'use client';

// import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
// import { Badge } from '@/components/ui/badge';
// import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
// import { formatDistanceToNow, format } from 'date-fns';

// const statusIcons = {
//   pending: Clock,
//   sent: Check,
//   delivered: CheckCheck,
//   read: CheckCheck,
//   failed: AlertCircle
// };

// const channelColors = {
//   whatsapp: 'bg-green-100 border-green-300',
//   sms: 'bg-blue-100 border-blue-300',
//   email: 'bg-gray-100 border-gray-300',
//   facebook: 'bg-blue-100 border-blue-400',
//   instagram: 'bg-pink-100 border-pink-300',
//   webchat: 'bg-purple-100 border-purple-300'
// };

// export default function MessageList({ messages, isLoading, conversation }) {
//   if (isLoading) {
//     return <div className="text-center py-8">Loading messages...</div>;
//   }

//   if (!messages || messages.length === 0) {
//     return (
//       <div className="text-center py-8 text-gray-500">
//         No messages yet. Start the conversation!
//       </div>
//     );
//   }

//   return (
//     <div className="space-y-4">
//       {messages.map((message, index) => {
//         const isOutbound = message.direction === 'outbound';
//         const StatusIcon = statusIcons[message.status];
//         const showAvatar = index === 0 || messages[index - 1].direction !== message.direction;
//         const showTimestamp = index === messages.length - 1 || 
//           messages[index + 1].direction !== message.direction ||
//           new Date(messages[index + 1].createdAt) - new Date(message.createdAt) > 300000; // 5 min

//         return (
//           <div
//             key={message._id}
//             className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
//           >
//             <div className={`flex gap-2 max-w-[70%] ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}>
//               {/* Avatar */}
//               {showAvatar && !isOutbound && (
//                 <Avatar className="h-8 w-8">
//                   <AvatarImage src={conversation.contactData?.avatar} />
//                   <AvatarFallback>
//                     {conversation.contactData?.displayName?.substring(0, 2).toUpperCase()}
//                   </AvatarFallback>
//                 </Avatar>
//               )}

//               <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
//                 {/* Message Bubble */}
//                 <div
//                   className={`rounded-lg p-3 ${
//                     isOutbound
//                       ? 'bg-blue-500 text-white'
//                       : `${channelColors[message.channel] || 'bg-white'} border`
//                   }`}
//                 >
//                   {/* Channel indicator for merged conversations */}
//                   {conversation.isMerged && (
//                     <Badge variant="secondary" className="mb-1 text-xs">
//                       {message.channel}
//                     </Badge>
//                   )}

//                   {/* Template indicator */}
//                   {message.type === 'template' && (
//                     <div className="text-xs opacity-75 mb-1">
//                       📋 Template: {message.templateName}
//                     </div>
//                   )}

//                   {/* Content */}
//                  {/* Content */}
// <div className="whitespace-pre-wrap break-words">
//   {message.content?.text || message.content}
// </div>

// {/* Template indicator - update to check content.type */}
// {message.content?.type === 'template' && (
//   <div className="text-xs opacity-75 mb-1">
//     📋 Template: {message.content.templateName}
//   </div>
// )}

//                   {/* Attachments */}
//                   {message.attachments && message.attachments.length > 0 && (
//                     <div className="mt-2 space-y-2">
//                       {message.attachments.map((att, idx) => (
//                         <div key={idx}>
//                           {att.type === 'image' && (
//                             <img 
//                               src={att.url} 
//                               alt={att.name}
//                               className="rounded max-w-full"
//                             />
//                           )}
//                           {att.type === 'document' && (
//                             <a 
//                               href={att.url} 
//                               target="_blank"
//                               rel="noopener noreferrer"
//                               className="text-sm underline"
//                             >
//                               📎 {att.name}
//                             </a>
//                           )}
//                         </div>
//                       ))}
//                     </div>
//                   )}
//                 </div>

//                 {/* Timestamp and Status */}
//                 {showTimestamp && (
//                   <div className={`flex items-center gap-1 mt-1 text-xs text-gray-500`}>
//                     <span>
//                       {format(new Date(message.createdAt), 'HH:mm')}
//                     </span>
//                     {isOutbound && StatusIcon && (
//                       <StatusIcon 
//                         className={`h-3 w-3 ${
//                           message.status === 'read' ? 'text-blue-500' : 
//                           message.status === 'failed' ? 'text-red-500' : ''
//                         }`}
//                       />
//                     )}
//                   </div>
//                 )}
//               </div>
//             </div>
//           </div>
//         );
//       })}
//     </div>
//   );
// }








// src/components/chat/MessageList.jsx
'use client';

import { useEffect, useState } from 'react';
import { useSocketEvent } from '@/hooks/useSocket';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, CheckCheck, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import MessageAttachment from './MessageAttachment';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

const statusIcons = {
  pending: Clock,
  sending: RefreshCw,
  sent: Check,
  delivered: CheckCheck,
  read: CheckCheck,
  failed: AlertCircle
};

const statusColors = {
  pending: 'text-gray-400',
  sending: 'text-blue-500 animate-spin',
  sent: 'text-gray-400',
  delivered: 'text-green-500',
  read: 'text-blue-500',
  failed: 'text-red-500'
};

const statusMessages = {
  pending: 'Pending',
  sending: 'Sending...',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed'
};

export default function MessageList({ messages: initialMessages, isLoading, conversation }) {
  const [messages, setMessages] = useState(initialMessages || []);
  const [statusUpdates, setStatusUpdates] = useState({});

  // Update messages when prop changes
  useEffect(() => {
    setMessages(initialMessages || []);
  }, [initialMessages]);

  // Listen for real-time status updates
  useSocketEvent('message:status', (data) => {
    console.log('📡 Message status update received:', data);
    
    setStatusUpdates(prev => ({
      ...prev,
      [data.messageId]: data
    }));

    // Update the message in the list
    setMessages(prev => prev.map(msg =>
      msg._id === data.messageId
        ? {
            ...msg,
            status: data.status,
            errorMessage: data.error || msg.errorMessage,
            metadata: {
              ...msg.metadata,
              whatsappMessageId: data.whatsappMessageId,
              error: data.error,
              errorCategory: data.errorCategory,
              errorRetryable: data.retryable,
            }
          }
        : msg
    ));
  });

  // Listen for new messages
  useSocketEvent('message:new', (data) => {
    console.log('🔔 Received message:new event:', data);
    if (data.conversationId === conversation?._id || data.message?.conversation === conversation?._id) {
      const newMessage = data.message || data;
      console.log('✅ Adding new message to UI:', newMessage._id);
      setMessages(prev => [...prev, newMessage]);
    } else {
      console.log('⚠️ Message not for this conversation. Got:', data.conversationId, 'Expected:', conversation?._id);
    }
  });

  // Listen for message edits
  useSocketEvent('message:edit', (data) => {
    if (data.conversationId === conversation?._id) {
      setMessages(prev => prev.map(m => m._id === data.messageId ? { ...m, content: data.content, edited: true } : m));
    }
  });

  // Listen for message deletes
  useSocketEvent('message:deleted', (data) => {
    if (data.deleteFor === 'everyone') {
      // Update message content to show it was deleted
      setMessages(prev => prev.map(m => 
        m._id === data.messageId 
          ? { ...m, content: 'This message was deleted', deleted: true, attachments: [] }
          : m
      ));
    } else {
      // Delete for me - remove from list
      setMessages(prev => prev.filter(m => m._id !== data.messageId));
    }
  });

  const getMessageStatus = (message) => {
    // Check if we have a real-time update for this message
    const statusUpdate = statusUpdates[message._id];
    if (statusUpdate) {
      return {
        status: statusUpdate.status,
        error: statusUpdate.error
      };
    }
    
    return {
      status: message.status,
      error: message.metadata?.error
    };
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">Loading messages...</span>
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-lg mb-2">💬</div>
        <p>No messages yet.</p>
        <p className="text-sm">Start the conversation by sending a message!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {messages.map((message, index) => {
        const isOutbound = message.direction === 'outbound';
        const { status, error } = getMessageStatus(message);
        const StatusIcon = statusIcons[status];
        const statusColor = statusColors[status];
        const statusMessage = statusMessages[status];
        
        const showAvatar = index === 0 || messages[index - 1].direction !== message.direction;
        const showTimestamp = index === messages.length - 1 || 
          messages[index + 1].direction !== message.direction ||
          new Date(messages[index + 1].createdAt) - new Date(message.createdAt) > 300000;

        return (
          <div
            key={message._id}
            className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex gap-2 max-w-[80%] ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}>
              
              {/* Avatar */}
              {showAvatar && !isOutbound && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={conversation.contactData?.avatar} />
                  <AvatarFallback className="text-xs">
                    {conversation.contactData?.name?.substring(0, 2).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              )}

              <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} flex-1`}>
                
                {/* Message Bubble */}
                <div
                  className={`rounded-2xl px-4 py-2 max-w-full ${
                    isOutbound
                      ? 'bg-blue-500 text-white rounded-br-md'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md'
                  } ${status === 'failed' ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30' : ''}`}
                >
                  
                  {/* Error Badge */}
                  {status === 'failed' && (
                    <div className="flex items-center gap-1 mb-2 text-red-600 text-xs">
                      <AlertCircle className="h-3 w-3" />
                      <span>Failed to send</span>
                    </div>
                  )}

                  {/* Channel indicator */}
                  {conversation.isMerged && (
                    <Badge variant="secondary" className="mb-1 text-xs">
                      {message.channel}
                    </Badge>
                  )}

                  {/* Template indicator */}
                  {message.metadata?.originalContent?.type === 'template' && (
                    <div className="text-xs opacity-75 mb-1 flex items-center gap-1">
                      <span>📋</span>
                      <span>Template: {message.metadata.originalContent.templateName}</span>
                    </div>
                  )}

                  {/* Content */}
                  {message.content && (
                    <div 
                      className="whitespace-pre-wrap"
                      style={{
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        wordBreak: 'normal', // ✅ Don't break words unnecessarily - keep "hey" on one line
                        overflowX: 'hidden'
                      }}
                    >
                      {message.content}
                    </div>
                  )}

                  {/* Attachments */}
                  {message.attachments?.length > 0 && (
                    <div className={`space-y-2 ${message.content ? 'mt-2' : ''}`}>
                      {message.attachments.map((att, idx) => (
                        <MessageAttachment
                          key={idx}
                          attachment={att}
                          isOwn={isOutbound}
                          allAttachments={message.attachments}
                          currentIndex={idx}
                        />
                      ))}
                    </div>
                  )}

                  {/* Error Message */}
                  {error && (
                    <div className="mt-2 text-xs text-red-600 bg-red-100 px-2 py-1 rounded">
                      {error}
                    </div>
                  )}
                  {/* Resend failed */}
                  {status === 'failed' && isOutbound && (
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={async () => {
                          try {
                            await apiClient.post(`/messages/${message._id}/resend`);
                            toast.success('Resending message...');
                          } catch (e) {
                            toast.error(e?.response?.data?.error || 'Failed to resend');
                          }
                        }}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" /> Resend
                      </Button>
                    </div>
                  )}
                </div>

                {/* Timestamp and Status */}
                <div className={`flex items-center gap-2 mt-1 text-xs ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}>
                  <span className="text-gray-500">
                    {format(new Date(message.createdAt), 'HH:mm')}
                  </span>
                  
                  {isOutbound && StatusIcon && (
                    <div className="flex items-center gap-1" title={error ? `Failed: ${error}` : statusMessage}>
                      <StatusIcon className={`h-3 w-3 ${statusColor}`} />
                      {status === 'failed' && (
                        <span className="text-red-500 text-xs">{statusMessage}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}