// src/components/modals/DeleteChannelModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ChannelIcon from '@/components/shared/ChannelIcon';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function DeleteChannelModal({ open, onClose, channel, onSuccess }) {
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch template count for this channel
  const { data: templateData, isLoading: loadingTemplates } = useQuery({
    queryKey: ['channel-templates', channel?._id],
    queryFn: async () => {
      if (!channel?._id) return { count: 0 };
      const response = await apiClient.get(`/templates?channelId=${channel._id}`);
      const templates = response.data.data || [];
      return { 
        count: templates.length,
        templates: templates.map(t => t.name)
      };
    },
    enabled: open && !!channel?._id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/channels/${channel._id}`),
    onSuccess: () => {
      toast.success('Channel and all linked templates deleted successfully');
      onSuccess();
      onClose();
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.error || 'Failed to delete channel';
      toast.error(errorMessage);
      setIsDeleting(false);
    }
  });

  const handleDelete = async () => {
    if (!channel) return;
    setIsDeleting(true);
    await deleteMutation.mutateAsync();
  };

  if (!channel) return null;

  const templateCount = templateData?.count || 0;
  const hasTemplates = templateCount > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Channel
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the channel and all associated data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Channel Info */}
          <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/50">
            <ChannelIcon channel={channel.type} className="h-8 w-8" />
            <div className="flex-1">
              <p className="font-semibold">{channel.name}</p>
              <p className="text-sm text-muted-foreground capitalize">{channel.type}</p>
            </div>
          </div>

          {/* Template Warning */}
          {loadingTemplates ? (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : hasTemplates ? (
            <Alert variant="destructive">
              <FileText className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">
                    This channel has {templateCount} linked template{templateCount !== 1 ? 's' : ''}.
                  </p>
                  <p className="text-sm">
                    All templates linked to this channel will also be permanently deleted:
                  </p>
                  <ul className="text-sm list-disc list-inside space-y-1 mt-2">
                    {templateData.templates.slice(0, 5).map((name, idx) => (
                      <li key={idx} className="text-muted-foreground">{name}</li>
                    ))}
                    {templateData.templates.length > 5 && (
                      <li className="text-muted-foreground">
                        ...and {templateData.templates.length - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertDescription>
                No templates are linked to this channel. Only the channel will be deleted.
              </AlertDescription>
            </Alert>
          )}

          {/* Confirmation Message */}
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <p className="text-sm font-medium text-destructive">
              ⚠️ Warning: This action is permanent and cannot be undone
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Are you absolutely sure you want to delete "{channel.name}"?
            </p>
          </div>
        </div>

        <DialogFooter className="gap-3 sm:gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            className="min-w-[100px]"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || loadingTemplates}
            className="gap-2 min-w-[140px]"
          >
            {isDeleting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Delete Channel {hasTemplates && `& ${templateCount} Template${templateCount !== 1 ? 's' : ''}`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

