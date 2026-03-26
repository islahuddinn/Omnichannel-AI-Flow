// src/services/notification/NotificationSoundService.js
'use client';

/**
 * Notification Sound Service
 * Plays audio notifications for incoming messages (only for manual mode conversations)
 */
class NotificationSoundService {
  constructor() {
    this.messageAudio = null;
    this.notificationAudio = null;
    this.isEnabled = true; // Can be toggled by user settings
    this.volume = 0.7; // Default volume (0.0 - 1.0)
    this.lastPlayedTime = 0;
    this.throttleMs = 1000; // Prevent rapid-fire notifications
    
    // Initialize audio elements
    if (typeof window !== 'undefined') {
      this.messageAudio = new Audio('/sounds/message.mp3');
      this.notificationAudio = new Audio('/sounds/notification.mp3');
      
      // Set default volume
      this.messageAudio.volume = this.volume;
      this.notificationAudio.volume = this.volume;
      
      // Preload audio
      this.messageAudio.preload = 'auto';
      this.notificationAudio.preload = 'auto';
    }
  }

  /**
   * Enable/disable notifications
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  /**
   * Set notification volume
   */
  setVolume(volume) {
    if (volume < 0) volume = 0;
    if (volume > 1) volume = 1;
    this.volume = volume;
    if (this.messageAudio) this.messageAudio.volume = volume;
    if (this.notificationAudio) this.notificationAudio.volume = volume;
  }

  /**
   * Play message notification sound
   * @param {boolean} isManualMode - Only play if conversation mode is 'manual'
   * @param {boolean} isInbound - Only play for inbound messages
   * @param {string} conversationId - Current active conversation ID
   * @param {string} messageConversationId - Conversation ID of the incoming message
   */
  playMessageSound(isManualMode, isInbound, conversationId, messageConversationId) {
    // Only play if enabled
    if (!this.isEnabled) return;
    
    // Only play for manual mode conversations
    if (!isManualMode) return;
    
    // Only play for inbound messages
    if (!isInbound) return;
    
    // Don't play if message is from the currently active conversation (user is viewing it)
    if (conversationId && String(conversationId) === String(messageConversationId)) {
      return;
    }
    
    // Throttle to prevent rapid-fire notifications
    const now = Date.now();
    if (now - this.lastPlayedTime < this.throttleMs) {
      return;
    }
    this.lastPlayedTime = now;
    
    // Play sound
    if (this.messageAudio) {
      this.messageAudio.currentTime = 0; // Reset to start
      this.messageAudio.play().catch(err => {
        // User hasn't interacted with page yet, or audio blocked
        console.warn('Notification sound blocked:', err.message);
      });
    }
  }

  /**
   * Play notification bell sound
   * @param {boolean} isManualMode - Only play if conversation mode is 'manual'
   * @param {boolean} isInbound - Only play for inbound messages
   * @param {string} conversationId - Current active conversation ID
   * @param {string} messageConversationId - Conversation ID of the incoming message
   * @param {boolean} isAIBotEnabled - Whether AI bot is enabled for the company (if true and auto mode, don't play)
   */
  playNotificationSound(isManualMode, isInbound, conversationId, messageConversationId, isAIBotEnabled = false) {
    console.log('🔔 Notification check:', {
      isEnabled: this.isEnabled,
      isManualMode,
      isInbound,
      isAIBotEnabled,
      currentConvId: conversationId,
      messageConvId: messageConversationId,
      isSameConv: conversationId && String(conversationId) === String(messageConversationId)
    });
    
    // Only play if enabled
    if (!this.isEnabled) {
      console.log('🔕 Notifications disabled');
      return;
    }
    
    // ✅ If AI bot is enabled and conversation is in auto mode, don't play notification
    // ✅ If AI bot is disabled, play for all conversation modes (both auto and manual)
    if (isAIBotEnabled && !isManualMode) {
      console.log('🔕 AI Bot enabled and conversation is in auto mode - skipping notification');
      return;
    }
    
    // ✅ Only block auto-mode conversations if AI bot is enabled
    // If AI bot is disabled, allow notifications for all modes
    // (The check above already handles AI bot enabled + auto mode case)
    
    // Only play for inbound messages
    if (!isInbound) {
      console.log('🔕 Not inbound message');
      return;
    }
    
    // Don't play if message is from the currently active conversation (user is viewing it)
    if (conversationId && String(conversationId) === String(messageConversationId)) {
      console.log('🔕 Message from current conversation (user is viewing it)');
      return;
    }
    
    // Throttle to prevent rapid-fire notifications
    const now = Date.now();
    if (now - this.lastPlayedTime < this.throttleMs) {
      console.log('🔕 Throttled (too soon)');
      return;
    }
    this.lastPlayedTime = now;
    
    // Play bell sound
    if (this.notificationAudio) {
      console.log('✅ Playing notification sound');
      this.notificationAudio.currentTime = 0; // Reset to start
      this.notificationAudio.play().catch(err => {
        // User hasn't interacted with page yet, or audio blocked
        console.warn('❌ Notification sound blocked:', err.message);
      });
    } else {
      console.warn('❌ Notification audio not initialized');
    }
  }

  /**
   * Play both sounds (message + notification bell)
   */
  playAllSounds(isManualMode, isInbound, conversationId, messageConversationId) {
    this.playMessageSound(isManualMode, isInbound, conversationId, messageConversationId);
    // Play bell slightly after message sound for better UX
    setTimeout(() => {
      this.playNotificationSound(isManualMode, isInbound, conversationId, messageConversationId);
    }, 300);
  }
}

// Singleton instance
let notificationSoundService = null;

/**
 * Get notification sound service instance
 */
export function getNotificationSoundService() {
  if (typeof window === 'undefined') {
    return null;
  }
  
  if (!notificationSoundService) {
    notificationSoundService = new NotificationSoundService();
  }
  
  return notificationSoundService;
}

export default getNotificationSoundService();

