// 'use client';

// import { useEffect } from "react";
// import {
//     Select,
//     SelectContent,
//     SelectItem,
//     SelectTrigger,
//     SelectValue,
// } from "@/components/ui/select";
// import { Phone, MessageSquare } from "lucide-react";
// import { cn } from "@/lib/utils";
// import { useEmployeeStatusStore } from '@/store/useEmployeeStatusStore';
// import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// import { useAuth } from '@/hooks/useAuth';
// import apiClient from '@/lib/api/client';

// const callStatuses = [
//     {
//         value: "available",
//         label: "Available",
//         color: "bg-emerald-500",
//     },
//     {
//         value: "outbound",
//         label: "Outbound",
//         color: "bg-blue-500",
//     },
//     {
//         value: "occupied",
//         label: "Occupied",
//         color: "bg-orange-500",
//     },
//     {
//         value: "notavailable",
//         label: "Not Available",
//         color: "bg-red-500",
//     },
//     {
//         value: "offline",
//         label: "Offline",
//         color: "bg-gray-500",
//     },
// ];

// const messageStatuses = [
//     {
//         value: "available",
//         label: "Available",
//         color: "bg-emerald-500",
//     },
//     {
//         value: "occupied",
//         label: "Occupied",
//         color: "bg-orange-500",
//     },
//     {
//         value: "notavailable",
//         label: "Not Available",
//         color: "bg-red-500",
//     },
//     {
//         value: "viewonly",
//         label: "View Only",
//         color: "bg-blue-500",
//     },
//     {
//         value: "offline",
//         label: "Offline",
//         color: "bg-gray-500",
//     },
// ];

// const EmployeeAvailability = () => {
//     const { user: authUser } = useAuth();
//     const queryClient = useQueryClient();
    
//     // Zustand store
//     const {
//         callStatus,
//         messageStatus,
//         statusLoading,
//         setCallStatus,
//         setMessageStatus,
//         setStatusLoading,
//         formatStatus,
//     } = useEmployeeStatusStore();

//     // Fetch user profile
//     const { data: userProfile } = useQuery({
//         queryKey: ['user-profile', authUser?.id],
//         queryFn: async () => {
//             const response = await apiClient.get('/users/profile');
//             return response.data;
//         },
//         enabled: !!authUser?.id,
//         staleTime: 1000 * 60 * 5, // 5 minutes
//     });


//     // Mutation for updating call status
//     const updateCallStatusMutation = useMutation({
//         mutationFn: async (newStatus) => {
//             setStatusLoading(true);
//             const currentCallStatus = localStorage.getItem("callStatus");
//             localStorage.setItem("previousCallStatus", currentCallStatus);
            
//             const response = await apiClient.put(`/users/${authUser?.id || authUser?.userId}/status`, {
//                 status: newStatus,
//                 type: 'call'
//             });
//             return response;
//         },
//         onSuccess: (data, newStatus) => {
//             setCallStatus(newStatus);
//             setStatusLoading(false);
//             // Invalidate user profile to refetch
//             queryClient.invalidateQueries({ queryKey: ['user-profile', authUser?.id] });
//         },
//         onError: (error) => {
//             console.error('Error updating call status:', error);
//             setStatusLoading(false);
//         },
//     });

//     // Mutation for updating message status
//     const updateMessageStatusMutation = useMutation({
//         mutationFn: async (newStatus) => {
//             setStatusLoading(true);
//             const response = await apiClient.put(`/users/${authUser?.id || authUser?.userId}/status`, {
//                 status: newStatus,
//                 type: 'chat'
//             });
//             return response;
//         },
//         onSuccess: (data, newStatus) => {
//             setMessageStatus(newStatus);
//             setStatusLoading(false);
//             // Invalidate user profile to refetch
//             queryClient.invalidateQueries({ queryKey: ['user-profile', authUser?.id] });
//         },
//         onError: (error) => {
//             console.error('Error updating message status:', error);
//             setStatusLoading(false);
//         },
//     });

//     // Sync status from backend/localStorage on mount
//     useEffect(() => {
//         if (typeof window !== "undefined" && userProfile) {
//             // Sync call status
//             const backendCallStatus = formatStatus(userProfile?.call_status || authUser?.callStatus);
//             const savedCallStatus = localStorage.getItem("callStatus");

//             if (savedCallStatus) {
//                 setCallStatus(savedCallStatus);
//             } else if (backendCallStatus && backendCallStatus !== savedCallStatus) {
//                 localStorage.setItem("callStatus", backendCallStatus);
//                 setCallStatus(backendCallStatus);
//             }

//             // Sync message status
//             let backendMsgStatus = userProfile?.chat_status || authUser?.messageStatus || "available";
//             backendMsgStatus = formatStatus(backendMsgStatus);
//             const savedMsgStatus = localStorage.getItem("messageStatus");

//             if (savedMsgStatus) {
//                 setMessageStatus(savedMsgStatus);
//             } else if (backendMsgStatus && backendMsgStatus !== savedMsgStatus) {
//                 localStorage.setItem("messageStatus", backendMsgStatus);
//                 setMessageStatus(backendMsgStatus);
//             }
//         }
//     }, [authUser?.callStatus, authUser?.messageStatus, userProfile?.call_status, userProfile?.chat_status, setCallStatus, setMessageStatus, formatStatus]);

//     const handleCallStatusChange = async (newStatus) => {
//         updateCallStatusMutation.mutate(newStatus);
//     };

//     const handleMessageStatusChange = async (newStatus) => {
//         updateMessageStatusMutation.mutate(newStatus);
//     };
    
//     return (
//         <div className="flex items-center gap-2">
//             {/* Message Status */}
//             {/* {(userProfile?.chat_feature === "on" || userProfile?.chat_feature === "view-only") && (
//                 <>
//                     <Select
//                         value={messageStatus}
//                         onValueChange={handleMessageStatusChange}
//                         disabled={statusLoading || userProfile?.chat_feature === "view-only"}
//                     >
//                         <SelectTrigger className="w-[160px] border-none shadow-none outline-none focus:outline-none focus:ring-0 bg-transparent">
//                             <div className="flex items-center gap-2">
//                                 <SelectValue placeholder="Select status" />
//                             </div>
//                         </SelectTrigger>

//                         <SelectContent>
//                             {messageStatuses.map((status) => (
//                                 <SelectItem
//                                     key={status.value}
//                                     value={status.value}
//                                     className={cn(
//                                         "flex items-center gap-2 cursor-pointer",
//                                         ["viewonly", "occupied"].includes(status.value) && "opacity-50"
//                                     )}
//                                     disabled={
//                                         ["viewonly", "occupied"].includes(status.value) ||
//                                         userProfile?.chat_feature === "view-only"
//                                     }
//                                 >
//                                     <div className="flex items-center gap-2">
//                                         <div className={cn("p-1 rounded-full", status.color)}>
//                                             <MessageSquare className="h-3 w-3 text-white" />
//                                         </div>
//                                         {status.label}
//                                     </div>
//                                 </SelectItem>
//                             ))}
//                         </SelectContent>
//                     </Select>

//                     <span className="text-gray-300 dark:text-gray-700">|</span>
//                 </>
//             )} */}

//             {/* Call Center Status */}
//             {userProfile?.call_center === "on" && (
//                 <Select
//                     value={callStatus}
//                     onValueChange={handleCallStatusChange}
//                     disabled={statusLoading}
//                 >
//                     <SelectTrigger className="w-[160px] border-none shadow-none outline-none focus:outline-none focus:ring-0 bg-transparent">
//                         <div className="flex items-center gap-2">
//                             <SelectValue placeholder="Select status" />
//                         </div>
//                     </SelectTrigger>
//                     <SelectContent>
//                         {callStatuses.map((status) => {
//                             const isInboundNoOutboundYes =
//                                 userProfile.inbound_calls === "no" && userProfile.outbound_calls === "yes";

//                             const isInboundYesOutboundNo =
//                                 userProfile.inbound_calls === "yes" && userProfile.outbound_calls === "no";

//                             const isDisabled =
//                                 (isInboundNoOutboundYes && status.value === "available") || // forbid "Available"
//                                 (isInboundYesOutboundNo && status.value === "outbound") || // forbid "Outbound"
//                                 status.value === "occupied" ||
//                                 status.value === "offline";

//                             return (
//                                 <SelectItem
//                                     key={status.value}
//                                     value={status.value}
//                                     disabled={isDisabled}
//                                     className={cn("flex items-center gap-2 cursor-pointer", isDisabled && "opacity-50")}
//                                 >
//                                     <div className="flex items-center gap-2">
//                                         <div className={cn("p-1 rounded-full", status.color)}>
//                                             <Phone className="h-3 w-3 text-white" />
//                                         </div>
//                                         {status.label}
//                                     </div>
//                                 </SelectItem>
//                             );
//                         })}
//                     </SelectContent>
//                 </Select>
//             )}
//         </div>
//     );
// };

// export default EmployeeAvailability;


'use client';

import { useEffect } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Phone, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEmployeeStatusStore } from '@/store/useEmployeeStatusStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/lib/api/client';

const callStatuses = [
    {
        value: "available",
        label: "Available",
        color: "bg-emerald-500",
    },
    {
        value: "outbound",
        label: "Outbound",
        color: "bg-blue-500",
    },
    {
        value: "occupied",
        label: "Occupied",
        color: "bg-orange-500",
    },
    {
        value: "notavailable",
        label: "Not Available",
        color: "bg-red-500",
    },
    {
        value: "offline",
        label: "Offline",
        color: "bg-gray-500",
    },
];

const messageStatuses = [
    {
        value: "available",
        label: "Available",
        color: "bg-emerald-500",
    },
    {
        value: "occupied",
        label: "Occupied",
        color: "bg-orange-500",
    },
    {
        value: "notavailable",
        label: "Not Available",
        color: "bg-red-500",
    },
    {
        value: "viewonly",
        label: "View Only",
        color: "bg-blue-500",
    },
    {
        value: "offline",
        label: "Offline",
        color: "bg-gray-500",
    },
];

const EmployeeAvailability = () => {
    const { user: authUser } = useAuth();
    const queryClient = useQueryClient();
    
    // Zustand store
    const {
        callStatus,
        messageStatus,
        statusLoading,
        setCallStatus,
        setMessageStatus,
        setStatusLoading,
        formatStatus,
    } = useEmployeeStatusStore();

    // Fetch user profile - Keep previous data during refetch
    const { data: userProfile } = useQuery({
        queryKey: ['user-profile', authUser?.id],
        queryFn: async () => {
            const response = await apiClient.get('/users/profile');
            return response.data;
        },
        enabled: !!authUser?.id,
        staleTime: 1000 * 60 * 5, // 5 minutes
        placeholderData: (previousData) => previousData, // THIS IS THE KEY FIX - keeps old data during refetch
    });

    // Mutation for updating call status
    const updateCallStatusMutation = useMutation({
        mutationFn: async (newStatus) => {
            setStatusLoading(true);
            const currentCallStatus = localStorage.getItem("callStatus");
            localStorage.setItem("previousCallStatus", currentCallStatus);
            
            const response = await apiClient.put(`/users/${authUser?.id || authUser?.userId}/status`, {
                status: newStatus,
                type: 'call'
            });
            return response;
        },
        onSuccess: (data, newStatus) => {
            localStorage.setItem("callStatus", newStatus);
            setCallStatus(newStatus);
            setStatusLoading(false);
            // No need to refetch - we already have the updated status!
        },
        onError: (error) => {
            console.error('Error updating call status:', error);
            setStatusLoading(false);
        },
    });

    // Mutation for updating message status
    const updateMessageStatusMutation = useMutation({
        mutationFn: async (newStatus) => {
            setStatusLoading(true);
            const response = await apiClient.put(`/users/${authUser?.id || authUser?.userId}/status`, {
                status: newStatus,
                type: 'chat'
            });
            return response;
        },
        onSuccess: (data, newStatus) => {
            localStorage.setItem("messageStatus", newStatus);
            setMessageStatus(newStatus);
            setStatusLoading(false);
            // No need to refetch - we already have the updated status!
        },
        onError: (error) => {
            console.error('Error updating message status:', error);
            setStatusLoading(false);
        },
    });

    // Sync status from backend/localStorage on mount
    // useEffect(() => {
    //     if (typeof window !== "undefined" && userProfile) {
    //         // Sync call status
    //         const backendCallStatus = formatStatus(userProfile?.call_status || authUser?.callStatus);
    //         const savedCallStatus = localStorage.getItem("callStatus");

    //         if (savedCallStatus) {
    //             setCallStatus(savedCallStatus);
    //         } else if (backendCallStatus && backendCallStatus !== savedCallStatus) {
    //             localStorage.setItem("callStatus", backendCallStatus);
    //             setCallStatus(backendCallStatus);
    //         }

    //         // Sync message status
    //         let backendMsgStatus = userProfile?.chat_status || authUser?.messageStatus || "available";
    //         backendMsgStatus = formatStatus(backendMsgStatus);
    //         const savedMsgStatus = localStorage.getItem("messageStatus");

    //         if (savedMsgStatus) {
    //             setMessageStatus(savedMsgStatus);
    //         } else if (backendMsgStatus && backendMsgStatus !== savedMsgStatus) {
    //             localStorage.setItem("messageStatus", backendMsgStatus);
    //             setMessageStatus(backendMsgStatus);
    //         }
    //     }
    // }, [authUser?.callStatus, authUser?.messageStatus, userProfile?.call_status, userProfile?.chat_status, setCallStatus, setMessageStatus, formatStatus]);





    // Sync status from backend → Zustand → localStorage
useEffect(() => {
    if (typeof window === "undefined" || !userProfile) return;

    /* =========================
       CALL STATUS SYNC
    ========================= */

    const backendCallStatusRaw =
        userProfile?.call_status || authUser?.callStatus;

    const backendCallStatus = formatStatus(backendCallStatusRaw);
    const savedCallStatus = localStorage.getItem("callStatus");

    let finalCallStatus = backendCallStatus;

    // 🔒 Enforce call permissions
    const inboundNoOutboundYes =
        userProfile.inbound_calls === "no" &&
        userProfile.outbound_calls === "yes";

    const inboundYesOutboundNo =
        userProfile.inbound_calls === "yes" &&
        userProfile.outbound_calls === "no";

    if (inboundNoOutboundYes && finalCallStatus === "available") {
        finalCallStatus = "outbound";
    }

    if (inboundYesOutboundNo && finalCallStatus === "outbound") {
        finalCallStatus = "available";
    }

    // 🔥 Backend ALWAYS wins over localStorage
    if (!savedCallStatus || savedCallStatus !== finalCallStatus) {
        localStorage.setItem("callStatus", finalCallStatus);
        setCallStatus(finalCallStatus);
    } else {
        setCallStatus(savedCallStatus);
    }

    /* =========================
       MESSAGE STATUS SYNC
    ========================= */

    const backendMsgStatusRaw =
        userProfile?.chat_status || authUser?.messageStatus || "available";

    const backendMsgStatus = formatStatus(backendMsgStatusRaw);
    const savedMsgStatus = localStorage.getItem("messageStatus");

    // 🔒 Enforce chat feature rules
    let finalMsgStatus = backendMsgStatus;

    if (userProfile.chat_feature === "view-only") {
        finalMsgStatus = "viewonly";
    }

    // 🔥 Backend ALWAYS wins
    if (!savedMsgStatus || savedMsgStatus !== finalMsgStatus) {
        localStorage.setItem("messageStatus", finalMsgStatus);
        setMessageStatus(finalMsgStatus);
    } else {
        setMessageStatus(savedMsgStatus);
    }

}, [
    userProfile?.call_status,
    userProfile?.chat_status,
    userProfile?.inbound_calls,
    userProfile?.outbound_calls,
    userProfile?.chat_feature,
    authUser?.callStatus,
    authUser?.messageStatus,
    setCallStatus,
    setMessageStatus,
    formatStatus,
]);



    const handleCallStatusChange = async (newStatus) => {
        updateCallStatusMutation.mutate(newStatus);
    };

    const handleMessageStatusChange = async (newStatus) => {
        updateMessageStatusMutation.mutate(newStatus);
    };
    
    return (
        <div className="flex items-center gap-2">
            {/* Message Status */}
            {/* {(userProfile?.chat_feature === "on" || userProfile?.chat_feature === "view-only") && (
                <>
                    <Select
                        value={messageStatus}
                        onValueChange={handleMessageStatusChange}
                        disabled={statusLoading || userProfile?.chat_feature === "view-only"}
                    >
                        <SelectTrigger className="w-[160px] border-none shadow-none outline-none focus:outline-none focus:ring-0 bg-transparent">
                            <div className="flex items-center gap-2">
                                <SelectValue placeholder="Select status" />
                            </div>
                        </SelectTrigger>

                        <SelectContent>
                            {messageStatuses.map((status) => (
                                <SelectItem
                                    key={status.value}
                                    value={status.value}
                                    className={cn(
                                        "flex items-center gap-2 cursor-pointer",
                                        ["viewonly", "occupied"].includes(status.value) && "opacity-50"
                                    )}
                                    disabled={
                                        ["viewonly", "occupied"].includes(status.value) ||
                                        userProfile?.chat_feature === "view-only"
                                    }
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={cn("p-1 rounded-full", status.color)}>
                                            <MessageSquare className="h-3 w-3 text-white" />
                                        </div>
                                        {status.label}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <span className="text-gray-300 dark:text-gray-700">|</span>
                </>
            )} */}
 
            {/* Call Center Status */}
            {userProfile?.call_center === "on" && (
                <Select
                    value={callStatus}
                    onValueChange={handleCallStatusChange}
                    disabled={statusLoading}
                >
                    <SelectTrigger className="w-[160px] border-none shadow-none outline-none focus:outline-none focus:ring-0 bg-transparent">
                        <div className="flex items-center gap-2">
                            <SelectValue placeholder="Select status" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        {callStatuses.map((status) => {
                            const isInboundNoOutboundYes =
                                userProfile.inbound_calls === "no" && userProfile.outbound_calls === "yes";

                            const isInboundYesOutboundNo =
                                userProfile.inbound_calls === "yes" && userProfile.outbound_calls === "no";

                            const isDisabled =
                                (isInboundNoOutboundYes && status.value === "available") ||
                                (isInboundYesOutboundNo && status.value === "outbound") ||
                                status.value === "occupied" ||
                                status.value === "offline";

                            return (
                                <SelectItem
                                    key={status.value}
                                    value={status.value}
                                    disabled={isDisabled}
                                    className={cn("flex items-center gap-2 cursor-pointer", isDisabled && "opacity-50")}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={cn("p-1 rounded-full", status.color)}>
                                            <Phone className="h-3 w-3 text-white" />
                                        </div>
                                        {status.label}
                                    </div>
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
            )}
        </div>
    );
};

export default EmployeeAvailability;