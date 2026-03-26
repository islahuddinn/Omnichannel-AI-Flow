// src/components/panels/superadmin/CompanyTable.jsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import StatusBadge from '@/components/shared/StatusBadge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { MoreVertical, Eye, Edit, Ban, Play, Trash, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import useCompanyStore from '@/store/useCompanyStore';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import socketClient from '@/lib/socket/client';

export default function CompanyTable({ 
  companies, 
  pagination, 
  onPageChange,
  onRefresh 
}) {
  const router = useRouter();
  const { suspendCompany, activateCompany } = useCompanyStore();
  const queryClient = useQueryClient();
  const [suspending, setSuspending] = useState(null);
  const [activating, setActivating] = useState(null);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);

  // ✅ Real-time socket listener for company status updates
  useEffect(() => {
    const socket = socketClient.getSuperAdminSocket();
    
    if (!socket) {
      console.log('⚠️ Super admin socket not available');
      return;
    }

    const handleCompanyUpdated = (data) => {
      console.log('✅ Company status updated via socket:', data);
      
      // Invalidate companies query to refetch
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      
      // Show toast notification
      if (data.status === 'suspended') {
        toast.success(`Company "${data.name}" has been suspended`);
      } else if (data.status === 'active') {
        toast.success(`Company "${data.name}" has been activated`);
      }
      
      // Refresh the list
      onRefresh();
    };

    socket.on('company:updated', handleCompanyUpdated);

    return () => {
      socket.off('company:updated', handleCompanyUpdated);
    };
  }, [queryClient, onRefresh]);

  const handleSuspend = async () => {
    if (!selectedCompany) return;
    
    setSuspending(selectedCompany._id);
    try {
      await suspendCompany(selectedCompany._id);
      toast.success(`Company "${selectedCompany.name}" has been suspended`);
      onRefresh();
      setSuspendDialogOpen(false);
      setSelectedCompany(null);
    } catch (error) {
      console.error('Failed to suspend company:', error);
      toast.error(error.response?.data?.message || 'Failed to suspend company');
    } finally {
      setSuspending(null);
    }
  };

  const handleActivate = async () => {
    if (!selectedCompany) return;
    
    setActivating(selectedCompany._id);
    try {
      await activateCompany(selectedCompany._id);
      toast.success(`Company "${selectedCompany.name}" has been activated`);
      onRefresh();
      setActivateDialogOpen(false);
      setSelectedCompany(null);
    } catch (error) {
      console.error('Failed to activate company:', error);
      toast.error(error.response?.data?.message || 'Failed to activate company');
    } finally {
      setActivating(null);
    }
  };

  const openSuspendDialog = (company) => {
    setSelectedCompany(company);
    setSuspendDialogOpen(true);
  };

  const openActivateDialog = (company) => {
    setSelectedCompany(company);
    setActivateDialogOpen(true);
  };

  const getStatusBadge = (status) => {
    // Map company statuses to active/inactive for StatusBadge component
    const isActive = status === 'active' || status === 'trial';
    
    // Determine labels based on status
    let activeLabel = 'Active';
    let inactiveLabel = 'Inactive';
    
    if (status === 'trial') {
      activeLabel = 'Trial';
    } else if (status === 'suspended') {
      inactiveLabel = 'Suspended';
    } else if (status === 'expired') {
      inactiveLabel = 'Expired';
    } else if (status === 'inactive') {
      inactiveLabel = 'Inactive';
    }
    
    return (
      <StatusBadge 
        isActive={isActive} 
        activeLabel={activeLabel}
        inactiveLabel={inactiveLabel}
      />
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  No companies found
                </TableCell>
              </TableRow>
            ) : (
              companies.map((company) => (
                <TableRow key={company._id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{company.name}</p>
                      <p className="text-sm text-gray-500">{company.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{company.createdBy?.firstName} {company.createdBy?.lastName}</p>
                      <p className="text-gray-500">{company.createdBy?.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {company.subscription?.plan || 'N/A'}
                  </TableCell>
                  <TableCell>
                    {company.metadata?.totalUsers || 0}
                  </TableCell>
                  <TableCell>
                    {formatDistanceToNow(new Date(company.createdAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(company.status)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          disabled={suspending === company._id}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => router.push(`/companies/${company._id}`)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => router.push(`/companies/${company._id}/edit`)}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {company.status === 'suspended' ? (
                          <DropdownMenuItem
                            onClick={() => openActivateDialog(company)}
                            className="text-green-600"
                          >
                            <Play className="mr-2 h-4 w-4" />
                            Activate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => openSuspendDialog(company)}
                            className="text-red-600"
                          >
                            <Ban className="mr-2 h-4 w-4" />
                            Suspend
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Suspend Confirmation Dialog */}
      <AlertDialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <AlertDialogContent className="sm:max-w-[550px]">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <AlertDialogTitle className="text-xl font-semibold">
                Suspend Company?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-4 text-base">
              Are you sure you want to suspend <strong>{selectedCompany?.name}</strong>?
              <br /><br />
              <span className="text-red-600 dark:text-red-400 font-medium">
                ⚠️ This action will:
              </span>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Prevent all users from accessing the system</li>
                <li>Suspend all active sessions</li>
                <li>Block all API access</li>
              </ul>
              <br />
              This action can be reversed by activating the company again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setSelectedCompany(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSuspend}
              disabled={suspending === selectedCompany?._id}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {suspending === selectedCompany?._id ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Suspending...
                </>
              ) : (
                'Suspend Company'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Activate Confirmation Dialog */}
      <AlertDialog open={activateDialogOpen} onOpenChange={setActivateDialogOpen}>
        <AlertDialogContent className="sm:max-w-[550px]">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                <Play className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <AlertDialogTitle className="text-xl font-semibold">
                Activate Company?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-4 text-base">
              Are you sure you want to activate <strong>{selectedCompany?.name}</strong>?
              <br /><br />
              <span className="text-green-600 dark:text-green-400 font-medium">
                ✅ This action will:
              </span>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Restore access for all users</li>
                <li>Reactivate all user accounts</li>
                <li>Restore API access</li>
              </ul>
              <br />
              The company will be able to use all features again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setSelectedCompany(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleActivate}
              disabled={activating === selectedCompany?._id}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {activating === selectedCompany?._id ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Activating...
                </>
              ) : (
                'Activate Company'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}