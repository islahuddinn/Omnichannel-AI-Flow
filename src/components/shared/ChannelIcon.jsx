// // src/components/shared/ChannelIcon.jsx
// 'use client';

// import { MessageSquare, Mail, Phone, Facebook, Instagram, Monitor } from 'lucide-react';

// const iconMap = {
//   whatsapp: Phone,
//   facebook: Facebook,
//   instagram: Instagram,
//   sms: MessageSquare,
//   email: Mail,
//   webchat: Monitor
// };

// export default function ChannelIcon({ type, className = '' }) {
//   const Icon = iconMap[type] || MessageSquare;
//   return <Icon className={className} />;
// }




// // src/components/shared/ChannelIcon.jsx
// 'use client';

// import { MessageSquare, Mail, Phone, Facebook, Instagram, Monitor } from 'lucide-react';

// const iconMap = {
//   whatsapp: Phone,
//   facebook: Facebook,
//   instagram: Instagram,
//   sms: MessageSquare,
//   email: Mail,
//   webchat: Monitor
// };

// const iconColors = {
//   whatsapp: 'text-green-600',
//   facebook: 'text-blue-600',
//   instagram: 'text-pink-600',
//   sms: 'text-blue-500',
//   email: 'text-red-500',
//   webchat: 'text-purple-600'
// };

// const iconBgColors = {
//   whatsapp: 'bg-green-100',
//   facebook: 'bg-blue-100',
//   instagram: 'bg-pink-100',
//   sms: 'bg-blue-100',
//   email: 'bg-red-100',
//   webchat: 'bg-purple-100'
// };

// export default function ChannelIcon({ type, className = '', showBackground = false }) {
//   const Icon = iconMap[type] || MessageSquare;
//   const colorClass = iconColors[type] || 'text-gray-600';
//   const bgClass = showBackground ? `${iconBgColors[type] || 'bg-gray-100'} p-2 rounded-lg` : '';
  
//   return (
//     <div className={bgClass}>
//       <Icon className={`${colorClass} ${className}`} />
//     </div>
//   );
// }









// src/components/shared/ChannelIcon.jsx
'use client';

import { cn } from '@/lib/utils';

// Channel icon paths mapping
const CHANNEL_ICON_PATHS = {
  whatsapp: '/images/channels/whatsapp.svg',
  sms: '/images/channels/sms.svg',
  email: '/images/channels/email.svg',
  facebook: '/images/channels/facebook.svg',
  instagram: '/images/channels/instagram.svg',
  webchat: '/images/channels/webchat.svg',
  call: '/images/channels/call.svg'
};

// Channel color filters - CSS filters to colorize black SVGs
// Professional, distinct colors - each channel has a completely unique, eye-catching color
const CHANNEL_COLOR_FILTERS = {
  whatsapp: 'brightness(0) saturate(100%) invert(48%) sepia(79%) saturate(2476%) hue-rotate(86deg) brightness(118%) contrast(119%)', // WhatsApp Green (#25D366) - Vibrant green
  sms: 'brightness(0) saturate(100%) invert(58%) sepia(100%) saturate(2000%) hue-rotate(10deg) brightness(105%) contrast(105%)', // Bright Orange (#F97316) - Energetic, distinct
  email: 'brightness(0) saturate(100%) invert(52%) sepia(100%) saturate(2000%) hue-rotate(165deg) brightness(90%) contrast(105%)', // Professional Teal (#0D9488) - Distinct from all blues
  facebook: 'brightness(0) saturate(100%) invert(35%) sepia(99%) saturate(1352%) hue-rotate(201deg) brightness(97%) contrast(96%)', // Facebook Blue (#1877F2) - Classic blue
  instagram: 'brightness(0) saturate(100%) invert(27%) sepia(95%) saturate(2878%) hue-rotate(295deg) brightness(101%) contrast(101%)', // Instagram Pink (#E4405F) - Vibrant pink-red
  webchat: 'brightness(0) saturate(100%) invert(50%) sepia(100%) saturate(2000%) hue-rotate(270deg) brightness(100%) contrast(110%)', // Vibrant Purple (#A855F7) - Distinct violet
  call: 'brightness(0) saturate(100%) invert(46%) sepia(99%) saturate(1352%) hue-rotate(200deg) brightness(97%) contrast(96%)', // Call Blue (#3B82F6) - Professional blue
};

// Fallback filter for unknown channels (gray)
const DEFAULT_FILTER = 'brightness(0) saturate(100%) invert(50%)';

export default function ChannelIcon({ type, className = 'h-5 w-5' }) {
  const iconPath = CHANNEL_ICON_PATHS[type];
  const colorFilter = CHANNEL_COLOR_FILTERS[type] || DEFAULT_FILTER;
  
  if (!iconPath) {
    // Fallback: return a placeholder div if channel type is not recognized
    return (
      <div 
        className={cn(className, 'bg-gray-300 dark:bg-gray-600 rounded')}
        title={type?.toUpperCase() || 'Unknown'}
      />
    );
  }
  
  return (
    <img
      src={iconPath}
      alt={type || 'channel'}
      className={cn('object-contain flex-shrink-0', className)}
      style={{ filter: colorFilter }}
      title={type?.toUpperCase()}
    />
  );
}