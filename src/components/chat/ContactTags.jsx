// src/components/chat/ContactTags.jsx
'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';

export default function ContactTags({ contactId, tags }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTag, setNewTag] = useState('');
  const queryClient = useQueryClient();

  const addTagMutation = useMutation({
    mutationFn: (tag) => apiClient.post(`/contacts/${contactId}/tags`, { tags: [tag] }),
    onSuccess: () => {
      queryClient.invalidateQueries(['contact', contactId]);
      setNewTag('');
      setIsAdding(false);
    }
  });

  const removeTagMutation = useMutation({
    mutationFn: (tag) => apiClient.delete(`/contacts/${contactId}/tags?tag=${tag}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['contact', contactId]);
    }
  });

  const handleAddTag = () => {
    if (newTag.trim()) {
      addTagMutation.mutate(newTag.trim());
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="flex items-center gap-1">
            {tag}
            <button
              onClick={() => removeTagMutation.mutate(tag)}
              className="hover:text-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      {isAdding ? (
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Enter tag..."
            onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
            autoFocus
          />
          <Button size="sm" onClick={handleAddTag}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAdding(true)}
          className="w-full"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Tag
        </Button>
      )}
    </div>
  );
}