// src/components/panels/agent/AgentStats.jsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export default function AgentStats({ data }) {
  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Resolution Rate</span>
            <span className="font-medium">{data.resolutionRate || 0}%</span>
          </div>
          <Progress value={data.resolutionRate || 0} />
        </div>

        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Active Conversations</span>
            <span className="font-medium">{data.assignedConversations || 0}</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Total Messages</span>
            <span className="font-medium">{data.totalMessages || 0}</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Avg Response Time</span>
            <span className="font-medium">{data.avgResponseTime || 0} minutes</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}