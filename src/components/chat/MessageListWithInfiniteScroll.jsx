// src/components/chat/MessageListWithInfiniteScroll.jsx
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useInfiniteQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useSocketEvent } from '@/hooks/useSocket';
import { format, isToday, isYesterday, isThisWeek, startOfDay } from 'date-fns';
import {
  Loader2,
  MoreVertical,
  Reply,
  Copy,
  Download,
  Smile,
  RefreshCw,
  ArrowDown,
  Globe,
} from 'lucide-react';
import MessageAttachment from './MessageAttachment';
import MessageAttachmentGroup from './MessageAttachmentGroup';
import MessageStatus from './MessageStatus';
import VoicePlayer from './VoicePlayer';
// ForwardMessageModal removed - feature not active
import ContactMessageCard from './ContactMessageCard';
// Bug 10 fix: Removed unused MessageBubble import (inline rendering is used instead)
import EmailMessageBubble from './EmailMessageBubble';
import CallLog from './CallLog';
import ChannelIcon from '@/components/shared/ChannelIcon';
import LinkPreview, { detectUrls, renderTextWithLinks, isFileUrl } from '@/components/shared/LinkPreview';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import apiClient from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { updateMessagesCacheForConversation as updateMessagesCache } from '@/utils/messageCacheUtils';
import { toast } from 'sonner';
import { getNotificationSoundService } from '@/services/notification/NotificationSoundService';

// Debug logger - suppressed in production
const isDev = process.env.NODE_ENV === 'development';
const debugLog = isDev ? console.log.bind(console) : () => {};
const debugWarn = isDev ? console.warn.bind(console) : () => {};

/**
 * Get date separator label
 */
function getDateSeparator(date) {
  const messageDate = new Date(date);
  if (isToday(messageDate)) return 'Today';
  if (isYesterday(messageDate)) return 'Yesterday';
  if (isThisWeek(messageDate)) return format(messageDate, 'EEEE');
  return format(messageDate, 'MM/dd/yyyy');
}

/**
 * Group messages by date
 */
function groupMessagesByDate(messages) {
  const groups = [];
  let currentDate = null;
  
  messages.forEach((message) => {
    const messageDate = startOfDay(new Date(message.createdAt)).getTime();
    if (messageDate !== currentDate) {
      currentDate = messageDate;
      groups.push({
        type: 'date-separator',
        date: message.createdAt,
        label: getDateSeparator(message.createdAt)
      });
    }
    groups.push({ type: 'message', data: message });
  });
  
  return groups;
}

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const EXTRA_REACTIONS = ['👏','🔥','🎉','😍','🙌','👌','💯','😎','🤯','🤔','🤝','💡','❗','❓','🫶','🌟'];

export default function MessageListWithInfiniteScroll({ 
  conversationId, 
  conversation,
  optimisticMessages = [],
  onReply,
  onDelete
}) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const scrollContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);
  const [messageReactions, setMessageReactions] = useState({}); // { messageId: [{ userId, reaction, userName }] }
  const [userIdMap, setUserIdMap] = useState({}); // Track user IDs to prevent duplicates
  const [showReactionDetails, setShowReactionDetails] = useState(null); // { messageId, emoji }
  const [openPickerFor, setOpenPickerFor] = useState(null); // controls reaction picker popover per message
  const [resendingMessageId, setResendingMessageId] = useState(null); // Track which message is being resent
  const [openCallLogId, setOpenCallLogId] = useState(null); // Track which call log is open
  const [newMessageCount, setNewMessageCount] = useState(0); // New messages while scrolled up
  const [typingUsers, setTypingUsers] = useState([]); // Users currently typing
  const [activeActionMessageId, setActiveActionMessageId] = useState(null); // Touch: long-press active message
  const longPressTimerRef = useRef(null); // Touch: long-press timer
  const lastScrollTop = useRef(0);
  const isInitialLoad = useRef(true);
  const isFetchingRef = useRef(false);
  const lastFetchScrollTop = useRef(-1);
  
  // ✅ CRITICAL: Define ref BEFORE useInfiniteQuery to avoid initialization errors
  // Track previous conversationId to detect changes in refetchOnMount
  const prevConversationIdRef = useRef(conversationId);
  
  // Fetch messages
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error: messagesError,
    refetch
  } = useInfiniteQuery({
    queryKey: ['messages-infinite', conversationId, conversation?.channel ?? 'unknown'],
    // ✅ CRITICAL: Use cached data immediately while refetching in background
    placeholderData: (previousData) => previousData, // Show cached messages instantly
    queryFn: async ({ pageParam = 1, signal, queryKey }) => {
      debugLog(`📥 Fetching messages for conversation ${conversationId}, page ${pageParam}`, {
        isMerged: conversation?.isMerged,
        mergedCount: conversation?.mergedConversations?.length || 0,
        channel: conversation?.channel
      });
      const startTime = Date.now();
      
      // ✅ Use React Query's built-in signal for cancellation with timeout
      const controller = new AbortController();
      let timeoutId = null;
      
      // Set up timeout - increased for production builds
      timeoutId = setTimeout(() => {
        if (!controller.signal.aborted) {
          debugWarn(`⏱️ Message fetch timeout for conversation ${conversationId}, page ${pageParam}`);
          controller.abort();
        }
      }, 30000); // ✅ 30 second timeout for production builds
      
      // Combine signals - use React Query's signal if available, otherwise use our controller
      const requestSignal = signal || controller.signal;
      
      // If we have both signals, create a combined one
      let combinedSignal = requestSignal;
      if (signal && controller.signal) {
        const combined = new AbortController();
        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          combined.abort();
        });
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          combined.abort();
        });
        combinedSignal = combined.signal;
      }
      
      // ✅ Use cursor-based pagination: get the oldest message ID from previous pages
      // This ensures we don't fetch duplicate messages
      let beforeMessageId = null;
      if (pageParam > 1) {
        // Get all previous pages from queryClient cache using the queryKey
        const queryData = queryClient.getQueryData(queryKey);
        if (queryData?.pages) {
          // Find the oldest message from all previous pages
          const previousPages = queryData.pages.slice(0, pageParam - 1);
          const allPreviousMessages = previousPages.flatMap(p => p.data || []);
          if (allPreviousMessages.length > 0) {
            // Sort by createdAt ascending to get the oldest message
            const sortedMessages = [...allPreviousMessages].sort((a, b) => 
              new Date(a.createdAt) - new Date(b.createdAt)
            );
            beforeMessageId = sortedMessages[0]?._id;
          }
        }
      }
      
      try {
        const response = await apiClient.get(`/messages/${conversationId}`, {
          params: { 
            ...(beforeMessageId ? { before: beforeMessageId } : { page: pageParam }), 
            limit: 50, 
            sort: '-createdAt' 
          },
          signal: combinedSignal,
          timeout: 30000, // ✅ 30 second timeout for production builds
        });
        
        // ✅ Clear timeout on success
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      
        const fetchTime = Date.now() - startTime;
        
        debugLog(`✅ Messages fetched in ${fetchTime}ms for conversation ${conversationId}`, {
          page: pageParam,
          messageCount: response?.data?.length || 0,
          hasMore: response?.pagination?.hasMore,
          isMerged: conversation?.isMerged
        });
        
        // ✅ Ensure response has correct structure for React Query infinite query
        return {
          data: response.data?.data || response.data || [],
          pagination: response.data?.pagination || response.pagination || { hasMore: false }
        };
      } catch (error) {
        // ✅ Always clear timeout in catch block
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        // ✅ Check if error is actually an abort/cancel (these are expected and not real errors)
        const isAbortError = error?.name === 'AbortError' ||
                            error?.name === 'CanceledError' ||
                            error?.code === 'ECONNABORTED' ||
                            error?.code === 'ERR_CANCELED';
        
        // ✅ Suppress abort/cancel errors silently - these are expected when requests are cancelled
        if (isAbortError) {
          // Don't log abort errors - they're expected when requests are cancelled or timeout
          // Return empty result - React Query will handle retry if needed
          return { data: [], pagination: { page: pageParam, hasMore: false } };
        }
        
        // ✅ Only log actual errors (not aborts/cancels or empty objects)
        // Check if error has meaningful information before logging
        const hasErrorInfo = (error && typeof error === 'object' && (
          error.message || 
          error.response || 
          error.code || 
          error.name ||
          Object.keys(error).length > 0 // Check if object has any properties
        ));
        
        if (hasErrorInfo) {
          // ✅ If conversation is not found or access denied, throw specific error
          if (error.response?.status === 404) {
            console.error(`❌ Conversation ${conversationId} not found (404)`);
            throw new Error('Conversation not found');
          } else if (error.response?.status === 403) {
            console.error(`❌ Access denied to conversation ${conversationId} (403)`);
            throw new Error('Access denied to this conversation');
          }
          
          // ✅ For network errors, throw to trigger retry
          if (!error.response) {
            console.error(`❌ Network error fetching messages for conversation ${conversationId}:`, error.message || error);
            throw error; // Let React Query handle retry
          }
          
          // ✅ For other HTTP errors, log and return empty result
          if (error.response?.status >= 400) {
            debugWarn(`⚠️ HTTP error ${error.response.status} fetching messages for conversation ${conversationId}:`, error.message || error);
            return { data: [], pagination: { page: pageParam, hasMore: false } };
          }
          
          // ✅ For other errors with info, log as warning (but only if it's not an empty object)
          if (error.message || error.code || error.name) {
            debugWarn(`⚠️ Error fetching messages for conversation ${conversationId}, page ${pageParam}:`, {
              message: error?.message,
              status: error?.response?.status,
              code: error?.code,
              name: error?.name
            });
          }
        }
        // ✅ If error has no info (empty object or null/undefined), it's likely a handled case - don't log
        
        // ✅ Return empty result to prevent infinite loading
        return { data: [], pagination: { page: pageParam, hasMore: false } };
      }
    },
    getNextPageParam: (lastPage, allPages) => {
      const hasMore = lastPage?.pagination?.hasMore;
      if (!hasMore) return undefined;
      
      // ✅ Return the next page number (current page count + 1)
      // This ensures we fetch the next page correctly
      return allPages.length + 1;
    },
    // ✅ CRITICAL: Don't wait for conversation data - load messages immediately
    // This prevents infinite loading if conversation query is slow
    // However, we should still enable it even if conversation is undefined to allow initial load
    enabled: !!conversationId && conversationId !== 'new' && typeof window !== 'undefined', // ✅ Only fetch if conversationId exists and on client side
    staleTime: 30000, // 30 seconds — ensures fresh data on page refresh while still caching
    gcTime: 300000, // 5 minutes — cached messages cleaned up after navigation
    refetchOnWindowFocus: false, // ✅ Disable - socket updates handle real-time
    retry: (failureCount, error) => {
      // ✅ Don't retry on abort/timeout errors
      if (error?.name === 'AbortError' || error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        return false;
      }
      // ✅ Retry up to 2 times for other errors
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // ✅ Exponential backoff
    refetchOnMount: (query) => {
      // ✅ Only refetch if conversationId changed or no cached data
      const hasCachedData = query.state.data !== undefined && query.state.data?.pages?.length > 0;
      const currentConvId = query.queryKey[1];
      const conversationIdChanged = prevConversationIdRef.current !== currentConvId;
      
      // Update ref if conversationId changed
      if (conversationIdChanged) {
        prevConversationIdRef.current = currentConvId;
        isFetchingRef.current = false; // Reset fetch flag on conversation change
      }
      
      // Only refetch if conversationId changed or no cached data
      return conversationIdChanged || !hasCachedData;
    },
    refetchOnReconnect: true, // ✅ Always refetch on reconnect
    // ❌ REMOVED: No polling - socket updates handle all real-time updates
    // ✅ Suppress error messages for timeout errors
    throwOnError: (error) => {
      // ✅ Don't throw timeout errors - handle them gracefully
      if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        return false;
      }
      // ✅ Don't throw other errors either - handle them gracefully
      return false;
    },
    initialPageParam: 1,
    // ✅ CRITICAL: Add timeout to prevent infinite loading
    networkMode: 'online', // Only fetch when online
  });

  // ✅ Filter out reaction messages and deduplicate by message ID
  // Use Map to ensure unique messages by _id
  const messageMap = new Map();
  data?.pages?.forEach(page => {
    const msgs = page.data || [];
    msgs.forEach(msg => {
      if (msg.type !== 'reaction' && msg._id) {
        // Only add if not already in map (prevents duplicates)
        if (!messageMap.has(msg._id)) {
          messageMap.set(msg._id, msg);
        }
      }
    });
  });
  
  // Convert map to array — API returns in chronological order (oldest first for display)
  // Sort by createdAt to ensure correct order regardless of page merge order
  const fetchedMessages = Array.from(messageMap.values()).sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  
  // ✅ CRITICAL: Filter out optimistic messages that have been replaced by real messages
  // This prevents duplicate messages when optimistic messages are replaced by real messages
  const optimisticMessagesFiltered = optimisticMessages.filter(optMsg => {
    if (optMsg.type === 'reaction') return false;
    
    // ✅ Check if this optimistic message has been replaced by a real message in fetched messages
    const hasRealMessage = fetchedMessages.some(fmsg => {
      // Match by tempId
      if (optMsg.tempId && (fmsg.metadata?.tempId === optMsg.tempId || fmsg.tempId === optMsg.tempId)) {
        return true;
      }
      
      // Match by _id (if optimistic has real ID)
      if (optMsg._id && fmsg._id && String(optMsg._id) === String(fmsg._id) && !fmsg.isOptimistic) {
        return true;
      }
      
      // ✅ For template messages, match by templateName + channel + time
      if (optMsg.type === 'template' && fmsg.type === 'template' && 
          optMsg.direction === 'outbound' && fmsg.direction === 'outbound') {
        const templateMatch = optMsg.templateName === fmsg.templateName || 
                             optMsg.metadata?.templateName === fmsg.templateName ||
                             optMsg.metadata?.templateName === fmsg.metadata?.templateName;
        const channelMatch = (optMsg.channel || fmsg.channelType) === (fmsg.channel || optMsg.channel);
        const timeMatch = Math.abs(new Date(optMsg.createdAt) - new Date(fmsg.createdAt)) < 30000; // 30 seconds
        
        if (templateMatch && channelMatch && timeMatch) {
          return true;
        }
      }
      
      return false;
    });
    
    // ✅ Only include optimistic messages that haven't been replaced
    return !hasRealMessage;
  });
  
  const allMessages = [...fetchedMessages, ...optimisticMessagesFiltered].sort((a, b) => 
    new Date(a.createdAt) - new Date(b.createdAt)
  );
  
  const groupedItems = groupMessagesByDate(allMessages);

  // ✅ Load reactions from database when messages are fetched
  // Bug 14 fix: Use a stable fingerprint of reaction data instead of just length
  // This ensures reactions update when messages are refetched with different reaction data
  const reactionsFingerprint = fetchedMessages.reduce((fp, msg) => {
    if (msg.reactions?.length) {
      return fp + msg._id + ':' + msg.reactions.length + ',';
    }
    return fp;
  }, '');

  useEffect(() => {
    if (fetchedMessages.length > 0) {
      const reactionsMap = {};
      const userMap = {};

      fetchedMessages.forEach(message => {
        if (message.reactions && message.reactions.length > 0) {
          reactionsMap[message._id] = message.reactions.map(r => ({
            userId: r.user?._id || r.user || r.contact?._id || r.contact,
            reaction: r.emoji,
            userName: r.user?.firstName
              ? `${r.user.firstName} ${r.user.lastName || ''}`.trim()
              : (r.contact?.name || 'User')
          }));

          // Track user IDs
          message.reactions.forEach(r => {
            const uid = r.user?._id || r.user || r.contact?._id || r.contact;
            if (!userMap[message._id]) userMap[message._id] = {};
            userMap[message._id][uid] = true;
          });
        }
      });

      setMessageReactions(reactionsMap);
      setUserIdMap(userMap);
    }
  }, [reactionsFingerprint, fetchedMessages.length]);

  // Auto-scroll - double rAF for reliable positioning after DOM paint
  useEffect(() => {
    if (shouldScrollToBottom) {
      const behavior = isInitialLoad.current ? 'auto' : 'smooth';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
          } else if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
          }
          if (isInitialLoad.current) isInitialLoad.current = false;
        });
      });
    }
  }, [allMessages.length, shouldScrollToBottom]);
  
  // ✅ CRITICAL: Always scroll to bottom when conversation changes
  useEffect(() => {
    // Reset state for new conversation
    isInitialLoad.current = true;
    setShouldScrollToBottom(true);
    setMessageReactions({});
    setNewMessageCount(0);
    setTypingUsers([]);
    isFetchingRef.current = false;
    lastFetchScrollTop.current = -1;
    lastScrollTop.current = Infinity; // Prevent false "scrolling up" on first scroll event

    // ✅ Force scroll to bottom after a short delay to ensure messages are rendered
    const timer = setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({
          behavior: 'auto',
          block: 'end'
        });
      } else if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
      // Set lastScrollTop to actual position after scrolling
      if (scrollContainerRef.current) {
        lastScrollTop.current = scrollContainerRef.current.scrollTop;
      }
    }, 200);
    
    return () => clearTimeout(timer);
  }, [conversationId]);

  // ✅ When user sends a message (optimistic message added), scroll to bottom and reset counter
  const prevOptimisticLengthRef = useRef(optimisticMessages.length);
  useEffect(() => {
    if (optimisticMessages.length > prevOptimisticLengthRef.current) {
      // New optimistic message was added → user just sent a message
      setNewMessageCount(0);
      setShouldScrollToBottom(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
          } else if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
          }
        });
      });
    }
    prevOptimisticLengthRef.current = optimisticMessages.length;
  }, [optimisticMessages.length]);

  // ✅ CRITICAL: Watch for conversation loading and refetch messages when conversation becomes available
  // This ensures messages are fetched with correct channel/isMerged values
  const prevConversationRef = useRef(conversation);
  const hasRefetchedForConversation = useRef(false);
  
  // ✅ Reset refetch flag when conversationId changes
  useEffect(() => {
    if (prevConversationIdRef.current !== conversationId) {
      hasRefetchedForConversation.current = false;
      prevConversationIdRef.current = conversationId;
      prevConversationRef.current = undefined;
    }
  }, [conversationId]);
  
  useEffect(() => {
    // ✅ If conversation just loaded (was undefined, now has data), refetch messages
    const prevConv = prevConversationRef.current;
    const currentConv = conversation;
    
    // ✅ If conversation just became available, refetch messages with correct query key
    if (!prevConv && currentConv && !hasRefetchedForConversation.current) {
      debugLog('🔄 Conversation just loaded - refetching messages with correct parameters:', {
        conversationId,
        channel: currentConv.channel,
        isMerged: currentConv.isMerged
      });
      
      hasRefetchedForConversation.current = true;
      
      // Remove old query with 'unknown' channel (3-element key)
      queryClient.removeQueries({
        queryKey: ['messages-infinite', conversationId, 'unknown'],
        exact: true
      });
      
      // ✅ Refetch with correct query key
      refetch().then(() => {
        debugLog('✅ Messages refetched after conversation loaded');
      }).catch(error => {
        console.error('❌ Error refetching messages after conversation loaded:', error);
      });
    }
    
    prevConversationRef.current = currentConv;
  }, [conversation, conversationId, queryClient, refetch]);
  
  // ✅ CRITICAL: Watch for conversation merge status changes and refetch messages
  // This ensures messages are refetched when conversation.isMerged changes
  // Use ref to track previous merge status to prevent duplicate triggers
  const prevIsMergedRef = useRef(conversation?.isMerged);
  
  useEffect(() => {
    const currentIsMerged = conversation?.isMerged || false;
    const prevIsMerged = prevIsMergedRef.current;
    
    // ✅ Only trigger if merge status actually changed
    if (currentIsMerged === prevIsMerged) {
      prevIsMergedRef.current = currentIsMerged;
      return;
    }
    
    prevIsMergedRef.current = currentIsMerged;
    
    debugLog('🔄 Conversation merge status changed - clearing cache and refetching messages:', {
      conversationId,
      previousIsMerged: prevIsMerged,
      currentIsMerged: currentIsMerged,
      mergedConversations: conversation?.mergedConversations?.length || 0
    });
    
    // ✅ CRITICAL: Remove ALL message cache entries IMMEDIATELY (no delay)
    queryClient.removeQueries({ 
      queryKey: ['messages-infinite', conversationId],
      exact: false
    });
    
    // ✅ IMMEDIATE refetch with new query key (no setTimeout delay)
    // The query key includes isMerged, so changing it will automatically trigger a new query
    queryClient.refetchQueries({ 
      queryKey: ['messages-infinite', conversationId, currentIsMerged, conversation?.channel ?? 'unknown'],
      exact: false,
      type: 'active'
    }).then(() => {
      debugLog('✅ Messages refetched immediately after merge status change');
      setShouldScrollToBottom(true);
    }).catch(error => {
      console.error('❌ Error refetching messages after merge status change:', error);
      // ✅ Fallback: try refetch() method
      refetch().catch(err => {
        console.error('❌ Error with refetch() fallback:', err);
      });
    });
  }, [conversation?.isMerged, conversation?.channel, conversationId, queryClient, refetch]);

  // Handle scroll - Enhanced to match webchat implementation
  const handleScroll = useCallback((e) => {
    const container = e?.currentTarget || e?.target || scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;

    // Track scroll direction - only load more when scrolling UP (not down)
    const isScrollingUp = scrollTop < lastScrollTop.current;
    const isScrollingDown = scrollTop > lastScrollTop.current;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 150; // generous threshold
    const isSignificantlyScrolledUp = scrollTop + clientHeight < scrollHeight - 300; // only show arrow when clearly scrolled up

    // ✅ Update scroll state based on position
    if (isSignificantlyScrolledUp && isScrollingUp) {
      setShouldScrollToBottom(false);
    } else if (isNearBottom) {
      setShouldScrollToBottom(true);
      setNewMessageCount(0); // Clear new message count when user scrolls to bottom
    }
    lastScrollTop.current = scrollTop;

    // ✅ Load more ONLY when scrolling UP and near top (prevents loading when scrolling down)
    const scrollThreshold = 200;
    const isNearTop = scrollTop < scrollThreshold;
    // ✅ Only trigger if scrolling UP and scroll position changed significantly
    const scrollChanged = Math.abs(scrollTop - lastFetchScrollTop.current) > 50;
    
    // ✅ CRITICAL: Only load more when scrolling UP, not when scrolling down
    if (isScrollingUp && isNearTop && hasNextPage && !isFetchingNextPage && !isFetchingRef.current && scrollChanged) {
      isFetchingRef.current = true; // Set flag to prevent duplicate fetches
      lastFetchScrollTop.current = scrollTop; // Track scroll position when fetch was triggered
      const scrollHeightBefore = scrollHeight;
      
      fetchNextPage().then(() => {
        // Maintain scroll position after loading more messages
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
              const newScrollHeight = scrollContainerRef.current.scrollHeight;
              const diff = newScrollHeight - scrollHeightBefore;
              scrollContainerRef.current.scrollTop = diff + scrollTop;
              lastFetchScrollTop.current = scrollContainerRef.current.scrollTop;
            }
            isFetchingRef.current = false;
          });
        });
      }).catch((error) => {
        console.error('Error fetching next page:', error);
        isFetchingRef.current = false; // Reset flag on error
        lastFetchScrollTop.current = -1; // Reset on error to allow retry
      });
    } else if (!isNearTop || isScrollingDown) {
      // ✅ Reset scroll position tracking when scrolled away from top or scrolling down
      lastFetchScrollTop.current = -1;
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ✅ Use shared utility function to update messages cache
  const updateMessagesCacheForConversation = useCallback((targetConvId, message, conversationData = null) => {
    return updateMessagesCache(queryClient, targetConvId, message, conversationData);
  }, [queryClient]);

  // Socket: New messages
  useSocketEvent('message:new', useCallback((data) => {
    debugLog('\n💬' + '='.repeat(58));
    debugLog('💬 MessageListWithInfiniteScroll: Received message:new event');
    debugLog('💬' + '='.repeat(58));
    debugLog('💬 Data structure:', {
      hasData: !!data,
      hasMessage: !!(data?.message),
      conversationId: data?.conversationId,
      dataKeys: data ? Object.keys(data) : []
    });
    
    const newMessage = data.message || data;
    const messageConvIdRaw = data.conversationId || newMessage.conversation || newMessage.conversationId;
    const messageConvId = String(messageConvIdRaw);
    const currentConvId = String(conversationId);
    
    // ✅ CRITICAL: Always update cache for the conversation the message belongs to
    // This ensures messages appear when switching back to that conversation
    if (messageConvId && messageConvId !== 'undefined' && newMessage.type !== 'reaction') {
      const conversationData = data.conversation || null;
      updateMessagesCacheForConversation(messageConvId, newMessage, conversationData);
    }
    
    // ✅ Log template message details
    if (newMessage.type === 'template') {
      debugLog('📋 Template message received:', {
        messageId: newMessage._id,
        templateName: newMessage.templateName,
        contentLength: newMessage.content?.length,
        contentPreview: newMessage.content?.substring(0, 100),
        hasEmailData: !!newMessage.emailData,
        emailSubject: newMessage.emailData?.subject,
        metadataTempId: newMessage.metadata?.tempId,
        tempId: newMessage.tempId,
      });
    }
    
    // ✅ Check if message is from a merged conversation
    const isFromMergedConversation = conversation?.isMerged && 
      conversation?.mergedConversations?.some(mc => String(mc.conversationId) === messageConvId);
    
    // ✅ CRITICAL: For company admins, check if message is from any grouped department conversation
    const isFromGroupedConversation = conversation?._allDepartmentConversationIds && 
      Array.isArray(conversation._allDepartmentConversationIds) &&
      conversation._allDepartmentConversationIds.some(groupedId => String(groupedId) === messageConvId);
    
    const isDirectMatch = messageConvId === currentConvId;
    const shouldDisplayMessage = isDirectMatch || isFromMergedConversation || isFromGroupedConversation;
    
    debugLog('💬 Conversation ID check:', {
      messageConvId,
      currentConvId,
      isDirectMatch,
      isFromMergedConversation,
      isFromGroupedConversation,
      shouldDisplayMessage,
      messageId: newMessage._id,
      messageType: newMessage.type,
      messageDirection: newMessage.direction,
      conversationIsMerged: conversation?.isMerged,
      mergedConversations: conversation?.mergedConversations?.map(mc => String(mc.conversationId)),
      allGroupedConversationIds: conversation?._allDepartmentConversationIds?.map(id => String(id))
    });
    
    if (shouldDisplayMessage) {
      debugLog('✅ Message is for current conversation or merged conversation - adding to UI');
      // Skip reaction messages
      if (newMessage.type === 'reaction') return;

      queryClient.setQueryData(['messages-infinite', conversationId, conversation?.channel ?? 'unknown'], (oldData) => {
        if (!oldData?.pages) return oldData;
        const updatedPages = [...oldData.pages];
        if (updatedPages[0]?.data) {
          // ✅ CRITICAL: First, remove any existing message with the same _id to prevent duplicates
          const existingByIdIndex = updatedPages[0].data.findIndex(msg => 
            msg._id && newMessage._id && String(msg._id) === String(newMessage._id)
          );
          
          if (existingByIdIndex >= 0) {
            // ✅ Message already exists - update it instead of adding duplicate
            debugLog('🔄 Message already exists in cache, updating:', {
              messageId: newMessage._id,
              existingIndex: existingByIdIndex,
              oldStatus: updatedPages[0].data[existingByIdIndex].status,
              newStatus: newMessage.status,
            });
            
            const existing = updatedPages[0].data[existingByIdIndex];
            const statusOrder = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };
            const existingOrder = statusOrder[existing.status] || 0;
            const newOrder = statusOrder[newMessage.status] || 0;
            const finalStatus = newOrder > existingOrder ? newMessage.status : existing.status;
            
            updatedPages[0].data[existingByIdIndex] = {
              ...newMessage,
              status: finalStatus,
              isOptimistic: false,
              tempId: existing.tempId || newMessage.metadata?.tempId || newMessage.tempId,
            };
            
            return { ...oldData, pages: updatedPages };
          }
          
          // ✅ CRITICAL: Check if this message matches an optimistic message by tempId or content+time
          // First, try to find by tempId (most reliable)
          let optimisticIndex = updatedPages[0].data.findIndex(msg => {
            if (!msg.isOptimistic) return false;
            
            // Match by tempId (most reliable)
            if (msg.tempId && (newMessage.metadata?.tempId || newMessage.tempId)) {
              return msg.tempId === (newMessage.metadata?.tempId || newMessage.tempId);
            }
            
            // Match by _id (if optimistic message has a real ID)
            if (msg._id && newMessage._id && msg._id === newMessage._id) {
              return true;
            }
            
            return false;
          });
          
          // ✅ If not found by tempId, try matching by content+time+channel (for outbound messages)
          if (optimisticIndex < 0 && newMessage.direction === 'outbound') {
            optimisticIndex = updatedPages[0].data.findIndex(msg => {
              if (!msg.isOptimistic || msg.direction !== 'outbound') return false;
              
              // ✅ For template messages, match by templateName and channel
              if (msg.type === 'template' && newMessage.type === 'template') {
                const templateMatch = msg.templateName === newMessage.templateName || 
                                     msg.metadata?.templateName === newMessage.templateName ||
                                     msg.metadata?.templateName === newMessage.metadata?.templateName;
                const channelMatch = (msg.channel || newMessage.channelType) === (newMessage.channel || newMessage.channelType);
                const timeMatch = Math.abs(new Date(msg.createdAt) - new Date(newMessage.createdAt)) < 15000; // 15 seconds for templates
                
                // For email templates, also match by subject
                if ((msg.channel === 'email' || newMessage.channel === 'email') && msg.emailData?.subject && newMessage.emailData?.subject) {
                  const subjectMatch = msg.emailData.subject === newMessage.emailData.subject;
                  const matches = templateMatch && channelMatch && timeMatch && subjectMatch;
                  if (matches) {
                    debugLog('✅ Template message matched by templateName+channel+subject+time:', {
                      optimisticTempId: msg.tempId,
                      optimisticTemplateName: msg.templateName,
                      realTemplateName: newMessage.templateName,
                      realId: newMessage._id,
                      realContentLength: newMessage.content?.length,
                      realContentPreview: newMessage.content?.substring(0, 50),
                    });
                  }
                  return matches;
                }
                
                const matches = templateMatch && channelMatch && timeMatch;
                if (matches) {
                  debugLog('✅ Template message matched by templateName+channel+time:', {
                    optimisticTempId: msg.tempId,
                    optimisticTemplateName: msg.templateName,
                    realTemplateName: newMessage.templateName,
                    realId: newMessage._id,
                    realContentLength: newMessage.content?.length,
                    realContentPreview: newMessage.content?.substring(0, 50),
                  });
                }
                return matches;
              }
              
              // ✅ For non-template messages, match by content
              const contentMatch = (
                (typeof msg.content === 'string' && typeof newMessage.content === 'string' && msg.content === newMessage.content) ||
                (typeof msg.content === 'object' && typeof newMessage.content === 'object' && 
                 msg.content?.text === newMessage.content?.text)
              );
              
              // Match by channel
              const channelMatch = (msg.channel || newMessage.channelType) === (newMessage.channel || newMessage.channelType);
              
              // Match by time (within 10 seconds - increased for voice messages)
              const timeMatch = Math.abs(new Date(msg.createdAt) - new Date(newMessage.createdAt)) < 10000;
              
              // ✅ For voice messages, match by attachment type, duration, and size
              if (msg.attachments?.length > 0 && newMessage.attachments?.length > 0) {
                const msgAttachment = msg.attachments[0];
                const newAttachment = newMessage.attachments[0];
                
                // Match voice messages by type, duration, and size (URLs will differ)
                if (msgAttachment.type === 'audio' && newAttachment.type === 'audio') {
                  const durationMatch = !msgAttachment.duration || !newAttachment.duration || 
                                       Math.abs((msgAttachment.duration || 0) - (newAttachment.duration || 0)) < 3;
                  const sizeMatch = !msgAttachment.size || !newAttachment.size || 
                                  Math.abs((msgAttachment.size || 0) - (newAttachment.size || 0)) < 5000;
                  
                  if (durationMatch && sizeMatch && timeMatch) {
                    return true;
                  }
                }
                
                // Match other attachments by URL
                if (msgAttachment.url === newAttachment.url && timeMatch) {
                  return true;
                }
              }
              
              // For email, also match by subject
              if ((msg.channel === 'email' || newMessage.channel === 'email') && msg.emailData?.subject && newMessage.emailData?.subject) {
                return contentMatch && channelMatch && timeMatch && (msg.emailData.subject === newMessage.emailData.subject);
              }
              
              return contentMatch && channelMatch && timeMatch;
            });
          }
          
          if (optimisticIndex >= 0) {
            // ✅ Replace optimistic message with real message
            const optimistic = updatedPages[0].data[optimisticIndex];
            debugLog('✅ Replacing optimistic message with real message:', {
              optimisticId: optimistic._id,
              optimisticTempId: optimistic.tempId,
              optimisticContent: optimistic.content?.substring(0, 50),
              optimisticType: optimistic.type,
              optimisticTemplateName: optimistic.templateName,
              realId: newMessage._id,
              realTempId: newMessage.metadata?.tempId || newMessage.tempId,
              realContent: newMessage.content?.substring(0, 50),
              realContentLength: newMessage.content?.length,
              realType: newMessage.type,
              realTemplateName: newMessage.templateName,
              realEmailData: newMessage.emailData,
              status: newMessage.status || optimistic.status
            });
            
            // ✅ CRITICAL: Replace optimistic message with real message
            // Status progression: pending → sent → delivered → read
            // Use the higher status (optimistic might be 'pending', real might be 'sent')
            const statusOrder = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };
            const optimisticOrder = statusOrder[optimistic.status] || 0;
            const realOrder = statusOrder[newMessage.status] || 0;
            const finalStatus = realOrder > optimisticOrder ? newMessage.status : optimistic.status;
            
            // ✅ CRITICAL: Ensure content is properly included (especially for template messages)
            const finalMessage = {
              ...newMessage,
              // ✅ Use the higher status (never go backward)
              status: finalStatus,
              isOptimistic: false, // ✅ Mark as no longer optimistic
              // ✅ Preserve tempId for status update matching
              tempId: optimistic.tempId || newMessage.metadata?.tempId || newMessage.tempId,
              // ✅ CRITICAL: Ensure content is explicitly set (for template messages)
              content: newMessage.content || optimistic.content || '',
              // ✅ Ensure emailData is included
              emailData: newMessage.emailData || optimistic.emailData,
              // ✅ Ensure type is set
              type: newMessage.type || optimistic.type,
              // ✅ Ensure templateName is preserved if it's a template
              ...(newMessage.type === 'template' && {
                templateName: newMessage.templateName || optimistic.templateName,
              }),
            };
            
            debugLog('✅ Final message after replacement:', {
              messageId: finalMessage._id,
              type: finalMessage.type,
              templateName: finalMessage.templateName,
              contentLength: finalMessage.content?.length,
              contentPreview: finalMessage.content?.substring(0, 100),
              hasEmailData: !!finalMessage.emailData,
              emailSubject: finalMessage.emailData?.subject,
            });
            
            // ✅ Remove the optimistic message and add the real one in its place
            updatedPages[0].data.splice(optimisticIndex, 1, finalMessage);
            
            debugLog('✅ Successfully replaced optimistic message with real message:', {
              optimisticId: optimistic._id,
              optimisticStatus: optimistic.status,
              realId: newMessage._id,
              realStatus: newMessage.status,
              finalStatus,
              tempId: optimistic.tempId || newMessage.metadata?.tempId,
              contentReplaced: finalMessage.content?.length > 0
            });
          } else {
            // ✅ CRITICAL: Check if message already exists by _id (prevent duplicates)
            const existingIndex = updatedPages[0].data.findIndex(msg => 
              msg._id && newMessage._id && String(msg._id) === String(newMessage._id)
            );
            
            if (existingIndex >= 0) {
              // ✅ Message already exists - update it instead of adding duplicate
              debugLog('🔄 Message already exists, updating instead of duplicating:', {
                messageId: newMessage._id,
                existingIndex,
                oldStatus: updatedPages[0].data[existingIndex].status,
                newStatus: newMessage.status,
              });
              
              const existing = updatedPages[0].data[existingIndex];
              const statusOrder = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };
              const existingOrder = statusOrder[existing.status] || 0;
              const newOrder = statusOrder[newMessage.status] || 0;
              const finalStatus = newOrder > existingOrder ? newMessage.status : existing.status;
              
              // ✅ Update existing message with new data, preserving optimistic tempId if needed
              updatedPages[0].data[existingIndex] = {
                ...newMessage,
                status: finalStatus,
                isOptimistic: false, // ✅ Always mark as non-optimistic when real message arrives
                tempId: existing.tempId || newMessage.metadata?.tempId || newMessage.tempId,
              };
              
              return { ...oldData, pages: updatedPages };
            }
            
            // ✅ CRITICAL: For outbound messages, ALWAYS try to find and replace optimistic message first
            // This prevents duplicates when real message arrives before optimistic one is properly matched
            if (newMessage.direction === 'outbound') {
              // ✅ Try aggressive matching for template messages
              if (newMessage.type === 'template') {
                const fallbackOptimisticIndex = updatedPages[0].data.findIndex(msg => {
                  if (!msg.isOptimistic || msg.direction !== 'outbound') return false;
                  
                  // ✅ Match by templateName + channel + recent time (within 30 seconds)
                  const templateMatch = msg.templateName === newMessage.templateName || 
                                       msg.metadata?.templateName === newMessage.templateName ||
                                       msg.metadata?.templateName === newMessage.metadata?.templateName;
                  
                  const channelMatch = (msg.channel || newMessage.channelType) === (newMessage.channel || newMessage.channelType);
                  
                  // ✅ Extended time window for template messages (30 seconds)
                  const timeMatch = Math.abs(new Date(msg.createdAt) - new Date(newMessage.createdAt)) < 30000;
                  
                  // ✅ For email templates, also match by subject
                  if ((msg.channel === 'email' || newMessage.channel === 'email') && msg.emailData?.subject && newMessage.emailData?.subject) {
                    return templateMatch && channelMatch && timeMatch && (msg.emailData.subject === newMessage.emailData.subject);
                  }
                  
                  return templateMatch && channelMatch && timeMatch;
                });
                
                if (fallbackOptimisticIndex >= 0) {
                  const optimistic = updatedPages[0].data[fallbackOptimisticIndex];
                  debugLog('✅ Replacing optimistic template message (aggressive matching):', {
                    optimisticTempId: optimistic.tempId,
                    optimisticTemplateName: optimistic.templateName,
                    optimisticStatus: optimistic.status,
                    realId: newMessage._id,
                    realTemplateName: newMessage.templateName,
                    realStatus: newMessage.status,
                    realContentLength: newMessage.content?.length,
                  });
                  
                  const statusOrder = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };
                  const optimisticOrder = statusOrder[optimistic.status] || 0;
                  const realOrder = statusOrder[newMessage.status] || 0;
                  const finalStatus = realOrder > optimisticOrder ? newMessage.status : optimistic.status;
                  
                  const finalMessage = {
                    ...newMessage,
                    status: finalStatus,
                    isOptimistic: false, // ✅ Mark as real message
                    tempId: optimistic.tempId || newMessage.metadata?.tempId || newMessage.tempId,
                    // ✅ CRITICAL: Ensure content is explicitly set
                    content: newMessage.content || optimistic.content || '',
                    emailData: newMessage.emailData || optimistic.emailData,
                    type: newMessage.type || optimistic.type,
                    templateName: newMessage.templateName || optimistic.templateName,
                  };
                  
                  updatedPages[0].data.splice(fallbackOptimisticIndex, 1, finalMessage);
                  debugLog('✅ Successfully replaced optimistic template message:', {
                    contentLength: finalMessage.content?.length,
                    contentPreview: finalMessage.content?.substring(0, 100),
                    finalStatus,
                  });
                  return { ...oldData, pages: updatedPages };
                }
              }
              
              // ✅ For non-template outbound messages, try to match any optimistic message by content+time+channel
              const fallbackOptimisticIndex = updatedPages[0].data.findIndex(msg => {
                if (!msg.isOptimistic || msg.direction !== 'outbound') return false;
                
                // ✅ Match by content similarity
                const contentMatch = (
                  (typeof msg.content === 'string' && typeof newMessage.content === 'string' && msg.content === newMessage.content) ||
                  (typeof msg.content === 'object' && typeof newMessage.content === 'object' && 
                   msg.content?.text === newMessage.content?.text)
                );
                
                const channelMatch = (msg.channel || newMessage.channelType) === (newMessage.channel || newMessage.channelType);
                const timeMatch = Math.abs(new Date(msg.createdAt) - new Date(newMessage.createdAt)) < 15000; // 15 seconds
                
                return contentMatch && channelMatch && timeMatch;
              });
              
              if (fallbackOptimisticIndex >= 0) {
                const optimistic = updatedPages[0].data[fallbackOptimisticIndex];
                debugLog('✅ Replacing optimistic message (content+time+channel match):', {
                  optimisticTempId: optimistic.tempId,
                  optimisticStatus: optimistic.status,
                  realId: newMessage._id,
                  realStatus: newMessage.status,
                });
                
                const statusOrder = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };
                const optimisticOrder = statusOrder[optimistic.status] || 0;
                const realOrder = statusOrder[newMessage.status] || 0;
                const finalStatus = realOrder > optimisticOrder ? newMessage.status : optimistic.status;
                
                updatedPages[0].data[fallbackOptimisticIndex] = {
                  ...newMessage,
                  status: finalStatus,
                  isOptimistic: false,
                  tempId: optimistic.tempId || newMessage.metadata?.tempId || newMessage.tempId,
                };
                
                return { ...oldData, pages: updatedPages };
              }
            }
            
            // ✅ Only add as new message if no optimistic message was found to replace
            debugLog('➕ Adding new message (no optimistic match found):', {
              messageId: newMessage._id,
              tempId: newMessage.metadata?.tempId || newMessage.tempId,
              direction: newMessage.direction,
              type: newMessage.type,
              templateName: newMessage.templateName,
              contentLength: newMessage.content?.length,
            });
            
            updatedPages[0] = {
              ...updatedPages[0],
              data: [newMessage, ...updatedPages[0].data]
            };
          }
        } else {
          // ✅ No existing pages, create new page with message
          updatedPages[0] = {
            data: [newMessage],
            pagination: { page: 1, limit: 50, hasMore: false }
          };
        }
        return { ...oldData, pages: updatedPages };
      });

      // Outbound messages (own replies, bot responses) → always scroll to bottom
      if (newMessage.direction === 'outbound') {
        setNewMessageCount(0);
        setShouldScrollToBottom(true);
        // Force scroll after DOM update
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollContainerRef.current?.scrollTo({
              top: scrollContainerRef.current.scrollHeight,
              behavior: 'smooth'
            });
          });
        });
      } else if (!shouldScrollToBottom) {
        // Inbound messages while scrolled up → increment counter
        setNewMessageCount(prev => prev + 1);
      } else {
        setShouldScrollToBottom(true);
      }
    }
    
    // ✅ Play notification sound for manual mode conversations (inbound messages only)
    if (newMessage.direction === 'inbound' && newMessage.type !== 'reaction') {
      // Get conversation mode from message payload, conversation prop, or cache
      const conversationMode = 
        newMessage.conversationMode || 
        conversation?.mode || 
        data.conversation?.mode;
      
      const isManualMode = conversationMode === 'manual';
      
      debugLog('🔔 MessageList notification check:', {
        direction: newMessage.direction,
        type: newMessage.type,
        conversationMode,
        isManualMode,
        currentConvId: conversationId,
        messageConvId
      });
      
      // ✅ Get AI bot settings to determine if we should play notification
      const companySettings = queryClient.getQueryData(['company-settings']);
      const isAIBotEnabled = companySettings?.features?.aiBot?.enabled === true;
      
      // ✅ Play notification sound:
      // - If AI bot is disabled: play for all modes (both auto and manual)
      // - If AI bot is enabled: only play for manual mode conversations
      const shouldPlayNotification = !isAIBotEnabled || isManualMode;
      
      if (shouldPlayNotification) {
        const soundService = getNotificationSoundService();
        if (soundService) {
          // Play notification bell for incoming messages (not from current conversation)
          // Pass isAIBotEnabled to skip notifications for auto mode when AI bot is enabled
          soundService.playNotificationSound(
            isManualMode,
            true, // isInbound
            conversationId, // current conversation ID
            messageConvId, // message conversation ID
            isAIBotEnabled // pass AI bot enabled status
          );
        } else {
          debugWarn('❌ NotificationSoundService not available');
        }
      }
    }
  }, [conversationId, conversation, queryClient, shouldScrollToBottom]));

  // Socket: Message status
  useSocketEvent('message:status', useCallback((data) => {
    debugLog('📡 message:status event received:', {
      data,
      conversationId,
      currentConversationId: conversation?._id,
      messageId: data?.messageId,
      status: data?.status
    });
    
    if (!data || !data.messageId) {
      debugWarn('⚠️ Invalid message:status event data:', data);
      return;
    }
    
    const messageConvId = String(data.conversationId || conversationId);
    const currentConvId = String(conversationId);
    
    // ✅ CRITICAL: First check if messageId matches any message in current conversation
    // This allows us to accept events from tenant room even if conversationId doesn't match
    let messageFoundInConversation = false;
    
    queryClient.setQueryData(['messages-infinite', conversationId, conversation?.channel ?? 'unknown'], (oldData) => {
      if (!oldData?.pages) return oldData;
      
      // ✅ Check if message exists in this conversation
      const dataMsgIdStr = String(data.messageId || '');
      for (const page of oldData.pages) {
        if (page.data) {
          for (const msg of page.data) {
            const msgIdStr = String(msg._id || '');
            if (msgIdStr === dataMsgIdStr) {
              messageFoundInConversation = true;
              break;
            }
          }
        }
        if (messageFoundInConversation) break;
      }
      
      // ✅ If message not found, check if conversationId matches
      if (!messageFoundInConversation) {
        const isFromMergedConversation = conversation?.isMerged && 
          conversation?.mergedConversations?.some(mc => String(mc.conversationId) === messageConvId);
        const isDirectMatch = messageConvId === currentConvId;
        
        if (!isDirectMatch && !isFromMergedConversation) {
          // Message not in this conversation, don't update
          return oldData;
        }
      }
      
      return {
        ...oldData,
        pages: oldData.pages.map(page => ({
          ...page,
          data: page.data?.map(msg => {
            // ✅ CRITICAL: Match by messageId OR tempId (for optimistic messages)
            // This ensures status updates apply to the same message (optimistic or real)
            // ✅ Convert both to strings for reliable comparison (handles ObjectId vs string)
            const msgIdStr = String(msg._id || '');
            const dataMsgIdStr = String(data.messageId || '');
            const matchesById = msgIdStr === dataMsgIdStr && msgIdStr !== '';
            
            // ✅ Match by tempId (for optimistic messages that haven't been replaced yet)
            const matchesByTempId = msg.tempId && (
              (data.metadata?.tempId && String(msg.tempId) === String(data.metadata.tempId)) ||
              (data.tempId && String(msg.tempId) === String(data.tempId)) ||
              (data.messageId && String(msg.tempId) === String(data.messageId))
            );
            
            // ✅ For template messages, also try to match by templateName + channel + recent time
            // This helps when tempId matching fails
            let matchesByTemplate = false;
            if (!matchesById && !matchesByTempId && msg.type === 'template' && msg.direction === 'outbound') {
              const templateMatch = msg.templateName === data.templateName || 
                                   msg.metadata?.templateName === data.templateName ||
                                   (data.metadata?.templateName && msg.templateName === data.metadata.templateName);
              const channelMatch = (msg.channel || data.channel) === (data.channel || msg.channel);
              const timeMatch = Math.abs(new Date(msg.createdAt) - new Date()) < 60000; // Within 1 minute
              
              matchesByTemplate = templateMatch && channelMatch && timeMatch;
            }
            
            if (matchesById || matchesByTempId || matchesByTemplate) {
                // ✅ CRITICAL: Status progression should only move forward: pending → sent → delivered → read
                // Never allow status to go backward (prevents delivered → sent issues)
                const statusOrder = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };
                const currentOrder = statusOrder[msg.status] || 0;
                const newOrder = statusOrder[data.status] || 0;
                
                // ✅ Bug 3 fix: Only allow status to go forward, EXCEPT transitions TO failed
                // Once failed, only another 'failed' or explicit resend (which creates new message) can change it
                // Prevents stale socket events from reverting failed → pending/sent
                if (msg.status === 'failed' && data.status !== 'failed') {
                  debugLog(`⚠️ Skipping status update (failed messages can only be resent): ${msg.status} → ${data.status}`, {
                    messageId: msg._id,
                    tempId: msg.tempId
                  });
                  return msg; // Keep failed status
                }
                if (newOrder <= currentOrder && data.status !== 'failed') {
                  debugLog(`⚠️ Skipping status update (would go backward): ${msg.status} → ${data.status}`, {
                    messageId: msg._id,
                    tempId: msg.tempId
                  });
                  return msg; // Keep current status
                }
                
                debugLog('✅ Updating message status:', {
                  messageId: msg._id,
                  tempId: msg.tempId,
                  oldStatus: msg.status,
                  newStatus: data.status,
                  wasOptimistic: msg.isOptimistic
                });
                
                return {
                  ...msg,
                  status: data.status,
                  // Include error details for failed messages
                  ...(data.status === 'failed' && data.error && { errorMessage: data.error }),
                  // Remove optimistic flag once status is updated (unless still pending)
                  isOptimistic: data.status === 'pending' ? msg.isOptimistic : false
                };
              }
              return msg;
            }) || []
          }))
        };
      });
    
    // ✅ If we found the message and updated it, log the update
    if (messageFoundInConversation || messageConvId === currentConvId) {
      debugLog('✅ Updating message status via socket:', {
        messageId: data.messageId,
        status: data.status,
        conversationId: data.conversationId,
        currentConvId,
        messageFoundInConversation
      });
    }
  }, [conversationId, conversation?.isMerged, conversation?.channel, queryClient]));

  // ✅ Socket: Conversation merged - CRITICAL: Refetch messages immediately when conversation is merged
  useSocketEvent('conversation:merged', useCallback((data) => {
    const { primaryConversationId, mergedConversationIds, updatedPrimaryConversation } = data;
    
    // ✅ Check if this conversation is involved in the merge
    const isPrimary = String(primaryConversationId) === String(conversationId);
    const isMerged = mergedConversationIds && mergedConversationIds.some(id => String(id) === String(conversationId));
    
    if (isPrimary || isMerged) {
      debugLog('🔄 Conversation merged event received - updating conversation cache and refetching messages:', {
        conversationId,
        isPrimary,
        isMerged,
        primaryConversationId,
        mergedConversationIds,
        hasUpdatedConversation: !!updatedPrimaryConversation
      });
      
      // ✅ CRITICAL: First update the conversation cache with isMerged: true and complete mergedConversations array
      // This ensures the conversation prop has the correct merge status before refetching messages
      queryClient.setQueryData(['conversation', conversationId], (old) => {
        if (!old?.data) {
          // If no cached data, try to use updatedPrimaryConversation from socket event
          if (updatedPrimaryConversation && String(updatedPrimaryConversation._id || updatedPrimaryConversation.id) === String(conversationId)) {
            return { 
              success: true, 
              data: { 
                ...updatedPrimaryConversation, 
                isMerged: true,
                // ✅ Ensure mergedConversations array is properly structured
                mergedConversations: updatedPrimaryConversation.mergedConversations || mergedConversationIds?.map(id => ({
                  conversationId: id,
                  channel: 'unknown',
                  channelAccount: null
                })) || []
              } 
            };
          }
          return old;
        }
        
        const updated = { ...old.data };
        
        // ✅ If this is the primary conversation, update with merge status and complete mergedConversations array
        if (isPrimary) {
          updated.isMerged = true;
          
          // ✅ Use updatedPrimaryConversation mergedConversations if available (most accurate)
          if (updatedPrimaryConversation?.mergedConversations && updatedPrimaryConversation.mergedConversations.length > 0) {
            // ✅ Use the mergedConversations from updatedPrimaryConversation (includes channel info)
            updated.mergedConversations = updatedPrimaryConversation.mergedConversations.map(mc => ({
              conversationId: String(mc.conversationId || mc._id),
              channel: mc.channel || 'unknown',
              channelAccount: mc.channelAccount || null
            }));
          } else {
            // ✅ Fallback: construct mergedConversations from mergedConversationIds
            const cachedConvs = queryClient.getQueryData(['conversations'])?.data || [];
            updated.mergedConversations = mergedConversationIds?.map(id => {
              const originalConv = cachedConvs.find(c => String(c._id) === String(id));
              return {
                conversationId: String(id),
                channel: originalConv?.channel || 'unknown',
                channelAccount: originalConv?.channelAccount || null
              };
            }) || updated.mergedConversations || [];
          }
          
          // ✅ Use updatedPrimaryConversation data if available (overwrite with complete data)
          if (updatedPrimaryConversation) {
            Object.assign(updated, {
              ...updatedPrimaryConversation,
              isMerged: true,
              mergedConversations: updated.mergedConversations // ✅ Use our constructed mergedConversations array
            });
          }
        } else if (isMerged) {
          // This is a merged (secondary) conversation
          updated.primaryConversation = primaryConversationId;
          updated.status = 'active';
          updated.isMerged = true;
        }
        
        return { ...old, data: updated };
      });
      
      // ✅ CRITICAL: Remove old message cache entries (with isMerged: false)
      // The query key includes isMerged, so old entries won't match new query key
      queryClient.removeQueries({ 
        queryKey: ['messages-infinite', conversationId],
        exact: false
      });
      
      // ✅ CRITICAL: Invalidate old query and force refetch with new query key
      // First invalidate queries with old isMerged value
      queryClient.invalidateQueries({ 
        queryKey: ['messages-infinite', conversationId, false],
        exact: false
      });
      
      // ✅ CRITICAL: Force IMMEDIATE refetch with new query key (isMerged: true) - NO DELAY
      // Get updated conversation from cache immediately (we just updated it above)
      const updatedConversation = queryClient.getQueryData(['conversation', conversationId])?.data;
      
      if (updatedConversation?.isMerged && updatedConversation.mergedConversations?.length > 0) {
        debugLog('✅ Conversation cache updated with isMerged: true, refetching messages IMMEDIATELY from all merged conversations:', {
          conversationId,
          mergedConversationsCount: updatedConversation.mergedConversations.length,
          mergedIds: updatedConversation.mergedConversations.map(m => m.conversationId)
        });
        
        // ✅ IMMEDIATE refetch with explicit query key including isMerged: true - NO DELAY
        // This ensures messages from ALL merged conversations are fetched instantly
        queryClient.refetchQueries({ 
          queryKey: ['messages-infinite', conversationId, true, updatedConversation?.channel ?? 'unknown'],
          exact: false,
          type: 'active'
        }).then(() => {
          debugLog('✅ Messages refetched successfully after merge - all merged conversations loaded');
          setShouldScrollToBottom(true);
        }).catch(error => {
          console.error('❌ Error refetching messages after merge:', error);
          
          // ✅ Immediate fallback: try refetch() method
          refetch().then(() => {
            debugLog('✅ Messages refetched successfully after merge (fallback)');
            setShouldScrollToBottom(true);
          }).catch(err => {
            console.error('❌ Error with refetch() fallback:', err);
          });
        });
      } else {
        debugWarn('⚠️ Conversation cache not fully updated yet, using refetch() immediately:', {
          isMerged: updatedConversation?.isMerged,
          mergedConversationsCount: updatedConversation?.mergedConversations?.length || 0
        });
        
        // ✅ Immediate fallback: use refetch() method (conversation prop should update automatically)
        refetch().then(() => {
          debugLog('✅ Messages refetched successfully after merge (immediate fallback)');
          setShouldScrollToBottom(true);
        }).catch(error => {
          console.error('❌ Error refetching messages after merge (immediate fallback):', error);
        });
      }
    }
  }, [conversationId, queryClient, refetch]));

  // Socket: Typing indicators
  useSocketEvent('typing', useCallback((data) => {
    const { conversationId: eventConvId, userId, userName, isTyping } = data || {};
    if (String(eventConvId) !== String(conversationId)) return;
    // Don't show typing for current user
    if (userId === currentUser?.id || userId === currentUser?._id) return;

    setTypingUsers(prev => {
      if (isTyping) {
        if (prev.some(u => u.userId === userId)) return prev;
        return [...prev, { userId, userName: userName || 'Someone' }];
      }
      return prev.filter(u => u.userId !== userId);
    });
  }, [conversationId, currentUser]));

  // Clear individual typing indicators after timeout (safety net)
  const typingTimersRef = useRef({});
  useEffect(() => {
    // Set per-user timers for new typing users
    typingUsers.forEach(u => {
      if (!typingTimersRef.current[u.userId]) {
        typingTimersRef.current[u.userId] = setTimeout(() => {
          setTypingUsers(prev => prev.filter(p => p.userId !== u.userId));
          delete typingTimersRef.current[u.userId];
        }, 8000);
      }
    });
    // Clean up timers for users no longer typing
    Object.keys(typingTimersRef.current).forEach(uid => {
      if (!typingUsers.some(u => u.userId === uid)) {
        clearTimeout(typingTimersRef.current[uid]);
        delete typingTimersRef.current[uid];
      }
    });
    return () => {
      Object.values(typingTimersRef.current).forEach(clearTimeout);
      typingTimersRef.current = {};
    };
  }, [typingUsers]);

  // Socket: Reactions — force refetch messages to update reactions in real-time
  // Previous approach (updating cache manually) didn't trigger re-renders reliably.
  // Refetching is simple, correct, and guaranteed to work.
  useSocketEvent('message:reaction', useCallback((data) => {
    const { conversationId: eventConvId, messageId, reaction, userId, userName, contactName } = data || {};

    if (String(eventConvId) !== String(conversationId)) return;

    const msgIdStr = String(messageId);
    const displayName = userName || contactName || 'User';
    const userIdStr = userId ? String(userId) : null;

    // Update messageReactions state for immediate inline display
    setMessageReactions(prev => {
      const current = (prev[msgIdStr] || []).filter(r => r.userId !== 'me-optimistic');
      if (!reaction) {
        return { ...prev, [msgIdStr]: current.filter(r => String(r.userId) !== userIdStr) };
      }
      const filtered = current.filter(r => String(r.userId) !== userIdStr);
      return { ...prev, [msgIdStr]: [...filtered, { userId: userIdStr, reaction, userName: displayName }] };
    });

    // Force refetch messages to get the latest reactions from the server
    // This guarantees the UI updates with correct data
    refetch();
  }, [conversationId, refetch]));

  // Socket: Translation updates — real-time translation display for agents
  useSocketEvent('message:translation', useCallback((data) => {
    const { messageId, detectedLanguage, translatedContent } = data || {};
    if (!messageId) return;
    // Force refetch to pick up the new metadata
    refetch();
  }, [refetch]));

  // ✅ Send Reaction with Optimistic Update
  const reactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }) => {
      const response = await apiClient.post(`/messages/${conversationId}/${messageId}/react`, { emoji });
      return response.data;
    },
    onMutate: async ({ messageId, emoji }) => {
      // ✅ INSTANT optimistic update with duplicate prevention
      const userId = 'me-optimistic'; // Unique ID for optimistic update
      
      setMessageReactions(prev => {
        const current = prev[messageId] || [];
        
        if (!emoji) {
          return { ...prev, [messageId]: current.filter(r => r.userId !== userId) };
        }
        
        // Check if already exists (prevent double-add)
        const alreadyExists = current.some(r => r.userId === userId);
        if (alreadyExists) {
          return prev; // Don't add duplicate
        }
        
        return { 
          ...prev, 
          [messageId]: [...current, { userId, reaction: emoji, userName: currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.email || 'Me' : 'Me' }] 
        };
      });
      
      // Store optimistic ID
      setUserIdMap(prev => {
        const updated = { ...prev };
        if (!updated[messageId]) updated[messageId] = {};
        updated[messageId][userId] = true;
        return updated;
      });
    },
    onSuccess: () => {
      // Keep optimistic entry until socket echo arrives to avoid any UI gap.
      // Nothing to do here.
    },
    onError: (error, variables) => {
      console.error('Reaction error:', error);
      toast.error(error.response?.data?.error || 'Failed to send reaction');
      // Rollback optimistic update
      setMessageReactions(prev => {
        const current = prev[variables.messageId] || [];
        return {
          ...prev,
          [variables.messageId]: current.filter(r => r.userId !== 'me-optimistic')
        };
      });
      
      setUserIdMap(prev => {
        const updated = { ...prev };
        if (updated[variables.messageId]) {
          delete updated[variables.messageId]['me-optimistic'];
        }
        return updated;
      });
    }
  });

  const handleReaction = useCallback((messageId, emoji) => {
    reactionMutation.mutate({ messageId, emoji });
    // Close any open reaction picker immediately for snappy UX
    setOpenPickerFor(null);
  }, [reactionMutation]);



  // Bug 8 fix: Check clipboard availability and await the write before showing toast
  const handleCopy = useCallback(async (content) => {
    if (!navigator.clipboard) {
      toast.error('Clipboard not available (requires HTTPS)');
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }, []);

  // Scroll to bottom handler
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
    setShouldScrollToBottom(true);
    setNewMessageCount(0);
  }, []);

  // Touch: long-press handlers for mobile action menu
  const handleTouchStart = useCallback((messageId) => {
    longPressTimerRef.current = setTimeout(() => {
      setActiveActionMessageId(messageId);
    }, 500); // 500ms long-press
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Dismiss active action menu on outside tap
  const handleContainerClick = useCallback((e) => {
    if (activeActionMessageId && !e.target.closest('[data-action-menu]')) {
      setActiveActionMessageId(null);
    }
  }, [activeActionMessageId]);

  const handleDownload = useCallback(async (attachment) => {
    try {
      const response = await fetch(attachment.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.name || 'download';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Download started');
    } catch (error) {
      toast.error('Failed to download');
    }
  }, []);


  // ✅ Check if we have cached messages to show immediately
  // Bug 1 fix: Moved BEFORE usage to avoid temporal dead zone ReferenceError
  const hasCachedMessages = data?.pages?.length > 0 && allMessages.length > 0;

  // ✅ CRITICAL: Always show cached messages if available, even if there's an error
  // Only show error if there's NO cached data AND there's an actual error
  // This ensures merged conversations always show their messages, even during refetch
  const shouldShowError = messagesError && !hasCachedMessages && !isLoading;

  if (shouldShowError) {
    return (
      <div className="flex items-center justify-center h-full w-full" style={{ width: '100%', maxWidth: 'none', padding: '0 clamp(0.5rem, 1.5vw, 1.5rem)' }}>
        <div className="text-center w-full max-w-2xl">
          <div className="mb-4">
            <svg className="w-16 h-16 text-red-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">Failed to load messages</p>
          <p className="text-muted-foreground text-sm mb-4">
            {messagesError?.message || 'Messages could not be loaded. Please try again.'}
          </p>
          <Button onClick={() => refetch()} variant="default" size="sm">
            Retry
          </Button>
        </div>
      </div>
    );
  }
  
  // ✅ Clean loading state - only show if no cached messages and actually loading
  // This prevents showing loading spinner when we have cached data
  if (isLoading && !hasCachedMessages && allMessages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full" style={{ width: '100%', maxWidth: 'none', padding: '0 clamp(0.5rem, 1.5vw, 1.5rem)' }}>
        <div className="text-center w-full max-w-2xl">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Loading messages...</p>
        </div>
      </div>
    );
  }

  // ✅ Only show "No messages" if we're not loading and have no messages
  // During merge/unmerge, we might be loading, so don't show "No messages" prematurely
  if (!allMessages.length && !isLoading && !hasCachedMessages) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 w-full" style={{ width: '100%', maxWidth: 'none', padding: '0 clamp(1rem, 2vw, 2rem)' }}>
        <div className="text-center w-full max-w-2xl">
          <p className="text-lg mb-2">No messages yet</p>
          <p className="text-sm">Start the conversation!</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onClick={handleContainerClick}
        className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-1 scroll-smooth bg-background w-full h-full scrollbar-thin relative"
        style={{
          overflowX: 'hidden',
          maxWidth: '100%',
          paddingLeft: 'clamp(0.5rem, 1.5vw, 1.5rem)',
          paddingRight: 'clamp(0.5rem, 1.5vw, 1.5rem)',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* Loading More Messages Indicator - Enhanced to match webchat */}
        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400 mr-2" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Loading previous messages...</span>
          </div>
        )}

        {groupedItems.map((item, index) => {
          if (item.type === 'date-separator') {
            return (
              <div key={`date-${index}`} className="flex justify-center my-3">
                <div className="bg-muted text-muted-foreground text-[11px] px-3 py-1 rounded-full shadow-sm font-medium">
                  {item.label}
                </div>
              </div>
            );
          }

          const message = item.data;
          
          // ✅ Check if this is a call log
          if (message.type === 'callLog' || message.cdrId) {
            // Determine if call is incoming or outgoing
            const isIncoming = message.direction === 'incoming' || 
                              message.direction === 'inbound' || 
                              message.cdrData?.direction === 'in' || 
                              message.cdrData?.direction === 'IN';
            const isOutgoing = !isIncoming;
            
            return (
              <div
                key={message._id}
                className={cn(
                  "relative group flex w-full mb-4",
                  isOutgoing ? "justify-end" : "justify-start"
                )}
              >
                <CallLog
                  message={message}
                  isOpen={openCallLogId === message._id}
                  onOpen={() => setOpenCallLogId(message._id)}
                  onClose={() => setOpenCallLogId(null)}
                  conversationId={conversationId}
                />
              </div>
            );
          }
          
          const isOutbound = message.direction === 'outbound';
          // ✅ Only check message.channel (not conversation.channel) - in merged conversations, conversation.channel is the primary channel
          const isEmail = message.channel === 'email';
          // Merge reactions: prefer socket-updated reactions, fall back to API-loaded reactions
          const socketReactions = messageReactions[String(message._id)];
          const apiReactions = (message.reactions || []).map(r => ({
            userId: r.user?._id?.toString() || r.user?.toString() || r.contact?._id?.toString() || r.contact?.toString(),
            reaction: r.emoji,
            userName: r.userName || (typeof r.user === 'object' && r.user?.firstName ? `${r.user.firstName} ${r.user.lastName || ''}`.trim() : null) || r.contactName || (typeof r.contact === 'object' ? (r.contact?.name || r.contact?.displayName) : null) || 'User',
          }));
          const reactions = socketReactions && socketReactions.length > 0 ? socketReactions : apiReactions;
          const hasReactions = reactions.length > 0;

          // Group reactions by emoji
          const groupedReactions = reactions.reduce((acc, r) => {
            if (!acc[r.reaction]) acc[r.reaction] = [];
            acc[r.reaction].push(r);
            return acc;
          }, {});

          // ✅ For merged conversations, use simple WhatsApp-style bubbles for ALL messages (including email)
          // ✅ For non-merged email conversations, use EmailMessageBubble
          const isMergedEmail = isEmail && conversation?.isMerged;
          
          // ✅ Only use EmailMessageBubble for non-merged email conversations
          if (isEmail && !isMergedEmail && conversation?.channel === 'email') {
            return (
              <EmailMessageBubble
                key={message._id}
                message={message}
                isOwn={isOutbound}
                conversation={conversation}
              />
            );
          }

          // ✅ WhatsApp-style rendering for non-email messages
          return (
            <div
              key={message._id}
              data-message-id={message._id}
              className={cn(
                'flex items-end gap-2 w-full mb-1.5',
                isOutbound ? 'justify-end' : 'justify-start',
                // Show actions on hover (desktop) or when active via long-press (mobile)
                activeActionMessageId === message._id ? '' : 'group'
              )}
              onTouchStart={() => handleTouchStart(message._id)}
              onTouchEnd={handleTouchEnd}
              onTouchMove={handleTouchMove}
            >
              <div className={cn(
                'flex flex-col gap-0.5 relative',
                isOutbound ? 'items-end' : 'items-start',
                'max-w-[85%] sm:max-w-[75%] md:max-w-[70%] lg:max-w-[65%] xl:max-w-[60%] 2xl:max-w-[55%]'
              )}>
                {/* Channel Badge for Merged Conversations */}
                {conversation?.isMerged && message.channel && (
                  <div className={cn(
                    'flex items-center gap-1.5 mb-1',
                    isOutbound ? 'justify-end' : 'justify-start'
                  )}>
                    <div className="flex items-center justify-center rounded-full p-0.5 bg-card shadow-sm border border-border">
                      <ChannelIcon type={message.channel} className="h-4 w-4" />
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      #{message.channel}
                    </span>
                  </div>
                )}

                {/* Message Bubble - WhatsApp Style */}
                <div
                  className={cn(
                    'rounded-2xl px-4 py-2.5 shadow-sm transition-all relative overflow-visible',
                    isOutbound
                      ? 'bg-primary/15 dark:bg-primary/20 text-foreground rounded-br-sm'
                      : 'bg-white dark:bg-muted text-foreground rounded-bl-sm'
                  )}
                  style={{
                    width: 'fit-content',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    wordBreak: 'normal',
                  }}
                >
                  {/* Forwarded message label — WhatsApp style */}
                  {message.forwardedFrom && (
                    <div className="flex items-center gap-1 mb-1 text-[11px] text-[#667781] dark:text-[#8696a0] italic">
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 2l5 5-5 5V8.5C4.5 8.5 2 10 1 14c0-5.5 3-8.5 8.5-8.5V2z"/></svg>
                      <span>Forwarded</span>
                    </div>
                  )}

                  {/* Reply Preview - Inside bubble, with media thumbnail */}
                  {(message.metadata?.context || message.replyTo) && (
                    <div
                      className={cn(
                        'mb-1.5 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity max-w-[280px] sm:max-w-[320px]',
                        isOutbound
                          ? 'bg-black/5 dark:bg-white/10'
                          : 'bg-black/5 dark:bg-white/8'
                      )}
                      style={{ width: '100%' }}
                      onClick={() => {
                        const replyId = message.replyTo?._id;
                        if (replyId) {
                          const el = document.querySelector(`[data-message-id="${replyId}"]`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.classList.add('bg-yellow-100/50', 'dark:bg-yellow-900/20');
                            setTimeout(() => el.classList.remove('bg-yellow-100/50', 'dark:bg-yellow-900/20'), 2000);
                          }
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          const replyId = message.replyTo?._id;
                          if (replyId) {
                            const el = document.querySelector(`[data-message-id="${replyId}"]`);
                            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }
                      }}
                    >
                      <div className={cn(
                        'border-l-4 px-2.5 py-1.5 flex items-start gap-2',
                        isOutbound ? 'border-primary/60' : 'border-emerald-500/60'
                      )}>
                        <div className="flex-1 min-w-0">
                          {/* Sender name */}
                          {message.replyTo?.senderName && (
                            <p className={cn(
                              'text-[11px] font-semibold mb-0.5 truncate',
                              isOutbound ? 'text-primary' : 'text-emerald-600 dark:text-emerald-400'
                            )}>
                              {message.replyTo.senderName}
                            </p>
                          )}
                          {/* Message content with type indicator */}
                          <p className="text-xs truncate text-foreground/70">
                            {(() => {
                              const replyType = message.replyTo?.type;
                              const replyContent = message.replyTo?.content;
                              const hasAttachments = message.replyTo?.attachments?.length > 0;
                              if (!replyContent && !hasAttachments) return '[Message]';
                              // Show type icon + text for media replies
                              if (replyType === 'image' || (hasAttachments && message.replyTo?.attachments?.[0]?.type === 'image')) {
                                return typeof replyContent === 'string' && replyContent && !replyContent.startsWith('[') ? `📷 ${replyContent}` : '📷 Photo';
                              }
                              if (replyType === 'video' || (hasAttachments && message.replyTo?.attachments?.[0]?.type === 'video')) {
                                return typeof replyContent === 'string' && replyContent && !replyContent.startsWith('[') ? `🎥 ${replyContent}` : '🎥 Video';
                              }
                              if (replyType === 'audio') return '🎤 Voice message';
                              if (replyType === 'document' || (hasAttachments && message.replyTo?.attachments?.[0]?.type === 'document')) return '📄 Document';
                              if (replyType === 'sticker') return '🏷️ Sticker';
                              if (replyType === 'location') return '📍 Location';
                              if (replyType === 'contact' || replyType === 'contacts') return '👤 Contact';
                              if (typeof replyContent === 'string') return replyContent;
                              if (typeof replyContent === 'object') return replyContent.text || replyContent.type || '[Media]';
                              return '[Message]';
                            })()}
                          </p>
                        </div>
                        {/* Media thumbnail for image/video/sticker replies */}
                        {(() => {
                          const replyType = message.replyTo?.type;
                          const att = message.replyTo?.attachments?.[0];
                          const isMediaReply = replyType === 'image' || replyType === 'video' || replyType === 'sticker' ||
                            att?.type === 'image' || att?.type === 'video' || att?.type === 'sticker';
                          if (!isMediaReply || !att?.url) return null;
                          return (
                            <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-[#e4e6e8] dark:bg-[#2a3942]">
                              {(replyType === 'video' || att?.type === 'video') ? (
                                <div className="relative w-full h-full">
                                  <video src={att.url} className="w-full h-full object-cover" preload="metadata" muted />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                    <svg className="h-4 w-4 text-white" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                  </div>
                                </div>
                              ) : (
                                <img src={att.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Email Subject for Merged Conversations - Display inside bubble */}
                  {isMergedEmail && message.emailData?.subject && (
                    <div className="mb-2 pb-2 border-b border-border">
                      <div className="flex items-center gap-1.5 mb-1">
                        <ChannelIcon type="email" className="h-3 w-3" />
                        <span className="text-xs font-semibold text-foreground/80">
                          {message.emailData.subject}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400">
                        {isOutbound ? `To: ${message.emailData.to?.join(', ') || 'Unknown'}` : `From: ${message.emailData.from || 'Unknown'}`}
                      </div>
                    </div>
                  )}

                  {/* ✅ WhatsApp Template Message - Show only template name */}
                  {message.channel === 'whatsapp' && (message.type === 'template' || message.metadata?.originalContent?.type === 'template') && (
                    <div className="text-sm leading-relaxed font-medium">
                      {message.templateName || message.metadata?.originalContent?.templateName || message.metadata?.templateName || 'Template'}
                    </div>
                  )}

                  {/* ✅ Render content - handle both string and object formats (skip for WhatsApp templates and audio messages) */}
                  {(() => {
                    // ✅ Check if this is an audio message (for WhatsApp, type might be 'message' with contentType='audio')
                    const isAudioMessage = message.type === 'audio' || 
                                          message.metadata?.contentType === 'audio' ||
                                          message.attachments?.[0]?.type === 'audio' ||
                                          (message.content === '[Audio]' && message.attachments?.[0]);
                    
                    // ✅ Don't render text content for audio messages (VoicePlayer handles it)
                    if (isAudioMessage) return null;

                    // ✅ Skip WhatsApp templates
                    if (message.channel === 'whatsapp' && (message.type === 'template' || message.metadata?.originalContent?.type === 'template')) {
                      return null;
                    }

                    // ✅ Skip location messages — rendered by Location card below
                    if (message.type === 'location' ||
                        message.metadata?.contentType === 'location' ||
                        message.metadata?.originalContent?.type === 'location' ||
                        message.locationData?.latitude ||
                        (typeof message.content === 'string' && message.content.startsWith('Location:'))) return null;

                    // ✅ Skip contact messages — rendered by ContactMessageCard below
                    if (message.type === 'contact' || message.type === 'contacts' || message.metadata?.contentType === 'contacts') return null;
                    
                    let contentText = null;
                    if (message.content) {
                      if (typeof message.content === 'string') {
                        contentText = message.content;
                      } else if (typeof message.content === 'object' && message.content.text) {
                        contentText = message.content.text;
                      } else if (typeof message.content === 'object' && message.content.type) {
                        // Fallback: stringify if it's an unexpected object
                        contentText = JSON.stringify(message.content);
                      }
                    }
                    return contentText ? (
                      <div>
                        <div
                          className="text-sm leading-relaxed"
                          style={{
                            whiteSpace: 'pre-wrap',
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word',
                            wordBreak: 'normal',
                          }}
                        >
                          {renderTextWithLinks(contentText, isOutbound)}
                        </div>
                        
                        {/* ✅ Link Preview - only for web links; skip for file URLs (files use document card) */}
                        {(() => {
                          const urls = detectUrls(contentText);
                          const firstUrl = urls[0];
                          if (firstUrl && !isFileUrl(firstUrl)) {
                            return <LinkPreview url={firstUrl} isOwn={isOutbound} />;
                          }
                          return null;
                        })()}
                      </div>
                    ) : null;
                  })()}

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
                    
                    // Get caption: from attachment, message.caption, or message.content for media messages
                    const mediaCaption = nonAudioAttachments[0]?.caption ||
                      message.caption ||
                      message.metadata?.caption ||
                      // If type is image/video and content is text (not JSON/URL), treat as caption
                      ((['image', 'video', 'sticker'].includes(message.type) && typeof message.content === 'string' && message.content && !message.content.startsWith('{') && !message.content.startsWith('http') && !message.content.startsWith('[')) ? message.content : null);

                    return (
                    <div className={cn(message.content && !mediaCaption && 'mt-2')}>
                        {nonAudioAttachments.length > 1 ? (
                          <MessageAttachmentGroup attachments={nonAudioAttachments} isOwn={isOutbound} />
                      ) : (
                          <MessageAttachment attachment={nonAudioAttachments[0]} isOwn={isOutbound} />
                      )}
                        {/* Caption below media — WhatsApp style */}
                        {mediaCaption && (
                          <p className="text-[13px] leading-[19px] mt-1 px-0.5 text-[#111b21] dark:text-[#e9edef]">
                            {mediaCaption}
                          </p>
                        )}
                    </div>
                    );
                  })()}

                  {(() => {
                    // ✅ Check if this is an audio message - API uses "message" type with contentType or attachment type
                    const isAudioMessage = message.type === 'audio' || 
                                          message.metadata?.contentType === 'audio' ||
                                          message.attachments?.[0]?.type === 'audio' ||
                                          (message.content === '[Audio]' && message.attachments?.[0]);
                    
                    if (!isAudioMessage) return null;
                    
                    // ✅ Handle multiple possible locations for audio URL and duration
                    const audioAttachment = message.attachments?.[0] || message.attachment || message.media;
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
                      return null;
                    }
                    
                    return (
                      <VoicePlayer 
                        audioUrl={audioUrl}
                        duration={audioDuration}
                        isOwn={isOutbound}
                      />
                    );
                  })()}

                  {/* ✅ Contact Message Display - Clickable */}
                  {(() => {
                    // ✅ Check if this is a contact message (multiple ways to identify)
                    const isContactMessage = message.type === 'contact' || 
                                            message.type === 'contacts' || 
                                            message.metadata?.contentType === 'contacts' ||
                                            (message.type === 'text' && typeof message.content === 'string' && message.content.startsWith('{') && 
                                             (() => {
                                               try {
                                                 const parsed = JSON.parse(message.content);
                                                 return parsed.type === 'contacts' && parsed.contacts?.[0];
                                               } catch {
                                                 return false;
                                               }
                                             })());
                    
                    if (!isContactMessage) return null;
                    
                    // ✅ Get contact data from multiple sources
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
                        isOwn={isOutbound}
                      />
                    ) : null;
                  })()}

                  {/* ✅ Location Message Display — WhatsApp style, fully clickable */}
                  {(message.type === 'location' ||
                    message.metadata?.contentType === 'location' ||
                    message.metadata?.originalContent?.type === 'location' ||
                    message.locationData?.latitude ||
                    (typeof message.content === 'string' && message.content.startsWith('Location:'))
                  ) && (() => {
                    // Try multiple sources for location data
                    const locData = message.locationData || message.metadata?.originalContent || {};
                    const lat = locData.latitude || (() => {
                      // Fallback: parse from content string like "Location: 48.1486, 17.1077"
                      if (typeof message.content === 'string') {
                        const match = message.content.match(/([-\d.]+)\s*,\s*([-\d.]+)/);
                        return match ? parseFloat(match[1]) : null;
                      }
                      return null;
                    })();
                    const lng = locData.longitude || (() => {
                      if (typeof message.content === 'string') {
                        const match = message.content.match(/([-\d.]+)\s*,\s*([-\d.]+)/);
                        return match ? parseFloat(match[2]) : null;
                      }
                      return null;
                    })();
                    if (!lat && !lng) return null; // No coordinates at all
                    const locName = locData.name;
                    const locAddress = locData.address;
                    const mapsUrl = locData.url || (lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : '#');

                    return (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-[260px] rounded-lg overflow-hidden mt-1 hover:opacity-95 transition-opacity cursor-pointer"
                      >
                        {/* Map preview using OpenStreetMap tile server (free, no API key) */}
                        <div className="relative h-[130px] bg-[#e4e6e8] dark:bg-[#2a3942] flex items-center justify-center overflow-hidden">
                          {lat && lng && (
                            <iframe
                              src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.003},${lng + 0.005},${lat + 0.003}&layer=mapnik&marker=${lat},${lng}`}
                              className="absolute inset-0 w-full h-full border-0 pointer-events-none"
                              loading="lazy"
                              title="Location map"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          )}
                          {/* Pin overlay (always visible on top of map) */}
                          <div className="relative z-10 flex flex-col items-center pointer-events-none">
                            <div className="h-10 w-10 rounded-full bg-[#25d366] flex items-center justify-center shadow-lg border-2 border-white">
                              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                              </svg>
                            </div>
                          </div>
                        </div>

                        {/* Location info bar */}
                        <div className={cn(
                          'px-3 py-2',
                          isOutbound
                            ? 'bg-[#d9fdd3] dark:bg-[#005c4b]'
                            : 'bg-white dark:bg-[#202c33]'
                        )}>
                          {locName ? (
                            <div className="text-[14px] font-medium text-[#111b21] dark:text-[#e9edef] leading-tight truncate">
                              {locName}
                            </div>
                          ) : (
                            <div className="text-[14px] font-medium text-[#111b21] dark:text-[#e9edef] leading-tight">
                              Location
                            </div>
                          )}
                          {locAddress ? (
                            <div className="text-[12px] text-[#667781] dark:text-[#8696a0] leading-tight mt-0.5 line-clamp-2">
                              {locAddress}
                            </div>
                          ) : lat && lng ? (
                            <div className="text-[12px] text-[#667781] dark:text-[#8696a0] leading-tight mt-0.5">
                              {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
                            </div>
                          ) : null}
                          {/* "Open in Google Maps" link text */}
                          <div className="text-[11px] text-[#00a884] font-medium mt-1">
                            Open in Google Maps
                          </div>
                        </div>
                      </a>
                    );
                  })()}

                  {/* ✅ Email From/To Info - Only for email messages (not WhatsApp) */}
                  {message.emailData && message.channel === 'email' && (
                    <div className={cn(
                      'text-xs mt-1 mb-0.5 px-1',
                      isOutbound 
                        ? 'text-muted-foreground' 
                        : 'text-gray-500 dark:text-gray-400'
                    )}>
                      {isOutbound ? (
                        <span>To: {message.emailData.to?.join(', ') || 'Unknown'}</span>
                      ) : (
                        <span>From: {message.emailData.from || 'Unknown'}</span>
                      )}
                    </div>
                  )}

                  <div className={cn(
                    'flex items-center gap-1.5 mt-1 text-xs whitespace-nowrap',
                    isOutbound ? 'justify-end text-muted-foreground' : 'justify-start text-gray-500 dark:text-gray-400'
                  )}>
                    <span className="whitespace-nowrap">{format(new Date(message.createdAt), 'HH:mm')}</span>
                    {isOutbound && <MessageStatus status={message.status} direction={message.direction} channel={message.channel || conversation?.channel} />}
                  </div>
                  
                  {/* Resend Button for Failed Messages */}
                  {isOutbound && message.status === 'failed' && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-red-700 dark:text-red-300">
                        Message failed to send
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={resendingMessageId === message._id}
                        className="h-6 px-2 text-xs bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-300 dark:border-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={async () => {
                          if (resendingMessageId === message._id) return; // Prevent double-click

                          setResendingMessageId(message._id);
                          try {
                            const resendConvId = message.conversation || message.conversationId || conversationId;
                            const response = await apiClient.post(`/messages/${resendConvId}/resend`, {
                              messageId: message._id
                            });
                            if (!response.data?.success) throw new Error(response.data?.message || 'Failed to resend');
                            toast.success('Resending message...');
                            // Remove the old failed message from the list to prevent duplicates
                            queryClient.setQueryData(['messages-infinite', conversationId, conversation?.channel ?? 'unknown'], (oldData) => {
                              if (!oldData?.pages) return oldData;
                              return {
                                ...oldData,
                                pages: oldData.pages.map(page => ({
                                  ...page,
                                  data: page.data?.filter(msg => String(msg._id) !== String(message._id)) || []
                                }))
                              };
                            });
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
                  )}
                </div>

                {/* Sender Name - Below message bubble (WhatsApp style) */}
                {((message.sender && (message.sender.role === 'agent' || message.sender.role === 'company_admin')) ||
                  (message.metadata?.isBotResponse || message.sender?.role === 'bot')) && (
                  <div className={cn(
                    'text-[11px] font-medium mt-0.5 px-1',
                    isOutbound
                      ? 'text-right text-muted-foreground'
                      : 'text-left text-muted-foreground'
                  )}>
                    {message.metadata?.isBotResponse || message.sender?.role === 'bot'
                      ? 'AI Bot'
                      : `${message.sender.firstName || ''} ${message.sender.lastName || ''}`.trim()}
                  </div>
                )}

                {/* Translation indicator for non-English inbound messages */}
                {!isOutbound && message.metadata?.detectedLanguage && message.metadata.detectedLanguage !== 'en' && (
                  <div className={cn(
                    'mt-0.5 px-1',
                    isOutbound ? 'text-right' : 'text-left'
                  )}>
                    <details className="group">
                      <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground inline-flex items-center gap-1">
                        <Globe className="h-2.5 w-2.5" />
                        <span>{message.metadata.detectedLanguage.toUpperCase()}</span>
                        {message.metadata.translatedContent && (
                          <span className="text-primary">- View translation</span>
                        )}
                      </summary>
                      {message.metadata.translatedContent && (
                        <div className="mt-1 p-1.5 rounded bg-muted/50 text-[11px] text-muted-foreground italic">
                          {message.metadata.translatedContent}
                        </div>
                      )}
                    </details>
                  </div>
                )}

                {/* ✅ Reactions Display - WhatsApp Style (Bottom Corner, Always Visible) */}
                {hasReactions && (
                  <div className={cn(
                    'absolute -bottom-1 flex items-end gap-0.5 z-20',
                    isOutbound ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'
                  )}>
                    {Object.entries(groupedReactions).slice(0, 3).map(([emoji, users]) => (
                      <button
                        key={emoji}
                        onClick={() => setShowReactionDetails({ messageId: message._id, emoji: 'all' })}
                        className={cn(
                          "flex items-center justify-center rounded-full bg-card border border-border shadow-md hover:scale-110 transition-transform cursor-pointer z-10 text-xs leading-none",
                          users.length > 1 ? "h-auto px-1.5 py-0.5 gap-0.5" : "h-5 w-5"
                        )}
                        title={users.length > 1 ? `${users.length} reactions` : '1 reaction'}
                      >
                        <span className="text-xs leading-none">{emoji}</span>
                        {users.length > 1 && (
                          <span className="text-[10px] font-medium text-foreground/80 leading-none">
                            {users.length}
                          </span>
                        )}
                      </button>
                    ))}
                    {Object.keys(groupedReactions).length > 3 && (
                      <button
                        onClick={() => setShowReactionDetails({ messageId: message._id, emoji: 'all' })}
                        className="flex items-center justify-center h-5 w-5 rounded-full bg-card border border-border shadow-md hover:scale-110 transition-transform cursor-pointer z-10"
                        title={`${Object.keys(groupedReactions).length} reactions`}
                      >
                        <span className="text-[8px] font-bold text-gray-600 dark:text-gray-300">+{Object.keys(groupedReactions).length - 3}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Actions - Show on Hover (desktop) or Long-press (mobile) */}
              {!message.isOptimistic && !message.isDeleted && (
                <div
                  data-action-menu
                  className={cn(
                    'flex items-center gap-1 mt-1 transition-opacity duration-200',
                    activeActionMessageId === message._id
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  )}
                >
                  <Popover open={openPickerFor === message._id} onOpenChange={(o) => setOpenPickerFor(o ? message._id : null)}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
                        <Smile className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" align={isOutbound ? 'end' : 'start'}>
                      <div className="flex gap-1 items-center">
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(message._id, emoji)}
                            className="text-2xl hover:scale-125 transition-transform p-1 rounded hover:bg-muted"
                          >
                            {emoji}
                          </button>
                        ))}
                        {/* Plus to open extra reactions */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="ml-1 h-7 w-7 rounded-full bg-muted hover:bg-muted text-foreground/80 flex items-center justify-center text-xl leading-none">+</button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2" align={isOutbound ? 'end' : 'start'}>
                            <div className="grid grid-cols-8 gap-1">
                              {EXTRA_REACTIONS.map((e) => (
                                <button
                                  key={e}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    handleReaction(message._id, e);
                                  }}
                                  className="text-xl p-1 rounded hover:bg-muted"
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={isOutbound ? 'end' : 'start'}>
                      <DropdownMenuItem onClick={() => { setNewMessageCount(0); onReply?.(message); }}>
                        <Reply className="mr-2 h-4 w-4" /> Reply
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {message.content && (
                        <DropdownMenuItem onClick={() => handleCopy(message.content)}>
                          <Copy className="mr-2 h-4 w-4" /> Copy
                        </DropdownMenuItem>
                      )}
                      {message.attachments?.length > 0 && (
                        <DropdownMenuItem onClick={() => {
                          // Bug 7 fix: Download ALL attachments, not just the first
                          message.attachments.forEach(att => handleDownload(att));
                        }}>
                          <Download className="mr-2 h-4 w-4" /> Download
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          );
        })}
        
        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-card shadow-sm rounded-bl-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                {typingUsers.length === 1
                  ? `${typingUsers[0].userName} is typing...`
                  : `${typingUsers.length} people typing...`}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-4 shrink-0" />
      </div>

      {/* Scroll to Bottom Button + New Messages Banner */}
      {!shouldScrollToBottom && (
        <div className="absolute bottom-4 right-4 z-30 flex flex-col items-center gap-1.5">
          {newMessageCount > 0 && (
            <button
              onClick={scrollToBottom}
              className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-full shadow-lg hover:bg-primary/90 transition-colors"
              aria-label={`${newMessageCount} new message${newMessageCount > 1 ? 's' : ''}`}
            >
              {newMessageCount} new message{newMessageCount > 1 ? 's' : ''}
            </button>
          )}
          <button
            onClick={scrollToBottom}
            className="h-9 w-9 rounded-full bg-card shadow-md border border-border flex items-center justify-center hover:bg-muted/50 transition-colors opacity-80 hover:opacity-100"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Reaction Details Modal */}
      <Dialog open={!!showReactionDetails} onOpenChange={() => setShowReactionDetails(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl font-semibold">Reactions</span>
            </DialogTitle>
          </DialogHeader>

          {/* Build a WhatsApp-like header with tabs and counts */}
          {showReactionDetails && (() => {
            const messageId = showReactionDetails.messageId;
            // Merge socket reactions with API reactions (same as bubble display)
            const msg = fetchedMessages.find(m => m._id === messageId);
            const socketR = messageReactions[String(messageId)];
            const apiR = (msg?.reactions || []).map(r => ({
              userId: r.user?._id?.toString() || r.user?.toString() || r.contact?._id?.toString() || r.contact?.toString(),
              reaction: r.emoji,
              userName: r.userName || (typeof r.user === 'object' && r.user?.firstName ? `${r.user.firstName} ${r.user.lastName || ''}`.trim() : null) || r.contactName || (typeof r.contact === 'object' ? (r.contact?.name || r.contact?.displayName) : null) || 'User',
            }));
            const all = socketR && socketR.length > 0 ? socketR : apiR;

            const grouped = all.reduce((acc, r) => {
              if (!acc[r.reaction]) acc[r.reaction] = [];
              acc[r.reaction].push(r);
              return acc;
            }, {});
            const emojis = Object.keys(grouped);
            const active = showReactionDetails.emoji || 'all';
            const myId = currentUser?._id?.toString() || currentUser?.id?.toString();

            const tabButton = (label, emojiKey, count) => (
              <button
                key={emojiKey}
                onClick={() => setShowReactionDetails({ messageId, emoji: emojiKey })}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5 transition-colors',
                  active === emojiKey ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted text-muted-foreground'
                )}
              >
                {label}
                <span className="text-xs font-medium">{count}</span>
              </button>
            );

            const list = active === 'all' ? all : grouped[active] || [];

            return (
              <div className="space-y-3">
                <div className="flex items-center gap-1 border-b pb-2 dark:border-border overflow-x-auto">
                  {tabButton('All', 'all', all.length)}
                  {emojis.map(e => tabButton(e, e, grouped[e].length))}
                </div>

                <div className="space-y-0.5 max-h-72 overflow-y-auto">
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No reactions</p>
                  ) : list.map((r, idx) => {
                    const isMe = myId && r.userId?.toString() === myId;
                    const name = isMe ? 'You' : (r.userName || 'User');
                    const initial = name.charAt(0).toUpperCase();
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'flex items-center gap-3 p-2.5 rounded-lg transition-colors',
                          isMe ? 'hover:bg-primary/5 cursor-pointer' : 'hover:bg-muted/50'
                        )}
                        onClick={isMe ? () => { handleReaction(messageId, ''); setShowReactionDetails(null); } : undefined}
                      >
                        <div className={cn(
                          'h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0',
                          isMe ? 'bg-primary' : 'bg-gradient-to-br from-slate-500 to-slate-700'
                        )}>
                          {initial}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{name}</p>
                          {isMe && (
                            <p className="text-xs text-muted-foreground">Tap to remove</p>
                          )}
                        </div>
                        <span className="text-xl flex-shrink-0">{r.reaction}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

    </>
  );
}
