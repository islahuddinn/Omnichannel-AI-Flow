'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

export const dynamic = 'force-dynamic';

export default function VerifyOTPPage() {
  const router = useRouter();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputRefs = useRef([]);

  useEffect(() => {
    const storedEmail = sessionStorage.getItem('reset_email');
    if (!storedEmail) {
      router.push('/auth/forgot-password');
    } else {
      setEmail(storedEmail);
    }
  }, [router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleResendCode = async () => {
    if (!email || isResending || resendCooldown > 0) return;

    try {
      setIsResending(true);
      setError('');
      setOtp(['', '', '', '', '', '']);

      const response = await axios.post('/api/auth/forgot-password', { email });

      if (response.data.success) {
        toast.success('A new code has been sent to your email');
        setResendCooldown(60);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to resend code. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsResending(false);
    }
  };

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    setError('');
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();

    if (/^\d{6}$/.test(pastedData)) {
      const digits = pastedData.split('');
      setOtp(digits);
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    try {
      setError('');

      const otpCode = otp.join('');
      if (otpCode.length !== 6) {
        setError('Please enter complete OTP');
        return;
      }

      setIsLoading(true);

      const response = await axios.post('/api/auth/verify-otp', {
        email,
        otp: otpCode
      });

      if (response.data.success) {
        setSuccess(true);
        toast.success(response.data.message || 'OTP verified successfully!');

        sessionStorage.setItem('otp_verified', 'true');
        sessionStorage.setItem('verified_otp', otpCode);

        router.push('/auth/reset-password');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Invalid OTP. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

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
            {success ? (
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
            ) : (
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/70 rounded-2xl flex items-center justify-center shadow-lg">
                <ShieldCheck className="w-8 h-8 text-primary-foreground" />
              </div>
            )}
          </motion.div>

          <CardTitle className="text-2xl text-center text-foreground font-bold">
            {success ? 'OTP Verified!' : 'Enter Verification Code'}
          </CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            {success ? (
              'Redirecting you to reset your password...'
            ) : (
              <>
                We&apos;ve sent a 6-digit code to <br />
                <span className="font-semibold text-primary">{email}</span>
              </>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="px-4 sm:px-6 pb-6">
          <div aria-live="polite">
            <AnimatePresence>
              {success ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <Alert role="alert" className="bg-green-50 dark:bg-green-950/50 border-green-300 dark:border-green-500/50">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <AlertDescription className="text-green-700 dark:text-green-300">
                      OTP verified successfully! Redirecting to password reset page...
                    </AlertDescription>
                  </Alert>
                  <div className="flex items-center justify-center" role="status">
                    <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none text-primary" />
                    <span className="sr-only">Redirecting...</span>
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-5">
                  {error && (
                    <Alert role="alert" className="border-red-300 dark:border-red-500/50 bg-red-50 dark:bg-red-950/50">
                      <AlertDescription className="text-red-700 dark:text-red-300">{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex justify-center gap-2 sm:gap-3" role="group" aria-label="OTP verification code">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => (inputRefs.current[index] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength="1"
                        value={digit}
                        onChange={(e) => handleChange(index, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        onPaste={handlePaste}
                        disabled={isLoading}
                        aria-label={`Digit ${index + 1} of 6`}
                        className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold border-2 border-input rounded-lg bg-background text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      />
                    ))}
                  </div>

                  <Button
                    onClick={handleVerify}
                    className="w-full h-11 font-semibold"
                    disabled={isLoading || otp.join('').length !== 6}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                        Verifying...
                        <span className="sr-only">Please wait</span>
                      </>
                    ) : (
                      'Verify Code'
                    )}
                  </Button>

                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      Didn&apos;t receive the code?{' '}
                      <button
                        onClick={handleResendCode}
                        disabled={isResending || resendCooldown > 0}
                        className="text-primary hover:underline font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                      >
                        {isResending ? 'Sending...' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Request New Code'}
                      </button>
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    onClick={() => router.push('/auth/login')}
                    className="w-full text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Login
                  </Button>
                </div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
