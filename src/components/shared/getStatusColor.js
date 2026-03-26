/**
 * Get status badge color classes for active/inactive status
 * Returns consistent styling across the application
 * @param {string} status - The status value ('active', 'inactive', etc.)
 * @returns {string} Tailwind CSS classes for the badge
 */
export function getStatusColor(status) {
  // Normalize status to lowercase for comparison
  const normalizedStatus = status?.toLowerCase();

  switch (normalizedStatus) {
    case "active":
      return "bg-primary text-primary-foreground";
    case "inactive":
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
    case "suspended":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default:
      // Return default styling for unknown statuses
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
  }
}
