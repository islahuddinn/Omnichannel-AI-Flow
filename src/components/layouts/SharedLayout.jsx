// src/components/layouts/SharedLayout.jsx
"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth"; // Optional: For additional auth checks if needed
import Sidebar from "./Sidebar";
import MobileSidebar from "./MobileSidebar";
import Header from "./Header";
import { cn } from "@/lib/utils";
import CallStatusTabs from "@/components/call-center/CallStatusTabs";

const pageTransitionVariants = {
  initial: {
    opacity: 0,
    y: 6,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.15,
      ease: [0.55, 0, 1, 0.45],
    },
  },
};

export default function SharedLayout({ children, role = "agent" }) {
  const pathname = usePathname();
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

  // Unified menu items: Shared for both roles
  const sharedMenuItems = [
    { label: "Dashboard", href: "/c/dashboard", icon: "LayoutDashboard" },
    { label: "Conversations", href: "/c/conversations", icon: "MessageSquare" },
    { label: "Contacts", href: "/c/contacts", icon: "Contact" },
    { label: "Deals", href: "/c/deals", icon: "DollarSign" },
  ];

  // Agent-specific menu items (agents get Call History as standalone)
  const agentMenuItems = [
    { label: "Call History", href: "/c/call-center/history", icon: "History" },
  ];

  // Company admin menu items (they get Call History inside Call Center submenu)
  const adminMenuItems = [
    { label: "Users", href: "/c/users", icon: "UserCog" },
    { label: "Channels", href: "/c/channels", icon: "Radio" },
    { label: "Automation", href: "/c/automation", icon: "Workflow" },
    { label: "Message Logs", href: "/c/admin/message-logs", icon: "FileText" },
    { label: "Analytics", href: "/c/analytics", icon: "BarChart3" },
    { label: "Settings", href: "/c/settings", icon: "Settings" },
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
  ];

  const menuItems =
    role === "company_admin"
      ? [...sharedMenuItems, ...adminMenuItems]
      : [...sharedMenuItems, ...agentMenuItems];

  // Check if current route needs full-width (e.g., conversations detail/list)
  // Note: You'll need to import usePathname if not already in Header/Sidebar
  const isFullWidthRoute =
    children?.type?.name?.includes("Conversation") || false; // Adjust based on your page components

  return (
    <div className="flex h-screen overflow-hidden bg-background w-full">
      {/* Desktop Sidebar */}
      <Sidebar
        menuItems={menuItems}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      {/* Mobile Sidebar */}
      <MobileSidebar
        menuItems={menuItems}
        isOpen={isMobileSidebarOpen}
        onClose={handleCloseMobileSidebar}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header 
          onMenuClick={handleOpenMobileSidebar} 
          role={role}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />

        {role === "agent" && (
        <CallStatusTabs />
        )}
        <main className="flex-1 overflow-hidden bg-background min-h-0 w-full min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              variants={pageTransitionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={cn(
                "h-full w-full",
                isFullWidthRoute
                  ? "overflow-hidden min-w-0"
                  : "overflow-y-auto overflow-x-hidden"
              )}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
