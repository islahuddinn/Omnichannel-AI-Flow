// src/components/automation/Step4TimingConfig.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { Save, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const TIMING_TYPES = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'schedule', label: 'Schedule' },
];

export default function Step4TimingConfig({
  formData,
  updateFormData,
  onSave,
  onNext,
  onBack,
  isCompleted,
}) {
  const [timingType, setTimingType] = useState(
    formData.timing?.type || 'immediate'
  );
  const [delay, setDelay] = useState(
    formData.timing?.delay || { days: 0, hours: 0, minutes: 0 }
  );
  const [scheduledAt, setScheduledAt] = useState(
    formData.timing?.scheduledAt || null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [lastSavedTiming, setLastSavedTiming] = useState(null);

  // Initialize from formData only once on mount
  useEffect(() => {
    if (!hasInitialized && formData.timing) {
      const initialTiming = {
        type: formData.timing.type || 'immediate',
        delay: formData.timing.delay || { days: 0, hours: 0, minutes: 0 },
        scheduledAt: formData.timing.scheduledAt || null,
      };
      setTimingType(initialTiming.type);
      setDelay(initialTiming.delay);
      setScheduledAt(initialTiming.scheduledAt);
      setLastSavedTiming(JSON.stringify(initialTiming));
      setHasInitialized(true);
    }
  }, [formData.timing, hasInitialized]);
  
  // Only update from formData if it's different from what we last saved
  // This prevents reverting user's current selection after save
  useEffect(() => {
    if (hasInitialized && formData.timing && lastSavedTiming) {
      const formTimingStr = JSON.stringify({
        type: formData.timing.type || 'immediate',
        delay: formData.timing.delay || { days: 0, hours: 0, minutes: 0 },
        scheduledAt: formData.timing.scheduledAt || null,
      });
      
      // Only update if formData is different from what we last saved
      // This means it was updated externally (not by our save)
      if (formTimingStr !== lastSavedTiming) {
        setTimingType(formData.timing.type || 'immediate');
        setDelay(formData.timing.delay || { days: 0, hours: 0, minutes: 0 });
        setScheduledAt(formData.timing.scheduledAt || null);
        setLastSavedTiming(formTimingStr);
      }
    }
  }, [formData.timing?.type, formData.timing?.delay, formData.timing?.scheduledAt, hasInitialized, lastSavedTiming]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!isCompleted) return true; // If not completed, always allow saving
    const currentTiming = JSON.stringify({
      type: timingType,
      delay: timingType === 'delayed' ? delay : { days: 0, hours: 0, minutes: 0 },
      scheduledAt: timingType === 'schedule' ? scheduledAt : null,
    });
    return currentTiming !== lastSavedTiming;
  }, [timingType, delay, scheduledAt, lastSavedTiming, isCompleted]);

  const handleSave = async () => {
    // Validate delayed timing has at least some delay
    if (timingType === 'delayed') {
      if (delay.days === 0 && delay.hours === 0 && delay.minutes === 0) {
        toast.error('Please specify a delay period (at least 1 minute)');
        return;
      }
    }
    
    // Validate schedule date is not in the past
    if (timingType === 'schedule') {
      if (!scheduledAt) {
        toast.error('Please select a scheduled date and time');
        return;
      }
      
      const scheduledDate = new Date(scheduledAt);
      const now = new Date();
      
      if (scheduledDate <= now) {
        toast.error('Scheduled date and time must be in the future');
        return;
      }
    }

    setIsSaving(true);
    try {
      const timingData = {
        type: timingType,
        delay: timingType === 'delayed' ? delay : { days: 0, hours: 0, minutes: 0 },
        scheduledAt: timingType === 'schedule' ? scheduledAt : null,
      };
      
      console.log('[Step4] Saving timing configuration:', timingData);
      
      const updatedData = { timing: timingData };
      updateFormData(updatedData);
      await onSave(updatedData);
      
      // Update lastSavedTiming to prevent reverting
      setLastSavedTiming(JSON.stringify(timingData));
      
      toast.success('Timing configuration saved successfully');
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error.message || 'Failed to save timing configuration');
    } finally {
      setIsSaving(false);
    }
  };

  // Format datetime-local input value
  const getDateTimeLocalValue = () => {
    if (!scheduledAt) return '';
    const date = new Date(scheduledAt);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleDateTimeChange = (e) => {
    const value = e.target.value;
    if (value) {
      // datetime-local input gives us local time, convert to UTC ISO string
      // Create date from local time string
      const localDate = new Date(value);
      // Convert to UTC ISO string
      setScheduledAt(localDate.toISOString());
      console.log('[Step4] Scheduled time - Local input:', value, 'UTC ISO:', localDate.toISOString());
    } else {
      setScheduledAt(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle>Timing Configuration</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Configure when messages should be sent to filtered contacts
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Timing Type */}
          <div className="space-y-2">
            <Label>Timing Type *</Label>
            <Select value={timingType} onValueChange={setTimingType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMING_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {timingType === 'immediate' &&
                'Messages will be sent immediately when contacts match the conditions'}
              {timingType === 'delayed' &&
                'Messages will be sent after the specified delay period'}
              {timingType === 'schedule' &&
                'Messages will be sent at the specified date and time'}
            </p>
          </div>

          {/* Delayed Configuration */}
          {timingType === 'delayed' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4"
            >
              <Label>Delay Period</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Days</Label>
                  <Input
                    type="number"
                    min="0"
                    value={delay.days}
                    onChange={(e) =>
                      setDelay({ ...delay, days: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hours</Label>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={delay.hours}
                    onChange={(e) =>
                      setDelay({ ...delay, hours: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Minutes</Label>
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={delay.minutes}
                    onChange={(e) =>
                      setDelay({ ...delay, minutes: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>
              
              {/* Show calculated execution time in local timezone */}
              {(delay.days > 0 || delay.hours > 0 || delay.minutes > 0) && (
                <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-2 border-blue-200 dark:border-blue-800 rounded-lg shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                        Messages will be sent at:
                      </p>
                      <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                        {(() => {
                          // Use client-side time (browser's local time) for preview
                          const now = new Date();
                          const delayMs = (delay.days * 24 * 60 * 60 * 1000) + 
                                         (delay.hours * 60 * 60 * 1000) + 
                                         (delay.minutes * 60 * 1000);
                          const scheduledTime = new Date(now.getTime() + delayMs);
                          
                          // Format in user's local timezone with full details
                          return scheduledTime.toLocaleString(undefined, {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            timeZoneName: 'short'
                          });
                        })()}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                        ⏰ Calculated based on your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Schedule Configuration */}
          {timingType === 'schedule' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-2"
            >
              <Label>Schedule Date & Time *</Label>
              <Input
                type="datetime-local"
                value={getDateTimeLocalValue()}
                onChange={handleDateTimeChange}
                min={new Date().toISOString().slice(0, 16)}
              />
              <p className="text-sm text-muted-foreground">
                Select a future date and time for message delivery
              </p>
            </motion.div>
          )}

          {/* Completion Indicator */}
          {isCompleted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg"
            >
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
            <div className="flex gap-3">
              <Button
                onClick={handleSave}
                disabled={isSaving || (isCompleted && !hasUnsavedChanges)}
                variant={isCompleted && !hasUnsavedChanges ? "outline" : "default"}
                className={cn(isCompleted && !hasUnsavedChanges && "opacity-50 cursor-not-allowed")}
              >
                {isSaving ? (
                  <>
                    <Save className="mr-2 h-4 w-4 animate-spin" />
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

