// src/components/panels/company-admin/DepartmentList.jsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import { Edit, Trash, Users, MessageSquare, Bot, AlertTriangle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function DepartmentList({ departments, onEdit, onDelete }) {
  const queryClient = useQueryClient();
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(null); // { departmentId, enabled }

  // Mutation for toggling AI bot
  const toggleAiBotMutation = useMutation({
    mutationFn: ({ departmentId, enabled }) => 
      apiClient.patch(`/departments/${departmentId}/toggle-ai-bot`, { enabled }),
    onSuccess: (response, variables) => {
      queryClient.invalidateQueries(['departments']);
      const message = response.data?.conversationsUpdated 
        ? `${response.message}. ${response.data.conversationsUpdated} conversation(s) updated to ${response.data.targetMode} mode.`
        : response.message || `AI Bot ${variables.enabled ? 'enabled' : 'disabled'}`;
      toast.success(message);
      setConfirmDialogOpen(false);
      setPendingToggle(null);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to toggle AI Bot');
      setConfirmDialogOpen(false);
      setPendingToggle(null);
    }
  });

  const handleToggleAiBot = (departmentId, currentValue) => {
    const newValue = !currentValue;
    setPendingToggle({ departmentId, enabled: newValue });
    setConfirmDialogOpen(true);
  };

  const confirmToggle = () => {
    if (pendingToggle) {
      toggleAiBotMutation.mutate(pendingToggle);
    }
  };

  if (!departments || departments.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No departments found</p>
        </CardContent>
      </Card>
    );
  }

  const departmentForDialog = pendingToggle 
    ? departments.find(d => d._id === pendingToggle.departmentId)
    : null;

  return (
    <>
      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <AlertDialogTitle>
                  {pendingToggle?.enabled ? 'Enable AI Bot' : 'Disable AI Bot'}
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-1">
                  {departmentForDialog?.name || 'This department'}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          
          <div className="py-4">
            {pendingToggle?.enabled ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  You are about to <strong className="text-emerald-600 dark:text-emerald-400">enable</strong> the AI Bot for this department. This will:
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-4">
                  <li>Set all conversations in this department to <strong>Auto Mode</strong></li>
                  <li>Allow the AI Bot to automatically respond to incoming messages</li>
                  <li>Apply to all existing and future conversations in this department</li>
                  <li>Work across all channels (WhatsApp, Email, SMS, WebChat, etc.)</li>
                </ul>
                <p className="text-sm font-medium text-muted-foreground mt-4">
                  Are you sure you want to proceed?
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  You are about to <strong className="text-destructive">disable</strong> the AI Bot for this department. This will:
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-4">
                  <li>Set all conversations in this department to <strong>Manual Mode</strong></li>
                  <li>Stop the AI Bot from automatically responding to messages</li>
                  <li>Require agents to manually handle all conversations</li>
                  <li>Apply to all existing and future conversations in this department</li>
                </ul>
                <p className="text-sm font-medium text-muted-foreground mt-4">
                  Are you sure you want to proceed?
                </p>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleAiBotMutation.isLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggle}
              disabled={toggleAiBotMutation.isLoading}
              className={pendingToggle?.enabled
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-destructive hover:bg-destructive/90'
              }
            >
              {toggleAiBotMutation.isLoading 
                ? 'Processing...' 
                : pendingToggle?.enabled 
                  ? 'Enable AI Bot' 
                  : 'Disable AI Bot'
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {departments.map((dept) => (
        <Card key={dept._id} className="bg-card border-border hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-foreground">{dept.name}</CardTitle>
              <Badge variant={dept.status === 'active' ? 'default' : 'secondary'} className={dept.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : ''}>
                {dept.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {dept.description || 'No description'}
            </p>
            
            <div className="flex items-center gap-4 mb-4 text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{dept.agents?.length || 0} agents</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span>{dept.assignedChannels || 0} channels</span>
              </div>
            </div>

            {/* AI Bot Toggle */}
            <div className="flex items-center justify-between p-3 mb-4 bg-muted rounded-lg border border-border">
              <div className="flex items-center gap-2">
                <Bot className={`h-4 w-4 ${dept.aiBotEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                <Label htmlFor={`ai-bot-${dept._id}`} className="text-sm font-medium text-muted-foreground cursor-pointer">
                  AI Bot
                </Label>
              </div>
              <Switch
                id={`ai-bot-${dept._id}`}
                checked={dept.aiBotEnabled || false}
                onCheckedChange={() => handleToggleAiBot(dept._id, dept.aiBotEnabled)}
                disabled={toggleAiBotMutation.isLoading}
                className="data-[state=checked]:bg-primary"
              />
            </div>
            {dept.aiBotEnabled && (
              <p className="text-xs text-primary mb-3 flex items-center gap-1">
                <Bot className="h-3 w-3" />
                AI Bot is active for this department
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(dept._id)}
                className="flex-1 cursor-pointer"
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(dept._id)}
                className="text-destructive cursor-pointer hover:bg-destructive/10"
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      </div>
    </>
  );
}
