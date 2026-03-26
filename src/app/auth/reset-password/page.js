'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Eye, EyeOff, ArrowLeft, Loader2, CheckCircle2, X, Check } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const COMMON_PASSWORDS = [
  'password', '12345678', '123456789', '1234567890', 'qwerty123',
  'password1', 'iloveyou', 'sunshine1', 'princess1', 'football1',
  'charlie1', 'shadow12', 'master12', 'dragon12', 'monkey123',
  'letmein1', 'abc12345', 'mustang1', 'michael1', 'password123',
];

const resetPasswordSchema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/\d/, 'Must contain a number')
    .regex(/[^a-zA-Z0-9]/, 'Must contain a special character')
    .refine(
      (val) => !COMMON_PASSWORDS.includes(val.toLowerCase()),
      'This password is too common. Choose a stronger one.'
    ),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

function PasswordStrengthMeter({ password }) {
  const checks = useMemo(() => [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Number', met: /\d/.test(password) },
    { label: 'Special character', met: /[^a-zA-Z0-9]/.test(password) },
  ], [password]);

  const metCount = checks.filter(c => c.met).length;
  const strength = metCount === 0 ? 0 : metCount <= 2 ? 1 : metCount <= 4 ? 2 : 3;
  const strengthLabels = ['', 'Weak', 'Fair', 'Strong'];
  const strengthColors = ['', 'bg-red-500', 'bg-yellow-500', 'bg-green-500'];

  if (!password) return null;

  return (
    <div className="space-y-2" aria-label="Password strength">
      <div className="flex gap-1">
        {[1, 2, 3].map((level) => (
          <div
            key={level}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              strength >= level ? strengthColors[strength] : 'bg-muted'
            }`}
            role="progressbar"
            aria-valuenow={strength >= level ? 100 : 0}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Strength: <span className="font-medium">{strengthLabels[strength] || 'Too short'}</span>
      </p>
      <ul className="space-y-1">
        {checks.map((check, i) => (
          <li key={i} className="flex items-center gap-1.5 text-xs">
            {check.met ? (
              <Check className="h-3 w-3 text-green-500 shrink-0" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <span className={check.met ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
              {check.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [email, setEmail] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(resetPasswordSchema)
  });

  const passwordValue = watch('password', '');

  useEffect(() => {
    const otpVerified = sessionStorage.getItem('otp_verified');
    const storedEmail = sessionStorage.getItem('reset_email');

    if (!otpVerified || !storedEmail) {
      toast.error('Please verify OTP first');
      router.push('/auth/forgot-password');
    } else {
      setEmail(storedEmail);
    }
  }, [router]);

  const onSubmit = async (data) => {
    try {
      setIsLoading(true);
      setError('');

      const verifiedOTP = sessionStorage.getItem('verified_otp');

      if (!verifiedOTP) {
        setError('Verification expired. Please start over.');
        toast.error('Verification expired. Please start over.');
        router.push('/auth/forgot-password');
        return;
      }

      const response = await axios.post('/api/auth/reset-password', {
        email,
        otp: verifiedOTP,
        newPassword: data.password
      });

      if (response.data.success) {
        setSuccess(true);
        toast.success(response.data.message || 'Password reset successfully!');

        sessionStorage.removeItem('reset_email');
        sessionStorage.removeItem('otp_verified');
        sessionStorage.removeItem('verified_otp');

        router.push('/auth/login');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'An error occurred. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-[#150726] dark:via-[#1b0d33] dark:to-[#220a40] p-4">
        <Card className="w-full max-w-md border-border bg-card/90 backdrop-blur-2xl shadow-2xl">
          <CardHeader className="space-y-3 pb-6 pt-6">
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="flex items-center justify-center mb-4"
            >
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
            </motion.div>

            <CardTitle className="text-2xl text-center text-foreground font-bold">
              Password Reset Successful!
            </CardTitle>
            <CardDescription className="text-center text-muted-foreground">
              Your password has been successfully updated
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <Alert role="alert" className="bg-green-50 dark:bg-green-950/50 border-green-300 dark:border-green-500/50">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                Redirecting you to login page...
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-center" role="status">
              <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary" />
              <span className="sr-only">Redirecting to login...</span>
            </div>

            <p className="text-center text-sm text-muted-foreground">
              You can now login with your new password
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-[#150726] dark:via-[#1b0d33] dark:to-[#220a40] p-4">
      <div className="absolute inset-0 overflow-hidden opacity-0 dark:opacity-100">
        <div className="absolute top-0 -left-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse motion-reduce:animate-none" />
        <div className="absolute bottom-0 -right-20 w-[500px] h-[500px] bg-fuchsia-500/15 rounded-full blur-3xl animate-pulse motion-reduce:animate-none delay-1000" />
      </div>

      <Card className="w-full max-w-md border-border bg-card/90 backdrop-blur-2xl shadow-2xl">
        <CardHeader className="space-y-3 pb-6 pt-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center justify-center mb-4"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/70 rounded-2xl flex items-center justify-center shadow-lg">
              <Lock className="w-8 h-8 text-primary-foreground" />
            </div>
          </motion.div>

          <CardTitle className="text-2xl text-center text-foreground font-bold">
            Reset Password
          </CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Enter your new password below
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div aria-live="polite">
            {error && (
              <Alert role="alert" className="border-red-300 dark:border-red-500/50 bg-red-50 dark:bg-red-950/50">
                <AlertDescription className="text-red-700 dark:text-red-300">{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" aria-busy={isLoading}>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-medium text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" />
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Enter new password"
                  aria-describedby={errors.password ? 'new-password-error' : 'password-requirements'}
                  aria-invalid={!!errors.password}
                  {...register('password')}
                  className="h-11 pr-12"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-9 w-9 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {errors.password && (
                <p id="new-password-error" role="alert" className="text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>
              )}
              <div id="password-requirements">
                <PasswordStrengthMeter password={passwordValue} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-foreground font-medium text-sm">
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Confirm your password"
                  aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
                  aria-invalid={!!errors.confirmPassword}
                  {...register('confirmPassword')}
                  className="h-11 pr-12"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-9 w-9 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {errors.confirmPassword && (
                <p id="confirm-password-error" role="alert" className="text-sm text-red-600 dark:text-red-400">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-semibold"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Resetting Password...
                  <span className="sr-only">Please wait</span>
                </>
              ) : (
                'Reset Password'
              )}
            </Button>
          </form>

          <Button
            variant="ghost"
            onClick={() => router.push('/auth/login')}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
