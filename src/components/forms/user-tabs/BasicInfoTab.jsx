"use client";

import { useFormContext, Controller } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import PhoneInput from "@/components/shared/PhoneInput";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export default function BasicInfoTab({ departments, initialData }) {
    const { register, control, formState: { errors }, watch } = useFormContext();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Remove readonly on focus to prevent autofill
    useEffect(() => {
        const removeReadOnly = (e) => {
            if (e.target.hasAttribute('data-readonly-prevents-autofill')) {
                e.target.removeAttribute('readonly');
                e.target.removeAttribute('data-readonly-prevents-autofill');
            }
        };
        
        document.addEventListener('focusin', removeReadOnly);
        return () => document.removeEventListener('focusin', removeReadOnly);
    }, []);

    const fieldVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }),
    };

    return (
        <div className="space-y-6">
            <motion.div variants={fieldVariants} custom={0} initial="hidden" animate="visible" className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input 
                        id="firstName" 
                        {...register("firstName")} 
                        className="w-full"
                        autoComplete="off"
                        data-form-type="other"
                    />
                    {errors.firstName && <p className="text-red-500 text-xs">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input 
                        id="lastName" 
                        {...register("lastName")} 
                        className="w-full"
                        autoComplete="off"
                        data-form-type="other"
                    />
                    {errors.lastName && <p className="text-red-500 text-xs">{errors.lastName.message}</p>}
                </div>
            </motion.div>
            <motion.div variants={fieldVariants} custom={1} initial="hidden" animate="visible" className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input 
                        id="email" 
                        type="email" 
                        {...register("email")} 
                        disabled={!!initialData} 
                        className="w-full"
                        autoComplete="off"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck="false"
                        data-form-type="other"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        readOnly={!initialData}
                        data-readonly-prevents-autofill={!initialData}
                        onFocus={(e) => {
                            if (e.target.hasAttribute('data-readonly-prevents-autofill')) {
                                e.target.removeAttribute('readonly');
                                e.target.removeAttribute('data-readonly-prevents-autofill');
                            }
                        }}
                    />
                    {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label>Phone</Label>
                    <Controller name="phone" control={control} render={({ field }) => (
                        <PhoneInput value={field.value} onChange={field.onChange} placeholder="Enter phone number" />
                    )} />
                    {errors.phone && <p className="text-red-500 text-xs">{errors.phone.message}</p>}
                </div>
            </motion.div>
            {!initialData && (
                <motion.div variants={fieldVariants} custom={2} initial="hidden" animate="visible" className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="password">Password *</Label>
                        <div className="relative">
                            <Input 
                                id="password" 
                                name="password"
                                type={showPassword ? "text" : "password"} 
                                {...register("password")} 
                                className="pr-10 w-full"
                                autoComplete="new-password"
                                autoCapitalize="off"
                                autoCorrect="off"
                                spellCheck="false"
                                data-form-type="other"
                                data-lpignore="true"
                                data-1p-ignore="true"
                                readOnly
                                data-readonly-prevents-autofill
                                onFocus={(e) => {
                                    if (e.target.hasAttribute('data-readonly-prevents-autofill')) {
                                        e.target.removeAttribute('readonly');
                                        e.target.removeAttribute('data-readonly-prevents-autofill');
                                    }
                                }}
                            />
                            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-10" onClick={() => setShowPassword(!showPassword)}>
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                        </div>
                        {errors.password && <p className="text-red-500 text-xs">{errors.password.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm Password *</Label>
                        <div className="relative">
                            <Input 
                                id="confirmPassword" 
                                name="confirmPassword"
                                type={showConfirmPassword ? "text" : "password"} 
                                {...register("confirmPassword")} 
                                className="pr-10 w-full"
                                autoComplete="new-password"
                                autoCapitalize="off"
                                autoCorrect="off"
                                spellCheck="false"
                                data-form-type="other"
                                data-lpignore="true"
                                data-1p-ignore="true"
                                readOnly
                                data-readonly-prevents-autofill
                                onFocus={(e) => {
                                    if (e.target.hasAttribute('data-readonly-prevents-autofill')) {
                                        e.target.removeAttribute('readonly');
                                        e.target.removeAttribute('data-readonly-prevents-autofill');
                                    }
                                }}
                            />
                            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-10" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                        </div>
                        {errors.confirmPassword && <p className="text-red-500 text-xs">{errors.confirmPassword.message}</p>}
                    </div>
                </motion.div>
            )}
            <motion.div variants={fieldVariants} custom={3} initial="hidden" animate="visible" className="space-y-2">
                <Label>Departments *</Label>
                <div className="space-y-2 border rounded-md p-4 max-h-48 overflow-y-auto bg-muted">
                    <Controller name="departments" control={control} render={({ field }) => (
                        <>
                            {departments.map((dept) => (
                                <div key={dept._id} className="flex items-center space-x-2">
                                    <Checkbox id={dept._id} checked={field.value.includes(dept._id.toString())} onCheckedChange={(checked) => {
                                        const current = field.value || [];
                                        if (checked) field.onChange([...current, dept._id.toString()]);
                                        else field.onChange(current.filter((val) => val !== dept._id.toString()));
                                    }} />
                                    <Label htmlFor={dept._id} className="cursor-pointer font-normal">{dept.name}</Label>
                                </div>
                            ))}
                        </>
                    )} />
                </div>
                {errors.departments && <p className="text-red-500 text-xs">{errors.departments.message}</p>}
            </motion.div>
        </div>
    );
}
