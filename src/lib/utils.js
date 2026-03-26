import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Get the application base URL dynamically
 * Constructs URL from HOSTNAME and PORT if NEXT_PUBLIC_APP_URL is not set
 * This ensures webchat links and other server-side URLs work with dynamic ports
 */
export function getAppUrl() {
  // If explicitly set, use it
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  
  // Otherwise, construct from HOSTNAME and PORT
  const hostname = process.env.HOSTNAME || 'localhost';
  const port = process.env.PORT || '3000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  
  // Don't include port if it's the default HTTP/HTTPS port
  if ((protocol === 'http' && port === '80') || (protocol === 'https' && port === '443')) {
    return `${protocol}://${hostname}`;
  }
  
  return `${protocol}://${hostname}:${port}`;
}
