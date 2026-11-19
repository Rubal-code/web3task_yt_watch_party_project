/**
 * Simple toast notification using sonner.
 * Re-exports sonner functions with a consistent prefix.
 */

import { toast as sonnerToast, type ToastOptions } from 'sonner';

export const toast = {
  success: (message: string, options?: ToastOptions) =>
    sonnerToast.success(message, options),
  error: (message: string, options?: ToastOptions) =>
    sonnerToast.error(message, options),
  info: (message: string, options?: ToastOptions) =>
    sonnerToast.info(message, options),
  warning: (message: string, options?: ToastOptions) =>
    sonnerToast.warning(message, options),
};