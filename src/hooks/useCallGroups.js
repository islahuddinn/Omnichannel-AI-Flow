"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";

export function useCallGroups({ page = 1, limit = 10, search = "", departmentIds } = {}) {
    return useQuery({
        queryKey: ["callGroups", page, limit, search, departmentIds],
        queryFn: async () => {
            const params = { page, limit };
            if (search) params.search = search;
            if (departmentIds && Array.isArray(departmentIds) && departmentIds.length > 0) {
                params.departmentIds = departmentIds.join(",");
            } else if (departmentIds) {
                params.departmentIds = departmentIds;
            }
            const response = await apiClient.get("/call-groups", { params });
            // API returns { success: true, data: [...] }; unwrap to array
            const body = response?.data !== undefined && !Array.isArray(response) ? response : { data: response };
            return Array.isArray(body?.data) ? body.data : body?.data || [];
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

/** Fetch a single call group by ID (use when editing to get full, fresh data).
 * API returns { success, message, data: { _id, groupName, outboundPhoneNumbers, users, ... } }
 */
export function useCallGroup(groupId, options = {}) {
    return useQuery({
        queryKey: ["callGroup", groupId],
        queryFn: async () => {
            const response = await apiClient.get(`/call-groups/${groupId}`);
            if (response?.data && typeof response.data === "object" && !Array.isArray(response.data) && "groupName" in response.data) {
                return response.data;
            }
            if (response?.data && typeof response.data === "object") {
                return response.data;
            }
            return response;
        },
        enabled: !!groupId && (options.enabled !== false),
        staleTime: 1000 * 60 * 2,
    });
}

export function useCreateCallGroup() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data) => {
            const response = await apiClient.post("/call-groups", data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["callGroups"] });
        },
    });
}

export function useUpdateCallGroup() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }) => {
            const response = await apiClient.put(`/call-groups/${id}`, data);
            return response.data;
        },
        onSuccess: (_result, variables) => {
            queryClient.invalidateQueries({ queryKey: ["callGroups"] });
            // Invalidate the single-group cache so Edit shows updated values without refresh
            if (variables?.id) {
                queryClient.invalidateQueries({ queryKey: ["callGroup", variables.id] });
            }
        },
    });
}

export function useDeleteCallGroup() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            const response = await apiClient.delete(`/call-groups/${id}`);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["callGroups"] });
        },
    });
}
