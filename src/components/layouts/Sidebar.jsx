// src/components/layouts/Sidebar.jsx
"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import * as Icons from "lucide-react";
import { ChevronDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const textFadeVariants = {
  hidden: { opacity: 0, width: 0 },
  visible: {
    opacity: 1,
    width: "auto",
    transition: { duration: 0.2, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    width: 0,
    transition: { duration: 0.15, ease: "easeIn" },
  },
};

export default function Sidebar({
  menuItems = [],
  isCollapsed,
  onToggleCollapse,
}) {
  const pathname = usePathname();
  const [openSubmenus, setOpenSubmenus] = useState({});

  const toggleSubmenu = (label) => {
    setOpenSubmenus((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  // Wrapper: show Tooltip in collapsed mode, plain div when expanded
  const ItemWrapper = ({ children, label }) => {
    if (!isCollapsed) return children;
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider>
      <motion.aside
        className={cn(
          "hidden lg:flex lg:flex-col",
          "bg-card border-r border-border/60",
          "flex-shrink-0"
        )}
        animate={{ width: isCollapsed ? 80 : 256 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Logo Section */}
        <div
          className={cn(
            "h-16 flex items-center border-b border-border/60 transition-all duration-300 ease-in-out",
            isCollapsed ? "justify-center px-2" : "justify-between px-6"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2 overflow-hidden",
              isCollapsed && "flex-col gap-0"
            )}
          >
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <Icons.Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <AnimatePresence>
              {!isCollapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <h1 className="text-xl font-bold text-primary whitespace-nowrap">
                    Omni Ai Flow
                  </h1>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 pb-6 overflow-y-auto scrollbar-thin" aria-label="Main navigation">
          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = Icons[item.icon] || Icons.Circle;
              const hasSubItems = item.subItems && item.subItems.length > 0;
              const isActive =
                pathname === item.href ||
                (!hasSubItems && pathname.startsWith(item.href + '/')) ||
                (hasSubItems &&
                  item.subItems.some((sub) => pathname.startsWith(sub.href)));

              if (hasSubItems) {
                const isOpen =
                  openSubmenus[item.label] || (isActive && !isCollapsed);

                return (
                  <Collapsible
                    key={item.label}
                    open={isOpen}
                    onOpenChange={() => toggleSubmenu(item.label)}
                  >
                    <ItemWrapper label={item.label}>
                      <CollapsibleTrigger asChild>
                        <button
                          className={cn(
                            "group flex items-center justify-between w-full gap-3 rounded-lg",
                            "relative overflow-hidden transition-all duration-200",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                            isCollapsed
                              ? "justify-center px-0 py-3"
                              : "px-3 py-2.5",
                            isActive && !isOpen
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : isActive && isOpen
                                ? "text-primary"
                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          )}
                          aria-label={isCollapsed ? item.label : undefined}
                        >
                          <div className="flex items-center gap-3 relative">
                            <div className="relative flex items-center justify-center">
                              <Icon
                                className={cn(
                                  "h-5 w-5 transition-all duration-200 flex-shrink-0",
                                  isActive && !isOpen
                                    ? "scale-110"
                                    : "group-hover:scale-105"
                                )}
                              />
                              {isCollapsed && (
                                <span
                                  className={cn(
                                    "absolute -bottom-0.5 -right-1 h-3.5 w-3.5 rounded-full",
                                    "bg-primary",
                                    "border border-card",
                                    "shadow-sm flex items-center justify-center",
                                    "transition-all duration-200",
                                    "opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100",
                                    isOpen && "opacity-100 scale-100",
                                    isActive && "opacity-100 scale-100"
                                  )}
                                  aria-hidden="true"
                                >
                                  <ChevronDown
                                    className={cn(
                                      "h-2 w-2 text-primary-foreground transition-transform duration-200",
                                      isOpen && "rotate-180"
                                    )}
                                  />
                                </span>
                              )}
                            </div>

                            <AnimatePresence>
                              {!isCollapsed && (
                                <motion.span
                                  variants={textFadeVariants}
                                  initial="hidden"
                                  animate="visible"
                                  exit="exit"
                                  className="font-medium text-sm whitespace-nowrap overflow-hidden"
                                >
                                  {item.label}
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>

                          <AnimatePresence>
                            {!isCollapsed && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{
                                  opacity: 1,
                                  scale: 1,
                                  transition: { duration: 0.15, delay: 0.1 },
                                }}
                                exit={{
                                  opacity: 0,
                                  scale: 0.8,
                                  transition: { duration: 0.1 },
                                }}
                              >
                                <ChevronDown
                                  className={cn(
                                    "h-4 w-4 transition-all duration-200 flex-shrink-0",
                                    isOpen && "transform rotate-180",
                                    isActive && !isOpen
                                      ? "text-primary-foreground"
                                      : "text-muted-foreground"
                                  )}
                                />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </button>
                      </CollapsibleTrigger>
                    </ItemWrapper>

                    <CollapsibleContent
                      className={cn(
                        "space-y-0.5 mt-0.5 overflow-hidden",
                        "transition-all duration-200",
                        isCollapsed
                          ? "flex flex-col items-center bg-muted/30 rounded-lg py-2 px-1 border border-border/40"
                          : "ml-4 border-l-2 border-border/50 pl-3"
                      )}
                    >
                      {item.subItems.map((subItem) => {
                        const SubIcon = Icons[subItem.icon] || Icons.Circle;
                        const isSubActive = pathname === subItem.href;
                        return (
                          <ItemWrapper key={subItem.href} label={subItem.label}>
                            <Link
                              href={subItem.href}
                              aria-current={isSubActive ? "page" : undefined}
                              aria-label={isCollapsed ? subItem.label : undefined}
                              className={cn(
                                "group/sub flex items-center gap-3 relative overflow-hidden w-full",
                                "transition-all duration-200",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                                isCollapsed
                                  ? "justify-center p-3 rounded-lg"
                                  : "px-3 py-2 rounded-lg text-sm",
                                isSubActive
                                  ? "text-primary bg-primary/10 font-medium"
                                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                              )}
                            >
                              <SubIcon
                                className={cn(
                                  "h-4 w-4 flex-shrink-0 transition-transform duration-200",
                                  isSubActive
                                    ? "scale-110"
                                    : "group-hover/sub:scale-105"
                                )}
                              />
                              <AnimatePresence>
                                {!isCollapsed && (
                                  <motion.span
                                    variants={textFadeVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    className="whitespace-nowrap overflow-hidden"
                                  >
                                    {subItem.label}
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </Link>
                          </ItemWrapper>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                );
              }

              // Standard Item
              return (
                <ItemWrapper key={item.href} label={item.label}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={isCollapsed ? item.label : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg transition-all duration-200",
                      "relative overflow-hidden",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                      isCollapsed ? "justify-center px-0 py-3" : "px-3 py-2.5",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5 transition-transform duration-200 flex-shrink-0",
                        isActive ? "scale-110" : "group-hover:scale-105"
                      )}
                    />

                    <AnimatePresence>
                      {!isCollapsed && (
                        <motion.span
                          variants={textFadeVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          className="font-medium text-sm whitespace-nowrap overflow-hidden"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Link>
                </ItemWrapper>
              );
            })}
          </div>
        </nav>
      </motion.aside>
    </TooltipProvider>
  );
}
