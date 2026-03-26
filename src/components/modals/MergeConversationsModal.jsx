// src/components/modals/MergeConversationsModal.jsx
'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Merge, AlertCircle, Mail, Phone, MessageSquare, Globe, Unlink } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function MergeConversationsModal({ 
  open, 
  onClose, 
  conversationIds = [],
  onSuccess,
  isUnmerge = false // ✅ Support both merge and unmerge
}) {
  const queryClient = useQueryClient();

  // ✅ FAST: Get conversation details from cache instead of API calls (no 403 errors)
  const conversationsDetails = useMemo(() => {
    if (!open || conversationIds.length === 0) return [];

    const details = [];
    
    // ✅ Get all conversation queries from cache
    const allQueries = queryClient.getQueriesData({ queryKey: ['conversations'] });
    
    for (const [queryKey, queryData] of allQueries) {
      // Handle both infinite query (pages) and regular query (data) structures
      let conversations = [];
      
      if (queryData?.pages) {
        // Infinite query structure
        conversations = queryData.pages.flatMap(page => 
          page?.data?.data || page?.data || []
        );
      } else if (queryData?.data) {
        // Regular query structure
        conversations = Array.isArray(queryData.data) 
          ? queryData.data 
          : (queryData.data?.data || []);
      }
      
      // Find conversations by ID
      for (const conv of conversations) {
        if (conversationIds.includes(String(conv._id))) {
          // Check if we already have this conversation
          if (!details.find(d => String(d._id) === String(conv._id))) {
            details.push(conv);
          }
        }
      }
    }
    
    // ✅ Sort by conversationIds order to maintain selection order
    return conversationIds
      .map(id => details.find(d => String(d._id) === String(id)))
      .filter(Boolean);
  }, [open, conversationIds, queryClient]);

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (isUnmerge) {
        // ✅ Unmerge: Use the DELETE endpoint to unmerge
        // If conversation is secondary (merged into primary), just DELETE without body
        // If conversation is primary (has merged conversations), we need to unmerge all or specific one
        // For now, we'll unmerge the conversation itself (if it's secondary) or all merged ones (if primary)
        const response = await apiClient.delete(`/conversations/${conversationIds[0]}/merge`);
        return response;
      } else {
        // ✅ Merge: Use the merge endpoint
        const response = await apiClient.post('/conversations/merge', {
          conversationIds,
          reason: 'Manual merge'
        });
        return response;
      }
    },
    onSuccess: (response) => {
      if (isUnmerge) {
        // ✅ Handle unmerge success
        const unmergeData = response?.data || {};
        const primaryConversationId = unmergeData.conversationId || conversationIds[0];
        const unmergedConversationId = unmergeData.unmergedConversationId;
        const unmergedConversationIds = unmergeData.unmergedConversationIds || (unmergedConversationId ? [unmergedConversationId] : []);
        
        console.log('✅ Unmerge successful:', { primaryConversationId, unmergedConversationId, unmergedConversationIds });
        toast.success('Successfully unmerged conversation');
        
        // ✅ Update cache for unmerge - handle both infinite query and regular query structures
        queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
          if (!oldData) return oldData;
          
          // Handle infinite query structure
          if (oldData.pages) {
            const updatedPages = oldData.pages.map(page => {
              const conversations = page?.data?.data || page?.data || [];
              
              // Update primary conversation (remove isMerged flag)
              let updatedConversations = conversations.map(c => {
                if (String(c._id) === String(primaryConversationId)) {
                  // Remove the unmerged conversation from mergedConversations array
                  const updatedMergedConversations = (c.mergedConversations || []).filter(
                    mc => !unmergedConversationIds.some(id => String(mc.conversationId) === String(id))
                  );
                  
                  return {
                    ...c,
                    isMerged: updatedMergedConversations.length > 0,
                    mergedConversations: updatedMergedConversations.length > 0 ? updatedMergedConversations : undefined
                  };
                }
                return c;
              });
              
              // ✅ Add unmerged conversations back to the list if they're active
              // Note: The backend should provide updatedConversations in the socket event
              // For now, we'll just update the primary and let socket events handle adding unmerged ones
              
              const pagination = page?.data?.pagination || page?.pagination;
              
              return {
                ...page,
                data: page.data?.data ? {
                  ...page.data,
                  data: updatedConversations,
                  pagination: pagination || page.data.pagination
                } : {
                  ...page.data,
                  data: updatedConversations,
                  pagination: pagination || page.pagination
                }
              };
            });
            
            return {
              ...oldData,
              pages: updatedPages
            };
          } else {
            // Regular query structure
            const conversations = oldData.data || [];
            const pagination = oldData.pagination || {};
            
            // Update primary conversation
            const updatedConversations = conversations.map(c => {
              if (String(c._id) === String(primaryConversationId)) {
                const updatedMergedConversations = (c.mergedConversations || []).filter(
                  mc => !unmergedConversationIds.some(id => String(mc.conversationId) === String(id))
                );
                
                return {
                  ...c,
                  isMerged: updatedMergedConversations.length > 0,
                  mergedConversations: updatedMergedConversations.length > 0 ? updatedMergedConversations : undefined
                };
              }
              return c;
            });
            
            return {
              ...oldData,
              data: updatedConversations,
              pagination
            };
          }
        });
        
        // ✅ Invalidate queries to ensure fresh data
        queryClient.invalidateQueries(['conversations'], { exact: false });
        queryClient.invalidateQueries(['conversation', primaryConversationId]);
        queryClient.invalidateQueries(['messages-infinite', primaryConversationId]);
        if (unmergedConversationId) {
          queryClient.invalidateQueries(['conversation', unmergedConversationId]);
          queryClient.invalidateQueries(['messages-infinite', unmergedConversationId]);
        }
      } else {
        // ✅ Handle merge success (existing logic)
        const mergeData = response?.data || {};
        const primaryConversationId = mergeData.primaryConversationId;
        const mergedConversationIds = mergeData.mergedConversationIds;
        
        if (!primaryConversationId || !mergedConversationIds) {
          console.error('❌ Invalid merge response - missing IDs');
          toast.error('Merge successful but unable to update UI. Please refresh the page.');
          onSuccess?.();
          onClose();
          return;
        }
        
        const finalPrimaryId = String(primaryConversationId);
        const finalMergedIds = Array.isArray(mergedConversationIds) 
          ? mergedConversationIds.map(id => String(id))
          : [String(mergedConversationIds)];
        
        toast.success(`Successfully merged ${conversationIds.length} conversations`);
        
        // ✅ Update ALL conversation queries (optimized for both infinite and regular queries)
        queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
          if (!oldData) return oldData;
          
          // Handle infinite query structure
          if (oldData.pages) {
            const updatedPages = oldData.pages.map(page => {
              const conversations = page?.data?.data || page?.data || [];
              
              // Remove merged conversations
              const filteredConversations = conversations.filter(c => 
                !finalMergedIds.some(id => String(c._id) === String(id))
              );
              
              // Update primary conversation
              const updatedConversations = filteredConversations.map(c => {
                if (String(c._id) === String(finalPrimaryId)) {
                  const allMergedChannels = [
                    {
                      conversationId: finalPrimaryId,
                      channel: c.channel || 'unknown',
                      channelAccount: c.channelAccount || null
                    },
                    ...finalMergedIds.map(id => {
                      const originalConv = conversations.find(orig => String(orig._id) === String(id));
                      return {
                        conversationId: String(id),
                        channel: originalConv?.channel || 'unknown',
                        channelAccount: originalConv?.channelAccount || null
                      };
                    })
                  ].filter((mc, idx, arr) => 
                    arr.findIndex(m => String(m.conversationId) === String(mc.conversationId)) === idx
                  );
                  
                  return {
                    ...c,
                    isMerged: true,
                    mergedConversations: allMergedChannels
                  };
                }
                return c;
              });
              
              const pagination = page?.data?.pagination || page?.pagination;
              const removedCount = conversations.length - updatedConversations.length;
              const newTotal = pagination?.total ? Math.max(0, pagination.total - removedCount) : updatedConversations.length;
              
              return {
                ...page,
                data: page.data?.data ? {
                  ...page.data,
                  data: updatedConversations,
                  pagination: pagination ? { ...pagination, total: newTotal } : page.data.pagination
                } : {
                  ...page.data,
                  data: updatedConversations,
                  pagination: pagination ? { ...pagination, total: newTotal } : page.pagination
                }
              };
            });
            
            return {
              ...oldData,
              pages: updatedPages
            };
          } else {
            // Handle regular query structure
            const conversations = oldData.data || [];
            const pagination = oldData.pagination || {};
            
            const filteredConversations = conversations.filter(c => 
              !finalMergedIds.some(id => String(c._id) === String(id))
            );
            
            const updatedConversations = filteredConversations.map(c => {
              if (String(c._id) === String(finalPrimaryId)) {
                const allMergedChannels = [
                  {
                    conversationId: finalPrimaryId,
                    channel: c.channel || 'unknown',
                    channelAccount: c.channelAccount || null
                  },
                  ...finalMergedIds.map(id => {
                    const originalConv = conversations.find(orig => String(orig._id) === String(id));
                    return {
                      conversationId: String(id),
                      channel: originalConv?.channel || 'unknown',
                      channelAccount: originalConv?.channelAccount || null
                    };
                  })
                ].filter((mc, idx, arr) => 
                  arr.findIndex(m => String(m.conversationId) === String(mc.conversationId)) === idx
                );
                
                return {
                  ...c,
                  isMerged: true,
                  mergedConversations: allMergedChannels
                };
              }
              return c;
            });
            
            const removedCount = conversations.length - updatedConversations.length;
            
            return {
              ...oldData,
              data: updatedConversations,
              pagination: {
                ...pagination,
                total: pagination.total ? Math.max(0, pagination.total - removedCount) : updatedConversations.length
              }
            };
          }
        });
        
        // ✅ Invalidate queries
        queryClient.invalidateQueries(['conversations'], { exact: false });
        conversationIds.forEach(id => {
          queryClient.invalidateQueries(['conversation', id]);
          queryClient.invalidateQueries(['messages-infinite', id]);
        });
        
        if (finalPrimaryId) {
          queryClient.invalidateQueries(['conversation', finalPrimaryId]);
          queryClient.invalidateQueries(['messages-infinite', finalPrimaryId]);
        }
      }
      
      onSuccess?.();
      onClose();
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.error || 
        (isUnmerge ? 'Failed to unmerge conversation' : 'Failed to merge conversations');
      toast.error(errorMessage);
    }
  });

  const handleAction = () => {
    if (isUnmerge) {
      if (conversationIds.length !== 1) {
        toast.error('Please select exactly 1 merged conversation to unmerge');
        return;
      }
    } else {
      if (conversationIds.length < 2) {
        toast.error('Please select at least 2 conversations to merge');
      return;
      }
    }

    mergeMutation.mutate();
  };

  // ✅ Get channel icon and name helpers
  const getChannelIcon = (channel) => {
    switch (channel) {
      case 'email':
        return Mail;
      case 'whatsapp':
      case 'sms':
        return Phone;
      case 'webchat':
        return Globe;
      default:
        return MessageSquare;
    }
  };

  const getChannelName = (channel) => {
    switch (channel) {
      case 'email':
        return 'Email';
      case 'whatsapp':
        return 'WhatsApp';
      case 'sms':
        return 'SMS';
      case 'webchat':
        return 'WebChat';
      default:
        return channel.charAt(0).toUpperCase() + channel.slice(1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px]">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
        <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isUnmerge ? (
                <>
                  <Unlink className="h-5 w-5 text-orange-500" />
                  Unmerge Conversation
                </>
          ) : (
            <>
                  <Merge className="h-5 w-5 text-blue-500" />
                  Merge Conversations
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {isUnmerge ? (
                <>Unmerge this conversation to separate it from merged conversations. All messages will remain accessible.</>
              ) : (
                <>Merge {conversationIds.length} selected conversation{conversationIds.length !== 1 ? 's' : ''}. All messages will be displayed together in a single conversation view.</>
              )}
            </DialogDescription>
          </DialogHeader>
        </motion.div>

        <div className="space-y-4 py-4">
          <AnimatePresence mode="wait">
            {isUnmerge ? (
              conversationIds.length !== 1 ? (
                <motion.div
                  key="unmerge-error"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
                >
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Please select exactly 1 merged conversation to unmerge.
                  </p>
                </motion.div>
              ) : conversationsDetails.length > 0 ? (
                <motion.div
                  key="unmerge-details"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Conversation to Unmerge
                    </p>
                    <AnimatePresence>
                      {conversationsDetails.map((conv, index) => {
                        const contact = conv.contactData || conv.contact || {};
                        const channel = conv.channel || 'unknown';
                        const channelAccount = conv.channelAccount || {};
                        const ChannelIcon = getChannelIcon(channel);
                        const phone = contact.phone || contact.normalizedPhone || null;
                        const email = contact.email || null;
                        const identifiers = contact.identifiers || {};

                        return (
                          <motion.div
                    key={conv._id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2, delay: index * 0.05 }}
                            className="p-4 bg-gradient-to-r from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-800/10 rounded-lg border-2 border-orange-200 dark:border-orange-800 shadow-sm"
                          >
                            <div className="flex items-start gap-3">
                              <Badge variant="outline" className="text-xs flex-shrink-0 mt-0.5 bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700">
                                {index + 1}
                              </Badge>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                                    <ChannelIcon className="h-4 w-4" />
                                    <span className="text-sm font-semibold">{getChannelName(channel)}</span>
                                  </div>
                                  {channelAccount.name && (
                                    <Badge variant="secondary" className="text-xs">
                                      {channelAccount.name}
                                    </Badge>
                                  )}
                                  {conv.isMerged && (
                                    <Badge className="text-xs bg-blue-500">
                                      Merged ({conv.mergedConversations?.length || 0} channels)
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                                  {contact.name || contact.displayName ? (
                                    <div className="font-semibold text-gray-800 dark:text-gray-200">
                                      {contact.name || contact.displayName}
                                    </div>
                                  ) : null}
                                  {phone && (
                                    <div className="flex items-center gap-1.5">
                                      <Phone className="h-3.5 w-3.5" />
                                      <span>{phone}</span>
                                    </div>
                                  )}
                                  {email && (
                                    <div className="flex items-center gap-1.5">
                                      <Mail className="h-3.5 w-3.5" />
                                      <span className="truncate">{email}</span>
                                    </div>
                                  )}
                                  {Object.keys(identifiers).length > 0 && (
                                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-700">
                                      {Object.entries(identifiers).map(([key, value]) => (
                                        <div key={key} className="truncate">
                                          <span className="font-medium">{key}:</span> {String(value)}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">
                                    ID: {conv._id.substring(0, 12)}...
                                  </div>
                                </div>
                      </div>
                    </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : null
            ) : conversationIds.length < 2 ? (
              <motion.div
                key="merge-error"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
              >
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Please select at least 2 conversations to merge.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="merge-details"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Selected Conversations ({conversationIds.length})
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-2">
                    <AnimatePresence>
                      {conversationsDetails.length > 0 ? (
                        conversationsDetails.map((conv, index) => {
                          const contact = conv.contactData || conv.contact || {};
                          const channel = conv.channel || 'unknown';
                          const channelAccount = conv.channelAccount || {};
                          const ChannelIcon = getChannelIcon(channel);
                          const phone = contact.phone || contact.normalizedPhone || null;
                          const email = contact.email || null;
                          const identifiers = contact.identifiers || {};

                          return (
                            <motion.div
                              key={conv._id}
                              initial={{ opacity: 0, x: -20, scale: 0.95 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              exit={{ opacity: 0, x: 20, scale: 0.95 }}
                              transition={{ 
                                duration: 0.3, 
                                delay: index * 0.05,
                                type: "spring",
                                stiffness: 300,
                                damping: 25
                              }}
                              className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50/50 dark:from-blue-900/20 dark:to-indigo-900/10 rounded-lg border border-blue-200 dark:border-blue-800 shadow-sm hover:shadow-md transition-shadow"
                            >
                              <div className="flex items-start gap-3">
                                <Badge variant="outline" className="text-xs flex-shrink-0 mt-0.5 bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700">
                                  {index + 1}
                                </Badge>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                                      <ChannelIcon className="h-4 w-4" />
                                      <span className="text-sm font-semibold">{getChannelName(channel)}</span>
                                    </div>
                                    {channelAccount.name && (
                                      <Badge variant="secondary" className="text-xs">
                                        {channelAccount.name}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                                    {contact.name || contact.displayName ? (
                                      <div className="font-semibold text-gray-800 dark:text-gray-200">
                                        {contact.name || contact.displayName}
                                      </div>
                                    ) : null}
                                    {phone && (
                                      <div className="flex items-center gap-1.5">
                                        <Phone className="h-3.5 w-3.5" />
                                        <span>{phone}</span>
                                      </div>
                                    )}
                                    {email && (
                                      <div className="flex items-center gap-1.5">
                                        <Mail className="h-3.5 w-3.5" />
                                        <span className="truncate">{email}</span>
                                      </div>
                                    )}
                                    {Object.keys(identifiers).length > 0 && (
                                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 pt-1 border-t border-gray-200 dark:border-gray-700">
                                        {Object.entries(identifiers).map(([key, value]) => (
                                          <div key={key} className="truncate">
                                            <span className="font-medium">{key}:</span> {String(value)}
                  </div>
                ))}
                                      </div>
                                    )}
                                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">
                                      ID: {conv._id.substring(0, 12)}...
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })
                      ) : (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center justify-center p-4"
                        >
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          <span className="ml-2 text-sm text-gray-500">Loading conversation details...</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
          >
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <p className="text-xs text-blue-800 dark:text-blue-200">
              {isUnmerge ? (
                <>Note: Unmerging will separate this conversation. All messages will remain accessible in their respective conversations.</>
              ) : (
                <>Note: Only conversations with the same phone number or email can be merged.</>
              )}
            </p>
          </motion.div>
              </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex justify-end gap-2 pt-4 border-t"
        >
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={mergeMutation.isPending}
            className="transition-all hover:scale-105"
          >
                  Cancel
                </Button>
                <Button 
            onClick={handleAction}
            disabled={
              (isUnmerge ? conversationIds.length !== 1 : conversationIds.length < 2) || 
              mergeMutation.isPending
            }
            className={`transition-all hover:scale-105 ${
              isUnmerge 
                ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {mergeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isUnmerge ? 'Unmerging...' : 'Merging...'}
              </>
            ) : (
              <>
                {isUnmerge ? (
                  <>
                    <Unlink className="h-4 w-4 mr-2" />
                    Unmerge Conversation
                  </>
                ) : (
                  <>
                    <Merge className="h-4 w-4 mr-2" />
                    Merge {conversationIds.length} Conversation{conversationIds.length !== 1 ? 's' : ''}
                  </>
                )}
            </>
          )}
          </Button>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
