// src/components/shared/StatusBadge.jsx
'use client';

import { Badge } from '@/components/ui/badge';
import { STATUS_BADGE_CLASSES } from '@/constants/ui';

/**
 * StatusBadge component for displaying active/inactive status
 * @param {boolean} isActive - Whether the status is active
 * @param {string} activeLabel - Label for active state (default: "Active")
 * @param {string} inactiveLabel - Label for inactive state (default: "Inactive")
 * @param {string} status - Legacy prop for backward compatibility (deprecated, use isActive instead)
 */
export default function StatusBadge({ 
  isActive, 
  activeLabel = "Active", 
  inactiveLabel = "Inactive",
  status // Legacy prop for backward compatibility
}) {
  // Handle legacy status prop for backward compatibility
  const isActiveStatus = isActive !== undefined 
    ? isActive 
    : status === "active" || status === "Active";

  const variant = isActiveStatus ? "default" : "secondary";
  const label = isActiveStatus ? activeLabel : inactiveLabel;

  return (
    <Badge
      variant={variant}
      className={STATUS_BADGE_CLASSES.getActiveInactive(isActiveStatus)}
    >
      {label}
    </Badge>
  );
}