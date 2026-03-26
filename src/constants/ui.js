/**
 * Centralized UI constants for consistent styling across the application
 */

// Active tab styling - uses CSS variable-based primary color for both themes
export const ACTIVE_TAB_CLASSES = {
  // For TabsTrigger - makes text and icons primary when active
  trigger: "data-[state=active]:text-primary [&[data-state=active]_svg]:text-primary dark:[&[data-state=active]_svg]:text-primary",

  // For icons inside TabsTrigger - alternative approach if needed
  icon: "group-data-[state=active]:text-primary dark:group-data-[state=active]:text-primary",
};

// Active tab color value - use CSS variable via hsl()
export const ACTIVE_TAB_COLOR = "hsl(var(--primary))";

// Active/Inactive Status Badge styling
export const STATUS_BADGE_CLASSES = {
  // Base classes for all status badges
  base: "min-w-[93px] h-[27px] px-3 py-1 text-sm font-semibold rounded-full leading-[19px] border-transparent",

  // Active state styling
  active: "bg-primary text-primary-foreground",

  // Inactive state styling
  inactive: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",

  // Get full className for active/inactive status
  getActiveInactive: (isActive) =>
    `${STATUS_BADGE_CLASSES.base} ${isActive ? STATUS_BADGE_CLASSES.active : STATUS_BADGE_CLASSES.inactive}`
};

