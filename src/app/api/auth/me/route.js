// src/app/api/auth/me/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '../../../../middleware/auth.js';
import { getMasterDB } from '../../../../config/database.js';
import UserSchema from '../../../../models/schemas/User.js';

export async function GET(request) {
  try {
    // Verify authentication
    const auth = await verifyAuth(request);
    
    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: auth.message || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user ID from token
    const userId = auth.user.userId;

    // Get master database
    const masterDB = await getMasterDB();
    const User = masterDB.models.User || masterDB.model('User', UserSchema);

    // Find user
    const user = await User.findById(userId)
      .select('-password -refreshToken')
      .lean();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('[Auth] Get current user error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user information' },
      { status: 500 }
    );
  }
}

