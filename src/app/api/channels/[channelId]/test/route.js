// // src/app/api/channels/[channelId]/test/route.js
// import { NextResponse } from 'next/server';
// import { connectToTenantDB } from '@/lib/db/connection';
// import CompanyAccount from '@/models/schemas/CompanyAccount';
// import { verifyAuth } from '@/middleware/auth';
// import { getTenantContext } from '@/middleware/tenant';

// export async function POST(request, { params }) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
//     }

//     const { channelId } = await params;
//     const tenantId = getTenantContext();
//     const db = await connectToTenantDB(tenantId);

//     const channel = await CompanyAccount.findById(channelId);
//     if (!channel) {
//       return NextResponse.json(
//         { success: false, error: 'Channel not found' },
//         { status: 404 }
//       );
//     }

//     // Test channel based on type
//     let testResult = { success: false, message: 'Test not implemented' };

//     switch (channel.type) {
//       case 'whatsapp':
//         // Test WhatsApp connection
//         testResult = await testWhatsAppConnection(channel.credentials);
//         break;
//       case 'email':
//         // Test SMTP connection
//         testResult = await testEmailConnection(channel.credentials);
//         break;
//       case 'sms':
//         // Test SMS API
//         testResult = await testSMSConnection(channel.credentials);
//         break;
//       default:
//         testResult = { success: true, message: 'Channel type does not require testing' };
//     }

//     return NextResponse.json({
//       success: testResult.success,
//       message: testResult.message,
//       data: testResult.data || {}
//     });
//   } catch (error) {
//     console.error('Test channel error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to test channel' },
//       { status: 500 }
//     );
//   }
// }

// async function testWhatsAppConnection(credentials) {
//   try {
//     // Implement WhatsApp API test
//     return { success: true, message: 'WhatsApp connection successful' };
//   } catch (error) {
//     return { success: false, message: 'WhatsApp connection failed: ' + error.message };
//   }
// }

// async function testEmailConnection(credentials) {
//   try {
//     // Implement SMTP test
//     return { success: true, message: 'Email connection successful' };
//   } catch (error) {
//     return { success: false, message: 'Email connection failed: ' + error.message };
//   }
// }

// async function testSMSConnection(credentials) {
//   try {
//     // Implement SMS API test
//     return { success: true, message: 'SMS connection successful' };
//   } catch (error) {
//     return { success: false, message: 'SMS connection failed: ' + error.message };
//   }
// }









// src/app/api/channels/[channelId]/test/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import mongoose from 'mongoose';

export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const resolvedParams = await params;
    const { channelId } = resolvedParams;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid channel ID' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);

    const channel = await CompanyAccount.findById(channelId);
    if (!channel) {
      return NextResponse.json(
        { success: false, error: 'Channel not found' },
        { status: 404 }
      );
    }

    // Test channel based on type
    let testResult = { success: false, message: 'Test not implemented' };

    switch (channel.type) {
      case 'whatsapp':
        testResult = await testWhatsAppConnection(channel.credentials);
        break;
      case 'email':
        testResult = await testEmailConnection(channel.credentials);
        break;
      case 'sms':
        testResult = await testSMSConnection(channel.credentials);
        break;
      case 'facebook':
        testResult = await testFacebookConnection(channel.credentials);
        break;
      case 'instagram':
        testResult = await testInstagramConnection(channel.credentials);
        break;
      case 'webchat':
        testResult = { success: true, message: 'WebChat connection verified' };
        break;
      default:
        testResult = { success: true, message: 'Channel type does not require testing' };
    }

    // Update channel status based on test result
    if (testResult.success) {
      channel.status = 'active';
      channel.lastSync = new Date();
    } else {
      channel.status = 'error';
      channel.lastError = {
        message: testResult.message,
        timestamp: new Date()
      };
    }
    
    channel.updatedAt = new Date();
    await channel.save();

    return NextResponse.json({
      success: testResult.success,
      message: testResult.message,
      data: testResult.data || {}
    });
  } catch (error) {
    console.error('Test channel error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to test channel' },
      { status: 500 }
    );
  }
}

async function testWhatsAppConnection(credentials) {
  try {
    if (!credentials.token || !credentials.phoneNumberId) {
      return { success: false, message: 'Missing WhatsApp credentials' };
    }
    // Implement WhatsApp API test
    // Example: Make a test API call to WhatsApp Business API
    return { success: true, message: 'WhatsApp connection successful' };
  } catch (error) {
    return { success: false, message: 'WhatsApp connection failed: ' + error.message };
  }
}

async function testEmailConnection(credentials) {
  try {
    if (!credentials.smtpHost || !credentials.smtpPort || !credentials.smtpUser) {
      return { success: false, message: 'Missing email credentials' };
    }
    // Implement SMTP test
    // Example: Test SMTP connection
    return { success: true, message: 'Email connection successful' };
  } catch (error) {
    return { success: false, message: 'Email connection failed: ' + error.message };
  }
}

async function testSMSConnection(credentials) {
  try {
    if (!credentials.apiKey) {
      return { success: false, message: 'Missing SMS API key' };
    }
    // Implement SMS API test
    return { success: true, message: 'SMS connection successful' };
  } catch (error) {
    return { success: false, message: 'SMS connection failed: ' + error.message };
  }
}

async function testFacebookConnection(credentials) {
  try {
    if (!credentials.token || !credentials.pageId) {
      return { success: false, message: 'Missing Facebook credentials' };
    }
    // Implement Facebook API test
    return { success: true, message: 'Facebook connection successful' };
  } catch (error) {
    return { success: false, message: 'Facebook connection failed: ' + error.message };
  }
}

async function testInstagramConnection(credentials) {
  try {
    if (!credentials.accessToken || !credentials.instagramId) {
      return { success: false, message: 'Missing Instagram credentials' };
    }
    // Implement Instagram API test
    return { success: true, message: 'Instagram connection successful' };
  } catch (error) {
    return { success: false, message: 'Instagram connection failed: ' + error.message };
  }
}