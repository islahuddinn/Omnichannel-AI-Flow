// src/app/api/conversations/[conversationId]/mode/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import ConversationSchema from '@/models/schemas/Conversation';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import SocketEmitter from '@/services/socket/SocketEmitter';

export async function PATCH(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    
    const body = await request.json();
    const { mode } = body;

    if (!mode || !['manual', 'auto'].includes(mode)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mode. Must be "manual" or "auto"' },
        { status: 400 }
      );
    }

    // ✅ Get conversation with department info to check AI bot enabled status
    const conversation = await Conversation.findById(conversationId)
      .populate('department', 'aiBotEnabled name')
      .lean();

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // ✅ If trying to switch to auto mode, check if department AI bot is enabled
    if (mode === 'auto' && conversation.department) {
      const department = conversation.department;
      // Handle both populated object and ObjectId
      const aiBotEnabled = typeof department === 'object' && department !== null
        ? department.aiBotEnabled
        : null;

      // If department exists but aiBotEnabled is not true, prevent switching to auto mode
      if (aiBotEnabled !== true) {
        const departmentName = typeof department === 'object' && department !== null
          ? department.name
          : 'this department';
        
        return NextResponse.json(
          { 
            success: false, 
            error: `Cannot switch to Auto mode. AI Bot is not enabled for ${departmentName}. Please enable AI Bot for this department first.` 
          },
          { status: 400 }
        );
      }
    }

    // ✅ Get the current mode before updating
    const currentMode = conversation.mode || 'auto';
    
    // ✅ Update conversation mode
    const updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      { $set: { mode } },
      { new: true }
    ).lean();

    if (!updatedConversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // ✅ Propagate mode change to all merged conversations
    try {
      const { propagateModeToMergedConversations } = await import('@/services/conversation/MergeService.js');
      const propagatedIds = await propagateModeToMergedConversations(context.tenantId, conversationId, mode);
      if (propagatedIds.length > 0) {
        console.log(`✅ Propagated mode '${mode}' to ${propagatedIds.length} merged conversations`);
      }
    } catch (err) {
      console.error('⚠️ Failed to propagate mode to merged conversations:', err);
    }

    // Cancel pending bot queue items when switching to manual
    if (mode === 'manual') {
      try {
        const { cancelPendingBotQueue } = await import('@/workers/queueWorker.js');
        await cancelPendingBotQueue(context.tenantId, conversationId);
      } catch (err) {
        console.error('⚠️ Failed to cancel bot queue on manual switch:', err.message);
      }

      // ✅ Generate AI summary for the conversation (async, non-blocking)
      // This ensures every conversation gets a summary when switched to manual mode
      import('@/services/bot/ConversationIntelligenceService.js').then(({ analyzeConversation }) => {
        analyzeConversation({
          tenantDB,
          tenantId: context.tenantId,
          conversationId,
          handoffReason: 'manual_switch',
        }).then(() => {
          console.log(`✅ AI summary generated for conversation ${conversationId} (manual mode switch)`);
        }).catch(err => {
          console.warn(`⚠️ AI summary generation failed for ${conversationId}:`, err.message);
        });
      }).catch(() => {});
    }

    // ✅ CRITICAL: Schedule mode check if switching to manual mode
    // This schedules a check for 2 minutes from now
    // The worker will check for messages in the LAST 2 minutes when it processes
    // Every new message (inbound/outbound) will reschedule the check
    // So the conversation stays in manual as long as messages are exchanged
    // Only after 2 minutes of complete silence will it switch to auto
    if (mode === 'manual' && currentMode !== 'manual') {
      try {
        const { scheduleConversationModeCheck } = await import('@/services/conversation/ConversationModeScheduler.js');
        // ✅ Don't pass checkAfterTime - we want to check last 2 minutes from when worker processes
        await scheduleConversationModeCheck(conversationId, context.tenantId);
        console.log(`📅 Scheduled conversation mode check for ${conversationId} (manually switched to manual mode)`);
        console.log(`   → Will check for messages in last 2 minutes. If messages are exchanged, check will be rescheduled.`);
      } catch (error) {
        console.error('❌ Failed to schedule conversation mode check after manual switch:', error);
        // Don't fail the request if scheduling fails
      }
    }

    // ✅ Emit socket event for real-time updates
    try {
      // Get all grouped conversations for company admin view
      let allGroupedConversationIds = null;
      if (conversation.contact && conversation.channel) {
        const contactId = conversation.contact?.toString() || conversation.contact;
        const channel = conversation.channel;
        
        const allDepartmentConversations = await Conversation.find({
          contact: contactId,
          channel: channel,
          status: { $in: ['active', 'open', 'pending'] },
          primaryConversation: { $exists: false }
        })
          .select('_id')
          .lean();
        
        if (allDepartmentConversations.length > 1) {
          allGroupedConversationIds = allDepartmentConversations.map(c => c._id);
        }
      }

      // Emit conversation update with mode change
      await SocketEmitter.emitConversationUpdate(
        conversationId,
        { mode: updatedConversation.mode },
        context.tenantId,
        updatedConversation.department?.toString() || null,
        allGroupedConversationIds
      );

      console.log(`✅ Emitted mode change: ${conversationId} -> ${mode}`);
    } catch (socketError) {
      console.error('⚠️ Failed to emit socket event for mode change:', socketError);
      // Don't fail the request if socket emission fails
    }

    return NextResponse.json({
      success: true,
      data: {
        conversationId: updatedConversation._id,
        mode: updatedConversation.mode
      }
    });

  } catch (error) {
    console.error('Change mode error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}