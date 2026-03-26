// src/lib/api/client.js
import axios from 'axios';

// Request deduplication cache — stores in-flight GET request promises
// so duplicate GET calls within the same tick reuse the same response
const inflightRequests = new Map();

// Use relative URLs in browser (works with any port), absolute URLs only in SSR if explicitly set
const getBaseURL = () => {
  if (typeof window !== 'undefined') {
    return '/api';
  }
  return process.env.NEXT_PUBLIC_API_URL || '/api';
};

const apiClient = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true, // Send httpOnly cookies with every request
  timeout: 30000, // 30 seconds - needed for auto-mode conversations that send bot message first (up to 10s polling)
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor — pass config through (no deduplication here; handled at adapter level)
apiClient.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    // Return only the data for cleaner usage
    return response.data;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors with token refresh
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // Don't retry auth endpoints
      const isAuthEndpoint = originalRequest.url?.includes('/auth/login') ||
                             originalRequest.url?.includes('/auth/refresh') ||
                             originalRequest.url?.includes('/auth/logout') ||
                             originalRequest.url?.includes('/auth/forgot-password') ||
                             originalRequest.url?.includes('/auth/reset-password') ||
                             originalRequest.url?.includes('/auth/verify-otp');

      // Don't attempt refresh on public pages
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        const isPublicPage = currentPath === '/' ||
                           currentPath.startsWith('/auth/') ||
                           currentPath.startsWith('/webchat');

        if (isPublicPage) {
          return Promise.reject(error);
        }
      }

      if (isAuthEndpoint) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;

      // Max retries limit
      if (originalRequest._retryCount > 1) {
        console.log('🚫 Max retry attempts reached, stopping refresh loop');
        return Promise.reject(error);
      }

      try {
        console.log('🔄 Attempting to refresh token...');
        const refreshResponse = await apiClient.post('/auth/refresh');
        console.log('✅ Token refreshed successfully');

        // Update Zustand store with new access token (needed for Socket.IO reconnection)
        const newAccessToken = refreshResponse?.data?.accessToken;
        if (newAccessToken && typeof window !== 'undefined') {
          try {
            const { default: useUserStore } = await import('../../store/useUserStore');
            const store = useUserStore.getState();
            if (store.isAuthenticated) {
              useUserStore.setState({ token: newAccessToken });
            }
          } catch (storeError) {
            console.warn('⚠️ Could not update store with new token:', storeError.message);
          }
        }

        // Retry the original request (cookies are already updated by refresh response)
        return apiClient(originalRequest);
      } catch (refreshError) {
        console.error('❌ Token refresh failed:', refreshError);

        // Clear stored auth data and redirect to login
        if (typeof window !== 'undefined') {
          const currentPath = window.location.pathname;
          const isPublicPage = currentPath === '/' ||
                             currentPath.startsWith('/auth/');

          if (!isPublicPage) {
            if (window.sessionStorage) {
              window.sessionStorage.clear();
            }
            if (window.localStorage) {
              window.localStorage.removeItem('user-store');
            }
            window.location.href = '/auth/login';
          }
        }

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Cleanup function for testing/debugging
export function clearRequestCache() {
  inflightRequests.clear();
}

export default apiClient;
