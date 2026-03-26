// src/app/c/automation/[automationId]/page.js
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Power, PowerOff, Save, Loader2, AlertTriangle, CheckCircle2, Circle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';
import { Stepper, StepperStep, useStepper } from '@/components/ui/stepper';
import Step1BasicInfo from '@/components/automation/Step1BasicInfo';
import Step2ChannelConfig from '@/components/automation/Step2ChannelConfig';
import Step3TriggerConditions from '@/components/automation/Step3TriggerConditions';
import Step5AIPrompt from '@/components/automation/Step5AIPrompt';
import OutcomesSection from '@/components/automation/OutcomesSection';
import TestingPersonas from '@/components/automation/TestingPersonas';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

export default function AutomationConfigPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const automationId = params.automationId;
  const shouldReduceMotion = useReducedMotion();

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    departments: [],
    channels: [],
    triggerConditions: {
      contactType: 'both',
      conditions: [],
    },
    timing: {
      type: 'immediate',
      delay: { days: 0, hours: 0, minutes: 0 },
      scheduledAt: null,
    },
  });

  const { data: automation, isLoading, isError, error: automationError, refetch } = useQuery({
    queryKey: ['automation', automationId],
    queryFn: async () => {
      const result = await apiClient.get(`/automations/${automationId}`);
      return result.data;
    },
    enabled: !!automationId,
    staleTime: 30 * 1000,
  });

  // Fetch AI Prompt separately
  const { data: aiPromptData, isLoading: isLoadingAiPrompt } = useQuery({
    queryKey: ['ai-prompt', automationId],
    queryFn: async () => {
      try {
        const result = await apiClient.get(`/ai-prompts?moduleId=${automationId}&moduleIdDescription=OWM`);
        // Handle both array and single object responses
        if (Array.isArray(result.data)) {
          return result.data.length > 0 ? result.data[0] : null;
        }
        return result.data || null;
      } catch (error) {
        // If 404 or no data, return null (prompt doesn't exist yet)
        if (error.response?.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!automationId,
    retry: false,
    staleTime: 30 * 1000,
  });

  // Fetch Outcomes separately
  const { data: outcomesData, isLoading: isLoadingOutcomes } = useQuery({
    queryKey: ['outcomes', automationId],
    queryFn: async () => {
      try {
        const result = await apiClient.get(`/automations/${automationId}/outcomes`);
        return result.data || [];
      } catch (error) {
        // If 404 or no data, return empty array (no outcomes yet)
        if (error.response?.status === 404) {
          return [];
        }
        throw error;
      }
    },
    enabled: !!automationId,
    retry: false,
    staleTime: 30 * 1000,
  });

  // Update completed steps when automation, aiPromptData, or outcomesData is loaded
  useEffect(() => {
    if (!automation) return;
    
    const completed = [];
    
    // Step 0: Basic Info
    if (automation.name && automation.departments?.length > 0) {
      completed.push(0);
    }
    
    // Step 1: Channels
    if (automation.channels?.length > 0) {
      completed.push(1);
    }
    
    // Step 2: Trigger Conditions & Timing
    // ✅ Check if triggerConditions has valid conditions array with at least one complete condition
    const hasValidConditions = automation.triggerConditions?.conditions && 
      Array.isArray(automation.triggerConditions.conditions) && 
      automation.triggerConditions.conditions.length > 0 &&
      automation.triggerConditions.conditions.some(cond => 
        cond.entity && cond.field && cond.selectedValue && cond.selectedValue !== ''
      );
    // ✅ Check if timing has a valid type
    const hasValidTiming = automation.timing?.type && 
      automation.timing.type !== '' &&
      (automation.timing.type === 'immediate' || 
       (automation.timing.type === 'delayed' && automation.timing.delay) ||
       (automation.timing.type === 'schedule' && automation.timing.scheduledAt));
    // ✅ Check if contactType is selected
    const hasContactType = automation.triggerConditions?.contactType && 
      automation.triggerConditions.contactType !== '';
    
    if (hasValidConditions && hasValidTiming && hasContactType) {
      completed.push(2);
    }
    
    // Step 3: AI Prompt - only check if loading is complete
    // If still loading, don't include step 3 (will be added when data loads)
    // If loading is done, check if prompt exists
    if (!isLoadingAiPrompt) {
      if (aiPromptData && aiPromptData.prompt && typeof aiPromptData.prompt === 'string' && aiPromptData.prompt.trim().length > 0) {
        completed.push(3);
      }
    }
    
    // Step 4: Outcomes - only check if loading is complete
    // If still loading, don't include step 4 (will be added when data loads)
    // If loading is done, check if at least one outcome exists
    if (!isLoadingOutcomes) {
      if (outcomesData && Array.isArray(outcomesData) && outcomesData.length > 0) {
        completed.push(4);
      }
    }
    
    setCompletedSteps(completed);
  }, [automation, aiPromptData, isLoadingAiPrompt, outcomesData, isLoadingOutcomes]);

  // Track if we've initialized formData to prevent overwriting user changes
  const [isFormDataInitialized, setIsFormDataInitialized] = useState(false);
  
  useEffect(() => {
    if (automation) {
      // ✅ Always update formData when automation data changes (after save/refetch)
      // But only if the automation has valid data that differs from current formData
      const newTriggerConditions = automation.triggerConditions || {
        contactType: '',
        conditions: [],
      };
      const newTiming = automation.timing || {
        type: '',
        delay: { days: 0, hours: 0, minutes: 0 },
        scheduledAt: null,
      };
      
      // ✅ Check if automation data has valid triggerConditions and timing
      // If so, update formData to match (this ensures saved data is reflected)
      if (!isFormDataInitialized || 
          (newTriggerConditions.contactType && 
           Array.isArray(newTriggerConditions.conditions) && 
           newTriggerConditions.conditions.length > 0 &&
           newTiming.type)) {
        setFormData({
          name: automation.name || '',
          departments: Array.isArray(automation.departments) 
            ? automation.departments.map(d => d._id || d) 
            : [],
          channels: Array.isArray(automation.channels) ? automation.channels : [],
          triggerConditions: newTriggerConditions,
          timing: newTiming,
        });
        setIsFormDataInitialized(true);
      }
      // Note: Completed steps are now set in the useEffect that watches both automation and aiPromptData
    }
  }, [automation, isFormDataInitialized]);

  const updateMutation = useMutation({
    mutationFn: (data) => apiClient.put(`/automations/${automationId}`, data),
    onSuccess: (response) => {
      // ✅ Update the query cache with the new data immediately
      // This ensures the completion check uses the latest saved data
      if (response?.data) {
        queryClient.setQueryData(['automation', automationId], response.data);
      }
      
      // Then invalidate to refetch and ensure consistency
      queryClient.invalidateQueries({ queryKey: ['automation', automationId] });
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Automation updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update automation');
    },
  });

  const publishMutation = useMutation({
    mutationFn: (isPublished) =>
      apiClient.put(`/automations/${automationId}/publish`, { isPublished }),
    onMutate: async (isPublished) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['automation', automationId] });
      
      // Snapshot the previous value
      const previousAutomation = queryClient.getQueryData(['automation', automationId]);
      
      // Optimistically update to the new value
      queryClient.setQueryData(['automation', automationId], (old) => ({
        ...old,
        isPublished,
      }));
      
      // Also update the list - update all automation list queries
      queryClient.setQueriesData({ queryKey: ['automations'] }, (old) => {
        if (!old) return old;
        
        // Handle different response structures
        const dataArray = Array.isArray(old.data) ? old.data : (Array.isArray(old) ? old : []);
        
        if (!Array.isArray(dataArray)) {
          console.warn('[AutomationConfigPage] Expected array but got:', typeof dataArray, dataArray);
          return old; // Return unchanged if data is not an array
        }
        
        return {
          ...old,
          data: dataArray.map((auto) =>
            auto._id === automationId ? { ...auto, isPublished } : auto
          ),
        };
      });
      
      // Return a context object with the snapshotted value
      return { previousAutomation };
    },
    onError: (err, isPublished, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousAutomation) {
        queryClient.setQueryData(['automation', automationId], context.previousAutomation);
      }
      toast.error(err.message || 'Failed to update automation status');
    },
    onSuccess: (data, isPublished) => {
      // Invalidate to refetch and ensure consistency
      queryClient.invalidateQueries({ queryKey: ['automation', automationId] });
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success(
        isPublished
          ? 'Automation published successfully'
          : 'Automation unpublished successfully'
      );
    },
  });

  const handleSave = async (updatedData = null) => {
    try {
      // ✅ Use updatedData if provided (from step components), otherwise use current formData
      // This ensures we check completion based on the actual data being saved, not stale state
      const dataToSave = updatedData ? { ...formData, ...updatedData } : formData;
      
      // ✅ Update completed steps IMMEDIATELY (optimistically) before save
      // This ensures Next button appears right away on first click
      setCompletedSteps((prev) => {
        const updated = [...prev];
        
        // Check if current step should be marked as complete based on the data being saved
        if (currentStep === 0) {
          // Step 0: Basic Info
          if (dataToSave.name && dataToSave.name.trim() && dataToSave.departments && dataToSave.departments.length > 0) {
            if (!updated.includes(0)) {
              updated.push(0);
            }
          }
        } else if (currentStep === 1) {
          // Step 1: Channels
          if (dataToSave.channels && Array.isArray(dataToSave.channels) && dataToSave.channels.length > 0) {
            // Check all channels are complete
            const allChannelsComplete = dataToSave.channels.every(ch => 
              ch.channel && ch.channelAccountId && ch.templateId
            );
            if (allChannelsComplete && !updated.includes(1)) {
              updated.push(1);
            }
          }
        } else if (currentStep === 2) {
          // Step 2: Trigger Conditions & Timing
          const hasValidConditions = dataToSave.triggerConditions?.conditions && 
            Array.isArray(dataToSave.triggerConditions.conditions) && 
            dataToSave.triggerConditions.conditions.length > 0 &&
            dataToSave.triggerConditions.conditions.some(cond => 
              cond.entity && cond.field && cond.selectedValue && cond.selectedValue !== ''
            );
          const hasValidTiming = dataToSave.timing?.type && dataToSave.timing.type !== '';
          const hasContactType = dataToSave.triggerConditions?.contactType && 
            dataToSave.triggerConditions.contactType !== '';
          
          if (hasValidConditions && hasValidTiming && hasContactType) {
            if (!updated.includes(2)) {
              updated.push(2);
            }
          }
        } else if (!updated.includes(currentStep)) {
          updated.push(currentStep);
        }
        
        return updated;
      });
      
      // Now perform the actual save with the merged data
      await updateMutation.mutateAsync(dataToSave);
    } catch (error) {
      console.error('[Automation] Save error:', error?.message || error);
      // On error, we could optionally remove the step from completedSteps
      // But for now, we'll keep it optimistic
    }
  };

  // ✅ Validate all steps are complete before allowing publish
  const validateAllSteps = () => {
    const errors = [];

    // Step 1: Basic Info - name and departments required
    if (!formData.name || !formData.name.trim()) {
      errors.push('Step 1: Automation name is required');
    }
    if (!formData.departments || formData.departments.length === 0) {
      errors.push('Step 1: At least one department must be selected');
    }

    // Step 2: Channels - at least one channel required with all fields
    if (!formData.channels || formData.channels.length === 0) {
      errors.push('Step 2: At least one channel must be configured');
    } else {
      formData.channels.forEach((channel, index) => {
        if (!channel.channel || !channel.channelAccountId || !channel.templateId) {
          errors.push(`Step 2: Channel ${index + 1} is incomplete. All fields (channel type, account, and template) are required.`);
        }
      });
    }

    // Step 3: Trigger Conditions and Timing
    if (!formData.triggerConditions?.contactType) {
      errors.push('Step 3: Contact type must be selected');
    }
    if (!formData.triggerConditions?.conditions || formData.triggerConditions.conditions.length === 0) {
      errors.push('Step 3: At least one trigger condition must be added');
    } else {
      formData.triggerConditions.conditions.forEach((condition, index) => {
        if (!condition.entity || !condition.field || !condition.selectedValue) {
          errors.push(`Step 3: Condition ${index + 1} is incomplete. Entity, field, and value must be selected.`);
        }
      });
    }
    if (!formData.timing?.type) {
      errors.push('Step 3: Timing type must be selected');
    }
    if (formData.timing?.type === 'delayed') {
      const delay = formData.timing.delay || { days: 0, hours: 0, minutes: 0 };
      if (delay.days === 0 && delay.hours === 0 && delay.minutes === 0) {
        errors.push('Step 3: Delay period must be specified (at least 1 minute)');
      }
    }
    if (formData.timing?.type === 'schedule') {
      if (!formData.timing.scheduledAt) {
        errors.push('Step 3: Scheduled date and time must be selected');
      } else {
        const scheduledDate = new Date(formData.timing.scheduledAt);
        const now = new Date();
        if (scheduledDate <= now) {
          errors.push('Step 3: Scheduled date and time must be in the future');
        }
      }
    }

    // Step 4: AI Prompt is optional, so no validation needed

    return errors;
  };

  // Required steps for publishing (AI Prompt is optional)
  const requiredSteps = [0, 1, 2, 4]; // Basic Info, Channels, Triggers & Timing, Outcomes

  const stepDefinitions = [
    { index: 0, label: 'Basic Info', description: 'Name & department selection', required: true },
    { index: 1, label: 'Channels', description: 'Messaging channel configuration', required: true },
    { index: 2, label: 'Triggers & Timing', description: 'Trigger conditions & timing setup', required: true },
    { index: 3, label: 'AI Prompt', description: 'AI assistance configuration', required: false },
    { index: 4, label: 'Outcomes', description: 'OWM flow & outcomes', required: true },
  ];

  const completedRequiredCount = requiredSteps.filter(s => completedSteps.includes(s)).length;
  const allRequiredComplete = completedRequiredCount === requiredSteps.length;
  const publishProgress = Math.round((completedRequiredCount / requiredSteps.length) * 100);

  const handlePublish = async () => {
    // If unpublishing, allow it without validation
    if (automation?.isPublished) {
      publishMutation.mutate(false);
      return;
    }

    // If not all required steps are complete, show the dialog
    if (!allRequiredComplete) {
      setShowPublishDialog(true);
      return;
    }

    // Validate all steps before publishing
    const validationErrors = validateAllSteps();
    if (validationErrors.length > 0) {
      setShowPublishDialog(true);
      return;
    }

    // Save and publish
    try {
      await updateMutation.mutateAsync(formData);
      publishMutation.mutate(true);
    } catch (error) {
      console.error('[Publish] Error saving before publish:', error?.message || error);
      toast.error('Failed to save automation before publishing. Please try again.');
    }
  };

  const handleGoToStep = (stepIndex) => {
    setShowPublishDialog(false);
    setCurrentStep(stepIndex);
  };

  const handleStepChange = (step) => {
    // Allow navigation to any step at any time
    setCurrentStep(step);
  };

  const updateFormData = (updates) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]" role="status">
        <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-muted-foreground" />
        <span className="sr-only">Loading automation...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Failed to load automation</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {automationError?.message || 'Unable to fetch automation details. Please try again.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/c/automation')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Automations
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Automation not found
          </h2>
          <Button onClick={() => router.push('/c/automation')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Automations
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header - Responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/c/automation')}
            className="shrink-0"
          >
            <ArrowLeft className="mr-1 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground truncate">
              {automation.name}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Configure your automation workflow
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
          <Badge
            variant={automation.isPublished ? 'default' : 'secondary'}
            className={cn(
              "text-xs sm:text-sm whitespace-nowrap",
              automation.isPublished ? 'bg-emerald-500' : ''
            )}
          >
            {automation.isPublished ? 'Published' : 'Unpublished'}
          </Badge>
          {!automation.isPublished && !allRequiredComplete && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {completedRequiredCount}/{requiredSteps.length} steps
            </span>
          )}
          <Button
            variant={automation.isPublished ? 'outline' : 'default'}
            onClick={handlePublish}
            disabled={publishMutation.isPending}
            size="sm"
            className="hover:opacity-90 dark:hover:opacity-90 transition-all text-xs sm:text-sm whitespace-nowrap"
          >
            {publishMutation.isPending ? (
              <>
                <Loader2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                <span>{automation.isPublished ? 'Unpublishing...' : 'Publishing...'}</span>
              </>
            ) : automation.isPublished ? (
              <>
                <PowerOff className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden min-[375px]:inline">Unpublish</span>
                <span className="min-[375px]:hidden">Unpub</span>
              </>
            ) : (
              <>
                <Power className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span>Publish</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stepper */}
      <Stepper currentStep={currentStep} onStepChange={handleStepChange} completedSteps={completedSteps}>
        <StepperStep label="Basic Info" description="Name & Departments">
          <Step1BasicInfo
            formData={formData}
            updateFormData={updateFormData}
            onSave={handleSave}
            onNext={() => setCurrentStep(1)}
            onBack={() => setCurrentStep(0)}
            isCompleted={completedSteps.includes(0)}
            canNavigateToStep={(step) => true}
          />
        </StepperStep>

        <StepperStep label="Channels" description="Configure messaging channels">
          <Step2ChannelConfig
            formData={formData}
            updateFormData={updateFormData}
            onSave={handleSave}
            onNext={() => setCurrentStep(2)}
            onBack={() => setCurrentStep(0)}
            isCompleted={completedSteps.includes(1)}
            canNavigateToStep={(step) => true}
          />
        </StepperStep>

        <StepperStep label="Triggers & Timing" description="Set trigger conditions and timing">
          <Step3TriggerConditions
            formData={formData}
            updateFormData={updateFormData}
            onSave={handleSave}
            onNext={() => setCurrentStep(3)}
            onBack={() => setCurrentStep(1)}
            isCompleted={completedSteps.includes(2)}
            canNavigateToStep={(step) => true}
          />
        </StepperStep>

        <StepperStep label="AI Prompt" description="Configure AI assistance">
          <Step5AIPrompt
            automationId={automationId}
            aiPromptData={aiPromptData}
            onSave={async () => {
              // Invalidate and refetch AI prompt data
              await queryClient.invalidateQueries({ queryKey: ['ai-prompt', automationId] });
              // Refetch to get updated data - the useEffect will automatically update completedSteps
              await queryClient.refetchQueries({
                queryKey: ['ai-prompt', automationId],
              });
            }}
            onBack={() => setCurrentStep(2)}
            onNext={() => setCurrentStep(4)}
            isCompleted={completedSteps.includes(3)}
            canNavigateToStep={(step) => true}
          />
        </StepperStep>

        <StepperStep label="Outcomes" description="Set OWM flow and its outcomes">
          <OutcomesSection
            automationId={automationId}
            automationName={automation?.name || 'Automation'}
            onSave={async () => {
              // Invalidate and refetch outcomes data
              await queryClient.invalidateQueries({ queryKey: ['outcomes', automationId] });
              // Refetch to get updated data - the useEffect will automatically update completedSteps
              await queryClient.refetchQueries({
                queryKey: ['outcomes', automationId],
              });
            }}
            onBack={() => setCurrentStep(3)}
            isCompleted={completedSteps.includes(4)}
            canNavigateToStep={(step) => true}
          />
        </StepperStep>
      </Stepper>

      {/* Publish Validation Dialog */}
      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Cannot Publish Automation
            </DialogTitle>
            <DialogDescription>
              All required steps must be completed before publishing. Please complete the following:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Completion Progress</span>
                <span className="font-medium text-foreground">{completedRequiredCount} of {requiredSteps.length} required</span>
              </div>
              <Progress value={publishProgress} className="h-2" />
            </div>

            <div className="space-y-1.5">
              {stepDefinitions.map((step) => {
                const isComplete = completedSteps.includes(step.index);
                const isRequired = step.required;
                return (
                  <button
                    key={step.index}
                    onClick={() => handleGoToStep(step.index)}
                    className={cn(
                      "w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors",
                      "hover:bg-accent/50",
                      !isComplete && isRequired && "bg-destructive/5 border border-destructive/20",
                      isComplete && "bg-emerald-500/10 border border-emerald-500/20",
                      !isComplete && !isRequired && "bg-muted/30 border border-border"
                    )}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-4.5 w-4.5 text-green-500 shrink-0" />
                    ) : (
                      <Circle className={cn("h-4.5 w-4.5 shrink-0", isRequired ? "text-destructive" : "text-muted-foreground")} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("text-sm font-medium", isComplete ? "text-emerald-700 dark:text-emerald-400" : "text-foreground")}>
                          {step.label}
                        </span>
                        {isRequired ? (
                          <Badge variant="outline" className={cn(
                            "text-[10px] px-1.5 py-0",
                            isComplete
                              ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                              : "border-destructive/30 text-destructive"
                          )}>
                            Required
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/30 text-muted-foreground">
                            Optional
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPublishDialog(false)} className="w-full sm:w-auto">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Testing Personas Section - Always visible at bottom, separate from stepper */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.2 }}
        className="mt-8"
      >
        <TestingPersonas
          automationId={automationId}
          isAllStepsCompleted={completedSteps.length >= 4}
        />
      </motion.div>
    </div>
  );
}

