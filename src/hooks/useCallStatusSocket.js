// src/hooks/useCallStatusSocket.js
// Call center: keeps transfer-target list in sync with agent availability via socket and users-with-call API.

'use client';

import { useEffect, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useUsersWithCallFeature } from "@/hooks/useUsersWithCallFeature";

export const useCallStatusSocket = () => {
  const { socket } = useSocket();
  const { data: employeesData, refetch: refreshEmployees } = useUsersWithCallFeature();

  const [localTransferTargets, setLocalTransferTargets] = useState([]);
  const allowedStatuses = ["available"];


  // Initialize localTransferTargets from employeesData
  useEffect(() => {
    if (employeesData) {
      // Extract array from response object - handle both { data: [...] } and direct array
      const employeesArray = Array.isArray(employeesData) 
        ? employeesData 
        : (Array.isArray(employeesData?.data) ? employeesData.data : []);
      
      const targets = employeesArray
        .filter(
          (employee) =>
            employee?.pbxExtension?.internal_extension &&
            allowedStatuses.includes(employee?.callCenter?.call_status)
        )
        .map((employee) => ({
          userId: employee._id.toString(),
          name: (employee.firstName && employee.lastName)
            ? `${employee.firstName} ${employee.lastName}`
            : employee.user_name || `User ${employee._id.toString()}`,
          extension: String(employee?.pbxExtension?.internal_extension),
          status: employee?.callCenter?.call_status || "unknown",
          departments: employee.departments || []
        }));

      console.log(targets, "targetstargets");
      setLocalTransferTargets(targets);
    }
  }, [employeesData]);

  // Update localTransferTargets in real time from socket
  useEffect(() => {
    if (!socket) {
      console.log("No Socket");
      return;
    }

    const handleStatusChange = async (data) => {
      console.log("Status Change Received", data);

      setLocalTransferTargets((prev) => {
        // First, remove any user whose new status is not allowed
        let updated = prev.filter(
          (target) =>
            target.userId !== data.user_id || allowedStatuses.includes(data.call_status)
        );

        // If the new status is allowed, either update existing or add
        if (allowedStatuses.includes(data.call_status)) {
          const existingIndex = updated.findIndex(
            (target) => target.userId === data.user_id
          );

          if (existingIndex !== -1) {
            // Update existing user - preserve extension if socket data doesn't have it
            updated[existingIndex] = {
              ...updated[existingIndex],
              status: data.call_status,
              // Update name and departments if provided
              name: data.name || data.user_name || updated[existingIndex].name,
              departments: data.departments || updated[existingIndex].departments || [],
            };
            console.log(`✅ Updated user ${data.user_id} status to ${data.call_status}`);
          } else {
            // Add new user dynamically - check for extension in socket data first
            let extension = data.pbxExtension?.internal_extension
              ? String(data.pbxExtension.internal_extension)
              : null;

            // If extension is missing from socket data, try to find it in employeesData
            if (!extension || extension === "unknown" || extension === "null") {
              // Extract array from response object - handle both { data: [...] } and direct array
              const employeesArray = Array.isArray(employeesData) 
                ? employeesData 
                : (Array.isArray(employeesData?.data) ? employeesData.data : []);
              
              const employeeFromData = employeesArray.find(
                (emp) => String(emp._id || emp.user_id) === String(data.user_id)
              );
              if (employeeFromData?.pbxExtension?.internal_extension) {
                extension = String(employeeFromData.pbxExtension.internal_extension);
                console.log(`📞 Found extension ${extension} for user ${data.user_id} from employeesData`);
              }
            }

            // Only add if extension exists and is valid
            if (extension && extension !== "unknown" && extension !== "null") {
              updated.push({
                userId: data.user_id,
                name: data.name || data.user_name || `User ${data.user_id}`,
                extension: extension,
                status: data.call_status,
                departments: data.departments || [],
              });

              console.log(`✅ Added user ${data.user_id} to transfer targets with extension ${extension}`);
            } else {
              // If extension is still missing, trigger a refetch to get latest data
              console.log(`⚠️ User ${data.user_id} became available but missing extension. Refetching employees data...`);

              // Use setTimeout to avoid state updates during render
              setTimeout(() => {
                refreshEmployees();
              }, 100);
            }
          }
        } else {
          // Status is not allowed (e.g., user became occupied/notavailable)
          console.log(`❌ User ${data.user_id} status changed to ${data.call_status} (not available for transfer)`);
        }

        return updated;
      });
    };

    socket.on("statusChange", handleStatusChange);

    return () => {
      socket.off("statusChange", handleStatusChange);
    };
  }, [socket, refreshEmployees, employeesData]);

  return { socket, localTransferTargets, refreshEmployees };
};

export default useCallStatusSocket;
