// // src/app/api/conversations/new/route.js
// import { NextResponse } from 'next/server';
// import { verifyAuth } from '@/middleware/auth';
// import { getTenantContext } from '@/middleware/tenant';
// import { getTenantDB } from '@/config/database';

// export async function GET(request) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
//     }

//     const context = await getTenantContext(request);
//     if (!context.tenantId) {
//       return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
//     }

//     // Return draft conversation template (customize based on auth.role)
//     const draftConversation = {
//       _id: null, // Temp
//       status: 'draft',
//       channel: null,
//       contact: null,
//       assignedTo: auth.user.userId,
//       messageCount: 0,
//       lastMessageAt: null,
//       // Add defaults like department from auth.user.departments[0]
//     };

//     return NextResponse.json({
//       success: true,
//       data: draftConversation,
//       message: 'Draft conversation ready'
//     });
//   } catch (error) {
//     console.error('New conversation error:', error);
//     return NextResponse.json({ success: false, error: 'Failed to create draft' }, { status: 500 });
//   }
// }









// src/app/api/conversations/new/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

export async function GET(request) {
  try {
    // Verify authentication
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' }, 
        { status: 401 }
      );
    }

    // Get tenant context
    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' }, 
        { status: 400 }
      );
    }

    // Create draft conversation template with role-based defaults
    const draftConversation = {
      _id: null, // Will be set when saved to database
      status: 'draft',
      channel: null,
      contact: null,
      assignedTo: auth.user.userId,
      messageCount: 0,
      lastMessageAt: null,
      tenantId: context.tenantId,
      createdAt: new Date().toISOString(),
      // Set default department if available
      department: auth.user.departments?.[0] || null,
      // Add role-specific defaults
      ...(auth.user.role === 'agent' && { priority: 'normal' }),
      ...(auth.user.role === 'admin' && { priority: 'high' })
    };

    return NextResponse.json({
      success: true,
      data: draftConversation,
      message: 'Draft conversation ready'
    });
  } catch (error) {
    console.error('New conversation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create draft' }, 
      { status: 500 }
    );
  }
}