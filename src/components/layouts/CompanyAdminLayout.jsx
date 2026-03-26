// src/components/layouts/CompanyAdminLayout.jsx
"use client";

import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import MobileSidebar from "./MobileSidebar";
import Header from "./Header";

export default function CompanyAdminLayout({ children }) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  useEffect(() => {
    const savedState = localStorage.getItem("sidebarCollapsed");
    if (savedState !== null) {
      setIsSidebarCollapsed(JSON.parse(savedState));
    }
  }, []);

  const handleToggleCollapse = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem("sidebarCollapsed", JSON.stringify(newState));
  };

  const handleOpenMobileSidebar = () => {
    console.log("Opening mobile sidebar");
    setIsMobileSidebarOpen(true);
  };

  const handleCloseMobileSidebar = () => {
    console.log("Closing mobile sidebar");
    setIsMobileSidebarOpen(false);
  };

  const menuItems = [
    { label: "Dashboard", href: "/c/dashboard", icon: "LayoutDashboard" },
    { label: "Conversations", href: "/c/conversations", icon: "MessageSquare" },
    { label: "Users", href: "/c/users", icon: "UserCog" },
    {
      label: "Call Center",
      href: "/c/call-center",
      icon: "PhoneCall",
      subItems: [
        {
          label: "Calls History",
          href: "/c/call-center/history",
          icon: "History",
        },
        {
          label: "Calls Routing",
          href: "/c/call-center/routing",
          icon: "Route",
        },
        { label: "Calls Groups", href: "/c/call-center/groups", icon: "Users" },
        { label: "Play Back", href: "/c/call-center/playback", icon: "Play" },
        {
          label: "Call Statistics",
          href: "/c/call-center/statistics",
          icon: "BarChart3",
        },
      ],
    },
    { label: "Channels", href: "/c/channels", icon: "Radio" },
    { label: "Message Logs", href: "/c/admin/message-logs", icon: "FileText" },
    { label: "Analytics", href: "/c/analytics", icon: "BarChart3" },
    { label: "Settings", href: "/c/settings", icon: "Settings" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        menuItems={menuItems}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      <MobileSidebar
        menuItems={menuItems}
        isOpen={isMobileSidebarOpen}
        onClose={handleCloseMobileSidebar}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header 
          onMenuClick={handleOpenMobileSidebar}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />

        <main className="flex-1 overflow-auto bg-background">
          <div className="container mx-auto p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
