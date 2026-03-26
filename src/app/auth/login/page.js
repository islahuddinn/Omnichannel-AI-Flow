
'use client';

import { useState, useEffect, useRef } from 'react';
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
import { Eye, EyeOff, LogIn, Sparkles, MessageSquare, Mail, Zap, Globe, Shield, Loader2 } from 'lucide-react';
import useUserStore from '@/store/useUserStore';
import { toast } from 'react-hot-toast';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showLogoutMessage, setShowLogoutMessage] = useState(false);
  const { login, isLoading, error, clearError } = useUserStore();
  const logoutTimerRef = useRef(null);

  useEffect(() => {
    // Check for force logout (account deleted by admin)
    const forceLogoutReason = sessionStorage.getItem('force_logout_reason');
    if (forceLogoutReason) {
      setShowLogoutMessage(true);
      toast.error(forceLogoutReason, { duration: 6000 });
      sessionStorage.removeItem('force_logout_reason');

      logoutTimerRef.current = setTimeout(() => {
        setShowLogoutMessage(false);
      }, 6000);
      return;
    }

    const isLoggedOut = sessionStorage.getItem('just_logged_out');
    if (isLoggedOut) {
      setShowLogoutMessage(true);
      toast.success('You have been logged out successfully');
      sessionStorage.removeItem('just_logged_out');

      logoutTimerRef.current = setTimeout(() => {
        setShowLogoutMessage(false);
      }, 5000);
    }
    return () => {
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data) => {
    try {
      const result = await login(data.email, data.password);

      switch (result.user.role) {
        case 'super_admin':
          router.push('/dashboard');
          break;
        case 'company_admin':
          router.push('/c/dashboard');
          break;
        case 'agent':
          router.push('/c/dashboard');
          break;
        default:
          router.push('/');
      }
    } catch (err) {
      // Error is handled in the store
    }
  };

  const features = [
    { icon: MessageSquare, text: 'Omnichannel Communication', color: 'text-emerald-600 dark:text-emerald-400' },
    { icon: Zap, text: 'AI-Powered Automation', color: 'text-amber-600 dark:text-amber-400' },
    { icon: Globe, text: 'Global Reach', color: 'text-primary' },
    { icon: Shield, text: 'Enterprise Security', color: 'text-primary' },
  ];

  return (
    <div className="relative h-screen w-full overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-sky-50 dark:from-[#0a1628] dark:via-[#0f1a2e] dark:to-[#0d1830]">
      {/* Animated Background Gradients */}
      <div className="absolute inset-0 overflow-hidden opacity-0 dark:opacity-100 transition-opacity duration-500">
        <div className="absolute top-0 -left-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse motion-reduce:animate-none" />
        <div className="absolute bottom-0 -right-20 w-[500px] h-[500px] bg-primary/15 rounded-full blur-3xl animate-pulse motion-reduce:animate-none delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl animate-pulse motion-reduce:animate-none delay-2000" />
      </div>

      <div className="absolute inset-0 overflow-hidden opacity-100 dark:opacity-0 transition-opacity duration-500">
        <div className="absolute top-10 right-10 w-72 h-72 bg-blue-200/40 rounded-full blur-3xl animate-pulse motion-reduce:animate-none" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-indigo-200/30 rounded-full blur-3xl animate-pulse motion-reduce:animate-none delay-1000" />
      </div>

      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:50px_50px]" />

      <div className="relative z-10 h-full flex items-center justify-center p-4 lg:p-6">
        <div className="w-full max-w-6xl h-full max-h-[95vh] flex flex-col lg:flex-row gap-4 lg:gap-6">

          {/* Left Side - Branding */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="hidden lg:flex lg:w-1/2 flex-col justify-center space-y-6 px-6"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 group">
                <div className="relative w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-3xl flex items-center justify-center shadow-2xl shadow-primary/50 group-hover:scale-110 transition-transform duration-500">
                  <Sparkles className="w-8 h-8 text-primary-foreground animate-pulse motion-reduce:animate-none" strokeWidth={2} />
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/60 to-primary/40 rounded-3xl opacity-0 group-hover:opacity-40 blur-2xl transition-all duration-500" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-primary/90 to-primary bg-clip-text text-transparent">
                    OmniAiFlow
                  </h1>
                  <p className="text-muted-foreground text-base mt-1">Unified Communication Platform</p>
                </div>
              </div>

              <div className="w-20 h-1 bg-gradient-to-r from-primary via-primary to-transparent rounded-full animate-pulse motion-reduce:animate-none" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="space-y-3"
            >
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground leading-tight">
                Connect Every
                <span className="block bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent animate-pulse motion-reduce:animate-none">
                  Channel, Customer
                </span>
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Streamline communication with AI-powered omnichannel solutions. Manage WhatsApp, Email, SMS from one platform.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="grid grid-cols-2 gap-3"
            >
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.7 + index * 0.1, duration: 0.4 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-card/80 backdrop-blur-sm border border-border hover:bg-card hover:border-primary/30 transition-all duration-300 hover:shadow-lg group cursor-pointer"
                >
                  <div className={`${feature.color} group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className="w-5 h-5" strokeWidth={2} />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                    {feature.text}
                  </span>
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.6 }}
              className="flex items-center gap-6 pt-4"
            >
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">10K+</div>
                <div className="text-xs text-muted-foreground">Active Users</div>
              </div>
              <div className="w-px h-10 bg-border" />
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">50M+</div>
                <div className="text-xs text-muted-foreground">Messages Sent</div>
              </div>
              <div className="w-px h-10 bg-border" />
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">99.9%</div>
                <div className="text-xs text-muted-foreground">Uptime</div>
              </div>
            </motion.div>
          </motion.div>

          {/* Right Side - Login Form */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="w-full lg:w-1/2 flex items-center justify-center"
          >
            <Card className="w-full max-w-md border-border bg-card/90 backdrop-blur-2xl shadow-2xl shadow-primary/10 hover:shadow-primary/20 transition-all duration-500">
              <CardHeader className="space-y-3 pb-6 pt-6 px-6 lg:px-8">
                {/* Mobile Logo */}
                <div className="flex lg:hidden items-center justify-center mb-4">
                  <div className="relative w-14 h-14 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/50">
                    <Sparkles className="w-7 h-7 text-primary-foreground animate-pulse motion-reduce:animate-none" strokeWidth={2} />
                  </div>
                </div>

                <div className="flex lg:hidden flex-col items-center mb-2">
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-primary via-primary/90 to-primary bg-clip-text text-transparent">
                    OmniAiFlow
                  </h1>
                  <div className="w-16 h-0.5 mt-2 bg-gradient-to-r from-transparent via-primary to-transparent" />
                </div>

                <CardTitle className="text-2xl lg:text-3xl text-center text-foreground font-bold">
                  Welcome Back
                </CardTitle>
                <CardDescription className="text-center text-muted-foreground text-sm lg:text-base">
                  Sign in to access your dashboard and manage your channels
                </CardDescription>
              </CardHeader>

              <CardContent className="px-6 lg:px-8 pb-6">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" aria-busy={isLoading}>
                  {showLogoutMessage && (
                    <Alert role="alert" className="bg-green-50 dark:bg-green-950/50 border-green-300 dark:border-green-500/50 backdrop-blur-sm">
                      <AlertDescription className="text-green-700 dark:text-green-200 flex items-center gap-2">
                        You have been logged out successfully. See you again soon!
                      </AlertDescription>
                    </Alert>
                  )}

                  {error && (
                    <Alert role="alert" className="border-red-300 dark:border-red-500/50 bg-red-50 dark:bg-red-950/50 backdrop-blur-sm">
                      <AlertDescription className="text-red-700 dark:text-red-300">{error}</AlertDescription>
                    </Alert>
                  )}

                  {/* Email Field */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="email" className="text-foreground font-medium text-sm flex items-center gap-2">
                      <Mail className="w-4 h-4 text-primary" />
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="admin@example.com"
                      aria-describedby={errors.email ? 'email-error' : undefined}
                      aria-invalid={!!errors.email}
                      {...register('email')}
                      onFocus={clearError}
                      className="h-11 text-base transition-all duration-300"
                    />
                    {errors.email && (
                      <p id="email-error" role="alert" className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                        {errors.email.message}
                      </p>
                    )}
                  </motion.div>

                  {/* Password Field */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.4 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="password" className="text-foreground font-medium text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        aria-describedby={errors.password ? 'password-error' : undefined}
                        aria-invalid={!!errors.password}
                        {...register('password')}
                        onFocus={clearError}
                        className="h-11 text-base pr-12 transition-all duration-300"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-9 w-9 text-muted-foreground hover:text-foreground transition-all duration-300"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {errors.password && (
                      <p id="password-error" role="alert" className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                        {errors.password.message}
                      </p>
                    )}
                  </motion.div>

                  {/* Forgot Password */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.4 }}
                    className="flex items-center justify-end text-sm"
                  >
                    <a
                      href="/auth/forgot-password"
                      className="text-primary hover:text-primary/80 transition-colors hover:underline font-medium"
                    >
                      Forgot password?
                    </a>
                  </motion.div>

                  {/* Submit Button */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 0.4 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-semibold rounded-xl shadow-lg shadow-primary/40 hover:shadow-primary/60 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                      disabled={isLoading}
                    >
                      <span className="relative z-10 flex items-center justify-center">
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none" />
                            <span>Signing in...</span>
                            <span className="sr-only">Please wait</span>
                          </>
                        ) : (
                          <>
                            <LogIn className="mr-2 h-5 w-5" />
                            Sign In to Dashboard
                          </>
                        )}
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                    </Button>
                  </motion.div>

                  {/* Divider */}
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-3 bg-card/90 text-muted-foreground font-medium">
                        Secure & Encrypted Connection
                      </span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">
                      Protected by enterprise-grade encryption
                    </p>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Footer Badge */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center z-20"
      >
        <p className="text-muted-foreground/60 text-xs">
          &copy; 2025 OmniAiFlow. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
