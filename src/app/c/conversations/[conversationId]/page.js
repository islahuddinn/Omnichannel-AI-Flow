// src/app/(agent)/conversations/[conversationId]/page.js
'use client';

import { use, useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Menu, MoreVertical, Merge, Unlink, Users, X, Search, Plus, RefreshCw, AlertCircle, ArrowLeft, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import MessageList from '@/components/chat/MessageList';
import MessageListWithInfiniteScroll from '@/components/chat/MessageListWithInfiniteScroll';
import MessageComposer from '@/components/chat/MessageComposer';
import ConversationHeader, { ContactDetailsContent } from '@/components/chat/ConversationHeader';
import ConversationList from '@/components/chat/ConversationList';
import MergeConversationModal from '@/components/modals/MergeConversationsModal';
import StartConversationModal from '@/components/modals/StartConversationModal';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import { useSocket, useSocketEvent } from '@/hooks/useSocket';
import { useDebouncedCallback } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { getNotificationSoundService } from '@/services/notification/NotificationSoundService';
import { useAIBotSettings } from '@/hooks/useAIBotSettings';
import { useAuth } from '@/hooks/useAuth';

function ConversationDetailPageContent({ params }) {
  const { conversationId } = use(params);
  // ✅ Get AI bot settings
  const { enabled: isAIBotEnabled } = useAIBotSettings();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // ✅ Fetch user profile to check chatFeature setting (real-time)
  const { data: profileData, refetch: refetchProfile } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const response = await apiClient.get('/users/profile');
      return response.data;
    },
    enabled: !!user,
    staleTime: 0, // Always fetch fresh data for real-time updates
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
  });

  // ✅ Get chat feature from correct path (chat.chat_feature, not preferences.chatFeature)
  const chatFeature = profileData?.chat?.chat_feature || profileData?.chat_feature || 'on';
  const roleInChatFeature = profileData?.chat?.role_in_chat_feature || profileData?.role_in_chat_feature;
  const isViewOnly = chatFeature === 'view-only' || roleInChatFeature === 'view-only';
  const isChatDisabled = chatFeature === 'off';
  const callCenterAllowed = profileData?.callCenter?.call_center === 'on'||profileData?.call_center === 'on';
  // Enable + in view-only only when call center is allowed (user can create call conversations)
  const canStartConversation = !isChatDisabled && (!isViewOnly || callCenterAllowed);

  // ✅ Listen for real-time chat feature updates via socket
  useSocketEvent('user:chatFeatureUpdated', useCallback((data) => {
    if (data.userId === user?.userId || data.userId === user?._id) {
      console.log('🔄 Chat feature updated in real-time:', data);
      // Refetch profile to get latest chat feature status
      refetchProfile();
    }
  }, [user, refetchProfile]));

  // ✅ Redirect if chat is disabled
  useEffect(() => {
    if (isChatDisabled && user) {
      router.replace('/c/dashboard');
      toast.error('Chat feature is disabled. Please contact your administrator.');
    }
  }, [isChatDisabled, user, router]);
  
  // UI State
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isNewConversation, setIsNewConversation] = useState(false);
  const [newConversationData, setNewConversationData] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    // ✅ Restore sidebar state from localStorage on mount, otherwise default based on screen size
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-open-state');
      if (saved !== null) {
        return JSON.parse(saved);
      }
      return window.innerWidth >= 1024;
    }
    return false;
  });
  // ✅ Responsive sidebar: open by default on large screens (1024px+), closed on mobile/tablet
  const [showDetailsSidebar, setShowDetailsSidebar] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  // ✅ Track if user manually closed the sidebar (so we don't auto-open it again)
  const [sidebarManuallyClosed, setSidebarManuallyClosed] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  
  // ✅ Track window width for responsive behavior
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      const newWidth = window.innerWidth;
      setWindowWidth(newWidth);
      
      // Only auto-close sidebar when transitioning from desktop to mobile
      // (to prevent the overlay from being stuck on mobile after resize)
      const wasDesktop = windowWidth >= 1024;
      const isMobileNow = newWidth < 1024;
      
      if (wasDesktop && isMobileNow && isSidebarOpen) {
        setIsSidebarOpen(false);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [windowWidth, isSidebarOpen]);
  
  // ✅ Persist sidebar open/closed state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-open-state', JSON.stringify(isSidebarOpen));
    }
  }, [isSidebarOpen]);
  
  const [replyTo, setReplyTo] = useState(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [selectedConversationsForMerge, setSelectedConversationsForMerge] = useState([]);
  const [optimisticMessages, setOptimisticMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const manualSectionRef = useRef(null);
  const autoSectionRef = useRef(null);
  
  // Socket connection
  const socketData = useSocket();
  const { socket, isConnected, emit } = socketData;
  

  // ✅ Track if we've already marked conversation as read to prevent infinite loops
  const markedAsReadRef = useRef(false);
  
  // ✅ Auto-mark conversation as read when viewing (via socket)
  useEffect(() => {
    if (!conversationId || isNewConversation || conversationId === 'new' || !socket || !socket.connected) {
      markedAsReadRef.current = false; // Reset when conditions change
      return;
    }
    
    // ✅ Prevent multiple calls - only mark as read once per conversationId
    if (markedAsReadRef.current) return;
    
    // Optimistically update cache immediately
    queryClient.setQueryData(['conversation', conversationId], (old) => {
      if (!old?.data) return old;
      return {
        ...old,
        data: { ...old.data, unreadCount: 0 },
      };
    });
    
    queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
      if (!oldData?.data && !oldData?.pages) return oldData;
      
      // Handle infinite query structure
      if (oldData.pages) {
        return {
          ...oldData,
          pages: oldData.pages.map(page => ({
            ...page,
            data: {
              ...page.data,
              data: (page.data?.data || []).map((c) =>
                String(c._id) === String(conversationId) ? { ...c, unreadCount: 0 } : c
              ),
            },
          })),
        };
      }
      
      // Handle regular query structure
      return {
        ...oldData,
        data: oldData.data.map((c) =>
          String(c._id) === String(conversationId) ? { ...c, unreadCount: 0 } : c
        ),
      };
    });
    
    // Emit socket event to mark as read
    socket.emit('conversation:action', {
      conversationId,
      action: 'markRead',
      actionData: {},
    });
    
    markedAsReadRef.current = true;
  }, [conversationId, isNewConversation, socket?.connected, socket?.id]);

  // Check if this is a new conversation
  useEffect(() => {
    if (conversationId === 'new') {
      const dataParam = searchParams.get('data');
      if (dataParam) {
        try {
          const parsedData = JSON.parse(decodeURIComponent(dataParam));
          setNewConversationData(parsedData);
          setIsNewConversation(true);
        } catch (error) {
          console.error('Failed to parse conversation data:', error);
          toast.error('Invalid conversation data', { description: 'Could not open this conversation.' });
          router.back();
        }
      } else {
        router.back();
      }
    }
  }, [conversationId, searchParams, router]);

  // Debounced query invalidation
  const debouncedInvalidateConversations = useDebouncedCallback(() => {
    queryClient.invalidateQueries(['conversations']);
  }, 2000);

  const debouncedInvalidateMessages = useDebouncedCallback(() => {
    queryClient.invalidateQueries(['messages', conversationId]);
  }, 500);

  const debouncedInvalidateCurrentConversation = useDebouncedCallback(() => {
    queryClient.invalidateQueries(['conversation', conversationId]);
  }, 1000);

  // Fetch conversations for sidebar
  // ✅ Use same query key structure as main conversations page for cache consistency
  const { data: conversationsData, refetch: refetchConversations, isFetching: isFetchingConversations } = useQuery({
    queryKey: ['conversations', { search: sidebarSearch, status: 'active' }],
    queryFn: async () => {
      const response = await apiClient.get('/conversations', {
        params: { status: 'active', search: sidebarSearch, limit: 100 }
      });
      return response;
    },
    staleTime: 0, // ✅ Allow refetch for real-time updates
    gcTime: 600000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    retry: 1,
    enabled: !isNewConversation,
  });

  // ✅ Show all conversations (no mode filtering)
  const filteredConversations = conversationsData?.data || [];
  
  // ✅ Group conversations by mode (manual first, then auto) for section labels
  const { manualConversations, autoConversations } = useMemo(() => {
    const conversations = filteredConversations || [];
    const manual = [];
    const auto = [];
    
    conversations.forEach(conv => {
      const mode = conv.mode || 'auto'; // Default to 'auto' if not specified
      if (mode === 'manual') {
        manual.push(conv);
      } else {
        auto.push(conv);
      }
    });
    
    // Sort each group by lastMessageAt (latest first), pinned at top
    const sortGroup = (group) => {
      return [...group].sort((a, b) => {
        // Pinned always first
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        
        // Then by lastMessageAt (latest first)
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
    };
    
    return {
      manualConversations: sortGroup(manual),
      autoConversations: sortGroup(auto)
    };
  }, [filteredConversations]);
  
  // ✅ Combined sorted conversations (manual first, then auto)
  const sortedConversations = [...manualConversations, ...autoConversations];

  // Fetch current conversation
  const { data: conversationData, isLoading: loadingConversation, error: conversationError, refetch: refetchConversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      // ✅ Check if conversation was deleted (404 or not found)
      try {
      const response = await apiClient.get(`/conversations/${conversationId}`);
        // ✅ CRITICAL: Validate that contact data is populated - but don't retry (use fallback instead)
        if (response?.data) {
          // ✅ Check if contact is missing or incomplete - but don't throw, just log
          const hasContact = response.data.contact && (
            response.data.contact.name || 
            response.data.contact.displayName || 
            response.data.contact.email || 
            response.data.contact.phone ||
            response.data.contact.identifiers?.email ||
            response.data.contact.identifiers?.phone
          );
          
          if (!hasContact) {
            console.warn('⚠️ Conversation fetched but contact not populated:', {
              conversationId,
              hasContact: !!response.data.contact,
              contactName: response.data.contact?.name,
              contactEmail: response.data.contact?.email,
              contactPhone: response.data.contact?.phone
            });
            // ✅ Don't throw - let the fallback logic handle it
          }
        }
        
        // ✅ CRITICAL: After fetching conversation, also update conversation list cache to preserve mergedConversations
        // This ensures channel icons remain visible when fetching messages
        if (response?.data) {
          queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
            if (!oldData?.data) return oldData;
            const updatedList = oldData.data.map(conv => {
              if (String(conv._id) === String(conversationId)) {
                // ✅ Preserve mergedConversations and isMerged when updating conversation list cache
                return {
                  ...conv,
                  ...response.data,
                  // ✅ CRITICAL: Preserve mergedConversations from response OR existing cache
                  mergedConversations: response.data.mergedConversations || conv.mergedConversations || [],
                  isMerged: response.data.isMerged !== undefined ? response.data.isMerged : (conv.mergedConversations?.length > 0 || conv.isMerged || false)
                };
              }
              return conv;
            });
            return { ...oldData, data: updatedList };
          });
        }
        
      return response;
      } catch (error) {
        // ✅ Suppress timeout errors - they're handled gracefully by React Query
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          // Return cached data if available, or return null to show loading
          const cachedData = queryClient.getQueryData(['conversation', conversationId]);
          if (cachedData) {
            return cachedData;
          }
          // Return null to continue showing loading state
          return null;
        }
        
        // ✅ Only throw real errors (404, 403, etc.)
        if (error.response?.status === 404) {
          // ✅ Error will be caught by useEffect above to redirect
          throw new Error('Conversation not found');
        } else if (error.response?.status === 403) {
          const redirectTo = error.response?.data?.redirectTo;
          if (redirectTo) {
            router.push(`/c/conversations/${redirectTo}`);
            throw new Error('Conversation is merged into another');
          }
          throw new Error('Access denied');
        }
        
        // ✅ For other errors, return null to show loading state instead of error
        console.warn('⚠️ Error fetching conversation (suppressed):', error.message);
        return null;
      }
    },
    enabled: !isNewConversation && conversationId !== 'new',
    staleTime: 300000, // ✅ 5 minutes - socket updates handle real-time
    gcTime: 600000, // ✅ 10 minutes
    refetchOnWindowFocus: false, // ✅ Disable - socket updates handle real-time
    refetchOnMount: 'always', // ✅ Always refetch on mount - React Query will use cached data if available
    refetchOnReconnect: false, // ✅ Disable - socket updates handle real-time
    // ✅ CRITICAL: Use cached data immediately while refetching in background
    placeholderData: (previousData) => previousData, // Show cached data instantly
    // ❌ REMOVED: No polling - socket updates handle all real-time updates
    retry: (failureCount, error) => {
      // ✅ Don't retry on timeout errors - they're handled gracefully
      if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        return false;
      }
      // ✅ Don't retry on contact missing errors - use fallback instead
      if (error?.message?.includes('Contact not loaded') || error?.message?.includes('Contact ID not populated')) {
        return false;
      }
      // ✅ Retry once for other errors
      return failureCount < 1;
    },
    retryDelay: 500,
    // ✅ Suppress error messages for timeout errors
    throwOnError: (error) => {
      // ✅ Don't throw timeout errors - handle them gracefully
      if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        return false;
      }
      return true;
    },
  });

  // ✅ State to track if we should show error and redirect
  const [showNotFoundError, setShowNotFoundError] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // ✅ CRITICAL: Handle 404 errors (conversation deleted) and redirect in real-time
  // ✅ Must be after useQuery that defines conversationError
  useEffect(() => {
    if (conversationError && (
      conversationError.message?.includes('not found') ||
      conversationError.response?.status === 404
    )) {
      console.log('🔄 Conversation not found error detected, showing error and redirecting...');
      setShowNotFoundError(true);
      setRedirecting(true);
      
      // Clean up queries
      queryClient.removeQueries(['conversation', conversationId]);
      queryClient.removeQueries(['messages-infinite', conversationId]);
      
      // Show toast
      toast.error('Conversation not found', {
        description: 'Redirecting to conversations list...',
        duration: 2000,
      });
      
      // Redirect after a short delay to show the error message
      setTimeout(() => {
        router.push('/c/conversations');
      }, 1500);
    }
  }, [conversationError, conversationId, router, queryClient]);

  // ❌ REMOVED: Duplicate messages query
  // ✅ MessageListWithInfiniteScroll handles all message fetching
  // This was causing duplicate API calls on every message
  
  // ✅ CRITICAL: Ensure conversation data is complete before using it
  // If contact is missing, try to get it from conversation list cache
  let conversation = isNewConversation ? newConversationData?.conversation : conversationData?.data;
  
  // ✅ FALLBACK: If conversation exists but contact is missing, try to get it from conversation list cache
  if (conversation && (!conversation.contact || !conversation.contact.name) && !isNewConversation) {
    const conversationsListData = queryClient.getQueryData(['conversations', { search: sidebarSearch, status: 'active' }]);
    const cachedConversation = conversationsListData?.data?.find(c => String(c._id) === String(conversationId));
    
    if (cachedConversation?.contact || cachedConversation?.contactData) {
      const cachedContact = cachedConversation.contactData || cachedConversation.contact;
      if (cachedContact && (cachedContact.name || cachedContact.displayName || cachedContact.email || cachedContact.phone)) {
        console.log('✅ Using contact data from conversation list cache:', {
          conversationId,
          contactName: cachedContact.name || cachedContact.displayName || 'N/A'
        });
        
        // ✅ Update conversation with contact data from cache
        conversation = {
          ...conversation,
          contact: cachedContact,
          contactData: cachedContact,
        };
        
        // ✅ Also update the conversation query cache
        queryClient.setQueryData(['conversation', conversationId], (oldData) => ({
          ...oldData,
          data: {
            ...(oldData?.data || {}),
            contact: cachedContact,
            contactData: cachedContact,
          }
        }));
      }
    }
  }
  
  // ✅ Set initial sidebar state - closed by default
  // This must be after conversation is defined
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isLargeScreen = windowWidth >= 1024; // lg breakpoint (1024px+)
      const isMediumScreen = windowWidth >= 768; // md breakpoint (768px+)
      
      // Close on smaller screens if open
      if (!isLargeScreen && showDetailsSidebar) {
        setShowDetailsSidebar(false);
        setSidebarManuallyClosed(false); // Reset on screen size change
      }
    }
  }, [windowWidth, conversation, sidebarManuallyClosed]); // Re-check when window width or conversation changes
  
  // ✅ Reset manual close flag when conversation changes (new conversation = fresh start)
  useEffect(() => {
    setSidebarManuallyClosed(false);
  }, [conversationId]);

  // ✅ Join conversation room (STABLE - no duplicate joins)
  // ✅ CRITICAL: Also join merged conversation rooms for real-time updates
  // ✅ Use ref to track joined rooms across re-renders to prevent leaving rooms unnecessarily
  const joinedRoomsRef = useRef(new Set());
  
  // ✅ CRITICAL: Always join primary conversation room immediately when socket connects
  // This ensures real-time updates work even if conversation data hasn't loaded yet
  useEffect(() => {
    if (!socket || !conversationId || isNewConversation || conversationId === 'new') {
      return;
    }

    const primaryRoomId = String(conversationId);
    let retryTimeoutId = null;

    const joinPrimaryRoom = (retryCount = 0) => {
      if (!socket?.connected) {
        console.log('⏳ Socket not connected, waiting...', {
          socketId: socket?.id,
          connected: socket?.connected
        });
        return false;
      }
      
      // ✅ ALWAYS join primary conversation room (the one in the URL)
      // This is critical for merged conversations - messages are sent to the primary room
      if (!joinedRoomsRef.current.has(primaryRoomId)) {
        console.log(`👤 Joining PRIMARY conversation room: conversation:${primaryRoomId}`, {
          socketId: socket.id,
          connected: socket.connected,
          conversationId: primaryRoomId,
          hasConversationData: !!conversation,
          retryCount
        });
        
        try {
          socket.emit('conversation:join', { conversationId: primaryRoomId }, (response) => {
            if (response?.success) {
              joinedRoomsRef.current.add(primaryRoomId);
              console.log(`✅ Successfully joined PRIMARY conversation room: conversation:${primaryRoomId}`, {
                room: response.room,
                roomSize: response.roomSize
              });
              if (retryTimeoutId) clearTimeout(retryTimeoutId);
            } else {
              console.warn(`⚠️ Room join failed:`, response);
              // Retry after a short delay (max 3 retries)
              if (retryCount < 3) {
                retryTimeoutId = setTimeout(() => {
                  if (socket.connected && !joinedRoomsRef.current.has(primaryRoomId)) {
                    joinPrimaryRoom(retryCount + 1);
                  }
                }, 500 * (retryCount + 1));
              }
            }
          });
        } catch (error) {
          console.error(`❌ Error joining room ${primaryRoomId}:`, error);
          // Retry after a short delay (max 3 retries)
          if (retryCount < 3) {
            retryTimeoutId = setTimeout(() => {
              if (socket.connected && !joinedRoomsRef.current.has(primaryRoomId)) {
                joinPrimaryRoom(retryCount + 1);
              }
            }, 500 * (retryCount + 1));
          }
        }
        return true;
      } else {
        console.log(`✅ Already joined PRIMARY conversation room: conversation:${primaryRoomId}`);
        return true;
      }
    };

    // Join immediately if connected
    if (socket.connected) {
      // Small delay to ensure socket is fully ready
      const timeoutId = setTimeout(() => {
        joinPrimaryRoom();
      }, 100);
    return () => {
        clearTimeout(timeoutId);
        if (retryTimeoutId) clearTimeout(retryTimeoutId);
      };
    } else {
      // Wait for socket connection
      const handleConnect = () => {
        console.log('🔌 Socket connected, joining primary room...', {
          socketId: socket.id,
          conversationId: primaryRoomId
        });
        // Small delay to ensure socket is fully ready
        setTimeout(() => {
          joinPrimaryRoom();
        }, 100);
      };
      socket.once('connect', handleConnect);
      
      return () => {
        socket.off('connect', handleConnect);
        if (retryTimeoutId) clearTimeout(retryTimeoutId);
      };
    }
  }, [socket, conversationId, isNewConversation]); // ✅ Join primary room immediately when socket/conversationId changes
  
  // ✅ CRITICAL: Join merged conversation rooms when conversation data is available
  // This handles the case where conversation data loads AFTER socket connection
  // ✅ Use ref to track if we've already processed this conversation to prevent infinite loops
  const processedConversationRef = useRef(null);
  
  // ✅ Memoize conversation properties to prevent infinite loops
  const isMerged = conversation?.isMerged || false;
  const mergedConversationIds = useMemo(() => {
    if (!conversation?.mergedConversations || !Array.isArray(conversation.mergedConversations)) return [];
    return conversation.mergedConversations
      .map(m => String(m?.conversationId || m?._id || ''))
      .filter(Boolean)
      .sort()
      .join(',');
  }, [conversation?.mergedConversations]);
  
  useEffect(() => {
    if (!socket || !conversationId || isNewConversation || conversationId === 'new' || !socket.connected) {
      processedConversationRef.current = null; // Reset when conditions change
      return;
    }
    
    const primaryRoomId = String(conversationId);
    const conversationIdStr = String(conversationId);
    
    // ✅ Prevent infinite loops - only process once per conversationId + isMerged + mergedIds combination
    const conversationKey = `${conversationIdStr}-${isMerged}-${mergedConversationIds}`;
    if (processedConversationRef.current === conversationKey) {
      return; // Already processed this conversation state
    }
    
    // ✅ CRITICAL: ALWAYS ensure primary room is joined (for both merged and non-merged)
    // This is the most important room - all messages go here
    const joinPrimaryRoom = () => {
      if (!joinedRoomsRef.current.has(primaryRoomId)) {
        console.log(`👤 Ensuring PRIMARY conversation room is joined (conversation data loaded): conversation:${primaryRoomId}`, {
          socketId: socket.id,
          connected: socket.connected,
          isMerged: isMerged,
          hasConversation: !!conversation
        });
        
        socket.emit('conversation:join', { conversationId: primaryRoomId }, (response) => {
          if (response?.success) {
            joinedRoomsRef.current.add(primaryRoomId);
            console.log(`✅ Successfully joined PRIMARY room after conversation data loaded: conversation:${primaryRoomId}`, {
              room: response.room,
              roomSize: response.roomSize
            });
          } else {
            console.warn(`⚠️ Failed to join PRIMARY room after conversation data loaded:`, response);
            // Retry after a short delay (only once to prevent loops)
            if (!joinedRoomsRef.current.has(primaryRoomId)) {
              setTimeout(() => {
                if (socket.connected && !joinedRoomsRef.current.has(primaryRoomId)) {
                  socket.emit('conversation:join', { conversationId: primaryRoomId }, (response) => {
                    if (response?.success) {
                      joinedRoomsRef.current.add(primaryRoomId);
                    }
                  });
                }
              }, 500);
            }
          }
        });
      }
    };
    
    // Call immediately
    joinPrimaryRoom();
    
    // ✅ If conversation is merged, join all merged conversation rooms
    if (isMerged && mergedConversationIds) {
      const mergedIds = mergedConversationIds.split(',').filter(Boolean);
      mergedIds.forEach(mergedRoomId => {
        if (!joinedRoomsRef.current.has(mergedRoomId)) {
          console.log(`👤 Joining merged conversation room: conversation:${mergedRoomId}`);
          socket.emit('conversation:join', { conversationId: mergedRoomId }, (response) => {
            if (response?.success) {
              joinedRoomsRef.current.add(mergedRoomId);
              console.log(`✅ Successfully joined merged room: conversation:${mergedRoomId}`, {
                room: response.room,
                roomSize: response.roomSize
              });
            }
          });
        }
      });
      
      console.log(`✅ All rooms joined for merged conversation:`, {
        primary: primaryRoomId,
        merged: mergedIds,
        allRooms: Array.from(joinedRoomsRef.current)
      });
    } else {
      // ✅ For non-merged conversations, ensure primary room is joined
      console.log(`✅ Primary room joined for non-merged conversation:`, {
        primary: primaryRoomId,
        isJoined: joinedRoomsRef.current.has(primaryRoomId)
      });
    }
    
    // ✅ Mark this conversation state as processed
    processedConversationRef.current = conversationKey;
  }, [socket?.connected, socket?.id, conversationId, isNewConversation, isMerged, mergedConversationIds]); // ✅ Use stable dependencies
  
  // ✅ Handle socket reconnection - rejoin all rooms
  useEffect(() => {
    if (!socket || !conversationId || isNewConversation || conversationId === 'new') {
      return;
    }
    
    const handleDisconnect = () => {
      console.log('🔌 Socket disconnected, clearing room tracking...');
      // ✅ Clear room tracking on disconnect - Socket.IO loses room memberships
      joinedRoomsRef.current.clear();
    };
    
    const handleReconnect = () => {
      console.log('🔄 Socket reconnected, rejoining all conversation rooms...', {
        socketId: socket.id,
        conversationId: String(conversationId)
      });
      
      // ✅ Clear room tracking to force rejoin (Socket.IO doesn't remember rooms after reconnect)
      joinedRoomsRef.current.clear();
      
      // Small delay to ensure socket is fully ready
      setTimeout(() => {
        // ✅ Rejoin primary room
        const primaryRoomId = String(conversationId);
        socket.emit('conversation:join', { conversationId: primaryRoomId }, (response) => {
          if (response?.success) {
            joinedRoomsRef.current.add(primaryRoomId);
            console.log(`✅ Rejoined PRIMARY conversation room: conversation:${primaryRoomId}`, {
              room: response.room,
              roomSize: response.roomSize
            });
            
            // ✅ Rejoin merged rooms if conversation is merged
            if (conversation?.isMerged && conversation?.mergedConversations) {
              conversation.mergedConversations.forEach(merged => {
                if (merged?.conversationId) {
                  const mergedRoomId = String(merged.conversationId);
                  socket.emit('conversation:join', { conversationId: mergedRoomId }, (response) => {
                    if (response?.success) {
                      joinedRoomsRef.current.add(mergedRoomId);
                      console.log(`✅ Rejoined merged conversation room: conversation:${mergedRoomId}`, {
                        room: response.room,
                        roomSize: response.roomSize
                      });
                    }
                  });
                }
              });
              console.log(`✅ Rejoined ${conversation.mergedConversations.length} merged conversation room(s)`);
            }
            
            console.log(`✅ Rejoined ${joinedRoomsRef.current.size} conversation room(s) after reconnect`);
          }
        });
      }, 100);
    };
    
    socket.on('disconnect', handleDisconnect);
    socket.on('reconnect', handleReconnect);
    
    return () => {
      socket.off('disconnect', handleDisconnect);
      socket.off('reconnect', handleReconnect);
    };
  }, [socket, conversationId, conversation?.isMerged, conversation?.mergedConversations, isNewConversation]);
  
  // ✅ Cleanup: Leave all rooms only when component unmounts or conversationId changes
  useEffect(() => {
    return () => {
      if (socket && socket.connected) {
        joinedRoomsRef.current.forEach(roomId => {
          console.log(`👤 Leaving conversation room: conversation:${roomId}`);
          socket.emit('conversation:leave', { conversationId: roomId });
        });
        joinedRoomsRef.current.clear();
      }
    };
  }, [socket, conversationId]); // ✅ Only cleanup when navigating away from conversation

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // ✅ Socket events for conversation merge/unmerge - Real-time cache updates
  useSocketEvent('conversation:merged', useCallback((data) => {
    const { primaryConversationId, mergedConversationIds } = data;
    
    // If this conversation is involved in the merge
    if (String(primaryConversationId) === String(conversationId) || 
        (mergedConversationIds && mergedConversationIds.includes(conversationId))) {
      
      console.log('🔄 Processing merge event for conversation:', conversationId);
      
      // Update conversation cache immediately with complete data
      queryClient.setQueryData(['conversation', conversationId], (old) => {
        if (!old?.data) return old;

        const updated = { ...old.data };

        // If this is the primary conversation
        if (String(primaryConversationId) === String(conversationId)) {
          // Use updatedPrimaryConversation from socket when available (has full channel/account data)
          if (data.updatedPrimaryConversation) {
            return {
              ...old,
              data: {
                ...updated,
                ...data.updatedPrimaryConversation,
                isMerged: true,
                mergedConversations: data.updatedPrimaryConversation.mergedConversations || []
              }
            };
          }
          // Fallback: build mergedConversations from cached data
          updated.isMerged = true;
          updated.mergedConversations = mergedConversationIds?.map(id => {
            const cachedConvs = queryClient.getQueryData(['conversations'])?.data || [];
            const originalConv = cachedConvs.find(c => String(c._id) === String(id));
            return {
              conversationId: id,
              channel: originalConv?.channel || 'unknown',
              channelAccount: originalConv?.channelAccount || null
            };
          }) || updated.mergedConversations || [];
        } else {
          // This is a merged conversation
          updated.primaryConversation = primaryConversationId;
          updated.status = 'active';
          updated.isMerged = true;
        }

        return { ...old, data: updated };
      });
      
      // ✅ CRITICAL: After updating cache, rejoin conversation rooms to ensure real-time updates
      // This ensures that when a conversation is merged, we join the primary conversation room
      if (String(primaryConversationId) === String(conversationId) && socket?.connected) {
        console.log('🔄 Rejoining conversation room after merge:', conversationId);
        socket.emit('conversation:join', { conversationId });
        
        // Also join all merged conversation rooms
        if (mergedConversationIds) {
          mergedConversationIds.forEach(mergedId => {
            socket.emit('conversation:join', { conversationId: mergedId });
          });
        }
      }
      
      // ✅ Update conversations list cache
      queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
        if (!oldData?.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.map((c) => {
            if (String(c._id) === String(primaryConversationId)) {
              return { ...c, isMerged: true, mergedConversations: mergedConversationIds || [] };
            } else if (mergedConversationIds?.includes(String(c._id))) {
              return { ...c, primaryConversation: primaryConversationId, isMerged: true, status: 'active' };
            }
            return c;
          }).filter(c => {
            // Remove secondary merged conversations (those with primaryConversation)
            return !c.primaryConversation || c.isMerged;
          })
        };
      });
      
      // ✅ CRITICAL: Clear old message cache and force immediate refetch after merge
      // When merged, conversation.isMerged changes from false to true
      // This changes the query key, but we need to ensure old cache is cleared
      console.log('🔄 Clearing message cache and refetching after merge');
      
      // ✅ CRITICAL: Remove all old message cache entries (with isMerged: false)
      // The query key includes isMerged, so old entries won't match new query key
      // But we should still explicitly remove them to prevent confusion
      queryClient.removeQueries({ 
        queryKey: ['messages-infinite', conversationId],
        exact: false
      });
      
      // ✅ CRITICAL: Immediately refetch conversation to get complete merged data - NO DELAY
      // This ensures the conversation prop updates with isMerged: true and mergedConversations
      // Refetch immediately (conversation cache already updated above)
      refetchConversation().then((result) => {
        console.log('✅ Conversation refetched after merge, fetching all merged messages IMMEDIATELY');
        
        // ✅ Get the updated conversation from cache immediately
        const updatedConv = queryClient.getQueryData(['conversation', conversationId])?.data;
        
        // ✅ CRITICAL: Also update conversation list cache to preserve mergedConversations
        // This ensures channel icons remain visible in the conversation list when fetching messages
        if (updatedConv) {
          queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
            if (!oldData?.data) return oldData;
            const updatedList = oldData.data.map(conv => {
              if (String(conv._id) === String(conversationId)) {
                // ✅ Preserve mergedConversations when updating conversation list cache
                return {
                  ...conv,
                  ...updatedConv,
                  mergedConversations: updatedConv.mergedConversations || conv.mergedConversations || [],
                  isMerged: updatedConv.isMerged !== undefined ? updatedConv.isMerged : (updatedConv.mergedConversations?.length > 0 || false)
                };
              }
              return conv;
            });
            return { ...oldData, data: updatedList };
          });
        }
        
        if (updatedConv?.isMerged && updatedConv.mergedConversations?.length > 0) {
          console.log('✅ Conversation is merged with', updatedConv.mergedConversations.length, 'merged conversations, fetching ALL messages NOW');
          
          // ✅ IMMEDIATE refetch - NO DELAY - Use explicit query key with isMerged: true
          // This ensures messages from ALL merged conversations load instantly
          queryClient.refetchQueries({ 
            queryKey: ['messages-infinite', conversationId, true, updatedConv?.channel],
            exact: false,
            type: 'active'
          }).then(() => {
            console.log('✅ Messages refetched successfully after merge - ALL merged conversations loaded');
          }).catch(error => {
            console.error('❌ Error refetching messages after merge:', error);
            // ✅ Immediate fallback
            queryClient.refetchQueries({ 
              queryKey: ['messages-infinite', conversationId],
              exact: false,
              type: 'active'
            }).catch(err => {
              console.error('❌ Error refetching messages (fallback):', err);
            });
          });
        } else {
          console.warn('⚠️ Conversation not properly merged, forcing immediate refetch:', {
            isMerged: updatedConv?.isMerged,
            mergedConversationsCount: updatedConv?.mergedConversations?.length || 0
          });
          // ✅ Immediate refetch with isMerged: true (assume it's merged based on socket event)
          queryClient.refetchQueries({ 
            queryKey: ['messages-infinite', conversationId, true],
            exact: false,
            type: 'active'
          }).catch(err => {
            console.error('❌ Error refetching messages (immediate):', err);
          });
        }
      }).catch(error => {
        console.error('❌ Error refetching conversation:', error);
        // ✅ IMMEDIATE fallback: refetch messages with isMerged: true (assume merged from socket event)
        queryClient.invalidateQueries(['messages-infinite', conversationId], { exact: false });
        queryClient.refetchQueries({ 
          queryKey: ['messages-infinite', conversationId, true],
          exact: false,
          type: 'active'
        }).catch(err => {
          console.error('❌ Error refetching messages (immediate fallback):', err);
        });
      });
    }
  }, [conversationId, queryClient, refetchConversation]));

  useSocketEvent('conversation:unmerged', useCallback((data) => {
    const { primaryConversationId, unmergedConversationId, unmergedConversationIds, updatedConversations } = data;
    
    // ✅ Handle both singular and plural (for backward compatibility)
    const unmergedIds = unmergedConversationIds || (unmergedConversationId ? [unmergedConversationId] : []);
    
    // If this conversation is involved in the unmerge
    const isInvolved = String(primaryConversationId) === String(conversationId) || 
        unmergedIds.some(id => String(id) === String(conversationId));
    
    if (isInvolved) {
      console.log('🔄 Processing unmerge event for conversation:', conversationId);
      
      // ✅ OPTIMIZED: Use updatedConversations from socket event directly (no refetch needed)
      if (updatedConversations && updatedConversations.length > 0) {
        const updatedConv = updatedConversations.find(c => String(c._id) === String(conversationId));
        if (updatedConv) {
          // ✅ Update conversation cache immediately with complete data from server
          queryClient.setQueryData(['conversation', conversationId], {
            success: true,
            data: {
              ...updatedConv,
              isMerged: false, // ✅ Ensure isMerged is false after unmerge
              mergedConversations: [], // ✅ Clear merged conversations
              primaryConversation: null // ✅ Clear primary conversation reference
            }
          });
          
          // ✅ CRITICAL: Clear message cache IMMEDIATELY (no delay)
          // Remove all message cache entries for this conversation
          queryClient.removeQueries({ 
            queryKey: ['messages-infinite', conversationId],
            exact: false
          });
          
          // ✅ IMMEDIATE refetch messages (no setTimeout delay)
          // The query key will change because isMerged changed from true to false
          queryClient.refetchQueries({ 
            queryKey: ['messages-infinite', conversationId, false, updatedConv?.channel],
            exact: false,
            type: 'active'
          }).catch(error => {
            console.error('❌ Error refetching messages after unmerge:', error);
          });
          
          console.log('✅ Conversation and messages updated immediately after unmerge');
          return; // ✅ Early return - no need for fallback logic
        }
      }
      
      // ✅ Fallback: Update conversation cache if updatedConversations not provided
      queryClient.setQueryData(['conversation', conversationId], (old) => {
        if (!old?.data) {
          // If no cached data, trigger immediate refetch
          refetchConversation();
          return old;
        }
        
        const updated = { ...old.data };
        
        // If this is the primary conversation
        if (String(primaryConversationId) === String(conversationId)) {
          updated.isMerged = false;
          updated.mergedConversations = [];
        } else {
          // This is an unmerged conversation
          updated.primaryConversation = null;
          updated.status = 'active';
          updated.autoMergeDisabled = true;
          updated.isMerged = false;
        }
        
        return { ...old, data: updated };
      });
      
      // ✅ Update conversations list cache immediately
      queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
        if (!oldData?.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.map((c) => {
            if (String(c._id) === String(primaryConversationId)) {
              return { ...c, isMerged: false, mergedConversations: [] };
            } else if (unmergedIds.some(id => String(c._id) === String(id))) {
              return { ...c, primaryConversation: null, status: 'active', autoMergeDisabled: true, isMerged: false };
            }
            return c;
          })
        };
      });
      
      // ✅ CRITICAL: Clear message cache IMMEDIATELY (no delay)
      queryClient.removeQueries({ 
        queryKey: ['messages-infinite', conversationId],
        exact: false
      });
      
      // ✅ IMMEDIATE refetch (no setTimeout)
      refetchConversation().then(() => {
        queryClient.refetchQueries({ 
          queryKey: ['messages-infinite', conversationId],
          exact: false,
          type: 'active'
        }).catch(error => {
          console.error('❌ Error refetching messages after unmerge:', error);
        });
      }).catch(error => {
        console.error('❌ Error refetching conversation after unmerge:', error);
      });
    }
  }, [conversationId, queryClient, refetchConversation]));

  // ✅ Socket events (Real-time updates, NO API calls - use cache updates)
  useSocketEvent('message:new', useCallback((data) => {
    // ✅ Extract message and conversation ID (handle both formats)
    const newMessage = data.message || data;
    const messageConversationId = data.conversationId || newMessage.conversation || newMessage.conversationId;
    
    // Convert to string for comparison
    const targetConvId = String(conversationId);
    const messageConvId = String(messageConversationId);
    
    // ✅ CRITICAL: If message includes contact data, update conversation cache immediately
    if (data.contact || data.contactData) {
      const contactDataFromMessage = data.contactData || data.contact || null;
      if (messageConvId === targetConvId && contactDataFromMessage) {
        queryClient.setQueryData(['conversation', conversationId], (oldData) => {
          // ✅ If no cached data, create it with the contact data from message
          if (!oldData?.data) {
            return {
              success: true,
              data: {
                _id: conversationId,
                contact: contactDataFromMessage,
                contactData: contactDataFromMessage,
              }
            };
          }
          
          // ✅ Only update if current contact data is missing or incomplete
          const currentContact = oldData.data.contact || oldData.data.contactData || null;
          const hasValidContact = currentContact && (
            currentContact.name || 
            currentContact.displayName || 
            currentContact.email || 
            currentContact.phone
          );
          
          if (!hasValidContact && contactDataFromMessage) {
            console.log('✅ Updating conversation cache with contact data from message event:', {
              conversationId,
              contactName: contactDataFromMessage.name || contactDataFromMessage.displayName || 'N/A'
            });
            
            return {
              ...oldData,
              data: {
                ...oldData.data,
                contact: contactDataFromMessage,
                contactData: contactDataFromMessage,
              }
            };
          }
          
          return oldData;
        });
        
        // ✅ CRITICAL: If conversation was not in cache or missing contact, trigger a refetch
        const cachedConversation = queryClient.getQueryData(['conversation', conversationId]);
        if (!cachedConversation?.data || !cachedConversation.data.contact) {
          console.log('🔄 Conversation missing contact data, refetching after message event...');
          refetchConversation().catch(err => {
            console.error('❌ Error refetching conversation after message:', err);
          });
        }
      }
    }
    
    // ✅ For new conversations, listen to messages for the newly created conversation
    // This handles the case where a message is sent and a conversation is created
    if (isNewConversation && newConversationData) {
      // ✅ If this message is for a new conversation (not the temporary 'new' ID), display it instantly
      if (messageConvId && messageConvId !== 'new' && messageConvId !== targetConvId) {
        // ✅ This is likely the first message for the new conversation
        // Update optimistic messages to show it instantly
        setOptimisticMessages(prev => {
          // Check if we already have this message
          const existing = prev.find(m => 
            m._id === newMessage._id || 
            (m.tempId && newMessage.metadata?.tempId === m.tempId) ||
            (m.tempId && newMessage.tempId === m.tempId)
          );
          if (existing) {
            // Replace optimistic with real message
            return prev.map(m => 
              (m._id === newMessage._id || 
               (m.tempId && newMessage.metadata?.tempId === m.tempId) ||
               (m.tempId && newMessage.tempId === m.tempId))
                ? { ...newMessage, isOptimistic: false }
                : m
            );
          }
          // Add new message if not already present
          return [...prev, { ...newMessage, isOptimistic: false }];
        });
      scrollToBottom();
        
        // ✅ Redirect to the actual conversation ID after a short delay
        setTimeout(() => {
          router.replace(`/c/conversations/${messageConvId}`);
        }, 200);
        return;
      }
    }
    
    // ✅ Check if message is from a merged conversation
    const isMessageFromMergedConv = conversation?.isMerged && 
      conversation?.mergedConversations?.some(mc => String(mc.conversationId) === messageConvId);
    
    const isDirectMatch = messageConvId === targetConvId;
    const shouldDisplayMessage = isDirectMatch || isMessageFromMergedConv;
    
    if (shouldDisplayMessage) {
      // ✅ CRITICAL: Remove optimistic messages IMMEDIATELY when real message arrives
      // Don't wait - the real message will be in cache by the time this runs
      // ✅ CRITICAL: Remove optimistic messages that have been replaced by real messages
      // Match by tempId first (most reliable), then by content+time+channel
      setOptimisticMessages(prev => prev.filter(msg => {
          if (!msg.isOptimistic) return true; // Keep non-optimistic messages
          
          // ✅ Match by tempId if available (most reliable)
          if (msg.tempId && (newMessage.metadata?.tempId === msg.tempId || newMessage.tempId === msg.tempId)) {
            console.log('✅ Removing optimistic message (matched by tempId):', {
              tempId: msg.tempId,
              realMessageId: newMessage._id
            });
            return false; // Remove this optimistic message
          }
          
          // ✅ Match by _id if optimistic message has a real ID
          if (msg._id && newMessage._id && msg._id === newMessage._id) {
            console.log('✅ Removing optimistic message (matched by _id):', {
              _id: msg._id
            });
            return false; // Remove this optimistic message
          }
          
          // ✅ Match by content, direction, time, and channel (for outbound messages only)
          if (msg.direction === 'outbound' && newMessage.direction === 'outbound') {
            // ✅ For template messages, match by templateName + channel + time
            if (msg.type === 'template' && newMessage.type === 'template') {
              const templateMatch = msg.templateName === newMessage.templateName || 
                                   msg.metadata?.templateName === newMessage.templateName ||
                                   msg.metadata?.templateName === newMessage.metadata?.templateName;
              const channelMatch = (msg.channel || newMessage.channelType) === (newMessage.channel || newMessage.channelType);
              const timeMatch = Math.abs(new Date(msg.createdAt) - new Date(newMessage.createdAt)) < 30000; // 30 seconds for templates
              
              // For email templates, also match by subject
              if ((msg.channel === 'email' || newMessage.channel === 'email') && msg.emailData?.subject && newMessage.emailData?.subject) {
                const subjectMatch = msg.emailData.subject === newMessage.emailData.subject;
                if (templateMatch && channelMatch && timeMatch && subjectMatch) {
                  console.log('✅ Removing optimistic template message (matched by templateName+channel+time+subject):', {
                    tempId: msg.tempId,
                    templateName: msg.templateName,
                    realMessageId: newMessage._id
                  });
                  return false;
                }
              } else if (templateMatch && channelMatch && timeMatch) {
                console.log('✅ Removing optimistic template message (matched by templateName+channel+time):', {
                  tempId: msg.tempId,
                  templateName: msg.templateName,
                  realMessageId: newMessage._id
                });
                return false;
              }
            }
            
            // ✅ For non-template messages, match by content
            const contentMatch = (
              (typeof msg.content === 'string' && typeof newMessage.content === 'string' && msg.content === newMessage.content) ||
              (typeof msg.content === 'object' && typeof newMessage.content === 'object' && 
               msg.content?.text === newMessage.content?.text)
            );
            
            const timeMatch = Math.abs(new Date(msg.createdAt) - new Date(newMessage.createdAt)) < 15000; // 15 seconds
            const channelMatch = (msg.channel || newMessage.channelType) === (newMessage.channel || newMessage.channelType);
            
            // For email messages, also match by subject
            const emailSubjectMatch = msg.emailData?.subject && newMessage.emailData?.subject &&
              msg.emailData.subject === newMessage.emailData.subject;
            
            // Remove if all conditions match
            if (contentMatch && timeMatch && channelMatch) {
              // For email, also require subject match
              if (msg.channel === 'email' || newMessage.channel === 'email') {
                if (emailSubjectMatch) {
                  console.log('✅ Removing optimistic message (matched by content+time+channel+subject):', {
                    tempId: msg.tempId,
                    realMessageId: newMessage._id
                  });
                  return false; // Remove for email messages with matching subject
                }
              } else {
                console.log('✅ Removing optimistic message (matched by content+time+channel):', {
                  tempId: msg.tempId,
                  realMessageId: newMessage._id
                });
                return false; // Remove for non-email messages
              }
            }
          }
          
          return true; // Keep this optimistic message (not replaced yet)
        }));
      
      console.log('✅ Removed optimistic messages for real message:', {
        messageId: newMessage._id,
        tempId: newMessage.metadata?.tempId || newMessage.tempId,
        type: newMessage.type,
        templateName: newMessage.templateName
      });
      
      scrollToBottom();
    }
    
    // ✅ Update conversation list cache DIRECTLY (NO API CALL) and re-sort by lastMessageAt
    queryClient.setQueryData(['conversations', { search: sidebarSearch, status: 'active' }], (oldData) => {
      if (!oldData?.data) return oldData;
      const updatedList = (oldData.data || []).map(conv => {
        const convId = String(conv._id);
        if (convId === messageConvId) {
          // ✅ Only increment unread count if message is from another conversation or if current conversation is not being viewed
          // ✅ NEW: Don't increment unread count if AI bot is enabled and conversation is in auto mode
          const conversationMode = conv.mode || 'auto';
          const isAutoMode = conversationMode === 'auto';
          const shouldIncrementUnread = 
            newMessage.direction === 'inbound' && 
            (convId !== targetConvId) && // Only increment if not current conversation
            !(isAIBotEnabled && isAutoMode); // Skip if AI bot enabled and auto mode
          
          // ✅ If this is the current conversation being viewed and message is inbound, auto-mark as read (unreadCount = 0)
          const shouldMarkAsRead = 
            convId === targetConvId && 
            newMessage.direction === 'inbound';
          
          const firstAtt = newMessage.attachments?.[0];
          const lastMessagePreviewAttachment = firstAtt && (firstAtt.name || firstAtt.url)
            ? { name: firstAtt.name || (firstAtt.url ? firstAtt.url.split('/').pop() : 'File'), size: firstAtt.size, type: firstAtt.type || 'document' }
            : null;

          return {
            ...conv,
            lastMessage: newMessage._id,
            lastMessageContent: newMessage.content || newMessage.text || '',
            lastMessageType: newMessage.type || 'text',
            lastMessageDirection: newMessage.direction || 'inbound',
            lastMessageAt: newMessage.createdAt || new Date().toISOString(),
            lastMessageStatus: newMessage.status ?? (newMessage.direction === 'outbound' ? 'pending' : null),
            lastMessageId: newMessage._id?.toString() ?? null,
            lastMessagePreviewAttachment,
            updatedAt: newMessage.createdAt || new Date().toISOString(),
            unreadCount: shouldMarkAsRead ? 0 : (shouldIncrementUnread ? (conv.unreadCount || 0) + 1 : (conv.unreadCount || 0))
          };
        }
        return conv;
      });
      
      // ✅ Re-sort conversations by lastMessageAt (latest first), pinned at top
      const sorted = [...updatedList].sort((a, b) => {
        // Pinned conversations always at top
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        
        // Sort by lastMessageAt (latest first)
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
      
      return { ...oldData, data: sorted };
    });
    
    // ✅ Auto-mark as read when viewing conversation and receiving inbound message (via socket)
    if (messageConvId === targetConvId && newMessage.direction === 'inbound' && newMessage.type !== 'reaction') {
      // Optimistically update cache
      queryClient.setQueryData(['conversation', conversationId], (old) => ({
        ...old,
        data: { ...old?.data, unreadCount: 0 },
      }));
      
      queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
        if (!oldData?.data) return oldData;
        const updated = oldData.data.map((c) =>
          String(c._id) === String(conversationId) ? { ...c, unreadCount: 0 } : c
        );
        
        // ✅ Re-sort conversations by lastMessageAt (latest first), pinned at top
        const sorted = [...updated].sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bTime - aTime;
        });
        
        return { ...oldData, data: sorted };
      });
      
      // Emit socket event to mark as read (conversation is being viewed)
      if (socket && socket.connected) {
        socket.emit('conversation:action', {
          conversationId,
          action: 'markRead',
          actionData: {},
        });
      }
    }
    
    // ✅ Play notification sound for manual mode conversations (inbound messages only)
    if (newMessage.direction === 'inbound' && newMessage.type !== 'reaction') {
      // Get conversation mode from message payload, cache, or conversation prop
      const convData = queryClient.getQueryData(['conversations', { search: sidebarSearch, status: 'active' }]);
      const conv = convData?.data?.find(c => String(c._id) === messageConvId);
      const conversationMode = 
        newMessage.conversationMode || 
        conv?.mode || 
        conversation?.mode;
      
      const isManualMode = conversationMode === 'manual';
      
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
        }
      }
    }
  }, [conversationId, conversation, scrollToBottom, queryClient, sidebarSearch, refetchConversation]));

  useSocketEvent('message:status', useCallback((data) => {
    const messageConvId = String(data.conversationId || conversationId);
    const currentConvId = String(conversationId);
    
    // ✅ Check if status update is for this conversation or a merged conversation
    const isStatusFromMergedConv = conversation?.isMerged && 
      conversation?.mergedConversations?.some(mc => String(mc.conversationId) === messageConvId);
    const isDirectMatch = messageConvId === currentConvId;
    const shouldUpdate = isDirectMatch || isStatusFromMergedConv;
    
    if (shouldUpdate) {
      console.log('✅ Updating optimistic message status:', {
        messageId: data.messageId,
        status: data.status,
        conversationId: data.conversationId,
        currentConvId
      });
      
      // Update optimistic message status if it exists
      setOptimisticMessages(prev => prev.map(msg => {
        // ✅ Match by messageId OR tempId (for optimistic messages)
        const matches = msg._id === data.messageId || 
                     (msg.isOptimistic && msg.tempId && data.metadata?.tempId && msg.tempId === data.metadata.tempId) ||
                     (msg.tempId && data.messageId && String(msg.tempId) === String(data.messageId));
        
        if (matches) {
          // ✅ CRITICAL: Status progression should only move forward: pending → sent → delivered → read
          // Never allow status to go backward (prevents delivered → sent issues)
          const statusOrder = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };
          const currentOrder = statusOrder[msg.status] || 0;
          const newOrder = statusOrder[data.status] || 0;
          
          // ✅ Only update if new status is higher than current (or if current is failed)
          if (newOrder <= currentOrder && msg.status !== 'failed' && data.status !== 'failed') {
            console.log(`⚠️ Skipping optimistic status update (would go backward): ${msg.status} → ${data.status}`);
            return msg; // Keep current status
          }
          
          return { 
            ...msg, 
            status: data.status,
            // ✅ Remove optimistic flag once status is updated (unless still pending)
            isOptimistic: data.status === 'pending' ? msg.isOptimistic : false
          };
        }
        return msg;
      }));

      // ✅ Update conversation list cache so sidebar shows status (pending → sent → delivered → read) in real-time
      const statusOrder = { pending: 0, sending: 1, sent: 2, delivered: 3, read: 4, failed: -1 };
      queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
        if (!oldData?.data) return oldData;
        let changed = false;
        const updated = (oldData.data || []).map((c) => {
          if (String(c._id) !== messageConvId) return c;
          const isLastMessage = !c.lastMessageId || c.lastMessageId === data.messageId || String(c.lastMessageId) === String(data.messageId);
          if (!isLastMessage) return c;
          const currentOrder = statusOrder[c.lastMessageStatus] ?? -2;
          const newOrder = statusOrder[data.status] ?? -2;
          if (newOrder <= currentOrder && data.status !== 'failed') return c;
          changed = true;
          return { ...c, lastMessageStatus: data.status };
        });
        return changed ? { ...oldData, data: updated } : oldData;
      });
    }
  }, [conversationId, conversation?.isMerged, queryClient]));

  useSocketEvent('conversation:update', useCallback((data) => {
    const update = data.update || data.updates || {};
    const updateConversationId = String(data.conversationId);
    
    // ✅ Update current conversation cache if it matches
    if (updateConversationId === String(conversationId)) {
      queryClient.setQueryData(['conversation', conversationId], (oldData) => {
        if (!oldData) return oldData;
        return { 
          ...oldData, 
          data: { 
            ...oldData.data, 
            ...update,
            // Ensure unreadCount is updated if provided
            unreadCount: update.unreadCount !== undefined ? update.unreadCount : oldData.data?.unreadCount,
          } 
        };
      });
    }
    
    // ✅ Update conversation list cache directly and re-sort by lastMessageAt
    queryClient.setQueryData(['conversations', { search: sidebarSearch, status: 'active' }], (oldData) => {
      if (!oldData?.data) return oldData;
      const updatedList = (oldData.data || []).map(conv => {
        // ✅ CRITICAL: Check if this conversation matches the update
        // For grouped conversations (company admin), check if conversationId is in _allDepartmentConversationIds
        const isDirectMatch = String(conv._id) === String(data.conversationId);
        const isGroupedMatch = conv._allDepartmentConversationIds && 
          Array.isArray(conv._allDepartmentConversationIds) &&
          conv._allDepartmentConversationIds.some(groupedId => String(groupedId) === String(data.conversationId));
        
        if (isDirectMatch || isGroupedMatch) {
          return {
            ...conv,
            // ✅ Update all last message fields from update payload
            lastMessage: update.lastMessage !== undefined ? update.lastMessage : conv.lastMessage,
            lastMessageAt: update.lastMessageAt !== undefined
              ? (typeof update.lastMessageAt === 'string' ? update.lastMessageAt : update.lastMessageAt.toISOString())
              : conv.lastMessageAt,
            lastMessageContent: update.lastMessageContent !== undefined
              ? update.lastMessageContent
              : conv.lastMessageContent,
            lastMessageType: update.lastMessageType !== undefined
              ? update.lastMessageType
              : conv.lastMessageType,
            lastMessageDirection: update.lastMessageDirection !== undefined
              ? update.lastMessageDirection
              : conv.lastMessageDirection,
            lastMessageStatus: update.lastMessageStatus !== undefined ? update.lastMessageStatus : conv.lastMessageStatus,
            lastMessageId: update.lastMessageId !== undefined ? update.lastMessageId : conv.lastMessageId,
            lastMessagePreviewAttachment: update.lastMessagePreviewAttachment !== undefined ? update.lastMessagePreviewAttachment : conv.lastMessagePreviewAttachment,
            unreadCount: update.unreadCount !== undefined ? update.unreadCount : conv.unreadCount,
            messageCount: update.messageCount !== undefined ? update.messageCount : conv.messageCount,
            mode: update.mode !== undefined ? update.mode : conv.mode,
            // ✅ Handle merge-related fields (when auto-merge updates the conversation)
            isMerged: update.isMerged !== undefined ? update.isMerged : conv.isMerged,
            mergedConversations: update.mergedConversations !== undefined ? update.mergedConversations : conv.mergedConversations,
            // ✅ Update contactData if provided (e.g., after merge), otherwise preserve existing
            contactData: update.contactData || conv.contactData || conv.contact || null,
            contact: update.contactData || conv.contact || conv.contactData || null,
            updatedAt: update.updatedAt !== undefined
              ? (typeof update.updatedAt === 'string' ? update.updatedAt : update.updatedAt.toISOString())
              : new Date().toISOString(),
          };
        }
        return conv;
      });
      
      // ✅ Re-sort conversations by lastMessageAt (latest first), pinned at top
      const sorted = [...updatedList].sort((a, b) => {
        // Pinned conversations always at top
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        
        // Sort by lastMessageAt (latest first)
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
      
      return { ...oldData, data: sorted };
    });
    
    // Also update all conversation queries with sorting
    queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
      if (!oldData?.data) return oldData;
      const updated = oldData.data.map((c) => {
        // ✅ CRITICAL: Check if this conversation matches the update
        // For grouped conversations (company admin), check if conversationId is in _allDepartmentConversationIds
        const isDirectMatch = String(c._id) === String(data.conversationId);
        const isGroupedMatch = c._allDepartmentConversationIds && 
          Array.isArray(c._allDepartmentConversationIds) &&
          c._allDepartmentConversationIds.some(groupedId => String(groupedId) === String(data.conversationId));
        
        if (isDirectMatch || isGroupedMatch) {
          return {
              ...c,
              // ✅ Update all last message fields from update payload
              lastMessage: update.lastMessage !== undefined ? update.lastMessage : c.lastMessage,
              lastMessageAt: update.lastMessageAt !== undefined 
                ? (typeof update.lastMessageAt === 'string' ? update.lastMessageAt : update.lastMessageAt.toISOString())
                : c.lastMessageAt,
              lastMessageContent: update.lastMessageContent !== undefined 
                ? update.lastMessageContent 
                : c.lastMessageContent,
              lastMessageType: update.lastMessageType !== undefined 
                ? update.lastMessageType 
                : c.lastMessageType,
              lastMessageDirection: update.lastMessageDirection !== undefined 
                ? update.lastMessageDirection 
                : c.lastMessageDirection,
              lastMessageStatus: update.lastMessageStatus !== undefined ? update.lastMessageStatus : c.lastMessageStatus,
              lastMessageId: update.lastMessageId !== undefined ? update.lastMessageId : c.lastMessageId,
              unreadCount: update.unreadCount !== undefined ? update.unreadCount : c.unreadCount,
              messageCount: update.messageCount !== undefined ? update.messageCount : c.messageCount,
              mode: update.mode !== undefined ? update.mode : c.mode,
              contactData: c.contactData || c.contact || null,
              contact: c.contact || c.contactData || null,
              updatedAt: update.updatedAt !== undefined 
                ? (typeof update.updatedAt === 'string' ? update.updatedAt : update.updatedAt.toISOString())
                : new Date().toISOString(),
            };
        }
        return c;
      });
      
      const sorted = [...updated].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
      
      return { ...oldData, data: sorted };
    });
  }, [conversationId, queryClient, sidebarSearch]));

  useSocketEvent('conversation:merged', useCallback((data) => {
    if (data.conversationId === conversationId) {
      // Only invalidate for merged - this is a rare operation
      queryClient.invalidateQueries(['conversation', conversationId]);
      toast.info('Conversation merged');
    }
  }, [conversationId, queryClient]));

  useSocketEvent('conversation:unmerged', useCallback((data) => {
    if (data.conversationId === conversationId) {
      // Only invalidate for unmerged - this is a rare operation
      queryClient.invalidateQueries(['conversation', conversationId]);
      toast.info('Conversation unmerged');
    }
  }, [conversationId, queryClient]));

  useSocketEvent('conversation:new', useCallback((data) => {
    // ✅ For new conversations, if this is the conversation we just created, handle it
    if (isNewConversation && newConversationData) {
      const newConvId = data.conversation?._id || data.conversationId;
      const message = data.message;
      
      // ✅ If this is the conversation we just created and has a message, display it instantly
      if (newConvId && message && message.conversationId === newConvId) {
        setOptimisticMessages(prev => {
          // Check if we already have this message
          const existing = prev.find(m => 
            m._id === message._id || 
            (m.tempId && message.metadata?.tempId === m.tempId) ||
            (m.tempId && message.tempId === m.tempId)
          );
          if (existing) {
            // Replace optimistic with real message
            return prev.map(m => 
              (m._id === message._id || 
               (m.tempId && message.metadata?.tempId === m.tempId) ||
               (m.tempId && message.tempId === m.tempId))
                ? { ...message, isOptimistic: false }
                : m
            );
          }
          // Add new message if not already present
          return [...prev, { ...message, isOptimistic: false }];
        });
    scrollToBottom();
        
        // ✅ Redirect to the actual conversation ID
        setTimeout(() => {
          router.replace(`/c/conversations/${newConvId}`);
        }, 200);
      }
    }
    
    // ✅ CRITICAL: If this is the current conversation, update it immediately with contact data
    const newConvId = data.conversation?._id || data.conversationId;
    if (String(newConvId) === String(conversationId)) {
      const contactDataFromEvent = data.contactData || data.contact || null;
      const normalizedConversation = {
        ...data.conversation,
        contactData: contactDataFromEvent || data.conversation?.contactData || data.conversation?.contact || null,
        contact: contactDataFromEvent || data.conversation?.contact || data.contact || data.conversation?.contactData || null,
      };
      
      // ✅ Update current conversation cache immediately with complete contact data
      queryClient.setQueryData(['conversation', conversationId], (oldData) => {
        // ✅ Preserve existing data and merge with new contact data
        return {
          ...oldData,
          success: true,
          data: {
            ...(oldData?.data || {}),
            ...normalizedConversation,
            // ✅ Ensure contact data is always set from event (most up-to-date)
            contact: contactDataFromEvent || normalizedConversation.contact || oldData?.data?.contact || null,
            contactData: contactDataFromEvent || normalizedConversation.contactData || oldData?.data?.contactData || null,
          }
        };
      });
      
      // ✅ CRITICAL: If conversation was not in cache, trigger a refetch to get complete data
      const cachedConversation = queryClient.getQueryData(['conversation', conversationId]);
      if (!cachedConversation?.data || !cachedConversation.data.contact) {
        console.log('🔄 Conversation not in cache or missing contact, refetching...');
        refetchConversation().catch(err => {
          console.error('❌ Error refetching conversation:', err);
        });
      }
      
      console.log('✅ Updated conversation cache with contact data from socket event:', {
        conversationId,
        hasContact: !!contactDataFromEvent,
        contactName: contactDataFromEvent?.name || contactDataFromEvent?.displayName || 'N/A'
      });
    }
    
    // ✅ Add new conversation to cache directly (for conversations created by others)
    queryClient.setQueryData(['conversations', { search: sidebarSearch, status: 'active' }], (oldData) => {
      if (!oldData?.data) return oldData;
      
      // ✅ CRITICAL: Prioritize contactData from socket event (most up-to-date)
      // Use data.contactData first, then data.contact, then fallback to conversation.contact
      const contactDataFromEvent = data.contactData || data.contact || null;
      
      // ✅ Normalize conversation data - ensure contactData is present with full contact info
      const normalizedConversation = {
        ...data.conversation,
        // ✅ Use contactData from event (includes name, displayName, phone, email, avatar, identifiers)
        contactData: contactDataFromEvent || data.conversation?.contactData || data.conversation?.contact || null,
        // ✅ Keep contact for backward compatibility
        contact: contactDataFromEvent || data.conversation?.contact || data.contact || data.conversation?.contactData || null,
      };
      
      // Check if conversation already exists
      const newConvId = normalizedConversation._id || data.conversationId;
      const exists = oldData.data.some(c => String(c._id) === String(newConvId));
      if (exists) {
        // Update existing conversation - CRITICAL: Update contactData if it's more complete
        return {
          ...oldData,
          data: oldData.data.map(c => {
            if (String(c._id) === String(newConvId)) {
              // ✅ Use the more complete contactData (prefer event data if it has name/displayName)
              const existingContactData = c.contactData || c.contact || null;
              const newContactData = normalizedConversation.contactData || normalizedConversation.contact || null;
              
              // ✅ Prefer new contactData if it has more complete information (name/displayName)
              const bestContactData = (
                (newContactData && (newContactData.name || newContactData.displayName)) 
                  ? newContactData 
                  : (existingContactData && (existingContactData.name || existingContactData.displayName))
                    ? existingContactData
                    : newContactData || existingContactData
              );
              
              return {
                ...c,
                ...normalizedConversation,
                // ✅ Use the best available contactData
                contactData: bestContactData,
                contact: bestContactData,
                lastMessageAt: normalizedConversation.lastMessageAt || c.lastMessageAt || new Date()
              };
            }
            return c;
          }).sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return bTime - aTime;
          })
        };
      }
      
      // Add to beginning of list
      return {
        ...oldData,
        data: [normalizedConversation, ...oldData.data].sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bTime - aTime;
        })
      };
    });
  }, [queryClient, sidebarSearch, isNewConversation, newConversationData, router, scrollToBottom, conversationId]));

  // ✅ Handle conversation actions socket events
  useSocketEvent('conversation:read', useCallback((data) => {
    if (String(data.conversationId) === String(conversationId)) {
      queryClient.setQueryData(['conversation', conversationId], (old) => ({
        ...old,
        data: { ...old?.data, unreadCount: 0 },
      }));
    }
    
    // Update all conversation list queries
    queryClient.setQueryData(['conversations', { search: sidebarSearch, status: 'active' }], (oldData) => {
      if (!oldData?.data) return oldData;
      return {
        ...oldData,
        data: oldData.data.map((c) =>
          String(c._id) === String(data.conversationId) ? { ...c, unreadCount: 0 } : c
        ),
      };
    });
    
    // Also update conversations query without search filter
    queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
      if (!oldData?.data) return oldData;
      return {
        ...oldData,
        data: oldData.data.map((c) =>
          String(c._id) === String(data.conversationId) ? { ...c, unreadCount: 0 } : c
        ),
      };
    });
  }, [conversationId, queryClient, sidebarSearch]));

  useSocketEvent('conversation:unread', useCallback((data) => {
    queryClient.setQueryData(['conversations', { search: sidebarSearch, status: 'active' }], (oldData) => {
      if (!oldData?.data) return oldData;
      return {
        ...oldData,
        data: oldData.data.map((c) =>
          c._id === data.conversationId ? { ...c, unreadCount: data.unreadCount || 1 } : c
        ),
      };
    });
  }, [queryClient, sidebarSearch]));

  useSocketEvent('conversation:pinned', useCallback((data) => {
    queryClient.setQueryData(['conversations', { search: sidebarSearch, status: 'active' }], (oldData) => {
      if (!oldData?.data) return oldData;
      return {
        ...oldData,
        data: oldData.data.map((c) =>
          c._id === data.conversationId ? { ...c, isPinned: true, pinnedAt: new Date() } : c
        ),
      };
    });
  }, [queryClient, sidebarSearch]));

  useSocketEvent('conversation:unpinned', useCallback((data) => {
    queryClient.setQueryData(['conversations', { search: sidebarSearch }], (oldData) => {
      if (!oldData?.data) return oldData;
      return {
        ...oldData,
        data: oldData.data.map((c) =>
          c._id === data.conversationId ? { ...c, isPinned: false, pinnedAt: null } : c
        ),
      };
    });
  }, [queryClient, sidebarSearch]));

  useSocketEvent('conversation:archived', useCallback((data) => {
    // ✅ Use same query key structure as main conversations page for cache consistency
    queryClient.setQueryData(['conversations', { search: sidebarSearch, status: 'active' }], (oldData) => {
      if (!oldData?.data) return oldData;
      return {
        ...oldData,
        data: oldData.data.filter((c) => String(c._id) !== String(data.conversationId)),
      };
    });
  }, [queryClient, sidebarSearch]));

  useSocketEvent('conversation:unarchived', useCallback((data) => {
    // ✅ Use same query key structure as main conversations page for cache consistency
    queryClient.invalidateQueries(['conversations', { search: sidebarSearch, status: 'active' }]);
  }, [queryClient, sidebarSearch]));

  useSocketEvent('conversation:muted', useCallback((data) => {
    queryClient.setQueryData(['conversation', conversationId], (old) => ({
      ...old,
      data: { ...old?.data, isMuted: true },
    }));
  }, [conversationId, queryClient]));

  useSocketEvent('conversation:unmuted', useCallback((data) => {
    queryClient.setQueryData(['conversation', conversationId], (old) => ({
      ...old,
      data: { ...old?.data, isMuted: false },
    }));
  }, [conversationId, queryClient]));

  useSocketEvent('conversation:starred', useCallback((data) => {
    queryClient.setQueryData(['conversation', conversationId], (old) => ({
      ...old,
      data: { ...old?.data, isStarred: true },
    }));
  }, [conversationId, queryClient]));

  useSocketEvent('conversation:unstarred', useCallback((data) => {
    queryClient.setQueryData(['conversation', conversationId], (old) => ({
      ...old,
      data: { ...old?.data, isStarred: false },
    }));
  }, [conversationId, queryClient]));

  useSocketEvent('conversation:deleted', useCallback((data) => {
    const deletedConvId = String(data.conversationId || data._id);
    const currentConvId = String(conversationId);
    
    // ✅ CRITICAL: Redirect immediately if current conversation is deleted
    if (deletedConvId === currentConvId) {
      console.log('🔄 Current conversation deleted, redirecting to conversations list');
      
      // Clean up all queries for this conversation
      queryClient.removeQueries(['conversation', conversationId]);
      queryClient.removeQueries(['messages-infinite', conversationId]);
      queryClient.removeQueries(['messages', conversationId]);
      
      // Show toast
      toast.error('Conversation permanently deleted', {
        description: 'Redirecting to conversations list...',
        duration: 2000,
      });
      
      // ✅ CRITICAL: Use replace instead of push to prevent back navigation to deleted conversation
      router.replace('/c/conversations');
      return; // Exit early to avoid updating sidebar list
    }
    
    // ✅ Update sidebar conversation list (remove deleted conversation)
    queryClient.setQueryData(['conversations', { search: sidebarSearch, status: 'active' }], (oldData) => {
      if (!oldData?.data) return oldData;
      return {
        ...oldData,
        data: oldData.data.filter((c) => String(c._id) !== deletedConvId),
      };
    });
  }, [conversationId, router, queryClient, sidebarSearch]));

  // ❌ REMOVED: scrollToBottom on messages change
  // ✅ MessageListWithInfiniteScroll handles its own scroll behavior

  const handleNewMessageSent = useCallback((result) => {
    // ✅ Handle removal of optimistic messages (for session errors in new conversations)
    if (result?.shouldRemove || result?.status === 'removed') {
      setOptimisticMessages(prev => prev.filter(m => m._id !== result._id));
      return;
    }
    
    // ✅ Handle optimistic message for instant display
    if (result?.isOptimistic) {
      setOptimisticMessages(prev => {
        const existing = prev.find(m => m._id === result._id);
        if (existing) {
          return prev.map(m => m._id === result._id ? result : m);
        }
        return [...prev, result];
      });
    scrollToBottom();
      return;
    }
    
    // ✅ Handle redirect after message is sent (response from API)
    if (result?.conversationId || result?.data?.conversationId) {
      const newConvId = result.conversationId || result.data?.conversationId;
      
        // ✅ Update conversation list cache BEFORE redirect to ensure it shows up
        // ✅ Also trigger a refetch to ensure consistency (especially after server restart)
        if (newConvId) {
          // ✅ First, try to update cache optimistically
          queryClient.setQueryData(['conversations', { search: sidebarSearch, status: 'active' }], (oldData) => {
          if (!oldData?.data) return oldData;
          
          // ✅ CRITICAL: Prioritize contactData from newConversationData (most complete)
          // newConversationData comes from /conversations/start API which has full contact info
          const contactData = newConversationData?.contact || 
                             newConversationData?.conversation?.contact || 
                             conversation?.contact || 
                             conversation?.contactData || 
                             null;
          
          // Check if conversation already exists in list
          const exists = oldData.data.some(c => String(c._id) === String(newConvId));
          if (exists) {
            // Update existing conversation
            return {
              ...oldData,
              data: oldData.data.map(c => {
                if (String(c._id) === String(newConvId)) {
                  // ✅ Use the most complete contactData available
                  const bestContactData = contactData || c.contactData || c.contact || null;
                  return {
                    ...c,
                    lastMessageAt: new Date(),
                    lastMessageContent: result.data?.lastMessageContent || conversation?.lastMessageContent || c.lastMessageContent,
                    // ✅ Ensure contactData is preserved/updated with complete info
                    contactData: bestContactData,
                    contact: bestContactData,
                  };
                }
                return c;
              }).sort((a, b) => {
                // Sort by lastMessageAt (latest first), pinned at top
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
                const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
                return bTime - aTime;
              })
            };
          }
          
          // Add new conversation to list
          const newConversation = {
            _id: newConvId,
            ...(conversation || {}),
            ...(newConversationData?.conversation || {}),
            lastMessageAt: new Date(),
            lastMessageContent: result.data?.lastMessageContent || conversation?.lastMessageContent || newConversationData?.conversation?.lastMessageContent,
            messageCount: 1,
            // ✅ CRITICAL: Use contactData from newConversationData (has full contact info)
            contactData: contactData,
            contact: contactData, // Keep for backward compatibility
          };
          
          return {
            ...oldData,
            data: [newConversation, ...oldData.data].sort((a, b) => {
              if (a.isPinned && !b.isPinned) return -1;
              if (!a.isPinned && b.isPinned) return 1;
              const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
              const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
              return bTime - aTime;
            })
          };
        });
        
        // ✅ Fallback: Refetch conversations list to ensure it's updated (especially after server restart)
        // This ensures the conversation appears in the list even if socket event doesn't arrive
        setTimeout(() => {
          queryClient.refetchQueries({ 
            queryKey: ['conversations'],
            type: 'active'
          });
        }, 500);
      }
      
      // ✅ Small delay to ensure message is displayed and cache is updated before redirect
      setTimeout(() => {
        router.replace(`/c/conversations/${newConvId}`);
      }, 200);
    }
  }, [router, scrollToBottom, conversation, queryClient, sidebarSearch]);

  const handleMessageSent = useCallback((optimisticMessage) => {
    // ✅ Handle removal of optimistic messages (for session errors)
    if (optimisticMessage?.shouldRemove || optimisticMessage?.status === 'removed') {
      setOptimisticMessages(prev => prev.filter(m => m._id !== optimisticMessage._id));
      return;
    }

    if (optimisticMessage?.isOptimistic) {
      // Add optimistic message to local state
      setOptimisticMessages(prev => {
        const existing = prev.find(m => m._id === optimisticMessage._id);
        if (existing) {
          return prev.map(m => m._id === optimisticMessage._id ? optimisticMessage : m);
        }
        return [...prev, optimisticMessage];
      });
      scrollToBottom();

      // ✅ Update conversation list cache immediately so sidebar shows pending (clock) in real-time
      const preview = optimisticMessage.content || optimisticMessage.text || '';
      const status = optimisticMessage.status || 'pending';
      const firstAtt = optimisticMessage.attachments?.[0];
      const lastMessagePreviewAttachment = firstAtt && (firstAtt.name || firstAtt.url)
        ? { name: firstAtt.name || (firstAtt.url ? firstAtt.url.split('/').pop() : 'File'), size: firstAtt.size, type: firstAtt.type || 'document' }
        : null;

      queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
        if (!oldData?.data) return oldData;
        const updated = (oldData.data || []).map((c) => {
          if (String(c._id) !== String(conversationId)) return c;
          return {
            ...c,
            lastMessageContent: preview,
            lastMessageType: optimisticMessage.type || 'text',
            lastMessageDirection: 'outbound',
            lastMessageAt: optimisticMessage.createdAt || new Date().toISOString(),
            lastMessageStatus: status,
            lastMessageId: optimisticMessage._id || optimisticMessage.tempId || null,
            lastMessagePreviewAttachment,
          };
        });
        const sorted = [...updated].sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bTime - aTime;
        });
        return { ...oldData, data: sorted };
      });
    }
  }, [scrollToBottom, conversationId, queryClient]);


  const unmergeMutation = useMutation({
    mutationFn: () => apiClient.post(`/conversations/${conversationId}/unmerge`),
    onSuccess: () => {
      queryClient.invalidateQueries(['conversation', conversationId]);
      toast.success('Conversation unmerged');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || error.message || 'Failed to unmerge');
    }
  });

  const deleteMessageMutation = useMutation({
    mutationFn: ({ messageId, deleteFor }) => 
      apiClient.delete(`/messages/${messageId}`, { data: { deleteFor } }),
    onSuccess: () => {
      queryClient.invalidateQueries(['messages', conversationId]);
      toast.success('Message deleted');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || error.message || 'Failed to delete message');
    }
  });

  const handleDeleteMessage = useCallback((messageId, deleteFor = 'me') => {
    deleteMessageMutation.mutate({ messageId, deleteFor });
  }, [deleteMessageMutation]);

  const handleForwardMessage = useCallback((message) => {
    // TODO: Implement forward modal
    toast.info('Forward feature coming soon');
  }, []);

  const handleConversationSelect = useCallback((id) => {
    router.push(`/c/conversations/${id}`);
    // ✅ Don't auto-close sidebar - let user manually close it by clicking burger button
    // This allows them to browse multiple conversations without reopening the sidebar each time
  }, [router]);

  const handleMergeConversations = (conversationIds) => {
    setSelectedConversationsForMerge(conversationIds);
    setIsMergeModalOpen(true);
  };

  const hasCachedConversation = !!conversationData?.data;
  
  // ✅ Show error ONLY for real errors (404, 403), NOT for timeout or missing contact
  // ✅ Timeout errors are suppressed and handled gracefully
  const isRealError = conversationError && (
    conversationError.code !== 'ECONNABORTED' &&
    !conversationError.message?.includes('timeout') &&
    (
      conversationError.message?.includes('not found') ||
      conversationError.message?.includes('Access denied') ||
      conversationError.message?.includes('Unauthorized') ||
      conversationError.response?.status === 404 ||
      conversationError.response?.status === 403 ||
      conversationError.response?.status === 401
    )
  );
  
  // ✅ Show beautiful error page for 404 (conversation not found)
  if (showNotFoundError || (!isNewConversation && isRealError && conversationError?.response?.status === 404)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
        <div className="max-w-md w-full">
          <div className="bg-card rounded-2xl shadow-2xl p-8 text-center border border-border animate-in fade-in-50 duration-300">
            {/* Icon */}
            <div className="mb-6 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-red-100 dark:bg-red-900/30 rounded-full blur-xl opacity-50 animate-pulse"></div>
                <div className="relative bg-red-50 dark:bg-red-900/20 rounded-full p-4">
                  <AlertCircle className="w-12 h-12 text-red-500 dark:text-red-400" strokeWidth={2} />
                </div>
              </div>
            </div>
            
            {/* Title */}
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Conversation Not Found
            </h1>
            
            {/* Description */}
            <p className="text-muted-foreground mb-6 leading-relaxed">
              The conversation you&apos;re looking for doesn&apos;t exist or may have been deleted.
            </p>
            
            {/* Redirecting indicator */}
            {redirecting && (
              <div className="mb-6 flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 dark:border-blue-400 border-t-transparent"></div>
                <span>Redirecting to conversations...</span>
              </div>
            )}
            
            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => {
                  setRedirecting(true);
                  router.push('/c/conversations');
                }}
                className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-200"
                disabled={redirecting}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {redirecting ? 'Redirecting...' : 'Back to Conversations'}
              </Button>
              {!redirecting && (
                <Button
                  onClick={() => {
                    setShowNotFoundError(false);
                    setRedirecting(false);
                    refetchConversation();
                  }}
                  variant="outline"
                  className="w-full sm:w-auto border-border hover:bg-muted/50"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
              )}
            </div>
            
            {/* Conversation ID (for debugging) */}
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-xs text-muted-foreground font-mono">
                ID: {conversationId?.slice(-8) || 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // ✅ Show error for other types (403, 401, etc.)
  if (!isNewConversation && isRealError && conversationError?.response?.status !== 404) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center max-w-md w-full px-4">
          <div className="bg-card rounded-xl shadow-lg p-6 border border-border">
            <div className="mb-4">
              <AlertCircle className="w-12 h-12 text-orange-500 dark:text-orange-400 mx-auto" />
            </div>
            <p className="text-foreground font-medium mb-2">Failed to load conversation</p>
            <p className="text-muted-foreground text-sm mb-6">
              {conversationError?.message || 'The conversation could not be loaded. Please try again.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button onClick={() => refetchConversation()} variant="default" className="w-full sm:w-auto">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
              <Button onClick={() => router.push('/c/conversations')} variant="outline" className="w-full sm:w-auto">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Conversations
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (!isNewConversation && loadingConversation && !hasCachedConversation) {
    return (
      <div className="flex items-center justify-center h-screen bg-background" role="status" aria-label="Loading conversation">
        <div className="text-center">
          <div className="animate-spin motion-reduce:animate-none rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading conversation...</p>
          <p className="text-muted-foreground text-xs mt-2">This may take a few seconds</p>
        </div>
      </div>
    );
  }

  if (!isNewConversation && !conversation && !loadingConversation) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-muted-foreground mb-4">Conversation not found</p>
          <Button onClick={() => router.push('/c/conversations')}>
            Back to Conversations
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-background overflow-hidden min-w-0 flex-grow relative" style={{ width: '100%', maxWidth: 'none', margin: 0, padding: 0 }}>
      {/* Sidebar - Conversation List */}
      <div 
        className={cn(
          "bg-card flex-shrink-0 overflow-hidden transition-all duration-300 flex flex-col",
          // ✅ Toggle visibility on all screen sizes
          isSidebarOpen 
            ? "absolute inset-y-0 left-0 z-40 w-80 translate-x-0 shadow-xl lg:relative lg:translate-x-0 lg:w-80 xl:w-96 2xl:w-[420px] lg:shadow-none" 
            : "absolute -translate-x-full w-0 lg:relative lg:translate-x-0 lg:w-0 xl:w-0 2xl:w-0"
        )}
        style={{ margin: 0, padding: 0 }}
      >
        {/* Sidebar Header */}
        <div className="p-2 sm:p-3 flex flex-col gap-2 sm:gap-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-foreground">Conversations</h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => refetchConversations()}
                disabled={isFetchingConversations}
                className="h-8 w-8 p-0 min-h-[44px] min-w-[44px]"
                aria-label="Refresh conversations"
              >
                <RefreshCw className={`h-4 w-4 ${isFetchingConversations ? 'animate-spin' : ''}`} />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8">
                    <Filter className="h-4 w-4 mr-1" />
                    Sort By
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Sort</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => {
                    // Sort by most recent - conversations are already sorted by lastMessageAt
                    refetchConversations();
                  }}>
                    Most Recent
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    // Sort by unread count - conversations are already sorted
                    refetchConversations();
                  }}>
                    Unread Count
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    // Sort by pinned - conversations are already sorted
                    refetchConversations();
                  }}>
                    Pinned First
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => {
                      // Smooth scroll to manual section
                      setTimeout(() => {
                        if (manualSectionRef.current) {
                          manualSectionRef.current.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'start',
                            inline: 'nearest'
                          });
                        }
                      }, 100);
                    }}
                  >
                    Manual Conversations
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => {
                      // Smooth scroll to auto section
                      setTimeout(() => {
                        if (autoSectionRef.current) {
                          autoSectionRef.current.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'start',
                            inline: 'nearest'
                          });
                        }
                      }, 100);
                    }}
                  >
                    Auto Conversations
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                onClick={() => setIsStartModalOpen(true)}
                disabled={!canStartConversation}
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 w-8 min-h-[44px] min-w-[44px] rounded-full p-0 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Start new conversation"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarOpen(false)}
                className="h-8 w-8 min-h-[44px] min-w-[44px] lg:hidden"
                aria-label="Close sidebar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Sidebar Search */}
          <div className="relative" role="search" aria-label="Search conversations">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" aria-hidden="true" />
            <Input
              placeholder="Search..."
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              aria-label="Search conversations"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Sidebar Conversation List */}
        <div className="flex-1 overflow-hidden">
          <ConversationList
            conversations={sortedConversations}
            manualConversations={manualConversations}
            autoConversations={autoConversations}
            isLoading={false}
            selectedId={conversationId !== 'new' ? conversationId : null}
            onSelect={handleConversationSelect}
            onRefresh={refetchConversations}
            onMerge={handleMergeConversations}
            showHeader={true}
            manualSectionRef={manualSectionRef}
            autoSectionRef={autoSectionRef}
          />
        </div>
      </div>

      {/* Main Chat Area */}
      <motion.div 
        className="flex-1 flex flex-col min-w-0 relative h-full overflow-hidden bg-card"
        role="main"
        aria-label="Conversation messages"
        animate={{ 
          marginLeft: isSidebarOpen && windowWidth < 1024 ? 320 : 0,
          paddingRight: showDetailsSidebar && windowWidth >= 768
            ? (windowWidth >= 1024 ? 400 : 350)
            : 0
        }}
        transition={{ 
          duration: 0.3, 
          ease: [0.4, 0, 0.2, 1] 
        }}
        style={{ 
          position: 'relative',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}
      >
        {/* Header */}
        <div className="bg-card flex-shrink-0 overflow-hidden">
          {/* ✅ View-Only Mode Alert */}
          {isViewOnly && !isChatDisabled && (
            <div className={cn(
              "bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800",
              showDetailsSidebar ? "px-2 sm:px-3 py-1.5 sm:py-2" : "px-4 py-2"
            )}>
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                <strong>View Only Mode:</strong> You can view conversations but cannot send messages or perform actions.
              </p>
            </div>
          )}
          <div className={cn(
            "flex items-center justify-between w-full overflow-hidden",
            showDetailsSidebar 
              ? "px-2 sm:px-3 py-2 sm:py-2.5" 
              : "px-3 sm:px-4 lg:px-6 py-3 sm:py-4"
          )}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsSidebarOpen(prev => !prev);
              }}
              className={cn(
                "flex-shrink-0 z-50 relative",
                showDetailsSidebar ? "h-8 w-8" : "h-9 w-9 sm:h-10 sm:w-10"
              )}
              type="button"
              aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <Menu className={cn(
                showDetailsSidebar ? "h-4 w-4" : "h-5 w-5"
              )} />
            </Button>

            <div 
              className={cn(
                "rounded-full flex-shrink-0 transition-colors",
                showDetailsSidebar ? "h-1.5 w-1.5" : "h-2 w-2",
                isConnected ? "bg-green-500" : "bg-red-500"
              )} 
              aria-label={isConnected ? "Connected" : "Disconnected"}
            />

            {isNewConversation ? (
              <div className="min-w-0 flex-1 overflow-hidden">
                <h2 className={cn(
                  "font-semibold truncate text-foreground",
                  showDetailsSidebar ? "text-sm" : "text-base sm:text-lg"
                )}>
                  New {conversation?.channel} Conversation
                </h2>
                <p className={cn(
                  "truncate text-muted-foreground",
                  showDetailsSidebar ? "text-xs" : "text-sm"
                )}>
                  With: {newConversationData?.contact?.name || newConversationData?.contact?.identifier}
                </p>
              </div>
            ) : conversation ? (
              // ✅ CRITICAL: Only render ConversationHeader if conversation exists
              // This prevents showing "Unknown" when conversation is still loading
              <div className="min-w-0 flex-1 overflow-hidden">
                <ConversationHeader 
                  conversation={conversation} 
                  isLoading={loadingConversation}
                  showDetailsSidebar={showDetailsSidebar}
                  isViewOnly={isViewOnly}
                  isChatDisabled={isChatDisabled}
                  onToggleDetails={() => {
                    setShowDetailsSidebar(prev => {
                      const newState = !prev;
                      // ✅ Track manual toggle
                      setSidebarManuallyClosed(!newState); // If closing, mark as manually closed
                      return newState;
                    });
                  }}
                />
              </div>
            ) : (
              // ✅ Show loading state in header while conversation is being fetched
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className={cn(
                    "rounded-full bg-muted animate-pulse flex-shrink-0",
                    showDetailsSidebar ? "w-8 h-8" : "w-10 h-10"
                  )} />
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className={cn(
                      "bg-muted rounded animate-pulse mb-2",
                      showDetailsSidebar ? "h-3 w-24" : "h-4 w-32"
                    )} />
                    <div className={cn(
                      "bg-muted rounded animate-pulse",
                      showDetailsSidebar ? "h-2.5 w-36" : "h-3 w-48"
                    )} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {!isNewConversation && conversation && conversation.isMerged && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" disabled={isViewOnly || isChatDisabled}>
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {/* Only show Unmerge option when conversation is merged */}
                  <DropdownMenuItem 
                    onClick={() => unmergeMutation.mutate()}
                    disabled={isViewOnly || isChatDisabled}
                  >
                    <Unlink className="mr-2 h-4 w-4" />
                    Unmerge Conversations
                  </DropdownMenuItem>

                  {/* Commented out other menu items - only show when merged */}
                  {/* <DropdownMenuSeparator />
                  
                  <DropdownMenuItem onClick={() => setIsMergeModalOpen(true)}>
                    <Merge className="mr-2 h-4 w-4" />
                    Merge Conversations
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem>
                    <Users className="mr-2 h-4 w-4" />
                    Assign to Agent
                  </DropdownMenuItem> */}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          </div>
        </div>

        {/* Handoff Summary Card — shown when bot handed off to human */}
        {(() => {
          try {
            const HandoffSummaryCard = require('@/components/chat/HandoffSummaryCard').default;
            return conversation?.mode === 'manual' && (conversation?.metadata?.handoffSummary || conversation?.botFailure?.failed) ? (
              <HandoffSummaryCard conversation={conversation} />
            ) : null;
          } catch (_) { return null; }
        })()}

        {/* Messages Area */}
        <div
          className="flex-1 overflow-hidden bg-background min-h-0 flex flex-col relative"
          style={{ 
            width: '100%', 
            maxWidth: 'none', 
            margin: 0, 
            padding: 0
          }}
        >
          {isNewConversation ? (
            // ✅ Show optimistic messages for new conversations instantly
            optimisticMessages.length > 0 ? (
              <>
                <MessageListWithInfiniteScroll 
                  conversationId={conversationId}
                  conversation={newConversationData?.conversation}
                  optimisticMessages={optimisticMessages}
                  onReply={(message) => {
                    // Derive sender name for WhatsApp-style reply preview
                    const senderName = message.metadata?.isBotResponse || message.sender?.role === 'bot'
                      ? 'AI Bot'
                      : message.sender?.firstName
                        ? `${message.sender.firstName} ${message.sender.lastName || ''}`.trim()
                        : message.direction === 'inbound' ? (message.contactName || 'Customer') : 'You';
                    setReplyTo({ ...message, senderName });
                  }}
                  onDelete={handleDeleteMessage}
                />
                {/* ✅ Show loading indicator when redirecting */}
                {optimisticMessages.some(m => m.status === 'pending' && m.type === 'template') && (
                  <div className="flex items-center justify-center py-4 bg-card">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Opening conversation...</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <svg className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                  <p className="mb-2 font-medium">Ready to start conversation</p>
                  <p className="text-sm">Send your first message to begin.</p>
              </div>
            </div>
            )
            ) : conversation ? (
            // ✅ CRITICAL: Only render MessageListWithInfiniteScroll if conversation exists
            // This prevents "Failed to load messages" errors when switching conversations
            <MessageListWithInfiniteScroll 
              conversationId={conversationId}
              conversation={conversation}
              optimisticMessages={optimisticMessages}
              onReply={(message) => {
                    // Derive sender name for WhatsApp-style reply preview
                    const senderName = message.metadata?.isBotResponse || message.sender?.role === 'bot'
                      ? 'AI Bot'
                      : message.sender?.firstName
                        ? `${message.sender.firstName} ${message.sender.lastName || ''}`.trim()
                        : message.direction === 'inbound' ? (message.contactName || 'Customer') : 'You';
                    setReplyTo({ ...message, senderName });
                  }}
              onDelete={handleDeleteMessage}
            />
          ) : (
            // ✅ Show loading state while conversation is being fetched
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading conversation...</p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Composer - Always visible at bottom */}
        <div className="flex-shrink-0 bg-card">
          {/* ✅ View-Only Mode Alert */}
          {isViewOnly && !isChatDisabled && (
            <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                <strong>View Only Mode:</strong> You can view conversations but cannot send messages or perform actions.
              </p>
            </div>
          )}
          {/* ✅ Call conversation: no messaging UI shown (composer renders disabled state internally) */}
          <MessageComposer 
            conversationId={conversationId}
            conversation={conversation}
            contactData={isNewConversation ? newConversationData?.contact : undefined}
            channelAccount={isNewConversation ? newConversationData?.channelAccount : undefined}
            availableAccounts={isNewConversation ? newConversationData?.availableAccounts : undefined}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onMessageSent={isNewConversation ? handleNewMessageSent : handleMessageSent}
            disabled={isViewOnly || isChatDisabled || (conversation?.channel === 'call' && !(conversation?.isMerged && conversation?.mergedConversations?.some(m => ['whatsapp', 'sms', 'email', 'facebook', 'instagram', 'webchat'].includes(m?.channel))))}
          />
        </div>
      </motion.div>

      {/* Contact Details Sidebar - Animated with Framer Motion */}
      <AnimatePresence mode="wait">
        {showDetailsSidebar && conversation && (
          <motion.div
            initial={{ width: 0, opacity: 0, x: 50, scale: 0.95 }}
            animate={{ 
              width: windowWidth >= 1024 ? 400 : (windowWidth >= 768 ? 350 : Math.max(windowWidth - 20, 300)),
              opacity: 1,
              x: 0,
              scale: 1
            }}
            exit={{ width: 0, opacity: 0, x: 50, scale: 0.95 }}
            transition={{ 
              duration: 0.4, 
              ease: [0.4, 0, 0.2, 1], // Custom easing for smooth animation
              opacity: { duration: 0.3 },
              scale: { duration: 0.35 }
            }}
            className="fixed right-0 bottom-0 bg-card overflow-hidden flex flex-col shadow-2xl border-l border-border"
            style={{
              top: 64,
              width: windowWidth >= 1024 ? 400 : (windowWidth >= 768 ? 350 : windowWidth),
              height: 'calc(100vh - 64px)',
              maxWidth: windowWidth >= 768 ? 'none' : '100%',
              zIndex: 35
            }}
          >
            {/* Sidebar Header with Close Button */}
            <div className="px-4 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold text-foreground">Contact Details</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowDetailsSidebar(false);
                  setSidebarManuallyClosed(true);
                }}
                className="h-8 w-8 p-0 flex-shrink-0 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close details"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Sidebar Content — scrollable with visible scrollbar */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="flex-1 overflow-y-auto px-2 sm:px-3 py-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-500"
              style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}
            >
              {conversation?.contact ? (
                <ContactDetailsContent 
                  contact={conversation.contact} 
                  conversation={conversation}
                  copiedField={copiedField}
                  setCopiedField={setCopiedField}
                  onWebchatLinkGenerated={(link) => {
                    // Update contact in conversation object
                    if (conversation.contact) {
                      conversation.contact.webchatLink = link;
                    }
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-64">
                  <p className="text-muted-foreground">No contact information available</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <StartConversationModal
        open={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        isViewOnly={isViewOnly}
      />

      <MergeConversationModal
        open={isMergeModalOpen}
        onClose={() => {
          setIsMergeModalOpen(false);
          setSelectedConversationsForMerge([]);
        }}
        conversationIds={selectedConversationsForMerge}
        contactId={conversation?.contact?._id || conversation?.contact}
        disabled={isViewOnly || isChatDisabled}
      />
    </div>
  );
}

export default function ConversationDetailPage({ params }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading conversation...</div>}>
      <ConversationDetailPageContent params={params} />
    </Suspense>
  );
}