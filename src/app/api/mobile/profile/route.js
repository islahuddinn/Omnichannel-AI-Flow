// src/app/api/mobile/profile/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '../../../../config/database.js';
import ContactSchema from '../../../../models/schemas/Contact.js';
import { verifyMobileAuth } from '../../../../middleware/mobile/mobileAuth.js';

/**
 * GET /api/mobile/profile
 * Get handyman profile from Contact collection
 * Extracts SF_id from token and matches with Contact.SF_id
 */
export async function GET(request) {
  try {
    // Get companyId from query params or try to extract from token
    const { searchParams } = new URL(request.url);
    let companyId = searchParams.get('companyId');

    // If companyId not provided, try to extract from token
    if (!companyId) {
      try {
        const authHeader = request.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const jwt = await import('jsonwebtoken');
          const decoded = jwt.default.decode(token);
          companyId = decoded?.companyId;
        }
      } catch (error) {
        console.warn('⚠️ Could not extract companyId from token:', error);
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Verify authentication and get SF_id from token
    const auth = await verifyMobileAuth(request, companyId);
    const sfId = auth.sfId;

    if (!sfId) {
      return NextResponse.json(
        { success: false, message: 'SF ID not found in token' },
        { status: 401 }
      );
    }

    // Get tenant database and Contact model
    const tenantDB = await getTenantDB(companyId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    // Find contact by SF_id
    const contact = await Contact.findOne({ SF_id: sfId }).lean();

    if (!contact) {
      return NextResponse.json(
        { success: false, message: 'Contact not found' },
        { status: 404 }
      );
    }

    // Verify it's a Handyman
    if (contact.Contact_Type !== 'Handyman') {
      return NextResponse.json(
        { success: false, message: 'Contact is not a handyman' },
        { status: 403 }
      );
    }

    // Verify mobile app is enabled
    if (!contact.mobileAppEnabled) {
      return NextResponse.json(
        { success: false, message: 'Mobile app not enabled for this contact' },
        { status: 403 }
      );
    }

    // Extract only relevant profile fields for mobile app
    const profile = {
      // Basic info
      sfId: contact.SF_id,
      email: contact.email,
      phone: contact.phone,
      firstName: contact.firstName || contact.details?.['Contact Full Name']?.split(' ')[0] || '',
      lastName: contact.lastName || contact.details?.['Contact Full Name']?.split(' ').slice(1).join(' ') || '',
      name: contact.name || contact.displayName || contact.details?.['Contact Full Name'] || '',
      displayName: contact.displayName || contact.name || contact.details?.['Contact Full Name'] || '',
      
      // Avatar/Photo
      avatar: contact.details?.['Photo URL'] || contact.avatar || null,
      photoUrl: contact.details?.['Photo URL'] || contact.avatar || null,
      
      // Contact type
      contactType: contact.Contact_Type,
      
      // Mobile app status
      mobileAppEnabled: contact.mobileAppEnabled,
      mobilePasswordChanged: contact.mobilePasswordChanged || false,
      
      // Handyman specific info from details
      handymanNumber: contact.details?.['Handyman_Number'] || contact.details?.['Handyman Numbers'] || null,
      country: contact.details?.Krajina || null,
      currency: contact.details?.['Contact Currency'] || null,
      
      // Company information from details
      companyInfo: contact.details?.['Company Information'] ? {
        companyName: contact.details['Company Information'].Company || null,
        companyId: contact.details['Company Information']['Company ID'] || null,
        bankCode: contact.details['Company Information']['Bank Code'] || null,
        homeAddress: contact.details['Company Information']['Home Address 1'] || null,
        vatNumber: contact.details['Company Information']['Vyska DPH (iFA)'] || null,
        isVatPayer: contact.details['Company Information']['Som/nie som platca DPH (m)'] || null,
      } : null,
      
      // Contact information from details
      companyInformation: contact.details?.['Company_Information'] ? {
        contactType: contact.details['Company_Information']['Contact Type'] || null,
        businessName: contact.details['Company_Information']['Business Name'] || null,
        accountName: contact.details['Company_Information']['Account Name'] || null,
        ico: contact.details['Company_Information'].ICO || null,
        dic: contact.details['Company_Information'].DIC || null,
        icDph: contact.details['Company_Information']['IC DPH'] || null,
        iban: contact.details['Company_Information'].IBAN || null,
        bankNumber: contact.details['Company_Information']['Bank number'] || null,
        dphOdvadzame: contact.details['Company_Information']['DPH Odvadzame'] || null,
      } : null,
      
      // Identifiers
      identifiers: contact.identifiers || {},
      
      // Timestamps
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      mobileLastLogin: contact.mobileLastLogin || null,
    };

    return NextResponse.json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('❌ Get mobile profile error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/mobile/profile
 * Update handyman profile in Contact collection
 */
export async function PUT(request) {
  try {
    // Get companyId from query params or try to extract from token
    const { searchParams } = new URL(request.url);
    let companyId = searchParams.get('companyId');

    // If companyId not provided, try to extract from token
    if (!companyId) {
      try {
        const authHeader = request.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const jwt = await import('jsonwebtoken');
          const decoded = jwt.default.decode(token);
          companyId = decoded?.companyId;
        }
      } catch (error) {
        console.warn('⚠️ Could not extract companyId from token:', error);
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Verify authentication and get SF_id from token
    const auth = await verifyMobileAuth(request, companyId);
    const sfId = auth.sfId;

    if (!sfId) {
      return NextResponse.json(
        { success: false, message: 'SF ID not found in token' },
        { status: 401 }
      );
    }

    // Get tenant database and Contact model
    const tenantDB = await getTenantDB(companyId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    // Find contact by SF_id
    const contact = await Contact.findOne({ SF_id: sfId });

    if (!contact) {
      return NextResponse.json(
        { success: false, message: 'Contact not found' },
        { status: 404 }
      );
    }

    // Verify it's a Handyman
    if (contact.Contact_Type !== 'Handyman') {
      return NextResponse.json(
        { success: false, message: 'Contact is not a handyman' },
        { status: 403 }
      );
    }

    // Parse request body (could be FormData for file uploads or JSON)
    let body;
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Handle FormData (for image uploads)
      const formData = await request.formData();
      body = {};
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          // Handle file upload - you might want to process this differently
          body[key] = value;
        } else {
          body[key] = value;
        }
      }
    } else {
      // Handle JSON
      body = await request.json();
    }

    const { firstName, lastName, phone, email, avatar, photoUrl } = body;

    // Update basic fields
    if (firstName !== undefined) {
      contact.firstName = firstName;
      // Also update in details if it exists
      if (contact.details && contact.details['Contact Full Name']) {
        const lastNamePart = contact.lastName || contact.details['Contact Full Name'].split(' ').slice(1).join(' ') || '';
        contact.details['Contact Full Name'] = `${firstName} ${lastNamePart}`.trim();
      }
    }

    if (lastName !== undefined) {
      contact.lastName = lastName;
      // Also update in details if it exists
      if (contact.details && contact.details['Contact Full Name']) {
        const firstNamePart = contact.firstName || contact.details['Contact Full Name'].split(' ')[0] || '';
        contact.details['Contact Full Name'] = `${firstNamePart} ${lastName}`.trim();
      }
    }

    if (phone !== undefined) {
      contact.phone = phone;
      // Update formatted phone if exists
      if (contact.details) {
        contact.details['Formatted Phone Number'] = phone;
      }
    }

    if (email !== undefined) {
      contact.email = email;
    }

    // Update avatar/photo URL
    if (avatar !== undefined || photoUrl !== undefined) {
      const photoUrlValue = avatar || photoUrl;
      // Update in details
      if (contact.details) {
        contact.details['Photo URL'] = photoUrlValue;
      }
      // Also update top-level avatar if field exists
      if (contact.avatar !== undefined) {
        contact.avatar = photoUrlValue;
      }
    }

    // Update name and displayName based on firstName and lastName
    if (firstName !== undefined || lastName !== undefined) {
      const newFirstName = firstName !== undefined ? firstName : (contact.firstName || '');
      const newLastName = lastName !== undefined ? lastName : (contact.lastName || '');
      const fullName = `${newFirstName} ${newLastName}`.trim();
      
      if (fullName) {
        contact.name = fullName;
        contact.displayName = fullName;
      }
    }

    // Save the contact
    await contact.save();

    // Return updated profile (same structure as GET)
    const updatedProfile = {
      sfId: contact.SF_id,
      email: contact.email,
      phone: contact.phone,
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      name: contact.name || contact.displayName || '',
      displayName: contact.displayName || contact.name || '',
      avatar: contact.details?.['Photo URL'] || contact.avatar || null,
      photoUrl: contact.details?.['Photo URL'] || contact.avatar || null,
      contactType: contact.Contact_Type,
      mobileAppEnabled: contact.mobileAppEnabled,
      mobilePasswordChanged: contact.mobilePasswordChanged || false,
      handymanNumber: contact.details?.['Handyman_Number'] || null,
      country: contact.details?.Krajina || null,
      currency: contact.details?.['Contact Currency'] || null,
      updatedAt: contact.updatedAt,
    };

    return NextResponse.json({
      success: true,
      data: updatedProfile,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('❌ Update mobile profile error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update profile' },
      { status: 500 }
    );
  }
}
