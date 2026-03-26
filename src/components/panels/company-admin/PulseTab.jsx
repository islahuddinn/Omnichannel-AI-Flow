import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CheckIcon,
  PlusCircleIcon,
  SearchIcon,
  XCircleIcon,
} from "lucide-react";
import apiClient from "@/lib/api/client";

// Status colors matching the reference
const STATUS_COLORS = {
  available: "#4CAF50",
  occupied: "#FFC107",
  notavailable: "#F44336",
  outbound: "#2196F3",
  offline: "#9E9E9E",
  viewonly: "#9E9E9F",
  Available: "#4CAF50",
  Occupied: "#FFC107",
  NotAvailable: "#F44336",
  Outbound: "#2196F3",
  Offline: "#9E9E9E",
  ViewOnly: "#9E9E9F",
};

const normalizeStatusName = (status) => {
  if (!status) return "Available";

  const statusMap = {
    available: "Available",
    occupied: "Occupied",
    notavailable: "NotAvailable",
    outbound: "Outbound",
    offline: "Offline",
    viewonly: "ViewOnly",
  };

  return statusMap[status.toLowerCase()] || status;
};

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return "0s";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  let result = "";
  if (days > 0) result += `${days}d `;
  if (hours > 0 || days > 0) result += `${hours}h `;
  if (minutes > 0 || hours > 0 || days > 0) result += `${minutes}m `;
  result += `${secs}s`;

  return result.trim();
};

const formatDate = (date) => {
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const transformApiData = (apiData, selectedUsers) => {
  if (!apiData || !Array.isArray(apiData)) {
    return null;
  }

  const aggregatedStatusTotals = {};
  const userData = {};

  apiData.forEach((user) => {
    const userId = user.user_id;
    const statuses = user.statuses || {};

    userData[userId] = {
      statusTotals: { ...statuses },
    };

    Object.entries(statuses).forEach(([status, seconds]) => {
      if (!aggregatedStatusTotals[status]) {
        aggregatedStatusTotals[status] = 0;
      }
      aggregatedStatusTotals[status] += seconds;
    });
  });

  return {
    aggregated: {
      statusTotals: aggregatedStatusTotals,
    },
    users: userData,
  };
};

export default function PulseTab() {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [dateRange, setDateRange] = useState({
    from: new Date(),
    to: new Date(),
  });
  const [statusType, setStatusType] = useState("call");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fetch Employees
  const { data: employeesData } = useQuery({
    queryKey: ["employees-list"],
    queryFn: () => apiClient.get("/users/all"), // Adjust endpoint as needed
  });
  const employees = employeesData?.data || [];

  // Fetch Call Groups
  const { data: callGroupsData } = useQuery({
    queryKey: ["call-groups"],
    queryFn: () => apiClient.get("/call-groups"), // Adjust endpoint
  });
  const callGroups = callGroupsData?.data || [];

  // Fetch Pulse Data
  const { data: rawPulseData, isLoading: isLoadingStats } = useQuery({
    queryKey: [
      "pulse-data",
      selectedUsers.map((u) => u._id),
      dateRange,
      statusType,
      refreshTrigger,
    ],
    queryFn: async () => {
      if (selectedUsers.length === 0) return { data: [] };

      // Construct payload for actual API
      const payload = {
        userIds: selectedUsers.map((u) => u._id),
        startDate: dateRange.from,
        endDate: dateRange.to,
        type: statusType,
      };

      try {
        const res = await apiClient.post("/pulse/analytics", payload);
        return res.data;
      } catch (e) {
        console.warn("Pulse API error or not implemented, returning empty", e);
        return { data: [] };
      }
    },
    enabled: selectedUsers.length > 0,
  });

  const statsData = rawPulseData
    ? transformApiData(rawPulseData.data, selectedUsers)
    : null;

  // Handlers
  const handleSelectUser = (userId) => {
    const user = employees.find((emp) => emp._id === userId);
    if (user && !selectedUsers.some((u) => u._id === userId)) {
      setSelectedUsers([...selectedUsers, user]);
      setUserSearchQuery("");
      setCommandOpen(false);
    }
  };

  const handleRemoveUser = (userId) => {
    setSelectedUsers(selectedUsers.filter((user) => user._id !== userId));
  };

  const handleSelectGroup = (groupId) => {
    const group = callGroups.find((g) => g.group_id.toString() === groupId);
    setSelectedGroup(group);
    if (group && group.users) {
      // Map group users to employee objects if possible, or mocked
      // Assuming group.users contains IDs or full objects
      // For now, let's assume we can find them in employees list
      const groupUsers = employees.filter((e) => group.users.includes(e._id));
      setSelectedUsers(groupUsers);
    }
  };

  const refreshData = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const filteredEmployees = employees.filter(
    (emp) =>
      !selectedUsers.some((selected) => selected._id === emp._id) &&
      (emp.firstName?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        emp.lastName?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        emp.email?.toLowerCase().includes(userSearchQuery.toLowerCase()))
  );

  return (
    <div className="flex flex-col md:flex-row gap-4 h-full">
      {/* Filter Panel */}
      <div className="w-full md:w-1/3">
        <Card className="h-full">
          <CardHeader className="bg-slate-50 dark:bg-gray-800 rounded-t-lg border-b border-gray-200 dark:border-gray-700 -mt-6 mb-6 pt-6">
            <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
              Status Analytics
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              Monitor user activity and time spent in each status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {/* Status Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Status Type
              </label>
              <Select value={statusType} onValueChange={setStatusType}>
                <SelectTrigger className="w-full border-slate-300">
                  <SelectValue placeholder="Select status type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call Status</SelectItem>
                  <SelectItem value="chat">Chat Status</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Call Group */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Call Group
              </label>
              <Select onValueChange={handleSelectGroup}>
                <SelectTrigger className="w-full border-slate-300">
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  {callGroups.map((group) => (
                    <SelectItem
                      key={group.group_id}
                      value={group.group_id.toString()}
                    >
                      {group.group_name}
                    </SelectItem>
                  ))}
                  {callGroups.length === 0 && (
                    <SelectItem value="none" disabled>
                      No groups available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Users Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Users
              </label>
              <Popover open={commandOpen} onOpenChange={setCommandOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start border-slate-300 text-slate-600 font-normal"
                  >
                    <SearchIcon className="mr-2 h-4 w-4" />
                    <span>
                      {selectedUsers.length > 0
                        ? `${selectedUsers.length} user${
                            selectedUsers.length > 1 ? "s" : ""
                          } selected`
                        : "Search users..."}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-lg" align="start">
                  <Command shouldFilter={false} className="bg-white dark:bg-gray-800">
                    <div className="pb-2 pt-2 overflow-hidden [&_[data-slot=command-input-wrapper]]:gap-3 [&_[data-slot=command-input-wrapper]]:pb-3 [&_[data-slot=command-input-wrapper]]:mb-0 [&_[data-slot=command-input-wrapper]:focus-within]:border-b-blue-500 [&_[data-slot=command-input-wrapper]:focus-within]:border-b-2 [&_[data-slot=command-input-wrapper]:focus-within]:dark:border-b-blue-400">
                      <CommandInput
                        placeholder="Search by name or email..."
                        value={userSearchQuery}
                        onValueChange={setUserSearchQuery}
                        className="h-10 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 pl-2 focus:outline-none focus:rounded-md"
                      />
                    </div>
                    <CommandList className="max-h-[400px] bg-white dark:bg-gray-800">
                      <CommandEmpty className="text-gray-500 dark:text-gray-400 py-6">No users found</CommandEmpty>
                      <CommandGroup heading="Available Users" className="bg-white dark:bg-gray-800">
                        {filteredEmployees.map((employee) => (
                          <CommandItem
                            key={employee._id}
                            onSelect={() => handleSelectUser(employee._id)}
                            className="flex items-center cursor-pointer"
                          >
                            <PlusCircleIcon className="mr-2 h-4 w-4 text-emerald-500" />
                            <span>
                              {employee.firstName} {employee.lastName}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <div className="flex flex-wrap gap-2 mt-3">
                {selectedUsers.map((user) => (
                  <Badge
                    key={user._id}
                    variant="secondary"
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-100"
                  >
                    {user.firstName} {user.lastName}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 ml-1 text-slate-500 hover:text-slate-700 hover:bg-transparent"
                      onClick={() => handleRemoveUser(user._id)}
                    >
                      <XCircleIcon className="h-4 w-4" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Date Range
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500">Start Date</label>
                  <Input
                    type="date"
                    value={dateRange.from?.toISOString().split("T")[0]}
                    onChange={(e) =>
                      setDateRange({
                        ...dateRange,
                        from: new Date(e.target.value),
                      })
                    }
                    onClick={(e) => {
                      try {
                        e.target.showPicker();
                      } catch (err) {
                        console.log("showPicker not supported");
                      }
                    }}
                    className="border-slate-300 w-full"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">End Date</label>
                  <Input
                    type="date"
                    value={dateRange.to?.toISOString().split("T")[0]}
                    onChange={(e) =>
                      setDateRange({
                        ...dateRange,
                        to: new Date(e.target.value),
                      })
                    }
                    onClick={(e) => {
                      try {
                        e.target.showPicker();
                      } catch (err) {
                        console.log("showPicker not supported");
                      }
                    }}
                    className="border-slate-300 w-full"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-300 hover:bg-slate-100"
                  onClick={() =>
                    setDateRange({ from: new Date(), to: new Date() })
                  }
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-300 hover:bg-slate-100"
                  onClick={() => {
                    const today = new Date();
                    const yest = new Date(today);
                    yest.setDate(yest.getDate() - 1);
                    setDateRange({ from: yest, to: yest });
                  }}
                >
                  Yesterday
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-300 hover:bg-slate-100"
                  onClick={() => {
                    const today = new Date();
                    const weekAgo = new Date(today);
                    weekAgo.setDate(weekAgo.getDate() - 6);
                    setDateRange({ from: weekAgo, to: today });
                  }}
                >
                  Last 7 Days
                </Button>
              </div>
            </div>

            <Button
              className="w-full mt-4"
              disabled={selectedUsers.length === 0}
              onClick={refreshData}
            >
              Generate Report
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Stats Panel */}
      <div className="w-full md:w-2/3">
        {isLoadingStats ? (
          <Card className="w-full h-full flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
              <p className="text-slate-600">Analyzing status data...</p>
            </div>
          </Card>
        ) : statsData ? (
          <div className="space-y-4">
            {/* Totals Card */}
            <Card>
              <CardHeader className="bg-slate-50 dark:bg-gray-800 rounded-t-lg border-b border-gray-200 dark:border-gray-700 -mt-6 mb-6 pt-6">
                <CardTitle className="text-gray-900 dark:text-gray-100">
                  Status Time Summary
                </CardTitle>
                <CardDescription className="text-gray-600 dark:text-gray-400">
                  For the period {formatDate(dateRange.from)} to{" "}
                  {formatDate(dateRange.to)}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex flex-col gap-4">
                  {/* Status List */}
                  {Object.entries(statsData.aggregated.statusTotals).length >
                  0 ? (
                    Object.entries(statsData.aggregated.statusTotals).map(
                      ([status, seconds]) => {
                        const displayStatus = normalizeStatusName(status);
                        return (
                          <div
                            key={status}
                            className="flex justify-between items-center border-b pb-3"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-4 h-4 rounded-full"
                                style={{
                                  backgroundColor:
                                    STATUS_COLORS[displayStatus] || "#ccc",
                                }}
                              />
                              <span className="font-medium">
                                {displayStatus}
                              </span>
                            </div>
                            <span className="font-semibold text-lg">
                              {formatDuration(seconds)}
                            </span>
                          </div>
                        );
                      }
                    )
                  ) : (
                    <div className="text-center py-6 text-slate-500">
                      No status data found for the selected time period
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Individual User Breakdown */}
            {selectedUsers.length > 0 && (
              <Card>
                <CardHeader className="bg-slate-50 dark:bg-gray-800 rounded-t-lg border-b border-gray-200 dark:border-gray-700 -mt-6 mb-6 pt-6">
                  <CardTitle className="text-gray-900 dark:text-gray-100">
                    User Breakdown
                  </CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">
                    Individual status times for each user
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-6">
                    {Object.entries(statsData.users).map(
                      ([userId, userData]) => {
                        const user = selectedUsers.find(
                          (u) => u._id === userId
                        );
                        const statusCount = Object.keys(
                          userData.statusTotals
                        ).length;

                        return (
                          <div
                            key={userId}
                            className="border-b pb-4 last:border-b-0"
                          >
                            <h3 className="font-medium mb-3 text-lg">
                              {user?.firstName} {user?.lastName}
                            </h3>
                            {statusCount > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Object.entries(userData.statusTotals).map(
                                  ([status, seconds]) => {
                                    const displayStatus =
                                      normalizeStatusName(status);
                                    return (
                                      <div
                                        key={status}
                                        className="flex items-center gap-3 bg-slate-50 dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-700"
                                      >
                                        <div
                                          className="w-3 h-3 rounded-full"
                                          style={{
                                            backgroundColor:
                                              STATUS_COLORS[displayStatus] ||
                                              "#ccc",
                                          }}
                                        ></div>
                                        <div className="flex flex-col">
                                          <span className="text-sm text-slate-500 dark:text-gray-400">
                                            {displayStatus}
                                          </span>
                                          <span className="font-bold text-gray-900 dark:text-gray-100">
                                            {formatDuration(seconds)}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  }
                                )}
                              </div>
                            ) : (
                              <p className="text-slate-500 italic">
                                No activity recorded
                              </p>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="w-full h-full flex items-center justify-center py-16">
            <div className="text-center px-8">
              <h3 className="text-xl font-medium text-slate-700 mb-2">
                Status Analytics
              </h3>
              <p className="text-slate-500 mb-6">
                Select users and a date range to view detailed status analytics
              </p>
              <div className="flex justify-center">
                <Badge className="bg-blue-100 hover:bg-blue-300 cursor-pointer text-blue-800 px-3 py-1">
                  Select users to start
                </Badge>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
