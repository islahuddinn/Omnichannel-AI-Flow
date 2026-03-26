// src/components/automation/Step2ChannelConfig.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Save, ArrowRight, ArrowLeft, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const CHANNEL_TYPES = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  // { value: 'webchat', label: 'WebChat' },
];

export default function Step2ChannelConfig({
  formData,
  updateFormData,
  onSave,
  onNext,
  onBack,
  isCompleted,
}) {
  const [channels, setChannels] = useState(formData.channels || []);
  const [isSaving, setIsSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [templateOptions, setTemplateOptions] = useState({});
  const [loadingTemplates, setLoadingTemplates] = useState({});
  const [savedChannels, setSavedChannels] = useState(formData.channels || []);

  // Get departments to filter channels
  const selectedDepartmentIds = formData.departments || [];

  // Fetch available channels for selected departments
  const { data: availableChannels, isLoading: loadingChannels } = useQuery({
    queryKey: ['channels', 'automation', selectedDepartmentIds.join(',')],
    queryFn: async () => {
      if (selectedDepartmentIds.length === 0) return [];
      
      // Fetch all channels and filter by departments
      const result = await apiClient.get('/channels');
      const allChannels = result.data || [];
      
      // Filter channels that belong to selected departments
      return allChannels.filter((channel) => {
        const channelDeptIds = channel.departmentIds?.map(d => d._id || d) || [];
        return channelDeptIds.some(deptId => selectedDepartmentIds.includes(deptId));
      });
    },
    enabled: selectedDepartmentIds.length > 0,
  });

  useEffect(() => {
    // Normalize channelAccountId to string when loading from formData
    const channelsData = formData.channels || [];
    const normalizedChannels = Array.isArray(channelsData) ? channelsData.map(ch => ({
      ...ch,
      channelAccountId: typeof ch.channelAccountId === 'object' 
        ? (ch.channelAccountId._id || ch.channelAccountId) 
        : ch.channelAccountId,
      templateId: typeof ch.templateId === 'object'
        ? (ch.templateId._id || ch.templateId)
        : ch.templateId,
    })) : [];
    setChannels(normalizedChannels);
    setSavedChannels(normalizedChannels);
  }, [formData]);

  // Helper to extract ID from object or string - must be defined before useMemo
  const extractId = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value._id) return value._id.toString();
    return value.toString();
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!isCompleted) return true; // If not completed, always allow saving
    
    // Compare channels arrays by converting to JSON strings for deep comparison
    // Include customContent (subject, body) to detect template content changes
    const currentChannelsStr = JSON.stringify(channels.map(ch => ({
      channel: ch.channel,
      channelAccountId: extractId(ch.channelAccountId),
      templateId: extractId(ch.templateId),
      customContent: ch.customContent || {}, // Include customContent for comparison
    })).sort((a, b) => a.channel?.localeCompare(b.channel || '') || 0));
    
    const savedChannelsStr = JSON.stringify(savedChannels.map(ch => ({
      channel: ch.channel,
      channelAccountId: extractId(ch.channelAccountId),
      templateId: extractId(ch.templateId),
      customContent: ch.customContent || {}, // Include customContent for comparison
    })).sort((a, b) => a.channel?.localeCompare(b.channel || '') || 0));
    
    return currentChannelsStr !== savedChannelsStr;
  }, [channels, savedChannels, isCompleted]);

  // Fetch templates for a specific channel account
  const fetchTemplates = async (channel, channelAccountId) => {
    if (!channel || !channelAccountId) return [];
    
    // Ensure channelAccountId is a string
    const accountId = extractId(channelAccountId);
    if (!accountId) return [];
    
    try {
      const result = await apiClient.get(
        `/templates?channel=${channel}&channelAccountId=${encodeURIComponent(accountId)}`
      );
      return result.data || [];
    } catch (error) {
      console.error('Fetch templates error:', error);
      return [];
    }
  };

  // Load templates for all channels
  useEffect(() => {
    const loadTemplates = async () => {
      const templates = {};
      const loading = {};
      
      for (let i = 0; i < channels.length; i++) {
        const ch = channels[i];
        const accountId = extractId(ch.channelAccountId);
        
        if (ch.channel && accountId) {
          loading[i] = true;
          setLoadingTemplates(prev => ({ ...prev, [i]: true }));
          
          try {
            templates[i] = await fetchTemplates(ch.channel, accountId);
          } catch (error) {
            console.error(`Error loading templates for channel ${i}:`, error);
            templates[i] = [];
          } finally {
            loading[i] = false;
            setLoadingTemplates(prev => ({ ...prev, [i]: false }));
          }
        } else {
          templates[i] = [];
        }
      }
      
      setTemplateOptions(templates);
    };
    
    loadTemplates();
  }, [channels.map((ch) => `${ch.channel}-${extractId(ch.channelAccountId)}`).join(',')]);

  const addChannel = () => {
    setChannels([
      ...channels,
      {
        channel: '',
        channelAccountId: '',
        templateId: '',
        customContent: { body: '', subject: '' },
        order: channels.length,
      },
    ]);
    setEditingIndex(channels.length);
  };

  const removeChannel = (index) => {
    setChannels(channels.filter((_, i) => i !== index));
    // Update order
    const updatedChannels = channels.filter((_, i) => i !== index).map((ch, idx) => ({
      ...ch,
      order: idx,
    }));
    setChannels(updatedChannels);
    
    // Clean up template options
    const newTemplateOptions = { ...templateOptions };
    delete newTemplateOptions[index];
    // Reindex
    const reindexed = {};
    Object.keys(newTemplateOptions).forEach(key => {
      const keyNum = parseInt(key);
      if (keyNum > index) {
        reindexed[keyNum - 1] = newTemplateOptions[key];
      } else if (keyNum < index) {
        reindexed[keyNum] = newTemplateOptions[key];
      }
    });
    setTemplateOptions(reindexed);
    
    if (editingIndex === index) {
      setEditingIndex(null);
    } else if (editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
  };

  const updateChannel = (index, updates) => {
    const newChannels = [...channels];
    // Normalize channelAccountId if it's an object
    if (updates.channelAccountId && typeof updates.channelAccountId === 'object') {
      updates.channelAccountId = extractId(updates.channelAccountId);
    }
    newChannels[index] = { ...newChannels[index], ...updates };
    setChannels(newChannels);
  };

  const handleChannelSelect = async (index, channel) => {
    updateChannel(index, {
      channel,
      channelAccountId: '',
      templateId: '',
      customContent: { body: '', subject: '' },
    });
  };

  const handleAccountSelect = async (index, channelAccountId) => {
    const accountId = extractId(channelAccountId);
    updateChannel(index, {
      channelAccountId: accountId,
      templateId: '',
      customContent: { body: '', subject: '' },
    });
  };

  const handleTemplateSelect = async (index, templateId) => {
    const templateIdStr = extractId(templateId);
    
    // Fetch template details
    try {
      const result = await apiClient.get(`/templates/${templateIdStr}`);
      const template = result.data;
      
      updateChannel(index, {
        templateId: templateIdStr,
        customContent: {
          body: template.body || template.templateBody || '',
          subject: template.subject || '',
        },
      });
    } catch (error) {
      console.error('Fetch template error:', error);
      toast.error('Failed to load template');
    }
  };

  const handleSave = async () => {
    // Validate channels
    if (channels.length === 0) {
      toast.error('Please add at least one channel');
      return;
    }

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (!ch.channel || !ch.channelAccountId || !ch.templateId) {
        toast.error(`Channel ${i + 1} is incomplete. Please fill all fields.`);
        return;
      }
    }

    // Check for duplicate channel identifiers
    const accountIds = channels.map((ch) => extractId(ch.channelAccountId));
    const duplicates = accountIds.filter(
      (id, index) => accountIds.indexOf(id) !== index
    );
    if (duplicates.length > 0) {
      toast.error('Each channel account can only be selected once');
      return;
    }

    // Normalize channels before saving
    const normalizedChannels = channels.map((ch, idx) => ({
      ...ch,
      channelAccountId: extractId(ch.channelAccountId),
      templateId: extractId(ch.templateId),
      order: idx,
    }));

    setIsSaving(true);
    try {
      updateFormData({ channels: normalizedChannels });
      // ✅ Pass the updated data directly to onSave so it can check completion immediately
      await onSave({ channels: normalizedChannels });
      // Update saved state after successful save
      setSavedChannels(JSON.parse(JSON.stringify(normalizedChannels))); // Deep copy
      toast.success('Channel configuration saved successfully');
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const getChannelAccounts = (channelType) => {
    if (!availableChannels) return [];
    return availableChannels.filter((ch) => ch.type === channelType);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 min-h-[500px] sm:min-h-[600px]"
    >
      <Card className="bg-card border-border h-full">
        <CardHeader>
          <CardTitle className="text-foreground">Channel Configuration</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Configure messaging channels. Order matters - first channel is primary, others are fallbacks.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {selectedDepartmentIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Departments Required
              </h3>
              <p className="text-muted-foreground max-w-md">
                Please complete Step 1 and select at least one department before configuring channels.
              </p>
            </div>
          ) : (
            <>
              {/* Channel List */}
              <div className="space-y-4">
                {loadingChannels ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none text-muted-foreground mr-3" />
                    <span className="text-muted-foreground">Loading available channels...</span>
                  </div>
                ) : availableChannels?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted border-border">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      No Channels Available
                    </h3>
                    <p className="text-muted-foreground max-w-md">
                      No channels are configured for the selected departments. Please configure channels in the Channels section first.
                    </p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {channels.map((channel, index) => {
                      const accountId = extractId(channel.channelAccountId);
                      const channelAccounts = getChannelAccounts(channel.channel);
                      const templates = templateOptions[index] || [];
                      const isLoadingTemplates = loadingTemplates[index];

                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="border rounded-lg p-4 space-y-4 border-border bg-card"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">Channel {index + 1}</h4>
                              {index === 0 && (
                                <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800/50">
                                  Primary
                                </span>
                              )}
                              {index > 0 && (
                                <span className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded border border-border">
                                  Fallback {index}
                                </span>
                              )}
                            </div>
                            {channels.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeChannel(index)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-[repeat(3,minmax(0,1fr))] gap-6">
                            {/* Channel Type */}
                            <div className="space-y-2 min-w-0">
                              <Label>Channel Type *</Label>
                              <Select
                                value={channel.channel}
                                onValueChange={(value) => handleChannelSelect(index, value)}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select channel" />
                                </SelectTrigger>
                                <SelectContent>
                                  {CHANNEL_TYPES.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>
                                      {type.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Channel Account */}
                            <div className="space-y-2 min-w-0">
                              {channel.channel ? (
                                <>
                                  <Label>Channel Account *</Label>
                                  {channelAccounts.length === 0 ? (
                                    <div className="p-3 border rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/50 min-h-[2.5rem]">
                                      <p className="text-sm text-yellow-800 dark:text-yellow-200 line-clamp-2">
                                        No {channel.channel} accounts available for selected departments
                                      </p>
                                    </div>
                                  ) : (
                                    <Select
                                      value={accountId}
                                      onValueChange={(value) =>
                                        handleAccountSelect(index, value)
                                      }
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select account" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {channelAccounts.map((acc) => (
                                          <SelectItem key={acc._id} value={acc._id}>
                                            {acc.name} ({acc.identifier})
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Label className="text-muted-foreground">Channel Account *</Label>
                                  <div className="h-10 border rounded-lg border-border bg-muted flex items-center px-3 w-full">
                                    <span className="text-sm text-muted-foreground truncate">Select channel type first</span>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Template */}
                            <div className="space-y-2 min-w-0">
                              {accountId ? (
                                <>
                                  <Label>Template *</Label>
                                  {isLoadingTemplates ? (
                                    <div className="flex items-center justify-center p-3 border rounded-lg border-border bg-muted min-h-[2.5rem]">
                                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-muted-foreground mr-2" />
                                      <span className="text-sm text-muted-foreground">Loading templates...</span>
                                    </div>
                                  ) : templates.length === 0 ? (
                                    <div className="p-3 border rounded-lg bg-muted border-border min-h-[2.5rem]">
                                      <p className="text-sm text-muted-foreground line-clamp-2">
                                        No templates available for this channel account
                                      </p>
                                    </div>
                                  ) : (
                                    <Select
                                      value={extractId(channel.templateId)}
                                      onValueChange={(value) =>
                                        handleTemplateSelect(index, value)
                                      }
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select template" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {templates.map((template) => (
                                          <SelectItem key={template._id} value={template._id}>
                                            {template.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Label className="text-muted-foreground">Template *</Label>
                                  <div className="h-10 border rounded-lg border-border bg-muted flex items-center px-3 w-full">
                                    <span className="text-sm text-muted-foreground truncate">Select account first</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Template Content Preview/Edit */}
                          {channel.templateId && channel.channel !== 'whatsapp' && (
                            <div className="mt-4 space-y-4">
                              <div className="flex items-center justify-between">
                                <Label>Template Content (Editable for OWM)</Label>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setEditingIndex(editingIndex === index ? null : index)
                                  }
                                >
                                  {editingIndex === index ? (
                                    <>
                                      <EyeOff className="h-4 w-4 mr-2" />
                                      Hide
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="h-4 w-4 mr-2" />
                                      Edit
                                    </>
                                  )}
                                </Button>
                              </div>

                              {editingIndex === index && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  className="space-y-4"
                                >
                                  {channel.channel === 'email' && (
                                    <div className="space-y-2">
                                      <Label>Subject</Label>
                                      <Input
                                        value={channel.customContent?.subject || ''}
                                        onChange={(e) =>
                                          updateChannel(index, {
                                            customContent: {
                                              ...channel.customContent,
                                              subject: e.target.value,
                                            },
                                          })
                                        }
                                        placeholder="Email subject"
                                      />
                                    </div>
                                  )}
                                  <div className="space-y-2">
                                    <Label>Body</Label>
                                    <Textarea
                                      value={channel.customContent?.body || ''}
                                      onChange={(e) =>
                                        updateChannel(index, {
                                          customContent: {
                                            ...channel.customContent,
                                            body: e.target.value,
                                          },
                                        })
                                      }
                                      placeholder="Message body"
                                      rows={6}
                                    />
                                  </div>
                                </motion.div>
                              )}

                              {editingIndex !== index && channel.customContent?.body && (
                                <div className="p-4 bg-muted rounded-lg border border-border">
                                  {channel.channel === 'email' && channel.customContent?.subject && (
                                    <div className="mb-2">
                                      <strong>Subject:</strong> {channel.customContent.subject}
                                    </div>
                                  )}
                                  <div>
                                    <strong>Body:</strong>
                                    <pre className="whitespace-pre-wrap mt-1 text-sm">
                                      {channel.customContent.body}
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {channel.templateId && channel.channel === 'whatsapp' && (
                            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-lg">
                              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                WhatsApp template content cannot be viewed or edited. The original template will be used.
                              </p>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>

              {/* Add Channel Button */}
              {availableChannels && availableChannels.length > 0 && (
                <Button variant="outline" onClick={addChannel} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Channel (Fallback)
                </Button>
              )}

              {channels.length === 0 && availableChannels && availableChannels.length > 0 && (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg border-border bg-muted">
                  <p className="text-muted-foreground mb-4">
                    No channels configured yet
                  </p>
                  <Button onClick={addChannel}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add First Channel
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Completion Indicator */}
          {isCompleted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg"
            >
              <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                ✓ This section has been completed
              </span>
            </motion.div>
          )}

          {/* Actions */}
          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="flex gap-3">
              <Button
                onClick={handleSave}
                disabled={isSaving || (!hasUnsavedChanges && isCompleted) || channels.length === 0}
                variant={isCompleted && !hasUnsavedChanges ? "outline" : "default"}
                className={isCompleted && !hasUnsavedChanges ? "opacity-50 cursor-not-allowed" : ""}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </>
                )}
              </Button>
              {isCompleted && (
                <Button onClick={onNext} className="bg-primary hover:bg-primary/90">
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
