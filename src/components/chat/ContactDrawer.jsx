// src/components/chat/ContactDrawer.jsx

'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import ChannelIcon from '@/components/shared/ChannelIcon';
import MediaGallery from '@/components/chat/MediaGallery';
import SalesforceActivityPanel from '@/components/chat/SalesforceActivityPanel';
import { X, Mail, Phone, MapPin, Calendar, Tag, Merge2, Copy, Image as ImageIcon, FileText, Link2, ChevronRight, Cloud } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function ContactDrawer({
  conversation,
  onClose,
  onMerge,
}) {
  const [tags, setTags] = useState(conversation.tags || []);
  const [newTag, setNewTag] = useState('');
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  
  if (!conversation) return null;
  
  const contact = conversation.contact || {};
  
  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setNewTag('');
    }
  };
  
  const handleRemoveTag = (tag) => {
    setTags(tags.filter((t) => t !== tag));
  };
  
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };
  
  return (
    <Sheet open={true} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:w-96 p-0">
        <SheetHeader className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <SheetTitle>Contact Details</SheetTitle>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-8rem)]">
          <div className="px-6 py-4 space-y-6">
            {/* Contact Info */}
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-24 w-24 mb-3">
                  <AvatarImage src={contact.avatar} />
                  <AvatarFallback className="text-2xl font-semibold">
                    {contact.name?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
                <h3 className="text-lg font-semibold">{contact.name || 'Unknown'}</h3>
                <Badge variant="outline" className="mt-2">
                  {conversation.channel?.toUpperCase() || 'UNKNOWN'}
                </Badge>
              </div>

              {/* Media, Links, and Docs — WhatsApp style */}
              <button
                onClick={() => setShowMediaGallery(true)}
                className="w-full flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <div className="flex items-center gap-1.5">
                  <ImageIcon className="h-4 w-4 text-[#00a884]" />
                  <FileText className="h-4 w-4 text-[#00a884]" />
                  <Link2 className="h-4 w-4 text-[#00a884]" />
                </div>
                <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">Media, Links, and Docs</span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </button>

              {/* Media Gallery Dialog */}
              <MediaGallery
                conversationId={conversation._id}
                isOpen={showMediaGallery}
                onClose={() => setShowMediaGallery(false)}
              />

              {/* Salesforce Activity */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <SalesforceActivityPanel conversationId={conversation._id} />
                {contact.SF_id && (
                  <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-3.5 w-3.5 text-[#00a884]" />
                      <span className="text-xs text-muted-foreground">SF ID: {contact.SF_id}</span>
                    </div>
                    <a
                      href={`${process.env.NEXT_PUBLIC_SALESFORCE_INSTANCE_URL || 'https://hmi1--dev1uat.sandbox.my.salesforce.com'}/${contact.SF_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[#00a884] hover:underline"
                    >
                      Open in Salesforce
                    </a>
                  </div>
                )}
                {contact.Contact_Type && (
                  <div className="px-4 py-1.5 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-[10px] text-muted-foreground">Type: {contact.Contact_Type}</span>
                  </div>
                )}
              </div>

              {/* Contact Details */}
              <div className="space-y-3">
                {contact.phone && (
                  <div className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg group cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => copyToClipboard(contact.phone, 'Phone')}
                  >
                    <Phone className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">Phone</p>
                      <p className="text-sm font-medium truncate">{contact.phone}</p>
                    </div>
                    <Copy className="h-4 w-4 text-gray-300 group-hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-all" />
                  </div>
                )}

                {contact.email && (
                  <div className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg group cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => copyToClipboard(contact.email, 'Email')}
                  >
                    <Mail className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">Email</p>
                      <p className="text-sm font-medium truncate">{contact.email}</p>
                    </div>
                    <Copy className="h-4 w-4 text-gray-300 group-hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-all" />
                  </div>
                )}

                {contact.address && (
                  <div className="flex items-start gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <MapPin className="h-4 w-4 text-gray-500 flex-shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">Address</p>
                      <p className="text-sm font-medium break-words">{contact.address}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex justify-between">
                  <span>Contact ID:</span>
                  <span className="font-mono">{contact._id?.slice(-8)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Joined:</span>
                  <span>
                    {contact.createdAt
                      ? format(new Date(contact.createdAt), 'MMM d, yyyy')
                      : 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Last seen:</span>
                  <span>
                    {conversation.lastMessageAt
                      ? format(new Date(conversation.lastMessageAt), 'MMM d, HH:mm')
                      : 'Never'}
                  </span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="tags" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="tags">Tags</TabsTrigger>
                <TabsTrigger value="merge">Merged</TabsTrigger>
              </TabsList>

              {/* Tags Tab */}
              <TabsContent value="tags" className="space-y-3 mt-4">
                <div className="space-y-2">
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="flex items-center gap-1 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => handleRemoveTag(tag)}
                        >
                          {tag}
                          <X className="h-3 w-3" />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Add tag..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddTag();
                      }
                    }}
                    className="text-sm h-8"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddTag}
                    className="h-8"
                  >
                    <Tag className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* Merged Tab */}
              <TabsContent value="merge" className="space-y-3 mt-4">
                {conversation.mergedConversations?.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">
                      This conversation is merged with {conversation.mergedConversations.length} other conversation{conversation.mergedConversations.length > 1 ? 's' : ''}
                    </p>
                    <div className="space-y-2">
                      {conversation.mergedConversations.map((merged) => (
                        <div
                          key={merged._id}
                          className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
                        >
                          <div className="flex items-center gap-2">
                            <ChannelIcon type={merged.channel} className="h-4 w-4" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">
                                {merged.contact?.name || 'Unknown'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {merged.channel.toUpperCase()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-2 mt-3"
                      onClick={onMerge}
                    >
                      <Merge2 className="h-4 w-4" />
                      Manage Merge
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500 mb-3">
                      No merged conversations
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={onMerge}
                    >
                      <Merge2 className="h-4 w-4" />
                      Merge with Another
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}