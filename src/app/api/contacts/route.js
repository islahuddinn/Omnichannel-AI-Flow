// src/app/api/contacts/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '../../../config/database.js';
import ContactSchema from '../../../models/schemas/Contact.js';
import CompanyAccountSchema from '../../../models/schemas/CompanyAccount.js';
import WebChatSessionSchema from '../../../models/schemas/WebChatSession.js';
import DepartmentSchema from '../../../models/schemas/Department.js';
import { verifyAuth } from '../../../middleware/auth.js';
import { getTenantContext } from '../../../middleware/tenant.js';
import SocketEmitter from '../../../services/socket/SocketEmitter.js';
import { normalizePhoneNumber } from '../../../utils/normalizers.js';
import crypto from 'crypto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// GET - List all contacts
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }

    const tenantDB = await getTenantDB(context.tenantId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    const { searchParams } = new URL(request.url);
    const pageRaw = parseInt(searchParams.get('page') || '1', 10);
    const limitRaw = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
    const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
    const limit = Number.isNaN(limitRaw) || limitRaw < 1
      ? DEFAULT_LIMIT
      : Math.min(limitRaw, MAX_LIMIT);
    const search = (searchParams.get('search') || '').trim().slice(0, 200);
    const skip = (page - 1) * limit;

    let query = {};

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Build search conditions
      const searchConditions = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { firstName: { $regex: escapedSearch, $options: 'i' } },
        { lastName: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { Contact_Type: { $regex: escapedSearch, $options: 'i' } }
      ];

      // Check if search query looks like a phone number (contains digits)
      const hasDigits = /\d/.test(search);
      
      if (hasDigits) {
        // Normalize the search query to E.164 format
        const normalizedSearch = normalizePhoneNumber(search);
        // Remove all non-digits for flexible matching
        const digitsOnly = search.replace(/\D/g, '');
        const normalizedDigitsOnly = normalizedSearch.replace(/\D/g, '');
        
        // Generate all possible phone number variations for searching
        // We'll search for the normalized version and variations
        const phoneVariations = new Set();
        
        // Add original search (if it has digits)
        if (digitsOnly.length > 0) {
          phoneVariations.add(search.trim());
          phoneVariations.add(normalizedSearch);
          phoneVariations.add(normalizedSearch.replace(/^\+/, ''));
          phoneVariations.add(digitsOnly);
          phoneVariations.add(normalizedDigitsOnly);
          phoneVariations.add(`+${digitsOnly}`);
          phoneVariations.add(`+${normalizedDigitsOnly}`);
          // No spaces version
          phoneVariations.add(search.replace(/\s/g, '').trim());
        }

        // Add phone search conditions for all variations
        // Use $in for exact matches first (more efficient than regex)
        const phoneArray = Array.from(phoneVariations).filter(v => v && v.length > 0);
        
        if (phoneArray.length > 0) {
          // Try exact matches first (more efficient)
          searchConditions.push({ phone: { $in: phoneArray } });
          searchConditions.push({ 'identifiers.whatsapp': { $in: phoneArray } });
          searchConditions.push({ 'identifiers.sms': { $in: phoneArray } });
          searchConditions.push({ normalizedPhone: { $in: phoneArray } });
          
          // Also add regex patterns for flexible matching (handles spaces, dashes, parentheses)
          // Only add regex patterns if we have at least 3 digits
          if (digitsOnly && digitsOnly.length >= 3) {
            try {
              // Create a simpler, more reliable pattern
              // Match the digits in sequence, allowing any non-digit characters between them
              // This is more flexible and less error-prone than trying to match specific formatting
              const simplePattern = digitsOnly.split('').join('.*');
              
              // Validate the regex pattern before using it
              const testRegex = new RegExp(simplePattern, 'i');
              // Test it works
              testRegex.test('test');
              
              // Use the simple pattern - it will match digits in order with any characters between
              searchConditions.push({ phone: { $regex: simplePattern, $options: 'i' } });
              searchConditions.push({ 'identifiers.whatsapp': { $regex: simplePattern, $options: 'i' } });
              searchConditions.push({ 'identifiers.sms': { $regex: simplePattern, $options: 'i' } });
            } catch (regexError) {
              // Regex pattern failed — fall back to exact matches only
              // Skip regex search, rely on exact matches only
              // The exact matches ($in) should be sufficient for most cases
            }
          }
        }
      } else {
        // If it doesn't look like a phone number, just do a simple regex search on phone field
        // Use escaped search to prevent regex errors
        searchConditions.push({ phone: { $regex: escapedSearch, $options: 'i' } });
      }

      query.$or = searchConditions;
    }

    const [contacts, total, inactiveContacts] = await Promise.all([
      Contact.find(query).skip(skip).limit(limit).sort('-createdAt').lean(),
      Contact.countDocuments(query),
      Contact.countDocuments({ ...query, Is_Active: false }),
    ]);

    const activeContacts = total - inactiveContacts;

    return NextResponse.json({
      success: true,
      data: contacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      statistics: {
        total,
        active: activeContacts,
        inactive: inactiveContacts
      }
    });
  } catch (error) {
    console.error('[Contacts] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
}

// POST - Create a new contact
export async function POST(request) {
  try {
    // ✅ Authenticate request
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ Get tenant context
    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }

    // ✅ Get correct tenant database
    const tenantDB = await getTenantDB(context.tenantId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);

    const body = await request.json();
    const { firstName, lastName, name, email, phone, Contact_Type } = body;

    // Validation - require at least firstName or email or phone
    if (!firstName && !email && !phone) {
      return NextResponse.json(
        { success: false, error: 'First name, email, or phone is required' },
        { status: 400 }
      );
    }

    // Build name from firstName and lastName if not provided
    const contactName = name || [firstName, lastName].filter(Boolean).join(' ').trim();

    // Validate that at least a name or identifier is usable
    if (!contactName && !email && !phone) {
      return NextResponse.json(
        { success: false, error: 'Contact must have a name, email, or phone number' },
        { status: 400 }
      );
    }

    // Ensure phone has + prefix using professional normalizer and validate format
    const { normalizePhoneNumber, isValidPhoneNumber, isValidEmail } = await import('@/utils/normalizers');
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : undefined;

    // Validate phone format if provided
    if (phone && !isValidPhoneNumber(phone)) {
      return NextResponse.json(
        { success: false, error: 'Invalid phone number format. Phone must be 8-15 digits in E.164 format (e.g., +1234567890)' },
        { status: 400 }
      );
    }

    // Validate email format if provided
    if (email && !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check for duplicates across all identifier fields
    const duplicateQuery = [];
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      duplicateQuery.push({ email: normalizedEmail });
      duplicateQuery.push({ 'identifiers.email': normalizedEmail });
    }
    if (normalizedPhone) {
      const phoneWithoutPlus = normalizedPhone.replace(/^\+/, '');
      duplicateQuery.push({ phone: normalizedPhone });
      duplicateQuery.push({ phone: phoneWithoutPlus });
      duplicateQuery.push({ normalizedPhone: normalizedPhone });
      duplicateQuery.push({ normalizedPhone: phoneWithoutPlus });
      duplicateQuery.push({ 'identifiers.whatsapp': normalizedPhone });
      duplicateQuery.push({ 'identifiers.whatsapp': phoneWithoutPlus });
      duplicateQuery.push({ 'identifiers.sms': normalizedPhone });
      duplicateQuery.push({ 'identifiers.sms': phoneWithoutPlus });
    }

    if (duplicateQuery.length > 0) {
      const existing = await Contact.findOne({ $or: duplicateQuery });
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Contact with this email or phone already exists' },
          { status: 409 }
        );
      }
    }

    // Get companyId from context or auth
    const companyId = context.companyId || auth.user?.companyId || auth.user?.tenantId || context.tenantId;

    // Use email or phone as fallback name if contactName is empty
    const finalName = contactName || email?.toLowerCase().trim() || normalizedPhone || 'Contact';

    const contact = await Contact.create({
      companyId: companyId,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      name: finalName,
      displayName: finalName,
      email: email?.toLowerCase().trim() || undefined,
      phone: normalizedPhone, // Save with + prefix
      normalizedPhone: normalizedPhone, // Save normalized phone
      identifiers: normalizedPhone ? {
        whatsapp: normalizedPhone, // Store with + prefix for consistency
        sms: normalizedPhone, // Store with + prefix for consistency
      } : {},
      Contact_Type: Contact_Type || 'Customer',
      tags: [],
      lastInteraction: new Date(),
      tenantId: context.tenantId, // ✅ Include tenantId for webchat link generation
    });

    // ✅ Generate WebChat link for new contact
    try {
      const webchatAccount = await CompanyAccount.findOne({
        type: 'webchat',
        isActive: true
      }).lean();
      
      if (webchatAccount) {
        const linkId = crypto.randomBytes(16).toString('hex');
        // ✅ Use dynamic URL helper for port flexibility
        const { getAppUrl } = await import('@/lib/utils.js');
        const contactLink = `${getAppUrl()}/webchat/${linkId}`;
        
        // Get department for webchat session
        const webchatDepartmentId = webchatAccount.departmentId || (webchatAccount.departmentIds && webchatAccount.departmentIds[0]);
        
        if (webchatDepartmentId) {
          const department = await Department.findById(webchatDepartmentId).lean();
          if (department) {
            await WebChatSession.create({
              sessionId: linkId,
              visitorId: `visitor_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
              widgetId: webchatAccount.identifier || webchatAccount._id.toString(),
              channelAccountId: webchatAccount._id,
              departmentId: department._id,
              contactId: contact._id,
              contactLink,
              pinHash: null,
              status: 'pending_auth',
              isAuthenticated: false,
              isFirstTime: false,
              createdAt: new Date(),
              lastActivityAt: new Date(),
              metadata: {
                tenantId: context.tenantId,
              },
            });
            
            // Update contact with webchat link
            contact.webchatLink = contactLink;
            contact.identifiers = contact.identifiers || {};
            contact.identifiers.webchat = linkId;
            await contact.save();
            
            // WebChat link created successfully
          }
        }
      }
    } catch (webchatError) {
      // Non-critical: WebChat link creation failed, contact still created
      // Don't fail the entire operation if webchat link creation fails
    }

    // ✅ Reload contact to get latest data including webchat link
    const updatedContact = await Contact.findById(contact._id).lean();

    // ✅ Emit socket event for real-time UI update
    try {
      await SocketEmitter.emit(`tenant:${context.tenantId}`, 'contact:new', {
        contact: {
          _id: updatedContact._id,
          name: updatedContact.name,
          displayName: updatedContact.displayName,
          firstName: updatedContact.firstName,
          lastName: updatedContact.lastName,
          email: updatedContact.email,
          phone: updatedContact.phone,
          Contact_Type: updatedContact.Contact_Type,
          webchatLink: updatedContact.webchatLink,
          identifiers: updatedContact.identifiers,
          lastInteraction: updatedContact.lastInteraction,
          createdAt: updatedContact.createdAt,
        },
        timestamp: new Date().toISOString(),
      });
      // Socket event emitted successfully
    } catch (socketError) {
      // Non-critical: Socket emission failed, contact still created
      // Don't fail the entire operation if socket emission fails
    }

    // ✅ Return updated contact with webchat link
    const finalContact = await Contact.findById(contact._id).lean();
    
    return NextResponse.json({
      success: true,
      message: 'Contact created successfully',
      data: finalContact
    }, { status: 201 });
  } catch (error) {
    console.error('[Contacts] POST error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create contact' },
      { status: 500 }
    );
  }
}
