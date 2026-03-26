// src/components/modals/GenerateWebChatLinkModal.jsx
/**
 * Modal for generating WebChat contact links
 * Allows admins/agents to generate dedicated links with PINs
 */

'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Copy, Check, Mail, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';
import { useDepartments } from '@/hooks/useDepartments';

export default function GenerateWebChatLinkModal({ open, onClose, contactId, contactName }) {
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [generatedLink, setGeneratedLink] = useState(null);
  const [copied, setCopied] = useState(false);

  const { data: departments, isLoading: departmentsLoading } = useDepartments();

  // Fetch WebChat accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['webchat-accounts'],
    queryFn: async () => {
      const response = await apiClient.get('/channels', { params: { type: 'webchat' } });
      return response.data?.accounts || [];
    },
  });

  const generateLinkMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiClient.post('/webchat/contact-link', data);
      return response;
    },
    onSuccess: (response) => {
      const { data } = response;
      if (data.success) {
        setGeneratedLink(data.data);
        toast.success('WebChat link generated successfully!');
      }
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to generate link');
    },
  });

  const handleGenerate = () => {
    if (!selectedDepartment) {
      toast.error('Please select a department');
      return;
    }

    generateLinkMutation.mutate({
      contactId: contactId || undefined,
      departmentId: selectedDepartment,
      channelAccountId: selectedAccount || undefined,
    });
  };

  const handleCopy = async () => {
    if (!generatedLink?.contactLink) return;

    try {
      await navigator.clipboard.writeText(generatedLink.contactLink);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const handleSendEmail = () => {
    if (!generatedLink?.contactLink) return;
    
    const subject = encodeURIComponent('Your WebChat Link');
    const body = encodeURIComponent(
      `Hello,\n\n` +
      `You can use this link to chat with us:\n${generatedLink.contactLink}\n\n` +
      `When you first access this link, you will be asked to set a 4-digit PIN. ` +
      `Please remember this PIN as you will need it to access your chat in the future.\n\n` +
      `Best regards`
    );
    
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleSendSMS = () => {
    if (!generatedLink?.contactLink) return;
    
    const message = encodeURIComponent(
      `Your WebChat link: ${generatedLink.contactLink}\n\n` +
      `When you first access this link, you will set a 4-digit PIN. ` +
      `Remember this PIN to access your chat later.`
    );
    
    // Open SMS app (works on mobile)
    window.location.href = `sms:?body=${message}`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate WebChat Link</DialogTitle>
          <DialogDescription>
            {contactName 
              ? `Generate a dedicated WebChat link for ${contactName}`
              : 'Generate a new WebChat link for a contact'}
          </DialogDescription>
        </DialogHeader>

        {!generatedLink ? (
          <div className="space-y-6 py-4">
            <div>
              <Label htmlFor="department">Department *</Label>
              <Select
                value={selectedDepartment}
                onValueChange={setSelectedDepartment}
                disabled={departmentsLoading}
              >
                <SelectTrigger id="department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments?.map((dept) => (
                    <SelectItem key={dept._id} value={dept._id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {accountsData && accountsData.length > 0 && (
              <div>
                <Label htmlFor="account">WebChat Account (Optional)</Label>
                <Select
                  value={selectedAccount}
                  onValueChange={setSelectedAccount}
                  disabled={accountsLoading}
                >
                  <SelectTrigger id="account">
                    <SelectValue placeholder="Select account (or use default)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Default Account</SelectItem>
                    {accountsData.map((account) => (
                      <SelectItem key={account._id} value={account._id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!selectedDepartment || generateLinkMutation.isPending}
              >
                {generateLinkMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Link'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-800 mb-2">
                <Check className="w-5 h-5" />
                <span className="font-semibold">Link Generated Successfully!</span>
              </div>
              <p className="text-sm text-green-700">
                Share this link with the contact. They will set their PIN when they first access the link.
              </p>
            </div>

            <div>
              <Label>WebChat Link</Label>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  readOnly
                  value={generatedLink.contactLink}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  size="icon"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2 text-blue-800">
                <div className="text-sm">
                  <strong>Note:</strong> The contact will enter their 4-digit PIN when they first access this link. No PIN is provided upfront.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handleSendEmail}
                variant="outline"
                className="w-full"
              >
                <Mail className="w-4 h-4 mr-2" />
                Send via Email
              </Button>
              <Button
                onClick={handleSendSMS}
                variant="outline"
                className="w-full"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Send via SMS
              </Button>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => {
                setGeneratedLink(null);
                setSelectedDepartment('');
                setSelectedAccount('');
              }}>
                Generate Another
              </Button>
              <Button onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

