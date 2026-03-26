'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Plus, Trash2, X, Loader2, Check, ChevronsUpDown, GripVertical, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

// Field type definitions with labels and descriptions
const FIELD_TYPES = [
  { value: 'text', label: 'Text Input', description: 'Single line text input' },
  { value: 'dropdown', label: 'Dropdown Selection', description: 'Select from options' },
];

// Get display label for a field type
function getFieldTypeLabel(type) {
  return FIELD_TYPES.find(ft => ft.value === type)?.label || type;
}

// Generate a unique field ID using crypto
function generateFieldId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export default function CustomFieldsDialog({
  isOpen,
  onClose,
  contactId,
  existingFields = {},
  editingField = null,
  onSuccess,
}) {
  const queryClient = useQueryClient();
  const [fields, setFields] = useState([]);
  const [applyToAll, setApplyToAll] = useState(false);
  const [contactType, setContactType] = useState('');
  const [contactTypes, setContactTypes] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [selectedPreviewField, setSelectedPreviewField] = useState(null);
  const [fieldComboboxOpen, setFieldComboboxOpen] = useState(false);
  const [valueComboboxOpen, setValueComboboxOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  // Clear state when modal closes
  const handleClose = () => {
    if (!isSaving) {
      setFields([]);
      setApplyToAll(false);
      setContactType('');
      setPreviewData(null);
      setSelectedPreviewField(null);
      setFieldComboboxOpen(false);
      setValueComboboxOpen(false);
      setValidationErrors({});
      onClose();
    }
  };

  // Fetch available contact types dynamically
  useEffect(() => {
    if (isOpen) {
      const fetchContactTypes = async () => {
        try {
          const response = await fetch('/api/contacts?limit=0&distinct=Contact_Type');
          const result = await response.json();
          if (result.success && result.contactTypes) {
            setContactTypes(result.contactTypes);
          } else {
            // Fallback to known types
            setContactTypes(['Handyman', 'Customer']);
          }
        } catch {
          setContactTypes(['Handyman', 'Customer']);
        }
      };
      fetchContactTypes();
    }
  }, [isOpen]);

  // Fetch preview data when contact type is selected
  useEffect(() => {
    const fetchPreview = async () => {
      if (applyToAll && contactType) {
        setIsLoadingPreview(true);
        try {
          const response = await fetch(`/api/contacts/preview?contactType=${encodeURIComponent(contactType)}`);
          const result = await response.json();

          if (result.success) {
            setPreviewData(result.data);
          } else {
            console.error('Failed to fetch preview:', result.error);
          }
        } catch (error) {
          console.error('Preview fetch error:', error);
        } finally {
          setIsLoadingPreview(false);
        }
      } else {
        setPreviewData(null);
        setSelectedPreviewField(null);
      }
    };

    fetchPreview();
  }, [applyToAll, contactType]);

  // Initialize fields from existing custom fields or editing field
  useEffect(() => {
    if (isOpen) {
      if (editingField) {
        setFields([{ id: editingField.id, ...editingField }]);
      } else {
        // Start with one new empty field (don't show existing fields)
        setFields([{ id: generateFieldId() }]);
      }
      setValidationErrors({});
    } else {
      setFields([]);
      setApplyToAll(false);
      setContactType('');
      setValidationErrors({});
    }
  }, [isOpen, editingField]);

  const addField = () => {
    setFields([...fields, { id: generateFieldId() }]);
  };

  const removeField = (fieldId) => {
    setFields(fields.filter(f => f.id !== fieldId));
    setValidationErrors(prev => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const updateField = (fieldId, updates) => {
    setFields(fields.map(f =>
      f.id === fieldId ? { ...f, ...updates } : f
    ));
    // Clear validation errors for this field when user makes changes
    if (validationErrors[fieldId]) {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const addOption = (fieldId) => {
    setFields(fields.map(f => {
      if (f.id === fieldId) {
        const options = f.options || [];
        return {
          ...f,
          options: [...options, { label: '', value: '' }]
        };
      }
      return f;
    }));
  };

  const removeOption = (fieldId, optionIndex) => {
    setFields(fields.map(f => {
      if (f.id === fieldId) {
        const options = [...(f.options || [])];
        // Capture the value BEFORE splicing
        const removedValue = options[optionIndex]?.value;
        options.splice(optionIndex, 1);
        // Clear defaultValue if the removed option was selected
        const newDefaultValue = f.defaultValue === removedValue ? undefined : f.defaultValue;
        return { ...f, options, defaultValue: newDefaultValue };
      }
      return f;
    }));
  };

  const updateOption = (fieldId, optionIndex, updates) => {
    setFields(fields.map(f => {
      if (f.id === fieldId) {
        const options = [...(f.options || [])];
        const oldOption = options[optionIndex];
        options[optionIndex] = { ...oldOption, ...updates };
        // If defaultValue was the old value, update it to the new value
        const newDefaultValue = f.defaultValue === oldOption.value && updates.value
          ? updates.value
          : f.defaultValue;
        return { ...f, options, defaultValue: newDefaultValue };
      }
      return f;
    }));
  };

  // Validate a single field and return errors
  const validateField = (field) => {
    const errors = [];

    if (!field.name || !field.name.trim()) {
      errors.push('Field name is required');
      return errors;
    }

    if (!field.type) {
      errors.push('Field type is required');
      return errors;
    }

    // Check for duplicate field names (case-insensitive)
    const nameLC = field.name.trim().toLowerCase();
    const existingNames = Object.values(existingFields)
      .filter((_, idx) => {
        const existingId = Object.keys(existingFields)[idx];
        return existingId !== field.id; // Exclude the field being edited
      })
      .map(f => f.name?.toLowerCase());

    const otherFieldNames = fields
      .filter(f => f.id !== field.id && f.name)
      .map(f => f.name.trim().toLowerCase());

    if (existingNames.includes(nameLC) || otherFieldNames.includes(nameLC)) {
      errors.push('A field with this name already exists');
    }

    // Type-specific validation
    if (field.type === 'dropdown') {
      if (!field.options || field.options.length === 0) {
        errors.push('At least one option is required');
      } else {
        const validOptions = field.options.filter(opt => opt.value?.trim() && opt.label?.trim());
        if (validOptions.length === 0) {
          errors.push('At least one option with label and value is required');
        }
      }
    }

    return errors;
  };

  const handleSave = async () => {
    // Validate all fields
    const validFields = fields.filter(f => f.name && f.name.trim());
    if (validFields.length === 0) {
      toast.error('Please add at least one field with a name');
      return;
    }

    // Run validation
    const newErrors = {};
    let hasErrors = false;
    for (const field of validFields) {
      const fieldErrors = validateField(field);
      if (fieldErrors.length > 0) {
        newErrors[field.id] = fieldErrors;
        hasErrors = true;
      }
    }

    setValidationErrors(newErrors);
    if (hasErrors) {
      toast.error('Please fix the validation errors');
      return;
    }

    if (applyToAll && !contactType) {
      toast.error('Please select a contact type');
      return;
    }

    setIsSaving(true);

    try {
      if (editingField) {
        // Editing a single field
        const field = validFields[0];
        const validOptions = field.options?.filter(opt => opt.value?.trim()) || [];

        const fieldData = {
          name: field.name.trim(),
          type: field.type,
          value: getFieldValue(field),
          options: field.type === 'dropdown' ? validOptions : undefined,
          defaultValue: field.type === 'dropdown' ? field.defaultValue : undefined,
        };

        const response = await fetch(`/api/contacts/${contactId}/custom-fields/${field.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fieldData,
            applyToAll,
            contactType: applyToAll ? contactType : undefined,
          }),
        });

        const result = await response.json();

        if (result.success) {
          toast.success('Custom field updated successfully');
          queryClient.invalidateQueries({ queryKey: ['contact', contactId] });
          if (onSuccess) onSuccess();
          handleClose();
        } else {
          toast.error(result.error || 'Failed to update custom field');
        }
      } else {
        // Creating new fields
        const fieldsData = {};
        validFields.forEach(field => {
          const validOptions = field.options?.filter(opt => opt.value?.trim()) || [];

          fieldsData[field.id] = {
            name: field.name.trim(),
            type: field.type,
            value: getFieldValue(field),
            options: field.type === 'dropdown' ? validOptions : undefined,
            defaultValue: field.type === 'dropdown' ? field.defaultValue : undefined,
          };
        });

        const response = await fetch(`/api/contacts/${contactId}/custom-fields`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customFields: fieldsData,
            applyToAll,
            contactType: applyToAll ? contactType : undefined,
          }),
        });

        const result = await response.json();

        if (result.success) {
          toast.success('Custom fields saved successfully');
          queryClient.invalidateQueries({ queryKey: ['contact', contactId] });
          if (onSuccess) onSuccess();
          handleClose();
        } else {
          toast.error(result.error || 'Failed to save custom fields');
        }
      }
    } catch (error) {
      console.error('Save custom fields error:', error);
      toast.error('Failed to save custom fields');
    } finally {
      setIsSaving(false);
    }
  };

  // Get the value to save based on field type
  const getFieldValue = (field) => {
    if (field.type === 'dropdown') {
      return field.defaultValue || '';
    }
    return field.value || '';
  };

  // Render the value input based on field type
  const renderValueInput = (field) => {
    if (field.type === 'text') {
      return (
        <div className="space-y-2">
          <Label htmlFor={`field-value-${field.id}`}>Value</Label>
          <Input
            id={`field-value-${field.id}`}
            value={field.value || ''}
            onChange={(e) => updateField(field.id, { value: e.target.value })}
            placeholder="Enter value (optional)"
            disabled={isSaving}
          />
        </div>
      );
    }

    if (field.type === 'dropdown') {
      return renderDropdownOptions(field);
    }

    return null;
  };

  // Render dropdown-specific options UI
  const renderDropdownOptions = (field) => {
    const validOptions = (field.options || []).filter(opt => opt.value?.trim());

    return (
      <div className="space-y-4">
        {/* Options Section */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <span>Dropdown Options *</span>
          </Label>
          <div className="space-y-2 border rounded-lg p-3 bg-gray-50 dark:bg-gray-800">
            <AnimatePresence mode="popLayout">
              {(field.options || []).map((option, optIndex) => (
                <motion.div
                  key={optIndex}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10, transition: { duration: 0.2 } }}
                  className="flex gap-2"
                >
                  <Input
                    value={option.label || ''}
                    onChange={(e) => updateOption(field.id, optIndex, { label: e.target.value })}
                    placeholder="Option label"
                    disabled={isSaving}
                    className="flex-1"
                  />
                  <Input
                    value={option.value || ''}
                    onChange={(e) => updateOption(field.id, optIndex, { value: e.target.value })}
                    placeholder="Option value"
                    disabled={isSaving}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOption(field.id, optIndex)}
                    disabled={isSaving}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addOption(field.id)}
              disabled={isSaving}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Option
            </Button>
          </div>
        </div>

        {/* Default Selection - Only show if there are valid options */}
        {validOptions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <Label htmlFor={`default-value-${field.id}`}>Default Selection</Label>
            <Select
              value={field.defaultValue || undefined}
              onValueChange={(value) => updateField(field.id, { defaultValue: value })}
              disabled={isSaving}
            >
              <SelectTrigger id={`default-value-${field.id}`}>
                <SelectValue placeholder="Select default value (optional)" />
              </SelectTrigger>
              <SelectContent>
                {validOptions.map((option, optIndex) => (
                  <SelectItem key={optIndex} value={option.value}>
                    {option.label || option.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </motion.div>
        )}
      </div>
    );
  };

  // Animation variants
  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: -20 },
    visible: {
      opacity: 1, scale: 1, y: 0,
      transition: { type: 'spring', damping: 25, stiffness: 300, duration: 0.3 },
    },
    exit: { opacity: 0, scale: 0.95, y: -20, transition: { duration: 0.2 } },
  };

  const fieldVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: (i) => ({
      opacity: 1, y: 0,
      transition: { delay: i * 0.05, duration: 0.3 },
    }),
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={handleClose}>
          <DialogContent className="sm:max-w-[900px] max-w-[95vw] p-0 overflow-hidden">
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="p-6 max-h-[90vh] overflow-y-auto"
            >
              <DialogHeader className="mb-6">
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <DialogTitle className="text-2xl font-bold">
                    {editingField ? 'Edit Custom Field' : 'Add Custom Fields'}
                  </DialogTitle>
                  <DialogDescription className="mt-2">
                    {editingField
                      ? 'Update the custom field details and value.'
                      : 'Create custom fields for this contact. You can add text input or dropdown selection fields.'}
                  </DialogDescription>
                </motion.div>
              </DialogHeader>

              <div className="space-y-6">
                <AnimatePresence mode="popLayout">
                  {fields.map((field, index) => (
                    <motion.div
                      key={field.id}
                      variants={fieldVariants}
                      custom={index}
                      initial="hidden"
                      animate="visible"
                      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                      className={cn(
                        "border rounded-lg p-6 space-y-4 bg-white dark:bg-gray-900",
                        validationErrors[field.id] && "border-red-300 dark:border-red-700"
                      )}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {editingField ? 'Field Details' : `Field ${index + 1}`}
                        </h4>
                        {fields.length > 1 && !editingField && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeField(field.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {/* Validation errors */}
                      {validationErrors[field.id] && (
                        <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            {validationErrors[field.id].map((err, i) => (
                              <p key={i} className="text-sm text-red-600 dark:text-red-400">{err}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Field Name and Type */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`field-name-${field.id}`}>Field Name *</Label>
                          <Input
                            id={`field-name-${field.id}`}
                            value={field.name || ''}
                            onChange={(e) => updateField(field.id, { name: e.target.value })}
                            placeholder="e.g. Company Name, Birthday"
                            disabled={isSaving}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`field-type-${field.id}`}>Field Type *</Label>
                          <Select
                            value={field.type || ''}
                            onValueChange={(value) => updateField(field.id, {
                              type: value,
                              value: undefined,
                              defaultValue: undefined,
                              options: value === 'dropdown' ? [] : undefined,
                            })}
                            disabled={isSaving || !!editingField}
                          >
                            <SelectTrigger id={`field-type-${field.id}`} className="w-full">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map(ft => (
                                <SelectItem key={ft.value} value={ft.value}>
                                  <div className="flex items-center gap-2">
                                    <span>{ft.label}</span>
                                    <span className="text-xs text-gray-400">— {ft.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Type-specific value input */}
                      {field.type && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                        >
                          {renderValueInput(field)}
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Add Field Button - only in create mode */}
                {!editingField && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addField}
                      disabled={isSaving}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Another Field
                    </Button>
                  </motion.div>
                )}

                {/* Apply To All Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="border-t pt-6 space-y-4"
                >
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="applyToAll"
                      checked={applyToAll}
                      onCheckedChange={setApplyToAll}
                      disabled={isSaving}
                    />
                    <Label htmlFor="applyToAll" className="cursor-pointer text-sm font-medium">
                      {editingField
                        ? 'Apply this change to all contacts of a specific type'
                        : 'Apply these fields to all contacts of a specific type'}
                    </Label>
                  </div>

                  {applyToAll && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="contactType">Contact Type *</Label>
                        <Select
                          value={contactType}
                          onValueChange={setContactType}
                          disabled={isSaving}
                        >
                          <SelectTrigger id="contactType">
                            <SelectValue placeholder="Select contact type" />
                          </SelectTrigger>
                          <SelectContent>
                            {contactTypes.map(type => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Preview Section */}
                      {contactType && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20 space-y-4"
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-gray-900 dark:text-white">
                              Preview: Fields & Values for {contactType}
                            </h4>
                            {isLoadingPreview && (
                              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            )}
                          </div>

                          {previewData && (
                            <div className="space-y-4">
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                Total Contacts: <span className="font-semibold">{previewData.totalContacts}</span>
                              </div>

                              {/* Field Selection - Combobox */}
                              <div className="space-y-2">
                                <Label>Select Field to View Values</Label>
                                <Popover open={fieldComboboxOpen} onOpenChange={setFieldComboboxOpen}>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      role="combobox"
                                      aria-expanded={fieldComboboxOpen}
                                      disabled={isSaving}
                                      className="w-full justify-between"
                                    >
                                      <span className="truncate">
                                        {selectedPreviewField
                                          ? previewData.fields.find(f => f.name === selectedPreviewField)?.name || 'Select a field...'
                                          : 'Select a field to view all values'}
                                      </span>
                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-full p-0" align="start">
                                    <Command>
                                      <CommandInput placeholder="Search fields..." />
                                      <CommandList>
                                        <CommandEmpty>No field found.</CommandEmpty>
                                        <CommandGroup>
                                          {previewData.fields.map((pField, pIdx) => (
                                            <CommandItem
                                              key={pIdx}
                                              value={pField.name}
                                              onSelect={() => {
                                                setSelectedPreviewField(pField.name === selectedPreviewField ? null : pField.name);
                                                setFieldComboboxOpen(false);
                                              }}
                                            >
                                              <Check
                                                className={cn(
                                                  'mr-2 h-4 w-4',
                                                  selectedPreviewField === pField.name ? 'opacity-100' : 'opacity-0'
                                                )}
                                              />
                                              <div className="flex-1">
                                                <div className="font-medium">{pField.name}</div>
                                                <div className="text-xs text-gray-500">
                                                  {pField.valueCount} unique values
                                                </div>
                                              </div>
                                            </CommandItem>
                                          ))}
                                        </CommandGroup>
                                      </CommandList>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                              </div>

                              {/* Values Display */}
                              {selectedPreviewField && (
                                <motion.div
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="space-y-2"
                                >
                                  <Label>Values for &quot;{selectedPreviewField}&quot;</Label>
                                  {(() => {
                                    const selectedField = previewData.fields.find(f => f.name === selectedPreviewField);
                                    const hasValues = selectedField?.values?.length > 0;

                                    return hasValues ? (
                                      <div className="max-h-48 overflow-y-auto border rounded-lg p-3 bg-white dark:bg-gray-800">
                                        <div className="flex flex-wrap gap-2">
                                          {selectedField.values.map((value, idx) => (
                                            <Badge key={idx} variant="outline" className="text-xs cursor-default">
                                              {value}
                                            </Badge>
                                          ))}
                                        </div>
                                        {selectedField.valueCount > 100 && (
                                          <p className="text-xs text-gray-500 mt-2">
                                            Showing first 100 of {selectedField.valueCount} values
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-gray-500">No values found</p>
                                    );
                                  })()}
                                </motion.div>
                              )}

                              {/* All Fields List */}
                              {!selectedPreviewField && (
                                <div className="space-y-2">
                                  <Label>Available Fields ({previewData.fields.length})</Label>
                                  <div className="max-h-48 overflow-y-auto border rounded-lg p-3 bg-white dark:bg-gray-800">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                      {previewData.fields.map((pField, idx) => (
                                        <div
                                          key={idx}
                                          className="text-xs p-2 rounded bg-gray-100 dark:bg-gray-700 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                          onClick={() => setSelectedPreviewField(pField.name)}
                                        >
                                          <div className="font-medium">{pField.name}</div>
                                          <div className="text-gray-500">{pField.valueCount} values</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              </div>

              <DialogFooter className="mt-6">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : editingField ? (
                    'Update Field'
                  ) : (
                    'Save Fields'
                  )}
                </Button>
              </DialogFooter>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
