// src/components/webchat/WebChatMessageBubble.jsx
/**
 * WebChat Message Bubble Component
 * Individual message display with modern WhatsApp-like styling and image grid
 * ✅ Includes reactions and reply support
 */

'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, Clock, Loader2, Smile, Reply, Copy, X, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import MessageAttachment from '@/components/chat/MessageAttachment';
import WebChatImageGrid from './WebChatImageGrid';
import LinkPreview, { detectUrls, renderTextWithLinks, isFileUrl } from '@/components/shared/LinkPreview';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

// Dynamically import WebChatVoicePlayer to avoid SSR issues with Howler.js
const WebChatVoicePlayer = dynamic(() => import('./WebChatVoicePlayer'), {
  ssr: false,
  loading: () => <div className="w-48 h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
});

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

export default function WebChatMessageBubble({ 
  message, 
  isOwn, 
  onReact, 
  onReply,
  onCopy,
  socket,
  conversationId,
  currentContactId // ✅ Add currentContactId to identify logged-in user
}) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showReactionDetails, setShowReactionDetails] = useState(null);
  
  const getStatusIcon = () => {
    if (isOwn) {
      switch (message.status) {
        case 'pending':
          return <Clock className="w-3.5 h-3.5 text-white/70 dark:text-gray-300" />;
        case 'sent':
          return <Check className="w-3.5 h-3.5 text-white/70 dark:text-gray-300" />;
        case 'delivered':
          return <CheckCheck className="w-3.5 h-3.5 text-white/70 dark:text-gray-300" />;
        case 'read':
          return <CheckCheck className="w-3.5 h-3.5 text-blue-200 dark:text-blue-400" />;
        case 'failed':
        case 'error':
          return <AlertCircle className="w-3.5 h-3.5 text-red-300" />;
        default:
          return <Clock className="w-3.5 h-3.5 text-white/70 dark:text-gray-300" />;
      }
    }
    return null;
  };

  // Separate attachments by type
  const imageAttachments = message.attachments?.filter(att => 
    att.type === 'image' || att.mimeType?.startsWith('image/')
  ) || [];
  const audioAttachments = message.attachments?.filter(att => 
    att.type === 'audio' || att.mimeType?.startsWith('audio/')
  ) || [];
  const otherAttachments = message.attachments?.filter(att => 
    att.type !== 'image' && att.type !== 'audio' && 
    !att.mimeType?.startsWith('image/') && !att.mimeType?.startsWith('audio/')
  ) || [];

  // ✅ Helper function to normalize userId for consistent comparison
  const normalizeUserId = (userId) => {
    if (!userId) return null;
    if (typeof userId === 'string') return userId;
    if (typeof userId === 'object' && userId?.toString) return userId.toString();
    return String(userId);
  };

  // ✅ Group reactions by emoji - ensure only 1 reaction per user
  // First, normalize all reactions to ensure we have consistent data
  const normalizedReactions = (message.reactions || [])
    .map(r => ({
      emoji: r.emoji,
      userId: r.user || r.contact,
      userName: r.userName || null,
      contactName: r.contactName || null,
      createdAt: r.createdAt ? new Date(r.createdAt) : new Date(0)
    }))
    .filter(r => r.emoji && r.userId); // Filter out invalid reactions

  // ✅ Track each user's latest reaction (only one reaction per user)
  // This ensures that if a user has multiple reactions (shouldn't happen, but handle it), we only count the latest one
  const userReactionMap = new Map();
  normalizedReactions.forEach(reaction => {
    const userIdStr = normalizeUserId(reaction.userId);
    if (!userIdStr) return; // Skip if userId is invalid
    
    // Only keep the latest reaction per user
    const existing = userReactionMap.get(userIdStr);
    if (!existing || reaction.createdAt > existing.createdAt) {
      userReactionMap.set(userIdStr, {
        emoji: reaction.emoji,
        userId: userIdStr,
        userName: reaction.userName,
        contactName: reaction.contactName,
        createdAt: reaction.createdAt
      });
    }
  });

  // ✅ Group unique reactions by emoji and count users
  // Each emoji group contains the count of unique users who reacted with that emoji
  const groupedReactions = Array.from(userReactionMap.values()).reduce((acc, reaction) => {
    const emoji = reaction.emoji;
    if (!emoji) return acc; // Skip if emoji is missing
    
    if (!acc[emoji]) {
      acc[emoji] = {
        emoji,
        count: 0,
        users: [],
        hasUserReacted: false
      };
    }
    acc[emoji].count++;
    acc[emoji].users.push({ 
      userId: reaction.userId, 
      userName: reaction.userName || reaction.contactName || null
    });
    return acc;
  }, {});

  // ✅ Convert to array and ensure all unique emojis are included
  // Filter out any invalid groups and sort by count (descending) for better UX
  const reactionGroups = Object.values(groupedReactions)
    .filter(group => group && group.emoji && group.count > 0) // Ensure valid groups
    .sort((a, b) => {
      // Sort by count first (higher count first), then by emoji for consistency
      if (b.count !== a.count) return b.count - a.count;
      return a.emoji.localeCompare(b.emoji);
    });

  const handleReactionClick = (emoji) => {
    if (onReact && message._id) {
      onReact(message._id, emoji);
    } else if (socket && message._id) {
      // Fallback: emit directly via socket
      socket.emit('message:react', { messageId: message._id, emoji });
    }
  };

  const handleReplyClick = () => {
    if (onReply && message._id) {
      onReply(message);
    }
  };

  return (
    <motion.div
      className={cn(
        'flex mb-3 group',
        isOwn ? 'justify-end' : 'justify-start'
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      role="article"
      aria-label={`${isOwn ? 'Your' : 'Agent'} message`}
    >
      <div className="relative inline-block max-w-[75%] md:max-w-[60%]">
        {/* Reply To Preview - No name, just original message */}
        {message.replyTo && (
          <div 
            className={cn(
              'text-xs mb-2 pb-2 pl-2 border-l-4 cursor-pointer hover:opacity-80 transition-opacity rounded-tl-lg',
              isOwn 
                ? 'border-gray-400 bg-gray-200/50 dark:bg-gray-700/30' 
                : 'border-gray-300 dark:border-gray-600 bg-gray-100/50 dark:bg-gray-700/50'
            )}
            onClick={() => {
              // Scroll to replied message
              const element = document.querySelector(`[data-message-id="${message.replyTo._id}"]`);
              element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          >
            <p className={cn('truncate', isOwn ? 'text-gray-700 dark:text-gray-300' : 'text-gray-600 dark:text-gray-400')}>
              {(() => {
                // Extract content properly - handle string, object, etc.
                if (!message.replyTo.content) {
                  // Check if it's a media message
                  if (message.replyTo.attachments?.length > 0) {
                    return '[Media]';
                  }
                  return '[Message]';
                }
                // Handle string content
                if (typeof message.replyTo.content === 'string') {
                  return message.replyTo.content;
                }
                // Handle object content (e.g., { type: 'text', text: '...' })
                if (typeof message.replyTo.content === 'object') {
                  return message.replyTo.content.text || message.replyTo.content.type || '[Media]';
                }
                return '[Message]';
              })()}
            </p>
          </div>
        )}

        <motion.div
          className={cn(
            'rounded-2xl px-4 py-2.5 shadow-sm relative',
            isOwn
              ? 'bg-gradient-to-br from-purple-600 to-indigo-600 dark:from-purple-700 dark:to-indigo-700 text-white rounded-br-md'
              : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-md'
          )}
          whileHover={{ scale: 1.01 }}
          transition={{ duration: 0.2 }}
          data-message-id={message._id}
        >
          {/* Voice Message */}
          {audioAttachments.length > 0 && (
            <div className="mb-2">
              {audioAttachments.map((audio, index) => (
                <WebChatVoicePlayer
                  key={index}
                  audioUrl={audio.url}
                  duration={audio.duration}
                  isOwn={isOwn}
                />
              ))}
            </div>
          )}

          {/* Image Grid for Multiple Images */}
          {imageAttachments.length > 1 && (
            <div className="mb-2">
              <WebChatImageGrid 
                images={imageAttachments}
                className="w-full max-w-full"
              />
            </div>
          )}

          {/* Single Image or Other Attachments */}
          {(imageAttachments.length === 1 || otherAttachments.length > 0) && (
            <div className="mb-2 space-y-2">
              {imageAttachments.length === 1 && (
                <MessageAttachment
                  attachment={imageAttachments[0]}
                  isOwn={isOwn}
                  allAttachments={message.attachments}
                  currentIndex={message.attachments.findIndex(a => 
                    (a.type === 'image' || a.mimeType?.startsWith('image/')) && 
                    a.url === imageAttachments[0].url
                  )}
                />
              )}
              {otherAttachments.map((att, index) => (
                <MessageAttachment
                  key={index}
                  attachment={att}
                  isOwn={isOwn}
                  allAttachments={message.attachments}
                  currentIndex={message.attachments.findIndex(a => 
                    a.type !== 'image' && a.type !== 'audio' &&
                    !a.mimeType?.startsWith('image/') && !a.mimeType?.startsWith('audio/') && 
                    a.url === att.url
                  )}
                />
              ))}
            </div>
          )}

          {/* Message Content - Don't show if it's just a voice message placeholder */}
          {message.content && message.type !== 'audio' && !message.content.includes('🎤 Voice message') && (
            <div>
              <div className={cn(
                'break-words whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]',
                isOwn ? 'text-white' : 'text-gray-900 dark:text-gray-100'
              )}>
                {(() => {
                  const contentText = typeof message.content === 'string' 
                    ? message.content 
                    : message.content.text || JSON.stringify(message.content);
                  // ✅ Render text with clickable links
                  return renderTextWithLinks(contentText, isOwn);
                })()}
              </div>
              
              {/* ✅ Link Preview - only for web links; skip for file URLs (files use document card) */}
              {(() => {
                const contentText = typeof message.content === 'string' 
                  ? message.content 
                  : message.content?.text || JSON.stringify(message.content || '');
                const urls = detectUrls(contentText);
                const firstUrl = urls[0];
                if (firstUrl && !isFileUrl(firstUrl)) {
                  return <LinkPreview url={firstUrl} isOwn={isOwn} />;
                }
                return null;
              })()}
            </div>
          )}

          {/* Timestamp and Status */}
          <div className={cn(
            'flex items-center justify-end gap-1 mt-1.5 text-xs',
            isOwn ? 'text-white/90' : 'text-gray-500 dark:text-gray-400'
          )}>
            <span>
              {format(new Date(message.createdAt), 'h:mm a')}
            </span>
            {getStatusIcon()}
          </div>

          {/* Loading indicator for optimistic messages */}
          {message.isOptimistic && (
            <div className="absolute top-2 right-2">
              <Loader2 className="w-4 h-4 animate-spin text-white/70 dark:text-gray-300" />
            </div>
          )}

          {/* Message Actions (Copy, Reply, React) - Show on hover - WhatsApp style (on the side) */}
          <div className={cn(
            'absolute top-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-1 border-2 border-gray-300 dark:border-gray-700',
            isOwn ? 'right-full mr-2' : 'left-full ml-2'
          )}>
            {/* Copy Button - Only for text messages */}
            {message.content && message.type === 'text' && !message.attachments?.length && onCopy && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                onClick={() => onCopy(message)}
                title="Copy message"
                aria-label="Copy message"
              >
                <Copy className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
              </Button>
            )}
            
            {/* Reply Button */}
            {onReply && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                onClick={handleReplyClick}
                title="Reply to message"
                aria-label="Reply to message"
              >
                <Reply className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
              </Button>
            )}
            
            {/* React Button */}
            {(onReact || socket) && (
              <Popover open={showReactionPicker} onOpenChange={setShowReactionPicker}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    title="Add reaction"
                    aria-label="Add reaction"
                  >
                    <Smile className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
                  <div className="grid grid-cols-6 gap-2">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          handleReactionClick(emoji);
                          setShowReactionPicker(false);
                        }}
                        className="text-2xl hover:bg-gray-100 dark:hover:bg-gray-800 rounded p-1 transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </motion.div>

        {/* Reactions Display - Clickable to show details */}
        {reactionGroups.length > 0 && (
          <div className={cn(
            'flex items-center gap-1 flex-wrap mt-1',
            isOwn ? 'justify-end' : 'justify-start'
          )}>
            {reactionGroups.map((group) => (
              <button
                key={group.emoji}
                onClick={() => setShowReactionDetails({ messageId: message._id, emoji: group.emoji, allReactions: message.reactions || [] })}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full text-sm transition-colors cursor-pointer',
                  'bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700',
                  group.count > 1 ? 'px-2 py-1' : 'h-6 w-6 items-center justify-center p-0'
                )}
                title={group.count > 1 ? `${group.count} reactions` : '1 reaction'}
              >
                <span className="text-sm leading-none">{group.emoji}</span>
                {group.count > 1 && (
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 leading-none">
                    {group.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Reactions Detail Modal */}
        {showReactionDetails && (
          <Dialog open={!!showReactionDetails} onOpenChange={() => setShowReactionDetails(null)}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold">Reactions</DialogTitle>
              </DialogHeader>

              {(() => {
                const allReactions = showReactionDetails.allReactions || [];
                const selectedEmoji = showReactionDetails.emoji;
                
                // Group reactions by emoji
                const grouped = allReactions.reduce((acc, r) => {
                  const emoji = r.emoji;
                  if (!acc[emoji]) acc[emoji] = [];
                  acc[emoji].push(r);
                  return acc;
                }, {});

                // Filter to show only selected emoji or all
                const filteredReactions = selectedEmoji && selectedEmoji !== 'all'
                  ? (grouped[selectedEmoji] || [])
                  : allReactions;

                // Remove duplicates - only keep latest reaction per user
                const getId = (v) => v ? String(typeof v === 'object' ? (v._id || v) : v) : null;
                const uniqueReactions = filteredReactions.reduce((acc, r) => {
                  const userId = getId(r.user) || getId(r.contact);
                  if (userId) {
                    const existing = acc.find(a => (getId(a.user) || getId(a.contact)) === userId);
                    if (!existing || new Date(r.createdAt || 0) > new Date(existing.createdAt || 0)) {
                      if (existing) {
                        const index = acc.indexOf(existing);
                        acc[index] = r;
                      } else {
                        acc.push(r);
                      }
                    }
                  }
                  return acc;
                }, []);

                return (
                  <div className="space-y-3">
                    {/* Tabs */}
                    <div className="flex items-center gap-2 border-b pb-2 dark:border-gray-700 flex-wrap">
                      <button
                        onClick={() => setShowReactionDetails({ ...showReactionDetails, emoji: 'all' })}
                        className={cn(
                          'px-2 py-1 rounded-md text-sm flex items-center gap-1',
                          selectedEmoji === 'all' 
                            ? 'bg-gray-200 dark:bg-gray-700 font-medium' 
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                        )}
                      >
                        All
                        <span className="text-xs">{allReactions.length}</span>
                      </button>
                      {Object.keys(grouped).map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => setShowReactionDetails({ ...showReactionDetails, emoji })}
                          className={cn(
                            'px-2 py-1 rounded-md text-sm flex items-center gap-1',
                            selectedEmoji === emoji 
                              ? 'bg-gray-200 dark:bg-gray-700 font-medium' 
                              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                          )}
                        >
                          {emoji}
                          <span className="text-xs">{grouped[emoji].length}</span>
                        </button>
                      ))}
                    </div>

                    {/* Reactions List */}
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {uniqueReactions.length === 0 ? (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-4">No reactions</p>
                      ) : (
                        uniqueReactions.map((r, idx) => {
                          // Get string IDs for comparison
                          const rUser = r.user ? String(typeof r.user === 'object' ? (r.user._id || r.user) : r.user) : null;
                          const rContact = r.contact ? String(typeof r.contact === 'object' ? (r.contact._id || r.contact) : r.contact) : null;
                          const myId = currentContactId ? String(currentContactId) : null;

                          // Check if this reaction is from the logged-in webchat visitor
                          const isMe = myId && (rUser === myId || rContact === myId);

                          let displayName;
                          if (isMe) {
                            displayName = 'You';
                          } else if (r.userName) {
                            displayName = r.userName;
                          } else if (r.contactName) {
                            displayName = r.contactName;
                          } else if (typeof r.user === 'object' && r.user?.firstName) {
                            displayName = `${r.user.firstName} ${r.user.lastName || ''}`.trim();
                          } else if (typeof r.contact === 'object' && (r.contact?.name || r.contact?.displayName)) {
                            displayName = r.contact.name || r.contact.displayName;
                          } else {
                            displayName = 'Agent';
                          }
                          
                          return (
                            <div 
                              key={idx} 
                              className={cn(
                                "flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded",
                                isMe && "cursor-pointer"
                              )}
                              onClick={isMe && onReact ? () => {
                                // ✅ Click to remove own reaction
                                onReact(message._id, r.emoji);
                                setShowReactionDetails(null);
                              } : undefined}
                            >
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-sm font-semibold">
                                  {displayName.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{displayName}</p>
                                {isMe && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Click to remove</p>
                                )}
                              </div>
                              <span className="text-xl">{r.emoji}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}
            </DialogContent>
          </Dialog>
        )}
      </div>
    </motion.div>
  );
}
