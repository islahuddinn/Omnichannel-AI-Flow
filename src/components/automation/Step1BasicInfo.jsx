// src/components/automation/Step1BasicInfo.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, Save, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function Step1BasicInfo({
  formData,
  updateFormData,
  onSave,
  onNext,
  isCompleted,
}) {
  const [name, setName] = useState(formData.name || '');
  const [selectedDepartments, setSelectedDepartments] = useState(
    formData.departments || []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedName, setSavedName] = useState(formData.name || '');
  const [savedDepartments, setSavedDepartments] = useState(formData.departments || []);

  const { data: departmentsData, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const result = await apiClient.get('/departments');
      return result.data || [];
    },
  });

  useEffect(() => {
    const initialName = formData.name || '';
    const initialDepartments = formData.departments || [];
    setName(initialName);
    setSelectedDepartments(initialDepartments);
    setSavedName(initialName);
    setSavedDepartments(initialDepartments);
  }, [formData]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!isCompleted) return true; // If not completed, always allow saving
    const currentName = name.trim();
    const savedNameTrimmed = savedName.trim();
    const nameChanged = currentName !== savedNameTrimmed;
    
    // Compare departments arrays
    const currentDepts = [...selectedDepartments].sort().join(',');
    const savedDepts = [...savedDepartments].sort().join(',');
    const departmentsChanged = currentDepts !== savedDepts;
    
    return nameChanged || departmentsChanged;
  }, [name, savedName, selectedDepartments, savedDepartments, isCompleted]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter an automation name');
      return;
    }

    if (selectedDepartments.length === 0) {
      toast.error('Please select at least one department');
      return;
    }

    setIsSaving(true);
    try {
      const trimmedName = name.trim();
      const updatedData = {
        name: trimmedName,
        departments: selectedDepartments,
      };
      updateFormData(updatedData);
      // ✅ Pass the updated data directly to onSave so it can check completion immediately
      await onSave(updatedData);
      // Update saved state after successful save
      setSavedName(trimmedName);
      setSavedDepartments([...selectedDepartments]);
      toast.success('Basic information saved successfully');
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDepartment = (departmentId) => {
    setSelectedDepartments((prev) => {
      if (prev.includes(departmentId)) {
        return prev.filter((id) => id !== departmentId);
      } else {
        return [...prev, departmentId];
      }
    });
  };

  const departments = Array.isArray(departmentsData) ? departmentsData : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 min-h-[500px] sm:min-h-[600px]"
    >
      <Card className="bg-card border-border h-full">
        <CardHeader>
          <CardTitle className="text-foreground">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Automation Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter automation name"
            />
          </div>

          {/* Departments */}
          <div className="space-y-2">
            <Label>Departments *</Label>
            <p className="text-sm text-muted-foreground">
              Select departments this automation will apply to
            </p>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading departments...</div>
            ) : departments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No departments available
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                {departments.map((dept) => (
                  <motion.div
                    key={dept._id}
                    whileHover={{ scale: 1.02 }}
                    className={`
                      flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all
                      ${
                        selectedDepartments.includes(dept._id)
                          ? 'border-primary bg-primary/5 dark:bg-primary/10 dark:border-primary/50'
                          : 'border-border hover:border-border hover:bg-muted'
                      }
                    `}
                    onClick={() => toggleDepartment(dept._id)}
                  >
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedDepartments.includes(dept._id)}
                        onCheckedChange={() => toggleDepartment(dept._id)}
                      />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        {dept.name}
                      </p>
                      {dept.description && (
                        <p className="text-sm text-muted-foreground">
                          {dept.description}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
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
            <div></div>
            <div className="flex gap-3">
              <Button
                onClick={handleSave}
                disabled={isSaving || (isCompleted && !hasUnsavedChanges) || !name.trim() || selectedDepartments.length === 0}
                variant={isCompleted && !hasUnsavedChanges ? "outline" : "default"}
                className={cn(
                  isCompleted && !hasUnsavedChanges && "opacity-50 cursor-not-allowed"
                )}
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

