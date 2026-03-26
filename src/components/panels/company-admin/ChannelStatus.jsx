

// src/components/panels/company-admin/ChannelStatus.jsx
'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle, Clock, Wifi, WifiOff } from 'lucide-react';

export default function ChannelStatus({ status }) {
  const statusConfig = {
    active: {
      icon: Wifi,
      label: 'Connected',
      variant: 'default',
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    inactive: {
      icon: WifiOff,
      label: 'Disconnected',
      variant: 'secondary',
      color: 'text-gray-600',
      bgColor: 'bg-gray-100'
    },
    error: {
      icon: AlertCircle,
      label: 'Error',
      variant: 'destructive',
      color: 'text-red-600',
      bgColor: 'bg-red-100'
    },
    pending: {
      icon: Clock,
      label: 'Pending',
      variant: 'outline',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100'
    },
    connecting: {
      icon: Clock,
      label: 'Connecting',
      variant: 'outline',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    }
  };

  const config = statusConfig[status] || statusConfig.inactive;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      <div className={`p-1 rounded-full ${config.bgColor}`}>
        <Icon className={`h-3 w-3 ${config.color}`} />
      </div>
      <Badge variant={config.variant} className="capitalize text-xs">
        {config.label}
      </Badge>
    </div>
  );
}