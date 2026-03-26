// src/app/c/automation/page.js
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Zap, Copy, Trash2, Eye, Power, PowerOff, BarChart3, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import Pagination from '@/components/shared/Pagination';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import AddAutomationModal from '@/components/modals/AddAutomationModal';

export default function AutomationPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const shouldReduceMotion = useReducedMotion();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingAutomation, setDeletingAutomation] = useState(null);
  const [togglingAutomation, setTogglingAutomation] = useState(null);

  const { data, isLoading, isError, error: automationsError, refetch } = useQuery({
    queryKey: ['automations', page, limit, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (search) params.append('search', search);

      const result = await apiClient.get(`/automations?${params.toString()}`);
      if (result && result.data && Array.isArray(result.data)) {
        return result;
      }
      if (Array.isArray(result)) {
        return { data: result, pagination: { page: 1, limit: 20, total: result.length, pages: 1 } };
      }
      return { data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } };
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const publishMutation = useMutation({
    mutationFn: ({ automationId, isPublished }) =>
      apiClient.put(`/automations/${automationId}/publish`, { isPublished }),
    onMutate: async ({ automationId, isPublished }) => {
      await queryClient.cancelQueries({ queryKey: ['automations'] });

      const previousAutomations = queryClient.getQueryData(['automations', page, limit, search]);

      queryClient.setQueryData(['automations', page, limit, search], (old) => {
        if (!old) return old;
        const dataArray = Array.isArray(old.data) ? old.data : (Array.isArray(old) ? old : []);
        if (!Array.isArray(dataArray)) return old;

        return {
          ...old,
          data: dataArray.map((auto) =>
            auto._id === automationId ? { ...auto, isPublished } : auto
          ),
        };
      });

      return { previousAutomations };
    },
    onError: (err, variables, context) => {
      if (context?.previousAutomations) {
        queryClient.setQueryData(['automations', page, limit, search], context.previousAutomations);
      }
      toast.error('Failed to update automation status');
      setTogglingAutomation(null);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success(
        variables.isPublished
          ? 'Automation published successfully'
          : 'Automation unpublished successfully'
      );
      setTogglingAutomation(null);
    },
  });

  const copyMutation = useMutation({
    mutationFn: (automationId) => apiClient.post(`/automations/${automationId}/copy`),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Automation copied successfully');
      if (result.data?._id) {
        router.push(`/c/automation/${result.data._id}`);
      }
    },
    onError: () => {
      toast.error('Failed to copy automation');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (automationId) => apiClient.delete(`/automations/${automationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Automation deleted successfully');
      setDeletingAutomation(null);
    },
    onError: () => {
      toast.error('Failed to delete automation');
      setDeletingAutomation(null);
    },
  });

  const handlePublish = (automation) => {
    setTogglingAutomation(automation);
    publishMutation.mutate({
      automationId: automation._id,
      isPublished: !automation.isPublished,
    });
  };

  const handleCopy = (automation) => {
    copyMutation.mutate(automation._id);
  };

  const handleDelete = (automation) => {
    setDeletingAutomation(automation);
  };

  const handleView = (automation) => {
    router.push(`/c/automation/${automation._id}`);
  };

  const handleViewStats = (automation) => {
    router.push(`/c/automation/${automation._id}/stats`);
  };

  const automations = data?.data || [];
  const pagination = data?.pagination || { page: 1, limit: 20, total: 0, pages: 0 };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Automation
          </h1>
          <p className="text-muted-foreground mt-1">
            Create and manage automated message workflows
          </p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add New Automation
        </Button>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search automations..."
              aria-label="Search automations"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12" role="status">
          <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-muted-foreground" />
          <span className="sr-only">Loading automations...</span>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Failed to load automations</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Unable to fetch automations. Please try again.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : automations.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No automations found
            </h3>
            <p className="text-muted-foreground mb-4">
              Get started by creating your first automation
            </p>
            <Button onClick={() => setIsAddModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add New Automation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Departments</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {automations.map((automation) => (
                    <TableRow
                      key={automation._id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <TableCell className="font-medium">
                        {automation.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase">
                          {automation.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {Array.isArray(automation.departments) && automation.departments.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {automation.departments.slice(0, 2).map((dept) => (
                              <Badge key={dept._id || dept} variant="secondary" className="text-xs">
                                {dept.name || dept}
                              </Badge>
                            ))}
                            {automation.departments.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{automation.departments.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No departments</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {Array.isArray(automation.channels) && automation.channels.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {automation.channels.map((channel, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {channel.channel || channel}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No channels</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={automation.isPublished ? 'default' : 'secondary'}
                        >
                          {automation.isPublished ? 'Published' : 'Unpublished'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <TooltipProvider delayDuration={300}>
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="min-h-[44px] min-w-[44px]"
                                  onClick={() => handleViewStats(automation)}
                                  aria-label={`View statistics for ${automation.name}`}
                                >
                                  <BarChart3 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Statistics</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="min-h-[44px] min-w-[44px]"
                                  onClick={() => handleView(automation)}
                                  aria-label={`View or edit ${automation.name}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View / Edit</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="min-h-[44px] min-w-[44px]"
                                  onClick={() => handlePublish(automation)}
                                  disabled={publishMutation.isPending}
                                  aria-label={automation.isPublished ? `Unpublish ${automation.name}` : `Publish ${automation.name}`}
                                >
                                  {automation.isPublished ? (
                                    <PowerOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                  ) : (
                                    <Power className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{automation.isPublished ? 'Unpublish' : 'Publish'}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="min-h-[44px] min-w-[44px]"
                                  onClick={() => handleCopy(automation)}
                                  disabled={copyMutation.isPending}
                                  aria-label={`Copy ${automation.name}`}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="min-h-[44px] min-w-[44px]"
                                  onClick={() => handleDelete(automation)}
                                  aria-label={`Delete ${automation.name}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <Pagination
              pagination={pagination}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          )}
        </>
      )}

      {/* Add Automation Modal */}
      <AddAutomationModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={(automation) => {
          setIsAddModalOpen(false);
          if (automation?._id) {
            router.push(`/c/automation/${automation._id}`);
          }
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingAutomation}
        onOpenChange={(open) => !open && setDeletingAutomation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Automation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingAutomation?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deletingAutomation._id)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
