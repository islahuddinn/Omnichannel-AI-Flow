// src/components/chat/MessageReactions.jsx
'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

/**
 * Safely extract a string ID from any format (string, ObjectId, populated object)
 */
function toIdStr(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val._id) return val._id.toString();
  if (val.toString) return val.toString();
  return String(val);
}

/**
 * Get display name from a reaction entry.
 * Handles: populated user objects, populated contact objects, raw IDs, userName/contactName fields.
 */
function getReactorName(r, currentUserId) {
  const userId = toIdStr(r.user);
  const contactId = toIdStr(r.contact);

  // Check if it's the current logged-in user (agent)
  if (currentUserId && (userId === currentUserId || contactId === currentUserId)) {
    return 'You';
  }

  // Populated user object (from API response)
  if (r.user && typeof r.user === 'object' && r.user.firstName) {
    return `${r.user.firstName} ${r.user.lastName || ''}`.trim();
  }

  // Populated contact object
  if (r.contact && typeof r.contact === 'object' && (r.contact.name || r.contact.displayName)) {
    return r.contact.name || r.contact.displayName;
  }

  // Socket event fields
  if (r.userName) return r.userName;
  if (r.contactName) return r.contactName;

  return 'User';
}

export default function MessageReactions({ reactions = [], messageId, conversationId }) {
  const [showPicker, setShowPicker] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const currentUserId = user?.userId || user?.id;

  // Group reactions by emoji
  const groupedReactions = reactions.reduce((acc, reaction) => {
    const emoji = reaction.emoji;
    if (!acc[emoji]) {
      acc[emoji] = { emoji, count: 0, reactors: [], hasUserReacted: false };
    }
    acc[emoji].count++;

    const name = getReactorName(reaction, currentUserId);
    acc[emoji].reactors.push(name);

    // Check if current user reacted
    const rUserId = toIdStr(reaction.user);
    const rContactId = toIdStr(reaction.contact);
    if (currentUserId && (rUserId === currentUserId || rContactId === currentUserId)) {
      acc[emoji].hasUserReacted = true;
    }

    return acc;
  }, {});

  const reactionGroups = Object.values(groupedReactions);

  const addReactionMutation = useMutation({
    mutationFn: (emoji) =>
      apiClient.post(`/messages/${messageId}/reactions`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages-infinite', conversationId] });
      setShowPicker(false);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to add reaction');
    }
  });

  const removeReactionMutation = useMutation({
    mutationFn: (emoji) =>
      apiClient.delete(`/messages/${messageId}/reactions/${emoji}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages-infinite', conversationId] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to remove reaction');
    }
  });

  const handleReactionClick = (emoji, hasUserReacted) => {
    if (hasUserReacted) {
      removeReactionMutation.mutate(emoji);
    } else {
      addReactionMutation.mutate(emoji);
    }
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {reactionGroups.map((group) => (
        <button
          key={group.emoji}
          onClick={() => handleReactionClick(group.emoji, group.hasUserReacted)}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm transition-colors',
            group.hasUserReacted
              ? 'bg-blue-100 dark:bg-blue-900 border-2 border-blue-500'
              : 'bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
          )}
          title={group.reactors.join(', ')}
        >
          <span>{group.emoji}</span>
          <span className={cn(
            'text-xs font-medium',
            group.hasUserReacted ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
          )}>
            {group.count}
          </span>
        </button>
      ))}

      <Popover open={showPicker} onOpenChange={setShowPicker}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-6 gap-2">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => addReactionMutation.mutate(emoji)}
                className="text-2xl hover:bg-gray-100 dark:hover:bg-gray-800 rounded p-1 transition-colors"
                disabled={addReactionMutation.isPending}
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
