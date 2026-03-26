// src/app/api/analytics/bot/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import MessageSchema from '@/models/schemas/Message';
import ConversationSchema from '@/models/schemas/Conversation';

/**
 * GET /api/analytics/bot
 * Comprehensive Bot Analytics Dashboard — returns all bot performance metrics.
 *
 * Query params:
 *   - days: number of days to analyze (default 7, max 90)
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get('days') || '7', 10), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // ── All metrics in parallel ──
    const [
      totalBotResponses,
      totalInboundMessages,
      totalConversations,
      autoConversations,
      manualConversations,
      handoffConversations,
      botFailedConversations,
      priorityBreakdown,
      channelBreakdown,
      dailyVolume,
      sentimentBreakdown,
      satisfactionBreakdown,
      tokenUsageAgg,
      costAgg,
      avgBotResponseTimeAgg,
      avgHumanResponseTimeAgg,
      topQuestionsAgg,
      handoffReasonsAgg,
      languageBreakdown,
      hourlyDistribution,
    ] = await Promise.all([
      // 1. Total bot responses in period
      Message.countDocuments({
        'metadata.isBotResponse': true,
        createdAt: { $gte: since },
      }),

      // 2. Total inbound messages in period
      Message.countDocuments({
        direction: 'inbound',
        createdAt: { $gte: since },
      }),

      // 3. Total active conversations
      Conversation.countDocuments({
        status: { $in: ['active', 'open', 'pending'] },
      }),

      // 4. Conversations currently in auto mode
      Conversation.countDocuments({
        mode: 'auto',
        status: { $in: ['active', 'open', 'pending'] },
      }),

      // 5. Conversations currently in manual mode
      Conversation.countDocuments({
        mode: 'manual',
        status: { $in: ['active', 'open', 'pending'] },
      }),

      // 6. Conversations with handoff summary (bot handed off to human)
      Conversation.countDocuments({
        'metadata.handoffSummary': { $exists: true, $ne: '' },
        updatedAt: { $gte: since },
      }),

      // 7. Conversations where bot failed
      Conversation.countDocuments({
        'botFailure.failed': true,
        updatedAt: { $gte: since },
      }),

      // 8. Priority breakdown
      Conversation.aggregate([
        { $match: { status: { $in: ['active', 'open', 'pending'] } } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),

      // 9. Channel breakdown for bot responses
      Message.aggregate([
        { $match: { 'metadata.isBotResponse': true, createdAt: { $gte: since } } },
        { $group: { _id: '$channel', count: { $sum: 1 } } },
      ]),

      // 10. Daily message volume (bot responses vs inbound)
      Message.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              type: {
                $cond: [{ $eq: [{ $ifNull: ['$metadata.isBotResponse', false] }, true] }, 'bot', 'customer'],
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1 } },
      ]),

      // 11. Sentiment breakdown
      Conversation.aggregate([
        { $match: { 'metadata.sentiment': { $exists: true }, updatedAt: { $gte: since } } },
        { $group: { _id: '$metadata.sentiment', count: { $sum: 1 } } },
      ]),

      // 12. Satisfaction breakdown (thumbs up/down)
      Message.aggregate([
        {
          $match: {
            'metadata.isBotResponse': true,
            'botSatisfaction.rating': { $exists: true },
            createdAt: { $gte: since },
          },
        },
        { $group: { _id: '$botSatisfaction.rating', count: { $sum: 1 } } },
      ]),

      // 13. Token usage aggregation
      Message.aggregate([
        {
          $match: {
            'metadata.isBotResponse': true,
            'metadata.totalTokens': { $exists: true },
            createdAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: null,
            totalInputTokens: { $sum: { $ifNull: ['$metadata.inputTokens', 0] } },
            totalOutputTokens: { $sum: { $ifNull: ['$metadata.outputTokens', 0] } },
            totalTokens: { $sum: { $ifNull: ['$metadata.totalTokens', 0] } },
            avgTokensPerResponse: { $avg: { $ifNull: ['$metadata.totalTokens', 0] } },
            count: { $sum: 1 },
          },
        },
      ]),

      // 14. Cost aggregation
      Message.aggregate([
        {
          $match: {
            'metadata.isBotResponse': true,
            'metadata.costEstimate': { $exists: true },
            createdAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$metadata.aiProvider', 'unknown'] },
            totalCost: { $sum: { $ifNull: ['$metadata.costEstimate', 0] } },
            avgCostPerResponse: { $avg: { $ifNull: ['$metadata.costEstimate', 0] } },
            count: { $sum: 1 },
          },
        },
      ]),

      // 15. Average bot response time from metadata
      Message.aggregate([
        {
          $match: {
            'metadata.isBotResponse': true,
            'metadata.responseTimeMs': { $exists: true, $gt: 0 },
            createdAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: null,
            avgResponseTimeMs: { $avg: '$metadata.responseTimeMs' },
            minResponseTimeMs: { $min: '$metadata.responseTimeMs' },
            maxResponseTimeMs: { $max: '$metadata.responseTimeMs' },
            p50: { $avg: '$metadata.responseTimeMs' }, // approximation
            count: { $sum: 1 },
          },
        },
      ]),

      // 16. Average human agent response time (time between last inbound and first human outbound)
      (async () => {
        const humanMessages = await Message.find({
          'metadata.isBotResponse': { $ne: true },
          direction: 'outbound',
          sender: { $exists: true, $ne: null },
          createdAt: { $gte: since },
        }).select('conversation createdAt').sort({ createdAt: -1 }).limit(100).lean();

        if (humanMessages.length === 0) return 0;

        let totalMs = 0;
        let count = 0;

        for (const msg of humanMessages.slice(0, 50)) {
          const lastInbound = await Message.findOne({
            conversation: msg.conversation,
            direction: 'inbound',
            createdAt: { $lt: msg.createdAt },
          }).sort({ createdAt: -1 }).select('createdAt').lean();

          if (lastInbound) {
            const diff = new Date(msg.createdAt).getTime() - new Date(lastInbound.createdAt).getTime();
            if (diff > 0 && diff < 3600000) { // Under 1 hour
              totalMs += diff;
              count++;
            }
          }
        }

        return count > 0 ? Math.round(totalMs / count) : 0;
      })(),

      // 17. Top questions (most common inbound messages in bot conversations)
      Message.aggregate([
        {
          $match: {
            direction: 'inbound',
            type: 'text',
            content: { $exists: true, $ne: '' },
            createdAt: { $gte: since },
          },
        },
        {
          $lookup: {
            from: 'conversations',
            localField: 'conversation',
            foreignField: '_id',
            as: 'conv',
            pipeline: [{ $match: { mode: { $in: ['auto'] } } }, { $project: { _id: 1 } }],
          },
        },
        { $match: { 'conv.0': { $exists: true } } },
        {
          $project: {
            // Normalize: lowercase, first 100 chars
            normalizedContent: { $toLower: { $substrCP: ['$content', 0, 100] } },
          },
        },
        { $group: { _id: '$normalizedContent', count: { $sum: 1 }, sample: { $first: '$normalizedContent' } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),

      // 18. Handoff reasons breakdown
      Conversation.aggregate([
        {
          $match: {
            'metadata.handoffSummary': { $exists: true },
            updatedAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: {
              $cond: [
                { $regexMatch: { input: { $ifNull: ['$metadata.handoffSummary', ''] }, regex: /human|agent|person|operator/i } },
                'Customer requested human',
                {
                  $cond: [
                    { $eq: ['$botFailure.failed', true] },
                    'Bot failure',
                    {
                      $cond: [
                        { $regexMatch: { input: { $ifNull: ['$metadata.handoffSummary', ''] }, regex: /media|image|video|audio|document/i } },
                        'Media message',
                        'Other',
                      ],
                    },
                  ],
                },
              ],
            },
            count: { $sum: 1 },
          },
        },
      ]),

      // 19. Language breakdown
      Message.aggregate([
        {
          $match: {
            direction: 'inbound',
            'metadata.detectedLanguage': { $exists: true },
            createdAt: { $gte: since },
          },
        },
        { $group: { _id: '$metadata.detectedLanguage', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),

      // 20. Hourly distribution of bot responses
      Message.aggregate([
        { $match: { 'metadata.isBotResponse': true, createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // ── Format results ──
    const priorityMap = {};
    priorityBreakdown.forEach(p => { priorityMap[p._id || 'normal'] = p.count; });

    const channelMap = {};
    channelBreakdown.forEach(c => { channelMap[c._id || 'unknown'] = c.count; });

    const sentimentMap = {};
    sentimentBreakdown.forEach(s => { sentimentMap[s._id || 'unknown'] = s.count; });

    const satisfactionMap = {};
    satisfactionBreakdown.forEach(s => { satisfactionMap[s._id || 'unknown'] = s.count; });

    // Format daily volume
    const dailyMap = {};
    dailyVolume.forEach(d => {
      if (!dailyMap[d._id.date]) dailyMap[d._id.date] = { date: d._id.date, bot: 0, customer: 0 };
      dailyMap[d._id.date][d._id.type] = d.count;
    });
    const dailyData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Format cost by provider
    const costByProvider = {};
    let totalCost = 0;
    costAgg.forEach(c => {
      costByProvider[c._id] = {
        totalCost: parseFloat(c.totalCost.toFixed(4)),
        avgCostPerResponse: parseFloat(c.avgCostPerResponse.toFixed(6)),
        count: c.count,
      };
      totalCost += c.totalCost;
    });

    // Format token usage
    const tokenUsage = tokenUsageAgg[0] || { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, avgTokensPerResponse: 0 };

    // Bot response time
    const botResponseTime = avgBotResponseTimeAgg[0] || { avgResponseTimeMs: 0, minResponseTimeMs: 0, maxResponseTimeMs: 0 };

    // Calculate rates
    const handoffRate = totalInboundMessages > 0
      ? parseFloat(((handoffConversations / totalInboundMessages) * 100).toFixed(1))
      : 0;
    const botResolutionRate = totalInboundMessages > 0
      ? parseFloat((((totalInboundMessages - handoffConversations) / totalInboundMessages) * 100).toFixed(1))
      : 0;

    // Satisfaction rate
    const totalRatings = (satisfactionMap.up || 0) + (satisfactionMap.down || 0);
    const satisfactionRate = totalRatings > 0
      ? parseFloat(((satisfactionMap.up || 0) / totalRatings * 100).toFixed(1))
      : null;

    // Format handoff reasons
    const handoffReasons = {};
    handoffReasonsAgg.forEach(h => { handoffReasons[h._id] = h.count; });

    // Format language breakdown
    const languages = {};
    languageBreakdown.forEach(l => { languages[l._id] = l.count; });

    // Format hourly distribution (fill in missing hours)
    const hourly = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i.toString().padStart(2, '0')}:00`,
      count: 0,
    }));
    hourlyDistribution.forEach(h => { hourly[h._id].count = h.count; });

    // Format top questions
    const topQuestions = topQuestionsAgg.map(q => ({
      question: q.sample || q._id,
      count: q.count,
    }));

    return NextResponse.json({
      success: true,
      data: {
        period: { days, since: since.toISOString() },

        // Summary cards
        summary: {
          totalBotResponses,
          totalInboundMessages,
          totalConversations,
          autoConversations,
          manualConversations,
          handoffConversations,
          botFailedConversations,
          handoffRate,
          botResolutionRate,
          avgBotResponseTimeMs: Math.round(botResponseTime.avgResponseTimeMs || 0),
          avgBotResponseTimeSec: parseFloat(((botResponseTime.avgResponseTimeMs || 0) / 1000).toFixed(1)),
          minBotResponseTimeMs: botResponseTime.minResponseTimeMs || 0,
          maxBotResponseTimeMs: botResponseTime.maxResponseTimeMs || 0,
          avgHumanResponseTimeMs: avgHumanResponseTimeAgg,
          avgHumanResponseTimeSec: parseFloat((avgHumanResponseTimeAgg / 1000).toFixed(1)),
        },

        // Satisfaction
        satisfaction: {
          thumbsUp: satisfactionMap.up || 0,
          thumbsDown: satisfactionMap.down || 0,
          totalRatings,
          satisfactionRate,
        },

        // Cost tracking
        cost: {
          totalCost: parseFloat(totalCost.toFixed(4)),
          byProvider: costByProvider,
          avgCostPerConversation: totalConversations > 0 ? parseFloat((totalCost / totalConversations).toFixed(6)) : 0,
        },

        // Token usage
        tokens: {
          totalInputTokens: tokenUsage.totalInputTokens,
          totalOutputTokens: tokenUsage.totalOutputTokens,
          totalTokens: tokenUsage.totalTokens,
          avgTokensPerResponse: Math.round(tokenUsage.avgTokensPerResponse || 0),
        },

        // Breakdowns
        priority: {
          normal: priorityMap.normal || 0,
          high: priorityMap.high || 0,
          urgent: priorityMap.urgent || 0,
          low: priorityMap.low || 0,
        },

        channels: channelMap,

        sentiment: {
          positive: sentimentMap.positive || 0,
          neutral: sentimentMap.neutral || 0,
          negative: sentimentMap.negative || 0,
          frustrated: sentimentMap.frustrated || 0,
          angry: sentimentMap.angry || 0,
        },

        // Handoff reasons
        handoffReasons,

        // Language distribution
        languages,

        // Chart data
        dailyVolume: dailyData,
        hourlyDistribution: hourly,
        topQuestions,
      },
    });
  } catch (error) {
    console.error('[BotAnalytics] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bot analytics' },
      { status: 500 }
    );
  }
}
