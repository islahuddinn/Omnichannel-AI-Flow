// src/components/automation/Step5AIPrompt.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Save, ArrowLeft, ArrowRight, Check, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/client';

export default function Step5AIPrompt({
  automationId,
  aiPromptData,
  onSave,
  onBack,
  onNext,
  isCompleted,
}) {
  const [prompt, setPrompt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedPrompt, setSavedPrompt] = useState('');

  // Initialize from aiPromptData
  useEffect(() => {
    if (aiPromptData) {
      const initialPrompt = aiPromptData.prompt || '';
      setPrompt(initialPrompt);
      setSavedPrompt(initialPrompt);
    } else {
      setPrompt('');
      setSavedPrompt('');
    }
  }, [aiPromptData]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!isCompleted) return true; // If not completed, always allow saving
    const currentPrompt = prompt.trim();
    const savedPromptTrimmed = savedPrompt.trim();
    return currentPrompt !== savedPromptTrimmed;
  }, [prompt, savedPrompt, isCompleted]);

  const handleSave = async () => {
    if (!automationId) {
      toast.error('Automation ID is required');
      return;
    }

    if (!prompt.trim()) {
      toast.error('Please enter an AI prompt');
      return;
    }

    setIsSaving(true);
    try {
      const result = await apiClient.post('/ai-prompts', {
        moduleId: automationId,
        moduleIdDescription: 'OWM',
        prompt: prompt.trim(),
        isActive: true,
      });

      if (result.success) {
        // Update saved state after successful save
        setSavedPrompt(prompt.trim());
        toast.success('AI prompt saved successfully');
        await onSave();
      } else {
        throw new Error(result.error || 'Failed to save AI prompt');
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error.message || 'Failed to save AI prompt');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 min-h-[500px] sm:min-h-[600px]"
    >
      <Card className="bg-card border-border h-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <CardTitle className="text-foreground">AI Prompt Configuration</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Configure AI assistance for this automation
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* AI Prompt */}
          <div className="space-y-2">
            <Label htmlFor="ai-prompt">AI Prompt *</Label>
            <Textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter AI prompt for this automation...."
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-sm text-muted-foreground">
              This prompt will be used for AI assistance specific to this automation (OWM - One Way Messages) only.
            </p>
            <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs text-blue-800 dark:text-blue-200 font-medium mb-1">💡 Tips for writing effective prompts:</p>
              <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                <li>Be specific about the AI's role and behavior</li>
                <li>Include examples of desired responses</li>
                <li>Set clear boundaries and guidelines</li>
                <li>Keep it concise but comprehensive</li>
              </ul>
            </div>
          </div>

          {/* Completion Indicator */}
          {isCompleted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg"
            >
              <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                This section has been completed
              </span>
            </motion.div>
          )}

          {/* Actions */}
          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="flex gap-2">
              <Button 
                onClick={handleSave} 
                disabled={isSaving || (!hasUnsavedChanges && isCompleted) || !prompt.trim()}
                variant={isCompleted && !hasUnsavedChanges ? "outline" : "default"}
                className={cn(isCompleted && !hasUnsavedChanges && "opacity-50 cursor-not-allowed")}
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

