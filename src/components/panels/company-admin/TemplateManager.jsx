// src/components/panels/company-admin/TemplateManager.jsx
'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MoreVertical, Edit, Trash2, Copy, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import StatusBadge from '@/components/shared/StatusBadge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CreateTemplateModal from '@/components/modals/CreateTemplateModal';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

const channelColors = {
  whatsapp: 'bg-green-100 text-green-800 border-green-200',
  sms: 'bg-blue-100 text-blue-800 border-blue-200',
  email: 'bg-purple-100 text-purple-800 border-purple-200',
  webchat: 'bg-orange-100 text-orange-800 border-orange-200'
};

export default function TemplateManager({ templates = [], channels = [] }) {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: (templateId) => apiClient.delete(`/templates/${templateId}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['templates']);
      toast.success('Template deleted successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete template');
    }
  });

  const duplicateMutation = useMutation({
    mutationFn: (templateId) => apiClient.post(`/templates/${templateId}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries(['templates']);
      toast.success('Template duplicated successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to duplicate template');
    }
  });

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.body?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesChannel = channelFilter === 'all' || template.channel === channelFilter;
    return matchesSearch && matchesChannel;
  });

  const handleDelete = (template) => {
    if (confirm(`Are you sure you want to delete "${template.name}"?`)) {
      deleteMutation.mutate(template._id);
    }
  };

  const handleDuplicate = (template) => {
    duplicateMutation.mutate(template._id);
  };

  const handleEdit = (template) => {
    setSelectedTemplate(template);
    setIsCreateModalOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedTemplate(null);
    setIsCreateModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setSelectedTemplate(null);
  };

  const handleSuccess = () => {
    queryClient.invalidateQueries(['templates']);
    setIsCreateModalOpen(false);
    setSelectedTemplate(null);
  };

  if (templates.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-8 text-center">
          <MessageSquare className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No Templates Found</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Create your first message template to streamline your communications.
          </p>
          <Button onClick={handleCreateNew} className="cursor-pointer">
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
          
          {/* Modal for empty state */}
          <CreateTemplateModal
            open={isCreateModalOpen}
            onClose={handleCloseModal}
            template={selectedTemplate}
            channels={channels}
            onSuccess={handleSuccess}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4 flex-1">
          <Input
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-40 cursor-pointer bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100">
              <SelectValue placeholder="All Channels" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectItem value="all" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">All Channels</SelectItem>
              <SelectItem value="whatsapp" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">WhatsApp</SelectItem>
              <SelectItem value="sms" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">SMS</SelectItem>
              <SelectItem value="email" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">Email</SelectItem>
              <SelectItem value="webchat" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">WebChat</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleCreateNew} className="cursor-pointer">
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </div>

      {/* Templates Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-gray-100">Message Templates</CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-400">
            Manage templates for different communication channels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <TableHead className="text-gray-900 dark:text-gray-100">Template Name</TableHead>
                <TableHead className="text-gray-900 dark:text-gray-100">Channel</TableHead>
                <TableHead className="text-gray-900 dark:text-gray-100">Accounts</TableHead>
                <TableHead className="text-gray-900 dark:text-gray-100">Content Preview</TableHead>
                <TableHead className="text-gray-900 dark:text-gray-100">Parameters</TableHead>
                <TableHead className="text-gray-900 dark:text-gray-100">Usage</TableHead>
                <TableHead className="text-gray-900 dark:text-gray-100">Status</TableHead>
                <TableHead className="text-right text-gray-900 dark:text-gray-100">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTemplates.map((template) => (
                <TableRow key={template._id} className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <TableCell className="font-medium text-gray-900 dark:text-gray-100">{template.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`capitalize ${channelColors[template.channel]} dark:bg-gray-700 dark:border-gray-600`}>
                      {template.channel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {template.companyAccounts?.slice(0, 2).map(account => (
                        <Badge key={account._id} variant="secondary" className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {account.name}
                        </Badge>
                      ))}
                      {template.companyAccounts?.length > 2 && (
                        <Badge variant="secondary" className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          +{template.companyAccounts.length - 2} more
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      {template.channel === 'whatsapp' 
                        ? `Template: ${template.templateLanguage || 'N/A'}`
                        : template.body || 'No content'
                      }
                    </div>
                  </TableCell>
                  <TableCell>
                    {template.parameters?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {template.parameters.slice(0, 3).map((param, index) => (
                          <Badge key={index} variant="outline" className="text-xs bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                            {param.name}
                          </Badge>
                        ))}
                        {template.parameters.length > 3 && (
                          <Badge variant="outline" className="text-xs bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                            +{template.parameters.length - 3}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400 text-sm">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                      {template.usageCount || 0} uses
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge isActive={template.isActive} />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                        <DropdownMenuItem onClick={() => handleEdit(template)} className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100">
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(template)} className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100">
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
                        <DropdownMenuItem 
                          onClick={() => handleDelete(template)}
                          className="text-red-600 dark:text-red-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Template Modal */}
      <CreateTemplateModal
        open={isCreateModalOpen}
        onClose={handleCloseModal}
        template={selectedTemplate}
        channels={channels}
        onSuccess={handleSuccess}
      />
    </div>
  );
}