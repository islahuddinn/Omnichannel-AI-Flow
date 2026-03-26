



/**
 * SocketEmitter - Emit socket events directly via Socket.IO
 * Used by workers and API routes to emit real-time updates
 * ✅ No Redis needed - direct Socket.IO emission (single instance)
 */
class SocketEmitter {
  /**
   * Validate and sanitize data before emission
   */
  static sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return { error: 'Invalid data' };
    }

    try {
      return JSON.parse(JSON.stringify(data));
    } catch (error) {
      console.error('❌ Data serialization failed:', error);
      return { error: 'Serialization failed' };
    }
  }

  /**
   * Core emit function - emits directly to Socket.IO
   * ✅ No Redis pub/sub - direct emission for single instance
   */
  static async emit(room, event, data) {
    try {
      if (!room || typeof room !== 'string') {
        console.error('❌ Invalid room:', room);
        return false;
      }

      if (!event || typeof event !== 'string') {
        console.error('❌ Invalid event:', event);
        return false;
      }

      const safeData = this.sanitizeData(data);

      // ✅ Emit directly via Socket.IO (no Redis needed)
      try {
        const SocketManager = (await import('./SocketManager.js')).default;
        const io = SocketManager.getIO();
        
        if (!io) {
          console.warn('⚠️ Socket.IO not initialized, cannot emit event');
          return false;
        }
        
        const roomSockets = io.sockets.adapter.rooms.get(room);
        const roomSize = roomSockets ? roomSockets.size : 0;
        
        console.log(`📡 SocketEmitter: Emitting directly via Socket.IO to room "${room}"`, {
          roomSize,
          event,
          hasData: !!safeData
        });
        
        // ✅ Emit to main namespace
        io.to(room).emit(event, safeData);
        
        // ✅ CRITICAL: Also emit to WebChat namespace if room starts with 'webchat:'
        // This ensures WebChat visitors receive messages sent from agent/admin panel
        if (room.startsWith('webchat:')) {
          try {
            const webchatNamespace = io.of('/webchat');
            if (webchatNamespace) {
              webchatNamespace.to(room).emit(event, safeData);
              console.log(`✅ SocketEmitter: Also emitted "${event}" to WebChat namespace room "${room}"`);
            }
          } catch (webchatError) {
            console.warn('⚠️ Failed to emit to WebChat namespace:', webchatError.message);
          }
        }
        
        console.log(`✅ SocketEmitter: Event "${event}" emitted to room "${room}" (${roomSize} sockets)`);
        return true;
      } catch (ioError) {
        console.error('❌ SocketEmitter: Failed to emit:', ioError.message);
        return false;
      }

    } catch (error) {
      console.error('❌ Socket emission failed:', error.message);
      return false;
    }
  }

  /**
   * Emit message status update
   * ✅ CRITICAL: Department-based segregation - only emit to department room for agents
   */
  static async emitMessageStatus(conversationId, messageId, status, tenantId, metadata = {}, departmentId = null) {
    if (!conversationId || !messageId || !status) {
      console.error('❌ Missing required parameters for message status');
      return false;
    }

    // ✅ CRITICAL: Ensure IDs are strings for consistent matching
    const eventData = {
      messageId: String(messageId),
      conversationId: String(conversationId),
      status,
      timestamp: new Date().toISOString(),
      ...metadata
    };

    console.log(`📡 Emitting message:status event:`, {
      messageId: eventData.messageId,
      conversationId: eventData.conversationId,
      status: eventData.status,
      tenantId: tenantId ? String(tenantId) : 'none',
      departmentId: departmentId ? String(departmentId) : 'none'
    });

    // ✅ CRITICAL FIX: Emit to all rooms in a SINGLE call using Socket.IO's chained .to()
    // This prevents duplicate events when a user is in multiple rooms (conversation + department + tenant)
    // Socket.IO deduplicates at the socket level — each socket receives the event only ONCE
    try {
      const SocketManager = (await import('./SocketManager.js')).default;
      const io = SocketManager.getIO();

      if (!io) {
        console.warn('⚠️ Socket.IO not initialized, cannot emit message:status');
        return false;
      }

      const safeData = this.sanitizeData(eventData);

      // Build a single chained emission to all relevant rooms
      let emitter = io.to(`conversation:${String(conversationId)}`);

      if (departmentId) {
        const deptIdStr = departmentId.toString ? departmentId.toString() : String(departmentId);
        emitter = emitter.to(`department:${deptIdStr}`);
      }

      if (tenantId) {
        emitter = emitter.to(`tenant:${String(tenantId)}`);
      }

      // Emit once — Socket.IO deduplicates per socket across all chained rooms
      emitter.emit('message:status', safeData);
    } catch (ioError) {
      console.error('❌ Failed to emit message:status:', ioError.message);
      return false;
    }

    // ✅ For WebChat messages, also emit status to WebChat namespace (separate namespace, no duplicate issue)
    if (metadata?.channelType === 'webchat' || metadata?.webchatIdentifier) {
      const webchatIdentifier = metadata.webchatIdentifier || metadata.to;
      if (webchatIdentifier) {
        await this.emit(`webchat:${webchatIdentifier}`, 'message:status', eventData);
      }
    }

    return true;
  }

  /**
   * Emit new message
   * ✅ CRITICAL: Department-based segregation - only emit to department room for agents
   * @param {String|ObjectId} conversationId - The primary conversation ID
   * @param {Object} message - The message object
   * @param {String} tenantId - The tenant ID
   * @param {String|ObjectId} departmentId - The department ID (optional)
   * @param {Array} allGroupedConversationIds - Array of all grouped conversation IDs for company admin unified view (optional)
   */
  static async emitNewMessage(conversationId, message, tenantId, departmentId = null, allGroupedConversationIds = null) {
    if (!conversationId || !message) {
      return false;
    }

    const eventData = {
      message,
      conversationId: String(conversationId),
      timestamp: new Date().toISOString()
    };

    // ✅ CRITICAL FIX: Emit to all rooms in a SINGLE call using Socket.IO's chained .to()
    // This prevents duplicate events when a user is in multiple rooms (conversation + department + tenant)
    // Socket.IO deduplicates at the socket level — each socket receives the event only ONCE
    try {
      const SocketManager = (await import('./SocketManager.js')).default;
      const io = SocketManager.getIO();

      if (!io) {
        console.warn('⚠️ Socket.IO not initialized, cannot emit message:new');
        return false;
      }

      const safeData = this.sanitizeData(eventData);

      // Build a single chained emission to all relevant rooms
      let emitter = io.to(`conversation:${String(conversationId)}`);

      // Include grouped conversation rooms for company admin unified view
      if (allGroupedConversationIds && Array.isArray(allGroupedConversationIds) && allGroupedConversationIds.length > 1) {
        const primaryConvIdStr = String(conversationId);
        for (const groupedConvId of allGroupedConversationIds) {
          const groupedConvIdStr = String(groupedConvId);
          if (groupedConvIdStr !== primaryConvIdStr) {
            emitter = emitter.to(`conversation:${groupedConvIdStr}`);
          }
        }
      }

      if (departmentId) {
        const deptIdStr = departmentId.toString ? departmentId.toString() : String(departmentId);
        emitter = emitter.to(`department:${deptIdStr}`);
      }

      if (tenantId) {
        emitter = emitter.to(`tenant:${String(tenantId)}`);
      }

      // Emit once — Socket.IO deduplicates per socket across all chained rooms
      emitter.emit('message:new', safeData);
    } catch (ioError) {
      console.error('❌ Failed to emit message:new:', ioError.message);
      return false;
    }
    
    // ✅ CRITICAL: For WebChat messages, also emit to WebChat namespace
    // This ensures WebChat visitors receive messages sent from agent/admin panel
    if (message.channel === 'webchat' && message.direction === 'outbound') {
      const webchatIdentifier = message.to || message.contact?.identifiers?.webchat;
      if (webchatIdentifier) {
        // ✅ Emit to WebChat namespace directly (not via main namespace)
        try {
          const SocketManager = (await import('./SocketManager.js')).default;
          const io = SocketManager.getIO();
          if (io) {
            const webchatNamespace = io.of('/webchat');
            if (webchatNamespace) {
              const roomName = `webchat:${webchatIdentifier}`;
              
              // ✅ Try to get room size (may not be available in all adapters)
              let roomSize = 0;
              try {
                if (webchatNamespace.adapter?.rooms) {
                  const room = webchatNamespace.adapter.rooms.get(roomName);
                  roomSize = room ? room.size : 0;
                }
              } catch (e) {
                // Room size check is optional
              }
              
              // ✅ CRITICAL: Normalize attachments for voice messages before emitting
              const normalizedMessage = {
                ...message,
                attachments: (message.attachments || []).map(att => {
                  if (att.type === 'audio' || att.mimeType?.startsWith('audio/')) {
                    return {
                      ...att,
                      type: att.type || 'audio',
                      url: att.url || att.path || att.fileUrl,
                      duration: att.duration || 0,
                      size: att.size || 0,
                      mimeType: att.mimeType || 'audio/mpeg',
                      name: att.name || 'Voice message',
                    };
                  }
                  return att;
                }),
                // ✅ CRITICAL: Ensure replyTo is included for replies
                replyTo: message.replyTo || null
              };
              
              const normalizedEventData = {
                ...eventData,
                message: normalizedMessage
              };
              
              // ✅ Emit to WebChat namespace
              webchatNamespace.to(roomName).emit('message:new', normalizedEventData);
              
              console.log(`✅ SocketEmitter: Emitted message:new to WebChat namespace room "${roomName}"`, {
                roomSize,
                messageId: message._id,
                hasAttachments: (normalizedMessage.attachments || []).length > 0,
                attachmentCount: (normalizedMessage.attachments || []).length,
                attachmentTypes: (normalizedMessage.attachments || []).map(a => a.type || a.mimeType || 'unknown')
              });
              
              if (roomSize === 0) {
                console.warn('⚠️ SocketEmitter: No sockets in WebChat room:', {
                  roomName,
                  webchatIdentifier,
                  messageId: message._id,
                  suggestion: 'WebChat client may not be connected or has not joined this room. Check if socket is connected and has joined webchat:${webchatIdentifier}'
                });
              }
            }
          }
        } catch (webchatError) {
          console.error('❌ Failed to emit to WebChat namespace:', webchatError);
        }
      }
    }

    return true;
  }

  /**
   * Emit message reaction (WhatsApp)
   */
  static async emitMessageReaction(conversationId, messageId, emoji, userId, tenantId, userName = null, contactName = null, departmentId = null) {
    if (!conversationId || !messageId) {
      console.error('❌ Missing required parameters for message reaction');
      return false;
    }

    const eventData = {
      conversationId: String(conversationId),
      messageId: String(messageId),
      reaction: emoji,
      userId: userId ? String(userId) : null,
      userName: userName || null,
      contactName: contactName || null,
      timestamp: new Date().toISOString()
    };

    try {
      const SocketManager = (await import('./SocketManager.js')).default;
      const io = SocketManager.getIO();

      if (!io) {
        console.warn('⚠️ Socket.IO not initialized, cannot emit message:reaction');
        return false;
      }

      const safeData = this.sanitizeData(eventData);

      // Emit to all relevant rooms: conversation + department + tenant
      let emitter = io.to(`conversation:${String(conversationId)}`);
      if (departmentId) {
        emitter = emitter.to(`department:${String(departmentId)}`);
      }
      if (tenantId) {
        emitter = emitter.to(`tenant:${String(tenantId)}`);
      }
      emitter.emit('message:reaction', safeData);
      console.log(`[SocketEmitter] message:reaction emitted to conv:${conversationId}, dept:${departmentId || 'none'}, tenant:${tenantId || 'none'}`);

      // Also emit to WebChat namespace
      try {
        const webchatNamespace = io.of('/webchat');
        if (webchatNamespace) {
          webchatNamespace.to(`conversation:${String(conversationId)}`).emit('message:reaction', safeData);
        }
      } catch (webchatError) {
        // Non-critical
      }
    } catch (ioError) {
      console.error('❌ Failed to emit message:reaction:', ioError.message);
      return false;
    }

    return true;
  }

  /**
   * Emit conversation update
   * ✅ CRITICAL: Department-based segregation - only emit to department room for agents
   * @param {String|ObjectId} conversationId - The primary conversation ID
   * @param {Object} update - The update object
   * @param {String} tenantId - The tenant ID
   * @param {String|ObjectId} departmentId - The department ID (optional)
   * @param {Array} allGroupedConversationIds - Array of all grouped conversation IDs for company admin unified view (optional)
   */
  static async emitConversationUpdate(conversationId, update, tenantId, departmentId = null, allGroupedConversationIds = null) {
    if (!conversationId || !update) {
      console.error('❌ Missing required parameters for conversation update');
      return false;
    }

    // ✅ Ensure all date fields are properly formatted
    const formattedUpdate = {
      ...update,
      // ✅ Format lastMessageAt if it's a Date object
      lastMessageAt: update.lastMessageAt 
        ? (update.lastMessageAt instanceof Date ? update.lastMessageAt.toISOString() : update.lastMessageAt)
        : undefined,
      // ✅ Format updatedAt if it's a Date object
      updatedAt: update.updatedAt 
        ? (update.updatedAt instanceof Date ? update.updatedAt.toISOString() : update.updatedAt)
        : new Date().toISOString(),
      // ✅ Ensure lastMessage is a string
      lastMessage: update.lastMessage !== undefined ? String(update.lastMessage) : undefined,
      // ✅ Ensure unreadCount is included if it's part of the update
      unreadCount: update.unreadCount !== undefined ? update.unreadCount : undefined,
      // ✅ Ensure messageCount is included if it's part of the update
      messageCount: update.messageCount !== undefined ? update.messageCount : undefined,
      // ✅ Ensure mode is included if it's part of the update (for auto/manual mode switching)
      mode: update.mode !== undefined ? update.mode : undefined,
    };

    const eventData = {
      conversationId: String(conversationId),
      update: formattedUpdate,
      timestamp: new Date().toISOString()
    };

    console.log(`📢 SocketEmitter.emitConversationUpdate - Emitting`, {
      conversationId: String(conversationId),
      tenantId: tenantId ? String(tenantId) : 'none',
      departmentId: departmentId ? String(departmentId) : 'none',
      updateKeys: Object.keys(formattedUpdate),
      hasLastMessage: !!formattedUpdate.lastMessage,
      hasLastMessageAt: !!formattedUpdate.lastMessageAt,
      hasLastMessageContent: !!formattedUpdate.lastMessageContent,
      hasUnreadCount: formattedUpdate.unreadCount !== undefined,
      hasMessageCount: formattedUpdate.messageCount !== undefined,
      hasMode: formattedUpdate.mode !== undefined,
      mode: formattedUpdate.mode,
    });

    // ✅ CRITICAL FIX: Emit to all rooms in a SINGLE call using Socket.IO's chained .to()
    // This prevents duplicate events when a user is in multiple rooms
    try {
      const SocketManager = (await import('./SocketManager.js')).default;
      const io = SocketManager.getIO();

      if (!io) {
        console.warn('⚠️ Socket.IO not initialized, cannot emit conversation:update');
        return false;
      }

      const safeData = this.sanitizeData(eventData);

      let emitter = io.to(`conversation:${String(conversationId)}`);

      // Include grouped conversation rooms for company admin unified view
      if (allGroupedConversationIds && Array.isArray(allGroupedConversationIds) && allGroupedConversationIds.length > 1) {
        const primaryConvIdStr = String(conversationId);
        for (const groupedConvId of allGroupedConversationIds) {
          const groupedConvIdStr = String(groupedConvId);
          if (groupedConvIdStr !== primaryConvIdStr) {
            emitter = emitter.to(`conversation:${groupedConvIdStr}`);
          }
        }
      }

      if (departmentId) {
        const deptIdStr = departmentId.toString ? departmentId.toString() : String(departmentId);
        emitter = emitter.to(`department:${deptIdStr}`);
      }

      if (tenantId) {
        emitter = emitter.to(`tenant:${String(tenantId)}`);
      }

      emitter.emit('conversation:update', safeData);
    } catch (ioError) {
      console.error('❌ Failed to emit conversation:update:', ioError.message);
      return false;
    }

    return true;
  }

  /**
   * Emit new conversation created
   * ✅ CRITICAL: Department-based segregation - only emit to department room for agents
   */
  static async emitNewConversation(tenantId, conversation, message, contact, departmentId = null) {
    if (!tenantId || !conversation) {
      console.error('❌ Missing required parameters for new conversation');
      return false;
    }

    const eventData = {
      conversation,
      message,
      contact,
      timestamp: new Date().toISOString()
    };

    console.log(`📢 SocketEmitter.emitNewConversation - Emitting`, {
      conversationId: conversation._id,
      tenantId: tenantId ? String(tenantId) : 'none',
      departmentId: departmentId ? String(departmentId) : 'none',
      hasMessage: !!message,
      hasContact: !!contact,
      eventDataKeys: Object.keys(eventData)
    });

    // ✅ CRITICAL FIX: Emit to all rooms in a SINGLE call using Socket.IO's chained .to()
    try {
      const SocketManager = (await import('./SocketManager.js')).default;
      const io = SocketManager.getIO();

      if (!io) {
        console.warn('⚠️ Socket.IO not initialized, cannot emit conversation:new');
        return false;
      }

      const safeData = this.sanitizeData(eventData);

      let emitter = io.to(`tenant:${String(tenantId)}`);

      if (departmentId) {
        const deptIdStr = departmentId.toString ? departmentId.toString() : String(departmentId);
        emitter = emitter.to(`department:${deptIdStr}`);
      }

      emitter.emit('conversation:new', safeData);
      return true;
    } catch (ioError) {
      console.error('❌ Failed to emit conversation:new:', ioError.message);
      return false;
    }
  }

  /**
   * Emit conversation archived
   */
  static async emitConversationArchived(conversationId, tenantId) {
    const eventData = {
      conversationId,
      timestamp: new Date().toISOString()
    };

    await this.emit(`conversation:${conversationId}`, 'conversation:archived', eventData);
    
    if (tenantId) {
      await this.emit(`tenant:${tenantId}`, 'conversation:archived', eventData);
    }

    return true;
  }

  /**
   * Emit conversation unarchived
   */
  static async emitConversationUnarchived(conversationId, tenantId) {
    const eventData = {
      conversationId,
      timestamp: new Date().toISOString()
    };

    await this.emit(`conversation:${conversationId}`, 'conversation:unarchived', eventData);
    
    if (tenantId) {
      await this.emit(`tenant:${tenantId}`, 'conversation:unarchived', eventData);
    }

    return true;
  }

  /**
   * Emit conversation pinned
   */
  static async emitConversationPinned(conversationId, tenantId) {
    const eventData = {
      conversationId,
      timestamp: new Date().toISOString()
    };

    await this.emit(`conversation:${conversationId}`, 'conversation:pinned', eventData);
    
    if (tenantId) {
      await this.emit(`tenant:${tenantId}`, 'conversation:pinned', eventData);
    }

    return true;
  }

  /**
   * Emit conversation unpinned
   */
  static async emitConversationUnpinned(conversationId, tenantId) {
    const eventData = {
      conversationId,
      timestamp: new Date().toISOString()
    };

    await this.emit(`conversation:${conversationId}`, 'conversation:unpinned', eventData);
    
    if (tenantId) {
      await this.emit(`tenant:${tenantId}`, 'conversation:unpinned', eventData);
    }

    return true;
  }

  /**
   * Emit reaction added
   */
  static async emitReactionAdded(conversationId, messageId, reaction, tenantId) {
    if (!conversationId || !messageId || !reaction) {
      console.error('❌ Missing required parameters for reaction');
      return false;
    }

    const eventData = {
      messageId,
      conversationId,
      reaction,
      timestamp: new Date().toISOString()
    };

    await this.emit(`conversation:${conversationId}`, 'message:reaction:added', eventData);
    
    if (tenantId) {
      await this.emit(`tenant:${tenantId}`, 'message:reaction:added', eventData);
    }

    return true;
  }

  /**
   * Emit reaction removed
   */
  static async emitReactionRemoved(conversationId, messageId, userId, emoji, tenantId) {
    if (!conversationId || !messageId || !userId || !emoji) {
      console.error('❌ Missing required parameters for reaction removal');
      return false;
    }

    const eventData = {
      messageId,
      conversationId,
      userId,
      emoji,
      timestamp: new Date().toISOString()
    };

    await this.emit(`conversation:${conversationId}`, 'message:reaction:removed', eventData);
    
    if (tenantId) {
      await this.emit(`tenant:${tenantId}`, 'message:reaction:removed', eventData);
    }

    return true;
  }

  /**
   * Emit typing indicator
   */
  static async emitTyping(conversationId, userId, isTyping, tenantId) {
    const eventData = {
      conversationId,
      userId,
      isTyping,
      timestamp: new Date().toISOString()
    };

    await this.emit(`conversation:${conversationId}`, 'typing', eventData);
    
    if (tenantId) {
      await this.emit(`tenant:${tenantId}`, 'typing', eventData);
    }

    return true;
  }

  /**
   * Emit presence update
   */
  static async emitPresence(userId, status, tenantId) {
    const eventData = {
      userId,
      status,
      timestamp: new Date().toISOString()
    };

    if (tenantId) {
      await this.emit(`tenant:${tenantId}`, 'presence:update', eventData);
    }

    return true;
  }

  /**
   * Emit conversation statistics update
   * @param {String|ObjectId} conversationId - The conversation ID
   * @param {Object} messageStats - The message statistics object
   * @param {String} tenantId - The tenant ID
   * @param {String|ObjectId} departmentId - The department ID (optional)
   */
  static async emitConversationStatsUpdate(conversationId, messageStats, tenantId, departmentId = null) {
    if (!conversationId || !messageStats) {
      return false;
    }

    const eventData = {
      conversationId: String(conversationId),
      messageStats: this.sanitizeData(messageStats),
      timestamp: new Date().toISOString()
    };

    // ✅ Emit to conversation room
    await this.emit(`conversation:${conversationId}`, 'conversation:stats:update', eventData);
    
    // ✅ Emit to department room if provided
    if (departmentId) {
      const deptIdStr = departmentId.toString ? departmentId.toString() : String(departmentId);
      await this.emit(`department:${deptIdStr}`, 'conversation:stats:update', eventData);
    }
    
    // ✅ Emit to tenant room
    if (tenantId) {
      await this.emit(`tenant:${tenantId}`, 'conversation:stats:update', eventData);
    }

    return true;
  }
}

export default SocketEmitter;