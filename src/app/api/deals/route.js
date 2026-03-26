// src/app/api/deals/route.js
/**
 * Deals API
 * GET /api/deals - Get list of deals with pagination and search
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import DealSchema from '@/models/schemas/Deal';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Escape special regex characters in user search to prevent ReDoS and invalid regex. */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const tenantId = context.tenantId;
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(tenantId);
    
    // Delete existing model if it exists to avoid schema conflicts
    if (tenantDB.models.Deal) {
      delete tenantDB.models.Deal;
    }
    
    const Deal = tenantDB.model('Deal', DealSchema);

    const { searchParams } = new URL(request.url);
    const pageRaw = parseInt(searchParams.get('page') || '1', 10);
    const limitRaw = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
    const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
    const limit = Number.isNaN(limitRaw) || limitRaw < 1
      ? DEFAULT_LIMIT
      : Math.min(limitRaw, MAX_LIMIT);
    const search = (searchParams.get('search') || '').trim().slice(0, 200);
    const skip = (page - 1) * limit;

    const query = {};

    if (search) {
      const safePattern = escapeRegex(search);
      const searchRegex = new RegExp(safePattern, 'i');
      query.$or = [
        { name: searchRegex },
        { stage: searchRegex },
        { status: searchRegex },
        { deal_id: searchRegex },
        // ✅ Also search in details object (dynamic fields)
        // Note: MongoDB doesn't support wildcard search in nested objects easily,
        // so we'll use $text search or search specific known fields
        // For now, we'll search in common details fields
        { 'details.Name': searchRegex },
        { 'details.Stage': searchRegex },
        { 'details.Status': searchRegex },
        { 'details.Deal_Type': searchRegex },
        { 'details.Category': searchRegex },
        { 'details.Sub_Category': searchRegex },
        { 'details.Notes': searchRegex },
        { 'details.Special_Note': searchRegex },
      ];
    }

    // Run find, count, and stats in parallel for faster response
    const statsPipeline = [
      ...(Object.keys(query).length > 0 ? [{ $match: query }] : []),
      {
        $project: {
          stage: {
            $ifNull: [
              '$stage',
              { $ifNull: ['$details.Stage', { $ifNull: ['$details.stage', ''] }] }
            ]
          },
          status: {
            $ifNull: [
              '$status',
              { $ifNull: ['$details.Status', { $ifNull: ['$details.status', ''] }] }
            ]
          },
          commission: {
            $ifNull: [
              { $toDouble: { $ifNull: ['$details.Commission', '0'] } },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$commission' },
          won: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $regexMatch: { input: { $toLower: '$stage' }, regex: 'won|closed won' } },
                    { $regexMatch: { input: { $toLower: '$status' }, regex: 'won|closed won' } }
                  ]
                },
                1,
                0
              ]
            }
          },
          lost: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $regexMatch: { input: { $toLower: '$stage' }, regex: 'lost|closed lost' } },
                    { $regexMatch: { input: { $toLower: '$status' }, regex: 'lost|closed lost' } }
                  ]
                },
                1,
                0
              ]
            }
          },
          inProgress: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$stage', ''] },
                    { $not: { $regexMatch: { input: { $toLower: '$stage' }, regex: 'won|closed won|lost|closed lost' } } }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ];

    const [deals, total, statsAggResult] = await Promise.all([
      Deal.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Deal.countDocuments(query),
      Deal.aggregate(statsPipeline).catch(() => null),
    ]);

    const totalDeals = total;
    let totalAmount = 0;
    let won = 0;
    let lost = 0;
    let inProgress = 0;

    if (statsAggResult && statsAggResult[0]) {
      const stats = statsAggResult[0];
      totalAmount = stats.totalAmount || 0;
      won = stats.won || 0;
      lost = stats.lost || 0;
      inProgress = stats.inProgress || 0;
    } else {
      // Fallback if aggregation fails: use countDocuments with same query filter
      const wonQuery = {
        ...query,
        $or: [
          { stage: { $regex: /won|closed won/i } },
          { status: { $regex: /won|closed won/i } },
          { 'details.Stage': { $regex: /won|closed won/i } },
          { 'details.Status': { $regex: /won|closed won/i } }
        ]
      };
      const lostQuery = {
        ...query,
        $or: [
          { stage: { $regex: /lost|closed lost/i } },
          { status: { $regex: /lost|closed lost/i } },
          { 'details.Stage': { $regex: /lost|closed lost/i } },
          { 'details.Status': { $regex: /lost|closed lost/i } }
        ]
      };
      won = await Deal.countDocuments(wonQuery);
      lost = await Deal.countDocuments(lostQuery);
      inProgress = Math.max(0, totalDeals - won - lost);
    }

    const statistics = {
      totalAmount,
      won,
      lost,
      inProgress,
    };

    // Convert deals to plain objects and ensure proper serialization
    const dealsWithDetails = deals.map(deal => {
      const dealData = {
        _id: deal._id?.toString() || deal._id,
        deal_id: deal.deal_id || null,
        name: deal.name || null,
        stage: deal.stage || null,
        status: deal.status || null,
        createdAt: deal.createdAt ? new Date(deal.createdAt).toISOString() : null,
        updatedAt: deal.updatedAt ? new Date(deal.updatedAt).toISOString() : null,
        createdBy: deal.createdBy?.toString() || deal.createdBy || null,
        details: {},
        metadata: {},
      };
      
      // Convert details to plain object
      if (deal.details) {
        if (deal.details instanceof Map) {
          dealData.details = Object.fromEntries(deal.details);
        } else if (typeof deal.details === 'object' && !Array.isArray(deal.details)) {
          dealData.details = { ...deal.details };
        }
      }
      
      // Convert metadata to plain object
      if (deal.metadata) {
        if (deal.metadata instanceof Map) {
          dealData.metadata = Object.fromEntries(deal.metadata);
        } else if (typeof deal.metadata === 'object' && !Array.isArray(deal.metadata)) {
          dealData.metadata = { ...deal.metadata };
        }
      }
      
      return dealData;
    });

    return NextResponse.json({
      success: true,
      data: dealsWithDetails,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      statistics: {
        total: totalDeals,
        totalAmount: statistics.totalAmount || 0,
        won: statistics.won || 0,
        lost: statistics.lost || 0,
        inProgress: statistics.inProgress || 0,
      },
    });
  } catch (error) {
    console.error('❌ Get deals error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get deals',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

