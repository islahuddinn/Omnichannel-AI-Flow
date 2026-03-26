"use client";
// Call center: fetches call logs (admin or agent endpoint) and delete mutation with cache invalidation.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";

export function useCallLogs(params = {}, isAgent = false) {
    // Params: page, limit, operator_id, caller_number, reciever_number, group_id, start_date, end_date, operator_name, query, filter
    // isAgent: boolean to determine if using agent endpoint
    return useQuery({
        queryKey: ["callLogs", params, isAgent],
        queryFn: async () => {
            // Remove null/undefined/empty string values to clean up the query string
            const cleanParams = Object.fromEntries(
                Object.entries(params).filter(
                    ([_, v]) => v != null && v !== "" && v !== "all"
                )
            );

            // Use agent endpoint if isAgent is true, otherwise use company admin endpoint
            const endpoint = isAgent ? "/call-logs/agent" : "/call-logs";
            const response = await apiClient.get(endpoint, {
                params: cleanParams,
            });

            console.log("data call logs", response);
            return response;
        },
        keepPreviousData: true, // Keep data while fetching new page
        staleTime: 1000 * 30, // 30 seconds
    });
}

export function useDeleteCallLog() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (callLogId) => {
            const { data } = await apiClient.delete(`/call-logs/${callLogId}`);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["callLogs"] });
        },
    });
}
