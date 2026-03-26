// src/components/shared/EmptyState.jsx
'use client';

import { Button } from '@/components/ui/button';

export default function EmptyState({ icon: Icon, title, description, action, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && <Icon className="h-16 w-16 text-muted-foreground mb-4" />}
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {description && <p className="text-muted-foreground mb-4">{description}</p>}
      {action && onAction && (
        <Button onClick={onAction}>{action}</Button>
      )}
    </div>
  );
}