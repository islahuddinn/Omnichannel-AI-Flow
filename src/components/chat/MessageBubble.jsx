// src/components/chat/MessageBubble.jsx - COMPLETE WITH ALL ACTIONS
'use client';

import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import MessageAttachment from './MessageAttachment';
import MessageAttachmentGroup from './MessageAttachmentGroup';
import MessageReactions from './MessageReactions';
import MessageStatus from './MessageStatus';
import VoicePlayer from './VoicePlayer';
import ContactMessageCard from './ContactMessageCard';
import ChannelIcon from '@/components/shared/ChannelIcon';
import LinkPreview, { detectUrls, renderTextWithLinks, isFileUrl } from '@/components/shared/LinkPreview';
import CallLog from './CallLog'; // Importing CallLog Component
import {
  MoreVertical,
  Reply,
  Forward,
  Copy,
  Trash2,
  SmilePlus,
  Download,
  Edit,
  Pin,
  RefreshCw,
  Loader2,
  MapPin
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';

export default function MessageBubble({
  message,
  isOwn,
  onReply,
  onForward,
  onReact,
  onDelete,
  onEdit,
  conversation // ✅ Add conversation prop to check if merged
}) {
  const [showActions, setShowActions] = useState(false);
  const [resendingMessageId, setResendingMessageId] = useState(null);
  const [isCallLogOpen, setIsCallLogOpen] = useState(false); // State for CallLog transcript
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type: 'me' | 'everyone' }
  const bubbleRef = useRef(null);

  const handleCopy = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
      toast.success('Message copied to clipboard');
    }
  };

  const handleDownloadMedia = () => {
    if (message.attachments && message.attachments.length > 0) {
      message.attachments.forEach(attachment => {
        const link = document.createElement('a');
        link.href = attachment.url;
        link.download = attachment.name || 'download';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
      toast.success('Download started');
    }
  };

  // ✅ Call Log Rendering Logic
  if (message.cdrId || message.type === 'callLog') {
    return (
      <div
        ref={bubbleRef}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        className={cn(
          'relative group flex w-full mb-4',
          isOwn ? 'justify-end' : 'justify-start'
        )}
      >
        <CallLog
          message={message}
          isOpen={isCallLogOpen}
          onOpen={setIsCallLogOpen}
          onClose={() => setIsCallLogOpen(false)}
        />
      </div>
    );
  }

  return (
    <div
      ref={bubbleRef}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={cn(
        'relative group flex w-full',
        isOwn ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Message Bubble Container with Reactions Support */}
      <div className="relative inline-block max-w-[85%] sm:max-w-[75%] md:max-w-[70%] lg:max-w-[65%] xl:max-w-[60%] 2xl:max-w-[55%]">
        {/* ✅ Channel Badge for Merged Conversations - Display ABOVE message */}
        {conversation?.isMerged && message.channel && (
          <div className={cn(
            'flex items-center gap-1.5 mb-1',
            isOwn ? 'justify-end' : 'justify-start'
          )}>
            <div className="flex items-center justify-center rounded-full p-0.5 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700">
              <ChannelIcon type={message.channel} className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
              #{message.channel}
            </span>
          </div>
        )}

        {/* ✅ Email Subject Header - Only for email messages */}
        {message.emailData?.subject && (
          <div className={cn(
            'text-xs font-semibold mb-1 px-1',
            isOwn ? 'text-gray-700 dark:text-gray-300' : 'text-gray-600 dark:text-gray-400'
          )}>
            📧 {message.emailData.subject}
          </div>
        )}

        <div
          className={cn(
            'px-4 py-2.5 rounded-2xl shadow-sm relative inline-block overflow-visible',
            // Bug 4 fix: Removed duplicate max-width - outer container already constrains width
            isOwn
              ? 'bg-primary/15 dark:bg-primary/20 text-gray-900 dark:text-gray-100 rounded-br-sm'
              : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm'
          )}
          style={{
            minWidth: 'fit-content', // ✅ Ensure bubble is wide enough for content (prevents "hey" from breaking)
            width: 'fit-content', // ✅ Let bubble size to content
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            wordBreak: 'normal', // ✅ Don't break words unnecessarily - keep "hey" on one line
          }}
        >
          {/* Reply To Preview - WhatsApp Style */}
          {message.replyTo && (
            <div
              className={cn(
                'mb-1.5 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity max-w-[280px] sm:max-w-[320px]',
                isOwn
                  ? 'bg-black/5 dark:bg-white/10'
                  : 'bg-black/5 dark:bg-white/8'
              )}
              style={{ width: '100%' }}
              onClick={() => {
                const element = document.querySelector(`[data-message-id="${message.replyTo._id}"]`);
                element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            >
              <div className={cn(
                'border-l-4 px-2.5 py-1.5',
                isOwn ? 'border-primary/60' : 'border-emerald-500/60'
              )}>
                {/* Sender name */}
                {message.replyTo.senderName && (
                  <p className={cn(
                    'text-[11px] font-semibold mb-0.5 truncate',
                    isOwn ? 'text-primary dark:text-primary' : 'text-emerald-600 dark:text-emerald-400'
                  )}>
                    {message.replyTo.senderName}
                  </p>
                )}
                {/* Message content - max 1 line, truncated */}
                <p className={cn(
                  'text-xs truncate',
                  isOwn ? 'text-foreground/70' : 'text-foreground/70'
                )}>
                  {(() => {
                    if (!message.replyTo.content) {
                      if (message.replyTo.attachments?.length > 0) return '[Media]';
                      return '[Message]';
                    }
                    if (typeof message.replyTo.content === 'string') return message.replyTo.content;
                    if (typeof message.replyTo.content === 'object') {
                      return message.replyTo.content.text || message.replyTo.content.type || '[Media]';
                    }
                    return '[Message]';
                  })()}
                </p>
              </div>
            </div>
          )}

          {/* ✅ WhatsApp Template Message - Show only template name */}
          {message.channel === 'whatsapp' && (message.type === 'template' || message.metadata?.originalContent?.type === 'template') ? (
            <div className="text-sm leading-relaxed font-medium">
              {message.templateName || message.metadata?.originalContent?.templateName || message.metadata?.templateName || 'Template'}
            </div>
          ) : (
            <>
              {/* Template Message Indicator (for non-WhatsApp templates) */}
              {(message.type === 'template' || message.metadata?.originalContent?.type === 'template') && message.channel !== 'whatsapp' && (
                <div className={cn(
                  "text-xs mb-2 flex items-center gap-1 opacity-75",
                  isOwn ? "text-gray-700 dark:text-gray-300" : "text-gray-600 dark:text-gray-400"
                )}>
                  <span>📋</span>
                  <span>Template: {message.templateName || message.metadata?.originalContent?.templateName || 'Unknown'}</span>
                </div>
              )}

              {/* Contact Message */}
              {(message.type === 'contact' || message.type === 'contacts' || message.metadata?.contentType === 'contacts' ||
                (message.type === 'text' && typeof message.content === 'string' && message.content.startsWith('{') &&
                  (() => {
                    try {
                      const parsed = JSON.parse(message.content);
                      return parsed.type === 'contacts' && parsed.contacts?.[0];
                    } catch {
                      return false;
                    }
                  })())) && (() => {
                    // ✅ Handle multiple data sources for contact messages
                    let contactDataToDisplay = message.contactData;

                    // ✅ Check if contactData has actual data (not just empty object)
                    if (contactDataToDisplay && Object.keys(contactDataToDisplay).length > 0 &&
                      (contactDataToDisplay.name || contactDataToDisplay.phones?.length > 0 || contactDataToDisplay.phoneNumber)) {
                      // contactData is valid, use it
                    } else {
                      contactDataToDisplay = null;
                    }

                    // Try metadata.originalContent.contacts
                    if (!contactDataToDisplay && message.metadata?.originalContent) {
                      if (message.metadata.originalContent.type === 'contacts' && message.metadata.originalContent.contacts?.[0]) {
                        contactDataToDisplay = message.metadata.originalContent.contacts[0];
                      } else if (Array.isArray(message.metadata.originalContent.contacts) && message.metadata.originalContent.contacts[0]) {
                        contactDataToDisplay = message.metadata.originalContent.contacts[0];
                      }
                    }

                    // ✅ Fallback: Parse JSON content string for existing messages stored incorrectly
                    if (!contactDataToDisplay && typeof message.content === 'string' && message.content.startsWith('{')) {
                      try {
                        const parsedContent = JSON.parse(message.content);
                        if (parsedContent.type === 'contacts' && parsedContent.contacts?.[0]) {
                          contactDataToDisplay = parsedContent.contacts[0];
                        }
                      } catch (e) {
                        // Not JSON, ignore
                      }
                    }

                    return contactDataToDisplay ? (
                      <ContactMessageCard
                        contactData={contactDataToDisplay}
                        isOwn={isOwn}
                      />
                    ) : null;
                  })()}

              {/* Location Message */}
              {message.type === 'location' && message.locationData && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      {message.locationData.name && (
                        <div className="font-semibold text-sm mb-1">{message.locationData.name}</div>
                      )}
                      {message.locationData.address && (
                        <div className="text-xs text-gray-600 dark:text-gray-400">{message.locationData.address}</div>
                      )}
                      <a
                        href={`https://www.google.com/maps?q=${message.locationData.latitude},${message.locationData.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline mt-1 inline-block"
                      >
                        View on Maps
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Voice Message */}
              {(() => {
                // ✅ Check if this is an audio message - API uses "message" type with contentType or attachment type
                const isAudioMessage = message.type === 'audio' || 
                                      message.metadata?.contentType === 'audio' ||
                                      message.attachments?.[0]?.type === 'audio' ||
                                      (message.content === '[Audio]' && message.attachments?.[0]);
                
                if (!isAudioMessage) return null;
                
                // ✅ Handle multiple possible locations for audio URL and duration...
                const audioAttachment = message.attachments?.[0] || message.attachment || message.media;
                
                // ✅ Debug logging to understand message structure after refresh
                if (process.env.NODE_ENV === 'development') {
                  console.log('[MessageBubble] Audio message structure:', {
                    messageId: message._id,
                    messageType: message.type,
                    contentType: message.metadata?.contentType,
                    hasAttachments: !!message.attachments,
                    attachmentsLength: message.attachments?.length,
                    audioAttachment,
                    messageKeys: Object.keys(message)
                  });
                }
                
                const audioUrl = audioAttachment?.url || 
                                audioAttachment?.mediaUrl || 
                                audioAttachment?.fileUrl ||
                                message.audioUrl ||
                                message.mediaUrl ||
                                message.content?.url ||
                                (typeof message.content === 'string' && message.content.startsWith('http') ? message.content : null);
                
                const audioDuration = audioAttachment?.duration || 
                                     message.duration ||
                                     message.content?.duration ||
                                     (audioAttachment?.metadata?.duration);
                
                // ✅ Only render if we have a valid audio URL
                if (!audioUrl || (typeof audioUrl !== 'string') || audioUrl.trim() === '') {
                  if (process.env.NODE_ENV === 'development') {
                    console.warn('[MessageBubble] Audio message missing URL:', {
                      messageId: message._id,
                      audioAttachment,
                      message
                    });
                  }
                  return null;
                }
                
                if (process.env.NODE_ENV === 'development') {
                  console.log('[MessageBubble] Rendering VoicePlayer with:', {
                    audioUrl,
                    audioDuration,
                    isOwn
                  });
                }
                
                return (
                  <VoicePlayer
                    audioUrl={audioUrl}
                    duration={audioDuration}
                    isOwn={isOwn}
                  />
                );
              })()}

              {/* Interactive Message (Button/List Reply) */}
              {message.type === 'interactive' && message.metadata?.originalContent?.type === 'interactive' && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  {message.metadata.originalContent.buttonReply && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Button:</span>
                      <span className="text-sm">{message.metadata.originalContent.buttonReply.title}</span>
                    </div>
                  )}
                  {message.metadata.originalContent.listReply && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">List:</span>
                        <span className="text-sm">{message.metadata.originalContent.listReply.title}</span>
                      </div>
                      {message.metadata.originalContent.listReply.description && (
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {message.metadata.originalContent.listReply.description}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Text Content - Exclude audio messages to prevent duplicate content */}
              {(() => {
                // ✅ Check if this is an audio message (for WhatsApp, type might be 'message' with contentType='audio')
                const isAudioMessage = message.type === 'audio' || 
                                      message.metadata?.contentType === 'audio' ||
                                      message.attachments?.[0]?.type === 'audio' ||
                                      (message.content === '[Audio]' && message.attachments?.[0]);
                
                // ✅ Don't render text content for audio messages (VoicePlayer handles it)
                if (isAudioMessage) return null;
                
                // ✅ Don't render text for other special message types
                if (!message.content || 
                    message.type === 'contact' || 
                    message.type === 'contacts' || 
                    message.type === 'location' || 
                    message.type === 'interactive') {
                  return null;
                }
                
                return (
                <div>
                  <p
                    className="text-sm leading-relaxed"
                    style={{
                      whiteSpace: 'pre-wrap', // ✅ Preserve line breaks from user input, but don't break words
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word',
                      wordBreak: 'normal', // ✅ Critical: Don't break words - keep "hey" on one line
                      overflowX: 'hidden',
                      hyphens: 'none', // ✅ Don't hyphenate - let words stay whole
                    }}
                  >
                    {(() => {
                      // ✅ Don't display JSON content for contact messages
                      if (typeof message.content === 'string' && message.content.startsWith('{') && message.metadata?.contentType === 'contacts') {
                        return '📇 Contact';
                      }
                      // ✅ Template messages: prefer rendered text/body from metadata
                      if (message.metadata?.originalContent?.type === 'template') {
                        const templateMeta = message.metadata.originalContent;
                        const rendered =
                          message.metadata?.renderedText ||
                          templateMeta.renderedText ||
                          message.metadata?.templateBody ||
                          templateMeta.body ||
                          message.content?.text;
                        const fallbackName =
                          templateMeta.templateName ||
                          message.templateName ||
                          'Template';
                        return renderTextWithLinks(rendered || fallbackName, isOwn);
                      }

                      const contentText = typeof message.content === 'string'
                        ? message.content
                        : (message.content.text || String(message.content));
                      // ✅ Render text with clickable links
                      return renderTextWithLinks(contentText, isOwn);
                    })()}
                  </p>

                  {/* ✅ Link Preview - only for web links; skip for file URLs (files use document card) */}
                  {(() => {
                    const contentText = typeof message.content === 'string' ? message.content : (message.content?.text || String(message.content || ''));
                    const urls = detectUrls(contentText);
                    const firstUrl = urls[0];
                    if (firstUrl && !isFileUrl(firstUrl)) {
                      return <LinkPreview url={firstUrl} isOwn={isOwn} />;
                    }
                    return null;
                  })()}
                </div>
                );
              })()}
            </>
          )}

          {/* Attachments (Images, Videos, Documents, Stickers) - Exclude audio attachments */}
          {(() => {
            // ✅ Check if this is an audio message (for WhatsApp, type might be 'message' with contentType='audio')
            const isAudioMessage = message.type === 'audio' || 
                                  message.metadata?.contentType === 'audio' ||
                                  message.attachments?.[0]?.type === 'audio' ||
                                  (message.content === '[Audio]' && message.attachments?.[0]);
            
            // ✅ Filter out audio attachments to prevent duplicate rendering
            const nonAudioAttachments = message.attachments?.filter(att => {
              const isAudio = att.type === 'audio' || att.mimeType?.startsWith('audio/');
              return !isAudio;
            }) || [];
            
            // ✅ Only render if we have non-audio attachments
            if (!nonAudioAttachments.length) return null;
            
            return (
            <div className={cn(message.content && 'mt-2')}>
                {nonAudioAttachments.length > 1 ? (
                <MessageAttachmentGroup
                    attachments={nonAudioAttachments}
                  isOwn={isOwn}
                />
              ) : (
                <MessageAttachment
                    attachment={nonAudioAttachments[0]}
                  isOwn={isOwn}
                    allAttachments={nonAudioAttachments}
                  currentIndex={0}
                />
              )}
            </div>
            );
          })()}

          {/* Forwarded Indicator */}
          {message.forwardedFrom && (
            <div className={cn(
              'text-xs italic mt-2 pt-2 border-t flex items-center gap-1',
              isOwn ? 'border-gray-400 text-gray-700 dark:text-gray-300' : 'border-gray-300 text-gray-500 dark:text-gray-400'
            )}>
              <Forward className="h-3 w-3" />
              Forwarded
            </div>
          )}

          {/* ✅ Email From/To Info - Only for email messages (not WhatsApp) */}
          {message.emailData && message.channel === 'email' && (
            <div className={cn(
              'text-xs mt-1 mb-0.5 px-1',
              isOwn ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400'
            )}>
              {isOwn ? (
                <span>To: {message.emailData.to?.join(', ') || 'Unknown'}</span>
              ) : (
                <span>From: {message.emailData.from || 'Unknown'}</span>
              )}
            </div>
          )}


          {/* Timestamp and Status Row */}
          <div className={cn('flex items-center gap-1.5 mt-1 whitespace-nowrap', isOwn ? 'justify-end' : 'justify-start')}>
            {/* Timestamp */}
            <span className={cn(
              'text-[10px] whitespace-nowrap',
              isOwn ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400'
            )}>
              {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>

            {/* Edited Indicator */}
            {message.edited && (
              <span className={cn(
                'text-[10px] italic',
                isOwn ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400'
              )}>
                • edited
              </span>
            )}

            {/* Message Status (ticks) - Only for own messages */}
            {isOwn && (
              <MessageStatus
                status={message.status}
                direction={message.direction}
                channel={message.channel}
                errorMessage={message.errorMessage}
              />
            )}
          </div>

          {/* Retrying Status */}
          {isOwn && message.status === 'retrying' && (
            <div className="mt-1.5">
              <p className={cn('text-xs', isOwn ? 'text-amber-600 dark:text-amber-400' : 'text-amber-500')}>
                {message.errorMessage || 'Temporary issue — retrying automatically...'}
              </p>
            </div>
          )}

          {/* Failed Messages — Permanent Errors Only */}
          {isOwn && message.status === 'failed' && (
            <div className="mt-1.5">
              {message.errorMessage && (
                <p className={cn('text-xs mb-1.5', isOwn ? 'text-red-700 dark:text-red-300' : 'text-red-500')}>
                  {message.errorMessage}
                </p>
              )}
              <div className="flex items-center gap-2">
              <span className={cn('text-xs', isOwn ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400')}>
                {!message.errorMessage ? 'Message failed to send' : 'Failed'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={resendingMessageId === message._id}
                className={cn(
                  'h-6 px-2 text-xs',
                  isOwn
                    ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-300 dark:border-red-700 disabled:opacity-50 disabled:cursor-not-allowed'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'
                )}
                onClick={async () => {
                  if (resendingMessageId === message._id) return; // Prevent double-click

                  setResendingMessageId(message._id);
                  try {
                    const conversationId = message.conversation || message.conversationId;
                    const response = await apiClient.post(`/messages/${conversationId}/resend`, {
                      messageId: message._id
                    });
                    if (!response.data?.success) throw new Error(response.data?.message || 'Failed to resend');
                    toast.success('Resending message...');
                  } catch (error) {
                    toast.error(error.response?.data?.message || 'Failed to resend message');
                    console.error('Resend error:', error);
                  } finally {
                    setResendingMessageId(null);
                  }
                }}
              >
                {resendingMessageId === message._id ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Resending...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" /> Resend
                  </>
                )}
              </Button>
              </div>
            </div>
          )}
        </div>

        {/* Reactions - WhatsApp Style (Bottom Corner, Always Visible) */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={cn(
            'absolute -bottom-1 flex items-end gap-0.5 z-20',
            isOwn ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'
          )}>
            {(() => {
              // Group reactions by emoji
              const grouped = message.reactions.reduce((acc, r) => {
                if (!acc[r.reaction]) acc[r.reaction] = [];
                acc[r.reaction].push(r);
                return acc;
              }, {});

              const reactionsList = Object.entries(grouped);
              return (
                <>
                  {reactionsList.slice(0, 3).map(([emoji, users]) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        // Handle reaction click if needed
                      }}
                      className={cn(
                        "flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-md hover:scale-110 transition-transform motion-reduce:transition-none motion-reduce:hover:scale-100 cursor-pointer z-10 text-xs leading-none",
                        users.length > 1 ? "h-auto px-1.5 py-0.5 gap-0.5 min-h-[28px]" : "h-6 w-6"
                      )}
                      aria-label={`${emoji} reaction${users.length > 1 ? `, ${users.length} reactions` : ''}`}
                    >
                      <span className="text-xs leading-none">{emoji}</span>
                      {users.length > 1 && (
                        <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300 leading-none">
                          {users.length}
                        </span>
                      )}
                    </button>
                  ))}
                  {reactionsList.length > 3 && (
                    <button
                      className="flex items-center justify-center h-6 w-6 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-md hover:scale-110 transition-transform motion-reduce:transition-none motion-reduce:hover:scale-100 cursor-pointer z-10"
                      aria-label={`${reactionsList.length} total reactions`}
                    >
                      <span className="text-[8px] font-bold text-gray-600 dark:text-gray-300">+{reactionsList.length - 3}</span>
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Action Menu - Shows on Hover */}
      {showActions && (
        <div className={cn(
          'absolute top-0 flex items-center gap-1',
          isOwn ? 'right-full mr-2' : 'left-full ml-2'
        )}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 min-h-[44px] min-w-[44px] bg-white dark:bg-gray-800 shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
            onClick={() => onReact?.(message._id)}
            aria-label="Add reaction"
          >
            <SmilePlus className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 min-h-[44px] min-w-[44px] bg-white dark:bg-gray-800 shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
                aria-label="Message actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwn ? 'end' : 'start'}>
              <DropdownMenuItem onClick={() => onReply?.(message)}>
                <Reply className="mr-2 h-4 w-4" />
                Reply
              </DropdownMenuItem>

              {/* <DropdownMenuItem onClick={() => onForward?.(message)}>
                <Forward className="mr-2 h-4 w-4" />
                Forward
              </DropdownMenuItem> */}

              {message.content && (
                <DropdownMenuItem onClick={handleCopy}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Text
                </DropdownMenuItem>
              )}

              {message.attachments?.length > 0 && (
                <DropdownMenuItem onClick={handleDownloadMedia}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </DropdownMenuItem>
              )}

              {isOwn && (
                <>
                  <DropdownMenuItem onClick={() => onEdit?.(message)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => setDeleteConfirm({ type: 'me' })}
                    className="text-orange-600 focus:text-orange-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete for Me
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => setDeleteConfirm({ type: 'everyone' })}
                    className="text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete for Everyone
                  </DropdownMenuItem>
                </>
              )}

              {!isOwn && (
                <DropdownMenuItem
                  onClick={() => setDeleteConfirm({ type: 'me' })}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete for Me
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm?.type === 'everyone' ? 'Delete for Everyone' : 'Delete Message'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === 'everyone'
                ? 'This message will be deleted for everyone in this conversation. This cannot be undone.'
                : 'This message will be removed from your view.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete?.(message._id, deleteConfirm?.type);
                setDeleteConfirm(null);
              }}
              className={deleteConfirm?.type === 'everyone' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}