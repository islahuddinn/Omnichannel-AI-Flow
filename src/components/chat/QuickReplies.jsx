// src/components/chat/QuickReplies.jsx
'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MessageSquare, 
  Image, 
  FileText, 
  Video, 
  Music, 
  MapPin, 
  User, 
  Smile,
  Send,
  Plus,
  X
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function QuickReplies({ 
  conversationId, 
  channelAccountId, 
  onMessageSent,
  disabled = false 
}) {
  const [activeTab, setActiveTab] = useState('text');
  const [isOpen, setIsOpen] = useState(false);

  // Text message state
  const [textMessage, setTextMessage] = useState('');
  
  // Media message states
  const [imageUrl, setImageUrl] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentFilename, setDocumentFilename] = useState('');
  const [documentCaption, setDocumentCaption] = useState('');
  
  const [audioUrl, setAudioUrl] = useState('');
  
  const [videoUrl, setVideoUrl] = useState('');
  const [videoCaption, setVideoCaption] = useState('');
  
  // Location message state
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  
  // Contact message state
  const [contacts, setContacts] = useState([{
    name: '',
    phone: ''
  }]);
  
  // Interactive message state
  const [interactiveType, setInteractiveType] = useState('button');
  const [interactiveBody, setInteractiveBody] = useState('');
  const [interactiveFooter, setInteractiveFooter] = useState('');
  const [buttons, setButtons] = useState([{ id: 1, text: '' }]);
  const [sections, setSections] = useState([{ 
    id: 1, 
    title: '', 
    rows: [{ id: 1, title: '', description: '' }] 
  }]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (data) => apiClient.post('/messages/send', data),
    onSuccess: (response) => {
      resetAllForms();
      setIsOpen(false);
      onMessageSent(response.data);
      toast.success('Message sent successfully');
    },
    onError: (error) => {
      const errorData = error.response?.data;
      if (errorData?.requiresTemplate) {
        toast.error('Template message required for this conversation');
      } else {
        toast.error(errorData?.message || error.message || 'Failed to send message');
      }
    }
  });

  // Reset all form states
  const resetAllForms = () => {
    setTextMessage('');
    setImageUrl('');
    setImageCaption('');
    setDocumentUrl('');
    setDocumentFilename('');
    setDocumentCaption('');
    setAudioUrl('');
    setVideoUrl('');
    setVideoCaption('');
    setLatitude('');
    setLongitude('');
    setLocationName('');
    setLocationAddress('');
    setContacts([{ name: '', phone: '' }]);
    setInteractiveBody('');
    setInteractiveFooter('');
    setButtons([{ id: 1, text: '' }]);
    setSections([{ id: 1, title: '', rows: [{ id: 1, title: '', description: '' }] }]);
  };

  // Send text message
  const sendTextMessage = () => {
    if (!textMessage.trim()) {
      toast.error('Please enter a message');
      return;
    }

    const messageData = {
      conversationId,
      channelAccountId,
      content: {
        type: 'text',
        text: textMessage.trim()
      }
    };

    sendMessageMutation.mutate(messageData);
  };

  // Send image message
  const sendImageMessage = () => {
    if (!imageUrl.trim()) {
      toast.error('Please enter image URL');
      return;
    }

    const messageData = {
      conversationId,
      channelAccountId,
      content: {
        type: 'image',
        url: imageUrl.trim(),
        caption: imageCaption.trim()
      }
    };

    sendMessageMutation.mutate(messageData);
  };

  // Send document message
  const sendDocumentMessage = () => {
    if (!documentUrl.trim()) {
      toast.error('Please enter document URL');
      return;
    }

    const messageData = {
      conversationId,
      channelAccountId,
      content: {
        type: 'document',
        url: documentUrl.trim(),
        filename: documentFilename.trim() || 'document.pdf',
        caption: documentCaption.trim()
      }
    };

    sendMessageMutation.mutate(messageData);
  };

  // Send audio message
  const sendAudioMessage = () => {
    if (!audioUrl.trim()) {
      toast.error('Please enter audio URL');
      return;
    }

    const messageData = {
      conversationId,
      channelAccountId,
      content: {
        type: 'audio',
        url: audioUrl.trim()
      }
    };

    sendMessageMutation.mutate(messageData);
  };

  // Send video message
  const sendVideoMessage = () => {
    if (!videoUrl.trim()) {
      toast.error('Please enter video URL');
      return;
    }

    const messageData = {
      conversationId,
      channelAccountId,
      content: {
        type: 'video',
        url: videoUrl.trim(),
        caption: videoCaption.trim()
      }
    };

    sendMessageMutation.mutate(messageData);
  };

  // Send location message
  const sendLocationMessage = () => {
    if (!latitude.trim() || !longitude.trim()) {
      toast.error('Please enter latitude and longitude');
      return;
    }

    const messageData = {
      conversationId,
      channelAccountId,
      content: {
        type: 'location',
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        name: locationName.trim(),
        address: locationAddress.trim()
      }
    };

    sendMessageMutation.mutate(messageData);
  };

  // Send contact message
  const sendContactMessage = () => {
    const validContacts = contacts.filter(contact => 
      contact.name.trim() && contact.phone.trim()
    );

    if (validContacts.length === 0) {
      toast.error('Please add at least one contact with name and phone');
      return;
    }

    const messageData = {
      conversationId,
      channelAccountId,
      content: {
        type: 'contact',
        contacts: validContacts.map(contact => ({
          name: {
            formatted_name: contact.name.trim()
          },
          phones: [{
            phone: contact.phone.trim(),
            type: 'CELL'
          }]
        }))
      }
    };

    sendMessageMutation.mutate(messageData);
  };

  // Send interactive message
  const sendInteractiveMessage = () => {
    if (!interactiveBody.trim()) {
      toast.error('Please enter message body');
      return;
    }

    let interactiveData = {
      type: interactiveType,
      body: {
        text: interactiveBody.trim()
      }
    };

    if (interactiveFooter.trim()) {
      interactiveData.footer = {
        text: interactiveFooter.trim()
      };
    }

    if (interactiveType === 'button') {
      const validButtons = buttons.filter(button => button.text.trim());
      if (validButtons.length === 0) {
        toast.error('Please add at least one button');
        return;
      }

      interactiveData.action = {
        buttons: validButtons.map((button, index) => ({
          type: 'reply',
          reply: {
            id: `btn_${index + 1}`,
            title: button.text.trim().substring(0, 20) // WhatsApp limit
          }
        }))
      };
    } else if (interactiveType === 'list') {
      const validSections = sections.filter(section => 
        section.title.trim() && section.rows.some(row => row.title.trim())
      );

      if (validSections.length === 0) {
        toast.error('Please add at least one section with rows');
        return;
      }

      interactiveData.action = {
        button: 'View Options',
        sections: validSections.map(section => ({
          title: section.title.trim(),
          rows: section.rows.filter(row => row.title.trim()).map((row, index) => ({
            id: `row_${section.id}_${index + 1}`,
            title: row.title.trim().substring(0, 24), // WhatsApp limit
            description: row.description.trim().substring(0, 72) // WhatsApp limit
          }))
        }))
      };
    }

    const messageData = {
      conversationId,
      channelAccountId,
      content: {
        type: 'interactive',
        interactiveData
      }
    };

    sendMessageMutation.mutate(messageData);
  };

  // Contact management
  const addContact = () => {
    setContacts(prev => [...prev, { name: '', phone: '' }]);
  };

  const updateContact = (index, field, value) => {
    setContacts(prev => prev.map((contact, i) => 
      i === index ? { ...contact, [field]: value } : contact
    ));
  };

  const removeContact = (index) => {
    setContacts(prev => prev.filter((_, i) => i !== index));
  };

  // Button management for interactive messages
  const addButton = () => {
    if (buttons.length >= 3) { // WhatsApp limit
      toast.error('Maximum 3 buttons allowed');
      return;
    }
    setButtons(prev => [...prev, { id: Date.now(), text: '' }]);
  };

  const updateButton = (id, text) => {
    setButtons(prev => prev.map(button => 
      button.id === id ? { ...button, text } : button
    ));
  };

  const removeButton = (id) => {
    setButtons(prev => prev.filter(button => button.id !== id));
  };

  // Section management for list messages
  const addSection = () => {
    if (sections.length >= 10) { // WhatsApp limit
      toast.error('Maximum 10 sections allowed');
      return;
    }
    setSections(prev => [...prev, { 
      id: Date.now(), 
      title: '', 
      rows: [{ id: Date.now() + 1, title: '', description: '' }] 
    }]);
  };

  const updateSection = (sectionId, field, value) => {
    setSections(prev => prev.map(section => 
      section.id === sectionId ? { ...section, [field]: value } : section
    ));
  };

  const removeSection = (sectionId) => {
    setSections(prev => prev.filter(section => section.id !== sectionId));
  };

  // Row management for list sections
  const addRow = (sectionId) => {
    setSections(prev => prev.map(section => 
      section.id === sectionId 
        ? { 
            ...section, 
            rows: [...section.rows, { id: Date.now(), title: '', description: '' }]
          }
        : section
    ));
  };

  const updateRow = (sectionId, rowId, field, value) => {
    setSections(prev => prev.map(section => 
      section.id === sectionId 
        ? {
            ...section,
            rows: section.rows.map(row =>
              row.id === rowId ? { ...row, [field]: value } : row
            )
          }
        : section
    ));
  };

  const removeRow = (sectionId, rowId) => {
    setSections(prev => prev.map(section => 
      section.id === sectionId 
        ? {
            ...section,
            rows: section.rows.filter(row => row.id !== rowId)
          }
        : section
    ));
  };

  const isLoading = sendMessageMutation.isPending;

  if (!isOpen) {
    return (
      <div className="fixed bottom-20 right-4 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          size="lg"
          className="rounded-full w-14 h-14 shadow-lg"
          disabled={disabled}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Quick Replies</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setIsOpen(false);
              resetAllForms();
            }}
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-4 mb-4">
              <TabsTrigger value="text" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Text
              </TabsTrigger>
              <TabsTrigger value="media" className="flex items-center gap-2">
                <Image className="h-4 w-4" />
                Media
              </TabsTrigger>
              <TabsTrigger value="location" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location
              </TabsTrigger>
              <TabsTrigger value="interactive" className="flex items-center gap-2">
                <Smile className="h-4 w-4" />
                Interactive
              </TabsTrigger>
            </TabsList>

            {/* Text Message Tab */}
            <TabsContent value="text">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="text-message">Message</Label>
                  <Textarea
                    id="text-message"
                    value={textMessage}
                    onChange={(e) => setTextMessage(e.target.value)}
                    placeholder="Enter your message..."
                    rows={4}
                    disabled={isLoading}
                  />
                </div>
                <Button 
                  onClick={sendTextMessage}
                  disabled={!textMessage.trim() || isLoading}
                  className="w-full"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {isLoading ? 'Sending...' : 'Send Text Message'}
                </Button>
              </div>
            </TabsContent>

            {/* Media Message Tab */}
            <TabsContent value="media">
              <Tabs defaultValue="image" className="w-full">
                <TabsList className="grid grid-cols-4 mb-4">
                  <TabsTrigger value="image">Image</TabsTrigger>
                  <TabsTrigger value="document">Document</TabsTrigger>
                  <TabsTrigger value="audio">Audio</TabsTrigger>
                  <TabsTrigger value="video">Video</TabsTrigger>
                </TabsList>

                {/* Image Message */}
                <TabsContent value="image">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="image-url">Image URL *</Label>
                      <Input
                        id="image-url"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="https://example.com/image.jpg"
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <Label htmlFor="image-caption">Caption (Optional)</Label>
                      <Input
                        id="image-caption"
                        value={imageCaption}
                        onChange={(e) => setImageCaption(e.target.value)}
                        placeholder="Enter caption..."
                        disabled={isLoading}
                      />
                    </div>
                    <Button 
                      onClick={sendImageMessage}
                      disabled={!imageUrl.trim() || isLoading}
                      className="w-full"
                    >
                      <Image className="h-4 w-4 mr-2" />
                      {isLoading ? 'Sending...' : 'Send Image'}
                    </Button>
                  </div>
                </TabsContent>

                {/* Document Message */}
                <TabsContent value="document">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="document-url">Document URL *</Label>
                      <Input
                        id="document-url"
                        value={documentUrl}
                        onChange={(e) => setDocumentUrl(e.target.value)}
                        placeholder="https://example.com/document.pdf"
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <Label htmlFor="document-filename">Filename (Optional)</Label>
                      <Input
                        id="document-filename"
                        value={documentFilename}
                        onChange={(e) => setDocumentFilename(e.target.value)}
                        placeholder="document.pdf"
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <Label htmlFor="document-caption">Caption (Optional)</Label>
                      <Input
                        id="document-caption"
                        value={documentCaption}
                        onChange={(e) => setDocumentCaption(e.target.value)}
                        placeholder="Enter caption..."
                        disabled={isLoading}
                      />
                    </div>
                    <Button 
                      onClick={sendDocumentMessage}
                      disabled={!documentUrl.trim() || isLoading}
                      className="w-full"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      {isLoading ? 'Sending...' : 'Send Document'}
                    </Button>
                  </div>
                </TabsContent>

                {/* Audio Message */}
                <TabsContent value="audio">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="audio-url">Audio URL *</Label>
                      <Input
                        id="audio-url"
                        value={audioUrl}
                        onChange={(e) => setAudioUrl(e.target.value)}
                        placeholder="https://example.com/audio.mp3"
                        disabled={isLoading}
                      />
                    </div>
                    <Button 
                      onClick={sendAudioMessage}
                      disabled={!audioUrl.trim() || isLoading}
                      className="w-full"
                    >
                      <Music className="h-4 w-4 mr-2" />
                      {isLoading ? 'Sending...' : 'Send Audio'}
                    </Button>
                  </div>
                </TabsContent>

                {/* Video Message */}
                <TabsContent value="video">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="video-url">Video URL *</Label>
                      <Input
                        id="video-url"
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        placeholder="https://example.com/video.mp4"
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <Label htmlFor="video-caption">Caption (Optional)</Label>
                      <Input
                        id="video-caption"
                        value={videoCaption}
                        onChange={(e) => setVideoCaption(e.target.value)}
                        placeholder="Enter caption..."
                        disabled={isLoading}
                      />
                    </div>
                    <Button 
                      onClick={sendVideoMessage}
                      disabled={!videoUrl.trim() || isLoading}
                      className="w-full"
                    >
                      <Video className="h-4 w-4 mr-2" />
                      {isLoading ? 'Sending...' : 'Send Video'}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Location Message Tab */}
            <TabsContent value="location">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="latitude">Latitude *</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="any"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      placeholder="40.7128"
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <Label htmlFor="longitude">Longitude *</Label>
                    <Input
                      id="longitude"
                      type="number"
                      step="any"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      placeholder="-74.0060"
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="location-name">Location Name (Optional)</Label>
                  <Input
                    id="location-name"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="New York City"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="location-address">Address (Optional)</Label>
                  <Input
                    id="location-address"
                    value={locationAddress}
                    onChange={(e) => setLocationAddress(e.target.value)}
                    placeholder="123 Main Street, New York, NY"
                    disabled={isLoading}
                  />
                </div>
                <Button 
                  onClick={sendLocationMessage}
                  disabled={!latitude.trim() || !longitude.trim() || isLoading}
                  className="w-full"
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  {isLoading ? 'Sending...' : 'Send Location'}
                </Button>
              </div>
            </TabsContent>

            {/* Interactive Message Tab */}
            <TabsContent value="interactive">
              <Tabs defaultValue="button" className="w-full">
                <TabsList className="grid grid-cols-2 mb-4">
                  <TabsTrigger value="button">Buttons</TabsTrigger>
                  <TabsTrigger value="list">List</TabsTrigger>
                </TabsList>

                {/* Button Message */}
                <TabsContent value="button">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="button-body">Message Body *</Label>
                      <Textarea
                        id="button-body"
                        value={interactiveBody}
                        onChange={(e) => setInteractiveBody(e.target.value)}
                        placeholder="Choose an option:"
                        rows={3}
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <Label htmlFor="button-footer">Footer (Optional)</Label>
                      <Input
                        id="button-footer"
                        value={interactiveFooter}
                        onChange={(e) => setInteractiveFooter(e.target.value)}
                        placeholder="Additional information..."
                        disabled={isLoading}
                      />
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Buttons (Max 3)</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addButton}
                          disabled={buttons.length >= 3 || isLoading}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Button
                        </Button>
                      </div>
                      
                      {buttons.map((button, index) => (
                        <div key={button.id} className="flex items-center gap-2">
                          <Input
                            value={button.text}
                            onChange={(e) => updateButton(button.id, e.target.value)}
                            placeholder={`Button ${index + 1} text`}
                            disabled={isLoading}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeButton(button.id)}
                            disabled={isLoading || buttons.length === 1}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <Button 
                      onClick={sendInteractiveMessage}
                      disabled={!interactiveBody.trim() || buttons.every(b => !b.text.trim()) || isLoading}
                      className="w-full"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {isLoading ? 'Sending...' : 'Send Interactive Message'}
                    </Button>
                  </div>
                </TabsContent>

                {/* List Message */}
                <TabsContent value="list">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="list-body">Message Body *</Label>
                      <Textarea
                        id="list-body"
                        value={interactiveBody}
                        onChange={(e) => setInteractiveBody(e.target.value)}
                        placeholder="Choose from the list:"
                        rows={3}
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <Label htmlFor="list-footer">Footer (Optional)</Label>
                      <Input
                        id="list-footer"
                        value={interactiveFooter}
                        onChange={(e) => setInteractiveFooter(e.target.value)}
                        placeholder="Additional information..."
                        disabled={isLoading}
                      />
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Sections (Max 10)</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addSection}
                          disabled={sections.length >= 10 || isLoading}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Section
                        </Button>
                      </div>
                      
                      {sections.map((section, sectionIndex) => (
                        <div key={section.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Input
                              value={section.title}
                              onChange={(e) => updateSection(section.id, 'title', e.target.value)}
                              placeholder={`Section ${sectionIndex + 1} title`}
                              disabled={isLoading}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeSection(section.id)}
                              disabled={isLoading || sections.length === 1}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm">Rows</Label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addRow(section.id)}
                                disabled={isLoading}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Add Row
                              </Button>
                            </div>
                            
                            {section.rows.map((row, rowIndex) => (
                              <div key={row.id} className="flex items-center gap-2">
                                <div className="flex-1 grid grid-cols-2 gap-2">
                                  <Input
                                    value={row.title}
                                    onChange={(e) => updateRow(section.id, row.id, 'title', e.target.value)}
                                    placeholder={`Row ${rowIndex + 1} title`}
                                    disabled={isLoading}
                                  />
                                  <Input
                                    value={row.description}
                                    onChange={(e) => updateRow(section.id, row.id, 'description', e.target.value)}
                                    placeholder="Description (optional)"
                                    disabled={isLoading}
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeRow(section.id, row.id)}
                                  disabled={isLoading || section.rows.length === 1}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button 
                      onClick={sendInteractiveMessage}
                      disabled={!interactiveBody.trim() || sections.every(s => !s.title.trim() || s.rows.every(r => !r.title.trim())) || isLoading}
                      className="w-full"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {isLoading ? 'Sending...' : 'Send List Message'}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>   
    </div>
  );
}