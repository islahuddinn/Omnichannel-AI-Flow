// src/components/forms/WhatsAppSetupForm.jsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { User, Phone, Eye, EyeOff, ArrowLeft, ArrowRight, Lightbulb } from 'lucide-react';
import DepartmentSelector from './DepartmentSelector';
import PhoneInput from '@/components/shared/PhoneInput';

export default function WhatsAppSetupForm({ 
  onSubmit, 
  isLoading, 
  onCancel, 
  initialData, 
  isEdit = false 
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [showToken, setShowToken] = useState(isEdit); // ✅ Show token by default in edit mode
  const [errors, setErrors] = useState({});
  
  // ✅ FIX: Proper initialization with default values
  const [formData, setFormData] = useState({
    name: '',
    identifier: '',
    departmentIds: [],
    credentials: {
      token: '',
      phoneNumberId: '',
    },
    aiPrompts: {
      customerPrompt: '',
      handymanPrompt: ''
    }
  });

  useEffect(() => {
    if (initialData) {
      // ✅ FIX: Safely merge initial data with defaults
      setFormData(prev => ({
        ...prev,
        name: initialData.name || '',
        identifier: initialData.identifier || '',
        departmentIds: initialData.departmentIds || [],
        credentials: {
          token: initialData.credentials?.token || '',
          phoneNumberId: initialData.credentials?.phoneNumberId || '',
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
      const [parent, child] = field.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: { 
          ...prev[parent], 
          [child]: value 
        }
      }));
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
          newErrors.identifier = 'Phone number is required';
        }
        if (!formData.departmentIds || formData.departmentIds.length === 0) {
          newErrors.departmentIds = 'Please select at least one department';
        }
        break;
      case 2:
        if (!isEdit && (!formData.credentials.token || formData.credentials.token.trim() === '')) {
          newErrors.token = 'Access token is required';
        }
        if (!formData.credentials.phoneNumberId || formData.credentials.phoneNumberId.trim() === '') {
          newErrors.phoneNumberId = 'Phone Number ID is required';
        }
        break;
      case 3:
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
      if (currentStep < 3) {
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
    
    // Only allow submission on step 3
    if (currentStep !== 3) {
      return;
    }
    
    // Prevent double submission
    if (isLoading) {
      return;
    }
    
    // Validate all steps before submitting
    const validationErrors = {};
    
    if (!formData.name || formData.name.trim() === '') {
      validationErrors.name = 'Channel name is required';
    }
    
    if (!formData.identifier || formData.identifier.trim() === '') {
      validationErrors.identifier = 'Phone number is required';
    }
    
    if (!formData.departmentIds || formData.departmentIds.length === 0) {
      validationErrors.departmentIds = 'Please select at least one department';
    }
    
    if (!isEdit && (!formData.credentials.token || formData.credentials.token.trim() === '')) {
      validationErrors.token = 'Access token is required';
    }
    
    if (!formData.credentials.phoneNumberId || formData.credentials.phoneNumberId.trim() === '') {
      validationErrors.phoneNumberId = 'Phone Number ID is required';
    }
    
    // If there are validation errors, navigate to the appropriate step and show errors
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      if (validationErrors.name || validationErrors.identifier || validationErrors.departmentIds) {
        setCurrentStep(1);
      } else if (validationErrors.token || validationErrors.phoneNumberId) {
        setCurrentStep(2);
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
    { number: 1, title: 'Basic Info', subtitle: 'Channel Details' },
    { number: 2, title: 'API Setup', subtitle: 'Meta Credentials' },
    { number: 3, title: 'AI Prompts', subtitle: 'AI Bot Behavior' }
  ];

  // ✅ Determine which steps are completed
  const isStepCompleted = (stepNumber) => {
    switch (stepNumber) {
      case 1:
        return !!(formData.name && formData.identifier && formData.departmentIds?.length > 0);
      case 2:
        return !!(formData.credentials.phoneNumberId && (isEdit || formData.credentials.token));
      case 3:
        // Step 3 is optional, but consider it completed if prompts exist
        // Check if prompts have content (not just empty strings)
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
      <div className="flex items-center justify-center gap-4 py-4">
        {steps.map((step, index) => {
          const isCompleted = isStepCompleted(step.number);
          const isCurrent = currentStep === step.number;
          const isPast = currentStep > step.number;
          
          return (
          <div key={step.number} className="flex items-center">
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
                  className={`text-sm font-medium ${
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
                  className={`w-16 h-0.5 mx-2 transition-colors ${
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
        {/* Step 1: Basic Information */}
        {currentStep === 1 && (
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">Basic Information</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Enter your WhatsApp Business account
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
                <Label htmlFor="identifier" className="text-gray-900 dark:text-gray-100">Phone Number *</Label>
                <PhoneInput
                  value={formData.identifier}
                  onChange={(val) => {
                    handleChange('identifier', val);
                    if (errors.identifier) setErrors(prev => ({ ...prev, identifier: '' }));
                  }}
                  placeholder="Enter phone number"
                  error={errors.identifier}
                />
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

        {/* Step 2: API Configuration */}
        {currentStep === 2 && (
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">API Configuration</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Get these from your Meta Business account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token" className="text-gray-900 dark:text-gray-100">
                  Access Token {!isEdit && <span className="text-red-500">*</span>}
                </Label>
                <div className="relative">
                  <Input
                    id="token"
                    type={showToken ? 'text' : 'password'}
                    value={formData.credentials.token || ''}
                    onChange={(e) => {
                      handleChange('credentials.token', e.target.value);
                      if (errors.token) setErrors(prev => ({ ...prev, token: '' }));
                    }}
                    placeholder={isEdit ? "Leave blank to keep existing token" : "Enter your WhatsApp Business API token"}
                    required={!isEdit}
                    className={`pr-10 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                      errors.token ? 'border-red-500 dark:border-red-500' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    title={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.token && (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.token}</p>
                )}
                {isEdit && !errors.token && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {formData.credentials.token ? 'Token is visible. Leave blank to keep existing token, or enter a new one to update.' : 'Leave blank to keep existing token'}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumberId" className="text-gray-900 dark:text-gray-100">
                  Phone Number ID <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="phoneNumberId"
                  value={formData.credentials.phoneNumberId}
                  onChange={(e) => {
                    handleChange('credentials.phoneNumberId', e.target.value);
                    if (errors.phoneNumberId) setErrors(prev => ({ ...prev, phoneNumberId: '' }));
                  }}
                  placeholder="Enter your WhatsApp phone number ID"
                  required
                  className={`bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                    errors.phoneNumberId ? 'border-red-500 dark:border-red-500' : ''
                  }`}
                />
                {errors.phoneNumberId && (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.phoneNumberId}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: AI Bot Prompts */}
        {currentStep === 3 && (
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">AI Bot Prompts</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Configure AI responses for WhatsApp. These prompts guide the AI bot's behavior and responses.
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
            {currentStep === 3 && onCancel && (
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
            {currentStep < 3 ? (
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
                {isLoading ? (isEdit ? 'Updating...' : 'Connecting...') : (isEdit ? 'Update WhatsApp' : 'Connect WhatsApp')}
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
