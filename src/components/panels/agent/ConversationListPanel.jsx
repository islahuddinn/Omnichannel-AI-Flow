// src/components/panels/agent/ConversationListPanel.jsx
'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import ConversationItem from '@/components/chat/ConversationItem';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ConversationListPanel({ conversations, selectedId, onSelect }) {
  const [search, setSearch] = useState('');

  const filteredConversations = useMemo(() => {
    const searchLower = search.toLowerCase();
    return conversations.filter(conv =>
      conv.contact?.name?.toLowerCase().includes(searchLower) ||
      conv.lastMessage?.toLowerCase().includes(searchLower)
    );
  }, [conversations, search]);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Conversations */}
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No conversations found
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <ConversationItem
                key={conversation._id}
                conversation={conversation}
                isSelected={conversation._id === selectedId}
                onClick={() => onSelect(conversation._id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}