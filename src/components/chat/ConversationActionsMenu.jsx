// src/components/chat/ConversationActionsMenu.jsx
'use client';

import { useState } from 'react';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
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
import { useConversationActionsSocket } from '@/hooks/useConversationActionsSocket';
import {
  Archive,
  Pin,
  Star,
  Bell,
  BellOff,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  AlarmClock,
  Link,
  Copy,
  MessageSquare,
  Loader2,
  AlertTriangle,
  Unlink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function ConversationActionsMenu({ conversation, onAction, isViewOnly = false }) {
  const [showPermanentDeleteAlert, setShowPermanentDeleteAlert] = useState(false);
  const [showUnmergeAlert, setShowUnmergeAlert] = useState(false);
  const queryClient = useQueryClient();

  // Check if conversation is merged
  const isMergedConversation = conversation?.isMerged && conversation?.mergedConversations?.length > 0;

  // Unmerge mutation — same endpoint + same real-time flow as conversation header
  const unmergeMutation = useMutation({
    mutationFn: () => apiClient.post(`/conversations/${conversation._id}/unmerge`),
    onSuccess: (response) => {
      const convId = conversation._id;
      const mergedConvIds = (conversation.mergedConversations || []).map(m => m.conversationId);

      // 1. Immediately update this conversation's cache (same as socket handler)
      queryClient.setQueryData(['conversation', convId], (old) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: { ...old.data, isMerged: false, mergedConversations: [], primaryConversation: null }
        };
      });

      // 2. Update conversations list cache immediately
      queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
        if (!oldData?.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.map((c) => {
            if (String(c._id) === String(convId)) {
              return { ...c, isMerged: false, mergedConversations: [] };
            }
            if (mergedConvIds.some(id => String(c._id) === String(id))) {
              return { ...c, primaryConversation: null, status: 'active', isMerged: false };
            }
            return c;
          })
        };
      });

      // 3. Clear message cache for this conversation
      queryClient.removeQueries({
        queryKey: ['messages-infinite', convId],
        exact: false
      });

      // 4. Force refetch everything to get server-recalculated data (last messages, new conversations)
      queryClient.invalidateQueries({ queryKey: ['conversation', convId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      mergedConvIds.forEach(id => {
        queryClient.invalidateQueries({ queryKey: ['conversation', id] });
        queryClient.removeQueries({ queryKey: ['messages-infinite', id], exact: false });
      });

      toast.success('Conversation unmerged successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || error.message || 'Failed to unmerge conversation');
    },
  });
  
  // Always call hook (Rules of Hooks)
  const {
    pinConversation,
    markAsRead,
    markAsUnread,
    archiveConversation,
    unarchiveConversation,
    muteConversation,
    unmuteConversation,
    snoozeConversation,
    unsnoozeConversation,
    starConversation,
    deleteConversation,
    isConnected,
  } = useConversationActionsSocket(conversation?._id || '');
  
  const isLoading = !isConnected;

  // ✅ Check if conversation has WebChat link
  const isWebChatConversation = conversation?.channel === 'webchat';

  // ✅ Query WebChat link
  const { data: webchatLinkData, isLoading: isLoadingLink } = useQuery({
    queryKey: ['webchat-link', conversation?._id],
    queryFn: async () => {
      if (!conversation?._id || !isWebChatConversation) return null;
      // apiClient returns { success, data } directly
      const response = await apiClient.get(`/conversations/${conversation._id}/webchat-link`);
      return response?.data || null;
    },
    enabled: !!conversation?._id && isWebChatConversation,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // ✅ Generate WebChat link mutation
  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      // apiClient returns { success, data } directly
      const response = await apiClient.post(`/conversations/${conversation._id}/webchat-link`);
      return response?.data || null;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['webchat-link', conversation?._id] });
      toast.success('Link has been generated successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to generate WebChat link');
    },
  });

  // ✅ Copy WebChat link
  const handleCopyLink = async () => {
    const link = webchatLinkData?.contactLink;
    if (!link) {
      toast.error('No WebChat link available');
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      toast.success('WebChat link has been copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };
  
  if (!conversation || !conversation._id) {
    return null;
  }

  const handleAction = (actionFn) => {
    actionFn();
    onAction?.();
  };

  return (
    <>
      <DropdownMenuLabel>Actions</DropdownMenuLabel>
      
      {/* Read/Unread */}
      {conversation.unreadCount > 0 ? (
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            handleAction(markAsRead);
          }}
          disabled={isLoading || isViewOnly}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Mark as read
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            handleAction(() => markAsUnread(1));
          }}
          disabled={isLoading || isViewOnly}
        >
          <XCircle className="h-4 w-4 mr-2" />
          Mark as unread
        </DropdownMenuItem>
      )}
      
      <DropdownMenuSeparator />
      
      {/* Pin/Unpin */}
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          handleAction(pinConversation);
        }}
        disabled={isLoading || isViewOnly}
      >
        <Pin className={cn('h-4 w-4 mr-2', conversation.isPinned && 'text-blue-600')} />
        {conversation.isPinned ? 'Unpin' : 'Pin'} conversation
      </DropdownMenuItem>
      
      {/* Star/Unstar */}
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          handleAction(starConversation);
        }}
        disabled={isLoading || isViewOnly}
      >
        <Star className={cn('h-4 w-4 mr-2', conversation.isStarred && 'text-yellow-500 fill-yellow-500')} />
        {conversation.isStarred ? 'Unstar' : 'Star'} conversation
      </DropdownMenuItem>
      
      {/* Mute/Unmute */}
      {/* <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          handleAction(() => conversation.isMuted ? unmuteConversation() : muteConversation());
        }}
        disabled={isLoading || isViewOnly}
      >
        {conversation.isMuted ? (
          <>
            <Bell className="h-4 w-4 mr-2" />
            Unmute conversation
          </>
        ) : (
          <>
            <BellOff className="h-4 w-4 mr-2" />
            Mute conversation
          </>
        )}
      </DropdownMenuItem> */}
      
      {/* Snooze/Unsnooze */}
      {/* <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          handleAction(() => conversation.isSnoozed ? unsnoozeConversation() : snoozeConversation());
        }}
        disabled={isLoading || isViewOnly}
      >
       
        <AlarmClock className={cn('h-4 w-4 mr-2', conversation.isSnoozed && 'text-orange-500')} />
        {conversation.isSnoozed ? 'Unsnooze' : 'Snooze'} conversation
      </DropdownMenuItem> */}
      
      {/* Unmerge - Only show for merged conversations */}
      {isMergedConversation && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setShowUnmergeAlert(true);
            }}
            onClick={(e) => e.stopPropagation()}
            disabled={isLoading || isViewOnly || unmergeMutation.isPending}
            className="text-orange-600 dark:text-orange-400"
          >
            {unmergeMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Unlink className="h-4 w-4 mr-2" />
            )}
            {unmergeMutation.isPending ? 'Unmerging...' : 'Unmerge conversations'}
          </DropdownMenuItem>
        </>
      )}

      <DropdownMenuSeparator />

      {/* Archive/Unarchive — commented out for future use */}
      {/* <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          if (conversation.status === 'archived') {
            handleAction(unarchiveConversation);
          } else {
            handleAction(() => archiveConversation('archive'));
          }
        }}
        disabled={isLoading || isViewOnly}
      >
        <Archive className="h-4 w-4 mr-2" />
        {conversation.status === 'archived' ? 'Unarchive' : 'Archive'} conversation
      </DropdownMenuItem> */}
      
      <DropdownMenuSeparator />
      
      {/* ✅ WebChat Link - Only show for WebChat conversations */}
      {isWebChatConversation && (
        <>
          {webchatLinkData?.existing ? (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleCopyLink();
              }}
              disabled={isLoadingLink || !webchatLinkData?.contactLink || isViewOnly}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy WebChat link
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                generateLinkMutation.mutate();
              }}
              disabled={isLoadingLink || generateLinkMutation.isPending || isViewOnly}
            >
              <Link className="h-4 w-4 mr-2" />
              {generateLinkMutation.isPending ? 'Generating...' : 'Generate WebChat link'}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
        </>
      )}
      
      {/* Permanently Delete */}
      <DropdownMenuItem
        onSelect={(e) => {
          // ✅ CRITICAL: Prevent dropdown from closing when clicking permanent delete
          e.preventDefault();
          setShowPermanentDeleteAlert(true);
        }}
        onClick={(e) => {
          e.stopPropagation();
          // Don't close dropdown here - let AlertDialog handle it
        }}
        disabled={isLoading || isViewOnly}
        className="text-red-700 dark:text-red-500"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Delete conversation
      </DropdownMenuItem>

      {/* Permanent delete confirmation dialog */}
      <AlertDialog 
        open={showPermanentDeleteAlert} 
        onOpenChange={(open) => {
          // ✅ CRITICAL: Only close if explicitly set to false (prevents auto-close)
          // This ensures the dialog doesn't close when dropdown closes
          if (open === false) {
            setShowPermanentDeleteAlert(false);
          }
        }}
      >
        <AlertDialogContent
          className="sm:max-w-[550px] max-w-[calc(100vw-2rem)]"
          onInteractOutside={(e) => {
            // ✅ Prevent closing when clicking outside (user must explicitly cancel)
            e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            // ✅ Allow ESC key to close
            setShowPermanentDeleteAlert(false);
          }}
          onPointerDownOutside={(e) => {
            // ✅ Prevent closing when clicking outside
            e.preventDefault();
          }}
        >
          <AlertDialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <AlertDialogTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Delete conversation permanently?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm text-gray-600 dark:text-gray-400 pt-1">
              <p className="leading-relaxed mb-3">
 and                This will permanently delete the conversation with{' '}
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {(() => {
                    // ✅ Get contact from multiple possible paths
                    const contact = conversation.contactData || conversation.contact || {};
                    const phoneNumber = contact.phone || contact.identifiers?.phone || contact.identifiers?.sms;
                    const email = contact.email || contact.identifiers?.email;
                    
                    // ✅ Priority: name > displayName > email > phone > identifier > channel-specific fallback
                    return contact.name || 
                           contact.displayName ||
                           email ||
                           phoneNumber ||
                           (conversation.channel === 'email' ? 'Email Contact' : 
                            conversation.channel === 'whatsapp' ? 'WhatsApp Contact' :
                            conversation.channel === 'sms' ? 'SMS Contact' :
                            conversation.channel === 'webchat' ? 'WebChat Visitor' :
                            'Contact');
                  })()}
                </span>{' '}
                and all associated messages.
              </p>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-4">
            <AlertDialogCancel
              onClick={() => {
                setShowPermanentDeleteAlert(false);
                onAction?.(); // Close dropdown after cancel
              }}
              disabled={isLoading}
              className="w-full sm:w-auto mt-2 sm:mt-0"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  // ✅ Call delete function with permanent flag
                  deleteConversation(true);
                  // ✅ Close dialog immediately after triggering delete
                  setShowPermanentDeleteAlert(false);
                  // ✅ Close dropdown
                  onAction?.();
                } catch (error) {
                  console.error('Error deleting conversation:', error);
                  toast.error('Failed to delete conversation. Please try again.');
                }
              }}
              disabled={isLoading}
              className="w-full sm:w-auto bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white focus:ring-red-600 focus:ring-offset-2 transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Permanently
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unmerge confirmation dialog */}
      <AlertDialog
        open={showUnmergeAlert}
        onOpenChange={(open) => {
          if (open === false) setShowUnmergeAlert(false);
        }}
      >
        <AlertDialogContent
          className="sm:max-w-[500px] max-w-[calc(100vw-2rem)]"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <AlertDialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
                <Unlink className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <AlertDialogTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Unmerge conversations?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm text-gray-600 dark:text-gray-400 pt-1">
              <p className="leading-relaxed mb-2">
                This will separate the merged conversations back into individual conversations. Messages will be reassigned to their original channels.
              </p>
              {conversation?.mergedConversations?.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mt-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Merged channels:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {conversation.channel && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 capitalize">
                        {conversation.channel}
                      </span>
                    )}
                    {conversation.mergedConversations.map((merged, idx) => (
                      <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 capitalize">
                        {merged.channel || 'Unknown'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-4">
            <AlertDialogCancel
              onClick={() => {
                setShowUnmergeAlert(false);
                onAction?.();
              }}
              disabled={unmergeMutation.isPending}
              className="w-full sm:w-auto mt-2 sm:mt-0"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                unmergeMutation.mutate(undefined, {
                  onSettled: () => {
                    setShowUnmergeAlert(false);
                    onAction?.();
                  },
                });
              }}
              disabled={unmergeMutation.isPending}
              className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-700 text-white focus:ring-orange-600"
            >
              {unmergeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Unmerging...
                </>
              ) : (
                <>
                  <Unlink className="h-4 w-4 mr-2" />
                  Unmerge
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

