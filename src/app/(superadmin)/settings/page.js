// src/app/(superadmin)/settings/page.js
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Settings,
  Shield,
  Mail,
  Globe,
  Database,
  Save,
  AlertCircle
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import useUIStore from '@/store/useUIStore';

export default function SettingsPage() {
  const { addNotification } = useUIStore();
  const [settings, setSettings] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => apiClient.get('/system/settings')
  });

  const updateMutation = useMutation({
    mutationFn: (data) => apiClient.put('/system/settings', data),
    onSuccess: () => {
      addNotification({
        type: 'success',
        title: 'Settings Updated',
        message: 'System settings have been updated successfully'
      });
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: error.response?.data?.message || 'Failed to update settings'
      });
    }
  });

  useEffect(() => {
    if (data?.data) {
      setSettings(data.data);
    }
  }, [data]);

  const handleChange = (section, field, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleSubmit = () => {
    updateMutation.mutate(settings);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            System Settings
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
            Configure global system settings and preferences
          </p>
        </div>
        <Button onClick={handleSubmit} disabled={updateMutation.isPending} className="w-full sm:w-auto">
          <Save className="mr-2 h-4 w-4" />
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <Tabs defaultValue="general" className="space-y-4 w-full">
        <div className="w-full overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <TabsList className="flex flex-row items-center p-[10px] gap-[10px] h-auto sm:h-[61.5px] overflow-x-auto bg-[#F6F8FB] dark:bg-gray-800/50 border-[0.5px] border-[rgba(148,163,184,0.35)] dark:border-gray-700/50 rounded-[14px] scrollbar-hide w-full min-w-max sm:min-w-0">
          <TabsTrigger 
            value="general"
            className="flex flex-row justify-center items-center px-[10px] sm:px-[14px] py-[8px] sm:py-[10px] gap-[8px] sm:gap-[10px] min-w-[120px] sm:w-[200px] sm:min-w-[140px] h-[38px] sm:h-[41px] rounded-[12px] text-[#4B5563] dark:text-gray-300 font-medium text-sm sm:text-base leading-[19px] border-transparent bg-transparent dark:bg-transparent data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:border data-[state=active]:border-[#DBEAFE] dark:data-[state=active]:border-blue-500/50 data-[state=active]:shadow-[0px_10px_18px_rgba(37,99,235,0.1)] dark:data-[state=active]:shadow-[0px_10px_18px_rgba(37,99,235,0.2)] data-[state=active]:text-[#4880FF] dark:data-[state=active]:text-blue-400 data-[state=active]:font-normal transition-all flex-shrink-0"
          >
            General
          </TabsTrigger>
          <TabsTrigger 
            value="security"
            className="flex flex-row justify-center items-center px-[10px] sm:px-[14px] py-[8px] sm:py-[10px] gap-[8px] sm:gap-[10px] min-w-[120px] sm:w-[200px] sm:min-w-[140px] h-[38px] sm:h-[41px] rounded-[12px] text-[#4B5563] dark:text-gray-300 font-medium text-sm sm:text-base leading-[19px] border-transparent bg-transparent dark:bg-transparent data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:border data-[state=active]:border-[#DBEAFE] dark:data-[state=active]:border-blue-500/50 data-[state=active]:shadow-[0px_10px_18px_rgba(37,99,235,0.1)] dark:data-[state=active]:shadow-[0px_10px_18px_rgba(37,99,235,0.2)] data-[state=active]:text-[#4880FF] dark:data-[state=active]:text-blue-400 data-[state=active]:font-normal transition-all flex-shrink-0"
          >
            Security
          </TabsTrigger>
          <TabsTrigger 
            value="email"
            className="flex flex-row justify-center items-center px-[10px] sm:px-[14px] py-[8px] sm:py-[10px] gap-[8px] sm:gap-[10px] min-w-[120px] sm:w-[200px] sm:min-w-[140px] h-[38px] sm:h-[41px] rounded-[12px] text-[#4B5563] dark:text-gray-300 font-medium text-sm sm:text-base leading-[19px] border-transparent bg-transparent dark:bg-transparent data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:border data-[state=active]:border-[#DBEAFE] dark:data-[state=active]:border-blue-500/50 data-[state=active]:shadow-[0px_10px_18px_rgba(37,99,235,0.1)] dark:data-[state=active]:shadow-[0px_10px_18px_rgba(37,99,235,0.2)] data-[state=active]:text-[#4880FF] dark:data-[state=active]:text-blue-400 data-[state=active]:font-normal transition-all flex-shrink-0"
          >
            Email
          </TabsTrigger>
          <TabsTrigger 
            value="limits"
            className="flex flex-row justify-center items-center px-[10px] sm:px-[14px] py-[8px] sm:py-[10px] gap-[8px] sm:gap-[10px] min-w-[120px] sm:w-[200px] sm:min-w-[140px] h-[38px] sm:h-[41px] rounded-[12px] text-[#4B5563] dark:text-gray-300 font-medium text-sm sm:text-base leading-[19px] border-transparent bg-transparent dark:bg-transparent data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:border data-[state=active]:border-[#DBEAFE] dark:data-[state=active]:border-blue-500/50 data-[state=active]:shadow-[0px_10px_18px_rgba(37,99,235,0.1)] dark:data-[state=active]:shadow-[0px_10px_18px_rgba(37,99,235,0.2)] data-[state=active]:text-[#4880FF] dark:data-[state=active]:text-blue-400 data-[state=active]:font-normal transition-all flex-shrink-0"
          >
            Limits
          </TabsTrigger>
          <TabsTrigger 
            value="features"
            className="flex flex-row justify-center items-center px-[10px] sm:px-[14px] py-[8px] sm:py-[10px] gap-[8px] sm:gap-[10px] min-w-[120px] sm:w-[200px] sm:min-w-[140px] h-[38px] sm:h-[41px] rounded-[12px] text-[#4B5563] dark:text-gray-300 font-medium text-sm sm:text-base leading-[19px] border-transparent bg-transparent dark:bg-transparent data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:border data-[state=active]:border-[#DBEAFE] dark:data-[state=active]:border-blue-500/50 data-[state=active]:shadow-[0px_10px_18px_rgba(37,99,235,0.1)] dark:data-[state=active]:shadow-[0px_10px_18px_rgba(37,99,235,0.2)] data-[state=active]:text-[#4880FF] dark:data-[state=active]:text-blue-400 data-[state=active]:font-normal transition-all flex-shrink-0"
          >
            Features
          </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Configure general system settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                    <div>
                      <Label>Maintenance Mode</Label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Enable maintenance mode to prevent user access
                      </p>
                    </div>
                    <Switch
                      checked={settings.maintenance?.enabled || false}
                      onCheckedChange={(checked) => handleChange('maintenance', 'enabled', checked)}
                    />
                  </div>
              </div>

              {settings.maintenance?.enabled && (
                <div className="space-y-2">
                  <Label>Maintenance Message</Label>
                  <Input
                    value={settings.maintenance?.message || ''}
                    onChange={(e) => handleChange('maintenance', 'message', e.target.value)}
                    placeholder="System is under maintenance..."
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Configure security and authentication settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Minimum Password Length</Label>
                  <Input
                    type="number"
                    value={settings.security?.passwordMinLength || 8}
                    onChange={(e) => handleChange('security', 'passwordMinLength', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Login Attempts</Label>
                  <Input
                    type="number"
                    value={settings.security?.maxLoginAttempts || 5}
                    onChange={(e) => handleChange('security', 'maxLoginAttempts', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Session Timeout (hours)</Label>
                  <Input
                    type="number"
                    value={(settings.security?.sessionTimeout || 86400000) / 3600000}
                    onChange={(e) => handleChange('security', 'sessionTimeout', parseInt(e.target.value) * 3600000)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Lockout Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={(settings.security?.lockoutDuration || 1800000) / 60000}
                    onChange={(e) => handleChange('security', 'lockoutDuration', parseInt(e.target.value) * 60000)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={settings.security?.passwordRequireUppercase || false}
                    onCheckedChange={(checked) => handleChange('security', 'passwordRequireUppercase', checked)}
                  />
                  <Label>Require Uppercase Letters</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={settings.security?.passwordRequireLowercase || false}
                    onCheckedChange={(checked) => handleChange('security', 'passwordRequireLowercase', checked)}
                  />
                  <Label>Require Lowercase Letters</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={settings.security?.passwordRequireNumbers || false}
                    onCheckedChange={(checked) => handleChange('security', 'passwordRequireNumbers', checked)}
                  />
                  <Label>Require Numbers</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={settings.security?.passwordRequireSpecialChars || false}
                    onCheckedChange={(checked) => handleChange('security', 'passwordRequireSpecialChars', checked)}
                  />
                  <Label>Require Special Characters</Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle>Email Settings</CardTitle>
              <CardDescription>
                Configure system email settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From Name</Label>
                  <Input
                    value={settings.email?.fromName || ''}
                    onChange={(e) => handleChange('email', 'fromName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>From Email</Label>
                  <Input
                    type="email"
                    value={settings.email?.fromEmail || ''}
                    onChange={(e) => handleChange('email', 'fromEmail', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reply To</Label>
                  <Input
                    type="email"
                    value={settings.email?.replyTo || ''}
                    onChange={(e) => handleChange('email', 'replyTo', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Support Email</Label>
                  <Input
                    type="email"
                    value={settings.email?.supportEmail || ''}
                    onChange={(e) => handleChange('email', 'supportEmail', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="limits">
          <Card>
            <CardHeader>
              <CardTitle>System Limits</CardTitle>
              <CardDescription>
                Configure global system limits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Companies</Label>
                  <Input
                    type="number"
                    value={settings.limits?.maxCompanies || 1000}
                    onChange={(e) => handleChange('limits', 'maxCompanies', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Users Per Company</Label>
                  <Input
                    type="number"
                    value={settings.limits?.maxUsersPerCompany || 100}
                    onChange={(e) => handleChange('limits', 'maxUsersPerCompany', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Channels Per Company</Label>
                  <Input
                    type="number"
                    value={settings.limits?.maxChannelsPerCompany || 10}
                    onChange={(e) => handleChange('limits', 'maxChannelsPerCompany', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Messages Per Day</Label>
                  <Input
                    type="number"
                    value={settings.limits?.maxMessagesPerDay || 1000000}
                    onChange={(e) => handleChange('limits', 'maxMessagesPerDay', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max File Size (MB)</Label>
                  <Input
                    type="number"
                    value={(settings.limits?.maxFileSize || 10485760) / 1024 / 1024}
                    onChange={(e) => handleChange('limits', 'maxFileSize', parseInt(e.target.value) * 1024 * 1024)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Conversations Per Agent</Label>
                  <Input
                    type="number"
                    value={settings.limits?.maxConversationsPerAgent || 50}
                    onChange={(e) => handleChange('limits', 'maxConversationsPerAgent', parseInt(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Feature Toggles</CardTitle>
              <CardDescription>
                Enable or disable system features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              <div className="flex flex-col gap-[21px]">
                <div className="flex flex-col gap-[21px]">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                    <div className="flex flex-col gap-2">
                      <Label className="text-sm font-semibold dark:text-gray-200">Enable Signup</Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Allow new companies to sign up</p>
                    </div>
                    <Switch
                      checked={settings.features?.enableSignup || false}
                      onCheckedChange={(checked) => handleChange('features', 'enableSignup', checked)}
                    />
                  </div>
                  <div className="w-full h-px border-t border-black/10 dark:border-gray-600/50"></div>
                </div>
                <div className="flex flex-col gap-[21px]">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                    <div className="flex flex-col gap-2">
                      <Label className="text-sm font-semibold dark:text-gray-200">Enable Google Auth</Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Allow Google authentication</p>
                    </div>
                    <Switch
                      checked={settings.features?.enableGoogleAuth || false}
                      onCheckedChange={(checked) => handleChange('features', 'enableGoogleAuth', checked)}
                    />
                  </div>
                  <div className="w-full h-px border-t border-black/10 dark:border-gray-600/50"></div>
                </div>
                <div className="flex flex-col gap-[21px]">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                    <div className="flex flex-col gap-2">
                      <Label className="text-sm font-semibold dark:text-gray-200">Enable Two-Factor Auth</Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Enable 2FA for users</p>
                    </div>
                    <Switch
                      checked={settings.features?.enableTwoFactor || false}
                      onCheckedChange={(checked) => handleChange('features', 'enableTwoFactor', checked)}
                    />
                  </div>
                  <div className="w-full h-px border-t border-black/10 dark:border-gray-600/50"></div>
                </div>
                <div className="flex flex-col gap-[21px]">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                    <div className="flex flex-col gap-2">
                      <Label className="text-sm font-semibold dark:text-gray-200">Enable API Access</Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Allow API access for companies</p>
                    </div>
                    <Switch
                      checked={settings.features?.enableAPIAccess || false}
                      onCheckedChange={(checked) => handleChange('features', 'enableAPIAccess', checked)}
                    />
                  </div>
                  <div className="w-full h-px border-t border-black/10 dark:border-gray-600/50"></div>
                </div>
                <div className="flex flex-col gap-[21px]">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                    <div className="flex flex-col gap-2">
                      <Label className="text-sm font-semibold dark:text-gray-200">Enable Webhooks</Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Allow webhook integrations</p>
                    </div>
                    <Switch
                      checked={settings.features?.enableWebhooks || false}
                      onCheckedChange={(checked) => handleChange('features', 'enableWebhooks', checked)}
                    />
                  </div>
                  <div className="w-full h-px border-t border-black/10 dark:border-gray-600/50"></div>
                </div>
                <div className="flex flex-col gap-[21px]">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                    <div className="flex flex-col gap-2">
                      <Label className="text-sm font-semibold dark:text-gray-200">Enable File Uploads</Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Allow file attachments in messages</p>
                    </div>
                    <Switch
                      checked={settings.features?.enableFileUploads || false}
                      onCheckedChange={(checked) => handleChange('features', 'enableFileUploads', checked)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}