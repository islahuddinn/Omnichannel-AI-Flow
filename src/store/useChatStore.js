



import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

const useChatStore = create(
  devtools(
    (set, get) => ({
      // Conversations
      conversations: [],
      conversationMap: {}, // conversationId -> conversation
      filteredConversations: [],
      selectedConversationId: null,
      archivedConversations: [],
      
      // Messages
      messages: {}, // conversationId -> [messages]
      messagesLoading: {},
      messagesMap: {}, // messageId -> message
      
      // UI State
      typingUsers: {}, // conversationId -> [userIds]
      presenceMap: {}, // userId -> { status, lastSeen }
      reactionUpdates: {}, // messageId -> [reactions]
      unreadCounts: {}, // conversationId -> unreadCount
      
      // Filters & Search
      searchQuery: '',
      filterStatus: 'active', // active, archived, all
      filterMode: 'all', // all, manual, auto
      sortBy: 'recent', // recent, unread, pinned
      
      // Actions
      setConversations: (conversations) => {
        const map = {};
        const archived = [];
        const active = [];
        
        conversations.forEach(conv => {
          map[conv._id] = conv;
          if (conv.isArchived) {
            archived.push(conv);
          } else {
            active.push(conv);
          }
        });
        
        set({
          conversations: active,
          archivedConversations: archived,
          conversationMap: map,
        });
      },
      
      updateConversation: (conversationId, updates) => {
        set((state) => {
          const conversation = state.conversationMap[conversationId];
          if (!conversation) return state;
          
          const updated = { ...conversation, ...updates };
          
          return {
            conversationMap: {
              ...state.conversationMap,
              [conversationId]: updated,
            },
            conversations: state.conversations.map(c =>
              c._id === conversationId ? updated : c
            ),
            archivedConversations: state.archivedConversations.map(c =>
              c._id === conversationId ? updated : c
            ),
          };
        });
      },
      
      addConversation: (conversation) => {
        set((state) => {
          if (state.conversationMap[conversation._id]) {
            return state; // Already exists
          }

          const targetList = conversation.isArchived ? 'archivedConversations' : 'conversations';

          return {
            conversationMap: {
              ...state.conversationMap,
              [conversation._id]: conversation,
            },
            [targetList]: [conversation, ...state[targetList]],
          };
        });
      },
      
      archiveConversation: (conversationId) => {
        set((state) => {
          const conversation = state.conversationMap[conversationId];
          if (!conversation) return state;
          
          const archived = { ...conversation, isArchived: true };
          
          return {
            conversationMap: {
              ...state.conversationMap,
              [conversationId]: archived,
            },
            conversations: state.conversations.filter(c => c._id !== conversationId),
            archivedConversations: [...state.archivedConversations, archived],
          };
        });
      },
      
      unarchiveConversation: (conversationId) => {
        set((state) => {
          const conversation = state.conversationMap[conversationId];
          if (!conversation) return state;
          
          const unarchived = { ...conversation, isArchived: false };
          
          return {
            conversationMap: {
              ...state.conversationMap,
              [conversationId]: unarchived,
            },
            conversations: [unarchived, ...state.conversations],
            archivedConversations: state.archivedConversations.filter(
              c => c._id !== conversationId
            ),
          };
        });
      },
      
      pinConversation: (conversationId) => {
        get().updateConversation(conversationId, { isPinned: true });
      },
      
      unpinConversation: (conversationId) => {
        get().updateConversation(conversationId, { isPinned: false });
      },
      
      // Messages
      setMessages: (conversationId, messages) => {
        const map = {};
        messages.forEach(msg => {
          map[msg._id] = msg;
        });
        
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: messages,
          },
          messagesMap: {
            ...state.messagesMap,
            ...map,
          },
        }));
      },
      
      addMessage: (conversationId, message) => {
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: [...(state.messages[conversationId] || []), message],
          },
          messagesMap: {
            ...state.messagesMap,
            [message._id]: message,
          },
        }));
      },
      
      updateMessage: (conversationId, messageId, updates) => {
        set((state) => {
          const message = state.messagesMap[messageId];
          if (!message) return state;
          
          const updated = { ...message, ...updates };
          
          return {
            messages: {
              ...state.messages,
              [conversationId]: (state.messages[conversationId] || []).map(m =>
                m._id === messageId ? updated : m
              ),
            },
            messagesMap: {
              ...state.messagesMap,
              [messageId]: updated,
            },
          };
        });
      },
      
      updateMessageStatus: (messageId, status, metadata = {}) => {
        set((state) => {
          const message = state.messagesMap[messageId];
          if (!message) return state;

          const updated = {
            ...message,
            status,
            metadata: {
              ...message.metadata,
              ...metadata,
            },
          };

          // Use message's conversation field for direct lookup instead of scanning all
          const convId = message.conversation?.toString?.() || message.conversation;
          let updatedMessages = state.messages;

          if (convId && state.messages[convId]) {
            updatedMessages = {
              ...state.messages,
              [convId]: state.messages[convId].map(m =>
                m._id === messageId ? updated : m
              ),
            };
          } else {
            // Fallback: scan all conversations (should rarely happen)
            updatedMessages = { ...state.messages };
            for (const cid in updatedMessages) {
              const msgs = updatedMessages[cid];
              if (msgs.some(m => m._id === messageId)) {
                updatedMessages[cid] = msgs.map(m =>
                  m._id === messageId ? updated : m
                );
                break;
              }
            }
          }

          return {
            messages: updatedMessages,
            messagesMap: {
              ...state.messagesMap,
              [messageId]: updated,
            },
          };
        });
      },
      
      setMessagesLoading: (conversationId, loading) => {
        set((state) => ({
          messagesLoading: {
            ...state.messagesLoading,
            [conversationId]: loading,
          },
        }));
      },
      
      // Merge State
      setMergedConversations: (conversationId, mergedIds) => {
        set((state) => ({
          mergedConversationMap: {
            ...state.mergedConversationMap,
            [conversationId]: mergedIds,
          },
        }));
      },
      
      // Typing & Presence
      addTypingUser: (conversationId, userId) => {
        set((state) => ({
          typingUsers: {
            ...state.typingUsers,
            [conversationId]: [
              ...(state.typingUsers[conversationId] || []).filter(id => id !== userId),
              userId,
            ],
          },
        }));
      },
      
      removeTypingUser: (conversationId, userId) => {
        set((state) => ({
          typingUsers: {
            ...state.typingUsers,
            [conversationId]: (state.typingUsers[conversationId] || []).filter(
              id => id !== userId
            ),
          },
        }));
      },
      
      setPresence: (userId, status, lastSeen) => {
        set((state) => ({
          presenceMap: {
            ...state.presenceMap,
            [userId]: { status, lastSeen: lastSeen || new Date() },
          },
        }));
      },
      
      // Reactions
      addReaction: (messageId, reaction) => {
        set((state) => ({
          reactionUpdates: {
            ...state.reactionUpdates,
            [messageId]: [...(state.reactionUpdates[messageId] || []), reaction],
          },
        }));
      },
      
      removeReaction: (messageId, emoji) => {
        set((state) => ({
          reactionUpdates: {
            ...state.reactionUpdates,
            [messageId]: (state.reactionUpdates[messageId] || []).filter(
              r => r.emoji !== emoji
            ),
          },
        }));
      },
      
      // Unread counts
      setUnreadCount: (conversationId, count) => {
        set((state) => ({
          unreadCounts: {
            ...state.unreadCounts,
            [conversationId]: count,
          },
        }));
      },
      
      incrementUnreadCount: (conversationId) => {
        set((state) => ({
          unreadCounts: {
            ...state.unreadCounts,
            [conversationId]: (state.unreadCounts[conversationId] || 0) + 1,
          },
        }));
      },
      
      resetUnreadCount: (conversationId) => {
        set((state) => ({
          unreadCounts: {
            ...state.unreadCounts,
            [conversationId]: 0,
          },
        }));
      },
      
      // Filters
      setSearchQuery: (query) => set({ searchQuery: query }),
      setFilterStatus: (status) => set({ filterStatus: status }),
      setFilterMode: (mode) => set({ filterMode: mode }),
      setSortBy: (sortBy) => set({ sortBy }),
      
      // Selection
      setSelectedConversationId: (conversationId) =>
        set({ selectedConversationId: conversationId }),
      
      // Clear
      clear: () => set({
        conversations: [],
        conversationMap: {},
        filteredConversations: [],
        selectedConversationId: null,
        archivedConversations: [],
        messages: {},
        messagesLoading: {},
        messagesMap: {},
        mergedConversationMap: {},
        typingUsers: {},
        presenceMap: {},
        reactionUpdates: {},
        unreadCounts: {},
        searchQuery: '',
        filterStatus: 'active',
        filterMode: 'all',
        sortBy: 'recent',
      }),
    }),
    { name: 'ChatStore' }
  )
);

export default useChatStore;