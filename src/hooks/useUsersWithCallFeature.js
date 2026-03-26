import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import apiClient from "@/lib/api/client";

export const useUsersWithCallFeature = (departmentIds, options = {}) => {
    const pathname = usePathname();
    const { enabled = true } = options;
    
    // ✅ Don't make API calls on public/auth pages
    const isPublicPage = pathname?.startsWith('/auth/') || 
                        pathname === '/auth/login' ||
                        pathname === '/auth/forgot-password' ||
                        pathname === '/auth/reset-password' ||
                        pathname === '/auth/verify-otp';
    
    return useQuery({
        queryKey: ["users", "with-call-feature", departmentIds],
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

            const response = await apiClient.get("/users/with-call-feature", {
                params,
            });
            // apiClient returns response.data, which is { success: true, data: [...] }
            return response?.data || response || [];
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
        enabled: enabled && !isPublicPage, // ✅ Disable on public pages (and when caller wants)
    });
};

