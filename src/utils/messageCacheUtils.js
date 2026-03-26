// src/utils/messageCacheUtils.js
/**
 * Utility functions for updating message cache across the application
 * Ensures messages cache is updated for all conversations, not just the selected one
 */

/**
 * Update messages cache for a conversation when a new message arrives
 * This ensures messages appear when switching to that conversation
 * @param {Object} queryClient - React Query client
 * @param {string} conversationId - Conversation ID
 * @param {Object} message - New message object
 * @param {Object} conversationData - Optional conversation data (for merged/grouped conversations)
 * @returns {boolean} - True if cache was updated, false otherwise
 */
export function updateMessagesCacheForConversation(queryClient, conversationId, message, conversationData = null) {
  if (!conversationId || !message || message.type === 'reaction') {
    return false;
  }

  // ✅ Get conversation data from cache if not provided
  let convData = conversationData;
  if (!convData) {
    const cachedConversation = queryClient.getQueryData(['conversation', conversationId]);
    convData = cachedConversation?.data || cachedConversation;
  }

  // ✅ Build the primary query key based on conversation channel
  const channel = convData?.channel ?? message.channel ?? 'unknown';
  const primaryKey = ['messages-infinite', conversationId, channel];

  // ✅ Helper to add message to a cache entry
  const addMessageToCache = (queryKey) => {
    const cachedData = queryClient.getQueryData(queryKey);
    if (!cachedData?.pages) return false;

    queryClient.setQueryData(queryKey, (oldData) => {
      if (!oldData?.pages) return oldData;

      const updatedPages = [...oldData.pages];

      // Check if message already exists in any page (by _id or tempId)
      let messageExists = false;
      for (const page of updatedPages) {
        if (page?.data?.some(msg =>
          (msg._id && message._id && String(msg._id) === String(message._id)) ||
          (msg.tempId && message.tempId && String(msg.tempId) === String(message.tempId))
        )) {
          messageExists = true;
          break;
        }
      }

      if (!messageExists) {
        if (updatedPages[0]?.data) {
          updatedPages[0] = {
            ...updatedPages[0],
            data: [message, ...updatedPages[0].data]
          };
        } else {
          updatedPages[0] = {
            data: [message],
            pagination: { page: 1, limit: 50, hasMore: false }
          };
        }
      }

      return { ...oldData, pages: updatedPages };
    });
    return true;
  };

  // ✅ Try primary key first, then fallback variations
  if (addMessageToCache(primaryKey)) return true;

  // Fallback: try with message channel or 'unknown'
  const fallbackKeys = [
    ['messages-infinite', conversationId, message.channel ?? 'unknown'],
    ['messages-infinite', conversationId, 'unknown'],
  ];
  for (const key of fallbackKeys) {
    if (key.join(',') !== primaryKey.join(',') && addMessageToCache(key)) return true;
  }

  // ✅ Also update cache for the primary/parent conversation if this is from a merged conversation
  if (convData?.isMerged && convData?.mergedConversations) {
    // Message belongs to a sub-conversation — update the parent merged conversation cache
    for (const mc of convData.mergedConversations) {
      if (String(mc.conversationId) === String(conversationId)) continue; // skip self
      const mergedKey = ['messages-infinite', String(mc.conversationId), mc.channel ?? 'unknown'];
      addMessageToCache(mergedKey);
    }
  }

  return false;
}

/**
 * Invalidate messages cache for a conversation
 * Forces a refetch when the conversation is next opened
 * @param {Object} queryClient - React Query client
 * @param {string} conversationId - Conversation ID
 */
export function invalidateMessagesCacheForConversation(queryClient, conversationId) {
  if (!conversationId) return;
  
  // ✅ Invalidate all possible query keys for this conversation
  queryClient.invalidateQueries({
    queryKey: ['messages-infinite', conversationId],
    exact: false
  });
}
