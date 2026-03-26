import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";

export function usePhoneNumbers(page = 1, limit = 10, search = "") {
  return useQuery({
    queryKey: ["phoneNumbers", page, limit, search],
    queryFn: async () => {
      const data = await apiClient.get(`/phone-numbers`, {
        params: { page, limit, search },
      });
      return data; // Expecting { data: [...numbers], meta: {...} } or similar
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useAddPhoneNumber() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      const response = await apiClient.post("/phone-numbers", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["phoneNumbers"] });
    },
  });
}

export function usePhoneNumbersWithDepartments(departmentIds) {
  return useQuery({
    queryKey: ["phoneNumbers", "by-departments", departmentIds],
    queryFn: async () => {
      const params = {};

      if (
        departmentIds &&
        Array.isArray(departmentIds) &&
        departmentIds.length > 0
      ) {
        params.departmentIds = departmentIds.join(",");
      } else if (departmentIds) {
        params.departmentIds = departmentIds;
      }

      const data = await apiClient.get(`/phone-numbers`, {
        params,
      });
      return data;
    },
    enabled: !!(departmentIds && (Array.isArray(departmentIds) ? departmentIds.length > 0 : true)),
  });
}

export function useUpdatePhoneNumber() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }) => {
      const response = await apiClient.put(`/phone-numbers/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["phoneNumbers"] });
    },
  });
}
