// src/components/webchat/WebChatAuthForm.jsx
/**
 * WebChat Authentication Form
 * Handles PIN authentication and contact info collection
 */

'use client';

import { useState, useRef } from 'react';
import { Loader2, Lock, User, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import PhoneInput from '@/components/shared/PhoneInput';
import WebChatForgotPin from './WebChatForgotPin';

export default function WebChatAuthForm({ linkId, isFirstTime, onAuthSuccess, onError }) {
  const [step, setStep] = useState('pin'); // 'pin', 'info', 'forgot-pin'
  const [loading, setLoading] = useState(false);
  const [pinSet, setPinSet] = useState(false); // Track if PIN was just set
  
  // PIN state
  const [pin, setPin] = useState(['', '', '', '']);
  const pinInputs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  const [errors, setErrors] = useState({});

  // Contact info state (for first-time)
  const [contactInfo, setContactInfo] = useState({
    name: '',
    email: '',
    phone: '',
  });

  const handlePinChange = (index, value) => {
    if (!/^\d*$/.test(value)) return; // Only numbers
    
    const newPin = [...pin];
    newPin[index] = value.slice(-1); // Only last character
    setPin(newPin);

    // Auto-focus next input
    if (value && index < 3) {
      pinInputs[index + 1].current?.focus();
    }
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinInputs[index - 1].current?.focus();
    }
  };

  const handlePinPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').slice(0, 4);
    if (/^\d{4}$/.test(pasted)) {
      const newPin = pasted.split('');
      setPin(newPin);
      pinInputs[newPin.length - 1].current?.focus();
    }
  };

  const handleAuth = async () => {
    const pinValue = pin.join('');
    
    if (pinValue.length !== 4) {
      setErrors({ pin: 'Please enter a 4-digit PIN' });
      return;
    }
    setErrors({});

    // ✅ PIN is mandatory - ensure PIN is set before proceeding
    // If first-time and on PIN step, set PIN first, then show contact info form
    if (isFirstTime && step === 'pin' && !pinSet) {
      // First time setting PIN - PIN must be set before contact info
      setLoading(true);
      try {
        const response = await fetch('/api/webchat/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linkId,
            pin: pinValue,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          if (data.error === 'Invalid PIN') {
            toast.error('Invalid PIN. Please try again.');
            setPin(['', '', '', '']);
            pinInputs[0].current?.focus();
          } else if (data.error === 'Please enter a valid 4-digit PIN') {
            toast.error('Please enter a valid 4-digit PIN');
            setPin(['', '', '', '']);
            pinInputs[0].current?.focus();
          } else if (data.requiresInfo && data.pinSet) {
            // PIN was set successfully, now need contact info
            setPinSet(true);
            setStep('info');
            toast.success('PIN set! Please provide your contact information.');
          } else {
            toast.error(data.error || 'Failed to set PIN');
          }
          setLoading(false);
          return;
        }

        if (data.success) {
          // PIN set and authenticated (returning user with existing contact)
          setLoading(false);
          onAuthSuccess?.(data.data);
          return;
        } else if (data.requiresInfo && data.pinSet) {
          // PIN was set, now need contact info
          setPinSet(true);
          setStep('info');
          toast.success('PIN set! Please provide your contact information.');
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error('PIN setup error:', error);
        toast.error('Failed to set PIN. Please try again.');
        setLoading(false);
        return;
      }
    }

    setLoading(true);

    try {
      // ✅ Always send PIN, and contact info if we're on info step
      const body = step === 'info' && isFirstTime
        ? {
            linkId,
            pin: pinValue,
            name: contactInfo.name,
            email: contactInfo.email,
            phone: contactInfo.phone,
          }
        : {
            linkId,
            pin: pinValue,
          };

      const response = await fetch('/api/webchat/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'Invalid PIN') {
          toast.error('Invalid PIN. Please try again.');
          setPin(['', '', '', '']);
          pinInputs[0].current?.focus();
        } else if (data.error === 'Please enter a valid 4-digit PIN') {
          toast.error('Please enter a valid 4-digit PIN');
          setPin(['', '', '', '']);
          pinInputs[0].current?.focus();
        } else if (data.requiresInfo && data.pinSet) {
          // PIN was set successfully, now need contact info
          setPinSet(true);
          setStep('info');
          toast.success('PIN set! Please provide your contact information.');
        } else if (data.requiresInfo) {
          // ✅ PIN is mandatory - user must set PIN before providing info
          toast.error('Please set your PIN first');
          setPin(['', '', '', '']);
          pinInputs[0].current?.focus();
          return;
        } else {
          toast.error(data.error || 'Authentication failed');
          onError?.(data.error || 'Authentication failed');
        }
        return;
      }

      if (data.success) {
        toast.success('Authentication successful!');
        onAuthSuccess?.(data.data);
      }

    } catch (error) {
      console.error('Auth error:', error);
      toast.error('Failed to authenticate. Please try again.');
      onError?.(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInfoSubmit = (e) => {
    e.preventDefault();
    
    // Validate
    const newErrors = {};
    if (!contactInfo.name) newErrors.name = 'Name is required';
    if (!contactInfo.email) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactInfo.email)) newErrors.email = 'Please enter a valid email';
    if (!contactInfo.phone || contactInfo.phone.trim() === '') newErrors.phone = 'Phone number is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    // Submit with PIN and contact info
    handleAuth();
  };

  // Show forgot PIN component if step is 'forgot-pin'
  if (step === 'forgot-pin') {
    return (
      <WebChatForgotPin
        onBack={() => setStep('pin')}
        onSuccess={() => {
          setStep('pin');
          toast.success('PIN reset successfully! Please login with your new PIN.');
        }}
      />
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl dark:shadow-2xl dark:shadow-black/20 p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {isFirstTime ? 'Welcome! Set Your PIN' : 'Welcome Back'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {isFirstTime 
              ? 'Please set a 4-digit PIN and provide your information to start chatting'
              : 'Enter your PIN to continue'}
          </p>
        </div>

        {step === 'info' ? (
          <form onSubmit={handleInfoSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <User className="w-4 h-4 inline mr-2" />
                Full Name
              </label>
              <input
                type="text"
                required
                value={contactInfo.name}
                onChange={(e) => setContactInfo({ ...contactInfo, name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900"
                placeholder="John Doe"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Mail className="w-4 h-4 inline mr-2" />
                Email Address
              </label>
              <input
                type="email"
                required
                value={contactInfo.email}
                onChange={(e) => setContactInfo({ ...contactInfo, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900"
                placeholder="john@example.com"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Phone className="w-4 h-4 inline mr-2" />
                Phone Number
              </label>
              <PhoneInput
                value={contactInfo.phone}
                onChange={(value) => setContactInfo({ ...contactInfo, phone: value })}
                placeholder="Enter phone number"
                error={contactInfo.phone && !/^\+?[\d\s-()]+$/.test(contactInfo.phone) ? 'Please enter a valid phone number' : ''}
              />
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Continue
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4 text-center">
                {isFirstTime && step === 'pin' 
                  ? 'Set your 4-digit PIN (you will use this to access your chat)' 
                  : 'Enter your 4-digit PIN'}
              </label>
              <div className="flex justify-center gap-3">
                {pin.map((digit, index) => (
                  <input
                    key={index}
                    ref={pinInputs[index]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handlePinChange(index, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(index, e)}
                    onPaste={handlePinPaste}
                    aria-label={`PIN digit ${index + 1}`}
                    className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900"
                  />
                ))}
              </div>
              {errors.pin && <p className="text-red-500 text-xs mt-2 text-center">{errors.pin}</p>}
            </div>

            <button
              onClick={handleAuth}
              disabled={loading || pin.join('').length !== 4}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Continue'
              )}
            </button>

            {!isFirstTime && step === 'pin' && (
              <button
                onClick={() => setStep('forgot-pin')}
                className="w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                Forgot PIN?
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

