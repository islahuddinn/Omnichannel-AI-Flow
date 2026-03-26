// src/app/(agent)/conversations/page.js - COMPLETE WITH ARCHIVE & REAL-TIME
'use client';

import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Search, Filter, RefreshCw, Archive, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import ConversationList from '@/components/chat/ConversationList';
import StartConversationModal from '@/components/modals/StartConversationModal';
import MergeConversationsModal from '@/components/modals/MergeConversationsModal';
import apiClient from '@/lib/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { useSocketEvent } from '@/hooks/useSocket';
import { toast } from 'sonner';
import { getNotificationSoundService } from '@/services/notification/NotificationSoundService';
import { useAIBotSettings } from '@/hooks/useAIBotSettings';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { updateMessagesCacheForConversation } from '@/utils/messageCacheUtils';

// Shared infinite query data validators
function selectInfiniteData(data) {
  if (!data || !data.pages || !Array.isArray(data.pages)) {
    return { pages: [], pageParams: [] };
  }
  if (!data.pageParams || !Array.isArray(data.pageParams)) {
    return { ...data, pageParams: data.pages.map((_, i) => i + 1) };
  }
  const validPages = data.pages.filter(page => page != null);
  const validPageParams = data.pageParams.slice(0, validPages.length);
  if (validPages.length !== data.pages.length) {
    return { ...data, pages: validPages, pageParams: validPageParams };
  }
  return data;
}

function structuralSharingInfinite(oldData, newData) {
  if (!newData || !newData.pages || !Array.isArray(newData.pages)) {
    return oldData || { pages: [], pageParams: [] };
  }
  const pageParams = Array.isArray(newData.pageParams)
    ? newData.pageParams
    : newData.pages.map((_, i) => i + 1);
  const validPages = newData.pages.filter(page => page != null);
  const validPageParams = pageParams.slice(0, validPages.length);
  if (validPages.length !== newData.pages.length ||
      validPageParams.length !== pageParams.length ||
      !Array.isArray(newData.pageParams)) {
    return { ...newData, pages: validPages, pageParams: validPageParams };
  }
  return newData;
}

export default function ConversationsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [selectedConversationsForMerge, setSelectedConversationsForMerge] = useState([]);
  const [mergeComplete, setMergeComplete] = useState(0); // Counter to trigger reset
  
  // Filters
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // recent, unread, pinned, auto, manual
  const [showArchived, setShowArchived] = useState(false); // ✅ Track if viewing archived conversations
  
  // Refs for scrolling to sections
  const manualSectionRef = useRef(null);
  const autoSectionRef = useRef(null);
  
  const [selectedConversationId, setSelectedConversationId] = useState(null);

  const debouncedSearch = useDebounce(search, 500);

  // Get AI bot settings
  const { enabled: isAIBotEnabled } = useAIBotSettings();

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

  // ✅ Fix invalid cached query data synchronously before queries initialize
  // Use useLayoutEffect to run before React Query processes the cache
  useLayoutEffect(() => {
    const fixInvalidQueryData = (queryKey) => {
      const cachedData = queryClient.getQueryData(queryKey);
      if (cachedData) {
        // Check if the structure is invalid
        const hasInvalidStructure = 
          !cachedData.pages || 
          !Array.isArray(cachedData.pages) ||
          !cachedData.pageParams ||
          !Array.isArray(cachedData.pageParams) ||
          cachedData.pages.length !== cachedData.pageParams.length;
        
        if (hasInvalidStructure) {
          console.warn('[Conversations] Invalid cached query data, resetting');
          queryClient.removeQueries({ queryKey });
        } else {
          // Filter out any null/undefined pages
          const hasInvalidPages = cachedData.pages.some(page => page == null);
          if (hasInvalidPages) {
            const validPages = cachedData.pages.filter(page => page != null);
            const validPageParams = cachedData.pageParams.slice(0, validPages.length);
            queryClient.setQueryData(queryKey, {
              ...cachedData,
              pages: validPages,
              pageParams: validPageParams,
            });
          }
        }
      }
    };

    // Fix both active and archived conversation queries
    fixInvalidQueryData(['conversations', { search: debouncedSearch, status: 'active', sortBy }]);
    fixInvalidQueryData(['conversations', { search: debouncedSearch, status: 'archived', sortBy }]);
  }, [queryClient, debouncedSearch, sortBy]);

  // Helper function to update infinite query cache
  const updateInfiniteQueryCache = useCallback((queryKey, updater) => {
    queryClient.setQueryData(queryKey, (old) => {
      if (!old || !old.pages) {
        return old;
      }
      
      const updatedPages = old.pages.map((page) => {
        const updatedData = updater(page?.data?.data || page?.data || []);
        return {
          ...page,
          data: {
            ...page.data,
            data: updatedData,
          },
        };
      });
      
      return {
        ...old,
        pages: updatedPages,
      };
    });
  }, [queryClient]);

  // ✅ Helper: Update a conversation across all query structures (infinite + regular)
  const updateConversationInAllQueries = useCallback((conversationId, updateFn) => {
    queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
      if (!oldData) return oldData;

      // Handle infinite query structure (pages array)
      if (oldData.pages && Array.isArray(oldData.pages)) {
        const updatedPages = oldData.pages.map((page) => {
          const pageData = page?.data?.data || page?.data || [];
          if (!Array.isArray(pageData)) return page;
          const updatedData = pageData.map((c) =>
            String(c._id) === String(conversationId) ? updateFn(c) : c
          );
          return { ...page, data: { ...page.data, data: updatedData } };
        });
        return { ...oldData, pages: updatedPages };
      }

      // Handle regular query structure (direct data array)
      if (oldData.data && Array.isArray(oldData.data)) {
        return {
          ...oldData,
          data: oldData.data.map((c) =>
            String(c._id) === String(conversationId) ? updateFn(c) : c
          ),
        };
      }

      return oldData;
    });
  }, [queryClient]);

  // ✅ Fetch active conversations only (no archived filter)
  const {
    data: conversationsData,
    isLoading: conversationsLoading,
    isFetchingNextPage: conversationsFetchingNextPage,
    hasNextPage: conversationsHasNextPage,
    fetchNextPage: conversationsFetchNextPage,
    refetch: refetchConversations,
  } = useInfiniteQuery({
    queryKey: ['conversations', { search: debouncedSearch, status: 'active', sortBy }],
    queryFn: async ({ pageParam = 1 }) => {
      try {
        const response = await apiClient.get('/conversations', {
          params: {
            status: 'active',
            search: debouncedSearch,
            sortBy,
            page: pageParam,
            limit: 20,
          },
        });
        if (!response || (!response.data && !response.pagination)) {
          return { data: { data: [], pagination: { page: pageParam, pages: 1, total: 0 } } };
        }
        return response;
      } catch (error) {
        console.error('[Conversations] Fetch error:', error?.message || error);
        toast.error('Failed to load conversations', { description: 'Please try refreshing the page.' });
        return { data: { data: [], pagination: { page: pageParam, pages: 1, total: 0 } } };
      }
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage) return undefined;
      const pagination = lastPage?.data?.pagination || lastPage?.pagination;
      if (!pagination) return undefined;
      const { page, pages } = pagination;
      if (typeof page !== 'number' || typeof pages !== 'number') return undefined;
      return page < pages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    placeholderData: { pages: [], pageParams: [] },
    staleTime: 0, // ✅ Always allow refetch for real-time updates
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    enabled: true,
    select: selectInfiniteData,
    structuralSharing: structuralSharingInfinite,
  });

  // ✅ Fetch archived conversations count (to show/hide Archived button)
  const { data: archivedCountData, refetch: refetchArchivedCount } = useQuery({
    queryKey: ['conversations', { status: 'archived', count: true }],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/conversations', {
          params: { status: 'archived', page: 1, limit: 1 },
        });
        return response;
      } catch (error) {
        console.error('[Conversations] Archived count error:', error?.message || error);
        return { data: { pagination: { total: 0 }, data: [] } };
      }
    },
    staleTime: 0, // ✅ Don't cache - always get fresh count for real-time updates
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
  });

  // ✅ Fetch archived conversations when viewing archived
  const {
    data: archivedConversationsData,
    isLoading: archivedLoading,
    isFetchingNextPage: archivedFetchingNextPage,
    hasNextPage: archivedHasNextPage,
    fetchNextPage: archivedFetchNextPage,
    refetch: refetchArchived,
  } = useInfiniteQuery({
    queryKey: ['conversations', { search: debouncedSearch, status: 'archived', sortBy }],
    queryFn: async ({ pageParam = 1 }) => {
      try {
        const response = await apiClient.get('/conversations', {
          params: { status: 'archived', search: debouncedSearch, sortBy, page: pageParam, limit: 20 },
        });
        if (!response || (!response.data && !response.pagination)) {
          return { data: { data: [], pagination: { page: pageParam, pages: 1, total: 0 } } };
        }
        return response;
      } catch (error) {
        console.error('[Conversations] Archived fetch error:', error?.message || error);
        toast.error('Failed to load archived conversations');
        return { data: { data: [], pagination: { page: pageParam, pages: 1, total: 0 } } };
      }
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage) return undefined;
      const pagination = lastPage?.data?.pagination || lastPage?.pagination;
      if (!pagination) return undefined;
      const { page, pages } = pagination;
      if (typeof page !== 'number' || typeof pages !== 'number') return undefined;
      return page < pages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    placeholderData: { pages: [], pageParams: [] },
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: false,
    enabled: showArchived,
    select: selectInfiniteData,
    structuralSharing: structuralSharingInfinite,
  });

  // ✅ Determine which data source to use based on showArchived
  const currentData = showArchived ? archivedConversationsData : conversationsData;
  const currentLoading = showArchived ? archivedLoading : conversationsLoading;
  const currentFetchingNextPage = showArchived ? archivedFetchingNextPage : conversationsFetchingNextPage;
  const currentHasNextPage = showArchived ? archivedHasNextPage : conversationsHasNextPage;
  const currentFetchNextPage = showArchived ? archivedFetchNextPage : conversationsFetchNextPage;
  const currentRefetch = showArchived ? refetchArchived : refetchConversations;

  // Flatten pages into a single array
  const allConversations = currentData?.pages?.flatMap((page) => page?.data?.data || page?.data || []) || [];
  
  // ✅ Show all conversations (no mode filtering)
  const filteredConversations = allConversations;

  const data = { 
    data: filteredConversations, 
    pagination: currentData?.pages && currentData.pages.length > 0
      ? currentData.pages[currentData.pages.length - 1]?.data?.pagination
      : undefined
  };
  
  // ✅ Group and sort conversations based on sortBy option
  // ✅ CRITICAL: For 'recent' and 'unread', show ALL conversations in sorted order (no grouping)
  // ✅ For 'manual' and 'auto', filter by mode (API already filtered)
  // ✅ For 'pinned', show all but sorted by pinned status
  const { manualConversations, autoConversations } = useMemo(() => {
    const conversations = data?.data || [];
        
    // ✅ If sortBy is 'manual' or 'auto', API already filtered, so just return as-is
    if (sortBy === 'manual') {
      // All conversations from API are manual
      return {
        manualConversations: conversations,
        autoConversations: []
      };
    }
    
    if (sortBy === 'auto') {
      // All conversations from API are auto
      return {
        manualConversations: [],
        autoConversations: conversations
      };
    }
    
    // ✅ For 'recent', 'unread', and 'pinned' - show conversations in sorted order
    // ✅ API already sorted them correctly, but we apply client-side sort for real-time updates
    let filteredConversations = [...conversations];
    
    // ✅ Filter conversations based on sortBy
    if (sortBy === 'unread') {
      // Filter to only conversations with unreadCount > 0
      filteredConversations = filteredConversations.filter(conv => (conv.unreadCount || 0) > 0);
    } else if (sortBy === 'pinned') {
      // Filter to only pinned conversations
      filteredConversations = filteredConversations.filter(conv => conv.isPinned === true);
    }
    
    const sortedConversations = filteredConversations.sort((a, b) => {
      switch (sortBy) {
        case 'unread':
          // Unread count descending, then pinned, then lastMessageAt
          const unreadDiff = (b.unreadCount || 0) - (a.unreadCount || 0);
          if (unreadDiff !== 0) return unreadDiff;
          // If unread count is same, pinned first
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          // Then by lastMessageAt
          const aTimeUnread = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bTimeUnread = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bTimeUnread - aTimeUnread;
          
        case 'pinned':
          // Pinned conversations sorted by lastMessageAt (most recent first)
          const aTimePinned = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bTimePinned = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bTimePinned - aTimePinned;
          
        case 'recent':
        default:
          // Most recent first: Pinned first, then by lastMessageAt
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          // Then by lastMessageAt (most recent first)
          const aTimeRecent = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bTimeRecent = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bTimeRecent - aTimeRecent;
      }
    });
    
    // ✅ For 'recent', 'unread', and 'pinned', we still group by mode for display purposes
    // ✅ But we maintain the sort order within each group
    const manual = [];
    const auto = [];
    
    sortedConversations.forEach(conv => {
        const mode = conv.mode || 'auto'; // Default to 'auto' if not specified
        if (mode === 'manual') {
          manual.push(conv);
        } else {
          auto.push(conv);
        }
      });
    
    return {
      manualConversations: manual,
      autoConversations: auto
    };
  }, [data?.data, sortBy]);
  
  // ✅ Combined sorted conversations
  // ✅ For 'recent', 'unread', and 'pinned', show all conversations in sorted order (no grouping by mode)
  // ✅ For 'manual' and 'auto', show only that mode
  const sortedConversations = useMemo(() => {
    // ✅ For 'recent', 'unread', and 'pinned', don't group - show all in sorted order
    if (sortBy === 'recent' || sortBy === 'unread' || sortBy === 'pinned') {
      // Sort all conversations globally (API already sorted, but we maintain for real-time updates)
      let allConvs = data?.data || [];
      
      // ✅ For 'unread', filter to only conversations with unreadCount > 0
      if (sortBy === 'unread') {
        allConvs = allConvs.filter(conv => (conv.unreadCount || 0) > 0);
      }
      
      // ✅ For 'pinned', filter to only pinned conversations
      if (sortBy === 'pinned') {
        allConvs = allConvs.filter(conv => conv.isPinned === true);
      }
      
      return [...allConvs].sort((a, b) => {
      switch (sortBy) {
        case 'unread':
            // Unread count descending, then pinned, then lastMessageAt
            const unreadDiff = (b.unreadCount || 0) - (a.unreadCount || 0);
            if (unreadDiff !== 0) return unreadDiff;
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            const aTimeUnread = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bTimeUnread = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return bTimeUnread - aTimeUnread;
        case 'pinned':
            // Pinned conversations sorted by lastMessageAt (most recent first)
            const aTimePinned = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bTimePinned = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return bTimePinned - aTimePinned;
        case 'recent':
        default:
            // Pinned first, then by lastMessageAt
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            const aTimeRecent = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bTimeRecent = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return bTimeRecent - aTimeRecent;
        }
      });
    }
    // ✅ For other sorts, use grouped conversations
    return [...manualConversations, ...autoConversations];
  }, [data?.data, sortBy, manualConversations, autoConversations]);

  const isLoading = currentLoading;
  const isFetchingNextPage = currentFetchingNextPage;
  const hasNextPage = currentHasNextPage;
  const fetchNextPage = currentFetchNextPage;

  const refetch = useCallback(() => {
    currentRefetch();
  }, [currentRefetch]);

  // ✅ Check if there are any archived conversations
  // ✅ apiClient.get returns response.data, so structure is: { success: true, data: [...], pagination: {...} }
  // ✅ So archivedCountData.pagination.total is the correct path
  const archivedTotal = archivedCountData?.pagination?.total ?? 
                        archivedCountData?.data?.pagination?.total ??
                        (archivedCountData?.data?.length > 0 ? archivedCountData.data.length : 0) ??
                        0;
  const hasArchivedConversations = archivedTotal > 0;
  
  // Real-time updates
  useSocketEvent('conversation:new', useCallback((data) => {
    try {
      const { conversation, message, contact } = data || {};
      if (!conversation) {
        console.warn('[Conversations] conversation:new event missing conversation data');
        return; // ✅ Don't refetch - just skip if data is invalid
      }


      // ✅ CRITICAL: Ensure contactData is set from contact object if not present
      // The API returns contactData, but socket events might send contact
      const conversationWithContactData = {
        ...conversation,
        // ✅ Ensure contactData exists (used by ConversationList component)
        contactData: conversation.contactData || conversation.contact || contact || null,
        // ✅ Also ensure contact field exists (fallback)
        contact: conversation.contact || conversation.contactData || contact || null,
        // ✅ Ensure status is set
        status: conversation.status || 'active',
      };

      // ✅ PURE SOCKET-BASED: Update ALL active conversation queries (useInfiniteQuery structure)
      const activeQueries = queryClient.getQueriesData({ 
        queryKey: ['conversations'],
        predicate: (query) => {
          const queryParams = query.queryKey[1];
          const queryStatus = queryParams?.status;
          return queryStatus === 'active' || queryStatus === undefined;
        }
      });
      
      
      activeQueries.forEach(([queryKey, queryData]) => {
        queryClient.setQueryData(queryKey, (old) => {
          if (!old?.pages) {
            // ✅ Create new cache structure if it doesn't exist
            return {
              pages: [{
                data: {
                  data: [conversationWithContactData],
                  pagination: { total: 1, page: 1, limit: 50, pages: 1 }
                }
              }],
              pageParams: [1]
            };
          }
          
          // ✅ Check if conversation already exists in any page
          const exists = old.pages.some(page => {
            const conversations = page?.data?.data || page?.data || [];
            return conversations.some(c => String(c._id) === String(conversation._id));
          });
          
          if (exists) {
            // ✅ Update existing conversation with latest data (e.g., after auto-merge updated the primary)
            const updatedPages = old.pages.map(page => {
              const conversations = page?.data?.data || page?.data || [];
              if (!Array.isArray(conversations)) return page;
              const updated = conversations.map(c =>
                String(c._id) === String(conversation._id)
                  ? { ...c, ...conversationWithContactData }
                  : c
              );
              return page?.data?.data
                ? { ...page, data: { ...page.data, data: updated } }
                : { ...page, data: { ...page.data, data: updated } };
            });
            return { ...old, pages: updatedPages };
          }
          
          // ✅ Add to first page (most recent conversations)
          const firstPage = old.pages[0];
          const conversations = firstPage?.data?.data || firstPage?.data || [];
          const updatedConversations = [conversationWithContactData, ...conversations];
          
          // ✅ Don't sort here - let useMemo handle sorting based on current sortBy
          // This ensures new conversations respect the current sort order
          const sorted = updatedConversations;
          
          // ✅ Update pagination total
          const pagination = firstPage?.data?.pagination || firstPage?.pagination;
          const newTotal = (pagination?.total || 0) + 1;
          
          
          const updatedFirstPage = firstPage.data?.data ? {
            ...firstPage,
            data: {
              ...firstPage.data,
              data: sorted,
              pagination: pagination ? { ...pagination, total: newTotal } : firstPage.data.pagination
            }
          } : {
            ...firstPage,
            data: {
              ...firstPage.data,
              data: sorted,
              pagination: pagination ? { ...pagination, total: newTotal } : firstPage.pagination
            }
          };
          
          return {
            ...old,
            pages: [updatedFirstPage, ...old.pages.slice(1)],
            pageParams: [...(old.pageParams || [])]
          };
        });
      });
      
      // ✅ NO refetch - cache update is sufficient
    } catch (error) {
      console.error('[Conversations] Error handling new conversation:', error);
      // ✅ Fallback: Refetch if cache update fails (e.g., after server restart)
      queryClient.refetchQueries({ 
        queryKey: ['conversations'],
        type: 'active'
      });
    }
  }, [queryClient]));

  useSocketEvent('conversation:update', useCallback((payload) => {
    // ✅ Optimistically update last message in cache immediately - NO API CALLS
    try {
      const { conversationId, update } = payload || {};
      if (!conversationId || !update) {
        console.warn('[Conversations] conversation:update event missing conversationId or update');
        return; // ✅ Don't refetch - just skip if data is invalid
      }

      // ✅ CRITICAL: Update all conversation queries (including infinite queries)
      // Handle both useQuery (oldData.data) and useInfiniteQuery (oldData.pages) structures
      queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
        if (!oldData) return oldData;
        
        // ✅ Handle useInfiniteQuery structure (pages array)
        if (oldData.pages && Array.isArray(oldData.pages)) {
          const updatedPages = oldData.pages.map((page) => {
            const pageData = page?.data?.data || page?.data || [];
            if (!Array.isArray(pageData)) return page;
            
            const updatedData = pageData.map((c) => {
              // ✅ Check if this conversation matches the update
              const isDirectMatch = String(c._id) === String(conversationId);
              const isGroupedMatch = c._allDepartmentConversationIds &&
                Array.isArray(c._allDepartmentConversationIds) &&
                c._allDepartmentConversationIds.some(groupedId => String(groupedId) === String(conversationId));

              if (isDirectMatch || isGroupedMatch) {
                return {
                  ...c,
                  // ✅ CRITICAL: Update contactData if provided (e.g., after merge), otherwise preserve existing
                  contactData: update.contactData || c.contactData || c.contact || null,
                  contact: update.contactData || c.contact || c.contactData || null,
                  // ✅ Update all fields from the update payload
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
                  lastMessageStatus: update.lastMessageStatus !== undefined
                    ? update.lastMessageStatus
                    : c.lastMessageStatus,
                  lastMessageId: update.lastMessageId !== undefined
                    ? update.lastMessageId
                    : c.lastMessageId,
                  unreadCount: update.unreadCount !== undefined ? update.unreadCount : c.unreadCount,
                  messageCount: update.messageCount !== undefined ? update.messageCount : c.messageCount,
                  mode: update.mode !== undefined ? update.mode : c.mode,
                  // ✅ Handle merge-related fields (when auto-merge updates the conversation)
                  isMerged: update.isMerged !== undefined ? update.isMerged : c.isMerged,
                  mergedConversations: update.mergedConversations !== undefined ? update.mergedConversations : c.mergedConversations,
                  updatedAt: update.updatedAt !== undefined
                    ? (typeof update.updatedAt === 'string' ? update.updatedAt : update.updatedAt.toISOString())
                    : new Date().toISOString(),
                };
              }
              return c;
            });
            
            // ✅ Don't sort here - let useMemo handle sorting based on current sortBy
            // This ensures real-time updates respect the current sort order
            const sorted = updatedData;
            
            return {
              ...page,
              data: {
                ...page.data,
                data: sorted
              }
            };
          });

          return {
            ...oldData,
            pages: updatedPages
          };
        }
        
        // ✅ Handle useQuery structure (direct data array)
        if (oldData.data && Array.isArray(oldData.data)) {
          const updated = oldData.data.map((c) => {
            // ✅ CRITICAL: Check if this conversation matches the update
            // For grouped conversations (company admin), check if conversationId is in _allDepartmentConversationIds
            const isDirectMatch = String(c._id) === String(conversationId);
            const isGroupedMatch = c._allDepartmentConversationIds && 
              Array.isArray(c._allDepartmentConversationIds) &&
              c._allDepartmentConversationIds.some(groupedId => String(groupedId) === String(conversationId));
            
            if (isDirectMatch || isGroupedMatch) {
              return {
                ...c,
                contactData: update.contactData || c.contactData || c.contact || null,
                contact: update.contactData || c.contact || c.contactData || null,
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
                lastMessageStatus: update.lastMessageStatus !== undefined
                  ? update.lastMessageStatus
                  : c.lastMessageStatus,
                lastMessageId: update.lastMessageId !== undefined
                  ? update.lastMessageId
                  : c.lastMessageId,
                unreadCount: update.unreadCount !== undefined ? update.unreadCount : c.unreadCount,
                messageCount: update.messageCount !== undefined ? update.messageCount : c.messageCount,
                mode: update.mode !== undefined ? update.mode : c.mode,
                isMerged: update.isMerged !== undefined ? update.isMerged : c.isMerged,
                mergedConversations: update.mergedConversations !== undefined ? update.mergedConversations : c.mergedConversations,
                updatedAt: update.updatedAt !== undefined
                  ? (typeof update.updatedAt === 'string' ? update.updatedAt : update.updatedAt.toISOString())
                  : new Date().toISOString(),
              };
            }
            return c;
          });
          
          // ✅ Don't sort here - let useMemo handle sorting based on current sortBy
          // This ensures real-time updates respect the current sort order
          return { ...oldData, data: updated };
        }
        
        return oldData;
      });
      
      // ✅ NO refetch - cache update is sufficient for real-time updates
    } catch (error) {
      console.error('[Conversations] Error handling conversation update:', error);
      // ✅ Only log error - don't refetch on every message
    }
  }, [queryClient]));

  useSocketEvent('conversation:pinned', useCallback((data) => {
    const { conversationId, pinnedAt } = data || {};
    if (!conversationId) return;
    updateConversationInAllQueries(conversationId, (c) => ({ ...c, isPinned: true, pinnedAt }));
  }, [updateConversationInAllQueries]));

  useSocketEvent('conversation:unpinned', useCallback((data) => {
    const { conversationId } = data || {};
    if (!conversationId) return;
    updateConversationInAllQueries(conversationId, (c) => ({ ...c, isPinned: false, pinnedAt: null }));
  }, [updateConversationInAllQueries]));

  useSocketEvent('conversation:starred', useCallback((data) => {
    const { conversationId } = data || {};
    if (!conversationId) return;
    updateConversationInAllQueries(conversationId, (c) => ({ ...c, isStarred: true }));
  }, [updateConversationInAllQueries]));

  useSocketEvent('conversation:unstarred', useCallback((data) => {
    const { conversationId } = data || {};
    if (!conversationId) return;
    updateConversationInAllQueries(conversationId, (c) => ({ ...c, isStarred: false }));
  }, [updateConversationInAllQueries]));

  useSocketEvent('conversation:muted', useCallback((data) => {
    const { conversationId } = data || {};
    if (!conversationId) return;
    updateConversationInAllQueries(conversationId, (c) => ({ ...c, isMuted: true }));
  }, [updateConversationInAllQueries]));

  useSocketEvent('conversation:unmuted', useCallback((data) => {
    const { conversationId } = data || {};
    if (!conversationId) return;
    updateConversationInAllQueries(conversationId, (c) => ({ ...c, isMuted: false }));
  }, [updateConversationInAllQueries]));

  useSocketEvent('conversation:snoozed', useCallback((data) => {
    const { conversationId } = data || {};
    if (!conversationId) return;
    updateConversationInAllQueries(conversationId, (c) => ({ ...c, isSnoozed: true }));
    // ✅ NO invalidateQueries - cache update is sufficient
  }, [queryClient]));

  useSocketEvent('conversation:unsnoozed', useCallback((data) => {
    const { conversationId } = data || {};
    if (!conversationId) return;
    updateConversationInAllQueries(conversationId, (c) => ({ ...c, isSnoozed: false }));
  }, [updateConversationInAllQueries]));


  useSocketEvent('conversation:archived', useCallback((data) => {
    const { conversationId, conversation } = data || {};
    if (!conversationId) {
      console.warn('[Conversations] conversation:archived event missing conversationId', data);
      return;
    }

    // ✅ PURE SOCKET-BASED: Remove from active list - Update ALL active queries
    queryClient.setQueriesData(
      { 
        queryKey: ['conversations'],
        predicate: (query) => {
          const queryParams = query.queryKey[1];
          const queryStatus = queryParams?.status;
          return queryStatus === 'active' || queryStatus === undefined;
        }
      },
      (old) => {
        if (!old?.pages) {
          return old;
        }
        
        let hasChanges = false;
        const updatedPages = old.pages.map((page) => {
          const conversations = page?.data?.data || page?.data || [];
          const beforeCount = conversations.length;
          const filteredConversations = conversations.filter(c => String(c._id) !== String(conversationId));
          const afterCount = filteredConversations.length;
          
          if (beforeCount !== afterCount) {
            hasChanges = true;
          }
          
          const pagination = page?.data?.pagination || page?.pagination;
          const newTotal = pagination?.total ? Math.max(0, pagination.total - 1) : pagination?.total;
          
          if (page.data?.data) {
            return {
              ...page,
              data: {
                ...page.data,
                data: filteredConversations,
                pagination: pagination ? { ...pagination, total: newTotal } : page.data.pagination
              }
            };
          } else if (page.data) {
            return {
              ...page,
              data: {
                ...page.data,
                data: filteredConversations,
                pagination: pagination ? { ...pagination, total: newTotal } : page.data.pagination
              }
            };
          }
          return page;
        });
        
        if (!hasChanges) {
          return old;
        }
        
        return {
          ...old,
          pages: updatedPages,
          pageParams: [...(old.pageParams || [])]
        };
      }
    );
    
    // ✅ PURE SOCKET-BASED: Add to archived list if conversation data provided
    if (conversation) {
      // Ensure conversation has correct status
      const conversationWithStatus = {
        ...conversation,
        status: 'archived'
      };
      
      // Update ALL archived queries
      queryClient.setQueriesData(
        { 
          queryKey: ['conversations'],
          predicate: (query) => {
            const queryParams = query.queryKey[1];
            const queryStatus = queryParams?.status;
            return queryStatus === 'archived';
          }
        },
        (old) => {
          // ✅ Handle case when cache doesn't exist (e.g., after page refresh)
          if (!old?.pages) {
            return {
              pages: [{
                data: {
                  data: [conversationWithStatus],
                  pagination: { total: 1, page: 1, limit: 50, pages: 1 }
                }
              }],
              pageParams: [1]
            };
          }
          
          // Check if conversation already exists
          const firstPage = old.pages[0];
          const conversations = firstPage?.data?.data || firstPage?.data || [];
          const exists = conversations.some(c => String(c._id) === String(conversationId));
          
          if (exists) {
            // Update existing conversation instead of adding duplicate
            const updatedConversations = conversations.map(c => 
              String(c._id) === String(conversationId) ? conversationWithStatus : c
            );
            
            const pagination = firstPage?.data?.pagination || firstPage?.pagination;
            const updatedFirstPage = firstPage.data?.data ? {
              ...firstPage,
              data: {
                ...firstPage.data,
                data: updatedConversations,
                pagination: pagination || firstPage.data.pagination
              }
            } : {
              ...firstPage,
              data: {
                ...firstPage.data,
                data: updatedConversations,
                pagination: pagination || firstPage.pagination
              }
            };
            
            return {
              ...old,
              pages: [updatedFirstPage, ...old.pages.slice(1)],
              pageParams: [...(old.pageParams || [])]
            };
          }
          
          // Add to beginning of first page (most recent)
          const updatedConversations = [conversationWithStatus, ...conversations];
          const pagination = firstPage?.data?.pagination || firstPage?.pagination;
          const newTotal = (pagination?.total || 0) + 1;
          
          
          const updatedFirstPage = firstPage.data?.data ? {
            ...firstPage,
            data: {
              ...firstPage.data,
              data: updatedConversations,
              pagination: pagination ? { ...pagination, total: newTotal } : firstPage.data.pagination
            }
          } : {
            ...firstPage,
            data: {
              ...firstPage.data,
              data: updatedConversations,
              pagination: pagination ? { ...pagination, total: newTotal } : firstPage.pagination
            }
          };
          
          return {
            ...old,
            pages: [updatedFirstPage, ...old.pages.slice(1)],
            pageParams: [...(old.pageParams || [])]
          };
        }
      );
    }
    
    // ✅ Update archived count - ensure it triggers re-render
    const keyArchivedCount = ['conversations', { status: 'archived', count: true }];
    queryClient.setQueryData(keyArchivedCount, (old) => {
      const currentTotal = old?.pagination?.total ?? old?.data?.pagination?.total ?? 0;
      const newTotal = currentTotal + 1;
      
      
      if (!old) {
        return {
          pagination: {
            total: newTotal,
            page: 1,
            limit: 1,
            pages: 1
          }
        };
      }
      
      if (old.pagination) {
        return {
          ...old,
          pagination: {
            ...old.pagination,
            total: newTotal
          }
        };
      } else if (old.data?.pagination) {
        return {
          ...old,
          data: {
            ...old.data,
            pagination: {
              ...old.data.pagination,
              total: newTotal
            }
          }
        };
      } else {
        return {
          ...old,
          pagination: {
            total: newTotal,
            page: 1,
            limit: 1,
            pages: 1
          }
        };
      }
    });
    
    // ✅ Force refetch archived count to ensure UI updates
    queryClient.invalidateQueries({ queryKey: ['conversations', { status: 'archived', count: true }] });
    
  }, [queryClient, refetchArchivedCount]));

  useSocketEvent('conversation:unarchived', useCallback((data) => {
    const { conversationId, conversation } = data || {};
    if (!conversationId) {
      console.warn('[Conversations] conversation:unarchived event missing conversationId', data);
      return;
    }

    // ✅ PURE SOCKET-BASED: Remove from archived list - Update ALL archived queries
    queryClient.setQueriesData(
      { 
        queryKey: ['conversations'],
        predicate: (query) => {
          const queryParams = query.queryKey[1];
          const queryStatus = queryParams?.status;
          return queryStatus === 'archived';
        }
      },
      (old) => {
        if (!old?.pages) {
          return old;
        }
        
        let hasChanges = false;
        const updatedPages = old.pages.map((page) => {
          const conversations = page?.data?.data || page?.data || [];
          const beforeCount = conversations.length;
          const filteredConversations = conversations.filter(c => String(c._id) !== String(conversationId));
          const afterCount = filteredConversations.length;
          
          if (beforeCount !== afterCount) {
            hasChanges = true;
          }
          
          const pagination = page?.data?.pagination || page?.pagination;
          const newTotal = pagination?.total ? Math.max(0, pagination.total - 1) : pagination?.total;
          
          if (page.data?.data) {
            return {
              ...page,
              data: {
                ...page.data,
                data: filteredConversations,
                pagination: pagination ? { ...pagination, total: newTotal } : page.data.pagination
              }
            };
          } else if (page.data) {
            return {
              ...page,
              data: {
                ...page.data,
                data: filteredConversations,
                pagination: pagination ? { ...pagination, total: newTotal } : page.data.pagination
              }
            };
          }
          return page;
        });
        
        if (!hasChanges) {
          return old;
        }
        
        return {
          ...old,
          pages: updatedPages,
          pageParams: [...(old.pageParams || [])]
        };
      }
    );
    
    // ✅ PURE SOCKET-BASED: Add to active list if conversation data provided
    if (conversation) {
      // Ensure conversation has correct status
      const conversationWithStatus = {
        ...conversation,
        status: 'active'
      };
      
      // Update ALL active queries
      queryClient.setQueriesData(
        { 
          queryKey: ['conversations'],
          predicate: (query) => {
            const queryParams = query.queryKey[1];
            const queryStatus = queryParams?.status;
            return queryStatus === 'active' || queryStatus === undefined;
          }
        },
        (old) => {
          // ✅ Handle case when cache doesn't exist (e.g., after page refresh)
          if (!old?.pages) {
            return {
              pages: [{
                data: {
                  data: [conversationWithStatus],
                  pagination: { total: 1, page: 1, limit: 50, pages: 1 }
                }
              }],
              pageParams: [1]
            };
          }
          
          // Check if conversation already exists
          const firstPage = old.pages[0];
          const conversations = firstPage?.data?.data || firstPage?.data || [];
          const exists = conversations.some(c => String(c._id) === String(conversationId));
          
          if (exists) {
            // Update existing conversation instead of adding duplicate
            const updatedConversations = conversations.map(c => 
              String(c._id) === String(conversationId) ? conversationWithStatus : c
            );
            
            const pagination = firstPage?.data?.pagination || firstPage?.pagination;
            const updatedFirstPage = firstPage.data?.data ? {
              ...firstPage,
              data: {
                ...firstPage.data,
                data: updatedConversations,
                pagination: pagination || firstPage.data.pagination
              }
            } : {
              ...firstPage,
              data: {
                ...firstPage.data,
                data: updatedConversations,
                pagination: pagination || firstPage.pagination
              }
            };
            
            return {
              ...old,
              pages: [updatedFirstPage, ...old.pages.slice(1)],
              pageParams: [...(old.pageParams || [])]
            };
          }
          
          // Add to beginning of first page (most recent)
          const updatedConversations = [conversationWithStatus, ...conversations];
          const pagination = firstPage?.data?.pagination || firstPage?.pagination;
          const newTotal = (pagination?.total || 0) + 1;
          
          
          const updatedFirstPage = firstPage.data?.data ? {
            ...firstPage,
            data: {
              ...firstPage.data,
              data: updatedConversations,
              pagination: pagination ? { ...pagination, total: newTotal } : firstPage.data.pagination
            }
          } : {
            ...firstPage,
            data: {
              ...firstPage.data,
              data: updatedConversations,
              pagination: pagination ? { ...pagination, total: newTotal } : firstPage.pagination
            }
          };
          
          return {
            ...old,
            pages: [updatedFirstPage, ...old.pages.slice(1)],
            pageParams: [...(old.pageParams || [])]
          };
        }
      );
    }
    
    // ✅ Update archived count - ensure it triggers re-render
    const keyArchivedCount = ['conversations', { status: 'archived', count: true }];
    queryClient.setQueryData(keyArchivedCount, (old) => {
      if (!old) {
        return {
          pagination: {
            total: 0,
            page: 1,
            limit: 1,
            pages: 1
          }
        };
      }
      
      const currentTotal = old?.pagination?.total ?? old?.data?.pagination?.total ?? 0;
      const newTotal = Math.max(0, currentTotal - 1);
      
      
      if (old.pagination) {
        return {
          ...old,
          pagination: {
            ...old.pagination,
            total: newTotal
          }
        };
      } else if (old.data?.pagination) {
        return {
          ...old,
          data: {
            ...old.data,
            pagination: {
              ...old.data.pagination,
              total: newTotal
            }
          }
        };
      }
      
      return {
        ...old,
        pagination: {
          total: newTotal,
          page: 1,
          limit: 1,
          pages: 1
        }
      };
    });
    
    // ✅ Force refetch archived count to ensure UI updates
    queryClient.invalidateQueries({ queryKey: ['conversations', { status: 'archived', count: true }] });
    
  }, [queryClient, refetchArchivedCount]));

  // ✅ Handle contact deletion - remove all conversations for deleted contact
  useSocketEvent('contact:deleted', useCallback((data) => {
    const { contactId, conversationsDeleted, messagesDeleted } = data || {};
    if (!contactId) {
      console.warn('[Conversations] contact:deleted event missing contactId');
      return;
    }


    // ✅ Remove all conversations for this contact from the cache
    queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
      if (!oldData) return oldData;
      
      // ✅ Handle useInfiniteQuery structure (pages array)
      if (oldData.pages && Array.isArray(oldData.pages)) {
        const updatedPages = oldData.pages.map((page) => {
          const pageData = page?.data?.data || page?.data || [];
          if (!Array.isArray(pageData)) return page;
          
          // Filter out conversations for the deleted contact
          const filteredData = pageData.filter((c) => {
            const contactIdFromConv = c.contactData?._id || c.contact?._id || c.contact;
            return String(contactIdFromConv) !== String(contactId);
          });
          
          // Update pagination total
          const pagination = page?.data?.pagination || page?.pagination;
          const newTotal = Math.max(0, (pagination?.total || pageData.length) - (pageData.length - filteredData.length));
          
          return {
            ...page,
            data: {
              ...page.data,
              data: filteredData,
              pagination: pagination ? { ...pagination, total: newTotal } : page.data?.pagination
            }
          };
        });
        
        return {
          ...oldData,
          pages: updatedPages
        };
      }
      
      // ✅ Handle useQuery structure (direct data array)
      if (oldData.data && Array.isArray(oldData.data)) {
        const filteredData = oldData.data.filter((c) => {
          const contactIdFromConv = c.contactData?._id || c.contact?._id || c.contact;
          return String(contactIdFromConv) !== String(contactId);
        });
        
        const newTotal = Math.max(0, (oldData.pagination?.total || oldData.data.length) - (oldData.data.length - filteredData.length));
        
        return {
          ...oldData,
          data: filteredData,
          pagination: {
            ...oldData.pagination,
            total: newTotal
          }
        };
      }
      
      return oldData;
    });
    
  }, [queryClient]));

  // ✅ Handle conversation actions socket events for real-time updates
  useSocketEvent('conversation:read', useCallback((data) => {
    updateConversationInAllQueries(data.conversationId, (c) => ({ ...c, unreadCount: 0 }));
  }, [updateConversationInAllQueries]));

  useSocketEvent('conversation:unread', useCallback((data) => {
    const keyActive = ['conversations', { search: debouncedSearch, status: 'active' }];
    const keyArchived = ['conversations', { search: debouncedSearch, status: 'archived' }];
    [keyActive, keyArchived].forEach((key) => {
      queryClient.setQueryData(key, (old) => {
        if (!old) return old;
        
        // Handle infinite query structure (pages array)
        if (old.pages) {
          return {
            ...old,
            pages: old.pages.map((page) => {
              const pageData = page?.data?.data || page?.data || [];
              const updatedData = pageData.map((c) =>
                String(c._id) === String(data.conversationId) 
                  ? { ...c, unreadCount: data.unreadCount || 1 } 
                  : c
              );
              return {
                ...page,
                data: {
                  ...page.data,
                  data: updatedData,
                },
              };
            }),
          };
        }
        
        // Handle regular query structure
        if (old.data) {
          return {
            ...old,
            data: old.data.map((c) =>
              String(c._id) === String(data.conversationId) 
                ? { ...c, unreadCount: data.unreadCount || 1 } 
                : c
            ),
          };
        }
        
        return old;
      });
    });
  }, [queryClient, debouncedSearch]));

  useSocketEvent('conversation:deleted', useCallback((data) => {
    const deletedConvId = String(data.conversationId || data._id);
    
    // ✅ CRITICAL: Clear selection if the deleted conversation is currently selected
    if (selectedConversationId && String(selectedConversationId) === deletedConvId) {
      setSelectedConversationId(null);
      // Also clear from URL if we're on the detail page
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      if (currentPath.includes('/conversations/') && currentPath !== '/c/conversations') {
        router.replace('/c/conversations');
      }
    }
    
    const keyActive = ['conversations', { search: debouncedSearch, status: 'active' }];
    const keyArchived = ['conversations', { search: debouncedSearch, status: 'archived' }];
    [keyActive, keyArchived].forEach((key) => {
      queryClient.setQueryData(key, (old) => {
        // ✅ Handle infinite query structure (pages array)
        if (old?.pages) {
          const updatedPages = old.pages.map((page) => {
            const pageData = page?.data?.data || page?.data || [];
            const filteredData = pageData.filter((c) => String(c._id) !== deletedConvId);
            return {
              ...page,
              data: {
                ...page.data,
                data: filteredData,
              },
            };
          });
          return {
            ...old,
            pages: updatedPages,
          };
        }
        
        // ✅ Handle regular query structure (direct data array)
        if (old?.data) {
          return {
            ...old,
            data: old.data.filter((c) => String(c._id) !== deletedConvId),
          };
        }
        
        return old;
      });
    });
  }, [queryClient, debouncedSearch, selectedConversationId, router]));

  // ✅ Real-time merge/unmerge events for conversations list
  useSocketEvent('conversation:merged', useCallback((data) => {
    const { primaryConversationId, mergedConversationIds, updatedPrimaryConversation } = data;
    
    
    if (!primaryConversationId || !mergedConversationIds || mergedConversationIds.length === 0) {
      console.warn('[Conversations] Invalid merge event data:', data);
      return;
    }

    // ✅ Ensure mergedConversationIds are strings for comparison
    const mergedIds = mergedConversationIds.map(id => String(id));
    const primaryId = String(primaryConversationId);

    // ✅ Helper to build merged primary from a conversations array
    const buildMergedPrimary = (conversationsArray) => {
      let primaryConv = conversationsArray.find(c => String(c._id) === primaryId);
      if (updatedPrimaryConversation) {
        let mergedChannels = updatedPrimaryConversation.mergedConversations || [];
        const mergedIdsInArray = mergedChannels.map(mc => String(mc?.conversationId || mc?._id || mc));
        const missingIds = mergedIds.filter(id => !mergedIdsInArray.includes(String(id)));
        if (missingIds.length > 0) {
          const missingChannels = missingIds.map(id => {
            const originalConv = conversationsArray.find(c => String(c._id) === id);
            return {
              conversationId: id,
              channel: originalConv?.channel || 'unknown',
              channelAccount: originalConv?.channelAccount || null
            };
          });
          mergedChannels = [...mergedChannels, ...missingChannels];
        }
        mergedChannels = mergedChannels.map(mc => ({
          conversationId: String(mc.conversationId || mc._id || mc),
          channel: mc.channel || 'unknown',
          channelAccount: mc.channelAccount || null
        }));
        primaryConv = {
          ...primaryConv,
          ...updatedPrimaryConversation,
          isMerged: true,
          mergedConversations: mergedChannels
        };
      } else if (primaryConv) {
        primaryConv = {
          ...primaryConv,
          isMerged: true,
          mergedConversations: mergedIds.map(id => {
            const originalConv = conversationsArray.find(c => String(c._id) === id);
            return {
              conversationId: String(id),
              channel: originalConv?.channel || 'unknown',
              channelAccount: originalConv?.channelAccount || null
            };
          })
        };
      }
      return primaryConv;
    };

    // ✅ Helper to update a conversations array (remove secondaries, update primary)
    const updateConversationsArray = (conversationsArray) => {
      const primaryConv = buildMergedPrimary(conversationsArray);
      return conversationsArray
        .filter(c => !mergedIds.some(id => String(c._id) === id))
        .map(c => String(c._id) === primaryId ? (primaryConv || c) : c);
    };

    // ✅ Update ALL conversation queries (supports both infinite and regular query structures)
    queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
      if (!oldData) return oldData;

      // ✅ Handle useInfiniteQuery structure (pages array)
      if (oldData.pages && Array.isArray(oldData.pages)) {
        const updatedPages = oldData.pages.map(page => {
          const pageData = page?.data?.data || page?.data || [];
          if (!Array.isArray(pageData) || pageData.length === 0) return page;
          const updated = updateConversationsArray(pageData);
          return page?.data?.data
            ? { ...page, data: { ...page.data, data: updated } }
            : { ...page, data: { ...page.data, data: updated } };
        });
        return { ...oldData, pages: updatedPages };
      }

      // ✅ Handle useQuery structure (direct data array)
      if (oldData.data && Array.isArray(oldData.data)) {
        const updated = updateConversationsArray(oldData.data);
        return {
          ...oldData,
          data: updated,
          pagination: {
            ...oldData.pagination,
            total: oldData.pagination?.total
              ? Math.max(0, oldData.pagination.total - (oldData.data.length - updated.length))
              : updated.length
          }
        };
      }

      return oldData;
    });
    
    // ✅ Cache already updated - NO refetch needed
    
    // ✅ Also update ALL conversation queries immediately (catch-all for any query keys)
    // This ensures all query keys are updated with complete mergedConversations data
    queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
      // ✅ API response structure: { success: true, data: [...], pagination: {...} }
      const conversationsArray = oldData?.data || [];
      
      if (!conversationsArray || conversationsArray.length === 0) {
        return oldData;
      }
      
      
      // ✅ Use updatedPrimaryConversation if available
      let primaryConv = conversationsArray.find(c => String(c._id) === primaryId);
      if (updatedPrimaryConversation) {
        // ✅ CRITICAL: Use mergedConversations from updatedPrimaryConversation (most accurate)
        let mergedChannels = updatedPrimaryConversation.mergedConversations || [];
        
        // ✅ Ensure all mergedConversationIds are included (fallback to cached conversations)
        const mergedIdsInArray = mergedChannels.map(mc => String(mc?.conversationId || mc?._id || mc));
        const missingIds = mergedIds.filter(id => !mergedIdsInArray.includes(String(id)));
        
        if (missingIds.length > 0) {
          // ✅ Add missing conversation IDs from cached conversations
          const missingChannels = missingIds.map(id => {
            const originalConv = conversationsArray.find(c => String(c._id) === id);
            return {
              conversationId: String(id),
              channel: originalConv?.channel || 'unknown',
              channelAccount: originalConv?.channelAccount || null
            };
          });
          mergedChannels = [...mergedChannels, ...missingChannels];
        }
        
        // ✅ Ensure all conversationIds are strings for consistency
        mergedChannels = mergedChannels.map(mc => ({
          conversationId: String(mc.conversationId || mc._id || mc),
          channel: mc.channel || 'unknown',
          channelAccount: mc.channelAccount || null
        }));
        
        primaryConv = {
          ...primaryConv,
          ...updatedPrimaryConversation,
          isMerged: true,
          mergedConversations: mergedChannels // ✅ Use complete mergedConversations array
        };
      } else if (primaryConv) {
        // ✅ Fallback: construct mergedConversations from cached conversations
        primaryConv = {
          ...primaryConv,
          isMerged: true,
          mergedConversations: mergedIds.map(id => {
            const originalConv = conversationsArray.find(c => String(c._id) === id);
            return {
              conversationId: String(id),
              channel: originalConv?.channel || 'unknown',
              channelAccount: originalConv?.channelAccount || null
            };
          })
        };
      }
      
      // ✅ Remove secondary conversations and update primary
      const beforeCount = conversationsArray.length;
      const updatedData = conversationsArray
        .filter(c => {
          const shouldRemove = mergedIds.some(id => String(c._id) === id);
          if (shouldRemove) {
          }
          return !shouldRemove;
        })
        .map(c => {
          if (String(c._id) === primaryId) {
            return primaryConv || c;
          }
          return c;
        });
      
      const removedCount = beforeCount - updatedData.length;
      
      // ✅ Return in same format: { success: true, data: [...], pagination: {...} }
      return { 
        ...oldData, 
        data: updatedData,
        pagination: {
          ...oldData.pagination,
          total: oldData.pagination?.total ? Math.max(0, oldData.pagination.total - removedCount) : updatedData.length
        }
      };
    });
    
    // ✅ Cache already updated - NO refetch needed
  }, [queryClient, debouncedSearch]));

  useSocketEvent('conversation:unmerged', useCallback(async (data) => {
    const { primaryConversationId, unmergedConversationId, unmergedConversationIds, updatedConversations } = data;
    
    
    // ✅ Handle both singular and plural (for backward compatibility)
    const unmergedIds = unmergedConversationIds || (unmergedConversationId ? [unmergedConversationId] : []);
    
    const keyActive = ['conversations', { search: debouncedSearch, status: 'active' }];
    const keyArchived = ['conversations', { search: debouncedSearch, status: 'archived' }];
    
    // ✅ If updatedConversations are provided, use them directly (they have recalculated last messages)
    // ✅ CRITICAL: Each conversation MUST have its own isolated last message - never mix them up
    if (updatedConversations && updatedConversations.length > 0) {
      
      updatedConversations.forEach((updatedConv) => {
        const convId = updatedConv._id.toString();
        
        // ✅ CRITICAL: Only use this conversation's own last message data - never mix with other conversations
        const conversationLastMessage = {
          lastMessage: updatedConv.lastMessage,
          lastMessageContent: updatedConv.lastMessageContent || '',
          lastMessageType: updatedConv.lastMessageType || 'text',
          lastMessageDirection: updatedConv.lastMessageDirection || 'inbound',
          lastMessageAt: updatedConv.lastMessageAt || updatedConv.updatedAt || new Date().toISOString(),
          messageCount: updatedConv.messageCount || 0
        };
        
        // Update cache for both active and archived lists
        [keyActive, keyArchived].forEach((key) => {
          queryClient.setQueryData(key, (old) => {
            if (!old?.data) return old;
            
            const existingIndex = old.data.findIndex(c => String(c._id) === String(convId));
            if (existingIndex !== -1) {
              // ✅ Update existing conversation - ONLY use its own last message data
              const updated = [...old.data];
              const existingConv = old.data[existingIndex];
              
              updated[existingIndex] = {
                ...existingConv, // Keep existing data first
                ...updatedConv, // Then merge updated conversation data
                // ✅ CRITICAL: Override with this conversation's own isolated last message
                // Never use last message from another conversation
                lastMessage: conversationLastMessage.lastMessage,
                lastMessageContent: conversationLastMessage.lastMessageContent,
                lastMessageType: conversationLastMessage.lastMessageType,
                lastMessageDirection: conversationLastMessage.lastMessageDirection,
                lastMessageAt: conversationLastMessage.lastMessageAt,
                messageCount: conversationLastMessage.messageCount,
                isMerged: false,
                primaryConversation: null,
                status: 'active',
                unreadCount: 0 // ✅ Messages were already read in merged view
              };
              return { ...old, data: updated };
            }

            // If conversation not in list but should be (active status), add it
            if (updatedConv.status === 'active' && (key === keyActive)) {
              return {
                ...old,
                data: [{ ...updatedConv, ...conversationLastMessage, unreadCount: 0 }, ...old.data]
              };
            }
            
            return old;
          });
        });
        
        // Also update all conversation queries - ensure isolation
        queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
          if (!oldData?.data) return oldData;
          
          const existingIndex = oldData.data.findIndex(c => String(c._id) === String(convId));
          if (existingIndex !== -1) {
            const updated = [...oldData.data];
            const existingConv = oldData.data[existingIndex];
            
            updated[existingIndex] = {
              ...existingConv, // Keep existing data first
              ...updatedConv, // Then merge updated conversation data
              // ✅ CRITICAL: Only use this conversation's own last message - never mix
              lastMessage: conversationLastMessage.lastMessage,
              lastMessageContent: conversationLastMessage.lastMessageContent,
              lastMessageType: conversationLastMessage.lastMessageType,
              lastMessageDirection: conversationLastMessage.lastMessageDirection,
              lastMessageAt: conversationLastMessage.lastMessageAt,
              messageCount: conversationLastMessage.messageCount,
              isMerged: false,
              primaryConversation: null,
              status: 'active',
              unreadCount: 0 // ✅ Messages were already read in merged view
            };
            return { ...oldData, data: updated };
          }

          if (updatedConv.status === 'active') {
            return {
              ...oldData,
              data: [{ ...updatedConv, ...conversationLastMessage, unreadCount: 0 }, ...oldData.data]
            };
          }
          
          return oldData;
        });
      });
    }
    
    // ✅ Update primary conversation status and add unmerged conversations immediately
    [keyActive, keyArchived].forEach((key) => {
      queryClient.setQueryData(key, (old) => {
        if (!old?.data) return old;
        
        let updatedData = old.data.map((c) => {
          // Update primary conversation
          if (String(c._id) === String(primaryConversationId)) {
            const updatedMerged = (c.mergedConversations || []).filter(
              m => !unmergedIds.some(id => String(m.conversationId) === String(id))
            );
            return {
              ...c,
              isMerged: updatedMerged.length > 0,
              mergedConversations: updatedMerged,
              status: 'active', // ✅ Ensure primary is set to active after unmerge
              unreadCount: 0 // ✅ Messages were already read in merged view
            };
          }
          return c;
        });

        // ✅ CRITICAL: Add unmerged conversations to the list if they're not already there
        // Use updatedConversations if available (they have correct last messages)
        if (updatedConversations && updatedConversations.length > 0) {
          updatedConversations.forEach((updatedConv) => {
            const convId = updatedConv._id.toString();
            const isPrimary = String(convId) === String(primaryConversationId);
            const isUnmerged = unmergedIds.some(id => String(id) === String(convId));

            // ✅ Add unmerged conversations (not primary) to the list
            if (isUnmerged && !isPrimary) {
              const exists = updatedData.some(c => String(c._id) === String(convId));
              if (!exists && updatedConv.status === 'active') {
                // ✅ Add with proper last message data
                const conversationLastMessage = {
                  lastMessage: updatedConv.lastMessage,
                  lastMessageContent: updatedConv.lastMessageContent || '',
                  lastMessageType: updatedConv.lastMessageType || 'text',
                  lastMessageDirection: updatedConv.lastMessageDirection || 'inbound',
                  lastMessageAt: updatedConv.lastMessageAt || updatedConv.updatedAt || new Date().toISOString(),
                  messageCount: updatedConv.messageCount || 0
                };

                updatedData = [{ ...updatedConv, ...conversationLastMessage, isMerged: false, primaryConversation: null, status: 'active', unreadCount: 0 }, ...updatedData];
              }
            }
          });
        } else {
          // ✅ Fallback: If updatedConversations not available, still try to add unmerged conversations
          // But we'll fetch them below
        }
        
        return { ...old, data: updatedData };
      });
    });
    
    // ✅ Also update all conversation queries immediately (catch-all)
    queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
      if (!oldData?.data) return oldData;
      
      let updatedData = oldData.data.map((c) => {
        // Update primary conversation
        if (String(c._id) === String(primaryConversationId)) {
          const updatedMerged = (c.mergedConversations || []).filter(
            m => !unmergedIds.some(id => String(m.conversationId) === String(id))
          );
          return {
            ...c,
            isMerged: updatedMerged.length > 0,
            mergedConversations: updatedMerged,
            status: 'active',
            unreadCount: 0 // ✅ Messages were already read in merged view
          };
        }
        return c;
      });

      // ✅ Add unmerged conversations if available
      if (updatedConversations && updatedConversations.length > 0) {
        updatedConversations.forEach((updatedConv) => {
          const convId = updatedConv._id.toString();
          const isPrimary = String(convId) === String(primaryConversationId);
          const isUnmerged = unmergedIds.some(id => String(id) === String(convId));

          if (isUnmerged && !isPrimary) {
            const exists = updatedData.some(c => String(c._id) === String(convId));
            if (!exists && updatedConv.status === 'active') {
              const conversationLastMessage = {
                lastMessage: updatedConv.lastMessage,
                lastMessageContent: updatedConv.lastMessageContent || '',
                lastMessageType: updatedConv.lastMessageType || 'text',
                lastMessageDirection: updatedConv.lastMessageDirection || 'inbound',
                lastMessageAt: updatedConv.lastMessageAt || updatedConv.updatedAt || new Date().toISOString(),
                messageCount: updatedConv.messageCount || 0
              };

              updatedData = [{ ...updatedConv, ...conversationLastMessage, isMerged: false, primaryConversation: null, status: 'active', unreadCount: 0 }, ...updatedData];
            }
          }
        });
      }
      
      return { ...oldData, data: updatedData };
    });
    
    // ✅ Fetch unmerged conversations that aren't in the list (fallback if updatedConversations not provided)
    if (!updatedConversations || updatedConversations.length === 0) {
      try {
        const missingConversations = [];
        for (const convId of unmergedIds) {
          const existingInActive = queryClient.getQueryData(keyActive)?.data?.some(c => String(c._id) === String(convId));
          const existingInArchived = queryClient.getQueryData(keyArchived)?.data?.some(c => String(c._id) === String(convId));
          
          if (!existingInActive && !existingInArchived) {
            try {
              const response = await apiClient.get(`/conversations/${convId}`);
              if (response?.data) {
                missingConversations.push(response.data);
              }
            } catch (error) {
              console.error(`❌ Failed to fetch conversation ${convId}:`, error);
            }
          }
        }
        
        if (missingConversations.length > 0) {
          
          queryClient.setQueryData(keyActive, (old) => {
            if (!old?.data) {
              return {
                data: missingConversations.filter(c => c.status === 'active'),
                pagination: old?.pagination || {}
              };
            }
          
            const newConversations = missingConversations.filter(c => 
              c.status === 'active' && !old.data.some(existing => String(existing._id) === String(c._id))
            );
          
            return {
              ...old,
              data: [...newConversations, ...old.data]
            };
          });
          
          // ✅ Also update catch-all
          queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
            if (!oldData?.data) return oldData;
            
            const newConversations = missingConversations.filter(c => 
              c.status === 'active' && !oldData.data.some(existing => String(existing._id) === String(c._id))
            );
            
            return {
              ...oldData,
              data: [...newConversations, ...oldData.data]
            };
          });
        }
      } catch (error) {
        console.error('[Conversations] Error fetching unmerged conversations:', error);
      }
    }
    
    // ✅ Cache already updated - NO refetch needed
  }, [queryClient, debouncedSearch]));

  useSocketEvent('message:new', useCallback((payload) => {
    // ✅ Update conversation list via cache - NO API CALLS
    try {
      // ✅ CRITICAL: Extract conversationId from top-level or message object (for backward compatibility)
      const conversationId = payload?.conversationId || payload?.message?.conversationId;
      const message = payload?.message;
      
      if (!conversationId || !message) {
        console.warn('[Conversations] message:new event missing conversationId or message', {
          hasPayload: !!payload,
          hasTopLevelConversationId: !!payload?.conversationId,
          hasMessageConversationId: !!payload?.message?.conversationId,
          hasMessage: !!message,
          payloadKeys: payload ? Object.keys(payload) : []
        });
        return; // ✅ Don't refetch - just skip if data is invalid
      }

      const preview = message.content || message.text || '[message]';
      const isInbound = message.direction === 'inbound';
      const firstAtt = message.attachments?.[0];
      const lastMessagePreviewAttachment = firstAtt && (firstAtt.name || firstAtt.url)
        ? { name: firstAtt.name || (firstAtt.url ? firstAtt.url.split('/').pop() : 'File'), size: firstAtt.size, type: firstAtt.type || 'document' }
        : null;

      const update = {
        lastMessageAt: message.createdAt || new Date().toISOString(),
        lastMessageContent: preview,
        lastMessageType: message.type || 'text',
        lastMessageDirection: message.direction || 'inbound',
        lastMessageStatus: message.status ?? (message.direction === 'outbound' ? 'pending' : null),
        lastMessageId: message._id || null,
        lastMessagePreviewAttachment,
      };
      const keyActive = ['conversations', { search: debouncedSearch, status: 'active' }];
      const keyArchived = ['conversations', { search: debouncedSearch, status: 'archived' }];
      
      // Get conversation from cache to check mode
      let conversation = null;
      [keyActive, keyArchived].forEach((key) => {
        const cachedData = queryClient.getQueryData(key);
        if (cachedData?.data) {
          const found = cachedData.data.find(c => c._id === conversationId);
          if (found) conversation = found;
        }
      });
      
      // ✅ CRITICAL: Update messages cache for this conversation
      // This ensures messages appear when switching to that conversation
      updateMessagesCacheForConversation(queryClient, conversationId, message, conversation);
      
      [keyActive, keyArchived].forEach((key) => {
        queryClient.setQueryData(key, (old) => {
          if (!old?.data) return old;
          const updated = old.data.map((c) => {
            if (c._id === conversationId) {
              return {
                ...c,
                // ✅ CRITICAL: Preserve contactData and contact fields to prevent "Unknown" display
                contactData: c.contactData || c.contact || null,
                contact: c.contact || c.contactData || null,
                ...update,
                // ✅ Increment unread count only for inbound messages
                // ✅ NEW: Don't increment unread count if AI bot is enabled and conversation is in auto mode
                unreadCount: (() => {
                  const conversationMode = update.mode || c.mode || message.conversationMode || 'auto';
                  const isAutoMode = conversationMode === 'auto';
                  const shouldIncrementUnread = 
                    isInbound && 
                    message.type !== 'reaction' &&
                    !(isAIBotEnabled && isAutoMode); // Skip if AI bot enabled and auto mode
                  return shouldIncrementUnread 
                    ? (c.unreadCount || 0) + 1 
                    : (c.unreadCount || 0);
                })()
              };
            }
            return c;
          });
          
          // ✅ Don't sort here - let useMemo handle sorting based on current sortBy
          // This ensures real-time updates respect the current sort order
          return { ...old, data: updated };
        });
      });
      
      // ✅ Play notification sound for manual mode conversations (inbound messages only)
      if (message.direction === 'inbound' && message.type !== 'reaction') {
        // Get conversation mode from message payload or cache
        const conversationMode = 
          message.conversationMode || 
          conversation?.mode || 
          update.mode;
        
        const isManualMode = conversationMode === 'manual';
        
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
            // Play notification bell for incoming messages (no current conversation selected)
            soundService.playNotificationSound(
              isManualMode,
              true, // isInbound
              null, // no current conversation ID (on list page)
              conversationId, // message conversation ID
              isAIBotEnabled // pass AI bot enabled status
            );
          }
        }
      }
    } catch (error) {
      console.error('[Conversations] Error handling message:new:', error);
      // ✅ Only log error - don't refetch on every message
    }
    // ✅ NO refetch - cache update is sufficient for real-time updates
  }, [queryClient, debouncedSearch]));

  // ✅ Handle message:status events to update status ticks in conversation list in real-time
  useSocketEvent('message:status', useCallback((data) => {
    try {
      const { messageId, conversationId: msgConvId, status } = data || {};
      if (!msgConvId || !status) return;

      const statusOrder = { pending: 0, sending: 1, sent: 2, delivered: 3, read: 4, failed: -1 };

      const keyActive = ['conversations', { search: debouncedSearch, status: 'active' }];
      const keyArchived = ['conversations', { search: debouncedSearch, status: 'archived' }];

      [keyActive, keyArchived].forEach((key) => {
        queryClient.setQueryData(key, (old) => {
          if (!old?.data) return old;
          let changed = false;
          const updated = old.data.map((c) => {
            if (c._id === msgConvId) {
              // Only update if this status is for the last message
              const isLastMessage = !c.lastMessageId || c.lastMessageId === messageId;
              if (!isLastMessage) return c;

              // Only progress status forward (never go backward)
              const currentOrder = statusOrder[c.lastMessageStatus] ?? -2;
              const newOrder = statusOrder[status] ?? -2;
              if (newOrder <= currentOrder && status !== 'failed') return c;

              changed = true;
              return { ...c, lastMessageStatus: status };
            }
            return c;
          });
          return changed ? { ...old, data: updated } : old;
        });
      });
    } catch (error) {
      // Silent fail - status icon will catch up on next message
    }
  }, [queryClient, debouncedSearch]));

  const handleSelectConversation = useCallback((conversationId) => {
    setSelectedConversationId(conversationId);
    router.push(`/c/conversations/${conversationId}`);
  }, [router]);

  // ✅ Select conversation after reload if it was stored in sessionStorage
  useEffect(() => {
    const storedConversationId = sessionStorage.getItem('newConversationId');
    if (storedConversationId) {
      // Clear the stored ID
      sessionStorage.removeItem('newConversationId');
      setSelectedConversationId(storedConversationId);
      router.push(`/c/conversations/${storedConversationId}`);
    }
  }, [router]);

  const handleMergeConversations = (conversationIds) => {
    setSelectedConversationsForMerge(conversationIds);
    setIsMergeModalOpen(true);
  };

  const handleRefresh = () => {
    refetch();
    toast.success('Conversations refreshed');
  };

  // Helper function to get sort display text
  const getSortDisplayText = (sortValue) => {
    switch (sortValue) {
      case 'recent':
        return 'Newest';
      case 'unread':
        return 'Unread Count';
      case 'pinned':
        return 'Pinned First';
      default:
        return 'Newest';
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background overflow-hidden">
      {/* Sidebar - Conversation List */}
      <div className="w-full lg:w-80 xl:w-96 2xl:w-[420px] bg-background flex flex-col flex-shrink-0 overflow-hidden">
        {/* Header */}
        <div className="p-4 flex-shrink-0 space-y-3">
          {showArchived ? (
            // ✅ Archived View Header
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowArchived(false);
                  // Refetch active conversations when going back to ensure we see unarchived conversations
                  refetchConversations();
                }}
                className="h-8 w-8 min-h-[44px] min-w-[44px]"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-bold text-foreground">Archived</h1>
            </div>
          ) : (
            // ✅ Normal View Header
            <>
          <div className="flex items-center justify-between gap-2 min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">Conversations</h1>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefresh}
                disabled={isLoading}
                className="h-8 w-8 p-0 min-h-[44px] min-w-[44px]"
                aria-label="Refresh conversations"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8" aria-label="Sort conversations">
                    <Filter className="h-4 w-4 mr-1" />
                    Sort By
                    {sortBy !== 'recent' && (
                      <span className="ml-1 text-xs text-primary">
                        ({sortBy === 'unread' ? 'Unread' : sortBy === 'pinned' ? 'Pinned' : sortBy === 'manual' ? 'Manual' : sortBy === 'auto' ? 'Auto' : ''})
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuItem 
                    onClick={() => setSortBy('recent')}
                    className={sortBy === 'recent' ? 'bg-primary/10' : ''}
                  >
                    <span className={cn('mr-2', sortBy === 'recent' && 'text-primary')}>
                      {sortBy === 'recent' ? '✓' : ''}
                    </span>
                    Most Recent
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setSortBy('unread')}
                    className={sortBy === 'unread' ? 'bg-primary/10' : ''}
                  >
                    <span className={cn('mr-2', sortBy === 'unread' && 'text-primary')}>
                      {sortBy === 'unread' ? '✓' : ''}
                    </span>
                    Unread Count
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setSortBy('pinned')}
                    className={sortBy === 'pinned' ? 'bg-primary/10' : ''}
                  >
                    <span className={cn('mr-2', sortBy === 'pinned' && 'text-primary')}>
                      {sortBy === 'pinned' ? '✓' : ''}
                    </span>
                    Pinned First
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => {
                      setSortBy('manual');
                      requestAnimationFrame(() => {
                        manualSectionRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                          inline: 'nearest'
                        });
                      });
                    }}
                    className={sortBy === 'manual' ? 'bg-primary/10' : ''}
                  >
                    <span className={cn('mr-2', sortBy === 'manual' && 'text-primary')}>
                      {sortBy === 'manual' ? '✓' : ''}
                    </span>
                    Manual Conversations
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => {
                      setSortBy('auto');
                      requestAnimationFrame(() => {
                        autoSectionRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                          inline: 'nearest'
                        });
                      });
                    }}
                    className={sortBy === 'auto' ? 'bg-primary/10' : ''}
                  >
                    <span className={cn('mr-2', sortBy === 'auto' && 'text-primary')}>
                      {sortBy === 'auto' ? '✓' : ''}
                    </span>
                    Auto Conversations
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="sm" 
                    onClick={() => setIsStartModalOpen(true)}
                    disabled={!canStartConversation}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 w-8 min-h-[44px] min-w-[44px] rounded-full p-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Start new conversation"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Start New Conversation</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
            </>
          )}

          {/* ✅ Archived Button - Only show when there are archived conversations and not viewing archived */}
          {!showArchived && hasArchivedConversations && (
            <Button
              variant="ghost"
              onClick={() => setShowArchived(true)}
              className="w-full justify-start text-foreground hover:bg-muted h-9"
            >
              <Archive className="h-4 w-4 mr-2" />
                Archived
            </Button>
          )}

          {/* ✅ Info message when viewing archived */}
          {showArchived && (
            <p className="text-xs text-muted-foreground px-2">
              These chats stay archived when new messages are received. To change this experience, go to Settings.
            </p>
          )}

          {/* Search */}
          <div className="relative" role="search" aria-label="Search conversations">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              aria-label="Search conversations"
              autoComplete="off"
            />
          </div>

          {/* ✅ View-Only Mode Alert */}
          {isViewOnly && !isChatDisabled && (
            <div className="mx-2 mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                <strong>View Only Mode:</strong> You can view conversations but cannot send messages or perform actions.
              </p>
            </div>
          )}
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-hidden" aria-live="polite" aria-label="Conversation list">
          <ConversationList
            conversations={sortedConversations}
            // ✅ For 'recent', 'unread', and 'pinned', don't group - show all in sorted order
            // ✅ For other sorts, show grouped by mode
            manualConversations={sortBy === 'recent' || sortBy === 'unread' || sortBy === 'pinned' ? [] : manualConversations}
            autoConversations={sortBy === 'recent' || sortBy === 'unread' || sortBy === 'pinned' ? [] : autoConversations}
            isLoading={isLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            onLoadMore={fetchNextPage}
            onRefresh={refetch}
            selectedId={selectedConversationId}
            onSelect={handleSelectConversation}
            onMerge={handleMergeConversations}
            onMergeComplete={mergeComplete}
            manualSectionRef={manualSectionRef}
            autoSectionRef={autoSectionRef}
            isViewOnly={isViewOnly}
            sortBy={sortBy} // ✅ Pass sortBy to show appropriate empty state
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-muted-foreground bg-muted p-8">
        <div className="text-center max-w-md">
            <>
              <Search className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                No conversation selected
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Select a conversation from the list to start messaging
              </p>
              <Button 
                onClick={() => setIsStartModalOpen(true)}
                disabled={!canStartConversation}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4 mr-2" />
                Start New Conversation
              </Button>
            </>
        </div>
      </div>

      {/* Modals */}
      <StartConversationModal
        open={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        isViewOnly={isViewOnly}
      />

      <MergeConversationsModal
        open={isMergeModalOpen}
        onClose={() => {
          setIsMergeModalOpen(false);
          setSelectedConversationsForMerge([]);
          // ✅ Reset selection mode via callback
          setMergeComplete(prev => prev + 1);
        }}
        conversationIds={selectedConversationsForMerge}
        disabled={isViewOnly || isChatDisabled}
        onSuccess={() => {
          // ✅ CRITICAL: Trigger immediate refetch to ensure list updates in real-time
          // Socket events will also update, but immediate refetch ensures consistency
          
          // ✅ Reset state immediately
          setIsMergeModalOpen(false);
          setSelectedConversationsForMerge([]);
          setMergeComplete(prev => prev + 1); // ✅ Trigger selection reset in ConversationList
          
          // ✅ NO refetch - socket events and cache updates will handle UI updates
        }}
      />
    </div>
  );
}