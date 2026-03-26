// src/services/notificationService.js
import { toast } from "sonner";

/**
 * Centralized Sonner notification service
 * Use anywhere to trigger consistent toast notifications.
 */
export const notificationService = {
  success: (message, description) => {
    toast.success(message, { description });
  },

  error: (message, description) => {
    toast.error(message, { description });
  },

  info: (message, description) => {
    toast(message, { description });
  },

  promise: (promise, { loading, success, error }) => {
    toast.promise(promise, {
      loading,
      success,
      error,
    });
  },
};
