// src/app/api/analytics/agents/route.js
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getTenantDB } from '../../../../config/database.js';
import ConversationSchema from '../../../../models/schemas/Conversation.js';
import MessageSchema from '../../../../models/schemas/Message.js';
import UserSchema from '../../../../models/schemas/User.js';
import { verifyAuth } from '../../../../middleware/auth.js';
import { getTenantContext } from '../../../../middleware/tenant.js';
import { connectToMasterDB } from '../../../../lib/db/connection.js';

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    const masterDB = await connectToMasterDB();
    
    // ✅ Register models with tenant DB
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    
    // ✅ Register User model with master DB
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d';
    
    // Calculate date range based on period
    const now = new Date();
    const startDate = new Date();
    switch (period) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // ✅ Get all agents for this company
    const agents = await User.find({ 
      companyId: context.tenantId, 
      role: 'agent' 
    })
      .select('firstName lastName email _id')
      .lean();

    if (agents.length === 0) {
      return NextResponse.json({
        success: true,
        data: []
      });
    }

    const agentIds = agents.map(a => a._id);

    // ✅ Aggregate agent performance
    const agentStats = await Promise.all(
      agentIds.map(async agentId => {
        // ✅ Convert agentId to ObjectId for proper matching
        const agentObjectId = mongoose.Types.ObjectId.isValid(agentId) 
          ? new mongoose.Types.ObjectId(agentId) 
          : agentId;
        
        // ✅ Count conversations where agent has sent messages within the period (more accurate than just assignedTo)
        const conversationsWithMessages = await Message.distinct('conversation', {
          createdAt: { $gte: startDate },
          sender: agentObjectId,
          direction: 'outbound'
        });
        
        // ✅ Get unique conversation IDs where agent has participated
        const conversationIds = conversationsWithMessages.map(id => 
          mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
        );
        
        // ✅ Also get conversations explicitly assigned to this agent (updated within the period)
        const assignedConversationIds = await Conversation.distinct('_id', {
          updatedAt: { $gte: startDate },
          assignedTo: agentObjectId
        });
        
        // ✅ Combine both sets (assigned + participated) and get unique count
        const allConversationIds = [...new Set([
          ...conversationIds.map(id => id.toString()),
          ...assignedConversationIds.map(id => id.toString())
        ])];
        
        const [assignedConversations, resolvedConversations, totalMessages] = await Promise.all([
          // Count conversations where agent has sent messages OR is assigned (don't filter by conversation createdAt)
          allConversationIds.length > 0 
            ? Conversation.countDocuments({ 
                _id: { $in: allConversationIds.map(id => new mongoose.Types.ObjectId(id)) }
              })
            : 0,
          // Count resolved conversations
          allConversationIds.length > 0
            ? Conversation.countDocuments({ 
                _id: { $in: allConversationIds.map(id => new mongoose.Types.ObjectId(id)) },
                status: 'closed'
              })
            : 0,
          // ✅ Only count outbound messages sent by the agent within the period
          Message.countDocuments({ 
            createdAt: { $gte: startDate }, 
            sender: agentObjectId, 
            direction: 'outbound' 
          })
        ]);

        const agent = agents.find(a => 
          a._id.toString() === agentId.toString() || 
          String(a._id) === String(agentId)
        );

        return {
          agentId: agentId.toString(),
          _id: agentId.toString(),
          name: agent ? `${agent.firstName || ''} ${agent.lastName || ''}`.trim() : 'Unknown',
          email: agent?.email || '',
          assignedConversations: assignedConversations || 0,
          resolvedConversations: resolvedConversations || 0,
          totalMessages: totalMessages || 0,
          resolutionRate: assignedConversations > 0 
            ? Math.round((resolvedConversations / assignedConversations) * 100)
            : 0
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: agentStats.sort((a, b) => b.assignedConversations - a.assignedConversations)
    });
  } catch (error) {
    console.error('Agent analytics error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch agent analytics' },
      { status: 500 }
    );
  }
}