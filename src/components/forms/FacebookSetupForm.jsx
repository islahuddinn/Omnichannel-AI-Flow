// src/components/forms/FacebookSetupForm.jsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { User, Eye, EyeOff, ArrowLeft, ArrowRight, Lightbulb } from 'lucide-react';
import DepartmentSelector from './DepartmentSelector';

export default function FacebookSetupForm({ 
  onSubmit, 
  isLoading, 
  onCancel, 
  initialData, 
  isEdit = false 
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [showToken, setShowToken] = useState(false);
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [errors, setErrors] = useState({});
  
  // ✅ FIX: Proper initialization
  const [formData, setFormData] = useState({
    name: '',
    identifier: '',
    departmentIds: [],
    credentials: { pageId: '', appId: '', appSecret: '', token: '' },
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
          pageId: initialData.credentials?.pageId || '',
          appId: initialData.credentials?.appId || '',
          appSecret: initialData.credentials?.appSecret || '',
          token: initialData.credentials?.token || '',
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
          newErrors.identifier = 'Page ID is required';
        }
        if (!formData.departmentIds || formData.departmentIds.length === 0) {
          newErrors.departmentIds = 'Please select at least one department';
        }
        if (!isEdit && (!formData.credentials.token || formData.credentials.token.trim() === '')) {
          newErrors.token = 'Access token is required';
        }
        break;
      case 2:
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
      if (currentStep < 2) {
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
    
    // Only allow submission on step 2
    if (currentStep !== 2) {
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
      validationErrors.identifier = 'Page ID is required';
    }
    
    if (!formData.departmentIds || formData.departmentIds.length === 0) {
      validationErrors.departmentIds = 'Please select at least one department';
    }
    
    if (!isEdit && (!formData.credentials.token || formData.credentials.token.trim() === '')) {
      validationErrors.token = 'Access token is required';
    }
    
    // If there are validation errors, navigate to step 1 and show errors
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setCurrentStep(1);
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
    { number: 1, title: 'Facebook Page', subtitle: 'Channel Details' },
    { number: 2, title: 'AI Prompts', subtitle: 'AI Bot Behavior' }
  ];

  // ✅ Determine which steps are completed
  const isStepCompleted = (stepNumber) => {
    switch (stepNumber) {
      case 1:
        return !!(formData.name && formData.identifier && formData.departmentIds?.length > 0 && (isEdit || formData.credentials.token));
      case 2:
        // Step 2 is optional, but consider it completed if prompts exist
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
        {/* Step 1: Facebook Page */}
        {currentStep === 1 && (
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">Facebook Page</CardTitle>
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
                <Label htmlFor="identifier" className="text-gray-900 dark:text-gray-100">Page ID *</Label>
                <Input
                  id="identifier"
                  value={formData.identifier}
                  onChange={(e) => {
                    handleChange('identifier', e.target.value);
                    if (errors.identifier) setErrors(prev => ({ ...prev, identifier: '' }));
                  }}
                  placeholder="Enter your Facebook Page ID"
                  required
                  className={`bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                    errors.identifier ? 'border-red-500 dark:border-red-500' : ''
                  }`}
                />
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

              <div className="space-y-2">
                <Label htmlFor="token" className="text-gray-900 dark:text-gray-100">
                  Access Token {!isEdit && <span className="text-red-500">*</span>}
                </Label>
                <div className="relative">
                  <Input
                    id="token"
                    type={showToken ? 'text' : 'password'}
                    value={formData.credentials.token}
                    onChange={(e) => {
                      handleChange('credentials.token', e.target.value);
                      if (errors.token) setErrors(prev => ({ ...prev, token: '' }));
                    }}
                    placeholder={isEdit ? "Leave blank to keep existing" : "Enter your Facebook access token"}
                    required={!isEdit}
                    className={`pr-10 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                      errors.token ? 'border-red-500 dark:border-red-500' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.token && (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.token}</p>
                )}
                {isEdit && !errors.token && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Leave blank to keep existing access token
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="appId" className="text-gray-900 dark:text-gray-100">App ID</Label>
                  <Input
                    id="appId"
                    value={formData.credentials.appId}
                    onChange={(e) => handleChange('credentials.appId', e.target.value)}
                    placeholder="Optional app ID"
                    className="bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="appSecret" className="text-gray-900 dark:text-gray-100">App Secret</Label>
                  <div className="relative">
                    <Input
                      id="appSecret"
                      type={showAppSecret ? 'text' : 'password'}
                      value={formData.credentials.appSecret}
                      onChange={(e) => handleChange('credentials.appSecret', e.target.value)}
                      placeholder="Optional App Secret"
                      className={`pr-10 bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAppSecret(!showAppSecret)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showAppSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: AI Bot Prompts */}
        {currentStep === 2 && (
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">AI Bot Prompts</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Configure AI responses for Facebook. These prompts guide the AI bot's behavior and responses.
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
            {currentStep === 2 && onCancel && (
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
            {currentStep < 2 ? (
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
                {isLoading ? (isEdit ? 'Updating...' : 'Connecting...') : (isEdit ? 'Update Facebook' : 'Connect Facebook')}
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
