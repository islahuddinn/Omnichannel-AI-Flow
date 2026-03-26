"use client";

import React, { useMemo, use } from "react";
import CallRouteFlows from "@/components/panels/company-admin/call-center/routing/flow/CallRouteFlows";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCallRoute, useSaveCallRoute } from "@/hooks/useCallRoutes";

export default function EditRoutingPage({ params }) {
  // Unwrap params to get the ID (phoneNumber _id)
  const { id } = use(params);

  const router = useRouter();

  // Fetch API Data using the Phone Number ID
  const { data: routeData, isLoading, isError } = useCallRoute(id);
  const saveMutation = useSaveCallRoute();

  console.log("routeData", routeData);

  // Use useMemo to derived routingData to avoid render synchronization issues
  const routingData = useMemo(() => {
    if (!routeData) return null;

    const { phoneNumber, callRouting } = routeData;

    // Extract departmentIds from departments array and convert to strings
    const departmentIds = phoneNumber?.departments?.map(dept => {
      if (typeof dept === 'object') {
        return (dept._id || dept.id || dept).toString();
      }
      return dept.toString();
    }) || [];

    return {
      id: id,
      phoneNumber: phoneNumber?.phoneNumber || "",
      internalName: phoneNumber?.internalName || "",
      isLoop: callRouting?.isLoop || 0,
      flowData: callRouting?.flowData || null, // null signals creation of default 'Start Flow' node
      departmentIds: departmentIds,
    };
  }, [routeData, id]);

  const handleSave = async (flowData) => {
    // Construct payload with phoneNumberId (Mongo ID) and flow data
    const payload = {
      phoneNumberId: id,
      flowData: {
        nodes: flowData.nodes,
        edges: flowData.edges,
      },
      isLoop: flowData.isLoop,
    };

    try {
      await saveMutation.mutateAsync(payload);
      toast.success("Routing configuration has been successfully saved.");
    } catch (error) {
      console.error("Failed to save flow", error);
      toast.error("Failed to save routing configuration.");
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col p-4 gap-4">
      {/* Header Section - Always Visible */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Edit Call Flow</h1>
          {/* Fallback to checking routeData if routingData is null, or just static text */}
          <p className="text-sm text-muted-foreground">
            Routing for{" "}
            {routingData?.phoneNumber ||
              routeData?.data?.phoneNumber?.phoneNumber ||
              "..."}
          </p>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 border rounded-lg overflow-hidden bg-card shadow relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
            <Loader2 className="animate-spin mr-2 h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-destructive">
            Failed to load call routing data.
          </div>
        )}

        {!isLoading && !isError && !routingData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-muted-foreground">
            No routing data found for this number.
          </div>
        )}

        {/* Only render CallRouteFlows if we have data to avoid crashes, 
             but we keep it in DOM if possible or just conditional render. 
             If routingData is null, we can't render it effectively unless we pass a skeleton.
             Since CallRouteFlows relies on initialRoutingData to build nodes, we must wait. 
         */}
        {routingData && (
          <CallRouteFlows
            initialRoutingData={routingData}
            onSave={handleSave}
            isSaving={saveMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}
