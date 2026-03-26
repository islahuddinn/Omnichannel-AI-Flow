// src/components/chat/ContactMessageCard.jsx
'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Phone, Mail, MapPin, Building, Copy, User, MessageCircle, UserPlus, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import PhoneNumberDisplay from '@/components/shared/PhoneNumberDisplay';

export default function ContactMessageCard({ contactData, isOwn = false }) {
  const [showDetails, setShowDetails] = useState(false);

  if (!contactData) return null;

  // Handle WhatsApp contact data structure
  let normalizedContactData = contactData;
  if (contactData.name && typeof contactData.name === 'object') {
    normalizedContactData = {
      name: contactData.name.formatted_name ||
            `${contactData.name.first_name || ''} ${contactData.name.middle_name || ''} ${contactData.name.last_name || ''}`.trim() ||
            'Unknown Contact',
      firstName: contactData.name.first_name,
      middleName: contactData.name.middle_name,
      lastName: contactData.name.last_name,
      displayPhoneNumber: contactData.phones?.[0]?.phone || contactData.phones?.[0]?.wa_id,
      phoneNumber: contactData.phones?.[0]?.phone || contactData.phones?.[0]?.wa_id,
      phones: contactData.phones || [],
      emails: contactData.emails || [],
      addresses: contactData.addresses || [],
      urls: contactData.urls || [],
      org: contactData.org || null,
      birthday: contactData.birthday,
      vcard: contactData.vcard,
    };
  }

  const formatName = (name) => {
    if (!name || typeof name !== 'string') return 'Unknown';
    const nameParts = name.trim().split(/\s+/).filter(part => part.length > 0);
    if (nameParts.length === 0) return 'Unknown';
    return nameParts.join(' ');
  };

  const displayName = formatName(normalizedContactData.name);
  const phoneNumber = normalizedContactData.displayPhoneNumber || normalizedContactData.phoneNumber;

  const getInitials = (name) => {
    const nameParts = name.trim().split(/\s+/);
    if (nameParts.length === 1) return nameParts[0][0]?.toUpperCase() || '?';
    return (nameParts[0][0] + (nameParts[nameParts.length - 1][0] || '')).toUpperCase();
  };

  const copyToClipboard = (text, label) => {
    if (!navigator.clipboard) {
      toast.error('Clipboard not available');
      return;
    }
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <>
      {/* WhatsApp-style Contact Card */}
      <div className="w-[260px] rounded-lg overflow-hidden cursor-pointer" onClick={() => setShowDetails(true)}>
        {/* Contact Info Section */}
        <div className={cn(
          'px-3 py-2.5',
          isOwn
            ? 'bg-[#d9fdd3] dark:bg-[#005c4b]'
            : 'bg-white dark:bg-[#202c33]'
        )}>
          <div className="flex items-center gap-2.5">
            {/* Avatar - WhatsApp style gray silhouette */}
            <div className="h-10 w-10 rounded-full bg-[#dfe5e7] dark:bg-[#6b7b8d] flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] font-medium text-[#111b21] dark:text-[#e9edef] leading-tight truncate">
                {displayName}
              </div>
              {phoneNumber && (
                <div className="text-[12.5px] text-[#667781] dark:text-[#8696a0] leading-tight mt-0.5 truncate">
                  <PhoneNumberDisplay phone={phoneNumber} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className={cn(
          'h-px',
          isOwn
            ? 'bg-[#c5e8ba] dark:bg-[#004a3d]'
            : 'bg-[#e9edef] dark:bg-[#2a3942]'
        )} />

        {/* Action Button - "Message" like WhatsApp */}
        <div className={cn(
          'flex items-center justify-center gap-1.5 py-2 transition-colors',
          isOwn
            ? 'bg-[#d9fdd3] dark:bg-[#005c4b] hover:bg-[#cef5c6] dark:hover:bg-[#006d5b]'
            : 'bg-white dark:bg-[#202c33] hover:bg-[#f0f2f5] dark:hover:bg-[#2a3942]'
        )}>
          <MessageCircle className="h-3.5 w-3.5 text-[#00a884] dark:text-[#00a884]" />
          <span className="text-[12.5px] font-medium text-[#00a884] dark:text-[#00a884]">
            Message
          </span>
        </div>
      </div>

      {/* Contact Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto p-0">
          {/* Header with avatar */}
          <div className="bg-[#00a884] dark:bg-[#00a884] px-6 pt-8 pb-6 flex flex-col items-center text-center">
            <div className="h-20 w-20 rounded-full bg-white/20 flex items-center justify-center mb-3">
              <User className="h-10 w-10 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-white">{displayName}</h3>
            {phoneNumber && (
              <p className="text-sm text-white/80 mt-0.5">
                <PhoneNumberDisplay phone={phoneNumber} />
              </p>
            )}
          </div>

          <div className="p-4 space-y-2">
            {/* Phone */}
            {phoneNumber && (
              <button
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors text-left"
                onClick={() => copyToClipboard(phoneNumber, 'Phone')}
              >
                <div className="h-9 w-9 rounded-full bg-[#00a884]/10 flex items-center justify-center flex-shrink-0">
                  <Phone className="h-4 w-4 text-[#00a884]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium truncate">
                    <PhoneNumberDisplay phone={phoneNumber} />
                  </p>
                </div>
                <Copy className="h-3.5 w-3.5 text-muted-foreground/50" />
              </button>
            )}

            {/* Additional phones */}
            {normalizedContactData.phones && normalizedContactData.phones.length > 1 &&
              normalizedContactData.phones.slice(1).map((phone, idx) => (
                <button
                  key={idx}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors text-left"
                  onClick={() => copyToClipboard(phone.phone || phone.wa_id || phone, 'Phone')}
                >
                  <div className="h-9 w-9 rounded-full bg-[#00a884]/10 flex items-center justify-center flex-shrink-0">
                    <Phone className="h-4 w-4 text-[#00a884]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground">{phone.type || 'Phone'}</p>
                    <p className="text-sm font-medium truncate">{phone.phone || phone.wa_id || phone}</p>
                  </div>
                  <Copy className="h-3.5 w-3.5 text-muted-foreground/50" />
                </button>
              ))
            }

            {/* Emails */}
            {normalizedContactData.emails && normalizedContactData.emails.length > 0 &&
              normalizedContactData.emails.map((email, idx) => (
                <button
                  key={idx}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors text-left"
                  onClick={() => copyToClipboard(email.email || email, 'Email')}
                >
                  <div className="h-9 w-9 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Mail className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground">{email.type || 'Email'}</p>
                    <p className="text-sm font-medium truncate">{email.email || email}</p>
                  </div>
                  <Copy className="h-3.5 w-3.5 text-muted-foreground/50" />
                </button>
              ))
            }

            {/* Organization */}
            {normalizedContactData.org && (normalizedContactData.org.company || normalizedContactData.org.title) && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <div className="h-9 w-9 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <Building className="h-4 w-4 text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-muted-foreground">Organization</p>
                  <p className="text-sm font-medium">
                    {normalizedContactData.org.title && `${normalizedContactData.org.title}`}
                    {normalizedContactData.org.title && normalizedContactData.org.company && ' at '}
                    {normalizedContactData.org.company}
                  </p>
                  {normalizedContactData.org.department && (
                    <p className="text-xs text-muted-foreground">{normalizedContactData.org.department}</p>
                  )}
                </div>
              </div>
            )}

            {/* Addresses */}
            {normalizedContactData.addresses && normalizedContactData.addresses.length > 0 &&
              normalizedContactData.addresses.map((addr, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30">
                  <div className="h-9 w-9 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground">{addr.type || 'Address'}</p>
                    <p className="text-sm font-medium">
                      {[addr.street, addr.city, addr.state, addr.zip, addr.country]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                </div>
              ))
            }

            {/* Birthday */}
            {normalizedContactData.birthday && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <div className="h-9 w-9 rounded-full bg-pink-500/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm">🎂</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-muted-foreground">Birthday</p>
                  <p className="text-sm font-medium">{normalizedContactData.birthday}</p>
                </div>
              </div>
            )}

            {/* URLs */}
            {normalizedContactData.urls && normalizedContactData.urls.length > 0 &&
              normalizedContactData.urls.map((url, idx) => (
                <a
                  key={idx}
                  href={(typeof url === 'string' ? url : url.url || '').startsWith('http') ? (typeof url === 'string' ? url : url.url) : `https://${typeof url === 'string' ? url : url.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="h-9 w-9 rounded-full bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">🔗</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground">Website</p>
                    <p className="text-sm font-medium text-[#00a884] truncate">{typeof url === 'string' ? url : url.url}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                </a>
              ))
            }

            {/* vCard download */}
            {normalizedContactData.vcard && (
              <button
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors text-left"
                onClick={() => copyToClipboard(normalizedContactData.vcard, 'vCard data')}
              >
                <div className="h-9 w-9 rounded-full bg-gray-500/10 flex items-center justify-center flex-shrink-0">
                  <Copy className="h-4 w-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-muted-foreground">vCard</p>
                  <p className="text-sm font-medium">Copy vCard data</p>
                </div>
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
