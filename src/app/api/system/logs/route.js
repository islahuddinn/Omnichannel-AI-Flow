// src/app/api/system/logs/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import SystemService from '../../../../services/system/SystemService.js';
import AuthService from '../../../../services/auth/AuthService.js';

async function verifyAuth(request) {
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    throw new Error('Authentication required');
  }

  const decoded = await AuthService.verifyToken(token);
  
  if (decoded.role !== 'super_admin') {
    throw new Error('Super admin access required');
  }

  return decoded;
}

export async function GET(request) {
  try {
    await verifyAuth(request);

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const level = searchParams.get('level') || '';
    const search = searchParams.get('search') || '';

    const logs = await SystemService.getSystemLogs({
      page,
      limit,
      level,
      search
    });

    return NextResponse.json({
      success: true,
      data: logs
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.message.includes('required') ? 401 : 500 }
    );
  }
}