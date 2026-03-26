// src/components/panels/superadmin/ChannelsList.jsx
'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Edit, Trash2, TestTube } from 'lucide-react';
import apiClient from '@/lib/api/client';
import useUIStore from '@/store/useUIStore';

export default function ChannelsList({ companyId, channels, onRefresh }) {
  const { addNotification } = useUIStore();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [formData, setFormData] = useState({});

  const createMutation = useMutation({
    mutationFn: (data) => apiClient.post(`/companies/${companyId}/channels`, data),
    onSuccess: () => {
      addNotification({
        type: 'success',
        title: 'Channel Added',
        message: 'Channel has been added successfully'
      });
      setIsAddModalOpen(false);
      onRefresh?.();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (channelId) => apiClient.delete(`/companies/${companyId}/channels/${channelId}`),
    onSuccess: () => {
      addNotification({
        type: 'success',
        title: 'Channel Removed',
        message: 'Channel has been removed successfully'
      });
      onRefresh?.();
    }
  });

  const testMutation = useMutation({
    mutationFn: (channelId) => apiClient.post(`/companies/${companyId}/channels/${channelId}/test`),
    onSuccess: (data) => {
      addNotification({
        type: data.success ? 'success' : 'error',
        title: data.success ? 'Test Successful' : 'Test Failed',
        message: data.message
      });
    }
  });

  const handleAddChannel = () => {
    setFormData({});
    setIsAddModalOpen(true);
  };

  const handleEditChannel = (channel) => {
    setFormData(channel);
    setEditingChannel(channel);
  };

  const handleSaveChannel = () => {
    if (editingChannel) {
      // Update channel
    } else {
      createMutation.mutate(formData);
    }
  };

  const getChannelIcon = (type) => {
    const icons = {
      whatsapp: '💬',
      facebook: '👤',
      instagram: '📷',
      sms: '📱',
      email: '📧',
      webchat: '🌐'
    };
    return icons[type] || '📡';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Active Channels</h3>
        <Button size="sm" type="button" onClick={handleAddChannel}>
          <Plus className="mr-2 h-4 w-4" />
          Add Channel
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Channel</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {channels.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-4">
                No channels configured
              </TableCell>
            </TableRow>
          ) : (
            channels.map((channel) => (
              <TableRow key={channel._id}>
                <TableCell>
                  <div className="flex items-center">
                    <span className="mr-2">{getChannelIcon(channel.type)}</span>
                    {channel.name}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{channel.type}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={channel.status === 'active' ? 'default' : 'secondary'}>
                    {channel.status}
                  </Badge>
                </TableCell>
                <TableCell>{channel.departmentId?.name || 'Unassigned'}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => testMutation.mutate(channel._id)}
                    >
                      <TestTube className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => handleEditChannel(channel)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => deleteMutation.mutate(channel._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Add/Edit Channel Modal */}
      <Dialog open={isAddModalOpen || !!editingChannel} onOpenChange={() => {
        setIsAddModalOpen(false);
        setEditingChannel(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingChannel ? 'Edit Channel' : 'Add New Channel'}
            </DialogTitle>
            <DialogDescription>
              Configure channel settings and credentials
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Channel Name</Label>
              <Input
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Main WhatsApp"
              />
            </div>

            <div className="space-y-2">
              <Label>Channel Type</Label>
              <select
                value={formData.type || ''}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Select Type</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="webchat">WebChat</option>
              </select>
            </div>

            {/* Dynamic credential fields based on channel type */}
            {formData.type === 'whatsapp' && (
              <>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    value={formData.credentials?.phoneNumber || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      credentials: { ...formData.credentials, phoneNumber: e.target.value }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Access Token</Label>
                  <Input
                    type="password"
                    value={formData.credentials?.token || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      credentials: { ...formData.credentials, token: e.target.value }
                    })}
                  />
                </div>
              </>
            )}

            {formData.type === 'email' && (
              <>
                <div className="space-y-2">
                  <Label>SMTP Host</Label>
                  <Input
                    value={formData.credentials?.smtpHost || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      credentials: { ...formData.credentials, smtpHost: e.target.value }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>SMTP Port</Label>
                  <Input
                    type="number"
                    value={formData.credentials?.smtpPort || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      credentials: { ...formData.credentials, smtpPort: e.target.value }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>SMTP User</Label>
                  <Input
                    value={formData.credentials?.smtpUser || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      credentials: { ...formData.credentials, smtpUser: e.target.value }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>SMTP Password</Label>
                  <Input
                    type="password"
                    value={formData.credentials?.smtpPass || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      credentials: { ...formData.credentials, smtpPass: e.target.value }
                    })}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => {
              setIsAddModalOpen(false);
              setEditingChannel(null);
            }}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveChannel}>
              {editingChannel ? 'Save Changes' : 'Add Channel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}