// src/components/modals/MergeConversationModal.jsx
'use client';

import { useState } from 'react';
import { useConversationMerge } from '@/hooks/useConversationMerge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Merge, X } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';

export default function MergeConversationModal({ 
  open, 
  onClose, 
  conversationId,
  conversation 
}) {
  const [targetConversationId, setTargetConversationId] = useState('');
  const [reason, setReason] = useState('');
  const { mergeConversation, isMerging } = useConversationMerge();

  // Fetch available conversations for merging
  const { data: conversationsData, isLoading: loadingConversations } = useQuery({
    queryKey: ['mergeable-conversations', conversationId],
    queryFn: async () => {
      const response = await apiClient.get('/conversations', {
        params: {
          status: 'active',
          limit: 100
        }
      });
      return response.data?.data || [];
    },
    enabled: open && !!conversationId,
    staleTime: 30000
  });

  const availableConversations = (conversationsData || []).filter(
    conv => conv._id !== conversationId && 
    conv.contact?._id === conversation?.contact?._id &&
    !conv.primaryConversation && // Not already merged into another
    !conv.isMerged // Not a primary with merged conversations
  );

  const handleMerge = () => {
    if (!targetConversationId) {
      toast.error('Please select a conversation to merge with');
      return;
    }

    mergeConversation({
      conversationId,
      targetConversationId,
      reason: reason || 'Manual merge'
    }, {
      onSuccess: () => {
        onClose();
        setTargetConversationId('');
        setReason('');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge Conversations
          </DialogTitle>
          <DialogDescription>
            Merge this conversation with another conversation from the same contact. 
            All messages will be displayed together in a single conversation view.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Conversation to Merge With</Label>
            {loadingConversations ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : availableConversations.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 text-center">
                No mergeable conversations found. Conversations can only be merged if they share the same contact.
              </div>
            ) : (
              <Select
                value={targetConversationId}
                onValueChange={setTargetConversationId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a conversation" />
                </SelectTrigger>
                <SelectContent>
                  {availableConversations.map((conv) => (
                    <SelectItem key={conv._id} value={conv._id}>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {conv.contact?.name || conv.contact?.displayName || 'Unknown Contact'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {conv.channel?.toUpperCase()} • {conv.lastMessageContent || 'No messages'}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (Optional)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for merging..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isMerging}>
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={!targetConversationId || isMerging || availableConversations.length === 0}
          >
            {isMerging ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <Merge className="h-4 w-4 mr-2" />
                Merge
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

