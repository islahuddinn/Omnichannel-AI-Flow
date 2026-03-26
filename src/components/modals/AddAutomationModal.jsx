// src/components/modals/AddAutomationModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/useDebounce';
import apiClient from '@/lib/api/client';

export default function AddAutomationModal({ isOpen, onClose, onSuccess }) {
  const [selectedType, setSelectedType] = useState(null);
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [nameValidationError, setNameValidationError] = useState('');
  const [isNameValid, setIsNameValid] = useState(null); // null = not checked, true = valid, false = invalid

  // ✅ Helper function to normalize names: trim, collapse multiple spaces, lowercase
  const normalizeName = (name) => {
    if (!name || typeof name !== 'string') return '';
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
  };

  // Debounce automation name for validation
  const debouncedName = useDebounce(name, 500);

  // ✅ Check automation name availability with debounced API call
  const { data: nameCheckData, isLoading: isCheckingName } = useQuery({
    queryKey: ['checkAutomationName', debouncedName],
    queryFn: async () => {
      if (!debouncedName || debouncedName.trim().length < 2) {
        return { available: null, message: '' };
      }
      
      // Normalize the name before sending to API
      const normalizedName = normalizeName(debouncedName);
      
      const params = new URLSearchParams({
        checkName: normalizedName
      });
      
      const response = await apiClient.get(`/automations?${params.toString()}`);
      return response;
    },
    enabled: !!debouncedName && debouncedName.trim().length >= 2,
    retry: false,
    staleTime: 0,
  });

  // ✅ Update validation state based on API response
  useEffect(() => {
    if (!debouncedName || debouncedName.trim().length < 2) {
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
      setNameValidationError(isAvailable ? '' : (nameCheckData.message || 'Automation name already exists'));
    }
  }, [debouncedName, nameCheckData, isCheckingName]);

  const automationTypes = [
    {
      id: 'owm',
      name: 'One Way Messages (OWM)',
      description: 'Send automated messages to contacts based on trigger conditions',
      icon: Zap,
    },
  ];

  const handleCreate = async () => {
    if (!selectedType) {
      toast.error('Please select an automation type');
      return;
    }

    if (!name.trim()) {
      toast.error('Please enter an automation name');
      return;
    }

    // ✅ Prevent submission if automation name is not unique
    if (isNameValid === false) {
      toast.error(nameValidationError || 'Automation name already exists. Please use a different name.');
      return;
    }

    // ✅ If name validation is still in progress, wait for it
    if (isCheckingName || (isNameValid === null && debouncedName && debouncedName.trim().length >= 2)) {
      toast.error('Please wait for automation name validation to complete');
      return;
    }

    setIsCreating(true);
    try {
      const result = await apiClient.post('/automations', {
        type: selectedType,
        name: name.trim(),
      });

      if (result.success) {
        toast.success('Automation created successfully');
        setName('');
        setSelectedType(null);
        if (onSuccess) {
          onSuccess(result.data);
        }
      } else {
        toast.error(result.error || 'Failed to create automation');
      }
    } catch (error) {
      console.error('Create automation error:', error);
      toast.error(error.message || 'Failed to create automation');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setName('');
      setSelectedType(null);
      setIsNameValid(null);
      setNameValidationError('');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={handleClose}>
          <DialogContent className="sm:max-w-[600px] max-w-[95vw] min-h-[320px] flex flex-col">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col flex-1 min-h-0"
            >
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">
                  Add New Automation
                </DialogTitle>
                <DialogDescription className="mt-2">
                  Select an automation type to get started
                </DialogDescription>
              </DialogHeader>

              <div className="mt-6 space-y-6">
                {/* Automation Name */}
                <div className="space-y-2">
                  <Label htmlFor="automation-name">Automation Name *</Label>
                  <div className="relative">
                  <Input
                    id="automation-name"
                    value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        // Reset validation state when user types
                        if (e.target.value.trim().length < 2) {
                          setIsNameValid(null);
                          setNameValidationError('');
                        }
                      }}
                    placeholder="Enter automation name"
                    disabled={isCreating}
                      className={`pr-10 ${
                        isNameValid === false 
                          ? 'border-destructive focus:ring-destructive focus:border-destructive'
                          : isNameValid === true
                          ? 'border-emerald-500 focus:ring-emerald-500 focus:border-emerald-500'
                          : ''
                      }`}
                    />
                    {/* Validation Icon */}
                    {name.trim().length >= 2 && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {isCheckingName ? (
                          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-muted-foreground" />
                        ) : isNameValid === true ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : isNameValid === false ? (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        ) : null}
                      </div>
                    )}
                  </div>
                  {/* Validation message: fixed-height slot to prevent modal resize */}
                  <div className="min-h-8 flex items-center" aria-live="polite">
                    {name.trim().length >= 2 && nameValidationError && (
                      <p className="text-sm text-destructive flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{nameValidationError}</span>
                      </p>
                    )}
                    {name.trim().length >= 2 && isNameValid === true && !nameValidationError && (
                      <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span>Automation name is available</span>
                      </p>
                    )}
                    {name.trim().length > 0 && name.trim().length < 2 && (
                      <p className="text-sm text-muted-foreground">
                        Automation name must be at least 2 characters
                      </p>
                    )}
                  </div>
                </div>

                {/* Automation Types */}
                <div className="space-y-3">
                  <Label>Select Automation Type *</Label>
                  <div className="grid gap-3">
                    {automationTypes.map((type) => {
                      const Icon = type.icon;
                      return (
                        <motion.button
                          key={type.id}
                          type="button"
                          onClick={() => setSelectedType(type.id)}
                          disabled={isCreating}
                          className={`
                            relative flex items-start gap-4 p-4 rounded-lg border-2 transition-all
                            ${
                              selectedType === type.id
                                ? 'border-primary bg-primary/5 dark:bg-primary/10 dark:border-primary/50'
                                : 'border-border hover:border-border hover:bg-muted'
                            }
                            ${isCreating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                          whileHover={!isCreating ? { scale: 1.02 } : {}}
                          whileTap={!isCreating ? { scale: 0.98 } : {}}
                        >
                          <div
                            className={`
                              w-12 h-12 rounded-lg flex items-center justify-center
                              ${
                                selectedType === type.id
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground'
                              }
                            `}
                          >
                            <Icon className="h-6 w-6" />
                          </div>
                          <div className="flex-1 text-left">
                            <h3 className="font-semibold text-foreground">
                              {type.name}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {type.description}
                            </p>
                          </div>
                          {selectedType === type.id && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                            >
                              <div className="w-2 h-2 rounded-full bg-white" />
                            </motion.div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={handleClose}
                    disabled={isCreating}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!selectedType || !name.trim() || isCreating || isNameValid === false || (isCheckingName && name.trim().length >= 2)}
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                        Creating...
                      </>
                    ) : (
                      'Create Automation'
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}

