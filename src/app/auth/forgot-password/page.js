'use client';

import { useState } from 'react';
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
import { Mail, ArrowLeft, Loader2 } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address')
});

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema)
  });

  const onSubmit = async (data) => {
    try {
      setIsLoading(true);
      setError('');
      setMessage('');

      const response = await axios.post('/api/auth/forgot-password', {
        email: data.email
      });

      if (response.data.success) {
        setMessage(response.data.message);
        toast.success(response.data.message);

        sessionStorage.setItem('reset_email', data.email);

        router.push('/auth/verify-otp');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'An error occurred. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative h-screen overflow-hidden flex items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-[#150726] dark:via-[#1b0d33] dark:to-[#220a40] py-4 sm:py-6">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden opacity-0 dark:opacity-100 transition-opacity duration-500 pointer-events-none">
        <div className="absolute top-0 -left-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse motion-reduce:animate-none" />
        <div className="absolute bottom-0 -right-20 w-[500px] h-[500px] bg-fuchsia-500/15 rounded-full blur-3xl animate-pulse motion-reduce:animate-none delay-1000" />
      </div>

      <div className="relative w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 xl:gap-12 w-full items-center max-h-full">
          {/* Left Column - Form */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-center lg:justify-start"
          >
            <Card className="w-full max-w-md border-border bg-card/90 backdrop-blur-2xl shadow-2xl">
              <CardHeader className="space-y-2 pb-4 pt-5">
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                  className="flex items-center justify-center mb-2"
                >
                  <div className="relative w-14 h-14 bg-gradient-to-br from-primary to-primary/70 rounded-2xl flex items-center justify-center shadow-lg">
                    <Mail className="w-7 h-7 text-primary-foreground" />
                  </div>
                </motion.div>

                <CardTitle className="text-xl sm:text-2xl text-center text-foreground font-bold">
                  Forgot Password?
                </CardTitle>
                <CardDescription className="text-center text-sm text-muted-foreground">
                  No worries! Enter your email address and we&apos;ll send you a reset link.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3 pb-5">
                <div aria-live="polite">
                  {message && (
                    <Alert role="alert" className="bg-green-50 dark:bg-green-950/50 border-green-300 dark:border-green-500/50 py-2">
                      <AlertDescription className="text-sm text-green-700 dark:text-green-300">
                        {message}
                      </AlertDescription>
                    </Alert>
                  )}

                  {error && (
                    <Alert role="alert" className="border-red-300 dark:border-red-500/50 bg-red-50 dark:bg-red-950/50 py-2">
                      <AlertDescription className="text-sm text-red-700 dark:text-red-300">{error}</AlertDescription>
                    </Alert>
                  )}
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" aria-busy={isLoading}>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-foreground font-medium text-sm flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-primary" />
                      Email Address <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="Enter your email address"
                      aria-describedby={errors.email ? 'forgot-email-error' : undefined}
                      aria-invalid={!!errors.email}
                      {...register('email')}
                      className="h-10 text-sm"
                    />
                    {errors.email && (
                      <p id="forgot-email-error" role="alert" className="text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-10 font-semibold text-sm"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                        Sending...
                        <span className="sr-only">Please wait</span>
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Send Reset Link
                      </>
                    )}
                  </Button>
                </form>

                <div className="pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => router.push('/auth/login')}
                    className="w-full text-xs sm:text-sm text-muted-foreground hover:text-foreground h-8"
                  >
                    <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                    Back to Login
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Right Column - Illustration */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="hidden lg:flex items-center justify-center h-full min-h-0"
          >
            <div className="relative w-full h-full max-h-[85vh] flex flex-col items-center justify-center bg-gradient-to-b from-primary via-primary/90 to-primary/80 rounded-2xl p-6 xl:p-8 shadow-2xl overflow-hidden">
              <div className="text-center space-y-3 text-primary-foreground z-10">
                <h2 className="text-2xl xl:text-3xl font-bold leading-tight">
                  Secure Password Recovery
                </h2>
                <p className="text-base xl:text-lg text-primary-foreground/90 max-w-md leading-relaxed">
                  Your account security is our priority. We&apos;ll help you regain access safely and quickly.
                </p>
              </div>

              <div className="mt-4 flex-1 flex items-center justify-center min-h-0">
                <div className="relative w-56 h-56 xl:w-64 xl:h-64">
                  <div className="absolute inset-0 bg-white/10 rounded-full blur-2xl"></div>
                  <div className="relative w-full h-full flex items-center justify-center">
                    <div className="w-40 h-40 xl:w-48 xl:h-48 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/30">
                      <Mail className="w-20 h-20 xl:w-24 xl:h-24 text-primary-foreground/80" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
