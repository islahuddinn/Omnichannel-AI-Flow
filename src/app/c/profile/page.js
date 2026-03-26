'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import {
  User,
  Mail,
  Phone,
  Lock,
  Bell,
  Building2,
  Users,
  Calendar,
  Loader2,
  Save,
  Eye,
  EyeOff,
  Upload,
  Trash2,
  Play,
  Pause,
  X,
  Move,
  ZoomIn,
  Check,
  Sun,
  Moon,
  Monitor,
  Shield,
  Palette,
  Camera,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import useUserStore from '@/store/useUserStore';
import { COLOR_PRESETS, GRADIENT_PRESETS, ALL_PRESETS } from '@/constants/colorPresets';
import PhoneInput from '@/components/shared/PhoneInput';
import PhoneNumberDisplay from '@/components/shared/PhoneNumberDisplay';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';

// Lazy-load the email signature editor (heavy TipTap dependency)
const EmailSignatureEditor = dynamic(
  () => import('@/components/email/EmailSignatureEditor'),
  { ssr: false, loading: () => <div className="h-[200px] rounded-lg border border-border bg-muted/30 animate-pulse" /> }
);

// Navigation items (base — email-settings added dynamically for company_admin)
const BASE_NAV_ITEMS = [
  { id: 'profile', label: 'General', icon: User },
  { id: 'password', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

// Theme options
const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun, description: 'Clean and bright interface' },
  { value: 'dark', label: 'Dark', icon: Moon, description: 'Easier on the eyes' },
  { value: 'system', label: 'System', icon: Monitor, description: 'Matches your OS setting' },
];

export default function ProfilePage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { setTheme: setThemeStore, accentColor, setAccentColor } = useTheme();
  const updateUser = useUserStore((state) => state.updateUser);
  const prefersReducedMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState('profile');

  // Build nav items dynamically — show "Email Settings" tab only for company_admin
  const NAV_ITEMS = useMemo(() => {
    const items = [...BASE_NAV_ITEMS];
    if (currentUser?.role === 'company_admin') {
      items.push({ id: 'email-settings', label: 'Email Settings', icon: Mail });
    }
    return items;
  }, [currentUser?.role]);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingTune, setUploadingTune] = useState(false);
  const [playingTune, setPlayingTune] = useState(null);
  const [notificationTunes, setNotificationTunes] = useState([]);
  const [selectedTune, setSelectedTune] = useState('message.mp3');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tuneToDelete, setTuneToDelete] = useState(null);
  const [showDeleteAvatarDialog, setShowDeleteAvatarDialog] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [showImageCropper, setShowImageCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropScale, setCropScale] = useState(1);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [savingFrom, setSavingFrom] = useState(null);
  const audioRefs = useRef({});
  const avatarInputRef = useRef(null);
  const tuneInputRef = useRef(null);
  const dragCounterRef = useRef(0);
  const imageContainerRef = useRef(null);
  const imageRef = useRef(null);
  const toastIdRef = useRef(null);

  // Fetch user profile — only after auth is ready (prevents race condition on hard refresh)
  const { data: profileResponse, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const response = await apiClient.get('/users/profile');
      return response;
    },
    enabled: !!currentUser,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 3000),
    staleTime: 30 * 1000
  });

  const user = profileResponse?.data;

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data) => apiClient.put('/users/profile', data),
    onSuccess: (response) => {
      const updatedUser = response?.data?.user || response?.data;
      if (updatedUser) {
        updateUser({
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          phone: updatedUser.phone,
          avatar: updatedUser.avatar,
          preferences: updatedUser.preferences
        });
      }
      queryClient.setQueryData(['user-profile'], (old) => ({
        ...old,
        data: updatedUser || old?.data
      }));
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      showToast('Profile updated successfully', 'success');
    },
    onError: (error) => {
      showToast(error.response?.data?.error || 'Failed to update profile', 'error');
    },
    onSettled: () => setSavingFrom(null)
  });

  // Password change mutation
  const changePasswordMutation = useMutation({
    mutationFn: (data) => apiClient.put('/users/profile', data),
    onSuccess: () => {
      showToast('Password changed successfully', 'success');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    },
    onError: (error) => {
      showToast(error.response?.data?.error || 'Failed to change password', 'error');
    }
  });

  // Form states
  const [profileFormData, setProfileFormData] = useState({
    firstName: '',
    lastName: '',
    phone: ''
  });
  const [phoneValue, setPhoneValue] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [preferences, setPreferences] = useState({
    theme: 'system',
    notifications: {
      email: true,
      desktop: true,
      sound: true
    }
  });

  // ========== Email Settings (company_admin only) ==========
  const [emailSettingsData, setEmailSettingsData] = useState({
    fromName: '',
    emailSignature: '',
    emailSignatureEnabled: false,
  });

  // Fetch company settings for email settings tab
  const { data: companyResponse, isLoading: isLoadingCompany } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => apiClient.get('/companies/current'),
    enabled: currentUser?.role === 'company_admin',
    staleTime: 30000,
  });

  // Initialize email settings when company data loads
  useEffect(() => {
    if (companyResponse?.data) {
      const es = companyResponse.data.emailSettings || {};
      setEmailSettingsData({
        fromName: es.fromName || '',
        emailSignature: es.emailSignature || '',
        emailSignatureEnabled: es.emailSignatureEnabled || false,
      });
    }
  }, [companyResponse?.data]);

  // Email settings update mutation
  const updateEmailSettingsMutation = useMutation({
    mutationFn: (data) => apiClient.put('/companies/settings', { emailSettings: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-current'] });
      showToast('Email settings updated successfully', 'success');
    },
    onError: (error) => {
      showToast(error.response?.data?.error || 'Failed to update email settings', 'error');
    },
    onSettled: () => setSavingFrom(null)
  });

  const handleSaveEmailSettings = () => {
    setSavingFrom('email-settings');
    updateEmailSettingsMutation.mutate(emailSettingsData);
  };

  // Initialize form data when user data loads
  useEffect(() => {
    if (user) {
      setProfileFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || ''
      });
      setPhoneValue(user.phone || '');

      const userTheme = user.preferences?.theme || 'system';
      const userAccent = user.preferences?.accentColor || 'ocean-blue';
      setPreferences({
        theme: userTheme,
        accentColor: userAccent,
        notifications: {
          email: user.preferences?.notifications?.email ?? true,
          desktop: user.preferences?.notifications?.desktop ?? true,
          sound: user.preferences?.notifications?.sound ?? true
        }
      });
      if (user.preferences?.notificationTunes) {
        setNotificationTunes(user.preferences.notificationTunes || []);
      }
      if (user.preferences?.selectedNotificationTune) {
        setSelectedTune(user.preferences.selectedNotificationTune);
      } else {
        setSelectedTune('message.mp3');
      }
    }
  }, [user, setThemeStore]);

  // Sync accent color from server preference (runs once when user data loads)
  const accentSyncedRef = useRef(false);
  useEffect(() => {
    if (user && !accentSyncedRef.current) {
      const serverAccent = user.preferences?.accentColor;
      if (serverAccent && serverAccent !== accentColor) {
        setAccentColor(serverAccent);
      }
      accentSyncedRef.current = true;
    }
  }, [user, accentColor, setAccentColor]);

  // Track dirty state for profile form
  const isProfileDirty = useMemo(() => {
    if (!user) return false;
    return (
      (profileFormData.firstName || '') !== (user.firstName || '') ||
      (profileFormData.lastName || '') !== (user.lastName || '') ||
      (phoneValue || '') !== (user.phone || '')
    );
  }, [user, profileFormData, phoneValue]);

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isProfileDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProfileDirty]);

  // Cleanup audio elements on unmount
  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        if (audio) {
          audio.pause();
          audio.src = '';
        }
      });
      audioRefs.current = {};
      setPlayingTune(null);
    };
  }, []);

  const handleProfileSubmit = (e) => {
    e.preventDefault();
    setSavingFrom('profile');
    updateProfileMutation.mutate(profileFormData);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      showToast('Password must be at least 8 characters long', 'error');
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      password: passwordData.newPassword
    });
  };

  const handlePreferencesSubmit = (e) => {
    e.preventDefault();
    setSavingFrom('preferences');
    const prefsToSave = {
      ...preferences,
      selectedNotificationTune: selectedTune,
      notificationTunes: notificationTunes
    };
    updateProfileMutation.mutate({ preferences: prefsToSave });
  };

  const handleThemeChange = (value) => {
    setPreferences(prev => ({ ...prev, theme: value }));
    setThemeStore(value);
    const prefsToSave = {
      ...preferences,
      theme: value,
      selectedNotificationTune: selectedTune,
      notificationTunes: notificationTunes
    };
    updateProfileMutation.mutate({ preferences: prefsToSave });
  };

  const handleAccentChange = (presetId) => {
    setAccentColor(presetId);
    setPreferences(prev => ({ ...prev, accentColor: presetId }));
    const prefsToSave = {
      ...preferences,
      accentColor: presetId,
      selectedNotificationTune: selectedTune,
      notificationTunes: notificationTunes
    };
    updateProfileMutation.mutate({ preferences: prefsToSave });
  };

  const showToast = (message, type = 'success') => {
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
    }
    toastIdRef.current = type === 'success'
      ? toast.success(message, { duration: 3000 })
      : toast.error(message, { duration: 4000 });
  };

  // Avatar processing
  const processAvatarFile = async (file, croppedDataUrl = null) => {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast('Only image files are allowed (JPEG, PNG, GIF, WebP)', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('File size must be less than 5MB', 'error');
      return;
    }

    if (croppedDataUrl) {
      setAvatarPreview(croppedDataUrl);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          setImageDimensions({ width: img.width, height: img.height });
          setImageToCrop(e.target.result);
          setShowImageCropper(true);
          setCropPosition({ x: 0, y: 0 });
          setCropScale(1);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
      return;
    }

    setUploadingAvatar(true);
    try {
      let fileToUpload = file;
      if (croppedDataUrl) {
        const response = await fetch(croppedDataUrl);
        const blob = await response.blob();
        fileToUpload = new File([blob], file.name, { type: file.type });
      }

      const formData = new FormData();
      formData.append('file', fileToUpload);

      const response = await apiClient.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response?.success && response?.data?.url) {
        const avatarUrl = response.data.url;
        await updateProfileMutation.mutateAsync({ avatar: avatarUrl });

        queryClient.setQueryData(['user-profile'], (oldData) => {
          if (!oldData) return oldData;
          return { ...oldData, data: { ...oldData.data, avatar: avatarUrl } };
        });
        queryClient.setQueryData(['auth'], (oldData) => {
          if (!oldData) return oldData;
          return { ...oldData, user: { ...oldData.user, avatar: avatarUrl } };
        });
        updateUser({ avatar: avatarUrl });

        setAvatarPreview(null);
        setShowImageCropper(false);
        setImageToCrop(null);
        showToast('Avatar updated successfully!', 'success');
      } else {
        showToast('Failed to upload avatar: Invalid response', 'error');
      }
    } catch (error) {
      showToast(error.response?.data?.error || error.message || 'Failed to upload avatar', 'error');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const getImageDisplaySize = (imgWidth, imgHeight, containerSize) => {
    const aspectRatio = imgWidth / imgHeight;
    let displayWidth, displayHeight;
    if (imgWidth > imgHeight) {
      displayWidth = containerSize;
      displayHeight = containerSize / aspectRatio;
    } else {
      displayHeight = containerSize;
      displayWidth = containerSize * aspectRatio;
    }
    return { displayWidth, displayHeight };
  };

  const getImageBounds = (imgWidth, imgHeight, containerSize, scale) => {
    const { displayWidth, displayHeight } = getImageDisplaySize(imgWidth, imgHeight, containerSize);
    const scaledWidth = displayWidth * scale;
    const scaledHeight = displayHeight * scale;
    const maxX = Math.max(0, (scaledWidth - containerSize) / 2);
    const maxY = Math.max(0, (scaledHeight - containerSize) / 2);
    return { maxX, maxY };
  };

  const constrainPosition = (x, y, imgWidth, imgHeight, containerSize, scale) => {
    const bounds = getImageBounds(imgWidth, imgHeight, containerSize, scale);
    return {
      x: Math.max(-bounds.maxX, Math.min(bounds.maxX, x)),
      y: Math.max(-bounds.maxY, Math.min(bounds.maxY, y))
    };
  };

  const handleCropConfirm = async () => {
    if (!imageToCrop || !avatarInputRef.current?.files?.[0] || !imageDimensions.width) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      const outputSize = 400;
      canvas.width = outputSize;
      canvas.height = outputSize;

      const containerSize = imageContainerRef.current?.offsetWidth || 400;
      const { displayWidth, displayHeight } = getImageDisplaySize(
        imageDimensions.width, imageDimensions.height, containerSize
      );

      const scaledDisplayWidth = displayWidth * cropScale;
      const cropRadius = (containerSize / 2) - 16;
      const visibleCropSize = cropRadius * 2;
      const pixelToOriginalScale = img.width / scaledDisplayWidth;

      const offsetXInOriginal = cropPosition.x * pixelToOriginalScale;
      const offsetYInOriginal = cropPosition.y * pixelToOriginalScale;

      const cropCenterX = img.width / 2 - offsetXInOriginal;
      const cropCenterY = img.height / 2 - offsetYInOriginal;
      const cropSizeInOriginal = visibleCropSize * pixelToOriginalScale;

      const sourceX = Math.max(0, Math.min(img.width - cropSizeInOriginal, cropCenterX - cropSizeInOriginal / 2));
      const sourceY = Math.max(0, Math.min(img.height - cropSizeInOriginal, cropCenterY - cropSizeInOriginal / 2));
      const actualCropSize = Math.min(cropSizeInOriginal, img.width - sourceX, img.height - sourceY);

      ctx.drawImage(img, sourceX, sourceY, actualCropSize, actualCropSize, 0, 0, outputSize, outputSize);
      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      processAvatarFile(avatarInputRef.current.files[0], croppedDataUrl);
    };
    img.src = imageToCrop;
  };

  // Image drag handlers
  const handleImageMouseDown = (e) => {
    e.preventDefault();
    setIsDraggingImage(true);
    setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y });
  };

  const handleImageTouchStart = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    setIsDraggingImage(true);
    setDragStart({ x: touch.clientX - cropPosition.x, y: touch.clientY - cropPosition.y });
  };

  const handleImageWheel = (e) => {
    e.preventDefault();
    if (!imageDimensions.width || !imageContainerRef.current) return;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.5, Math.min(3, cropScale * delta));
    const containerSize = imageContainerRef.current.offsetWidth;
    const constrained = constrainPosition(
      cropPosition.x, cropPosition.y,
      imageDimensions.width, imageDimensions.height,
      containerSize, newScale
    );
    setCropScale(newScale);
    setCropPosition(constrained);
  };

  useEffect(() => {
    if (imageDimensions.width > 0 && imageContainerRef.current && cropScale > 0) {
      const containerSize = imageContainerRef.current.offsetWidth;
      setCropPosition(prev => constrainPosition(
        prev.x, prev.y,
        imageDimensions.width, imageDimensions.height,
        containerSize, cropScale
      ));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropScale]);

  useEffect(() => {
    if (isDraggingImage && imageDimensions.width > 0) {
      const handleGlobalMouseMove = (e) => {
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;
        const containerSize = imageContainerRef.current?.offsetWidth || 400;
        const constrained = constrainPosition(newX, newY, imageDimensions.width, imageDimensions.height, containerSize, cropScale);
        setCropPosition(constrained);
      };
      const handleGlobalTouchMove = (e) => {
        if (e.touches.length > 0) {
          e.preventDefault();
          const touch = e.touches[0];
          const newX = touch.clientX - dragStart.x;
          const newY = touch.clientY - dragStart.y;
          const containerSize = imageContainerRef.current?.offsetWidth || 400;
          const constrained = constrainPosition(newX, newY, imageDimensions.width, imageDimensions.height, containerSize, cropScale);
          setCropPosition(constrained);
        }
      };
      const handleGlobalMouseUp = () => setIsDraggingImage(false);

      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
      window.addEventListener('mouseup', handleGlobalMouseUp);
      window.addEventListener('touchend', handleGlobalMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('touchmove', handleGlobalTouchMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
        window.removeEventListener('touchend', handleGlobalMouseUp);
      };
    }
  }, [isDraggingImage, dragStart, imageDimensions, cropScale]);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (file) await processAvatarFile(file);
  };

  const handleDeleteAvatar = async () => {
    setUploadingAvatar(true);
    try {
      await updateProfileMutation.mutateAsync({ avatar: null });
      queryClient.setQueryData(['user-profile'], (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, data: { ...oldData.data, avatar: null } };
      });
      queryClient.setQueryData(['auth'], (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, user: { ...oldData.user, avatar: null } };
      });
      updateUser({ avatar: null });
      setShowDeleteAvatarDialog(false);
      setAvatarPreview(null);
      showToast('Avatar deleted successfully!', 'success');
    } catch (error) {
      showToast(error.response?.data?.error || error.message || 'Failed to delete avatar', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await processAvatarFile(file);
      e.dataTransfer.clearData();
    }
  };

  // Notification tune handlers
  const handleTuneUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'];
    if (!allowedTypes.includes(file.type)) {
      showToast('Only audio files are allowed (MP3, WAV, OGG, WebM)', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('File size must be less than 5MB', 'error');
      return;
    }

    setUploadingTune(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const isSuccess = response?.success === true;
      const fileUrl = response?.data?.url;

      if (isSuccess && fileUrl) {
        const newTune = {
          name: file.name.replace(/\.[^/.]+$/, ''),
          url: fileUrl,
          uploadedAt: new Date().toISOString()
        };
        const updatedTunes = [...notificationTunes, newTune];
        setNotificationTunes(updatedTunes);
        const prefsToSave = {
          ...preferences,
          notificationTunes: updatedTunes,
          selectedNotificationTune: selectedTune
        };
        await updateProfileMutation.mutateAsync({ preferences: prefsToSave });
        showToast('Notification tune uploaded successfully!', 'success');
      } else {
        const errorMsg = response.data?.error || response.data?.message || response.error || response.message || 'Failed to upload tune';
        showToast(errorMsg, 'error');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to upload notification tune';
      showToast(errorMessage, 'error');
    } finally {
      setUploadingTune(false);
      if (tuneInputRef.current) tuneInputRef.current.value = '';
    }
  };

  const handleSelectTune = async (tuneUrl) => {
    setSelectedTune(tuneUrl);
    const prefsToSave = {
      ...preferences,
      selectedNotificationTune: tuneUrl,
      notificationTunes: notificationTunes
    };
    updateProfileMutation.mutate({ preferences: prefsToSave });
    showToast('Notification tune selected!', 'success');
  };

  const handleDeleteTune = async () => {
    if (!tuneToDelete) return;
    const updatedTunes = notificationTunes.filter(tune => tune.url !== tuneToDelete);
    setNotificationTunes(updatedTunes);
    if (selectedTune === tuneToDelete) setSelectedTune('message.mp3');
    const prefsToSave = {
      ...preferences,
      notificationTunes: updatedTunes,
      selectedNotificationTune: selectedTune === tuneToDelete ? 'message.mp3' : selectedTune
    };
    try {
      await updateProfileMutation.mutateAsync({ preferences: prefsToSave });
      showToast('Notification tune deleted successfully!', 'success');
      setShowDeleteDialog(false);
      setTuneToDelete(null);
    } catch (error) {
      showToast('Failed to delete notification tune', 'error');
    }
  };

  const handlePlayTune = (tuneUrl) => {
    try {
      if (playingTune && audioRefs.current[playingTune]) {
        try {
          audioRefs.current[playingTune].pause();
          audioRefs.current[playingTune].currentTime = 0;
        } catch (e) { /* ignore */ }
      }
      if (playingTune === tuneUrl) { setPlayingTune(null); return; }

      let audioSrc = tuneUrl;
      if (tuneUrl === 'default' || tuneUrl === 'notification.mp3') audioSrc = '/sounds/notification.mp3';
      else if (tuneUrl === 'message.mp3') audioSrc = '/sounds/message.mp3';

      if (!audioRefs.current[tuneUrl]) audioRefs.current[tuneUrl] = new Audio(audioSrc);
      const audio = audioRefs.current[tuneUrl];
      audio.onended = () => setPlayingTune(null);
      audio.onerror = () => { showToast('Failed to play notification tune', 'error'); setPlayingTune(null); };
      audio.play().catch((error) => {
        if (error.name === 'NotAllowedError') {
          showToast('Audio playback blocked by browser. Please interact with the page first.', 'error');
        } else {
          showToast('Failed to play notification tune', 'error');
        }
        setPlayingTune(null);
      });
      setPlayingTune(tuneUrl);
    } catch (error) {
      showToast('Failed to play notification tune', 'error');
      setPlayingTune(null);
    }
  };

  const getRoleBadgeStyle = (role) => {
    switch (role) {
      case 'super_admin': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800';
      case 'company_admin': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800';
      case 'agent': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'company_admin': return 'Company Admin';
      case 'agent': return 'Agent';
      default: return role;
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
      case 'inactive': return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700';
      case 'suspended': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Auto-refetch when profile data is missing (handles race condition on hard refresh)
  useEffect(() => {
    if (!isLoading && !error && !user && currentUser && !isRefetching) {
      const timer = setTimeout(() => {
        refetch();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, error, user, currentUser, isRefetching, refetch]);

  // Loading — show spinner while auth hydrates, query loads, or auto-retrying empty response
  if (isLoading || !currentUser || (!user && !error)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" role="status" aria-label="Loading profile">
        <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary" aria-hidden="true" />
        <span className="sr-only">Loading profile...</span>
      </div>
    );
  }

  // Error — only shown after all retries are exhausted
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <X className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Failed to load profile</h3>
              <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
            </div>
            <Button onClick={() => refetch()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sound item renderer
  const renderSoundItem = (tuneUrl, name, subtitle, isCustom = false) => (
    <div
      key={tuneUrl}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-all',
        selectedTune === tuneUrl
          ? 'border-primary/50 bg-primary/5'
          : 'border-border hover:border-muted-foreground/30'
      )}
    >
      <button
        type="button"
        onClick={() => handlePlayTune(tuneUrl)}
        aria-label={playingTune === tuneUrl ? `Pause ${name}` : `Play ${name}`}
        className={cn(
          'w-9 h-9 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center shrink-0 transition-colors',
          playingTune === tuneUrl
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:text-foreground'
        )}
      >
        {playingTune === tuneUrl ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {selectedTune === tuneUrl ? (
          <Badge variant="default" className="text-xs px-2.5">Active</Badge>
        ) : (
          <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleSelectTune(tuneUrl)}>
            Select
          </Button>
        )}
        {isCustom && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive"
            onClick={() => { setTuneToDelete(tuneUrl); setShowDeleteDialog(true); }}
            aria-label={`Delete ${name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );

  // Animation variants — disabled when user prefers reduced motion
  const tabVariants = prefersReducedMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 } };
  const tabTransition = prefersReducedMotion ? { duration: 0 } : { duration: 0.2 };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Profile Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account information and preferences</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* ============ Left Sidebar ============ */}
          <div className="lg:w-72 xl:w-80 shrink-0 space-y-4">
            {/* Profile Summary Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-row lg:flex-col items-center lg:items-center gap-4 lg:gap-0">
                  {/* Avatar */}
                  <div
                    className="relative group shrink-0"
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className={cn('relative', isDragging && 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-full')}>
                      <Avatar
                        className={cn(
                          'w-20 h-20 lg:w-28 lg:h-28',
                          (avatarPreview || user.avatar) && 'cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all'
                        )}
                        onClick={() => { if (avatarPreview || user.avatar) setShowImageViewer(true); }}
                      >
                        <AvatarImage src={avatarPreview || user.avatar} alt={`${user.firstName} ${user.lastName}`} />
                        <AvatarFallback className="text-2xl lg:text-4xl font-semibold bg-primary/10 text-primary">
                          {user.firstName?.[0]}{user.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      {isDragging && (
                        <div className="absolute inset-0 bg-primary/20 rounded-full flex items-center justify-center">
                          <Upload className="h-6 w-6 lg:h-8 lg:w-8 text-primary" />
                        </div>
                      )}
                      {(avatarPreview || user.avatar) && (
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/10 dark:hover:bg-white/10 rounded-full flex items-center justify-center transition-colors pointer-events-none">
                          <ZoomIn className="h-5 w-5 lg:h-6 lg:w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      )}
                    </div>
                    {/* Upload/Delete Buttons */}
                    <div className="absolute -bottom-1 -right-1 lg:bottom-0 lg:left-1/2 lg:-translate-x-1/2 flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="rounded-full h-7 w-7 lg:h-8 lg:w-8 min-h-[44px] min-w-[44px] shadow-md border border-border"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        aria-label="Upload avatar"
                      >
                        {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Camera className="h-3.5 w-3.5" />}
                      </Button>
                      {user.avatar && (
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          className="rounded-full h-7 w-7 lg:h-8 lg:w-8 min-h-[44px] min-w-[44px] shadow-md"
                          onClick={() => setShowDeleteAvatarDialog(true)}
                          disabled={uploadingAvatar}
                          aria-label="Delete avatar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </div>

                  {/* Name & Info */}
                  <div className="flex-1 lg:flex-none lg:mt-4 lg:text-center min-w-0">
                    <h2 className="text-lg font-semibold text-foreground truncate">
                      {user.firstName} {user.lastName}
                    </h2>
                    <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                    <div className="flex flex-wrap gap-2 mt-2.5 lg:justify-center">
                      <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border', getRoleBadgeStyle(user.role))}>
                        {getRoleLabel(user.role)}
                      </span>
                      <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize', getStatusStyle(user.status))}>
                        {user.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Info */}
                <div className="mt-5 pt-5 border-t border-border space-y-3">
                  {user.phone && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <PhoneNumberDisplay phone={user.phone} />
                    </div>
                  )}
                  {user.companyDetails && (
                    <div className="flex items-center gap-3 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-foreground truncate">{user.companyDetails.name}</span>
                    </div>
                  )}
                  {user.departmentDetails && user.departmentDetails.length > 0 && (
                    <div className="flex items-center gap-3 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-foreground truncate">
                        {user.departmentDetails.map(d => d.name).join(', ')}
                      </span>
                    </div>
                  )}
                  {user.createdAt && (
                    <div className="flex items-center gap-3 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">
                        Joined {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Desktop Navigation */}
            <Card className="hidden lg:block">
              <CardContent className="p-2">
                <nav className="space-y-0.5">
                  {NAV_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      aria-current={activeTab === item.id ? 'page' : undefined}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                        activeTab === item.id
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </button>
                  ))}
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* ============ Mobile Navigation ============ */}
          <div className="lg:hidden flex gap-2 overflow-x-auto pb-1 scrollbar-none -mt-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                aria-current={activeTab === item.id ? 'page' : undefined}
                className={cn(
                  'shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border',
                  activeTab === item.id
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:bg-muted'
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>

          {/* ============ Content Area ============ */}
          <div className="flex-1 min-w-0 space-y-6">
            <AnimatePresence mode="wait">
              {/* -------- General / Profile Section -------- */}
              {activeTab === 'profile' && (
                <motion.div
                  key="profile"
                  initial={tabVariants.initial}
                  animate={tabVariants.animate}
                  exit={tabVariants.exit}
                  transition={tabTransition}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">General Information</CardTitle>
                      <CardDescription>Update your personal details and contact information</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleProfileSubmit} className="space-y-5">
                        {/* Avatar Upload Area */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Profile Picture</Label>
                          <div
                            className={cn(
                              'flex items-center gap-4 p-4 border-2 border-dashed rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                              isDragging
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-muted-foreground/30'
                            )}
                            onDragEnter={handleDragEnter}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            tabIndex={0}
                            role="button"
                            aria-label="Profile picture upload area. Press Enter to upload."
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                avatarInputRef.current?.click();
                              }
                            }}
                          >
                            <div className="relative shrink-0">
                              <Avatar
                                className={cn(
                                  'w-16 h-16',
                                  (avatarPreview || user.avatar) && 'cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all'
                                )}
                                onClick={() => { if (avatarPreview || user.avatar) setShowImageViewer(true); }}
                              >
                                <AvatarImage src={avatarPreview || user.avatar} alt={`${user.firstName} ${user.lastName}`} />
                                <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                                  {user.firstName?.[0]}{user.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              {isDragging && (
                                <div className="absolute inset-0 bg-primary/20 rounded-full flex items-center justify-center">
                                  <Upload className="h-5 w-5 text-primary" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => avatarInputRef.current?.click()}
                                  disabled={uploadingAvatar}
                                >
                                  {uploadingAvatar ? (
                                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Uploading...</>
                                  ) : (
                                    <><Upload className="mr-1.5 h-3.5 w-3.5" /> Upload</>
                                  )}
                                </Button>
                                {user.avatar && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => setShowDeleteAvatarDialog(true)}
                                    disabled={uploadingAvatar}
                                  >
                                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                                  </Button>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Drag and drop or click to upload. JPEG, PNG, GIF, WebP. Max 5MB.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Name Fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="firstName">First Name</Label>
                            <Input
                              id="firstName"
                              value={profileFormData.firstName}
                              onChange={(e) => setProfileFormData({ ...profileFormData, firstName: e.target.value })}
                              placeholder="Enter first name"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="lastName">Last Name</Label>
                            <Input
                              id="lastName"
                              value={profileFormData.lastName}
                              onChange={(e) => setProfileFormData({ ...profileFormData, lastName: e.target.value })}
                              placeholder="Enter last name"
                              required
                            />
                          </div>
                        </div>

                        {/* Email (read-only) */}
                        <div className="space-y-2">
                          <Label htmlFor="email">Email Address</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="email"
                              type="email"
                              value={user.email || ''}
                              disabled
                              className="pl-10 bg-muted/50"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">Email address cannot be changed</p>
                        </div>

                        {/* Phone */}
                        <div className="space-y-2">
                          <Label htmlFor="phone">Phone Number</Label>
                          <PhoneInput
                            value={phoneValue}
                            onChange={(value) => {
                              setPhoneValue(value);
                              setProfileFormData({ ...profileFormData, phone: value });
                              setPhoneError('');
                            }}
                            error={phoneError}
                            placeholder="Enter phone number"
                            disabled={updateProfileMutation.isPending}
                          />
                        </div>

                        {/* Save */}
                        <div className="flex justify-end pt-2">
                          <Button type="submit" disabled={(updateProfileMutation.isPending && savingFrom === 'profile') || !isProfileDirty}>
                            {updateProfileMutation.isPending && savingFrom === 'profile' ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> Saving...</>
                            ) : (
                              <><Save className="mr-2 h-4 w-4" /> Save Changes</>
                            )}
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* -------- Security / Password Section -------- */}
              {activeTab === 'password' && (
                <motion.div
                  key="password"
                  initial={tabVariants.initial}
                  animate={tabVariants.animate}
                  exit={tabVariants.exit}
                  transition={tabTransition}
                >
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
                          <Shield className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">Change Password</CardTitle>
                          <CardDescription>Update your password to keep your account secure</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handlePasswordSubmit} className="max-w-lg space-y-5">
                        <div className="space-y-2">
                          <Label htmlFor="currentPassword">Current Password</Label>
                          <div className="relative">
                            <Input
                              id="currentPassword"
                              type={showCurrentPassword ? 'text' : 'password'}
                              value={passwordData.currentPassword}
                              onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                              placeholder="Enter current password"
                              required
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full min-h-[44px] min-w-[44px] px-3 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                              aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                            >
                              {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="newPassword">New Password</Label>
                          <div className="relative">
                            <Input
                              id="newPassword"
                              type={showNewPassword ? 'text' : 'password'}
                              value={passwordData.newPassword}
                              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                              placeholder="Enter new password"
                              required
                              minLength={8}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full min-h-[44px] min-w-[44px] px-3 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                            >
                              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">Must be at least 8 characters long</p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">Confirm New Password</Label>
                          <div className="relative">
                            <Input
                              id="confirmPassword"
                              type={showConfirmPassword ? 'text' : 'password'}
                              value={passwordData.confirmPassword}
                              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                              placeholder="Confirm new password"
                              required
                              minLength={8}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full min-h-[44px] min-w-[44px] px-3 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <Button type="submit" disabled={changePasswordMutation.isPending}>
                            {changePasswordMutation.isPending ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> Changing...</>
                            ) : (
                              <><Lock className="mr-2 h-4 w-4" /> Change Password</>
                            )}
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* -------- Notifications Section -------- */}
              {activeTab === 'notifications' && (
                <motion.div
                  key="notifications"
                  initial={tabVariants.initial}
                  animate={tabVariants.animate}
                  exit={tabVariants.exit}
                  transition={tabTransition}
                  className="space-y-6"
                >
                  {/* Notification Preferences Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Notification Preferences</CardTitle>
                      <CardDescription>Choose how you want to receive notifications</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handlePreferencesSubmit}>
                        <div className="space-y-1">
                          {[
                            { key: 'email', icon: Mail, label: 'Email Notifications', desc: 'Receive notifications via email' },
                            { key: 'desktop', icon: Monitor, label: 'Desktop Notifications', desc: 'Show browser push notifications' },
                            { key: 'sound', icon: Bell, label: 'Sound Notifications', desc: 'Play a sound for new notifications' },
                          ].map((item) => (
                            <div key={item.key} className="flex items-center justify-between py-3 px-1">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                  <item.icon className="w-4 h-4 text-muted-foreground" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                                </div>
                              </div>
                              <Switch
                                checked={preferences.notifications[item.key]}
                                onCheckedChange={(checked) =>
                                  setPreferences({
                                    ...preferences,
                                    notifications: { ...preferences.notifications, [item.key]: checked }
                                  })
                                }
                              />
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-end pt-4 mt-2 border-t border-border">
                          <Button type="submit" disabled={updateProfileMutation.isPending && savingFrom === 'preferences'}>
                            {updateProfileMutation.isPending && savingFrom === 'preferences' ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> Saving...</>
                            ) : (
                              <><Save className="mr-2 h-4 w-4" /> Save Preferences</>
                            )}
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Notification Sounds Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Notification Sounds</CardTitle>
                      <CardDescription>Choose your preferred notification sound</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Default Sounds */}
                      {renderSoundItem('notification.mp3', 'Default Notification', 'Built-in notification sound')}
                      {renderSoundItem('message.mp3', 'Default Message', 'Built-in message sound')}

                      {/* Custom Sounds */}
                      {notificationTunes.map((tune) =>
                        renderSoundItem(
                          tune.url,
                          tune.name,
                          tune.uploadedAt ? `Uploaded ${new Date(tune.uploadedAt).toLocaleDateString()}` : 'Custom sound',
                          true
                        )
                      )}

                      {/* Upload Button */}
                      <div className="pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full border-dashed"
                          onClick={() => tuneInputRef.current?.click()}
                          disabled={uploadingTune}
                        >
                          {uploadingTune ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> Uploading...</>
                          ) : (
                            <><Upload className="mr-2 h-4 w-4" /> Upload Custom Sound</>
                          )}
                        </Button>
                        <input ref={tuneInputRef} type="file" accept="audio/*" className="hidden" onChange={handleTuneUpload} />
                        <p className="text-xs text-muted-foreground mt-1.5 text-center">
                          MP3, WAV, OGG or WebM. Max 5MB.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* -------- Appearance Section -------- */}
              {activeTab === 'appearance' && (
                <motion.div
                  key="appearance"
                  initial={tabVariants.initial}
                  animate={tabVariants.animate}
                  exit={tabVariants.exit}
                  transition={tabTransition}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Appearance</CardTitle>
                      <CardDescription>Customize the look and feel of the application</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <Label className="text-sm font-medium">Theme</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {THEME_OPTIONS.map((theme) => (
                            <button
                              key={theme.value}
                              type="button"
                              onClick={() => handleThemeChange(theme.value)}
                              className={cn(
                                'relative cursor-pointer rounded-xl border-2 p-5 transition-all',
                                preferences.theme === theme.value
                                  ? 'border-primary bg-primary/5 shadow-sm'
                                  : 'border-border hover:border-muted-foreground/30 hover:shadow-sm'
                              )}
                            >
                              <div className="flex flex-col items-center gap-3 text-center">
                                <div className={cn(
                                  'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
                                  preferences.theme === theme.value
                                    ? 'bg-primary/15 text-primary'
                                    : 'bg-muted text-muted-foreground'
                                )}>
                                  <theme.icon className="w-5 h-5" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">{theme.label}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{theme.description}</p>
                                </div>
                              </div>
                              {preferences.theme === theme.value && (
                                <div className="absolute top-3 right-3">
                                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                    <Check className="w-3 h-3 text-primary-foreground" />
                                  </div>
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground pt-1">
                          {preferences.theme === 'system'
                            ? 'Follows your operating system theme setting'
                            : 'Theme is applied immediately'}
                        </p>
                      </div>

                      {/* Accent Color Picker */}
                      <div className="space-y-4 pt-6 border-t border-border">
                        <div>
                          <Label className="text-sm font-medium">Accent Color</Label>
                          <p className="text-xs text-muted-foreground mt-1">Choose a color that applies across the entire app</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {Object.values(COLOR_PRESETS).map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => handleAccentChange(preset.id)}
                              className={cn(
                                'group relative w-10 h-10 rounded-full border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring',
                                (accentColor || 'ocean-blue') === preset.id
                                  ? 'border-foreground shadow-lg scale-110'
                                  : 'border-border hover:border-muted-foreground'
                              )}
                              style={{ backgroundColor: preset.preview }}
                              title={preset.name}
                              aria-label={`${preset.name} accent color`}
                            >
                              {(accentColor || 'ocean-blue') === preset.id && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Check className="w-4 h-4 text-white drop-shadow-md" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Gradient Presets */}
                      <div className="space-y-4 pt-6 border-t border-border">
                        <div>
                          <Label className="text-sm font-medium">Gradient Accents</Label>
                          <p className="text-xs text-muted-foreground mt-1">Premium gradient themes — applies to buttons and key elements</p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {Object.values(GRADIENT_PRESETS).map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => handleAccentChange(preset.id)}
                              className={cn(
                                'relative h-14 rounded-xl border-2 transition-all hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring overflow-hidden',
                                accentColor === preset.id
                                  ? 'border-foreground shadow-lg scale-[1.03]'
                                  : 'border-border hover:border-muted-foreground'
                              )}
                              style={{ background: preset.preview }}
                              title={preset.name}
                              aria-label={`${preset.name} gradient accent`}
                            >
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xs font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{preset.name}</span>
                              </div>
                              {accentColor === preset.id && (
                                <div className="absolute top-1.5 right-1.5">
                                  <div className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center shadow-sm">
                                    <Check className="w-3 h-3 text-gray-900" />
                                  </div>
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* -------- Email Settings Section (company_admin only) -------- */}
              {activeTab === 'email-settings' && currentUser?.role === 'company_admin' && (
                <motion.div
                  key="email-settings"
                  initial={tabVariants.initial}
                  animate={tabVariants.animate}
                  exit={tabVariants.exit}
                  transition={tabTransition}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Email Settings</CardTitle>
                      <CardDescription>Configure the sender identity for all outbound emails sent from your company</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {isLoadingCompany ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <>
                          {/* From Name */}
                          <div className="space-y-2">
                            <Label htmlFor="email-from-name" className="text-sm font-medium">
                              Sender Name (From Name)
                            </Label>
                            <Input
                              id="email-from-name"
                              value={emailSettingsData.fromName}
                              onChange={(e) => setEmailSettingsData(prev => ({ ...prev, fromName: e.target.value }))}
                              placeholder="e.g. My Company Name"
                              className="max-w-md"
                            />
                            <p className="text-xs text-muted-foreground">
                              This name will appear as the sender when your company sends emails. If left empty, defaults to &quot;OmniConnect&quot;.
                            </p>
                          </div>

                          {/* Email Preview - Professional inbox-style */}
                          <div className="rounded-xl border border-border overflow-hidden max-w-lg">
                            <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Inbox Preview</p>
                            </div>
                            <div className="px-4 py-3.5 flex items-start gap-3 bg-background">
                              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                                <Mail className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-foreground truncate">
                                    {emailSettingsData.fromName || 'OmniConnect'}
                                  </p>
                                  <span className="text-[11px] text-muted-foreground shrink-0">Now</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Re: Your inquiry - Thank you for reaching out
                                </p>
                                <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                                  Hi there, thank you for your interest! Our team will be in touch shortly...
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Save Sender Settings */}
                          <div className="flex justify-end pt-2">
                            <Button
                              onClick={handleSaveEmailSettings}
                              disabled={updateEmailSettingsMutation.isPending}
                              className="min-w-[120px]"
                            >
                              {updateEmailSettingsMutation.isPending ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                              ) : (
                                <><Save className="mr-2 h-4 w-4" /> Save Changes</>
                              )}
                            </Button>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* ---- Email Signature Card ---- */}
                  <Card className="mt-6">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">Email Signature</CardTitle>
                          <CardDescription className="mt-1">
                            Design a professional signature that will be automatically appended to every outbound email
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="sig-toggle" className="text-sm text-muted-foreground">
                            {emailSettingsData.emailSignatureEnabled ? 'Enabled' : 'Disabled'}
                          </Label>
                          <Switch
                            id="sig-toggle"
                            checked={emailSettingsData.emailSignatureEnabled}
                            onCheckedChange={(checked) => setEmailSettingsData(prev => ({ ...prev, emailSignatureEnabled: checked }))}
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {isLoadingCompany ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <>
                          {!emailSettingsData.emailSignatureEnabled && (
                            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
                              <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                              <p className="text-sm text-muted-foreground">
                                Enable the toggle above to create your email signature
                              </p>
                            </div>
                          )}

                          {emailSettingsData.emailSignatureEnabled && (
                            <>
                              <EmailSignatureEditor
                                value={emailSettingsData.emailSignature}
                                onChange={(html) => setEmailSettingsData(prev => ({ ...prev, emailSignature: html }))}
                              />

                              <p className="text-xs text-muted-foreground">
                                Use the toolbar to format text, add links, insert your company logo, and style your signature.
                                The signature will appear below every outbound email with a separator line.
                              </p>

                              {/* Full Email Preview */}
                              {emailSettingsData.emailSignature && (
                                <div className="rounded-lg border border-border overflow-hidden">
                                  <div className="px-4 py-2 bg-muted/30 border-b border-border">
                                    <p className="text-xs font-medium text-muted-foreground">Full Email Preview</p>
                                  </div>
                                  <div className="p-4 bg-white dark:bg-gray-950" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '14px', lineHeight: '1.5', color: '#333' }}>
                                    <p style={{ color: '#666', fontStyle: 'italic', marginBottom: '16px' }}>Your email message content will appear here...</p>
                                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px', marginTop: '12px' }}>
                                      <div dangerouslySetInnerHTML={{ __html: emailSettingsData.emailSignature }} />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {/* Save Signature */}
                          <div className="flex items-center justify-between pt-2">
                            {emailSettingsData.emailSignatureEnabled && emailSettingsData.emailSignature && (
                              <Button
                                variant="outline"
                                onClick={() => setEmailSettingsData(prev => ({ ...prev, emailSignature: '' }))}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                              >
                                Clear Signature
                              </Button>
                            )}
                            {!emailSettingsData.emailSignatureEnabled && !emailSettingsData.emailSignature && <div />}
                            <Button
                              onClick={handleSaveEmailSettings}
                              disabled={updateEmailSettingsMutation.isPending}
                              className="min-w-[120px]"
                            >
                              {updateEmailSettingsMutation.isPending ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                              ) : (
                                <><Save className="mr-2 h-4 w-4" /> Save Changes</>
                              )}
                            </Button>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ============ Dialogs ============ */}

      {/* Image Viewer */}
      <Dialog open={showImageViewer} onOpenChange={setShowImageViewer}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] p-0 bg-black/95 border-none" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Profile Picture</DialogTitle>
          </DialogHeader>
          <div className="relative w-full h-full flex items-center justify-center p-4">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-50 min-h-[44px] min-w-[44px] text-white hover:bg-white/20 rounded-full"
              onClick={() => setShowImageViewer(false)}
              aria-label="Close image viewer"
            >
              <X className="h-6 w-6" />
            </Button>
            <motion.img
              src={avatarPreview || user.avatar}
              alt={`${user.firstName} ${user.lastName}`}
              className="max-w-full max-h-full object-contain rounded-lg"
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.9 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3 }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Cropper */}
      <Dialog open={showImageCropper} onOpenChange={(open) => {
        if (!open) {
          setShowImageCropper(false);
          setImageToCrop(null);
          setCropPosition({ x: 0, y: 0 });
          setCropScale(1);
          setImageDimensions({ width: 0, height: 0 });
          if (avatarInputRef.current) avatarInputRef.current.value = '';
        }
      }}>
        <DialogContent className="max-w-2xl w-[95vw] p-0" showCloseButton={false}>
          <DialogHeader className="px-6 pt-6 pb-0">
            <div className="flex items-center justify-between">
              <DialogTitle>Adjust Profile Picture</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 min-h-[44px] min-w-[44px]"
                onClick={() => {
                  setShowImageCropper(false);
                  setImageToCrop(null);
                  setCropPosition({ x: 0, y: 0 });
                  setCropScale(1);
                  setImageDimensions({ width: 0, height: 0 });
                  if (avatarInputRef.current) avatarInputRef.current.value = '';
                }}
                aria-label="Close image cropper"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div
              ref={imageContainerRef}
              className="relative w-full aspect-square bg-muted rounded-lg overflow-hidden border-2 border-border touch-none"
              onWheel={handleImageWheel}
            >
              {imageToCrop && imageDimensions.width > 0 && (() => {
                const containerSize = imageContainerRef.current?.offsetWidth || 400;
                const { displayWidth, displayHeight } = getImageDisplaySize(
                  imageDimensions.width, imageDimensions.height, containerSize
                );
                return (
                  <motion.img
                    ref={imageRef}
                    src={imageToCrop}
                    alt="Crop preview"
                    className="absolute cursor-move select-none touch-none"
                    style={{
                      width: `${displayWidth}px`,
                      height: `${displayHeight}px`,
                      top: '50%',
                      left: '50%',
                      transform: `translate(calc(-50% + ${cropPosition.x}px), calc(-50% + ${cropPosition.y}px)) scale(${cropScale})`,
                      transformOrigin: 'center center',
                      maxWidth: 'none',
                      maxHeight: 'none'
                    }}
                    onMouseDown={handleImageMouseDown}
                    onTouchStart={handleImageTouchStart}
                    draggable={false}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  />
                );
              })()}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-4 border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] rounded-full" />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Move className="h-4 w-4" />
                  <span>Drag to position</span>
                </div>
                <span className="text-border">|</span>
                <div className="flex items-center gap-1.5">
                  <ZoomIn className="h-4 w-4" />
                  <span>Scroll to zoom</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowImageCropper(false);
                    setImageToCrop(null);
                    setCropPosition({ x: 0, y: 0 });
                    setCropScale(1);
                    if (avatarInputRef.current) avatarInputRef.current.value = '';
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleCropConfirm} disabled={uploadingAvatar}>
                  {uploadingAvatar ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> Uploading...</>
                  ) : (
                    <><Check className="mr-2 h-4 w-4" /> Apply</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Avatar Dialog */}
      {showDeleteAvatarDialog && (
        <AlertDialog open={showDeleteAvatarDialog} onOpenChange={setShowDeleteAvatarDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Avatar</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete your profile picture? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowDeleteAvatarDialog(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteAvatar} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Delete Tune Dialog */}
      {showDeleteDialog && (
        <AlertDialog open={showDeleteDialog} onOpenChange={(open) => {
          if (!open) { setShowDeleteDialog(false); setTuneToDelete(null); }
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Notification Sound</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this notification sound? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setShowDeleteDialog(false); setTuneToDelete(null); }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteTune} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
