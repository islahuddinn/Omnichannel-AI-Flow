// src/components/modals/TemplateSelectionModal.jsx
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, AlertCircle, CheckCircle2, Loader2, FileText, Send, Eye } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export default function TemplateSelectionModal({
  open,
  onClose,
  channel,
  availableAccounts,
  channelAccount,
  defaultAccountId,
  departmentId,
  onSendTemplate
}) {
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [parameters, setParameters] = useState({});
  const [emailSubject, setEmailSubject] = useState('');
  const [isSending, setIsSending] = useState(false);
  const templateListRef = useRef(null);
  const autoSelectedRef = useRef(false);

  const { user } = useAuth();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch available accounts for the channel, filtered by department
  const { data: allAccountsData, isLoading: loadingAccounts } = useQuery({
    queryKey: ['channel-accounts', channel, 'template-modal', departmentId],
    queryFn: () => {
      const params = { type: channel, status: 'active' };
      if (departmentId) {
        params.departmentId = departmentId;
      }
      return apiClient.get('/channels', { params });
    },
    enabled: !!channel && open,
    staleTime: 0,
    gcTime: 600000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  // Memoize effective accounts to prevent unnecessary re-renders
  const effectiveAccounts = useMemo(() => {
    const allFetchedAccounts = allAccountsData?.data || [];
    let accounts = [];

    if (allFetchedAccounts.length > 0) {
      accounts = allFetchedAccounts;
    } else if (availableAccounts && availableAccounts.length > 0) {
      accounts = availableAccounts;
    } else if (channelAccount) {
      accounts = [channelAccount];
    }

    if (channelAccount && !accounts.some(acc => acc._id === channelAccount._id)) {
      accounts = [channelAccount, ...accounts];
    }

    return accounts;
  }, [allAccountsData?.data, availableAccounts, channelAccount]);

  // Auto-select the account when modal opens or accounts change
  useEffect(() => {
    if (effectiveAccounts?.length > 0 && !selectedAccount) {
      if (defaultAccountId && effectiveAccounts.some(acc => String(acc._id) === String(defaultAccountId))) {
        setSelectedAccount(String(defaultAccountId));
      } else if (channelAccount && effectiveAccounts.some(acc => String(acc._id) === String(channelAccount._id))) {
        setSelectedAccount(String(channelAccount._id));
      } else {
        setSelectedAccount(String(effectiveAccounts[0]._id));
      }
    }
  }, [channelAccount, defaultAccountId, effectiveAccounts, selectedAccount]);

  // Reset all state when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedTemplate(null);
      setParameters({});
      setSearch('');
      setDebouncedSearch('');
      setEmailSubject('');
      setIsSending(false);
      setSelectedAccount('');
      autoSelectedRef.current = false;
    }
  }, [open]);

  // Reset template selection when channel or account changes
  useEffect(() => {
    setSelectedTemplate(null);
    setParameters({});
    setSearch('');
    setDebouncedSearch('');
    setEmailSubject('');
    autoSelectedRef.current = false;
  }, [channel, selectedAccount]);

  const { data: templatesData, isLoading, error, refetch } = useQuery({
    queryKey: ['templates', channel, selectedAccount],
    queryFn: () => {
      const params = { channel };
      if (selectedAccount) {
        params.channelAccountId = selectedAccount;
      }
      return apiClient.get('/templates', { params });
    },
    enabled: !!channel && !!selectedAccount && open,
    staleTime: 0,
    gcTime: 600000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: true,
    retry: 2,
  });

  // Filter templates by channel
  const templates = useMemo(() => {
    return (templatesData?.data || []).filter(t => t.channel === channel);
  }, [templatesData?.data, channel]);

  // Filter by debounced search term
  const filteredTemplates = useMemo(() => {
    return templates.filter(t =>
      t.name.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [templates, debouncedSearch]);

  // Auto-select first template when templates load
  useEffect(() => {
    if (filteredTemplates.length > 0 && !selectedTemplate && !autoSelectedRef.current) {
      autoSelectedRef.current = true;
      const first = filteredTemplates[0];
      setSelectedTemplate(first);
      if (first.parameters) {
        const initialParams = {};
        first.parameters.forEach(param => {
          initialParams[param.name] = '';
        });
        setParameters(initialParams);
      }
      setEmailSubject(first.subject || '');
    }
  }, [filteredTemplates, selectedTemplate]);

  // Render template body with parameters substituted
  const renderTemplateBody = useCallback((body, templateParams) => {
    if (!body) return '';
    let rendered = body;
    if (templateParams?.length) {
      templateParams.forEach((param) => {
        const value = parameters[param.name] || '';
        const regex = new RegExp(`{{\\s*${param.name}\\s*}}`, 'g');
        rendered = rendered.replace(regex, value || `{{${param.name}}}`);
      });
    }
    return rendered;
  }, [parameters]);

  const handleSelectTemplate = useCallback((template) => {
    setSelectedTemplate(template);
    if (template.parameters) {
      const initialParams = {};
      template.parameters.forEach(param => {
        initialParams[param.name] = '';
      });
      setParameters(initialParams);
    }
    setEmailSubject(template.subject || '');

    // Scroll to selected template
    setTimeout(() => {
      const el = document.querySelector(`[data-template-id="${template._id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  }, []);

  const handleSend = () => {
    if (!selectedAccount) {
      toast.error('Please select an account');
      return;
    }

    if (!selectedTemplate) {
      toast.error('Please select a template');
      return;
    }

    // Validate required parameters
    if (selectedTemplate.parameters) {
      const missingParams = selectedTemplate.parameters
        .filter(p => p.required && !parameters[p.name])
        .map(p => p.name);

      if (missingParams?.length > 0) {
        toast.error(`Missing required parameters: ${missingParams.join(', ')}`);
        return;
      }
    }

    setIsSending(true);

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const renderedText = renderTemplateBody(selectedTemplate.body, selectedTemplate.parameters);

    onSendTemplate({
      templateName: selectedTemplate.name,
      templateLanguage: selectedTemplate.templateLanguage || 'en_US',
      channelAccountId: selectedAccount,
      channel: channel,
      ...(channel === 'email' && {
        emailData: {
          subject: emailSubject || selectedTemplate.subject || 'No Subject',
        }
      }),
      parameters: Object.keys(parameters).map(key => ({
        name: key,
        value: parameters[key],
        type: 'text'
      })),
      renderedText,
      templateBody: selectedTemplate.body,
      tempId: tempId,
      metadata: {
        tempId: tempId,
        renderedText,
        templateBody: selectedTemplate.body
      }
    });
  };

  const renderedPreviewBody = selectedTemplate
    ? renderTemplateBody(selectedTemplate.body, selectedTemplate.parameters)
    : '';

  const channelLabel = channel ? channel.charAt(0).toUpperCase() + channel.slice(1) : '';
  const hasParams = selectedTemplate?.parameters?.length > 0;
  const needsEmailSubject = selectedTemplate && channel === 'email';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] xl:max-w-6xl lg:max-w-5xl md:max-w-4xl sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0 rounded-xl">
        {/* ─── Header ─── */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <DialogHeader className="p-0 space-y-0">
              <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Send Template Message
              </DialogTitle>
            </DialogHeader>
            {channel && (
              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold flex-shrink-0 ${
                channel === 'whatsapp' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                channel === 'email' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' :
                channel === 'sms' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' :
                'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
              }`}>
                {channel.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* ─── Account Selection ─── */}
        <div className="px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 flex-shrink-0">
          {loadingAccounts && effectiveAccounts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading accounts...
            </div>
          ) : effectiveAccounts?.length > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <Label className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Send from:
              </Label>
              <Select
                value={String(selectedAccount || '')}
                onValueChange={(value) => {
                  setSelectedAccount(value);
                  setSelectedTemplate(null);
                  setParameters({});
                }}
              >
                <SelectTrigger className="cursor-pointer h-9 w-full sm:w-auto sm:min-w-[280px] sm:max-w-md text-sm">
                  <SelectValue placeholder="Choose account" />
                </SelectTrigger>
                <SelectContent>
                  {effectiveAccounts?.map((acc) => (
                    <SelectItem key={String(acc._id)} value={String(acc._id)} className="cursor-pointer">
                      {acc.name} ({acc.identifier})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              No channel accounts configured for {channelLabel} messages.
            </div>
          )}
        </div>

        {/* ─── Main Content Area ─── */}
        {selectedAccount && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row">

            {/* ── Left: Template List ── */}
            <div className="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700">
              {/* Loading */}
              {isLoading && (
                <div className="flex-1 flex items-center justify-center py-16">
                  <div className="text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-blue-600 dark:text-blue-400 mx-auto" />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">Loading templates...</p>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-4">
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-300 text-sm font-medium">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      Failed to load templates
                    </div>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">
                      {error.response?.data?.message || error.message}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetch()}
                      className="mt-3 cursor-pointer text-xs"
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              )}

              {/* Templates */}
              {!isLoading && !error && (
                <>
                  {/* Search bar */}
                  <div className="p-3 sm:p-4 flex-shrink-0">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                      <Input
                        placeholder="Search templates..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-9 text-sm cursor-text"
                      />
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 px-0.5">
                      {filteredTemplates?.length} template{filteredTemplates?.length !== 1 ? 's' : ''} available
                    </p>
                  </div>

                  {/* Template items */}
                  <div
                    ref={templateListRef}
                    className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 max-h-[180px] sm:max-h-[220px] lg:max-h-none border-t border-gray-100 dark:border-gray-800"
                  >
                    {filteredTemplates?.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <FileText className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-3" />
                        {search ? (
                          <>
                            <p className="text-sm text-gray-500 dark:text-gray-400">No templates match &ldquo;{search}&rdquo;</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try a different search term</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm text-gray-500 dark:text-gray-400">No templates available</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              Create a template for {channelLabel} first
                            </p>
                          </>
                        )}
                      </div>
                    ) : (
                      filteredTemplates.map((template) => {
                        const isSelected = selectedTemplate?._id === template._id;
                        return (
                          <div
                            key={template._id}
                            data-template-id={template._id}
                            onClick={() => handleSelectTemplate(template)}
                            className={`px-3 sm:px-4 py-3 cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${
                              isSelected
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-l-[3px] border-l-blue-600 dark:border-l-blue-400'
                                : 'border-l-[3px] border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm font-medium truncate ${
                                  isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'
                                }`}>
                                  {template.name}
                                </p>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  {template.category && (
                                    <span className="text-[11px] leading-none px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 capitalize">
                                      {template.category}
                                    </span>
                                  )}
                                  {template.language && (
                                    <span className="text-[11px] leading-none px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                                      {template.language}
                                    </span>
                                  )}
                                  {template.parameters?.length > 0 && (
                                    <span className="text-[11px] leading-none text-gray-400 dark:text-gray-500">
                                      {template.parameters.length} param{template.parameters.length !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                              )}
                            </div>
                            {template.body && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">
                                {template.body}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ── Right: Preview + Parameters ── */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              {!selectedTemplate ? (
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="text-center">
                    <FileText className="h-10 w-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                    <p className="text-sm text-gray-400 dark:text-gray-500">Select a template to preview</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {/* Template name + metadata bar */}
                  <div className="px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/30 flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {selectedTemplate.name}
                      </h3>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {selectedTemplate.templateLanguage || 'en_US'}
                      </span>
                      {selectedTemplate.category && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 capitalize flex-shrink-0">
                          {selectedTemplate.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right panel content — scrollable */}
                  <div className="p-4 sm:p-6 space-y-5">

                    {/* Parameters + Email Subject — side by side on lg */}
                    {(hasParams || needsEmailSubject) && (
                      <div className="space-y-4">
                        {/* Email Subject */}
                        {needsEmailSubject && (
                          <div>
                            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 block">
                              Email Subject
                            </Label>
                            <Input
                              value={emailSubject}
                              onChange={(e) => setEmailSubject(e.target.value)}
                              placeholder="Enter email subject"
                              className="cursor-text h-9 text-sm"
                            />
                          </div>
                        )}

                        {/* Parameters */}
                        {hasParams && (
                          <div>
                            <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">
                              Parameters
                            </Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {selectedTemplate.parameters.map((param) => (
                                <div key={param.name}>
                                  <Label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                    {param.name}
                                    {param.required && <span className="text-red-500 ml-0.5">*</span>}
                                  </Label>
                                  <Input
                                    value={parameters[param.name] || ''}
                                    onChange={(e) => setParameters(prev => ({
                                      ...prev,
                                      [param.name]: e.target.value
                                    }))}
                                    placeholder={`Enter ${param.name}`}
                                    className={`cursor-text h-9 text-sm ${
                                      param.required && !parameters[param.name]
                                        ? 'border-red-300 dark:border-red-700'
                                        : ''
                                    }`}
                                  />
                                  {param.required && !parameters[param.name] && (
                                    <p className="text-[11px] text-red-500 dark:text-red-400 mt-0.5">Required</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Preview */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Eye className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                        <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Preview
                        </Label>
                      </div>
                      {channel === 'email' && emailSubject && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          <span className="font-medium text-gray-600 dark:text-gray-300">Subject:</span> {emailSubject}
                        </p>
                      )}
                      {selectedTemplate.body ? (
                        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 max-h-56 overflow-y-auto overflow-x-hidden">
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                            {renderedPreviewBody}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 dark:text-gray-500 italic">No body content</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Footer ─── */}
        <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 flex-shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="cursor-pointer h-9 px-5 text-sm"
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!selectedAccount || !selectedTemplate || isLoading || isSending}
            className="cursor-pointer disabled:cursor-not-allowed h-9 px-5 text-sm gap-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Send Template
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
