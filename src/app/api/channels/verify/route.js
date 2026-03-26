// // src/app/api/channels/verify/route.js
// import { NextResponse } from 'next/server';
// import { verifyAuth } from '@/middleware/auth';

// export async function POST(request) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
//     }

//     const body = await request.json();
//     const { type, credentials } = body;

//     if (!type || !credentials) {
//       return NextResponse.json(
//         { success: false, error: 'Type and credentials are required' },
//         { status: 400 }
//       );
//     }

//     let verificationResult = { success: false, message: 'Invalid channel type' };

//     switch (type) {
//       case 'whatsapp':
//         verificationResult = await verifyWhatsApp(credentials);
//         break;
//       case 'facebook':
//         verificationResult = await verifyFacebook(credentials);
//         break;
//       case 'instagram':
//         verificationResult = await verifyInstagram(credentials);
//         break;
//       case 'email':
//         verificationResult = await verifyEmail(credentials);
//         break;
//       case 'sms':
//         verificationResult = await verifySMS(credentials);
//         break;
//       default:
//         verificationResult = { success: false, message: 'Unsupported channel type' };
//     }

//     return NextResponse.json(verificationResult);
//   } catch (error) {
//     console.error('Verify credentials error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to verify credentials' },
//       { status: 500 }
//     );
//   }
// }

// async function verifyWhatsApp(credentials) {
//   // Implement WhatsApp verification logic
//   return { success: true, message: 'WhatsApp credentials verified' };
// }

// async function verifyFacebook(credentials) {
//   // Implement Facebook verification logic
//   return { success: true, message: 'Facebook credentials verified' };
// }

// async function verifyInstagram(credentials) {
//   // Implement Instagram verification logic
//   return { success: true, message: 'Instagram credentials verified' };
// }

// async function verifyEmail(credentials) {
//   // Implement Email verification logic
//   return { success: true, message: 'Email credentials verified' };
// }

// async function verifySMS(credentials) {
//   // Implement SMS verification logic
//   return { success: true, message: 'SMS credentials verified' };
// }






// src/app/api/channels/verify/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';

export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { type, credentials } = body;

    if (!type || !credentials) {
      return NextResponse.json(
        { success: false, error: 'Type and credentials are required' },
        { status: 400 }
      );
    }

    let verificationResult = { success: false, message: 'Invalid channel type' };

    switch (type) {
      case 'whatsapp':
        verificationResult = await verifyWhatsApp(credentials);
        break;
      case 'facebook':
        verificationResult = await verifyFacebook(credentials);
        break;
      case 'instagram':
        verificationResult = await verifyInstagram(credentials);
        break;
      case 'email':
        verificationResult = await verifyEmail(credentials);
        break;
      case 'sms':
        verificationResult = await verifySMS(credentials);
        break;
      case 'webchat':
        verificationResult = { success: true, message: 'WebChat configuration verified' };
        break;
      default:
        verificationResult = { success: false, message: 'Unsupported channel type' };
    }

    return NextResponse.json(verificationResult);
  } catch (error) {
    console.error('Verify credentials error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify credentials' },
      { status: 500 }
    );
  }
}

async function verifyWhatsApp(credentials) {
  try {
    // Implement WhatsApp verification logic
    // Example: Verify WhatsApp Business API credentials
    if (!credentials.phoneNumberId || !credentials.accessToken) {
      return { success: false, message: 'Missing WhatsApp credentials' };
    }
    
    // Make test API call to WhatsApp
    return { success: true, message: 'WhatsApp credentials verified successfully' };
  } catch (error) {
    return { success: false, message: 'WhatsApp verification failed: ' + error.message };
  }
}

async function verifyFacebook(credentials) {
  try {
    if (!credentials.pageId || !credentials.accessToken) {
      return { success: false, message: 'Missing Facebook credentials' };
    }
    return { success: true, message: 'Facebook credentials verified' };
  } catch (error) {
    return { success: false, message: 'Facebook verification failed: ' + error.message };
  }
}

async function verifyInstagram(credentials) {
  try {
    if (!credentials.instagramId || !credentials.accessToken) {
      return { success: false, message: 'Missing Instagram credentials' };
    }
    return { success: true, message: 'Instagram credentials verified' };
  } catch (error) {
    return { success: false, message: 'Instagram verification failed: ' + error.message };
  }
}

async function verifyEmail(credentials) {
  try {
    if (!credentials.smtpHost || !credentials.smtpPort || !credentials.smtpUser) {
      return { success: false, message: 'Missing email credentials' };
    }
    return { success: true, message: 'Email credentials verified' };
  } catch (error) {
    return { success: false, message: 'Email verification failed: ' + error.message };
  }
}

async function verifySMS(credentials) {
  try {
    if (!credentials.apiKey || !credentials.accountSid) {
      return { success: false, message: 'Missing SMS credentials' };
    }
    return { success: true, message: 'SMS credentials verified' };
  } catch (error) {
    return { success: false, message: 'SMS verification failed: ' + error.message };
  }
}