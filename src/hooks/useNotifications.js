// src/hooks/useNotifications.js
import { notificationService } from "@/services/notification/NotificationService";

/**
 * Hook wrapper for Sonner notification service.
 * Keeps naming consistent and clean in components.
 */
export default function useNotifications() {
  return {
    notifySuccess: notificationService.success,
    notifyError: notificationService.error,
    notifyInfo: notificationService.info,
    notifyPromise: notificationService.promise,
  };
}
