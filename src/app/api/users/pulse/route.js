// src/app/api/users/pulse/route.js
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getTenantDB } from '@/config/database';
import StatusHistorySchema from '@/models/schemas/StatusHistory';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userIds, statusType, startDate, endDate } = body;

    // Validate required fields
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'User IDs array is required' },
        { status: 400 }
      );
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    const type = statusType || 'call';

    // Validate statusType
    if (!['call', 'chat'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid statusType. Must be "call" or "chat"' },
        { status: 400 }
      );
    }

    // Normalize dates
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Validate date range
    if (start > end) {
      return NextResponse.json(
        { success: false, error: 'Start date must be before end date' },
        { status: 400 }
      );
    }

    // Get tenant context
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

    // Convert userIds to ObjectIds
    const userIdArray = userIds.map(id => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch (error) {
        throw new Error(`Invalid user ID format: ${id}`);
      }
    });

    // Get StatusHistory model
    const StatusHistory = tenantDB.models.StatusHistory || tenantDB.model('StatusHistory', StatusHistorySchema);

    // Fetch history for users filtered by type and date
    const statusHistory = await StatusHistory.find({
      userId: { $in: userIdArray },
      statusType: type,
      timestamp: { $gte: start, $lte: end }
    })
      .sort({ userId: 1, timestamp: 1 })
      .lean();

    // Group history by user
    const groupedByUser = {};
    statusHistory.forEach(entry => {
      const uid = entry.userId.toString();
      if (!groupedByUser[uid]) {
        groupedByUser[uid] = [];
      }
      groupedByUser[uid].push(entry);
    });

    const now = new Date();
    const result = [];

    // Process each user
    for (const userId of userIdArray) {
      const userIdStr = userId.toString();
      const history = groupedByUser[userIdStr] || [];

      // If user has no history, skip
      if (history.length === 0) continue;

      // Add artificial start if needed
      // Use the start date or the first entry's timestamp, whichever is earlier
      const firstEntryTimestamp = new Date(history[0].timestamp);
      const startTimestamp = start;

      if (firstEntryTimestamp > startTimestamp) {
        history.unshift({
          userId: userId,
          newStatus: history[0].previousStatus || 'unknown',
          timestamp: startTimestamp,
        });
      }

      // Add artificial end if needed
      history.push({
        userId: userId,
        newStatus: 'end_marker',
        timestamp: new Date(Math.min(now.getTime(), end.getTime())),
      });

      // Calculate durations
      const statusDurations = {};

      for (let i = 0; i < history.length - 1; i++) {
        const curr = history[i];
        const next = history[i + 1];
        const status = curr.newStatus;

        if (status === 'end_marker') continue;

        const durationSec = Math.floor(
          (new Date(next.timestamp) - new Date(curr.timestamp)) / 1000
        );

        if (!statusDurations[status]) {
          statusDurations[status] = 0;
        }
        statusDurations[status] += durationSec;
      }

      result.push({
        user_id: userIdStr,
        status_type: type,
        statuses: statusDurations,
      });
    }

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching pulse data:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'An error occurred while fetching pulse data.'
      },
      { status: 500 }
    );
  }
}

