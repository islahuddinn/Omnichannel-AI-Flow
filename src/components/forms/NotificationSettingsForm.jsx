// src/components/forms/NotificationSettingsForm.jsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function NotificationSettingsForm({ onSubmit, isLoading, onCancel }) {
  const [settings, setSettings] = useState({
    email: true,
    push: true,
    sound: true
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(settings);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Notification Preferences</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Email Notifications</Label>
            <Switch checked={settings.email} onCheckedChange={(v) => setSettings({...settings, email: v})} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Push Notifications</Label>
            <Switch checked={settings.push} onCheckedChange={(v) => setSettings({...settings, push: v})} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Sound</Label>
            <Switch checked={settings.sound} onCheckedChange={(v) => setSettings({...settings, sound: v})} />
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" disabled={isLoading}>{isLoading ? 'Saving...' : 'Save'}</Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}