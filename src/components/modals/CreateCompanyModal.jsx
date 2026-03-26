// // src/components/modals/CreateCompanyModal.jsx (continued)
// import useCompanyStore from '@/store/useCompanyStore';
// import useUIStore from '@/store/useUIStore';
// import { z } from 'zod';
// import { zodResolver } from '@hookform/resolvers/zod';
// import { useForm } from 'react-hook-form';
// import { useState } from 'react';
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogDescription,
//   DialogFooter
// } from '@/components/ui/dialog';

// import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
// import { Input } from '@/components/ui/input';
// import { Label } from '@/components/ui/label';
// import { Button } from '@/components/ui/button';
// import { Alert, AlertDescription } from '@/components/ui/alert';
// import { Building2, User, CreditCard, MessageSquare } from 'lucide-react';

// // --- Validation Schema ---

// const companySchema = z.object({
//   // Company Info
//   name: z.string().min(2, 'Company name is required'),
//   email: z.string().email('Invalid email address'),
//   phone: z.string().min(10, 'Phone number is required'),
//   address: z.object({
//     street: z.string().optional(),
//     city: z.string().optional(),
//     state: z.string().optional(),
//     country: z.string().optional(),
//     zipCode: z.string().optional()
//   }).optional(),
  
//   // Admin Info
//   adminEmail: z.string().email('Invalid admin email'),
//   adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
//   adminFirstName: z.string().min(2, 'First name is required'),
//   adminLastName: z.string().min(2, 'Last name is required'),
//   adminPhone: z.string().optional(),
  
//   // Subscription
//   plan: z.string().default('trial'),
//   limits: z.object({
//     users: z.number().default(5),
//     conversations: z.number().default(1000),
//     messages: z.number().default(10000),
//     channels: z.number().default(3)
//   }).optional()
// });

// export default function CreateCompanyModal({ open, onClose, onSuccess }) {
//   const [activeTab, setActiveTab] = useState('company');
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const { createCompany } = useCompanyStore();
//   const { addNotification } = useUIStore();

//   const {
//     register,
//     handleSubmit,
//     formState: { errors },
//     reset
//   } = useForm({
//     resolver: zodResolver(companySchema),
//     defaultValues: {
//       plan: 'trial',
//       limits: {
//         users: 5,
//         conversations: 1000,
//         messages: 10000,
//         channels: 3
//       }
//     }
//   });

//   const onSubmit = async (data) => {
//     setIsSubmitting(true);
//     try {
//       await createCompany(data);
      
//       addNotification({
//         type: 'success',
//         title: 'Company created',
//         message: `${data.name} has been successfully created`
//       });
      
//       reset();
//       onSuccess();
//     } catch (error) {
//       addNotification({
//         type: 'error',
//         title: 'Failed to create company',
//         message: error.message || 'Something went wrong'
//       });
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   return (
//     <Dialog open={open} onOpenChange={onClose}>
//       <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2">
//             <Building2 className="h-5 w-5" />
//             Create New Company
//           </DialogTitle>
//           <DialogDescription>
//             Set up a new tenant company with admin credentials and channel configurations
//           </DialogDescription>
//         </DialogHeader>

//         <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
//           <Tabs value={activeTab} onValueChange={setActiveTab}>
//             <TabsList className="grid w-full grid-cols-4">
//               <TabsTrigger value="company">Company</TabsTrigger>
//               <TabsTrigger value="admin">Admin</TabsTrigger>
//               <TabsTrigger value="subscription">Subscription</TabsTrigger>
//               <TabsTrigger value="channels">Channels</TabsTrigger>
//             </TabsList>

//             <TabsContent value="company" className="space-y-4">
//               <div className="grid grid-cols-2 gap-4">
//                 <div>
//                   <Label htmlFor="name">Company Name *</Label>
//                   <Input
//                     id="name"
//                     {...register('name')}
//                     placeholder="Acme Inc."
//                   />
//                   {errors.name && (
//                     <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>
//                   )}
//                 </div>

//                 <div>
//                   <Label htmlFor="email">Company Email *</Label>
//                   <Input
//                     id="email"
//                     type="email"
//                     {...register('email')}
//                     placeholder="contact@company.com"
//                   />
//                   {errors.email && (
//                     <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>
//                   )}
//                 </div>

//                 <div>
//                   <Label htmlFor="phone">Phone Number *</Label>
//                   <Input
//                     id="phone"
//                     {...register('phone')}
//                     placeholder="+1234567890"
//                   />
//                   {errors.phone && (
//                     <p className="text-sm text-red-500 mt-1">{errors.phone.message}</p>
//                   )}
//                 </div>

//                 <div>
//                   <Label htmlFor="country">Country</Label>
//                   <Input
//                     id="country"
//                     {...register('address.country')}
//                     placeholder="United States"
//                   />
//                 </div>

//                 <div>
//                   <Label htmlFor="city">City</Label>
//                   <Input
//                     id="city"
//                     {...register('address.city')}
//                     placeholder="New York"
//                   />
//                 </div>

//                 <div>
//                   <Label htmlFor="zipCode">ZIP Code</Label>
//                   <Input
//                     id="zipCode"
//                     {...register('address.zipCode')}
//                     placeholder="10001"
//                   />
//                 </div>
//               </div>
//             </TabsContent>

//             <TabsContent value="admin" className="space-y-4">
//               <Alert>
//                 <User className="h-4 w-4" />
//                 <AlertDescription>
//                   This user will be the primary administrator for the company
//                 </AlertDescription>
//               </Alert>

//               <div className="grid grid-cols-2 gap-4">
//                 <div>
//                   <Label htmlFor="adminFirstName">First Name *</Label>
//                   <Input
//                     id="adminFirstName"
//                     {...register('adminFirstName')}
//                     placeholder="John"
//                   />
//                   {errors.adminFirstName && (
//                     <p className="text-sm text-red-500 mt-1">{errors.adminFirstName.message}</p>
//                   )}
//                 </div>

//                 <div>
//                   <Label htmlFor="adminLastName">Last Name *</Label>
//                   <Input
//                     id="adminLastName"
//                     {...register('adminLastName')}
//                     placeholder="Doe"
//                   />
//                   {errors.adminLastName && (
//                     <p className="text-sm text-red-500 mt-1">{errors.adminLastName.message}</p>
//                   )}
//                 </div>

//                 <div>
//                   <Label htmlFor="adminEmail">Admin Email *</Label>
//                   <Input
//                     id="adminEmail"
//                     type="email"
//                     {...register('adminEmail')}
//                     placeholder="admin@company.com"
//                   />
//                   {errors.adminEmail && (
//                     <p className="text-sm text-red-500 mt-1">{errors.adminEmail.message}</p>
//                   )}
//                 </div>

//                 <div>
//                   <Label htmlFor="adminPassword">Password *</Label>
//                   <Input
//                     id="adminPassword"
//                     type="password"
//                     {...register('adminPassword')}
//                     placeholder="••••••••"
//                   />
//                   {errors.adminPassword && (
//                     <p className="text-sm text-red-500 mt-1">{errors.adminPassword.message}</p>
//                   )}
//                 </div>

//                 <div>
//                   <Label htmlFor="adminPhone">Phone (Optional)</Label>
//                   <Input
//                     id="adminPhone"
//                     {...register('adminPhone')}
//                     placeholder="+1234567890"
//                   />
//                 </div>
//               </div>
//             </TabsContent>

//             <TabsContent value="subscription" className="space-y-4">
//               <Alert>
//                 <CreditCard className="h-4 w-4" />
//                 <AlertDescription>
//                   Configure subscription limits and plan details
//                 </AlertDescription>
//               </Alert>

//               <div className="space-y-4">
//                 <div>
//                   <Label htmlFor="plan">Subscription Plan</Label>
//                   <select
//                     id="plan"
//                     {...register('plan')}
//                     className="w-full px-3 py-2 border border-gray-300 rounded-md"
//                   >
//                     <option value="trial">Trial (30 days)</option>
//                     <option value="starter">Starter</option>
//                     <option value="professional">Professional</option>
//                     <option value="enterprise">Enterprise</option>
//                   </select>
//                 </div>

//                 <div className="grid grid-cols-2 gap-4">
//                   <div>
//                     <Label htmlFor="maxUsers">Max Users</Label>
//                     <Input
//                       id="maxUsers"
//                       type="number"
//                       {...register('limits.users', { valueAsNumber: true })}
//                       placeholder="5"
//                     />
//                   </div>

//                   <div>
//                     <Label htmlFor="maxChannels">Max Channels</Label>
//                     <Input
//                       id="maxChannels"
//                       type="number"
//                       {...register('limits.channels', { valueAsNumber: true })}
//                       placeholder="3"
//                     />
//                   </div>

//                   <div>
//                     <Label htmlFor="maxConversations">Max Conversations</Label>
//                     <Input
//                       id="maxConversations"
//                       type="number"
//                       {...register('limits.conversations', { valueAsNumber: true })}
//                       placeholder="1000"
//                     />
//                   </div>

//                   <div>
//                     <Label htmlFor="maxMessages">Max Messages</Label>
//                     <Input
//                       id="maxMessages"
//                       type="number"
//                       {...register('limits.messages', { valueAsNumber: true })}
//                       placeholder="10000"
//                     />
//                   </div>
//                 </div>
//               </div>
//             </TabsContent>

//             <TabsContent value="channels" className="space-y-4">
//               <Alert>
//                 <MessageSquare className="h-4 w-4" />
//                 <AlertDescription>
//                   Channel credentials can be configured later by the Company Admin
//                 </AlertDescription>
//               </Alert>

//               <div className="space-y-2">
//                 <p className="text-sm text-gray-600">
//                   Available channels for this company:
//                 </p>
//                 <div className="grid grid-cols-3 gap-2">
//                   {['WhatsApp', 'Facebook', 'Instagram', 'SMS', 'Email', 'WebChat'].map((channel) => (
//                     <div key={channel} className="flex items-center space-x-2 p-2 border rounded">
//                       <input type="checkbox" defaultChecked />
//                       <label className="text-sm">{channel}</label>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </TabsContent>
//           </Tabs>

//           <DialogFooter>
//             <Button type="button" variant="outline" onClick={onClose}>
//               Cancel
//             </Button>
//             <Button type="submit" disabled={isSubmitting}>
//               {isSubmitting ? 'Creating...' : 'Create Company'}
//             </Button>
//           </DialogFooter>
//         </form>
//       </DialogContent>
//     </Dialog>
//   );
// }







// src/components/modals/CreateCompanyModal.jsx
'use client';

import useCompanyStore from '@/store/useCompanyStore';
import useUIStore from '@/store/useUIStore';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import useNotifications from "@/hooks/useNotifications";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, User, CreditCard, Info, Eye, EyeOff } from 'lucide-react';
import PhoneInput from '@/components/shared/PhoneInput';
import { ACTIVE_TAB_CLASSES } from '@/constants/ui';

// --- Validation Schema (matches backend) ---
const companySchema = z.object({
  // Company Info
  name: z.string().min(2, 'Company name is required'),
  
  // Admin Info
  adminEmail: z.string().email('Invalid admin email'),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
  adminFirstName: z.string().min(2, 'First name is required'),
  adminLastName: z.string().min(2, 'Last name is required'),
  adminPhone: z.string().optional(),
  
  // Subscription (optional)
  subscription: z.object({
    plan: z.enum(['trial', 'starter', 'professional', 'enterprise']).default('trial'),
    limits: z.object({
      maxUsers: z.number().default(5),
      maxConversations: z.number().default(1000),
      maxChannels: z.number().default(3)
    }).optional()
  }).optional()
});

export default function CreateCompanyModal({ open, onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('company-admin');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [phoneValue, setPhoneValue] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const debounceTimerRef = useRef(null);
  const { createCompany } = useCompanyStore();
  const { notifySuccess, notifyError } = useNotifications();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch
  } = useForm({
    resolver: zodResolver(companySchema),
    defaultValues: {
      subscription: {
        plan: 'trial',
        limits: {
          maxUsers: 5,
          maxConversations: 1000,
          maxChannels: 3
        }
      }
    }
  });

  const handlePhoneChange = useCallback((value) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Debounce the state update to prevent rapid re-renders
    debounceTimerRef.current = setTimeout(() => {
      setPhoneValue(value);
      setPhoneError('');
    }, 100); // 100ms debounce - fast enough for good UX, slow enough to prevent loops
  }, []);

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      // Include phone value from local state
      const formData = {
        ...data,
        adminPhone: phoneValue
      };
      await createCompany(formData);
      
      notifySuccess(
        "Company created successfully",
        `${data.name} has been added to the system.`
      );
      
      reset();
      setPhoneValue('');
      setPhoneError('');
      setActiveTab('company-admin');
      onSuccess();
    } catch (error) {
      notifyError(
        "Failed to create company",
        error.message || "Something went wrong"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Clear any pending debounce timers
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    reset();
    setPhoneValue('');
    setPhoneError('');
    setShowPassword(false);
    setActiveTab('company-admin');
    onClose();
  };

  // Animation variants
  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: {
        type: "spring",
        damping: 25,
        stiffness: 300,
        duration: 0.3
      }
    },
    exit: { 
      opacity: 0, 
      scale: 0.95, 
      y: 20,
      transition: { duration: 0.2 }
    }
  };

  const tabContentVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { 
      opacity: 1, 
      x: 0,
      transition: { duration: 0.2 }
    },
    exit: { 
      opacity: 0, 
      x: -20,
      transition: { duration: 0.15 }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className="!w-[80vw] !max-w-[80vw] max-h-[90vh] overflow-hidden p-0 gap-0"
        showCloseButton={true}
      >
        <motion.div
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={modalVariants}
          className="flex flex-col h-full max-h-[90vh]"
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Building2 className="h-6 w-6 text-primary" />
              Create New Company
            </DialogTitle>
            <DialogDescription className="text-base mt-2">
              Set up a new company with admin credentials and subscription plan
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">

            <form id="create-company-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
                <TabsList className="grid w-full grid-cols-2 gap-2 px-2">
                  <TabsTrigger value="company-admin" className={`flex items-center gap-2 ${ACTIVE_TAB_CLASSES.trigger}`}>
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Company & Admin</span>
                    <span className="sm:hidden">Company</span>
                  </TabsTrigger>
                  <TabsTrigger value="subscription" className={`flex items-center gap-2 ${ACTIVE_TAB_CLASSES.trigger}`}>
                    <CreditCard className="h-4 w-4" />
                    <span className="hidden sm:inline">Subscription</span>
                    <span className="sm:hidden">Plan</span>
                  </TabsTrigger>
                </TabsList>

                <AnimatePresence mode="wait">
                  {activeTab === 'company-admin' && (
                    <TabsContent 
                      value="company-admin" 
                      className="space-y-4 mt-0"
                    >
                      <motion.div
                        key="company-admin"
                        variants={tabContentVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        <div className="space-y-6">
                          {/* Company Section */}
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 pb-2 border-b">
                              <Building2 className="h-5 w-5 text-primary" />
                              <h3 className="text-lg font-semibold">Company Information</h3>
                            </div>
                            <div>
                              <Label htmlFor="name" className="text-sm font-medium">
                                Company Name <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="name"
                                {...register('name')}
                                placeholder="Acme Inc."
                                className="mt-1.5"
                              />
                              {errors.name && (
                                <p className="text-sm text-destructive mt-1.5 flex items-center gap-1">
                                  <Info className="h-3 w-3" />
                                  {errors.name.message}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Admin Section */}
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 pb-2 border-b">
                              <User className="h-5 w-5 text-primary" />
                              <h3 className="text-lg font-semibold">Administrator Details</h3>
                            </div>
                            <Alert className="mb-4">
                              <User className="h-4 w-4" />
                              <AlertDescription>
                                This user will be the company owner and primary administrator
                              </AlertDescription>
                            </Alert>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="adminFirstName" className="text-sm font-medium">
                                  First Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                  id="adminFirstName"
                                  {...register('adminFirstName')}
                                  placeholder="John"
                                  className="mt-1.5"
                                />
                                {errors.adminFirstName && (
                                  <p className="text-sm text-destructive mt-1.5 flex items-center gap-1">
                                    <Info className="h-3 w-3" />
                                    {errors.adminFirstName.message}
                                  </p>
                                )}
                              </div>

                              <div>
                                <Label htmlFor="adminLastName" className="text-sm font-medium">
                                  Last Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                  id="adminLastName"
                                  {...register('adminLastName')}
                                  placeholder="Doe"
                                  className="mt-1.5"
                                />
                                {errors.adminLastName && (
                                  <p className="text-sm text-destructive mt-1.5 flex items-center gap-1">
                                    <Info className="h-3 w-3" />
                                    {errors.adminLastName.message}
                                  </p>
                                )}
                              </div>

                              <div>
                                <Label htmlFor="adminEmail" className="text-sm font-medium">
                                  Email <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                  id="adminEmail"
                                  type="email"
                                  {...register('adminEmail')}
                                  placeholder="admin@company.com"
                                  className="mt-1.5"
                                />
                                {errors.adminEmail && (
                                  <p className="text-sm text-destructive mt-1.5 flex items-center gap-1">
                                    <Info className="h-3 w-3" />
                                    {errors.adminEmail.message}
                                  </p>
                                )}
                              </div>

                              <div>
                                <Label htmlFor="adminPassword" className="text-sm font-medium">
                                  Password <span className="text-destructive">*</span>
                                </Label>
                                <div className="relative mt-1.5">
                                  <Input
                                    id="adminPassword"
                                    type={showPassword ? 'text' : 'password'}
                                    {...register('adminPassword')}
                                    placeholder="••••••••"
                                    className="pr-10"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    tabIndex={-1}
                                  >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </button>
                                </div>
                                {errors.adminPassword && (
                                  <p className="text-sm text-destructive mt-1.5 flex items-center gap-1">
                                    <Info className="h-3 w-3" />
                                    {errors.adminPassword.message}
                                  </p>
                                )}
                              </div>

                              <div className="sm:col-span-2">
                                <Label htmlFor="adminPhone" className="text-sm font-medium">
                                  Phone <span className="text-muted-foreground text-xs">(Optional)</span>
                                </Label>
                                <div className="mt-1.5">
                                  <PhoneInput
                                    value={phoneValue}
                                    onChange={handlePhoneChange}
                                    error={phoneError}
                                    onError={setPhoneError}
                                    placeholder="Enter phone number"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </TabsContent>
                  )}

                  {activeTab === 'subscription' && (
                    <TabsContent 
                      value="subscription" 
                      className="space-y-4 mt-0"
                    >
                      <motion.div
                        key="subscription"
                        variants={tabContentVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        <Alert className="mb-4">
                          <CreditCard className="h-4 w-4" />
                          <AlertDescription>
                            Configure subscription plan and limits
                          </AlertDescription>
                        </Alert>

                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="plan" className="text-sm font-medium">
                              Subscription Plan
                            </Label>
                            <Select
                              value={watch('subscription.plan') || 'trial'}
                              onValueChange={(value) => setValue('subscription.plan', value)}
                            >
                              <SelectTrigger className="mt-1.5">
                                <SelectValue placeholder="Select a plan" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="trial">Trial (Free)</SelectItem>
                                <SelectItem value="starter">Starter</SelectItem>
                                <SelectItem value="professional">Professional</SelectItem>
                                <SelectItem value="enterprise">Enterprise</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                              <Label htmlFor="maxUsers" className="text-sm font-medium">
                                Max Users
                              </Label>
                              <Input
                                id="maxUsers"
                                type="number"
                                {...register('subscription.limits.maxUsers', { valueAsNumber: true })}
                                placeholder="5"
                                className="mt-1.5"
                              />
                            </div>

                            <div>
                              <Label htmlFor="maxChannels" className="text-sm font-medium">
                                Max Channels
                              </Label>
                              <Input
                                id="maxChannels"
                                type="number"
                                {...register('subscription.limits.maxChannels', { valueAsNumber: true })}
                                placeholder="3"
                                className="mt-1.5"
                              />
                            </div>

                            <div>
                              <Label htmlFor="maxConversations" className="text-sm font-medium">
                                Max Conversations
                              </Label>
                              <Input
                                id="maxConversations"
                                type="number"
                                {...register('subscription.limits.maxConversations', { valueAsNumber: true })}
                                placeholder="1000"
                                className="mt-1.5"
                              />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </TabsContent>
                  )}
                </AnimatePresence>
              </Tabs>
            </form>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/50">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              form="create-company-form"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"
                  />
                  Creating...
                </>
              ) : (
                'Create Company'
              )}
            </Button>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}