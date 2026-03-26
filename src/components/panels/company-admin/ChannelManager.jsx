
// src/components/panels/company-admin/ChannelManager.jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MoreVertical, Trash, TestTube, Edit, Eye, EyeOff, MessageSquare, Unlink, Wifi, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ChannelIcon from '@/components/shared/ChannelIcon';
import ChannelStatus from './ChannelStatus';
import DisconnectChannelModal from '@/components/modals/DisconnectChannelModal';
import DeleteChannelModal from '@/components/modals/DeleteChannelModal';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function ChannelManager({ channels = [] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [channelToDisconnect, setChannelToDisconnect] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState(null);

  const toggleStatusMutation = useMutation({
    mutationFn: ({ channelId, status }) => 
      apiClient.patch(`/channels/${channelId}`, { 
        status: status === 'active' ? 'inactive' : 'active' 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Channel status updated');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update channel');
    }
  });

  const testConnectionMutation = useMutation({
    mutationFn: (channelId) => apiClient.post(`/channels/${channelId}/test`),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      // apiClient returns response.data directly, so response is already the data object
      if (response.success) {
        toast.success(response.message || 'Connection test successful');
      } else {
        toast.error(`Connection test failed: ${response.message || response.error || 'Unknown error'}`);
      }
    },
    onError: (error) => {
      // Handle error response - apiClient throws errors, so we need to check error.response
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to test connection';
      toast.error(errorMessage);
    }
  });

  const handleToggleStatus = (channel) => {
    toggleStatusMutation.mutate({
      channelId: channel._id,
      status: channel.status
    });
  };

  const handleTestConnection = (channel) => {
    testConnectionMutation.mutate(channel._id);
  };

  const handleDelete = (channel) => {
    setChannelToDelete(channel);
    setDeleteModalOpen(true);
  };

  const handleDeleteSuccess = () => {
    // Optimistically remove the deleted channel from cache
    if (channelToDelete?._id) {
      queryClient.setQueryData(['channels'], (oldData) => {
        if (!oldData?.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.filter(channel => channel._id !== channelToDelete._id)
        };
      });
    }
    
    // Invalidate and refetch to ensure consistency
    queryClient.invalidateQueries({ queryKey: ['channels'] });
    queryClient.invalidateQueries({ queryKey: ['templates'] });
    queryClient.refetchQueries({ queryKey: ['channels'] });
    
    setDeleteModalOpen(false);
    setChannelToDelete(null);
  };

  const handleDisconnect = (channel) => {
    setChannelToDisconnect(channel);
    setDisconnectModalOpen(true);
  };

  const handleDisconnectSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['channels'] });
    setDisconnectModalOpen(false);
    setChannelToDisconnect(null);
  };

  // ✅ FIX: Edit channel handler
  const handleEdit = (channel) => {
    // Navigate to the appropriate edit page based on channel type
    router.push(`/c/channels/${channel.type}/edit/${channel._id}`);
  };

  const getChannelStats = (channel) => {
    // Handle both single departmentId and multiple departmentIds
    const departments = channel.departmentIds || (channel.departmentId ? [channel.departmentId] : []);
    const departmentNames = departments.map(dept => dept?.name || 'Unknown').filter(Boolean);
    
    return {
      templates: channel.templateCount || 0,
      departments: departmentNames,
      departmentCount: departments.length,
      identifier: channel.identifier || 'N/A',
      lastSync: channel.lastSync ? new Date(channel.lastSync).toLocaleDateString() : 'Never',
      created: new Date(channel.createdAt).toLocaleDateString()
    };
  };

  if (!channels || channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          No channels found
        </h3>
        <p className="text-muted-foreground">
          Set up your first communication channel to get started
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-left">Name</TableHead>
            <TableHead className="text-left">Type</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-left">Departments</TableHead>
            <TableHead className="text-left">Templates</TableHead>
            <TableHead className="text-left">Identifier</TableHead>
            <TableHead className="text-left">Last Sync</TableHead>
            <TableHead className="text-left">Created</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {channels.map((channel) => {
            const stats = getChannelStats(channel);
            const isTesting = testConnectionMutation.isPending && testConnectionMutation.variables === channel._id;
            
            return (
              <TableRow key={channel._id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <ChannelIcon type={channel.type} className="h-5 w-5" />
                    <span className="text-foreground">{channel.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {channel.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center">
                    <ChannelStatus status={channel.status} />
                  </div>
                </TableCell>
                <TableCell>
                  {stats.departments.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {stats.departments.slice(0, 2).map((deptName, index) => (
                        <Badge 
                          key={index} 
                          variant="outline" 
                          className="text-xs"
                          title={deptName}
                        >
                          {deptName}
                        </Badge>
                      ))}
                      {stats.departments.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{stats.departments.length - 2}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {stats.templates}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground truncate max-w-[120px] block" title={stats.identifier}>
                    {stats.identifier}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">{stats.lastSync}</span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">{stats.created}</span>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
                    <TooltipProvider delayDuration={200}>
                      {/* View Details Button */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedChannel(channel)}
                            className="h-8 w-8 min-h-[44px] min-w-[44px] hover:bg-primary/10 hover:text-primary transition-colors"
                            aria-label={`View details for ${channel.name}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>View Details</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Edit Button */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(channel)}
                            className="h-8 w-8 min-h-[44px] min-w-[44px] hover:bg-muted hover:text-foreground transition-colors"
                            aria-label={`Edit ${channel.name}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Edit</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Delete Button */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(channel)}
                            className="h-8 w-8 min-h-[44px] min-w-[44px] hover:bg-destructive/10 hover:text-destructive transition-colors"
                            aria-label={`Delete ${channel.name}`}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* More Options Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 min-h-[44px] min-w-[44px] hover:bg-muted hover:text-foreground transition-colors"
                            aria-label={`More options for ${channel.name}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="">
                          <DropdownMenuItem 
                            onClick={() => handleTestConnection(channel)}
                            disabled={isTesting}
                            className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isTesting ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                                Testing...
                              </>
                            ) : (
                              <>
                                <TestTube className="mr-2 h-4 w-4" />
                                Test Connection
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleStatus(channel)} className="cursor-pointer">
                            {channel.status === 'active' ? (
                              <>
                                <EyeOff className="mr-2 h-4 w-4" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <Eye className="mr-2 h-4 w-4" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDisconnect(channel)}
                            className="text-amber-600 dark:text-amber-400 cursor-pointer"
                          >
                            <Unlink className="mr-2 h-4 w-4" />
                            Disconnect
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Disconnect Modal */}
      <DisconnectChannelModal
        open={disconnectModalOpen}
        onClose={() => {
          setDisconnectModalOpen(false);
          setChannelToDisconnect(null);
        }}
        channel={channelToDisconnect}
        onSuccess={handleDisconnectSuccess}
      />

      {/* Delete Modal */}
      <DeleteChannelModal
        open={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setChannelToDelete(null);
        }}
        channel={channelToDelete}
        onSuccess={handleDeleteSuccess}
      />

      {/* Channel Details Modal */}
      {selectedChannel && (
        <ChannelDetailsModal
          channel={selectedChannel}
          onClose={() => setSelectedChannel(null)}
        />
      )}
    </div>
  );
}

// Channel Details Modal Component
function ChannelDetailsModal({ channel, onClose }) {
  const stats = {
    departments: channel.departmentIds || (channel.departmentId ? [channel.departmentId] : []),
    templates: channel.templateCount || 0,
    identifier: channel.identifier,
    status: channel.status,
    lastSync: channel.lastSync,
    createdAt: channel.createdAt,
    type: channel.type,
    name: channel.name
  };

  const departmentNames = stats.departments.map(dept => dept?.name || 'Unknown').filter(Boolean);
  const formattedLastSync = stats.lastSync
    ? new Date(stats.lastSync).toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      })
    : 'Never';

  const statusColor = stats.status === 'active'
    ? 'text-emerald-600 dark:text-emerald-400'
    : stats.status === 'error'
      ? 'text-destructive'
      : 'text-muted-foreground';

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Channel Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Channel Name and Type */}
          <div className="flex items-center gap-3">
            <ChannelIcon type={stats.type} className="h-10 w-10 flex-shrink-0" />
            <div>
              <h4 className="text-lg font-semibold text-foreground">{stats.name}</h4>
              <p className="text-sm text-muted-foreground capitalize mt-0.5">{stats.type}</p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              <div className="flex items-center gap-2">
                <Wifi className={`h-4 w-4 ${statusColor}`} />
                <ChannelStatus status={stats.status} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Templates:</span>
              <span className="font-medium text-foreground">{stats.templates}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Identifier:</span>
              <span className="font-medium text-foreground break-all">{stats.identifier || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Last Sync:</span>
              <span className="font-medium text-foreground">{formattedLastSync}</span>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <span className="text-muted-foreground">Department:</span>
              <div className="flex flex-wrap gap-1">
                {departmentNames.length > 0 ? (
                  departmentNames.map((deptName, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      className="text-xs"
                    >
                      {deptName}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No department</span>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end pt-4 border-t border-border">
            <Button onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}