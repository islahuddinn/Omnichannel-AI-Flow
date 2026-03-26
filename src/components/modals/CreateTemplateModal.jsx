// src/components/modals/CreateTemplateModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

// WhatsApp language codes as per Meta API
const WHATSAPP_LANGUAGE_CODES = [
  { code: 'af', name: 'Afrikaans' },
  { code: 'sq', name: 'Albanian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'bn', name: 'Bengali' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'ca', name: 'Catalan' },
  { code: 'zh_CN', name: 'Chinese (CHN)' },
  { code: 'zh_HK', name: 'Chinese (HKG)' },
  { code: 'zh_TW', name: 'Chinese (TAI)' },
  { code: 'hr', name: 'Croatian' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'en_GB', name: 'English (UK)' },
  { code: 'en_US', name: 'English (US)' },
  { code: 'et', name: 'Estonian' },
  { code: 'fil', name: 'Filipino' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'ka', name: 'Georgian' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'ha', name: 'Hausa' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ga', name: 'Irish' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'kn', name: 'Kannada' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'rw_RW', name: 'Kinyarwanda' },
  { code: 'ko', name: 'Korean' },
  { code: 'ky_KG', name: 'Kyrgyz (Kyrgyzstan)' },
  { code: 'lo', name: 'Lao' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'ms', name: 'Malay' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mr', name: 'Marathi' },
  { code: 'nb', name: 'Norwegian' },
  { code: 'fa', name: 'Persian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt_BR', name: 'Portuguese (BR)' },
  { code: 'pt_PT', name: 'Portuguese (POR)' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'es', name: 'Spanish' },
  { code: 'es_AR', name: 'Spanish (ARG)' },
  { code: 'es_ES', name: 'Spanish (SPA)' },
  { code: 'es_MX', name: 'Spanish (MEX)' },
  { code: 'sw', name: 'Swahili' },
  { code: 'sv', name: 'Swedish' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'uz', name: 'Uzbek' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'zu', name: 'Zulu' }
];

export default function CreateTemplateModal({ open, onClose, template, channels, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    channel: '',
    companyAccounts: [],
    templateLanguage: '',
    body: '',
    subject: '',
    category: '',
    parameters: [],
    isActive: true
  });

  const [newParameter, setNewParameter] = useState({ name: '', type: 'text', required: false });
  const [nameValidationError, setNameValidationError] = useState('');
  const [isNameValid, setIsNameValid] = useState(null); // null = not checked, true = valid, false = invalid

  // ✅ Helper function to normalize names: trim, collapse multiple spaces, lowercase
  const normalizeName = (name) => {
    if (!name || typeof name !== 'string') return '';
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
  };

  // Debounce template name for validation
  const debouncedTemplateName = useDebounce(formData.name, 500);

  // ✅ Check template name availability with debounced API call
  const { data: nameCheckData, isLoading: isCheckingName } = useQuery({
    queryKey: ['checkTemplateName', debouncedTemplateName, template?._id],
    queryFn: async () => {
      if (!debouncedTemplateName || debouncedTemplateName.trim().length < 2) {
        return { available: null, message: '' };
      }
      
      // Normalize the name before sending to API
      const normalizedName = normalizeName(debouncedTemplateName);
      
      const params = new URLSearchParams({
        checkName: normalizedName
      });
      
      // Exclude current template when editing
      if (template?._id) {
        params.append('excludeTemplateId', template._id);
      }
      
      const response = await apiClient.get(`/templates?${params.toString()}`);
      return response;
    },
    enabled: !!debouncedTemplateName && debouncedTemplateName.trim().length >= 2,
    retry: false,
    staleTime: 0,
  });

  // ✅ Update validation state based on API response
  useEffect(() => {
    if (!debouncedTemplateName || debouncedTemplateName.trim().length < 2) {
      setIsNameValid(null);
      setNameValidationError('');
      return;
    }

    if (isCheckingName) {
      setIsNameValid(null);
      setNameValidationError('');
      return;
    }

    if (nameCheckData) {
      const isAvailable = nameCheckData.available;
      setIsNameValid(isAvailable);
      setNameValidationError(isAvailable ? '' : (nameCheckData.message || 'Template name already exists'));
    }
  }, [debouncedTemplateName, nameCheckData, isCheckingName]);

  // Reset form when modal opens/closes or template changes
  useEffect(() => {
    if (open) {
      if (template) {
        // Edit mode
        setFormData({
          name: template.name || '',
          channel: template.channel || '',
          companyAccounts: template.companyAccounts?.map(acc => acc._id) || [],
          templateLanguage: template.templateLanguage || '',
          body: template.body || '',
          subject: template.subject || '',
          category: template.category || '',
          parameters: template.parameters || [],
          isActive: template.isActive !== false
        });
      } else {
        // Create mode - reset form
        setFormData({
          name: '',
          channel: '',
          companyAccounts: [],
          templateLanguage: '',
          body: '',
          subject: '',
          category: '',
          parameters: [],
          isActive: true
        });
      }
      setNewParameter({ name: '', type: 'text', required: false });
      // Reset validation state
      setIsNameValid(null);
      setNameValidationError('');
    }
  }, [template, open]);

  const createMutation = useMutation({
    mutationFn: (data) => apiClient.post('/templates', data),
    onSuccess: () => {
      toast.success('Template created successfully');
      onSuccess();
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to create template');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data) => apiClient.put(`/templates/${template?._id}`, data),
    onSuccess: () => {
      toast.success('Template updated successfully');
      onSuccess();
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update template');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.channel || formData.companyAccounts.length === 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    // ✅ Prevent submission if template name is not unique
    if (isNameValid === false) {
      toast.error(nameValidationError || 'Template name already exists. Please use a different name.');
      return;
    }

    // ✅ If name validation is still in progress, wait for it
    if (isCheckingName || isNameValid === null && debouncedTemplateName && debouncedTemplateName.trim().length >= 2) {
      toast.error('Please wait for template name validation to complete');
      return;
    }

    // WhatsApp-specific validation - language is mandatory only for WhatsApp
    if (formData.channel === 'whatsapp' && !formData.templateLanguage) {
      toast.error('Template language is required for WhatsApp');
      return;
    }

    // For non-WhatsApp channels, body is required
    if (formData.channel !== 'whatsapp' && !formData.body) {
      toast.error('Template body is required');
      return;
    }

    // Email-specific validation
    if (formData.channel === 'email' && !formData.subject) {
      toast.error('Subject is required for email templates');
      return;
    }

    const submitData = { ...formData };
    
    // Remove parameters for WhatsApp templates
    if (formData.channel === 'whatsapp') {
      submitData.parameters = [];
    }
    
    if (template) {
      updateMutation.mutate(submitData);
    } else {
      createMutation.mutate(submitData);
    }
  };

  const addParameter = () => {
    if (!newParameter.name.trim()) {
      toast.error('Please enter a parameter name');
      return;
    }
    
    // Check if parameter name already exists
    if (formData.parameters.some(param => param.name === newParameter.name)) {
      toast.error('Parameter name already exists');
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      parameters: [...prev.parameters, { ...newParameter }]
    }));
    setNewParameter({ name: '', type: 'text', required: false });
  };

  const removeParameter = (index) => {
    setFormData(prev => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== index)
    }));
  };

  const availableAccounts = channels.filter(channel => 
    !formData.channel || channel.type === formData.channel
  );

  const isLoading = createMutation.isPending || updateMutation.isPending;

  // Check if current channel is WhatsApp
  const isWhatsApp = formData.channel === 'whatsapp';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="!max-w-[1000px] !sm:max-w-[1000px] w-[calc(100%-2rem)] max-h-[90vh] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 p-6 flex flex-col">
        <DialogHeader className="mb-4 flex-shrink-0">
          <DialogTitle className="text-gray-900 dark:text-gray-100 text-xl font-semibold">
            {template ? 'Edit Template' : 'Create New Template'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="space-y-5 flex-1 overflow-y-auto pr-2 -mr-2 px-1">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-900 dark:text-gray-100">Template Name *</Label>
                <div className="relative">
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, name: e.target.value }));
                      // Reset validation state when user types
                      if (e.target.value.trim().length < 2) {
                        setIsNameValid(null);
                        setNameValidationError('');
                      }
                    }}
                    placeholder="Enter template name"
                    required
                    className={`bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 pr-10 ${
                      isNameValid === false 
                        ? 'border-red-500 dark:border-red-500 focus:ring-red-500 focus:border-red-500' 
                        : isNameValid === true 
                        ? 'border-green-500 dark:border-green-500 focus:ring-green-500 focus:border-green-500'
                        : ''
                    }`}
                  />
                  {/* Validation Icon */}
                  {formData.name.trim().length >= 2 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isCheckingName ? (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      ) : isNameValid === true ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : isNameValid === false ? (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      ) : null}
                    </div>
                  )}
                </div>
                {/* Validation Message */}
                {formData.name.trim().length >= 2 && nameValidationError && (
                  <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {nameValidationError}
                  </p>
                )}
                {formData.name.trim().length >= 2 && isNameValid === true && !nameValidationError && (
                  <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Template name is available
                  </p>
                )}
                {formData.name.trim().length > 0 && formData.name.trim().length < 2 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Template name must be at least 2 characters
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="channel" className="text-gray-900 dark:text-gray-100">Channel</Label>
                <Select 
                value={formData.channel} 
                onValueChange={(value) => setFormData(prev => ({ 
                  ...prev, 
                  channel: value, 
                  companyAccounts: [],
                  templateLanguage: '', // Reset language when channel changes
                  body: '',
                  subject: '',
                  parameters: [] // Reset parameters when channel changes
                }))}
              >
                <SelectTrigger className="w-full cursor-pointer bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                  <SelectValue placeholder="Select Channel" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectItem value="whatsapp" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">WhatsApp</SelectItem>
                  <SelectItem value="sms" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">SMS</SelectItem>
                  <SelectItem value="email" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">Email</SelectItem>
                  <SelectItem value="webchat" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">WebChat</SelectItem>
                </SelectContent>
              </Select>
              </div>
            </div>

            {/* Company Accounts */}
            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-100">Linked Accounts *</Label>
              {availableAccounts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700">
                  {availableAccounts.map(account => (
                    <div key={account._id} className="flex items-center space-x-2">
                      <Checkbox
                        checked={formData.companyAccounts.includes(account._id)}
                        onCheckedChange={(checked) => {
                          setFormData(prev => ({
                            ...prev,
                            companyAccounts: checked
                              ? [...prev.companyAccounts, account._id]
                              : prev.companyAccounts.filter(id => id !== account._id)
                          }));
                        }}
                        className="cursor-pointer"
                      />
                      <Label className="text-sm font-normal cursor-pointer text-gray-900 dark:text-gray-100 truncate">
                        {account.name} ({account.identifier.length > 25 ? account.identifier.substring(0, 25) + '...' : account.identifier})
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-orange-600 dark:text-orange-400 p-2 border border-orange-200 dark:border-orange-800 rounded-md bg-orange-50 dark:bg-orange-900/20">
                  No {formData.channel || 'selected channel'} accounts found. Please create an account first.
                </p>
              )}
            </div>

            {/* WhatsApp Specific - Language Dropdown */}
            {isWhatsApp && (
              <div className="space-y-2">
                <Label htmlFor="templateLanguage" className="text-gray-900 dark:text-gray-100">Template Language *</Label>
                <Select 
                  value={formData.templateLanguage} 
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    templateLanguage: value 
                  }))}
                  required
                >
                  <SelectTrigger className="cursor-pointer bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    {WHATSAPP_LANGUAGE_CODES.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code} className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
                        {lang.name} ({lang.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Language is required for WhatsApp templates as per Meta API requirements
                </p>
              </div>
            )}

            {/* Email Specific */}
            {formData.channel === 'email' && (
              <div className="space-y-2">
                <Label htmlFor="subject" className="text-gray-900 dark:text-gray-100">Email Subject *</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="Enter email subject"
                  required
                  className="bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              </div>
            )}

            {/* Template Body (Non-WhatsApp) */}
            {formData.channel && !isWhatsApp && (
              <div className="space-y-2">
                <Label htmlFor="body" className="text-gray-900 dark:text-gray-100">Template Body *</Label>
                <Textarea
                  id="body"
                  value={formData.body}
                  onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                  placeholder="Enter your template content. Use {{variable_name}} for dynamic parameters."
                  rows={6}
                  required
                  className="bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Use double curly braces with parameter names for dynamic variables, e.g., {"{{customer_name}}"}
                </p>
                {formData.parameters.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Available parameters:</p>
                    <div className="flex flex-wrap gap-1">
                      {formData.parameters.map((param, index) => (
                        <code key={index} className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                          {"{{" + param.name + "}}"}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Template Parameters (Hidden for WhatsApp) */}
            {!isWhatsApp && (
              <div className="space-y-4">
                <Label className="text-gray-900 dark:text-gray-100 text-base font-medium">Template Parameters</Label>
                
                {/* Add Parameter */}
                <div className="flex flex-col lg:flex-row gap-3 items-end">
                  <div className="flex-1 w-full lg:w-auto space-y-2">
                    <Label htmlFor="paramName" className="text-gray-900 dark:text-gray-100 text-sm">Parameter Name</Label>
                    <Input
                      id="paramName"
                      value={newParameter.name}
                      onChange={(e) => setNewParameter(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., customer_name"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addParameter();
                        }
                      }}
                      className="h-10 bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    />
                  </div>
                  <div className="w-full lg:w-32 space-y-2">
                    <Label htmlFor="paramType" className="text-gray-900 dark:text-gray-100 text-sm">Type</Label>
                    <div className="mb-0.5">
                      <Select value={newParameter.type} onValueChange={(value) => setNewParameter(prev => ({ ...prev, type: value }))}>
                        <SelectTrigger className="h-10 w-full cursor-pointer bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                          <SelectItem value="text" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">Text</SelectItem>
                          <SelectItem value="number" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">Number</SelectItem>
                          <SelectItem value="date" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">Date</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 h-10">
                    <Checkbox
                      id="paramRequired"
                      checked={newParameter.required}
                      onCheckedChange={(checked) => setNewParameter(prev => ({ ...prev, required: !!checked }))}
                      className="cursor-pointer"
                    />
                    <Label htmlFor="paramRequired" className="text-sm cursor-pointer text-gray-900 dark:text-gray-100">Required</Label>
                  </div>
                  <Button type="button" onClick={addParameter} variant="outline" className="h-10 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 w-full lg:w-auto">
                    Add
                  </Button>
                </div>

                {/* Existing Parameters */}
                {formData.parameters.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-gray-900 dark:text-gray-100">Added Parameters:</Label>
                    <div className="flex flex-wrap gap-2">
                      {formData.parameters.map((param, index) => (
                        <Badge key={index} variant="secondary" className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {param.name} ({param.type})
                          {param.required && <span className="text-red-500 dark:text-red-400">*</span>}
                          <button
                            type="button"
                            onClick={() => removeParameter(index)}
                            className="hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category" className="text-gray-900 dark:text-gray-100">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                placeholder="e.g., welcome, notification, marketing"
                className="bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>

            {/* Status */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: !!checked }))}
                className="cursor-pointer"
              />
              <Label htmlFor="isActive" className="text-sm font-normal cursor-pointer text-gray-900 dark:text-gray-100">
                Active (template will be available for use)
              </Label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 mt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 w-full sm:w-auto">
              {isLoading ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
              {!isLoading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}