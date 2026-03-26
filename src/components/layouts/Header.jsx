
// src/components/layouts/Header.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User, Moon, Sun, Bell, Menu, Search, Building2, UserCircle, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import useUserStore from '@/store/useUserStore';
import useUIStore from '@/store/useUIStore';
import GlobalSearchModal from '@/components/modals/GlobalSearchModal';
import EmployeeAvailability from '@/components/shared/EmployeeAvailability';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';

export default function Header({ onMenuClick, isCollapsed, onToggleCollapse }) {
  const router = useRouter();
  const { user, logout } = useUserStore();
  const { theme, setTheme } = useUIStore();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Detect macOS for keyboard shortcut display
  const isMac = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  }, []);

  // Fetch user profile to get company details
  const { data: profileData } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const response = await apiClient.get('/users/profile');
      return response.data;
    },
    enabled: !!user && (user.role === 'company_admin' || user.role === 'agent'),
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  // Determine what name to display based on role
  const getDisplayName = () => {
    if (!user) return null;

    if (user.role === 'super_admin') {
      return {
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Super Admin',
        icon: Shield,
        type: 'Super Admin'
      };
    } else if (user.role === 'company_admin') {
      const companyName = profileData?.companyDetails?.name || 'Company';
      return {
        name: companyName,
        icon: Building2,
        type: 'Company'
      };
    } else if (user.role === 'agent' || user.role === 'employee') {
      const agentName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || (user.role === 'employee' ? 'Employee' : 'Agent');
      return {
        name: agentName,
        icon: UserCircle,
        type: user.role === 'employee' ? 'Employee' : 'Agent'
      };
    }

    return null;
  };

  const displayInfo = getDisplayName();

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  // Keyboard shortcut (Cmd+K / Ctrl+K) to open search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="h-16 bg-card/80 backdrop-blur-md border-b border-border/60 sticky top-0 z-40 flex-shrink-0">
      <div className="h-full flex items-center justify-between px-4 lg:px-6">
        {/* Left side */}
        <div className="flex items-center gap-2">
          {/* Desktop hamburger menu button */}
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="hidden lg:flex h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="lg:hidden h-9 w-9 rounded-lg"
            aria-label="Open menu"
            title="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Search bar - hidden on mobile */}
          <div className="hidden md:block">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="relative flex items-center gap-3 w-72 lg:w-80 pl-10 pr-4 py-2
                rounded-lg border border-border/60
                bg-muted/40 dark:bg-muted/30
                text-sm text-left text-muted-foreground
                hover:bg-muted/60 dark:hover:bg-muted/50
                hover:border-border
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <span>Search...</span>
              <kbd className="ml-auto hidden lg:inline-flex h-5 select-none items-center gap-1 rounded-md border border-border/60 bg-card px-1.5 font-mono text-xs font-medium text-muted-foreground">
                {isMac ? '⌘' : 'Ctrl+'}K
              </kbd>
            </button>
          </div>

          {/* Mobile search button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSearchOpen(true)}
            className="md:hidden h-9 w-9 rounded-lg"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Employee Availability Status */}
          {['agent', 'employee'].includes(user?.role) && <EmployeeAvailability />}

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-[18px] w-[18px]" />
            ) : (
              <Moon className="h-[18px] w-[18px]" />
            )}
          </Button>

          {/* Divider */}
          <div className="hidden md:block h-6 w-px bg-border/60 mx-1" />

          {/* User Dropdown with Name Display */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-auto px-2 py-1.5 rounded-lg hover:bg-muted/60 flex items-center gap-2.5 group"
                aria-label="User menu"
              >
                {/* Name Display - Desktop */}
                {displayInfo && (
                  <div className="hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-lg
                    bg-muted/50 dark:bg-muted/40
                    border border-border/40
                    group-hover:bg-muted/80 dark:group-hover:bg-muted/60
                    group-hover:border-border/60
                    transition-all duration-200"
                  >
                    <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 dark:bg-primary/15 flex-shrink-0">
                      <displayInfo.icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex flex-col">
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground leading-tight">
                        {displayInfo.type}
                      </p>
                      <p className="text-xs font-semibold text-foreground truncate max-w-[120px] xl:max-w-[160px] leading-tight" title={displayInfo.name}>
                        {displayInfo.name}
                      </p>
                    </div>
                  </div>
                )}

                {/* Avatar */}
                <Avatar className="h-8 w-8 ring-2 ring-border/50 flex-shrink-0">
                  <AvatarImage src={user?.avatar} alt={user?.firstName} />
                  <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none text-foreground">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                  {displayInfo && (
                    <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-border/60">
                      <displayInfo.icon className="h-3 w-3 text-primary" />
                      <p className="text-xs text-muted-foreground truncate">
                        {displayInfo.name}
                      </p>
                    </div>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                if (user?.role === 'super_admin') {
                  router.push('/profile');
                } else {
                  router.push('/c/profile');
                }
              }}>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Global Search Modal */}
      <GlobalSearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </header>
  );
}
