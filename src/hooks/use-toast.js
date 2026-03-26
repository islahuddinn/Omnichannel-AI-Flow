// src/hooks/use-toast.js
/**
 * Toast hook using sonner
 * Provides a shadcn/ui-compatible API for toast notifications
 */

import { toast as sonnerToast } from 'sonner';

/**
 * useToast hook
 * Returns a toast function compatible with shadcn/ui API
 */
export function useToast() {
  const toast = ({ title, description, variant = 'default', ...options }) => {
    // Sonner API: toast.success(title, { description, ...options })
    const toastOptions = description ? { description, ...options } : options;
    const message = title || description || 'Notification';
    
    // Use appropriate sonner method based on variant
    switch (variant) {
      case 'destructive':
        sonnerToast.error(message, toastOptions);
        break;
      case 'success':
        sonnerToast.success(message, toastOptions);
        break;
      case 'warning':
        sonnerToast.warning(message, toastOptions);
        break;
      case 'info':
        sonnerToast.info(message, toastOptions);
        break;
      default:
        sonnerToast(message, toastOptions);
        break;
    }
  };

  return { toast };
}

