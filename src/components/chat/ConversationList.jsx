// src/components/chat/ConversationList.jsx
'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import PhoneNumberDisplay from '@/components/shared/PhoneNumberDisplay';
import { 
  MessageSquare, 
  MoreVertical,
  CheckSquare,
  X,
  Merge,
  Pin,
  Star,
  BellOff,
  AlarmClock,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  ImageIcon,
  Video,
  Mic,
  FileText,
  MapPin,
  User,
  Smile,
  Phone as PhoneIcon,
  LayoutList,
  SquareMousePointer,
  Zap,
} from 'lucide-react';
import { format, isToday, isYesterday, isThisWeek, startOfDay, differenceInDays } from 'date-fns';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ConversationActionsMenu from './ConversationActionsMenu';
import { useAIBotSettings } from '@/hooks/useAIBotSettings';

// Channel icon paths mapping
const channelIconPaths = {
  whatsapp: '/images/channels/whatsapp.svg',
  sms: '/images/channels/sms.svg',
  email: '/images/channels/email.svg',
  facebook: '/images/channels/facebook.svg',
  instagram: '/images/channels/instagram.svg',
  webchat: '/images/channels/webchat.svg',
  call: '/images/channels/call.svg'
};

// Channel color filters - CSS filters to colorize black SVGs
// Professional, distinct colors - each channel has a completely unique, eye-catching color
const channelColorFilters = {
  whatsapp: 'brightness(0) saturate(100%) invert(48%) sepia(79%) saturate(2476%) hue-rotate(86deg) brightness(118%) contrast(119%)', // WhatsApp Green (#25D366) - Vibrant green
  sms: 'brightness(0) saturate(100%) invert(58%) sepia(100%) saturate(2000%) hue-rotate(10deg) brightness(105%) contrast(105%)', // Bright Orange (#F97316) - Energetic, distinct
  email: 'brightness(0) saturate(100%) invert(52%) sepia(100%) saturate(2000%) hue-rotate(165deg) brightness(90%) contrast(105%)', // Professional Teal (#0D9488) - Distinct from all blues
  facebook: 'brightness(0) saturate(100%) invert(35%) sepia(99%) saturate(1352%) hue-rotate(201deg) brightness(97%) contrast(96%)', // Facebook Blue (#1877F2) - Classic blue
  instagram: 'brightness(0) saturate(100%) invert(27%) sepia(95%) saturate(2878%) hue-rotate(295deg) brightness(101%) contrast(101%)', // Instagram Pink (#E4405F) - Vibrant pink-red
  webchat: 'brightness(0) saturate(100%) invert(50%) sepia(100%) saturate(2000%) hue-rotate(270deg) brightness(100%) contrast(110%)', // Vibrant Purple (#A855F7) - Distinct violet
  call: 'brightness(0) saturate(100%) invert(50%) sepia(100%) saturate(2000%) hue-rotate(270deg) brightness(100%) contrast(110%)', // Vibrant Purple (#A855F7) - Distinct violet
};

// Channel colors for fallback styling
const channelColors = {
  whatsapp: 'text-green-500',
  sms: 'text-blue-500',
  email: 'text-gray-500',
  facebook: 'text-blue-600',
  instagram: 'text-pink-500',
  webchat: 'text-purple-500',
  call: 'text-purple-500'
};

/**
 * Message status icon component (WhatsApp-style ticks)
 * Only shown for outbound messages
 */
function MessageStatusIcon({ status }) {
  if (!status) return null;
  
  switch (status) {
    case 'read':
      return <CheckCheck className="h-[14px] w-[14px] text-blue-500 shrink-0" />;
    case 'delivered':
      return <CheckCheck className="h-[14px] w-[14px] text-gray-400 dark:text-gray-500 shrink-0" />;
    case 'sent':
      return <Check className="h-[14px] w-[14px] text-gray-400 dark:text-gray-500 shrink-0" />;
    case 'failed':
      return <AlertCircle className="h-[14px] w-[14px] text-red-500 shrink-0" />;
    case 'pending':
    case 'sending':
      return <Clock className="h-3 w-3 text-gray-400 dark:text-gray-500 shrink-0" />;
    default:
      return null;
  }
}

/**
 * Returns a Lucide icon element for the message type
 */
function MessageTypeIcon({ type }) {
  const cls = "h-3.5 w-3.5 shrink-0 opacity-60";
  switch (type) {
    case 'image':
      return <ImageIcon className={cls} />;
    case 'video':
      return <Video className={cls} />;
    case 'audio':
    case 'voice':
      return <Mic className={cls} />;
    case 'document':
      return <FileText className={cls} />;
    case 'template':
      return <FileText className={cls} />;
    case 'sticker':
      return <Smile className={cls} />;
    case 'location':
      return <MapPin className={cls} />;
    case 'contact':
    case 'contacts':
      return <User className={cls} />;
    case 'interactive':
      return <SquareMousePointer className={cls} />;
    case 'list':
      return <LayoutList className={cls} />;
    case 'button':
      return <SquareMousePointer className={cls} />;
    default:
      return null;
  }
}

/**
 * Human-readable label for non-text message types (fallback when no attachment info)
 */
const messageTypeLabels = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice message',
  voice: 'Voice message',
  document: 'Document',
  template: 'Template',
  sticker: 'Sticker',
  location: 'Location',
  contact: 'Contact',
  contacts: 'Contacts',
  interactive: 'Interactive',
  list: 'List',
  button: 'Button',
  reaction: 'Reaction',
};

/** Format file size for list preview (WhatsApp-style) */
function formatFileSize(bytes) {
  if (bytes == null || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format conversation timestamp in WhatsApp style:
 * - Today: Show time in 12-hour format with AM/PM (h:mm a)
 * - Yesterday: Show "Yesterday"
 * - This week: Show day name (Monday, Tuesday, etc.)
 * - Older than a week: Show date (M/d/yyyy)
 */
function formatConversationTime(date) {
  if (!date) return '';
  
  const messageDate = new Date(date);
  const now = new Date();
  const today = startOfDay(now);
  const messageDay = startOfDay(messageDate);
  const daysDiff = differenceInDays(today, messageDay);
  
  if (isToday(messageDate)) {
    // Today: Show time in 12-hour format with AM/PM (e.g., "4:51 PM", "2:30 AM")
    return format(messageDate, 'h:mm a');
  } else if (isYesterday(messageDate)) {
    // Yesterday: Show "Yesterday"
    return 'Yesterday';
  } else if (daysDiff < 7) {
    // This week: Show day name (e.g., "Monday", "Tuesday")
    return format(messageDate, 'EEEE');
  } else {
    // Older than a week: Show date (e.g., "1/5/2026", "12/25/2025")
    return format(messageDate, 'M/d/yyyy');
  }
}

export default function ConversationList({ 
  conversations = [], 
  manualConversations = [],
  autoConversations = [],
  isLoading, 
  isFetchingNextPage = false,
  hasNextPage = false,
  onLoadMore,
  selectedId, 
  onRefresh,
  onSelect,
  onMerge,
  showHeader = true, // Control header visibility
  onMergeComplete, // Callback when merge is completed
  manualSectionRef, // Ref for manual section
  autoSectionRef, // Ref for auto section
  isViewOnly = false, // Disable actions when true
  sortBy = 'recent' // Current sort option to show appropriate empty state
}) {
  // ✅ Get AI bot settings to conditionally show unread count badge
  const { enabled: isAIBotEnabled } = useAIBotSettings();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState([]);
  const scrollAreaRef = useRef(null);

  // Reset selection when merge is completed
  useEffect(() => {
    if (onMergeComplete) {
      setSelectionMode(false);
      setSelectedConversations([]);
    }
  }, [onMergeComplete]);

  // Handle scroll to load more conversations (throttled)
  useEffect(() => {
    if (!scrollAreaRef.current || !hasNextPage || isFetchingNextPage || !onLoadMore) return;

    const viewport = scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]');
    if (!viewport) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const { scrollTop, scrollHeight, clientHeight } = viewport;
        if (scrollHeight - scrollTop - clientHeight < 200) {
          onLoadMore();
        }
        ticking = false;
      });
    };

    const attachedViewport = viewport;
    attachedViewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      attachedViewport.removeEventListener('scroll', handleScroll);
    };
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  // Smooth scroll to the selected conversation in the list
  useEffect(() => {
    if (!selectedId || !scrollAreaRef.current) return;

    // Small delay to allow the DOM to render after search clear / list update
    const timer = setTimeout(() => {
      const el = scrollAreaRef.current?.querySelector(`[data-conversation-id="${selectedId}"]`);
      if (!el) return;

      const viewport = scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]');
      if (!viewport) return;

      // Only scroll if the element is not already visible in the viewport
      const viewportRect = viewport.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const isVisible = elRect.top >= viewportRect.top && elRect.bottom <= viewportRect.bottom;

      if (!isVisible) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [selectedId]);

  const handleToggleSelection = (conversationId) => {
    setSelectedConversations(prev => {
      if (prev.includes(conversationId)) {
        return prev.filter(id => id !== conversationId);
      } else {
        return [...prev, conversationId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedConversations.length === conversations.length) {
      setSelectedConversations([]);
    } else {
      setSelectedConversations(conversations.map(c => c._id));
    }
  };

  const handleMergeSelected = () => {
    if (selectedConversations.length < 2) {
      toast.error('Please select at least 2 conversations to merge');
      return;
    }
    
    if (onMerge) {
      // Convert to strings to ensure compatibility
      const conversationIds = selectedConversations.map(id => String(id));
      onMerge(conversationIds);
    }
    
    // Don't exit selection mode - let the modal handle it
    // setSelectionMode(false);
    // setSelectedConversations([]);
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedConversations([]);
  };

  /**
   * Returns structured data about the last message for rich rendering (WhatsApp-style)
   */
  const getLastMessageData = (conversation) => {
    if (!conversation.lastMessageContent && !conversation.lastMessage) {
      return { isEmpty: true };
    }

    const lastMsg = conversation.lastMessage || {};
    const content = conversation.lastMessageContent || lastMsg.content || '';
    const type = conversation.lastMessageType || lastMsg.type || 'text';
    const direction = conversation.lastMessageDirection || lastMsg.direction;
    const status = conversation.lastMessageStatus || lastMsg.status;
    const isOutbound = direction === 'outbound';
    const isMediaType = messageTypeLabels[type] && type !== 'text';
    const attachmentPreview = conversation.lastMessagePreviewAttachment || lastMsg.attachments?.[0];

    const MAX_PREVIEW_LENGTH = 40;
    let previewText = '';
    if (isMediaType) {
      if (type === 'document' && attachmentPreview) {
        const name = attachmentPreview.name || 'Document';
        const sizeStr = attachmentPreview.size ? formatFileSize(attachmentPreview.size) : '';
        const suffix = sizeStr ? ` • ${sizeStr}` : '';
        const maxNameLen = Math.max(12, MAX_PREVIEW_LENGTH - suffix.length - 1);
        if (name.length + suffix.length <= MAX_PREVIEW_LENGTH) {
          previewText = name + suffix;
        } else {
          previewText = name.substring(0, maxNameLen) + '…' + suffix;
        }
      } else if ((type === 'image' || type === 'video') && attachmentPreview?.name) {
        const sizeStr = attachmentPreview.size ? ` • ${formatFileSize(attachmentPreview.size)}` : '';
        const full = type === 'image' ? `Photo • ${attachmentPreview.name}${sizeStr}` : `${attachmentPreview.name}${sizeStr}`;
        previewText = full.length > MAX_PREVIEW_LENGTH ? `${full.substring(0, MAX_PREVIEW_LENGTH)}…` : full;
      } else {
        previewText = messageTypeLabels[type];
      }
    } else {
      let text = content;
      if (isOutbound && typeof text === 'string' && text.replace(/^You:\s*/i, '').length > 0) {
        text = text.replace(/^You:\s*/i, '').trim();
      }
      // Collapse newlines/extra whitespace into single spaces (prevents multi-line overflow)
      text = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
      const chars = Array.from(text);
      previewText = chars.length > 50 ? chars.slice(0, 50).join('') + '…' : text;
    }

    return {
      isEmpty: false,
      isOutbound,
      status: isOutbound ? status : null,
      type,
      isMediaType,
      previewText,
    };
  };

  // ✅ Use provided grouped conversations or fallback to sorting all
  const displayConversations = useMemo(() => {
    if (manualConversations.length > 0 || autoConversations.length > 0) {
      // Use grouped conversations (manual first, then auto)
      return conversations; // Already sorted in parent
    }
    // Fallback: sort all conversations
    if (!conversations || conversations.length === 0) return [];
    
    return [...conversations].sort((a, b) => {
      // ✅ Pinned conversations always at top
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      
      // ✅ Both pinned or both not pinned - sort by lastMessageAt (latest first)
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      
      // ✅ Latest message first (descending order)
      return bTime - aTime;
    });
  }, [conversations, manualConversations, autoConversations]);

  // ✅ Calculate duplicate conversation counts (same identifier + same channel)
  // CRITICAL: Only count duplicates from conversations that are actually DISPLAYED
  // This ensures department names only show when there are 2+ visible conversations
  const duplicateCountsMap = useMemo(() => {
    const countsMap = new Map();
    
    // Only count from displayConversations (the conversations actually shown to the user)
    displayConversations.forEach(conv => {
      const contact = conv.contactData || conv.contact || {};
      // Get identifier based on channel type
      let identifier = null;
      if (conv.channel === 'whatsapp' || conv.channel === 'sms') {
        identifier = contact.phone || contact.identifiers?.whatsapp || contact.identifiers?.sms || contact.identifiers?.call;
      } else if (conv.channel === 'email') {
        identifier = contact.email || contact.identifiers?.email;
      } else if (conv.channel === 'webchat') {
        identifier = contact.identifiers?.webchat;
      } else if (conv.channel === 'facebook') {
        identifier = contact.identifiers?.facebook;
      } else if (conv.channel === 'instagram') {
        identifier = contact.identifiers?.instagram;
      }
      
      if (identifier && conv.channel) {
        // Normalize phone numbers for consistent matching
        let normalizedIdentifier = identifier;
        if (conv.channel === 'whatsapp' || conv.channel === 'sms') {
          // Normalize phone: remove spaces, ensure + prefix
          normalizedIdentifier = identifier.replace(/\s/g, '');
          if (!normalizedIdentifier.startsWith('+') && normalizedIdentifier.length > 0) {
            normalizedIdentifier = '+' + normalizedIdentifier;
          }
        } else if (conv.channel === 'email') {
          normalizedIdentifier = identifier.toLowerCase().trim();
        }
        
        const key = `${normalizedIdentifier}:${conv.channel}`;
        countsMap.set(key, (countsMap.get(key) || 0) + 1);
      }
    });
    
    return countsMap;
  }, [displayConversations]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8" role="status" aria-label="Loading conversations">
        <LoadingSpinner />
      </div>
    );
  }

  if (!conversations || conversations.length === 0) {
    // ✅ Show appropriate empty state message based on sort option
    let emptyTitle = 'No conversations found';
    let emptyMessage = 'Start a new conversation to get started';
    
    if (sortBy === 'unread') {
      emptyTitle = 'No unread conversations';
      emptyMessage = 'All conversations are up to date. You\'re all caught up!';
    } else if (sortBy === 'pinned') {
      emptyTitle = 'No pinned conversations';
      emptyMessage = 'Pin important conversations to see them here';
    } else if (sortBy === 'manual') {
      emptyTitle = 'No manual conversations';
      emptyMessage = 'Manual conversations will appear here';
    } else if (sortBy === 'auto') {
      emptyTitle = 'No auto conversations';
      emptyMessage = 'Auto conversations will appear here';
    }
    
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center" role="status">
        <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-3" aria-hidden="true" />
        <p className="text-muted-foreground font-medium">{emptyTitle}</p>
        <p className="text-sm text-muted-foreground/60 mt-1">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      {/* Selection Mode Header */}
      {selectionMode ? (
        <div className="p-2 sm:p-3 bg-card flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground/80">
              {selectedConversations.length} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedConversations.length >= 2 && (
              <Button
                size="sm"
                onClick={handleMergeSelected}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Merge className="h-4 w-4 mr-1" />
                Merge
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancelSelection}
              className="h-8 w-8 p-0 min-h-[44px] min-w-[44px]"
              aria-label="Cancel selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        showHeader && (
          <div className="p-2 sm:p-3 flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-medium text-foreground/80">
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
            </span>
            <Button
              size="sm"
              variant="default"
              onClick={() => setSelectionMode(true)}
              disabled={isViewOnly}
              className="h-8 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckSquare className="h-4 w-4 mr-1.5" />
              Select
            </Button>
          </div>
        )
      )}

      {/* Conversations List with ScrollArea from shadcn */}
      <ScrollArea
        className="flex-1 min-h-0 w-full overflow-x-hidden"
        ref={scrollAreaRef}
      >
        <div className="space-y-0.5 w-full overflow-hidden pr-3" role="listbox" aria-label="Conversations">
          {(() => {
            // ✅ Show labels only when there's a mix of manual and auto conversations
            const hasManual = manualConversations.length > 0;
            const hasAuto = autoConversations.length > 0;
            const showLabels = hasManual && hasAuto; // Only show labels when both exist
            
            return (
              <>
          {/* Manual Conversations Section */}
                {hasManual && (
            <>
              <div ref={manualSectionRef} className="scroll-mt-2 transition-all duration-300" />
                    {/* Manual Conversations Label - Only show when there's a mix */}
                    {showLabels && (
              <div className="relative my-2 px-4">
                <div className="relative flex justify-start">
                  <span className="bg-card px-3 text-xs font-semibold text-muted-foreground">
                    Manual Conversations
                  </span>
                </div>
              </div>
                    )}
              {manualConversations.map((conv) => {
                return renderConversationItem(conv);
              })}
              
                    {/* Beautiful HR Divider with Label - Only show when there's a mix */}
                    {showLabels && hasAuto && (
                <div className="relative my-4 px-4 transition-opacity duration-300">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-card px-3 text-xs font-semibold text-muted-foreground">
                      Auto Conversations
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
          
          {/* Auto Conversations Section */}
                {hasAuto && (
            <>
                    {!hasManual && (
                <div ref={autoSectionRef} className="scroll-mt-2 transition-all duration-300" />
              )}
              {autoConversations.map((conv, index) => {
                // Add ref to first auto conversation if no manual conversations
                      if (!hasManual && index === 0) {
                  return (
                    <div key={conv._id} ref={autoSectionRef} className="scroll-mt-2 transition-all duration-300">
                      {renderConversationItem(conv)}
                    </div>
                  );
                }
                return <div key={conv._id}>{renderConversationItem(conv)}</div>;
              })}
            </>
          )}
          
          {/* Fallback: Render all conversations if not grouped */}
                {!hasManual && !hasAuto && displayConversations.map((conv) => {
            return <div key={conv._id}>{renderConversationItem(conv)}</div>;
          })}
              </>
            );
          })()}
        </div>
        
        {/* Loading indicator for next page */}
        {isFetchingNextPage && (
          <div className="flex items-center justify-center p-4">
            <LoadingSpinner size="sm" />
            <span className="ml-2 text-sm text-gray-500">Loading more conversations...</span>
          </div>
        )}
        
        {/* End of list indicator */}
        {!hasNextPage && displayConversations.length > 0 && (
          <div className="flex items-center justify-center p-4 text-sm text-gray-500">
            No more conversations to load
          </div>
        )}
      </ScrollArea>
    </div>
  );
  
  // ✅ Extract conversation item rendering to a function for reuse
  function renderConversationItem(conv) {
    const channelIconPath = channelIconPaths[conv.channel];
    // ✅ Handle both contactData (from API) and contact (from socket events)
    const contact = conv.contactData || conv.contact || {};
    // ✅ Get phone number for formatting if name is not available
    const phoneNumber = contact.phone || contact.identifiers?.phone || contact.identifiers?.sms;
    const email = contact.email || contact.identifiers?.email;
    // ✅ Always show a proper name - use saved contact name, or identifier (phone/email) as fallback
    // Never show generic names like "WhatsApp User", "SMS User", "Email User"
    const displayName = contact.name || 
                       contact.displayName || 
                       (phoneNumber && (conv.channel === 'sms' || conv.channel === 'whatsapp') ? phoneNumber : null) ||
                       email ||
                       (contact.identifiers?.whatsapp && (conv.channel === 'whatsapp' || conv.channel === 'sms') ? contact.identifiers.whatsapp : null) ||
                       (contact.identifiers?.sms && (conv.channel === 'sms' || conv.channel === 'whatsapp') ? contact.identifiers.sms : null) ||
                       (contact.identifiers?.email && conv.channel === 'email' ? contact.identifiers.email : null) ||
                       (contact.identifiers?.webchat && conv.channel === 'webchat' ? `WebChat ${contact.identifiers.webchat.substring(0, 8)}` : null) ||
                       'Contact';
    // ✅ Determine if we should show formatted phone number
    const shouldFormatPhone = !contact.name && !contact.displayName && phoneNumber && (conv.channel === 'sms' || conv.channel === 'whatsapp');
    
    // ✅ Get identifier for duplicate detection
    let identifier = null;
    if (conv.channel === 'whatsapp' || conv.channel === 'sms') {
      identifier = phoneNumber || contact.identifiers?.whatsapp || contact.identifiers?.sms || contact.identifiers?.call;
    } else if (conv.channel === 'email') {
      identifier = email || contact.identifiers?.email;
    } else if (conv.channel === 'webchat') {
      identifier = contact.identifiers?.webchat;
    } else if (conv.channel === 'facebook') {
      identifier = contact.identifiers?.facebook;
    } else if (conv.channel === 'instagram') {
      identifier = contact.identifiers?.instagram;
    }
    
    // ✅ Normalize identifier for consistent matching
    let normalizedIdentifier = identifier;
    if (identifier && (conv.channel === 'whatsapp' || conv.channel === 'sms')) {
      // Normalize phone: remove spaces, ensure + prefix
      normalizedIdentifier = identifier.replace(/\s/g, '');
      if (!normalizedIdentifier.startsWith('+') && normalizedIdentifier.length > 0) {
        normalizedIdentifier = '+' + normalizedIdentifier.replace(/^\+/, '');
      }
    } else if (identifier && conv.channel === 'email') {
      normalizedIdentifier = identifier.toLowerCase().trim();
    }
    
    // ✅ Check if we should show department name (only if 2+ conversations with same identifier + channel)
    const identifierChannelKey = normalizedIdentifier && conv.channel ? `${normalizedIdentifier}:${conv.channel}` : null;
    const duplicateCount = identifierChannelKey ? duplicateCountsMap.get(identifierChannelKey) || 0 : 0;
    const shouldShowDepartment = duplicateCount >= 2 && conv.department;
    const departmentName = shouldShowDepartment && conv.department?.name ? conv.department.name : null;
    
    const lastMsg = getLastMessageData(conv);
    const isSelected = conv._id === selectedId;
    const isChecked = selectedConversations.includes(conv._id);

          return (
            <div
              key={conv._id}
              data-conversation-id={conv._id}
              role="option"
              aria-selected={isSelected}
              aria-label={`${displayName}${conv.unreadCount > 0 ? `, ${conv.unreadCount} unread` : ''}${conv.isPinned ? ', pinned' : ''}`}
              tabIndex={0}
              className={cn(
          'group relative hover:bg-muted/60 transition-colors duration-200 ease-in-out overflow-hidden motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                isSelected && 'bg-primary/10 border-l-4 border-l-primary'
              )}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !selectionMode && onSelect) {
                  e.preventDefault();
                  onSelect(conv._id);
                }
              }}
            >
              <div
          className="p-2 sm:p-3 lg:p-4 cursor-pointer"
                onClick={() => {
                  if (!selectionMode && onSelect) {
                    onSelect(conv._id);
                  }
                }}
              >
                <div className="flex gap-3 min-w-0">
                  {/* Checkbox (shown in selection mode) */}
                  {selectionMode && (
                    <div
                      className="flex items-center flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox 
                        checked={isChecked}
                        onCheckedChange={() => handleToggleSelection(conv._id)}
                      />
                    </div>
                  )}

                  {/* Avatar with Channel Badge */}
                  <div className="relative flex-shrink-0">
                    <Avatar className="h-12 w-12 ring-2 ring-card shadow-sm">
                      <AvatarImage src={contact.avatar} />
                      <AvatarFallback className="text-sm font-semibold bg-primary text-primary-foreground">
                        {displayName.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {/* Channel Badge - Only show if NOT merged (merged shows icons in badges section) */}
                    {!conv.isMerged && channelIconPath && (
                    <div className="absolute -bottom-1 -right-1 rounded-full p-0.5 bg-card shadow-sm border border-border">
                      <div className="relative w-5 h-5">
                        <Image
                          src={channelIconPath}
                          alt={conv.channel || 'channel'}
                          fill
                          className="object-contain rounded-full"
                          sizes="20px"
                          style={{ filter: channelColorFilters[conv.channel] || 'brightness(0) saturate(100%) invert(50%)' }}
                        />
                      </div>
                    </div>
                    )}
                  </div>

                  {/* Content - CSS Grid: col1=truncatable, col2=fixed */}
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <div className="grid gap-x-2" style={{ gridTemplateColumns: '1fr auto' }}>
                      {/* Row 1 Col 1: Name */}
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        {conv.isPinned && (
                          <Pin className="h-3 w-3 text-blue-600 dark:text-blue-400 shrink-0" fill="currentColor" />
                        )}
                        {conv.isStarred && (
                          <Star className="h-3 w-3 text-yellow-500 shrink-0" fill="currentColor" />
                        )}
                        {conv.isMuted && (
                          <BellOff className="h-3 w-3 text-gray-500 shrink-0" />
                        )}
                        {conv.isSnoozed && (
                          <AlarmClock className="h-3 w-3 text-orange-500 shrink-0" />
                        )}
                        <div className="overflow-hidden">
                          {shouldFormatPhone ? (
                            <PhoneNumberDisplay phone={phoneNumber} showFlag={false} />
                          ) : (
                            <h3 className={cn(
                              'font-semibold truncate text-sm leading-5',
                              isSelected && 'text-primary'
                            )}>
                              {displayName}
                            </h3>
                          )}
                          {shouldShowDepartment && departmentName && (
                            <span className="text-[10px] text-muted-foreground truncate block">
                              {departmentName}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Row 1 Col 2: Timestamp + Menu */}
                      <div className="flex items-center gap-1 justify-end">
                        {conv.lastMessageAt && (
                          <span className={cn(
                            "text-[11px] whitespace-nowrap",
                            conv.unreadCount > 0
                              ? 'text-blue-500 dark:text-blue-400 font-medium'
                              : 'text-muted-foreground'
                          )}>
                            {formatConversationTime(conv.lastMessageAt)}
                          </span>
                        )}
                        {!selectionMode && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center h-7 w-7 min-h-[44px] min-w-[44px] rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                aria-label={`Actions for ${displayName}`}
                              >
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <ConversationActionsMenu
                                conversation={conv}
                                onAction={() => {}}
                                isViewOnly={isViewOnly}
                              />
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>

                      {/* Row 2 Col 1: Last Message */}
                      <div className="flex items-center gap-1 overflow-hidden">
                        {lastMsg.isEmpty ? (
                          <span className="text-xs text-gray-400 dark:text-gray-500 italic truncate">
                            No messages yet
                          </span>
                        ) : (
                          <>
                            {lastMsg.isOutbound && lastMsg.status && (
                              <MessageStatusIcon status={lastMsg.status} />
                            )}
                            {lastMsg.isOutbound && (
                              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">You:</span>
                            )}
                            {lastMsg.isMediaType && (
                              <MessageTypeIcon type={lastMsg.type} />
                            )}
                            <span className={cn(
                              'text-xs truncate',
                              conv.unreadCount > 0
                                ? 'font-semibold text-gray-900 dark:text-gray-100'
                                : 'text-muted-foreground'
                            )}>
                              {lastMsg.previewText}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Row 2 Col 2: Unread Badge */}
                      <div className="flex items-center gap-1 justify-end">
                        {(() => {
                          const isAutoMode = conv.mode === 'auto';
                          const shouldShowUnread = !isAIBotEnabled || !isAutoMode;
                          return shouldShowUnread && conv.unreadCount > 0 && (
                            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary text-primary-foreground rounded-full min-w-[16px] flex items-center justify-center">
                              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                            </Badge>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Row 3: Tags and Merged Channel Icons */}
                    {(conv.isMerged || (conv.tags && conv.tags.length > 0)) && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5 overflow-hidden">
                      {/* Merged Conversation Channel Icons */}
                      {conv.isMerged && (() => {
                        const allChannels = new Map();
                        if (conv.channel && channelIconPaths[conv.channel]) {
                          allChannels.set(conv.channel, {
                            channel: conv.channel,
                            isPrimary: true
                          });
                        }
                        if (conv.mergedConversations && conv.mergedConversations.length > 0) {
                          conv.mergedConversations.forEach((merged) => {
                            const channel = merged?.channel;
                            if (channel && typeof channel === 'string' && channel.trim() !== '' && channelIconPaths[channel] && !allChannels.has(channel)) {
                              allChannels.set(channel, {
                                channel: channel,
                                isPrimary: false,
                                conversationId: merged.conversationId
                              });
                            }
                          });
                        }
                        const channelsToRender = Array.from(allChannels.values());
                        if (channelsToRender.length === 0) return null;
                        return (
                          <div className="flex items-center gap-1.5 relative group/merge">
                            {channelsToRender.map((channelInfo) => {
                              const channel = channelInfo.channel;
                              const iconPath = channelIconPaths[channel];
                              if (!iconPath) return null;
                              return (
                                <div
                                  key={`channel-${channel}-${channelInfo.conversationId || channel}`}
                                  className="relative flex items-center justify-center rounded-full p-0.5 bg-card shadow-sm border border-border transition-transform hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100"
                                  title={channel === 'whatsapp' ? 'WhatsApp' :
                                         channel === 'email' ? 'Email' :
                                         channel === 'sms' ? 'SMS' :
                                         channel === 'facebook' ? 'Facebook' :
                                         channel === 'instagram' ? 'Instagram' :
                                         channel === 'webchat' ? 'Webchat' : channel}
                                >
                                  <div className="relative w-5 h-5">
                                    <Image
                                      src={iconPath}
                                      alt={channel || 'channel'}
                                      fill
                                      className="object-contain rounded-full"
                                      sizes="20px"
                                      style={{ filter: channelColorFilters[channel] || 'brightness(0) saturate(100%) invert(50%)' }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                            <div className="absolute left-0 bottom-full mb-2 opacity-0 group-hover/merge:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                              <div className="bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg border border-border">
                                {channelsToRender.map((channelInfo, idx) => {
                                  const channel = channelInfo.channel;
                                  const channelName = channel === 'whatsapp' ? 'WhatsApp' :
                                                      channel === 'email' ? 'Email' :
                                                      channel === 'sms' ? 'SMS' :
                                                      channel === 'facebook' ? 'Facebook' :
                                                      channel === 'instagram' ? 'Instagram' :
                                                      channel === 'webchat' ? 'Webchat' : channel;
                                  return idx === 0 ? channelName : `, ${channelName}`;
                                }).join('')}
                                <div className="absolute left-4 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {conv.tags?.slice(0, 2).map(tag => (
                        <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
  }
}