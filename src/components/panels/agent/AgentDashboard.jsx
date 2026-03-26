// src/components/panels/agent/AgentDashboard.jsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import ConversationItem from '@/components/chat/ConversationItem';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

export default function AgentDashboard() {
  const { user } = useAuth();

  const { data: recentConversations, isLoading } = useQuery({
    queryKey: ['recent-conversations', user?.id],
    queryFn: () => apiClient.get(`/conversations?assignedTo=${user?.id}&limit=5&status=open`),
    enabled: !!user?.id
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Conversations</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-2">
            {recentConversations?.data?.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                No active conversations
              </p>
            ) : (
              recentConversations?.data?.map((conversation) => (
                <ConversationItem
                  key={conversation._id}
                  conversation={conversation}
                />
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}