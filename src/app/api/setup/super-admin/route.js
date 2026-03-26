// src/app/api/setup/super-admin/route.js
import { NextResponse } from 'next/server';
import connectDB, { getMasterDB } from '../../../../config/database.js';
import UserSchema from '../../../../models/schemas/User.js';
import AuthService from '../../../../services/auth/AuthService.js';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    await connectDB();
    const masterDB = await getMasterDB();
    const User = masterDB.model('User', UserSchema);
    
    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
    
    if (existingSuperAdmin) {
      return NextResponse.json(
        { success: false, message: 'Super admin already exists' },
        { status: 400 }
      );
    }

    const data = await request.json();

    // Validate required fields
    if (!data.email || !data.password || !data.firstName || !data.lastName) {
      return NextResponse.json(
        { success: false, message: 'All fields are required' },
        { status: 400 }
      );
    }

    // Create super admin
    const superAdmin = new User({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      role: 'super_admin',
      status: 'active',
      emailVerified: true,
      permissions: {
        canCreateUsers: true,
        canDeleteConversations: true,
        canExportData: true,
        canManageChannels: true,
        canViewAnalytics: true,
        canTransferConversations: true,
        canMergeConversations: true
      }
    });

    await superAdmin.save();

    return NextResponse.json({
      success: true,
      message: 'Super admin created successfully',
      data: {
        id: superAdmin._id,
        email: superAdmin.email,
        firstName: superAdmin.firstName,
        lastName: superAdmin.lastName
      }
    });
  } catch (error) {
    console.error('Super admin creation error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

// Check if super admin exists
export async function GET(request) {
  try {
    await connectDB();
    const masterDB = await getMasterDB();
    const User = masterDB.model('User', UserSchema);
    
    const superAdminExists = await User.exists({ role: 'super_admin' });
    
    return NextResponse.json({
      success: true,
      exists: !!superAdminExists
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}