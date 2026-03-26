// src/components/modals/UnmergeConversationModal.jsx
'use client';

import { useConversationMerge } from '@/hooks/useConversationMerge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Split, X } from 'lucide-react';

export default function UnmergeConversationModal({ 
  open, 
  onClose, 
  conversationId,
  conversation 
}) {
  const { unmergeConversation, isUnmerging } = useConversationMerge();

  const handleUnmerge = () => {
    // Determine if this is a primary conversation with merged conversations
    // or a secondary conversation merged into another
    let unmergeConversationId = null;
    
    if (conversation?.isMerged && conversation?.mergedConversations?.length > 0) {
      // This is a primary conversation - need to specify which to unmerge
      // For now, unmerge all (user can merge again if needed)
      // In future, could show a list to select which to unmerge
      unmergeConversationId = conversation.mergedConversations[0]?.conversationId;
    }

    unmergeConversation({
      conversationId,
      unmergeConversationId
    }, {
      onSuccess: () => {
        // ✅ Close modal after successful unmerge
        // Socket events will update the UI in real-time
        setTimeout(() => {
          onClose();
        }, 300); // Small delay to allow socket event to process
      },
      onError: () => {
        // ✅ Keep modal open on error so user can retry
      }
    });
  };

  const isPrimary = conversation?.isMerged && conversation?.mergedConversations?.length > 0;
  const isSecondary = conversation?.primaryConversation;

  return (
    <>
      {/* ✅ Professional Loading Overlay - Shows when unmerging */}
      {isUnmerging && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl max-w-sm w-full mx-4">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Unmerging conversations...
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Please wait while we separate the conversations
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Split className="h-5 w-5" />
              Unmerge Conversation
            </DialogTitle>
            <DialogDescription>
              {isPrimary
                ? `This conversation has ${conversation.mergedConversations.length} merged conversation(s). Unmerging will separate them.`
                : 'This conversation is merged with another. Unmerging will separate them.'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to unmerge this conversation? 
              Messages will remain but will be displayed in separate conversations.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={isUnmerging}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleUnmerge}
              disabled={isUnmerging}
            >
              {isUnmerging ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Unmerging...
                </>
              ) : (
                <>
                  <Split className="h-4 w-4 mr-2" />
                  Unmerge
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

