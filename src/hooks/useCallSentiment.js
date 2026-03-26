"use client";

import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";

/**
 * Hook to fetch call logs with sentiment analysis
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number (default: 1)
 * @param {number} params.limit - Items per page (default: 20)
 * @param {string} params.operator_id - Comma-separated operator IDs
 * @param {string} params.caller_number - Comma-separated caller numbers
 * @param {string} params.reciever_number - Comma-separated receiver numbers
 * @param {string} params.start_date - Start date (ISO string)
 * @param {string} params.end_date - End date (ISO string)
 * @param {string} params.operator_name - Comma-separated operator names
 * @param {string} params.query - Search query
 * @param {string} params.filter - Call direction filter (incoming/outgoing/allcalls)
 * @param {string} params.country - Country filter (CZ/SK/All)
 * @param {number} params.time_period - Time period in days
 * @param {string} params.group_id - Group ID
 * @param {string} params.calllogId - Specific call log ID
 */
export function useCallSentiment(params = {}) {
    return useQuery({
        queryKey: ["callSentiment", params],
        queryFn: async () => {
            // Remove null/undefined/empty string values to clean up the query string
            const cleanParams = Object.fromEntries(
                Object.entries(params).filter(
                    ([_, v]) => v != null && v !== "" && v !== "all" && v !== "All"
                )
            );

            const response = await apiClient.get("/call-logs/sentiment", {
                params: cleanParams,
            });

            console.log("Call sentiment data", response);
            return response;
        },
        keepPreviousData: true, // Keep data while fetching new page
        staleTime: 1000 * 30, // 30 seconds
    });
}
