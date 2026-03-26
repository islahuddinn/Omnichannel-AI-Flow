// // src/components/layouts/AgentLayout.jsx
// 'use client';

// import Sidebar from './Sidebar';
// import Header from './Header';

// export default function AgentLayout({ children }) {
//   const menuItems = [
//     { label: 'Dashboard', href: '/agent/agent/dashboard', icon: 'LayoutDashboard' },
//     { label: 'Conversations', href: '/agent/agent/conversations', icon: 'MessageSquare' },
//     { label: 'Profile', href: '/agent/agent/profile', icon: 'User' }
//   ];

//   return (
//     <div className="flex h-screen">
//       <Sidebar menuItems={menuItems} />
//       <div className="flex-1 flex flex-col overflow-hidden">
//         <Header />
//         <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
//           {children}
//         </main>
//       </div>
//     </div>
//   );
// }




// src/components/layouts/AgentLayout.jsx
'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import MobileSidebar from './MobileSidebar';
import Header from './Header';

export default function AgentLayout({ children }) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState !== null) {
      setIsSidebarCollapsed(JSON.parse(savedState));
    }
  }, []);

  const handleToggleCollapse = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newState));
  };

  // ✅ Handler to open mobile sidebar
  const handleOpenMobileSidebar = () => {
    console.log('Opening mobile sidebar'); // Debug log
    setIsMobileSidebarOpen(true);
  };

  // ✅ Handler to close mobile sidebar
  const handleCloseMobileSidebar = () => {
    console.log('Closing mobile sidebar'); // Debug log
    setIsMobileSidebarOpen(false);
  };

  const menuItems = [
    { label: 'Dashboard', href: '/agent/agent/dashboard', icon: 'LayoutDashboard' },
    { label: 'Conversations', href: '/agent/agent/conversations', icon: 'MessageSquare' },
    { label: 'Contacts', href: '/agent/agent/contacts', icon: 'Contact' }
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
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

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header 
          onMenuClick={handleOpenMobileSidebar}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
        
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}