// // src/components/layouts/SuperAdminLayout.jsx
// 'use client';

// import { useRouter } from 'next/navigation';
// import { LogOut, User, Settings, Moon, Sun } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuLabel,
//   DropdownMenuSeparator,
//   DropdownMenuTrigger,
// } from '@/components/ui/dropdown-menu';
// import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
// import useUserStore from '@/store/useUserStore';
// import useUIStore from '@/store/useUIStore';
// import Sidebar from './Sidebar';

// export default function SuperAdminLayout({ children }) {
//   const router = useRouter();
//   const { user, logout } = useUserStore();
//   const { theme, setTheme } = useUIStore();

//   const handleLogout = async () => {
//     await logout();
//     router.push('/login');
//   };

//   const menuItems = [
//     { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
//     { label: 'Companies', href: '/companies', icon: 'Building2' },
//     { label: 'System', href: '/system', icon: 'Settings2' },
//     { label: 'Billing', href: '/billing', icon: 'CreditCard' },
//     { label: 'Settings', href: '/settings', icon: 'Settings' }
//   ];

//   return (
//     <div className="flex h-screen">
//       <Sidebar menuItems={menuItems} />

//       <div className="flex-1 flex flex-col overflow-hidden">
//         {/* Header */}
//         <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
//           <div className="flex items-center justify-between h-16 px-6">
//             <div className="flex items-center">
//               <h2 className="text-xl font-bold text-gray-900 dark:text-white">
//                 OmniConnect
//               </h2>
//             </div>

//             <div className="flex items-center gap-4">
//               {/* Theme Toggle */}
//               <Button
//                 variant="ghost"
//                 size="icon"
//                 onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
//               >
//                 {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
//               </Button>

//               {/* User Dropdown */}
//               <DropdownMenu>
//                 <DropdownMenuTrigger asChild>
//                   <Button variant="ghost" className="relative h-10 w-10 rounded-full">
//                     <Avatar className="h-10 w-10">
//                       <AvatarImage src={user?.avatar} alt={user?.firstName} />
//                       <AvatarFallback>
//                         {user?.firstName?.[0]}{user?.lastName?.[0]}
//                       </AvatarFallback>
//                     </Avatar>
//                   </Button>
//                 </DropdownMenuTrigger>
//                 <DropdownMenuContent className="w-56" align="end" forceMount>
//                   <DropdownMenuLabel className="font-normal">
//                     <div className="flex flex-col space-y-1">
//                       <p className="text-sm font-medium leading-none">
//                         {user?.firstName} {user?.lastName}
//                       </p>
//                       <p className="text-xs leading-none text-muted-foreground">
//                         {user?.email}
//                       </p>
//                     </div>
//                   </DropdownMenuLabel>
//                   <DropdownMenuSeparator />
//                   <DropdownMenuItem>
//                     <User className="mr-2 h-4 w-4" />
//                     <span>Profile</span>
//                   </DropdownMenuItem>
//                   <DropdownMenuItem>
//                     <Settings className="mr-2 h-4 w-4" />
//                     <span>Settings</span>
//                   </DropdownMenuItem>
//                   <DropdownMenuSeparator />
//                   <DropdownMenuItem onClick={handleLogout}>
//                     <LogOut className="mr-2 h-4 w-4" />
//                     <span>Log out</span>
//                   </DropdownMenuItem>
//                 </DropdownMenuContent>
//               </DropdownMenu>
//             </div>
//           </div>
//         </header>

//         {/* Main Content */}
//         <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
//           {children}
//         </main>
//       </div>
//     </div>
//   );
// }









// src/components/layouts/SuperAdminLayout.jsx
'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import MobileSidebar from './MobileSidebar';
import Header from './Header';

export default function SuperAdminLayout({ children }) {
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
    // Dispatch custom event for other components to listen to
    window.dispatchEvent(new CustomEvent('sidebarToggle', { detail: { collapsed: newState } }));
  };

  const handleOpenMobileSidebar = () => {
    console.log('Opening mobile sidebar');
    setIsMobileSidebarOpen(true);
  };

  const handleCloseMobileSidebar = () => {
    console.log('Closing mobile sidebar');
    setIsMobileSidebarOpen(false);
  };

  const menuItems = [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
    { label: 'Companies', href: '/companies', icon: 'Building2' },
    { label: 'Users', href: '/users', icon: 'Users' },
    { label: 'Settings', href: '/settings', icon: 'Settings' }
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
          <div className="container mx-auto p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}