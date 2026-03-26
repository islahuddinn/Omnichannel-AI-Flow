// // src/app/api/analytics/conversations/route.js
// import { NextResponse } from 'next/server';
// import { connectToTenantDB } from '@/lib/db/connection';
// import Conversation from '@/models/schemas/Conversation';
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
//     const startDate = searchParams.get('startDate');
//     const endDate = searchParams.get('endDate');

//     const dateFilter = {};
//     if (startDate) dateFilter.$gte = new Date(startDate);
//     if (endDate) dateFilter.$lte = new Date(endDate);

//     const query = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

//     const [
//       totalConversations,
//       conversationsByStatus,
//       conversationsByDepartment,
//       avgResolutionTime,
//       conversationTrend
//     ] = await Promise.all([
//       Conversation.countDocuments(query),
//       Conversation.aggregate([
//         { $match: query },
//         { $group: { _id: '$status', count: { $sum: 1 } } }
//       ]),
//       Conversation.aggregate([
//         { $match: query },
//         { $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'dept' } },
//         { $unwind: { path: '$dept', preserveNullAndEmptyArrays: true } },
//         { $group: { _id: '$dept.name', count: { $sum: 1 } } }
//       ]),
//       calculateAvgResolutionTime(query),
//       getConversationTrend(query)
//     ]);

//     return NextResponse.json({
//       success: true,
//       data: {
//         totalConversations,
//         byStatus: conversationsByStatus,
//         byDepartment: conversationsByDepartment,
//         avgResolutionTime,
//         trend: conversationTrend
//       }
//     });
//   } catch (error) {
//     console.error('Conversation analytics error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to fetch conversation analytics' },
//       { status: 500 }
//     );
//   }
// }

// async function calculateAvgResolutionTime(query) {
//   const closedQuery = { ...query, status: 'closed', closedAt: { $exists: true } };
//   const conversations = await Conversation.find(closedQuery)
//     .select('createdAt closedAt')
//     .lean();

//   if (conversations.length === 0) return 0;

//   const totalTime = conversations.reduce((sum, conv) => {
//     const duration = new Date(conv.closedAt) - new Date(conv.createdAt);
//     return sum + duration;
//   }, 0);

//   return Math.round(totalTime / conversations.length / 1000 / 60); // minutes
// }

// async function getConversationTrend(query) {
//   const results = await Conversation.aggregate([
//     { $match: query },
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





// src/app/api/analytics/conversations/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '../../../../config/database.js';
import ConversationSchema from '../../../../models/schemas/Conversation.js';
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
    
    // ✅ Register model with tenant DB
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    // ✅ CRITICAL: Build base query - filter by agent departments if agent
    let baseQuery = {};
    
    if (auth.user.role === 'agent') {
      const userDepartments = auth.user.departments || [];
      if (userDepartments.length > 0) {
        // ✅ For agents: only show conversations from their departments
        baseQuery.department = { $in: userDepartments };
      } else {
        // Agent has no departments - return empty analytics
        return NextResponse.json({
          success: true,
          data: {
            totalConversations: 0,
            byStatus: [],
            byDepartment: [],
            avgResolutionTime: 0,
            trend: []
          }
        });
      }
    }
    // ✅ For company_admin and super_admin: show all (no filter)

    const query = Object.keys(dateFilter).length > 0 
      ? { ...baseQuery, createdAt: dateFilter } 
      : baseQuery;

    const [
      totalConversations,
      conversationsByStatus,
      conversationsByDepartment,
      avgResolutionTime,
      conversationTrend
    ] = await Promise.all([
      Conversation.countDocuments(query),
      Conversation.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Conversation.aggregate([
        { $match: query },
        { $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'dept' } },
        { $unwind: { path: '$dept', preserveNullAndEmptyArrays: true } },
        { $group: { _id: '$dept.name', count: { $sum: 1 } } }
      ]),
      calculateAvgResolutionTime(Conversation, query),
      getConversationTrend(Conversation, query)
    ]);

    return NextResponse.json({
      success: true,
      data: {
        totalConversations,
        byStatus: conversationsByStatus,
        byDepartment: conversationsByDepartment,
        avgResolutionTime,
        trend: conversationTrend
      }
    });
  } catch (error) {
    console.error('Conversation analytics error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

async function calculateAvgResolutionTime(Conversation, query) {
  const closedQuery = { ...query, status: 'closed', closedAt: { $exists: true } };
  const conversations = await Conversation.find(closedQuery)
    .select('createdAt closedAt')
    .lean();

  if (conversations.length === 0) return 0;

  const totalTime = conversations.reduce((sum, conv) => {
    const duration = new Date(conv.closedAt) - new Date(conv.createdAt);
    return sum + duration;
  }, 0);

  return Math.round(totalTime / conversations.length / 1000 / 60); // minutes
}

async function getConversationTrend(Conversation, query) {
  const results = await Conversation.aggregate([
    { $match: query },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return results.map(r => ({ date: r._id, count: r.count }));
}