
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";

// Fetch Call Route by Phone Number ID
export function useCallRoute(phoneNumberId) {
    return useQuery({
        queryKey: ["callRoute", phoneNumberId],
        queryFn: async () => {
            // The API endpoint described by user is GET /api/call-routes/:phoneNumberId
            // But looking at the request, it might be GET /api/call-routes with param, or GET /api/call-routes/:id
            // The user said: "get: api/call-routes/{{phoneNumberId}}"
            if (!phoneNumberId) return null;
            const { data } = await apiClient.get(`/call-routes/${phoneNumberId}`);
            return data;
        },
        enabled: !!phoneNumberId,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

// Create or Update Call Route
export function useSaveCallRoute() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            // User said: "post method: /api/call-routes"
            const { data } = await apiClient.post("/call-routes", payload);
            return data;
        },
        onSuccess: (data, variables) => {
            // Invalidate the query for the specific phone number
            if (variables.phoneNumberId) {
                queryClient.invalidateQueries({ queryKey: ["callRoute", variables.phoneNumberId] });
            }
        },
    });
}
