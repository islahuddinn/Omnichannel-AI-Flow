// // src/lib/query/client.js
// import { QueryClient } from '@tanstack/react-query';

// export const queryClient = new QueryClient({
//   defaultOptions: {
//     queries: {
//       staleTime: 60 * 1000, // 1 minute
//       refetchOnWindowFocus: false,
//       retry: 1
//     }
//   }
// });



 // src/lib/query/client.js
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity, // ✅ Never consider data stale by default - socket events handle updates
      gcTime: 5 * 60 * 1000, // ✅ Cache for 5 minutes (gcTime replaces cacheTime in v5)
      refetchOnWindowFocus: false, // ✅ Disable - socket events handle real-time updates
      refetchOnMount: false, // ✅ Disable - only fetch once, socket events handle updates
      refetchOnReconnect: false, // ✅ Disable - socket events handle real-time updates
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
      onError: (error) => {
        console.error('Mutation error:', error);
        // You can add toast notifications here
      },
    },
  },
});