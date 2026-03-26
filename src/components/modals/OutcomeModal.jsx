// src/components/modals/OutcomeModal.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';

export default function OutcomeModal({
  open,
  onOpenChange,
  automationId,
  outcome,
  onSuccess
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    outcomeName: '',
    possibleOutcome: '',
    followUpAction: ''
  });
  const [initialFormData, setInitialFormData] = useState(null);

  useEffect(() => {
    if (outcome) {
      const data = {
        outcomeName: outcome.outcomeName || '',
        possibleOutcome: outcome.possibleOutcome || '',
        followUpAction: outcome.followUpAction || ''
      };
      setFormData(data);
      setInitialFormData(data);
    } else {
      setFormData({ outcomeName: '', possibleOutcome: '', followUpAction: '' });
      setInitialFormData(null);
    }
  }, [outcome, open]);

  const hasChanges = useMemo(() => {
    if (!outcome) return true;
    if (!initialFormData) return false;
    return (
      formData.outcomeName.trim() !== initialFormData.outcomeName.trim() ||
      formData.possibleOutcome.trim() !== initialFormData.possibleOutcome.trim() ||
      formData.followUpAction.trim() !== initialFormData.followUpAction.trim()
    );
  }, [formData, initialFormData, outcome]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.outcomeName.trim()) {
      toast.error('Outcome name is required');
      return;
    }
    if (formData.outcomeName.trim().length > 200) {
      toast.error('Outcome name must be 200 characters or less');
      return;
    }
    if (!formData.possibleOutcome.trim()) {
      toast.error('Possible outcome is required');
      return;
    }
    if (formData.possibleOutcome.trim().length > 500) {
      toast.error('Possible outcome must be 500 characters or less');
      return;
    }
    if (!formData.followUpAction || !formData.followUpAction.trim()) {
      toast.error('Follow-up Action (AI Prompt) is required');
      return;
    }

    setIsSaving(true);
    try {
      if (outcome?._id) {
        const result = await apiClient.put(
          `/automations/${automationId}/outcomes/${outcome._id}`,
          formData
        );
        if (result.success) {
          toast.success('Outcome updated successfully');
          onSuccess?.();
          onOpenChange(false);
        } else {
          throw new Error(result.error || 'Failed to update outcome');
        }
      } else {
        const result = await apiClient.post(
          `/automations/${automationId}/outcomes`,
          formData
        );
        if (result.success) {
          toast.success('Outcome created successfully');
          onSuccess?.();
          onOpenChange(false);
        } else {
          throw new Error(result.error || 'Failed to create outcome');
        }
      }
    } catch (error) {
      console.error('Save outcome error:', error);
      toast.error(error.message || 'Failed to save outcome');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle>
                  {outcome ? 'Edit Outcome' : 'Create New Outcome'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-2"
                >
                  <Label htmlFor="outcomeName">Outcome Name *</Label>
                  <Input
                    id="outcomeName"
                    value={formData.outcomeName}
                    onChange={(e) => setFormData({ ...formData, outcomeName: e.target.value })}
                    placeholder="e.g., Interested, Not Interested, Needs More Info"
                    maxLength={200}
                    required
                  />
                  <p className="text-xs text-muted-foreground">{formData.outcomeName.length}/200</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="space-y-2"
                >
                  <Label htmlFor="possibleOutcome">Possible Outcome *</Label>
                  <Textarea
                    id="possibleOutcome"
                    value={formData.possibleOutcome}
                    onChange={(e) => setFormData({ ...formData, possibleOutcome: e.target.value })}
                    placeholder="Describe what this outcome represents..."
                    rows={3}
                    maxLength={500}
                    required
                  />
                  <p className="text-xs text-muted-foreground">{formData.possibleOutcome.length}/500</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-2"
                >
                  <Label htmlFor="followUpAction">Follow-up Action (AI Prompt) *</Label>
                  <Textarea
                    id="followUpAction"
                    value={formData.followUpAction}
                    onChange={(e) => setFormData({ ...formData, followUpAction: e.target.value })}
                    placeholder="Enter the AI prompt for the follow-up response when this outcome is matched..."
                    rows={6}
                    className="font-mono text-sm"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    The AI bot will use this prompt to generate and send a response to the customer when this outcome is matched.
                  </p>
                </motion.div>

                <DialogFooter className="gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving || !hasChanges}>
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      outcome ? 'Update' : 'Create'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
