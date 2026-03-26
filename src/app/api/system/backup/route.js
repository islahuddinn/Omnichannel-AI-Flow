// src/app/api/system/backup/route.js
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

    const backups = await SystemService.listBackups();

    return NextResponse.json({
      success: true,
      data: backups
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.message.includes('required') ? 401 : 500 }
    );
  }
}

export async function POST(request) {
  try {
    await verifyAuth(request);
    const data = await request.json();

    const backup = await SystemService.createBackup(data);

    return NextResponse.json({
      success: true,
      data: backup
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.message.includes('required') ? 401 : 500 }
    );
  }
}