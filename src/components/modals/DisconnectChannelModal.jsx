// src/components/modals/DisconnectChannelModal.jsx
'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Unlink, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import ChannelIcon from '@/components/shared/ChannelIcon';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function DisconnectChannelModal({ open, onClose, channel, onSuccess }) {
  const [removeTemplates, setRemoveTemplates] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const disconnectMutation = useMutation({
    mutationFn: (data) => 
      apiClient.post(`/channels/${channel._id}/disconnect`, data),
    onSuccess: (response) => {
      toast.success(response.data.message);
      onSuccess();
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.error || 'Failed to disconnect channel';
      if (errorMessage.includes('active templates')) {
        // Auto-enable template removal if templates exist
        setRemoveTemplates(true);
        toast.error('Channel has active templates. Template removal has been enabled.');
      } else {
        toast.error(errorMessage);
      }
    }
  });

  const handleDisconnect = async () => {
    if (!channel) return;

    setIsLoading(true);
    try {
      await disconnectMutation.mutateAsync({ removeTemplates });
    } finally {
      setIsLoading(false);
    }
  };

  if (!channel) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <DialogTitle className="text-gray-900 dark:text-gray-100">Disconnect Channel</DialogTitle>
              <DialogDescription className="text-gray-600 dark:text-gray-400">
                This will remove all connection credentials
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Channel Info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
            <ChannelIcon type={channel.type} className="h-6 w-6" />
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-gray-100">{channel.name}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 capitalize">{channel.type}</div>
            </div>
            <Badge variant="outline" className="bg-gray-100 dark:bg-gray-600 border-gray-200 dark:border-gray-500 text-gray-700 dark:text-gray-300">{channel.identifier}</Badge>
          </div>

          {/* Warning Message */}
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <p className="font-medium">This action cannot be undone</p>
                <p className="mt-1">
                  Disconnecting will remove all API credentials and make this channel inactive.
                  You will need to reconfigure it to use it again.
                </p>
              </div>
            </div>
          </div>

          {/* Template Management */}
          {channel.templateCount > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="remove-templates" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Template Management
                </Label>
                <Badge variant="outline" className="bg-gray-100 dark:bg-gray-600 border-gray-200 dark:border-gray-500 text-gray-700 dark:text-gray-300">{channel.templateCount} templates</Badge>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remove-templates"
                  checked={removeTemplates}
                  onCheckedChange={(checked) => setRemoveTemplates(!!checked)}
                  className="cursor-pointer"
                />
                <Label htmlFor="remove-templates" className="text-sm font-normal cursor-pointer text-gray-900 dark:text-gray-100">
                  Remove this channel from all templates
                </Label>
              </div>
              
              {removeTemplates && (
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-700 dark:text-blue-300">
                  <p>
                    Templates will remain active but will no longer be linked to this channel. 
                    You can reassign them to other channels later.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-3 sm:gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="min-w-[100px] sm:flex-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDisconnect}
            disabled={isLoading}
            className="min-w-[140px] sm:flex-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed gap-2"
          >
            {isLoading ? (
              <>Disconnecting...</>
            ) : (
              <>
                <Unlink className="h-4 w-4" />
                Disconnect Channel
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}