// src/app/(superadmin)/companies/[companyId]/edit/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Building2, 
  User, 
  CreditCard, 
  MessageSquare,
  Save,
  ArrowLeft,
  Trash2
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import useUIStore from '@/store/useUIStore';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import ChannelsList from '@/components/panels/superadmin/ChannelsList';
import { ACTIVE_TAB_CLASSES } from '@/constants/ui';


export default function EditCompanyPage() {
  const router = useRouter();
  const params = useParams();
  const { addNotification } = useUIStore();
  const [formData, setFormData] = useState({});

  const { data: company, isLoading } = useQuery({
    queryKey: ['company', params.companyId],
    queryFn: () => apiClient.get(`/companies/${params.companyId}`)
  });

  const { data: channels } = useQuery({
    queryKey: ['company-channels', params.companyId],
    queryFn: () => apiClient.get(`/companies/${params.companyId}/channels`)
  });

  const updateMutation = useMutation({
    mutationFn: (data) => apiClient.put(`/companies/${params.companyId}`, data),
    onSuccess: () => {
      addNotification({
        type: 'success',
        title: 'Company Updated',
        message: 'Company details have been successfully updated'
      });
      router.push('/companies');
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: error.response?.data?.message || 'Failed to update company'
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/companies/${params.companyId}`),
    onSuccess: () => {
      addNotification({
        type: 'success',
        title: 'Company Suspended',
        message: 'Company has been suspended successfully'
      });
      router.push('/companies');
    }
  });

  useEffect(() => {
    if (company?.data) {
      setFormData(company.data);
    }
  }, [company]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleNestedChange = (parent, field, value) => {
    setFormData(prev => ({
      ...prev,
      [parent]: {
        ...prev[parent],
        [field]: value
      }
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to suspend this company?')) {
      deleteMutation.mutate();
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/companies')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Edit Company
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {formData.name}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Suspend Company
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Tabs defaultValue="company" className="space-y-4">
          <TabsList className="gap-2 px-2">
            <TabsTrigger value="company" className={ACTIVE_TAB_CLASSES.trigger}>Company Info</TabsTrigger>
            <TabsTrigger value="subscription" className={ACTIVE_TAB_CLASSES.trigger}>Subscription</TabsTrigger>
            <TabsTrigger value="channels" className={ACTIVE_TAB_CLASSES.trigger}>Channels</TabsTrigger>
            <TabsTrigger value="settings" className={ACTIVE_TAB_CLASSES.trigger}>Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="company">
            <Card>
              <CardHeader>
                <CardTitle>Company Information</CardTitle>
                <CardDescription>
                  Basic information about the company
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Company Name</Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name || ''}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">Slug</Label>
                    <Input
                      id="slug"
                      name="slug"
                      value={formData.slug || ''}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email || ''}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      value={formData.phone || ''}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status || ''}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                    >
                      <SelectTrigger className="w-full border-[#C0C0C0] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#2E4258] dark:text-gray-200"
                                      style={{
                                        height: '44px',
                                        borderRadius: '10px',
                                        padding: '18px 12px'
                                      }}>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="trial">Trial</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold">Address</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Street</Label>
                      <Input
                        placeholder="Street"
                        value={formData.address?.street || ''}
                        onChange={(e) => handleNestedChange('address', 'street', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input
                        placeholder="City"
                        value={formData.address?.city || ''}
                        onChange={(e) => handleNestedChange('address', 'city', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input
                        placeholder="State"
                        value={formData.address?.state || ''}
                        onChange={(e) => handleNestedChange('address', 'state', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>ZIP Code</Label>
                      <Input
                        placeholder="ZIP Code"
                        value={formData.address?.zipCode || ''}
                        onChange={(e) => handleNestedChange('address', 'zipCode', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscription">
            <Card>
              <CardHeader>
                <CardTitle>Subscription Details</CardTitle>
                <CardDescription>
                  Manage subscription plan and limits
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Plan</Label>
                    <Select
                      value={formData.subscription?.plan || ''}
                      onValueChange={(value) => handleNestedChange('subscription', 'plan', value)}
                    >
                      <SelectTrigger className="w-full border-[#C0C0C0] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#2E4258] dark:text-gray-200"
                                      style={{
                                        height: '44px',
                                        borderRadius: '10px',
                                        padding: '18px 12px'
                                      }}>
                        <SelectValue placeholder="Select plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trial">Trial</SelectItem>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={formData.subscription?.endDate?.split('T')[0] || ''}
                      onChange={(e) => handleNestedChange('subscription', 'endDate', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold">Limits</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Max Users</Label>
                      <Input
                        type="number"
                        value={formData.subscription?.limits?.users || 0}
                        onChange={(e) => handleNestedChange('subscription.limits', 'users', parseInt(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Channels</Label>
                      <Input
                        type="number"
                        value={formData.subscription?.limits?.channels || 0}
                        onChange={(e) => handleNestedChange('subscription.limits', 'channels', parseInt(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Conversations</Label>
                      <Input
                        type="number"
                        value={formData.subscription?.limits?.conversations || 0}
                        onChange={(e) => handleNestedChange('subscription.limits', 'conversations', parseInt(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Messages</Label>
                      <Input
                        type="number"
                        value={formData.subscription?.limits?.messages || 0}
                        onChange={(e) => handleNestedChange('subscription.limits', 'messages', parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="channels">
            <Card>
              <CardHeader>
                <CardTitle>Channel Configuration</CardTitle>
                <CardDescription>
                  Manage company channel integrations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChannelsList 
                  companyId={params.companyId}
                  channels={channels?.data || []}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Company Settings</CardTitle>
                <CardDescription>
                  Configure company preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Input
                      value={formData.settings?.timezone || 'UTC'}
                      onChange={(e) => handleNestedChange('settings', 'timezone', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <Select
                      value={formData.settings?.language || 'en'}
                      onValueChange={(value) => handleNestedChange('settings', 'language', value)}
                    >
                      <SelectTrigger className="w-full border-[#C0C0C0] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#2E4258] dark:text-gray-200"
                                      style={{
                                        height: '44px',
                                        borderRadius: '10px',
                                        padding: '18px 12px'
                                      }}>
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date Format</Label>
                    <Select
                      value={formData.settings?.dateFormat || 'MM/DD/YYYY'}
                      onValueChange={(value) => handleNestedChange('settings', 'dateFormat', value)}
                    >
                      <SelectTrigger className="w-full border-[#C0C0C0] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#2E4258] dark:text-gray-200"
                                      style={{
                                        height: '44px',
                                        borderRadius: '10px',
                                        padding: '18px 12px'
                                      }}>
                        <SelectValue placeholder="Select date format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Time Format</Label>
                    <Select
                      value={formData.settings?.timeFormat || '12h'}
                      onValueChange={(value) => handleNestedChange('settings', 'timeFormat', value)}
                    >
                      <SelectTrigger className="w-full border-[#C0C0C0] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#2E4258] dark:text-gray-200"
                                      style={{
                                        height: '44px',
                                        borderRadius: '10px',
                                        padding: '18px 12px'
                                      }}>
                        <SelectValue placeholder="Select time format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12h">12 Hour</SelectItem>
                        <SelectItem value="24h">24 Hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Save Button */}
        <div className="flex justify-end mt-6">
          <Button
            type="submit"
            disabled={updateMutation.isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}