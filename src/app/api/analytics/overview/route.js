// // src/app/api/analytics/overview/route.js
// import { NextResponse } from 'next/server';
// import { connectToTenantDB } from '@/lib/db/connection';
// import Conversation from '@/models/schemas/Conversation';
// import Message from '@/models/schemas/Message';
// import Contact from '@/models/schemas/Contact';
// import User from '@/models/schemas/User';
// import { verifyAuth } from '@/middleware/auth';
// import { getTenantContext } from '@/middleware/tenant';

// export async function GET(request) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
//     }

//     const tenantId = getTenantContext();
//     const db = await connectToTenantDB(tenantId);
    
//     const { searchParams } = new URL(request.url);
//     const period = searchParams.get('period') || '7d';

//     // Calculate date range
//     const now = new Date();
//     const startDate = new Date();
//     switch (period) {
//       case '24h':
//         startDate.setHours(now.getHours() - 24);
//         break;
//       case '7d':
//         startDate.setDate(now.getDate() - 7);
//         break;
//       case '30d':
//         startDate.setDate(now.getDate() - 30);
//         break;
//       case '90d':
//         startDate.setDate(now.getDate() - 90);
//         break;
//       default:
//         startDate.setDate(now.getDate() - 7);
//     }

//     // Aggregate metrics
//     const [
//       totalConversations,
//       activeConversations,
//       totalMessages,
//       totalContacts,
//       newContacts,
//       avgResponseTime,
//       conversationsByChannel,
//       messagesByDay
//     ] = await Promise.all([
//       Conversation.countDocuments({ createdAt: { $gte: startDate } }),
//       Conversation.countDocuments({ status: { $in: ['open', 'pending'] } }),
//       Message.countDocuments({ createdAt: { $gte: startDate } }),
//       Contact.countDocuments(),
//       Contact.countDocuments({ createdAt: { $gte: startDate } }),
//       calculateAvgResponseTime(startDate),
//       getConversationsByChannel(startDate),
//       getMessagesByDay(startDate, now)
//     ]);

//     return NextResponse.json({
//       success: true,
//       data: {
//         summary: {
//           totalConversations,
//           activeConversations,
//           totalMessages,
//           totalContacts,
//           newContacts,
//           avgResponseTime
//         },
//         conversationsByChannel,
//         messagesByDay,
//         period
//       }
//     });
//   } catch (error) {
//     console.error('Analytics overview error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to fetch analytics' },
//       { status: 500 }
//     );
//   }
// }

// async function calculateAvgResponseTime(startDate) {
//   // Implement response time calculation
//   return 0;
// }

// async function getConversationsByChannel(startDate) {
//   const results = await Conversation.aggregate([
//     { $match: { createdAt: { $gte: startDate } } },
//     { $group: { _id: '$channel', count: { $sum: 1 } } }
//   ]);
  
//   return results.map(r => ({ channel: r._id, count: r.count }));
// }

// async function getMessagesByDay(startDate, endDate) {
//   const results = await Message.aggregate([
//     { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
//     {
//       $group: {
//         _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
//         count: { $sum: 1 }
//       }
//     },
//     { $sort: { _id: 1 } }
//   ]);
  
//   return results.map(r => ({ date: r._id, count: r.count }));
// }









// src/app/api/analytics/overview/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '../../../../config/database.js';
import ConversationSchema from '../../../../models/schemas/Conversation.js';
import MessageSchema from '../../../../models/schemas/Message.js';
import ContactSchema from '../../../../models/schemas/Contact.js';
import DealSchema from '../../../../models/schemas/Deal.js';
import { verifyAuth } from '../../../../middleware/auth.js';
import { getTenantContext } from '../../../../middleware/tenant.js';

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    // ✅ Register models with tenant DB
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Deal = tenantDB.models.Deal || tenantDB.model('Deal', DealSchema);
    
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    // Calculate date range - prefer explicit startDate/endDate, fall back to period
    const now = new Date();
    let startDate;
    if (startDateParam) {
      startDate = new Date(startDateParam);
    } else {
      startDate = new Date();
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
    }
    if (endDateParam) {
      // Use end of the provided end date
      const endParsed = new Date(endDateParam);
      now.setTime(endParsed.getTime());
    }

    // ✅ CRITICAL: Build base query - filter by agent departments if agent
    let baseQuery = {};
    let messageBaseQuery = {};
    
    if (auth.user.role === 'agent') {
      const userDepartments = auth.user.departments || [];
      if (userDepartments.length > 0) {
        // ✅ For agents: only show conversations from their departments
        baseQuery.department = { $in: userDepartments };
        // ✅ For messages: filter by conversations in agent's departments
        // We'll need to get conversation IDs first, then filter messages
        const agentConversationIds = await Conversation.distinct('_id', {
          department: { $in: userDepartments }
        });
        messageBaseQuery.conversation = { $in: agentConversationIds };
      } else {
        // Agent has no departments - return empty metrics
        return NextResponse.json({
          success: true,
          data: {
            summary: {
              totalConversations: 0,
              activeConversations: 0,
              totalMessages: 0,
              totalContacts: 0,
              newContacts: 0,
              totalDeals: 0,
              avgResponseTime: 0
            },
            conversationsByChannel: [],
            messagesByDay: [],
            period
          }
        });
      }
    }
    // ✅ For company_admin and super_admin: show all (no filter)

    // Aggregate metrics with department filtering
    const [
      totalConversations,
      activeConversations,
      totalMessages,
      totalContacts,
      newContacts,
      totalDeals,
      avgResponseTime,
      conversationsByChannel,
      messagesByDay
    ] = await Promise.all([
      Conversation.countDocuments({ ...baseQuery, createdAt: { $gte: startDate } }),
      Conversation.countDocuments({ ...baseQuery, status: { $in: ['open', 'pending'] } }),
      Message.countDocuments({ 
        ...messageBaseQuery, 
        createdAt: { $gte: startDate } 
      }),
      Contact.countDocuments(),
      Contact.countDocuments({ createdAt: { $gte: startDate } }),
      Deal.countDocuments().catch(() => 0), // Total deals count
      calculateAvgResponseTime(Message, startDate, messageBaseQuery),
      getConversationsByChannel(Conversation, startDate, baseQuery),
      getMessagesByDay(Message, startDate, now, messageBaseQuery)
    ]);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalConversations,
          activeConversations,
          totalMessages,
          totalContacts,
          newContacts,
          totalDeals,
          avgResponseTime
        },
        conversationsByChannel,
        messagesByDay,
        period
      }
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

async function calculateAvgResponseTime(Message, startDate, messageBaseQuery = {}) {
  // Calculate average time between incoming and outgoing messages
  try {
    const messages = await Message.find({
      ...messageBaseQuery,
      createdAt: { $gte: startDate },
      direction: 'outbound'
    })
      .sort('createdAt')
      .limit(100)
      .lean();

    if (messages.length === 0) return 0;

    let totalTime = 0;
    let count = 0;

    for (const outgoing of messages) {
      // Find previous incoming message in same conversation
      const incoming = await Message.findOne({
        ...messageBaseQuery,
        conversation: outgoing.conversation,
        direction: 'inbound',
        createdAt: { $lt: outgoing.createdAt }
      })
        .sort({ createdAt: -1 })
        .lean();

      if (incoming) {
        const responseTime = new Date(outgoing.createdAt) - new Date(incoming.createdAt);
        totalTime += responseTime;
        count++;
      }
    }

    return count > 0 ? Math.round(totalTime / count / 1000 / 60) : 0; // Return minutes
  } catch (error) {
    console.error('Calculate avg response time error:', error);
    return 0;
  }
}

async function getConversationsByChannel(Conversation, startDate, baseQuery = {}) {
  try {
    const results = await Conversation.aggregate([
      { $match: { ...baseQuery, createdAt: { $gte: startDate } } },
      { $group: { _id: '$channel', count: { $sum: 1 } } }
    ]);
    
    return results.map(r => ({ channel: r._id || 'unknown', count: r.count }));
  } catch (error) {
    console.error('Get conversations by channel error:', error);
    return [];
  }
}

async function getMessagesByDay(Message, startDate, endDate, messageBaseQuery = {}) {
  try {
    const results = await Message.aggregate([
      { $match: { ...messageBaseQuery, createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    return results.map(r => ({ date: r._id, count: r.count }));
  } catch (error) {
    console.error('Get messages by day error:', error);
    return [];
  }
}