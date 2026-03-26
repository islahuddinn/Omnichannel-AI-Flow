// src/app/api/analytics/export/route.js
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getTenantDB } from '../../../../config/database.js';
import ConversationSchema from '../../../../models/schemas/Conversation.js';
import MessageSchema from '../../../../models/schemas/Message.js';
import ContactSchema from '../../../../models/schemas/Contact.js';
import UserSchema from '../../../../models/schemas/User.js';
import { verifyAuth } from '../../../../middleware/auth.js';
import { getTenantContext } from '../../../../middleware/tenant.js';
import { connectToMasterDB } from '../../../../lib/db/connection.js';

export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

    const body = await request.json();
    const { type, startDate, endDate, format = 'csv' } = body;

    if (!type || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Register models with tenant DB
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    const dateFilter = {
      createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };

    // Generate export data based on type
    let exportData;
    switch (type) {
      case 'conversations':
        exportData = await exportConversations(Conversation, dateFilter);
        break;
      case 'messages':
        exportData = await exportMessages(Message, dateFilter);
        break;
      case 'agents':
        exportData = await exportAgentPerformance(Conversation, Message, context.tenantId, dateFilter);
        break;
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid export type' },
          { status: 400 }
        );
    }

    // Format data
    const formatted = format === 'csv' ? formatAsCSV(exportData) : exportData;

    return NextResponse.json({
      success: true,
      data: formatted,
      filename: `${type}_${startDate.split('T')[0]}_${endDate.split('T')[0]}.${format}`
    });
  } catch (error) {
    console.error('Export analytics error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to export analytics' },
      { status: 500 }
    );
  }
}

async function exportConversations(Conversation, dateFilter) {
  const conversations = await Conversation.find(dateFilter)
    .populate('contact', 'name email phone')
    .populate('assignedTo', 'firstName lastName')
    .lean();

  return conversations.map(conv => ({
    id: conv._id?.toString() || '',
    channel: conv.channel || '',
    status: conv.status || '',
    contactName: conv.contact?.name || '',
    contactEmail: conv.contact?.email || '',
    contactPhone: conv.contact?.phone || '',
    assignedTo: conv.assignedTo ? `${conv.assignedTo.firstName || ''} ${conv.assignedTo.lastName || ''}`.trim() : '',
    createdAt: conv.createdAt ? new Date(conv.createdAt).toISOString() : '',
    closedAt: conv.closedAt ? new Date(conv.closedAt).toISOString() : '',
  }));
}

async function exportMessages(Message, dateFilter) {
  const messages = await Message.find(dateFilter)
    .populate('conversation', 'channel status')
    .select('content type direction status channel createdAt conversation')
    .lean();

  return messages.map(msg => ({
    id: msg._id?.toString() || '',
    direction: msg.direction || '',
    type: msg.type || '',
    status: msg.status || '',
    channel: msg.channel || msg.conversation?.channel || '',
    content: (msg.content || '').substring(0, 200),
    conversationStatus: msg.conversation?.status || '',
    createdAt: msg.createdAt ? new Date(msg.createdAt).toISOString() : '',
  }));
}

async function exportAgentPerformance(Conversation, Message, tenantId, dateFilter) {
  try {
    const masterDB = await connectToMasterDB();
    const User = masterDB.models.User || masterDB.model('User', UserSchema);

    const agents = await User.find({
      companyId: tenantId,
      role: 'agent'
    }).select('firstName lastName email _id').lean();

    if (agents.length === 0) return [];

    const results = await Promise.all(
      agents.map(async (agent) => {
        const agentObjectId = mongoose.Types.ObjectId.isValid(agent._id)
          ? new mongoose.Types.ObjectId(agent._id)
          : agent._id;

        const [assigned, resolved, messages] = await Promise.all([
          Conversation.countDocuments({ ...dateFilter, assignedTo: agentObjectId }),
          Conversation.countDocuments({ ...dateFilter, assignedTo: agentObjectId, status: 'closed' }),
          Message.countDocuments({ ...dateFilter, sender: agentObjectId, direction: 'outbound' }),
        ]);

        return {
          name: `${agent.firstName || ''} ${agent.lastName || ''}`.trim(),
          email: agent.email || '',
          assignedConversations: assigned,
          resolvedConversations: resolved,
          totalMessages: messages,
          resolutionRate: assigned > 0 ? `${Math.round((resolved / assigned) * 100)}%` : '0%',
        };
      })
    );

    return results;
  } catch (error) {
    console.error('Export agent performance error:', error);
    return [];
  }
}

function formatAsCSV(data) {
  if (!data || data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(item =>
    headers.map(header => {
      const val = item[header];
      if (val === null || val === undefined) return '""';
      const str = String(val);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}
