// src/components/webchat/WebChatProfileSettings.jsx
/**
 * WebChat Profile Settings Component
 * Allows users to change PIN, name, and manage notification tunes
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Settings, Lock, User, Music, Upload, Trash2, Play, Pause, Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function WebChatProfileSettings({ isOpen, onClose, token, onSettingsUpdate, onLogout }) {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile', 'pin', 'notifications'
  const [loading, setLoading] = useState(false);
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(false); // ✅ Loading state for initial data
  const [profile, setProfile] = useState(null);
  const [currentPin, setCurrentPin] = useState(['', '', '', '']);
  const [newPin, setNewPin] = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [name, setName] = useState('');
  const [notificationTunes, setNotificationTunes] = useState([]);
  const [selectedTune, setSelectedTune] = useState('message.mp3'); // ✅ Default to message.mp3
  const [uploading, setUploading] = useState(false);
  const [playingTune, setPlayingTune] = useState(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false); // ✅ Logout confirmation dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false); // ✅ Delete confirmation dialog state
  const [tuneToDelete, setTuneToDelete] = useState(null); // ✅ Track which tune is being deleted
  
  const pinInputs = {
    current: [useRef(null), useRef(null), useRef(null), useRef(null)],
    new: [useRef(null), useRef(null), useRef(null), useRef(null)],
    confirm: [useRef(null), useRef(null), useRef(null), useRef(null)],
  };
  const audioRefs = useRef({});
  const modalRef = useRef(null);

  // Load profile data
  useEffect(() => {
    if (isOpen && token) {
      setIsLoadingInitialData(true);
      Promise.all([loadProfile(), loadNotificationTunes()])
        .finally(() => {
          setIsLoadingInitialData(false);
        });
    }
  }, [isOpen, token]);

  // Focus trap for settings modal
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const modal = modalRef.current;
    const previouslyFocused = document.activeElement;

    const getFocusableElements = () => {
      return modal.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"]), select, textarea');
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = getFocusableElements();
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl?.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl?.focus();
        }
      }
    };

    // Focus first element
    setTimeout(() => {
      const focusable = getFocusableElements();
      focusable[0]?.focus();
    }, 100);

    modal.addEventListener('keydown', handleKeyDown);

    return () => {
      modal.removeEventListener('keydown', handleKeyDown);
      // Restore focus when modal closes
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  const loadProfile = async () => {
    try {
      const response = await fetch('/api/webchat/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setProfile(data.data);
        setName(data.data.name || '');
        setSelectedTune(data.data.webchatSettings?.selectedNotificationTune || 'message.mp3');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error('Failed to load profile');
    }
  };

  const loadNotificationTunes = async () => {
    try {
      const response = await fetch('/api/webchat/notification-tunes', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setNotificationTunes(data.data.notificationTunes || []);
        setSelectedTune(data.data.selectedNotificationTune || 'message.mp3');
      }
    } catch (error) {
      console.error('Error loading notification tunes:', error);
    }
  };


  const handleChangePin = async () => {
    const currentPinValue = currentPin.join('');
    const newPinValue = newPin.join('');
    const confirmPinValue = confirmPin.join('');

    if (currentPinValue.length !== 4) {
      toast.error('Please enter your current PIN');
      return;
    }

    if (newPinValue.length !== 4) {
      toast.error('Please enter a 4-digit new PIN');
      return;
    }

    if (newPinValue !== confirmPinValue) {
      toast.error('New PIN and confirm PIN do not match');
      return;
    }

    if (currentPinValue === newPinValue) {
      toast.error('New PIN must be different from current PIN');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/webchat/change-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPin: currentPinValue,
          newPin: newPinValue
        })
      });
      const data = await response.json();
      if (data.success) {
        toast.success('PIN changed successfully!');
        setCurrentPin(['', '', '', '']);
        setNewPin(['', '', '', '']);
        setConfirmPin(['', '', '', '']);
        setActiveTab('profile');
      } else {
        toast.error(data.message || 'Failed to change PIN');
      }
    } catch (error) {
      console.error('Error changing PIN:', error);
      toast.error('Failed to change PIN');
    } finally {
      setLoading(false);
    }
  };

  const handlePinChange = (type, index, value) => {
    if (!/^\d*$/.test(value)) return;
    
    const pinArray = type === 'current' ? currentPin : type === 'new' ? newPin : confirmPin;
    const setPin = type === 'current' ? setCurrentPin : type === 'new' ? setNewPin : setConfirmPin;
    const inputs = pinInputs[type];
    
    // ✅ Use different variable name to avoid shadowing
    const updatedPin = [...pinArray];
    updatedPin[index] = value.slice(-1);
    setPin(updatedPin);

    if (value && index < 3) {
      inputs[index + 1].current?.focus();
    }
  };

  const handlePinKeyDown = (type, index, e) => {
    const pinArray = type === 'current' ? currentPin : type === 'new' ? newPin : confirmPin;
    const inputs = pinInputs[type];
    
    if (e.key === 'Backspace' && !pinArray[index] && index > 0) {
      inputs[index - 1].current?.focus();
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only audio files are allowed (MP3, WAV, OGG, WebM)');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name.replace(/\.[^/.]+$/, ''));

      const response = await fetch('/api/webchat/notification-tunes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Notification tune uploaded successfully!');
        loadNotificationTunes();
      } else {
        toast.error(data.message || 'Failed to upload tune');
      }
    } catch (error) {
      console.error('Error uploading tune:', error);
      toast.error('Failed to upload notification tune');
    } finally {
      setUploading(false);
      e.target.value = ''; // Reset file input
    }
  };

  const handleSelectTune = async (tuneUrl) => {
    setLoading(true);
    try {
      const response = await fetch('/api/webchat/notification-tunes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tuneUrl })
      });

      const data = await response.json();
      if (data.success) {
        setSelectedTune(tuneUrl);
        toast.success('Notification tune selected!');
        // ✅ Notify parent component of settings update
        if (onSettingsUpdate) {
          onSettingsUpdate({ selectedNotificationTune: tuneUrl });
        }
      } else {
        toast.error(data.message || 'Failed to select tune');
      }
    } catch (error) {
      console.error('Error selecting tune:', error);
      toast.error('Failed to select notification tune');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTuneClick = (tuneId) => {
    setTuneToDelete(tuneId);
    setShowDeleteDialog(true);
  };

  const handleDeleteTune = async () => {
    if (!tuneToDelete) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/webchat/notification-tunes?tuneId=${tuneToDelete}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        },
      });
      const data = await response.json();
      if (data.success) {
        toast.success('Notification tune deleted successfully!');
        loadNotificationTunes();
        // ✅ Update selected tune if it was deleted
        if (data.data?.selectedNotificationTune) {
          setSelectedTune(data.data.selectedNotificationTune);
          if (onSettingsUpdate) {
            onSettingsUpdate({ selectedNotificationTune: data.data.selectedNotificationTune });
          }
        }
        setShowDeleteDialog(false);
        setTuneToDelete(null);
      } else {
        toast.error(data.message || 'Failed to delete tune');
      }
    } catch (error) {
      console.error('Error deleting tune:', error);
      toast.error('Failed to delete notification tune');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayTune = (tuneUrl) => {
    // Stop currently playing tune
    if (playingTune && audioRefs.current[playingTune]) {
      audioRefs.current[playingTune].pause();
      audioRefs.current[playingTune].currentTime = 0;
    }

    if (playingTune === tuneUrl) {
      setPlayingTune(null);
      return;
    }

    // Play new tune
    // ✅ Handle both default options: 'default' (notification.mp3), 'notification.mp3', and 'message.mp3'
    if (tuneUrl === 'default' || tuneUrl === 'notification.mp3' || tuneUrl === 'message.mp3') {
      const defaultFile = tuneUrl === 'message.mp3' ? '/sounds/message.mp3' : '/sounds/notification.mp3';
      const audio = new Audio(defaultFile);
      audio.play().catch(() => {
        toast.error('Failed to play notification tune');
      });
      audio.onended = () => setPlayingTune(null);
      setPlayingTune(tuneUrl === 'default' ? 'notification.mp3' : tuneUrl);
    } else {
      if (!audioRefs.current[tuneUrl]) {
        audioRefs.current[tuneUrl] = new Audio(tuneUrl);
      }
      const audio = audioRefs.current[tuneUrl];
      audio.play().catch(() => {
        toast.error('Failed to play notification tune');
      });
      audio.onended = () => setPlayingTune(null);
      setPlayingTune(tuneUrl);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          ref={modalRef}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Profile Settings"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="w-6 h-6" />
              <h2 className="text-xl font-semibold">Profile Settings</h2>
            </div>
            <div className="flex items-center gap-2">
              {onLogout && (
                <>
                  <button
                    onClick={() => setShowLogoutDialog(true)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    title="Logout"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                  
                  {/* Logout Confirmation Dialog */}
                  <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure you want to logout?</AlertDialogTitle>
                        <AlertDialogDescription>
                          You will be logged out of your WebChat session. You can log back in anytime with your PIN.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            onLogout();
                            onClose();
                            setShowLogoutDialog(false);
                          }}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Logout
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  
                  {/* Delete Notification Tune Confirmation Dialog */}
                  <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Notification Tune</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this notification tune? This action cannot be undone. If this tune is currently selected, it will be reset to the default tune.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => {
                          setShowDeleteDialog(false);
                          setTuneToDelete(null);
                        }}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteTune}
                          disabled={loading}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {loading ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                              Deleting...
                            </>
                          ) : (
                            'Delete'
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'profile'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <User className="w-4 h-4 inline mr-2" />
              Profile
            </button>
            <button
              onClick={() => setActiveTab('pin')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'pin'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Lock className="w-4 h-4 inline mr-2" />
              Change PIN
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'notifications'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Music className="w-4 h-4 inline mr-2" />
              Notifications
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoadingInitialData ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 dark:text-purple-400 mb-4" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">Loading settings...</p>
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'profile' && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        disabled
                        readOnly
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-60"
                        placeholder="Name cannot be changed"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Name, email, and phone cannot be changed
                      </p>
                    </div>

                    {profile && (
                      <div className="space-y-2">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          <strong>Email:</strong> {profile.email || 'Not provided'}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          <strong>Phone:</strong> {profile.phone || 'Not provided'}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'pin' && (
                  <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Current PIN
                  </label>
                  <div className="flex justify-center gap-3">
                    {currentPin.map((digit, index) => (
                      <input
                        key={index}
                        ref={pinInputs.current[index]}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handlePinChange('current', index, e.target.value)}
                        onKeyDown={(e) => handlePinKeyDown('current', index, e)}
                        aria-label={`Current PIN digit ${index + 1}`}
                        className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
                      />
                    ))}
                  </div>
                </div>

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
                        aria-label={`New PIN digit ${index + 1}`}
                        className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
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
                        aria-label={`Confirm PIN digit ${index + 1}`}
                        className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
                      />
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleChangePin}
                  disabled={loading}
                  className="w-full py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Changing PIN...
                    </>
                  ) : (
                    'Change PIN'
                  )}
                </button>
                  </div>
                )}

                {activeTab === 'notifications' && (
                  <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Default Notification Tune
                  </label>
                  <div className="flex items-center gap-3 p-4 border border-gray-300 dark:border-gray-600 rounded-lg">
                    <div
                      onClick={() => handleSelectTune('message.mp3')}
                      className={`flex-1 flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer ${
                        selectedTune === 'message.mp3'
                          ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      <span>Default (message.mp3)</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayTune('message.mp3');
                        }}
                        className="p-2 hover:bg-white/20 rounded"
                      >
                        {playingTune === 'message.mp3' ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Custom Notification Tunes
                  </label>
                  
                  <div className="space-y-2 mb-4">
                    {notificationTunes.map((tune, index) => (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                          selectedTune === tune.url
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        <span className="text-sm text-gray-700 dark:text-gray-300">{tune.name}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePlayTune(tune.url)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          >
                            {playingTune === tune.url ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleSelectTune(tune.url)}
                            disabled={loading}
                            className={`px-3 py-1 text-xs rounded transition-colors ${
                              selectedTune === tune.url
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {selectedTune === tune.url ? 'Selected' : 'Select'}
                          </button>
                          <button
                            onClick={() => handleDeleteTuneClick(tune._id)}
                            disabled={loading}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete tune"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <label className="block w-full">
                    <div className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-purple-500 transition-colors">
                      <Upload className="w-5 h-5 mr-2" />
                      <span className="text-sm font-medium">
                        {uploading ? 'Uploading...' : 'Upload Notification Tune'}
                      </span>
                    </div>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Supported formats: MP3, WAV, OGG, WebM (Max 5MB)
                  </p>
                </div>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

