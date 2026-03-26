// src/app/api/auth/refresh/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import AuthService from '../../../../services/auth/AuthService.js';

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refreshToken')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { success: false, message: 'Refresh token required' },
        { status: 401 }
      );
    }

    const result = await AuthService.refreshToken(refreshToken);

    // Return new accessToken so frontend can update store (needed for Socket.IO auth)
    const response = NextResponse.json({
      success: true,
      data: { accessToken: result.accessToken }
    });

    // Update cookies with new tokens
    response.cookies.set('token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 // 7 days (matches access token expiry)
    });

    response.cookies.set('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 // 30 days (matches refresh token expiry)
    });

    return response;
  } catch (error) {
    console.error('[Auth] Token refresh failed:', error?.message || error);
    return NextResponse.json(
      { success: false, message: 'Session expired. Please login again.' },
      { status: 401 }
    );
  }
}
