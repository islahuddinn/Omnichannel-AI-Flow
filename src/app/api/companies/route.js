// // src/app/api/companies/route.js
// import { NextResponse } from 'next/server';
// import { cookies } from 'next/headers';
// import TenantService from '../../../services/tenant/TenantService.js';
// import AuthService from '../../../services/auth/AuthService.js';
// import jwt from 'jsonwebtoken';

// async function verifyAuth(request) {
//   const cookieStore = cookies();
//   const token = cookieStore.get('token')?.value;

//   if (!token) {
//     throw new Error('Authentication required');
//   }

//   const decoded = await AuthService.verifyToken(token);
  
//   if (decoded.role !== 'super_admin') {
//     throw new Error('Super admin access required');
//   }

//   return decoded;
// }

// export async function GET(request) {
//   try {
//     await verifyAuth(request);

//     const { searchParams } = new URL(request.url);
//     const page = parseInt(searchParams.get('page') || '1');
//     const limit = parseInt(searchParams.get('limit') || '20');
//     const search = searchParams.get('search') || '';
//     const status = searchParams.get('status') || '';

//     const filter = {};
//     if (status) filter.status = status;

//     const result = await TenantService.listCompanies(filter, {
//       page,
//       limit,
//       search
//     });

//     return NextResponse.json({
//       success: true,
//       data: result
//     });
//   } catch (error) {
//     return NextResponse.json(
//       { success: false, message: error.message },
//       { status: error.message.includes('required') ? 401 : 500 }
//     );
//   }
// }

// export async function POST(request) {
//   try {
//     const user = await verifyAuth(request);
//     const data = await request.json();

//     const result = await TenantService.createCompany(data, user.userId);

//     return NextResponse.json({
//       success: true,
//       data: result
//     });
//   } catch (error) {
//     return NextResponse.json(
//       { success: false, message: error.message },
//       { status: error.message.includes('required') ? 401 : 400 }
//     );
//   }
// }






// import { NextResponse } from 'next/server';
// import { cookies } from 'next/headers';
// import TenantService from '../../../services/tenant/TenantService.js';
// import AuthService from '../../../services/auth/AuthService.js';
// import jwt from 'jsonwebtoken';

// async function verifyAuth(request) {
//   // ✅ Await cookies() (required in Next.js 15)
//   const cookieStore = await cookies();
//   const token = cookieStore.get('token')?.value;

//   if (!token) {
//     throw new Error('Authentication required');
//   }

//   const decoded = await AuthService.verifyToken(token);

//   if (decoded.role !== 'super_admin') {
//     throw new Error('Super admin access required');
//   }

//   return decoded;
// }

// export async function GET(request) {
//   try {
//     await verifyAuth(request);

//     const { searchParams } = new URL(request.url);
//     const page = parseInt(searchParams.get('page') || '1');
//     const limit = parseInt(searchParams.get('limit') || '20');
//     const search = searchParams.get('search') || '';
//     const status = searchParams.get('status') || '';

//     const filter = {};
//     if (status) filter.status = status;

//     const result = await TenantService.listCompanies(filter, {
//       page,
//       limit,
//       search,
//     });

//     return NextResponse.json({
//       success: true,
//       data: result,
//     });
//   } catch (error) {
//     return NextResponse.json(
//       { success: false, message: error.message },
//       { status: error.message.includes('required') ? 401 : 500 }
//     );
//   }
// }

// export async function POST(request) {
//   try {
//     const user = await verifyAuth(request);
//     const data = await request.json();

//     const result = await TenantService.createCompany(data, user.userId);

//     return NextResponse.json({
//       success: true,
//       data: result,
//     });
//   } catch (error) {
//     return NextResponse.json(
//       { success: false, message: error.message },
//       { status: error.message.includes('required') ? 401 : 400 }
//     );
//   }
// }






















// src/app/api/companies/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import TenantService from '../../../services/tenant/TenantService.js';
import jwt from 'jsonwebtoken';
import { ROLES } from '../../../config/constants.js';

const JWT_SECRET = process.env.JWT_SECRET;

async function verifyAuth(request) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    throw new Error('Authentication required');
  }

  const decoded = jwt.verify(token, JWT_SECRET);

  if (decoded.role !== ROLES.SUPER_ADMIN) {
    throw new Error('Super admin access required');
  }

  return decoded;
}

export async function GET(request) {
  try {
    await verifyAuth(request);

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';

    const filter = {};
    if (status) filter.status = status;

    const result = await TenantService.listCompanies(filter, {
      page,
      limit,
      search,
    });

    return NextResponse.json({
      success: true,
      data: result,
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
    const user = await verifyAuth(request);
    const data = await request.json();

    // ✅ Validation
    if (!data.name || !data.adminEmail || !data.adminPassword || 
        !data.adminFirstName || !data.adminLastName) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // ✅ Use TenantService - it handles everything automatically
    const result = await TenantService.createCompany(data, user.userId);

    return NextResponse.json({
      success: true,
      message: 'Company created successfully',
      data: result,
    }, { status: 201 });

  } catch (error) {
    console.error('Create company error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.message.includes('required') ? 401 : 400 }
    );
  }
}