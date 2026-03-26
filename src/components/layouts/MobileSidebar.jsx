// src/components/layouts/MobileSidebar.jsx
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.25, ease: "easeIn" },
  },
};

const panelVariants = {
  hidden: { x: "-100%" },
  visible: {
    x: 0,
    transition: {
      type: "spring",
      damping: 30,
      stiffness: 300,
      mass: 0.8,
    },
  },
  exit: {
    x: "-100%",
    transition: {
      type: "spring",
      damping: 35,
      stiffness: 400,
      mass: 0.6,
    },
  },
};

export default function MobileSidebar({ menuItems = [], isOpen, onClose }) {
  const pathname = usePathname();
  const [openSubmenus, setOpenSubmenus] = useState({});

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const toggleSubmenu = (label) => {
    setOpenSubmenus(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop/Overlay */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm lg:hidden z-[60]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Sidebar Panel */}
          <motion.aside
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            className={cn(
              "fixed inset-y-0 left-0 lg:hidden",
              "w-full sm:w-80 max-w-full",
              "bg-card",
              "shadow-2xl",
              "flex flex-col",
              "z-[70]"
            )}
          >
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-5 border-b border-border/60 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
                  <Icons.Zap className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-primary">
                    Omni Ai Flow
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Communication Hub
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-9 w-9 rounded-lg flex-shrink-0"
                aria-label="Close menu"
                title="Close menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto overscroll-contain py-4 pb-6 px-3 scrollbar-thin" aria-label="Main navigation">
              <div className="space-y-1">
                {menuItems.map((item, itemIndex) => {
                  const Icon = Icons[item.icon] || Icons.Circle;
                  const hasSubItems = item.subItems && item.subItems.length > 0;
                  const isActive =
                    pathname === item.href ||
                    (!hasSubItems && pathname.startsWith(item.href + '/')) ||
                    (hasSubItems && item.subItems.some(sub => pathname.startsWith(sub.href)));

                  if (hasSubItems) {
                    const isSubmenuOpen = openSubmenus[item.label] || isActive;

                    return (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{
                          opacity: 1,
                          x: 0,
                          transition: {
                            duration: 0.25,
                            ease: "easeOut",
                            delay: itemIndex * 0.03,
                          },
                        }}
                      >
                        <Collapsible
                          open={isSubmenuOpen}
                          onOpenChange={() => toggleSubmenu(item.label)}
                        >
                          <CollapsibleTrigger asChild>
                            <button
                              className={cn(
                                'group flex items-center justify-between w-full gap-3 px-3 py-3 rounded-lg transition-all duration-200',
                                'relative overflow-hidden active:scale-[0.98]',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                                isActive && !isSubmenuOpen
                                  ? 'bg-primary text-primary-foreground shadow-sm'
                                  : isActive && isSubmenuOpen
                                    ? 'text-primary'
                                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "flex items-center justify-center h-9 w-9 rounded-lg transition-all duration-200 flex-shrink-0",
                                  isActive && !isSubmenuOpen
                                    ? "bg-primary-foreground/15"
                                    : "bg-muted/60"
                                )}>
                                  <Icon className="h-5 w-5" />
                                </div>
                                <span className="font-medium text-sm">{item.label}</span>
                              </div>
                              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isSubmenuOpen && "rotate-180")} />
                            </button>
                          </CollapsibleTrigger>

                          <CollapsibleContent className="space-y-0.5 mt-0.5 ml-4 border-l-2 border-border/50 pl-4">
                            {item.subItems.map((subItem) => {
                              const SubIcon = Icons[subItem.icon] || Icons.Circle;
                              const isSubActive = pathname === subItem.href;
                              return (
                                <Link
                                  key={subItem.href}
                                  href={subItem.href}
                                  aria-current={isSubActive ? "page" : undefined}
                                  onClick={() => {
                                    setTimeout(() => {
                                      onClose();
                                    }, 100);
                                  }}
                                  className={cn(
                                    'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                                    isSubActive
                                      ? 'text-primary bg-primary/10 font-medium'
                                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                  )}
                                >
                                  <SubIcon className="h-4 w-4" />
                                  <span>{subItem.label}</span>
                                </Link>
                              )
                            })}
                          </CollapsibleContent>
                        </Collapsible>
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div
                      key={item.href}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{
                        opacity: 1,
                        x: 0,
                        transition: {
                          duration: 0.25,
                          ease: "easeOut",
                          delay: itemIndex * 0.03,
                        },
                      }}
                    >
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => {
                          setTimeout(() => {
                            onClose();
                          }, 100);
                        }}
                        className={cn(
                          'group flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200',
                          'relative overflow-hidden active:scale-[0.98]',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                        )}
                      >
                        <div className={cn(
                          "flex items-center justify-center h-9 w-9 rounded-lg transition-all duration-200 flex-shrink-0",
                          isActive
                            ? "bg-primary-foreground/15"
                            : "bg-muted/60 group-hover:bg-muted"
                        )}>
                          <Icon
                            className={cn(
                              "h-5 w-5 transition-transform duration-200",
                              isActive ? "scale-110" : "group-hover:scale-105"
                            )}
                          />
                        </div>

                        <span className={cn(
                          "font-medium text-sm flex-1 truncate",
                          isActive && "font-semibold"
                        )}>
                          {item.label}
                        </span>

                        <ChevronRight
                          className={cn(
                            "h-4 w-4 transition-all duration-200 flex-shrink-0",
                            isActive ? "opacity-100" : "opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0"
                          )}
                        />
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </nav>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
