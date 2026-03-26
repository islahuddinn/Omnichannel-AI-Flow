// src/components/webchat/WebChatForgotPin.jsx
/**
 * WebChat Forgot PIN Component
 * Similar to forgot password flow but for WebChat PIN reset
 */

'use client';

import { useState, useRef } from 'react';
import { Lock, Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export default function WebChatForgotPin({ onBack, onSuccess }) {
  const [step, setStep] = useState('request'); // 'request', 'verify', 'reset'
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPin, setNewPin] = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [tenantId, setTenantId] = useState(null);
  const [identifier, setIdentifier] = useState(null);
  const [otpVerified, setOtpVerified] = useState(false);
  
  const otpInputs = [useRef(null), useRef(null), useRef(null), useRef(null), useRef(null), useRef(null)];
  const pinInputs = {
    new: [useRef(null), useRef(null), useRef(null), useRef(null)],
    confirm: [useRef(null), useRef(null), useRef(null), useRef(null)],
  };

  const handleRequestOTP = async () => {
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/webchat/forgot-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (data.success) {
        setTenantId(data.data?.tenantId);
        setIdentifier(email);
        setStep('verify');
        toast.success('Verification code sent! Please check your email.');
      } else {
        toast.error(data.message || 'Failed to send verification code');
      }
    } catch (error) {
      console.error('Error requesting OTP:', error);
      toast.error('Failed to send verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    const otpValue = otp.join('');
    if (otpValue.length !== 6) {
      toast.error('Please enter the 6-digit verification code');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/webchat/verify-pin-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, identifier, otp: otpValue }),
      });

      const data = await response.json();
      if (data.success) {
        setOtpVerified(true);
        setStep('reset');
        toast.success('Verification code verified! Please set your new PIN.');
      } else {
        toast.error(data.message || 'Invalid verification code');
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      toast.error('Failed to verify code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPIN = async () => {
    const newPinValue = newPin.join('');
    const confirmPinValue = confirmPin.join('');

    if (newPinValue.length !== 4) {
      toast.error('Please enter a 4-digit PIN');
      return;
    }

    if (newPinValue !== confirmPinValue) {
      toast.error('PINs do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/webchat/reset-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          identifier,
          otp: otp.join(''),
          newPin: newPinValue,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success('PIN reset successfully! You can now login with your new PIN.');
        if (onSuccess) {
          onSuccess();
        } else {
          onBack();
        }
      } else {
        toast.error(data.message || 'Failed to reset PIN');
      }
    } catch (error) {
      console.error('Error resetting PIN:', error);
      toast.error('Failed to reset PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      otpInputs[index + 1].current?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputs[index - 1].current?.focus();
    }
  };

  const handlePinChange = (type, index, value) => {
    if (!/^\d*$/.test(value)) return;
    
    const pinArray = type === 'new' ? newPin : confirmPin;
    const setPin = type === 'new' ? setNewPin : setConfirmPin;
    const inputs = pinInputs[type];
    
    const newPinArray = [...pinArray];
    newPinArray[index] = value.slice(-1);
    setPin(newPinArray);

    if (value && index < 3) {
      inputs[index + 1].current?.focus();
    }
  };

  const handlePinKeyDown = (type, index, e) => {
    const pinArray = type === 'new' ? newPin : confirmPin;
    const inputs = pinInputs[type];
    
    if (e.key === 'Backspace' && !pinArray[index] && index > 0) {
      inputs[index - 1].current?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <motion.div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl dark:shadow-2xl dark:shadow-black/20 p-8"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Forgot PIN?</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {step === 'request' && 'Enter your email or phone to reset your PIN'}
            {step === 'verify' && 'Enter the verification code sent to your email'}
            {step === 'reset' && 'Set your new 4-digit PIN'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {step === 'request' && (
            <motion.div
              key="request"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900"
                  placeholder="your@email.com"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Enter the email address associated with your account
                </p>
              </div>

              <button
                onClick={handleRequestOTP}
                disabled={loading || !email}
                className="w-full py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Verification Code'
                )}
              </button>

              <button
                onClick={onBack}
                className="w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </button>
            </motion.div>
          )}

          {step === 'verify' && (
            <motion.div
              key="verify"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4 text-center">
                  Enter 6-digit verification code
                </label>
                <div className="flex justify-center gap-3">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={otpInputs[index]}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900"
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={handleVerifyOTP}
                disabled={loading || otp.join('').length !== 6}
                className="w-full py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Code'
                )}
              </button>

              <button
                onClick={() => setStep('request')}
                className="w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            </motion.div>
          )}

          {step === 'reset' && (
            <motion.div
              key="reset"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              {otpVerified && (
                <div className="flex items-center justify-center gap-2 text-green-600 mb-4">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-medium">Code verified successfully!</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  New PIN
                </label>
                <div className="flex justify-center gap-3">
                  {newPin.map((digit, index) => (
                    <input
                      key={index}
                      ref={pinInputs.new[index]}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange('new', index, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown('new', index, e)}
                      className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Confirm New PIN
                </label>
                <div className="flex justify-center gap-3">
                  {confirmPin.map((digit, index) => (
                    <input
                      key={index}
                      ref={pinInputs.confirm[index]}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange('confirm', index, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown('confirm', index, e)}
                      className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900"
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={handleResetPIN}
                disabled={loading || newPin.join('').length !== 4 || confirmPin.join('').length !== 4}
                className="w-full py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Resetting PIN...
                  </>
                ) : (
                  'Reset PIN'
                )}
              </button>

              <button
                onClick={() => setStep('verify')}
                className="w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

