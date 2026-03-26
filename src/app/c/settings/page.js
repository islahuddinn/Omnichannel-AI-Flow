"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Bot, Save, Loader2, CheckCircle2, AlertCircle, Key, Eye, EyeOff,
  ShieldCheck, Copy, Lock, Sparkles, MessageSquare, Sliders,
  Cloud, HelpCircle, Info,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';

const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState({
    features: {
      aiBot: {
        enabled: false, provider: '', model: '', apiKey: '',
        systemPrompt: '', temperature: 0.7, maxTokens: 1024, contextMessageCount: 20,
      }
    }
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [revealDialogOpen, setRevealDialogOpen] = useState(false);
  const [revealPassword, setRevealPassword] = useState('');
  const [revealPasswordVisible, setRevealPasswordVisible] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState(null);
  const [revealError, setRevealError] = useState('');
  const [sfTestLoading, setSfTestLoading] = useState(false);
  const [sfTestResult, setSfTestResult] = useState(null);

  const { data: providers } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: async () => (await apiClient.get('/ai-providers')).data,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: companyData, isLoading: companyLoading, isError, error: fetchError, refetch } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => (await apiClient.get('/companies/current')).data,
    enabled: !!user,
  });

  useEffect(() => {
    if (companyData) {
      const ab = companyData.features?.aiBot || {};
      setSettings({
        features: {
          aiBot: {
            enabled: ab.enabled ?? false,
            provider: ab.provider || '',
            model: ab.model || '',
            apiKey: ab.apiKey || '',
            systemPrompt: ab.systemPrompt || '',
            temperature: ab.temperature ?? 0.7,
            maxTokens: ab.maxTokens ?? 1024,
            contextMessageCount: ab.contextMessageCount ?? 20,
          }
        }
      });
    }
  }, [companyData]);

  const handleSettingChange = useCallback((path, value) => {
    setSettings(prev => {
      const newSettings = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let current = newSettings;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return newSettings;
    });
  }, []);

  const handleProviderChange = useCallback((value) => {
    handleSettingChange('features.aiBot.provider', value);
    handleSettingChange('features.aiBot.model', '');
  }, [handleSettingChange]);

  const isDirty = useMemo(() => {
    if (!companyData) return false;
    const orig = companyData.features?.aiBot || {};
    const curr = settings.features?.aiBot || {};
    return Object.keys(curr).some(k => {
      if (k === 'apiKey' && curr[k] === MASK) return false;
      return String(curr[k] ?? '') !== String(orig[k] ?? '');
    });
  }, [settings, companyData]);

  const updateSettingsMutation = useMutation({
    mutationFn: (data) => apiClient.put('/companies/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      toast.success('Settings saved successfully');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Failed to save settings'),
  });

  const handleSave = () => {
    const aiBot = settings.features?.aiBot || {};
    if (aiBot.enabled) {
      if (!aiBot.provider || !aiBot.model) {
        toast.error('Provider and Model are required');
        return;
      }
      const apiKey = aiBot.apiKey;
      if (!apiKey || apiKey === MASK) {
        if (companyData?.features?.aiBot?.apiKey && apiKey === MASK) {
          const toSave = { ...settings, features: { ...settings.features, aiBot: { ...aiBot, apiKey: undefined } } };
          updateSettingsMutation.mutate(toSave);
          return;
        }
        toast.error('API key is required');
        return;
      }
    }
    updateSettingsMutation.mutate(settings);
  };

  const handleRevealSecret = async () => {
    if (!revealPassword.trim()) { setRevealError('Please enter your password'); return; }
    setRevealLoading(true);
    setRevealError('');
    try {
      const response = await apiClient.post('/companies/settings/reveal-secret', { password: revealPassword.trim() });
      const key = response?.data?.apiKey || response?.apiKey || response?.data?.apiSecret || response?.apiSecret;
      if (key) setRevealedSecret(key);
      else setRevealError('No API key found');
    } catch (err) {
      setRevealError(err?.response?.data?.error || err?.data?.error || 'Failed to verify password');
    } finally {
      setRevealLoading(false);
    }
  };

  const handleCloseRevealDialog = () => {
    setRevealDialogOpen(false);
    setRevealPassword('');
    setRevealPasswordVisible(false);
    setRevealLoading(false);
    setRevealedSecret(null);
    setRevealError('');
  };

  if (companyLoading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (isError) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center p-6">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <h3 className="text-lg font-semibold">Failed to load settings</h3>
      <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
    </div>
  );

  const aiBot = settings.features?.aiBot || {};
  const currentProvider = providers?.[aiBot.provider];
  const currentModels = currentProvider?.models || [];

  // Salesforce config status
  const sfConfigured = !!(process.env.NEXT_PUBLIC_SALESFORCE_INSTANCE_URL || companyData?.features?.salesforce?.instanceUrl);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Settings</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Manage your company settings</p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Unsaved changes</Badge>}
          <Button onClick={handleSave} disabled={updateSettingsMutation.isPending || !isDirty} size="sm" className="gap-1.5">
            {updateSettingsMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving...</> : <><Save className="h-3.5 w-3.5" />Save</>}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                  <Bot className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">AI Bot Configuration</CardTitle>
                  <CardDescription>Configure AI-powered automated responses for customer conversations</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Enable toggle */}
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Label htmlFor="aiBot-enabled" className="text-sm font-semibold cursor-pointer">Enable AI Bot</Label>
                    {aiBot.enabled && <Badge variant="default" className="bg-emerald-500 text-[10px]">Active</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">Automatically respond to customer messages using AI</p>
                </div>
                <Switch id="aiBot-enabled" checked={aiBot.enabled ?? false} onCheckedChange={(v) => handleSettingChange('features.aiBot.enabled', v)} />
              </div>

              {aiBot.enabled && (
                <div className="space-y-4">
                  {/* Provider & Model */}
                  <div className="p-3 bg-muted rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">AI Provider & Model</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="aiBot-provider" className="text-xs">Provider <span className="text-destructive">*</span></Label>
                        <Select value={aiBot.provider || ''} onValueChange={handleProviderChange}>
                          <SelectTrigger id="aiBot-provider" className="h-9"><SelectValue placeholder="Select provider" /></SelectTrigger>
                          <SelectContent>
                            {providers && Object.entries(providers).map(([key, p]) => (
                              <SelectItem key={key} value={key}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="aiBot-model" className="text-xs">Model <span className="text-destructive">*</span></Label>
                        <Select value={aiBot.model || ''} onValueChange={(v) => handleSettingChange('features.aiBot.model', v)} disabled={!aiBot.provider}>
                          <SelectTrigger id="aiBot-model" className="h-9"><SelectValue placeholder={aiBot.provider ? 'Select model' : 'Select provider first'} /></SelectTrigger>
                          <SelectContent>
                            {currentModels.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                <div className="flex flex-col"><span>{m.name}</span>{m.description && <span className="text-[10px] text-muted-foreground">{m.description}</span>}</div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* API Key */}
                  <div className="p-3 bg-muted rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="aiBot-apiKey" className="text-sm font-semibold">API Key <span className="text-destructive">*</span></Label>
                    </div>
                    <p className="text-xs text-muted-foreground">{currentProvider ? `Your ${currentProvider.name} API key` : 'Select a provider first'}</p>
                    <div className="relative">
                      <Input
                        id="aiBot-apiKey"
                        type={showApiKey ? 'text' : 'password'}
                        placeholder={aiBot.apiKey === MASK ? 'Leave blank to keep existing' : (currentProvider?.apiKeyPlaceholder || 'Enter API key')}
                        value={aiBot.apiKey || ''}
                        onChange={(e) => handleSettingChange('features.aiBot.apiKey', e.target.value)}
                        onFocus={() => { if (aiBot.apiKey === MASK) handleSettingChange('features.aiBot.apiKey', ''); }}
                        onBlur={() => { if (!aiBot.apiKey && companyData?.features?.aiBot?.apiKey) handleSettingChange('features.aiBot.apiKey', MASK); }}
                        className="w-full pr-12 h-9"
                        autoComplete="off"
                      />
                      {aiBot.apiKey !== MASK && (
                        <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        {companyData?.features?.aiBot?.apiKey ? 'Key stored securely' : 'Key will be stored securely'}
                      </p>
                      {companyData?.features?.aiBot?.apiKey && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setRevealDialogOpen(true)} className="h-7 text-xs gap-1">
                          <ShieldCheck className="h-3 w-3" />Reveal
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* System Prompt */}
                  <div className="p-3 bg-muted rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="aiBot-systemPrompt" className="text-sm font-semibold">System Prompt</Label>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          <p className="font-medium mb-1">Tips:</p>
                          <ul className="list-disc pl-3 space-y-0.5">
                            <li>Define the bot&apos;s personality and tone</li>
                            <li>Specify what topics it can or cannot discuss</li>
                            <li>Include company-specific info (name, services)</li>
                            <li>Set language preferences</li>
                            <li>Leave blank for default customer support prompt</li>
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Textarea
                      id="aiBot-systemPrompt"
                      placeholder="You are a helpful customer support assistant for [Company Name]. You help customers with questions about our services, pricing, and support..."
                      value={aiBot.systemPrompt || ''}
                      onChange={(e) => handleSettingChange('features.aiBot.systemPrompt', e.target.value)}
                      rows={4}
                      className="resize-y text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">{(aiBot.systemPrompt || '').length} characters</p>
                  </div>

                  {/* Advanced Settings */}
                  <div className="p-3 bg-muted rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Advanced Settings</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1">
                          <Label htmlFor="aiBot-temperature" className="text-xs">Temperature</Label>
                          <Tooltip>
                            <TooltipTrigger asChild><HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                            <TooltipContent className="text-xs max-w-[200px]">Controls creativity. 0 = deterministic and focused. 1 = balanced. 2 = very creative and varied.</TooltipContent>
                          </Tooltip>
                        </div>
                        <Input id="aiBot-temperature" type="number" min="0" max="2" step="0.1" value={aiBot.temperature ?? 0.7} onChange={(e) => handleSettingChange('features.aiBot.temperature', parseFloat(e.target.value) || 0.7)} className="h-9" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1">
                          <Label htmlFor="aiBot-maxTokens" className="text-xs">Max Tokens</Label>
                          <Tooltip>
                            <TooltipTrigger asChild><HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                            <TooltipContent className="text-xs max-w-[200px]">Maximum length of AI response. 512 = short replies. 1024 = medium. 4096 = long detailed responses.</TooltipContent>
                          </Tooltip>
                        </div>
                        <Input id="aiBot-maxTokens" type="number" min="100" max="8192" step="100" value={aiBot.maxTokens ?? 1024} onChange={(e) => handleSettingChange('features.aiBot.maxTokens', parseInt(e.target.value) || 1024)} className="h-9" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1">
                          <Label htmlFor="aiBot-context" className="text-xs">Context Messages</Label>
                          <Tooltip>
                            <TooltipTrigger asChild><HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                            <TooltipContent className="text-xs max-w-[200px]">How many recent messages the AI sees for context. More = better understanding but higher cost. 10-20 is recommended.</TooltipContent>
                          </Tooltip>
                        </div>
                        <Input id="aiBot-context" type="number" min="1" max="50" step="1" value={aiBot.contextMessageCount ?? 20} onChange={(e) => handleSettingChange('features.aiBot.contextMessageCount', parseInt(e.target.value) || 20)} className="h-9" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
      </div>

      {/* Reveal Key Dialog */}
      <AlertDialog open={revealDialogOpen} onOpenChange={(open) => { if (!open) handleCloseRevealDialog(); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-indigo-600" />
              {revealedSecret ? 'API Key' : 'Verify Your Identity'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {revealedSecret ? 'Your API key is shown below.' : 'Enter your login password to reveal the API key.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!revealedSecret ? (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="reveal-password" className="text-xs">Password</Label>
                <div className="relative">
                  <Input id="reveal-password" type={revealPasswordVisible ? 'text' : 'password'} placeholder="Enter your login password" value={revealPassword} onChange={(e) => { setRevealPassword(e.target.value); if (revealError) setRevealError(''); }} onKeyDown={(e) => { if (e.key === 'Enter' && !revealLoading) handleRevealSecret(); }} className="pr-10 h-9" autoComplete="off" autoFocus />
                  <button type="button" onClick={() => setRevealPasswordVisible(!revealPasswordVisible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {revealPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {revealError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{revealError}</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-2 py-2">
              <div className="p-3 bg-muted rounded-lg border flex items-center justify-between gap-2">
                <code className="text-xs font-mono break-all flex-1">{revealedSecret}</code>
                <Button type="button" variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(revealedSecret); toast.success('Copied'); }} className="h-7 w-7 p-0"><Copy className="h-3.5 w-3.5" /></Button>
              </div>
              <p className="text-[10px] text-amber-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" />Keep this key safe.</p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCloseRevealDialog}>{revealedSecret ? 'Close' : 'Cancel'}</AlertDialogCancel>
            {!revealedSecret && (
              <Button onClick={handleRevealSecret} disabled={revealLoading || !revealPassword.trim()} size="sm" className="gap-1.5">
                {revealLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Verifying...</> : <><ShieldCheck className="h-3.5 w-3.5" />Verify & Reveal</>}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
