// src/components/forms/EmailSetupForm.jsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { User, Mail, Eye, EyeOff, ArrowLeft, ArrowRight, Lightbulb } from 'lucide-react';
import DepartmentSelector from './DepartmentSelector';

export default function EmailSetupForm({ 
  onSubmit, 
  isLoading, 
  onCancel, 
  initialData, 
  isEdit = false 
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  
  // ✅ FIX: Proper initialization
  const [formData, setFormData] = useState({
    name: '',
    identifier: '',
    departmentIds: [],
    credentials: {
      smtpHost: '',
      smtpPort: '587',
      smtpUser: '',
      smtpPass: '',
      imapHost: '',
      imapPort: '993'
    },
    aiPrompts: {
      customerPrompt: '',
      handymanPrompt: ''
    }
  });

  useEffect(() => {
    if (initialData) {
      // ✅ FIX: Safely merge initial data
      setFormData(prev => ({
        ...prev,
        name: initialData.name || '',
        identifier: initialData.identifier || '',
        departmentIds: initialData.departmentIds || [],
        credentials: {
          smtpHost: initialData.credentials?.smtpHost || '',
          smtpPort: initialData.credentials?.smtpPort || '587',
          smtpUser: initialData.credentials?.smtpUser || '',
          smtpPass: initialData.credentials?.smtpPass || '',
          imapHost: initialData.credentials?.imapHost || '',
          imapPort: initialData.credentials?.imapPort || '993',
        },
        aiPrompts: {
          customerPrompt: initialData.aiPrompts?.customerPrompt || '',
          handymanPrompt: initialData.aiPrompts?.handymanPrompt || ''
        }
      }));
    }
  }, [initialData]);

  const handleChange = (field, value) => {
    if (field.includes('.')) {
      const parts = field.split('.');
      if (parts.length === 2) {
        const [parent, child] = parts;
        setFormData(prev => ({
          ...prev,
          [parent]: { 
            ...prev[parent], 
            [child]: value 
          }
        }));
      } else if (parts.length === 3) {
        const [parent, child, grandchild] = parts;
        setFormData(prev => ({
          ...prev,
          [parent]: {
            ...prev[parent],
            [child]: {
              ...prev[parent][child],
              [grandchild]: value
            }
          }
        }));
      }
    } else {
      setFormData(prev => ({ 
        ...prev, 
        [field]: value 
      }));
    }
  };

  const validateStep = (step) => {
    const newErrors = {};
    
    switch (step) {
      case 1:
        if (!formData.name || formData.name.trim() === '') {
          newErrors.name = 'Channel name is required';
        }
        if (!formData.identifier || formData.identifier.trim() === '') {
          newErrors.identifier = 'Email address is required';
        }
        if (!formData.departmentIds || formData.departmentIds.length === 0) {
          newErrors.departmentIds = 'Please select at least one department';
        }
        break;
      case 2:
        if (!formData.credentials.smtpHost || formData.credentials.smtpHost.trim() === '') {
          newErrors.smtpHost = 'SMTP Host is required';
        }
        if (!formData.credentials.smtpPort || formData.credentials.smtpPort.trim() === '') {
          newErrors.smtpPort = 'SMTP Port is required';
        }
        if (!formData.credentials.smtpUser || formData.credentials.smtpUser.trim() === '') {
          newErrors.smtpUser = 'SMTP Username is required';
        }
        if (!isEdit && (!formData.credentials.smtpPass || formData.credentials.smtpPass.trim() === '')) {
          newErrors.smtpPass = 'SMTP Password is required';
        }
        break;
      case 3:
        if (!formData.credentials.imapHost || formData.credentials.imapHost.trim() === '') {
          newErrors.imapHost = 'IMAP Host is required';
        }
        if (!formData.credentials.imapPort || formData.credentials.imapPort.trim() === '') {
          newErrors.imapPort = 'IMAP Port is required';
        }
        break;
      case 4:
        // AI prompts are optional, no validation needed
        break;
      default:
        break;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setErrors({}); // Clear errors when step is valid
      if (currentStep < 4) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setErrors({}); // Clear errors when going back
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFormSubmit = (e) => {
    // Prevent any automatic form submission
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  const handleConnectClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only allow submission on step 4
    if (currentStep !== 4) {
      return;
    }
    
    // Prevent double submission
    if (isLoading) {
      return;
    }
    
    // Validate all steps before submitting
    const validationErrors = {};
    
    // Step 1 validation
    if (!formData.name || formData.name.trim() === '') {
      validationErrors.name = 'Channel name is required';
    }
    if (!formData.identifier || formData.identifier.trim() === '') {
      validationErrors.identifier = 'Email address is required';
    }
    if (!formData.departmentIds || formData.departmentIds.length === 0) {
      validationErrors.departmentIds = 'Please select at least one department';
    }
    
    // Step 2 validation
    if (!formData.credentials.smtpHost || formData.credentials.smtpHost.trim() === '') {
      validationErrors.smtpHost = 'SMTP Host is required';
    }
    if (!formData.credentials.smtpPort || formData.credentials.smtpPort.trim() === '') {
      validationErrors.smtpPort = 'SMTP Port is required';
    }
    if (!formData.credentials.smtpUser || formData.credentials.smtpUser.trim() === '') {
      validationErrors.smtpUser = 'SMTP Username is required';
    }
    if (!isEdit && (!formData.credentials.smtpPass || formData.credentials.smtpPass.trim() === '')) {
      validationErrors.smtpPass = 'SMTP Password is required';
    }
    
    // Step 3 validation
    if (!formData.credentials.imapHost || formData.credentials.imapHost.trim() === '') {
      validationErrors.imapHost = 'IMAP Host is required';
    }
    if (!formData.credentials.imapPort || formData.credentials.imapPort.trim() === '') {
      validationErrors.imapPort = 'IMAP Port is required';
    }
    
    // If there are validation errors, navigate to the first step with errors
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      // Navigate to the first step with errors
      if (validationErrors.name || validationErrors.identifier || validationErrors.departmentIds) {
        setCurrentStep(1);
      } else if (validationErrors.smtpHost || validationErrors.smtpPort || validationErrors.smtpUser || validationErrors.smtpPass) {
        setCurrentStep(2);
      } else if (validationErrors.imapHost || validationErrors.imapPort) {
        setCurrentStep(3);
      }
      return;
    }
    
    // All validations passed, submit the form
    try {
      await onSubmit(formData);
    } catch (error) {
      console.error('Form submission error:', error);
      // Error handling is done in the parent component
    }
  };

  const steps = [
    { number: 1, title: 'Email Account', subtitle: 'Channel Details' },
    { number: 2, title: 'SMTP Configuration', subtitle: 'Outgoing' },
    { number: 3, title: 'IMAP Configuration', subtitle: 'Incoming' },
    { number: 4, title: 'AI Prompts', subtitle: 'AI Bot Behavior' }
  ];

  // ✅ Determine which steps are completed
  const isStepCompleted = (stepNumber) => {
    switch (stepNumber) {
      case 1:
        return !!(formData.name && formData.identifier && formData.departmentIds?.length > 0);
      case 2:
        return !!(formData.credentials.smtpHost && formData.credentials.smtpPort && formData.credentials.smtpUser && (isEdit || formData.credentials.smtpPass));
      case 3:
        return !!(formData.credentials.imapHost && formData.credentials.imapPort);
      case 4:
        // Step 4 is optional, but consider it completed if prompts exist
        const hasCustomerPrompt = formData.aiPrompts?.customerPrompt && formData.aiPrompts.customerPrompt.trim().length > 0;
        const hasHandymanPrompt = formData.aiPrompts?.handymanPrompt && formData.aiPrompts.handymanPrompt.trim().length > 0;
        return hasCustomerPrompt || hasHandymanPrompt;
      default:
        return false;
    }
  };

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2 sm:gap-4 py-4 overflow-x-auto">
        {steps.map((step, index) => {
          const isCompleted = isStepCompleted(step.number);
          const isCurrent = currentStep === step.number;
          const isPast = currentStep > step.number;
          
          return (
          <div key={step.number} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    isCurrent
                    ? 'bg-primary text-primary-foreground'
                      : isCompleted || isPast
                      ? 'bg-green-500 text-white' // ✅ Green for completed steps
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                  {isCompleted && !isCurrent ? '✓' : step.number}
              </div>
              <div className="mt-2 text-center">
                <div
                  className={`text-xs sm:text-sm font-medium ${
                      isCurrent
                      ? 'text-gray-900 dark:text-gray-100'
                        : isCompleted
                        ? 'text-green-600 dark:text-green-400' // ✅ Green text for completed
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {step.title}
                </div>
                <div
                  className={`text-xs mt-0.5 ${
                      isCurrent
                      ? 'text-gray-600 dark:text-gray-400'
                        : isCompleted
                        ? 'text-green-500 dark:text-green-500' // ✅ Green for completed
                      : 'text-gray-500 dark:text-gray-500'
                  }`}
                >
                  {step.subtitle}
                </div>
              </div>
            </div>
            {index < steps.length - 1 && (
              <div
                  className={`w-8 sm:w-16 h-0.5 mx-1 sm:mx-2 transition-colors ${
                    isCompleted || isPast
                      ? 'bg-green-500' // ✅ Green line for completed steps
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            )}
          </div>
          );
        })}
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-6" onKeyDown={(e) => {
        // Prevent form submission on Enter key - only allow in textareas
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
          e.preventDefault();
          e.stopPropagation();
        }
      }}>
        {/* Step 1: Email Account */}
        {currentStep === 1 && (
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">Email Account</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Configure your email account for sending and receiving
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-900 dark:text-gray-100">Channel Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => {
                      handleChange('name', e.target.value);
                      if (errors.name) setErrors(prev => ({ ...prev, name: '' }));
                    }}
                    placeholder="eg- Support WhatsApp"
                    required
                    className={`pl-10 bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                      errors.name ? 'border-red-500 dark:border-red-500' : ''
                    }`}
                  />
                </div>
                {errors.name && (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-gray-900 dark:text-gray-100">Email Address *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="identifier"
                    type="email"
                    value={formData.identifier}
                    onChange={(e) => {
                      handleChange('identifier', e.target.value);
                      if (errors.identifier) setErrors(prev => ({ ...prev, identifier: '' }));
                    }}
                    placeholder="support@company.com"
                    required
                    className={`pl-10 bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                      errors.identifier ? 'border-red-500 dark:border-red-500' : ''
                    }`}
                  />
                </div>
                {errors.identifier && (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.identifier}</p>
                )}
              </div>

              <DepartmentSelector
                value={formData.departmentIds}
                onChange={(value) => {
                  handleChange('departmentIds', value);
                  if (errors.departmentIds) setErrors(prev => ({ ...prev, departmentIds: '' }));
                }}
                required={true}
                multiple={true}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 2: SMTP Configuration (Outgoing) */}
        {currentStep === 2 && (
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">SMTP Configuration (Outgoing)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtpHost" className="text-gray-900 dark:text-gray-100">SMTP Host *</Label>
                  <Input
                    id="smtpHost"
                    value={formData.credentials.smtpHost}
                    onChange={(e) => {
                      handleChange('credentials.smtpHost', e.target.value);
                      if (errors.smtpHost) setErrors(prev => ({ ...prev, smtpHost: '' }));
                    }}
                    placeholder="smtp.gmail.com"
                    required
                    className={`bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                      errors.smtpHost ? 'border-red-500 dark:border-red-500' : ''
                    }`}
                  />
                  {errors.smtpHost && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.smtpHost}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="smtpPort" className="text-gray-900 dark:text-gray-100">SMTP Port *</Label>
                  <Input
                    id="smtpPort"
                    value={formData.credentials.smtpPort}
                    onChange={(e) => {
                      handleChange('credentials.smtpPort', e.target.value);
                      if (errors.smtpPort) setErrors(prev => ({ ...prev, smtpPort: '' }));
                    }}
                    placeholder="587"
                    required
                    className={`bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                      errors.smtpPort ? 'border-red-500 dark:border-red-500' : ''
                    }`}
                  />
                  {errors.smtpPort && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.smtpPort}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpUser" className="text-gray-900 dark:text-gray-100">SMTP Username *</Label>
                <Input
                  id="smtpUser"
                  value={formData.credentials.smtpUser}
                  onChange={(e) => {
                    handleChange('credentials.smtpUser', e.target.value);
                    if (errors.smtpUser) setErrors(prev => ({ ...prev, smtpUser: '' }));
                  }}
                  placeholder="Enter your SMTP username"
                  required
                  className={`bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                    errors.smtpUser ? 'border-red-500 dark:border-red-500' : ''
                  }`}
                />
                {errors.smtpUser && (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.smtpUser}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpPass" className="text-gray-900 dark:text-gray-100">
                  SMTP Password {!isEdit && <span className="text-red-500">*</span>}
                </Label>
                <div className="relative">
                  <Input
                    id="smtpPass"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.credentials.smtpPass}
                    onChange={(e) => {
                      handleChange('credentials.smtpPass', e.target.value);
                      if (errors.smtpPass) setErrors(prev => ({ ...prev, smtpPass: '' }));
                    }}
                    placeholder={isEdit ? "Leave blank to keep existing" : "Enter your SMTP password"}
                    required={!isEdit}
                    className={`pr-10 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                      errors.smtpPass ? 'border-red-500 dark:border-red-500' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.smtpPass && (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.smtpPass}</p>
                )}
                {isEdit && !errors.smtpPass && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Leave blank to keep existing password
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: IMAP Configuration (Incoming) */}
        {currentStep === 3 && (
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">IMAP Configuration (Incoming)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="imapHost" className="text-gray-900 dark:text-gray-100">IMAP Host *</Label>
                  <Input
                    id="imapHost"
                    value={formData.credentials.imapHost}
                    onChange={(e) => {
                      handleChange('credentials.imapHost', e.target.value);
                      if (errors.imapHost) setErrors(prev => ({ ...prev, imapHost: '' }));
                    }}
                    placeholder="imap.gmail.com"
                    required
                    className={`bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                      errors.imapHost ? 'border-red-500 dark:border-red-500' : ''
                    }`}
                  />
                  {errors.imapHost && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.imapHost}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="imapPort" className="text-gray-900 dark:text-gray-100">IMAP Port *</Label>
                  <Input
                    id="imapPort"
                    value={formData.credentials.imapPort}
                    onChange={(e) => {
                      handleChange('credentials.imapPort', e.target.value);
                      if (errors.imapPort) setErrors(prev => ({ ...prev, imapPort: '' }));
                    }}
                    placeholder="993"
                    required
                    className={`bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                      errors.imapPort ? 'border-red-500 dark:border-red-500' : ''
                    }`}
                  />
                  {errors.imapPort && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.imapPort}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: AI Bot Prompts */}
        {currentStep === 4 && (
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">AI Bot Prompts</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Configure AI responses for Email. These prompts guide the AI bot's behavior and responses.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Customer Prompt */}
              <div className="space-y-3">
                <div>
                  <Label htmlFor="customerPrompt" className="text-gray-900 dark:text-gray-100 text-base font-medium">
                    Customer AI Prompt
                  </Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Define how the AI should respond to customer inquiries on this channel
                  </p>
                </div>
                <Textarea
                  id="customerPrompt"
                  value={formData.aiPrompts.customerPrompt}
                  onChange={(e) => handleChange('aiPrompts.customerPrompt', e.target.value)}
                  placeholder="Example: You are a helpful customer support assistant. Always greet customers warmly, understand their issues, and provide accurate solutions. Be professional, empathetic, and concise in your responses...."
                  className="min-h-[150px] resize-y bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                  rows={6}
                />
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  This prompt guides AI responses for customer conversations
                </p>
              </div>

              {/* Handyman Prompt */}
              <div className="space-y-3">
                <div>
                  <Label htmlFor="handymanPrompt" className="text-gray-900 dark:text-gray-100 text-base font-medium">
                    Handyman AI Prompt
                  </Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Define how the AI should respond to handyman/technician inquiries on this channel
                  </p>
                </div>
                <Textarea
                  id="handymanPrompt"
                  value={formData.aiPrompts.handymanPrompt}
                  onChange={(e) => handleChange('aiPrompts.handymanPrompt', e.target.value)}
                  placeholder="Example: You are an AI assistant for handymen and technicians. Provide technical guidance, job details, and scheduling information. Be clear, and professional. Help them understand job requirements and provide necessary resources...."
                  className="min-h-[150px] resize-y bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                  rows={6}
                />
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  This prompt guides AI responses for handyman conversations
                </p>
              </div>

              {/* Prompt Tips */}
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Prompt Tips
                  </h4>
                </div>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <li>• Be specific about tone and style (professional, friendly, formal)</li>
                  <li>• Include guidelines for handling common scenarios</li>
                  <li>• Specify what information the AI should prioritize</li>
                  <li>• Define boundaries (what the AI should/shouldn't do)</li>
                  <li>• No character limit - write as detailed as needed</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
          <div>
            {currentStep > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={handlePrevious}
                disabled={isLoading}
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {currentStep === 4 && onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              >
                Cancel
              </Button>
            )}
            {currentStep < 4 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={isLoading}
                className="flex items-center gap-2 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Next Step
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleConnectClick}
                disabled={isLoading}
                className="flex items-center gap-2 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (isEdit ? 'Updating...' : 'Connecting...') : (isEdit ? 'Update Email' : 'Connect Email')}
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
