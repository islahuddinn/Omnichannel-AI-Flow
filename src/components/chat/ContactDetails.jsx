// src/components/chat/ContactDetails.jsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Mail, Phone, MapPin, Calendar, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

export default function ContactDetails({ contact }) {
  if (!contact) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Contact Information</CardTitle>
          <Button variant="ghost" size="icon">
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center text-center">
          <Avatar className="h-24 w-24 mb-3">
            <AvatarImage src={contact.avatar} />
            <AvatarFallback className="text-2xl">
              {contact.name?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
          <h3 className="font-semibold text-lg">{contact.name || 'Unknown'}</h3>
        </div>

        <div className="space-y-3">
          {contact.email && (
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-gray-400" />
              <span className="text-sm">{contact.email}</span>
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-gray-400" />
              <span className="text-sm">{contact.phone}</span>
            </div>
          )}
          {contact.lastInteraction && (
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-sm">
                Last seen {formatDistanceToNow(new Date(contact.lastInteraction), { addSuffix: true })}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}