// src/components/forms/AIPromptSection.jsx
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Bot, Users, Wrench } from 'lucide-react';

export default function AIPromptSection({ 
  customerPrompt = '', 
  handymanPrompt = '', 
  onCustomerPromptChange, 
  onHandymanPromptChange,
  channelName = 'Channel'
}) {
  return (
    <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-950/20 dark:to-gray-900">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <CardTitle className="text-purple-900 dark:text-purple-100">AI Bot Prompts</CardTitle>
        </div>
        <CardDescription>
          Configure AI responses for {channelName}. These prompts guide the AI bot's behavior and responses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Customer Prompt */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <Label htmlFor="customerPrompt" className="text-base font-semibold">
              Customer AI Prompt
            </Label>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Define how the AI should respond to customer inquiries on this channel
          </p>
          <Textarea
            id="customerPrompt"
            value={customerPrompt}
            onChange={(e) => onCustomerPromptChange(e.target.value)}
            placeholder="Example: You are a helpful customer support assistant. Always greet customers warmly, understand their issues, and provide accurate solutions. Be professional, empathetic, and concise in your responses..."
            className="min-h-[150px] resize-y focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            rows={6}
          />
          <p className="text-xs text-gray-500 dark:text-gray-500">
            This prompt guides AI responses for customer conversations
          </p>
        </div>

        {/* Handyman Prompt */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <Label htmlFor="handymanPrompt" className="text-base font-semibold">
              Handyman AI Prompt
            </Label>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Define how the AI should respond to handyman/technician inquiries on this channel
          </p>
          <Textarea
            id="handymanPrompt"
            value={handymanPrompt}
            onChange={(e) => onHandymanPromptChange(e.target.value)}
            placeholder="Example: You are an AI assistant for handymen and technicians. Provide technical guidance, job details, and scheduling information. Be clear, concise, and professional. Help them understand job requirements and provide necessary resources..."
            className="min-h-[150px] resize-y focus:ring-2 focus:ring-orange-500 dark:focus:ring-orange-400"
            rows={6}
          />
          <p className="text-xs text-gray-500 dark:text-gray-500">
            This prompt guides AI responses for handyman conversations
          </p>
        </div>

        <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-4 border border-purple-200 dark:border-purple-800">
          <h4 className="text-sm font-medium text-purple-900 dark:text-purple-100 mb-2">
            💡 Prompt Tips
          </h4>
          <ul className="text-sm text-purple-800 dark:text-purple-200 space-y-1">
            <li>• Be specific about tone and style (professional, friendly, formal)</li>
            <li>• Include guidelines for handling common scenarios</li>
            <li>• Specify what information the AI should prioritize</li>
            <li>• Define boundaries (what the AI should/shouldn't do)</li>
            <li>• No character limit - write as detailed as needed</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

