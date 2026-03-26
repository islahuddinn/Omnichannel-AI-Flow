'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Upload, X, CheckCircle } from 'lucide-react';
import PhoneInput from '@/components/shared/PhoneInput';
import { toast } from 'sonner';

// ✅ Single schema that handles both name and firstName/lastName cases
// Validation is handled conditionally in the form
const contactSchema = z.object({
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().min(1, 'Phone number is required'),
  Contact_Type: z.string().optional()
}).refine((data) => {
  // ✅ If firstName exists, it's required (for firstName/lastName mode)
  if (data.firstName !== undefined && data.firstName !== '') {
    return data.firstName.length > 0;
  }
  // ✅ If name exists and no firstName, name is required (for name-only mode)
  if (data.name !== undefined && data.name !== '' && (!data.firstName || data.firstName === '')) {
    return data.name.length > 0;
  }
  // ✅ At least one of name or firstName must be provided
  return (data.name && data.name.length > 0) || (data.firstName && data.firstName.length > 0);
}, {
  message: 'Either name or first name is required',
  path: ['firstName'] // Show error on firstName field
});

export default function ContactFormModal({ isOpen, onClose, contact = null, onSuccess }) {
  const prefersReducedMotion = useReducedMotion();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  // ✅ Initialize phoneValue from contact if available (for immediate display when modal opens)
  const [phoneValue, setPhoneValue] = useState(() => {
    if (contact?.phone) {
      const phone = contact.phone;
      return phone.startsWith('+') ? phone : '+' + phone;
    }
    return '';
  });

  // ✅ Determine if we should show name field or firstName/lastName fields
  // Priority: If firstName OR lastName exists, show firstName/lastName fields
  // Otherwise, if only name exists, show name field
  const shouldShowNameField = useMemo(() => {
    if (!contact) return false; // For new contacts, show firstName/lastName
    // If contact has firstName or lastName, show firstName/lastName fields (priority)
    if (contact.firstName || contact.lastName) return false;
    // If contact only has name (no firstName/lastName), show name field
    if (contact.name && !contact.firstName && !contact.lastName) return true;
    return false; // Default to firstName/lastName
  }, [contact]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    reset,
    watch
  } = useForm({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      firstName: contact?.firstName || '',
      lastName: contact?.lastName || '',
      name: contact?.name || '',
      email: contact?.email || '',
      phone: '',
      Contact_Type: contact?.Contact_Type || ''
    },
    mode: 'onChange' // ✅ Enable real-time validation
  });

  // ✅ Stable onChange handler for PhoneInput to prevent infinite loops
  // ✅ Defined after useForm so setValue is available
  const handlePhoneChange = useCallback((value) => {
    setPhoneValue(value);
    setValue('phone', value, { shouldValidate: false }); // Update form value without triggering validation
    setPhoneError(''); // Clear any phone errors when user types
  }, [setValue]);


  useEffect(() => {
    if (contact) {
      reset({
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        name: contact.name || '',
        email: contact.email || '',
        phone: '',
        Contact_Type: contact.Contact_Type || '',
      });

      // Set phone with country code (add + if not present)
      const phone = contact.phone || '';
      let normalizedPhone = phone;
      if (phone && !phone.startsWith('+')) {
        normalizedPhone = '+' + phone;
      }

      setPhoneValue(normalizedPhone);
      setValue('phone', normalizedPhone, { shouldValidate: false });
    } else {
      reset({
        firstName: '',
        lastName: '',
        name: '',
        email: '',
        phone: '',
        Contact_Type: '',
      });
      setPhoneValue('');
    }
  }, [contact, setValue, reset]);

  const onSubmit = async (data) => {
    try {
      setIsSubmitting(true);
      setPhoneError('');

      // Validate phone with country code
      if (!phoneValue) {
        setPhoneError('Phone number is required');
        return;
      }

      // ✅ Build name from firstName and lastName (always update name when firstName/lastName exist)
      // If firstName or lastName exists, build name from them
      // Otherwise, use the name field if it exists
      let finalName = '';
      let finalFirstName = data.firstName || undefined;
      let finalLastName = data.lastName || undefined;
      
      if (finalFirstName || finalLastName) {
        // ✅ Priority: If firstName or lastName exists, build name from them
        finalName = [finalFirstName, finalLastName].filter(Boolean).join(' ').trim() || undefined;
      } else if (data.name) {
        // ✅ Fallback: If only name field exists, use it
        finalName = data.name.trim() || undefined;
        finalFirstName = undefined;
        finalLastName = undefined;
      }
      
      const payload = {
        firstName: finalFirstName,
        lastName: finalLastName,
        name: finalName,
        email: data.email || undefined,
        phone: phoneValue, // Keep + prefix
        Contact_Type: data.Contact_Type || undefined
      };

      let response;
      if (contact) {
        // Update
        response = await fetch(`/api/contacts/${contact._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        // Create
        response = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const result = await response.json();

      if (result.success) {
        toast.success(result.message || (contact ? 'Contact updated successfully!' : 'Contact created successfully!'));
        onSuccess?.();
        onClose();
      } else {
        toast.error(result.error || 'An error occurred');
        setPhoneError(result.error || '');
      }
    } catch {
      toast.error('Failed to save contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Animation variants — disabled when user prefers reduced motion
  const modalVariants = prefersReducedMotion
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        hidden: { opacity: 0, scale: 0.95, y: -20 },
        visible: {
          opacity: 1, scale: 1, y: 0,
          transition: { type: 'spring', damping: 25, stiffness: 300, duration: 0.3 },
        },
        exit: { opacity: 0, scale: 0.95, y: -20, transition: { duration: 0.2 } },
      };

  const fieldVariants = prefersReducedMotion
    ? { hidden: { opacity: 1 }, visible: () => ({ opacity: 1 }) }
    : {
        hidden: { opacity: 0, y: 10 },
        visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }),
      };

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-[800px] max-w-[95vw] p-0 overflow-hidden">
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="p-6"
            >
              <DialogHeader className="mb-6">
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <DialogTitle className="text-2xl font-bold">
                    {contact ? 'Edit Contact' : 'Add New Contact'}
                  </DialogTitle>
                  <DialogDescription className="mt-2">
                    {contact ? 'Update contact information' : 'Create a new contact in your directory'}
                  </DialogDescription>
                </motion.div>
              </DialogHeader>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* ✅ Conditional: Show firstName/lastName OR name field based on contact data */}
                {shouldShowNameField ? (
                  /* Name Field (when contact only has name, no firstName/lastName) */
                  <motion.div
                    variants={fieldVariants}
                    custom={0}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        placeholder="John Doe"
                        {...register('name', { 
                          required: shouldShowNameField ? 'Name is required' : false,
                          validate: (value) => {
                            if (shouldShowNameField && (!value || value.trim() === '')) {
                              return 'Name is required';
                            }
                            return true;
                          }
                        })}
                        disabled={isSubmitting}
                        className="transition-colors duration-200"
                      />
                      {errors.name && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-sm text-red-500"
                        >
                          {errors.name.message}
                        </motion.p>
                      )}
                    </div>
                    <div></div> {/* Empty div for grid layout */}
                  </motion.div>
                ) : (
                  /* First Name and Last Name Fields (default or when firstName/lastName exist) */
                  <motion.div
                    variants={fieldVariants}
                    custom={0}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  >
                    {/* First Name Field */}
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name *</Label>
                      <Input
                        id="firstName"
                        placeholder="John"
                        {...register('firstName', {
                          required: !shouldShowNameField ? 'First name is required' : false,
                          validate: (value) => {
                            if (!shouldShowNameField && (!value || value.trim() === '')) {
                              return 'First name is required';
                            }
                            return true;
                          }
                        })}
                        disabled={isSubmitting}
                        className="transition-colors duration-200"
                      />
                      {errors.firstName && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-sm text-red-500"
                        >
                          {errors.firstName.message}
                        </motion.p>
                      )}
                    </div>

                    {/* Last Name Field */}
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        placeholder="Doe"
                        {...register('lastName')}
                        disabled={isSubmitting}
                        className="transition-colors duration-200"
                      />
                      {errors.lastName && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-sm text-red-500"
                        >
                          {errors.lastName.message}
                        </motion.p>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Second Row: Email and Phone */}
                <motion.div
                  variants={fieldVariants}
                  custom={1}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  {/* Email Field */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@example.com"
                      {...register('email')}
                      disabled={isSubmitting}
                      className="transition-colors duration-200"
                    />
                    {errors.email && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm text-red-500"
                      >
                        {errors.email.message}
                      </motion.p>
                    )}
                  </div>

                  {/* Phone Field with Country Selector */}
                  <div className="space-y-2">
                    <Label>Phone Number *</Label>
                    <div>
                      <PhoneInput
                        key={`phone-${contact?._id || 'new'}-${isOpen ? 'open' : 'closed'}`} // ✅ Force remount when contact changes or modal opens
                        value={phoneValue}
                        onChange={handlePhoneChange}
                        error={phoneError}
                        placeholder="Enter phone number"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </motion.div>

                {/* Third Row: Contact Type */}
                <motion.div
                  variants={fieldVariants}
                  custom={2}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  {/* Contact Type Field */}
                  <div className="space-y-2">
                    <Label htmlFor="Contact_Type">Contact Type</Label>
                    <Select
                      value={watch('Contact_Type') || ''}
                      onValueChange={(value) => setValue('Contact_Type', value)}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger className="w-full transition-colors duration-200">
                        <SelectValue placeholder="Select contact type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Handyman">Handyman</SelectItem>
                        <SelectItem value="Customer">Customer</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.Contact_Type && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm text-red-500"
                      >
                        {errors.Contact_Type.message}
                      </motion.p>
                    )}
                  </div>
                  {/* Empty div to maintain grid layout */}
                  <div></div>
                </motion.div>

                {/* Action Buttons */}
                <motion.div
                  variants={fieldVariants}
                  custom={4}
                  initial="hidden"
                  animate="visible"
                  className="flex justify-end gap-3 pt-4"
                >
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="transition-colors duration-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="transition-colors duration-200"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {contact ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      contact ? 'Update Contact' : 'Create Contact'
                    )}
                  </Button>
                </motion.div>
              </form>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}

