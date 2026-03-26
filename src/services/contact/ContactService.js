// src/services/contact/contactService.js
import { normalizePhoneNumber, normalizeEmail } from '../../utils/normalizers.js';
import crypto from 'crypto';

/**
 * Find or create contact based on identifier and channel type
 * @param {Object} params - Contact parameters
 * @param {Object} params.tenantDB - Tenant database connection
 * @param {string} params.identifier - Contact identifier (phone/email/etc)
 * @param {string} params.channelType - Channel type
 * @param {string} params.channelAccountId - Channel account ID
 * @param {Object} params.metadata - Additional metadata (optional)
 * @returns {Promise<Object>} - Contact document
 */
export async function findOrCreateContact({
  tenantDB,
  identifier,
  channelType,
  channelAccountId,
  metadata = {},
}) {
  try {
    // Import schema
    const ContactSchema = (await import('../../models/schemas/Contact.js')).default;
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    // Normalize identifier based on channel type
    const normalizedIdentifier = normalizeIdentifier(identifier, channelType);

    // ✅ For phone-based channels (WhatsApp/SMS), check all phone variations
    // Same comprehensive check as WhatsApp incoming/outgoing messages
    let contact = null;
    
    if (channelType === 'whatsapp' || channelType === 'sms') {
      // ✅ CRITICAL: Ensure normalizedIdentifier has + prefix
      let normalizedPhone = normalizedIdentifier;
      if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = '+' + normalizedPhone.replace(/^\+/, '');
      }
      
      const phoneWithoutPlus = normalizedPhone.replace(/^\+/, '');
      const phoneWith00 = phoneWithoutPlus ? `00${phoneWithoutPlus}` : null;
      
      // Build array of all phone variations to search
      const phoneVariations = [
        normalizedPhone, // With + prefix (normalized) - e.g., "+923490900400"
        phoneWithoutPlus, // Without + prefix - e.g., "923490900400"
        identifier, // Original format as provided
      ];
      if (phoneWith00) {
        phoneVariations.push(phoneWith00); // With 00 prefix - e.g., "00923490900400"
      }
      
      // ✅ Also add variations with leading 0 removed (some numbers might have leading 0)
      if (phoneWithoutPlus && phoneWithoutPlus.startsWith('0') && phoneWithoutPlus.length > 1) {
        const phoneWithoutLeadingZero = phoneWithoutPlus.substring(1);
        phoneVariations.push(phoneWithoutLeadingZero);
        phoneVariations.push('+' + phoneWithoutLeadingZero);
      }
      
      // Build comprehensive query with all variations
      const contactQuery = {
        $or: []
      };
      
      // Add all variations for each field - ensures we find contacts regardless of storage format
      phoneVariations.forEach(phoneVar => {
        if (phoneVar) {
          contactQuery.$or.push(
            { phone: phoneVar },
            { normalizedPhone: phoneVar },
            { [`identifiers.${channelType}`]: phoneVar },
            { 'identifiers.whatsapp': phoneVar },
            { 'identifiers.sms': phoneVar },
            { 'identifiers.webchat': phoneVar }, // Also check webchat identifier
            { 'identifiers.call': phoneVar } // Also check call identifier
          );
        }
      });
      
      console.log(`🔍 [ContactService] Searching for contact with phone variations:`, {
        original: identifier,
        normalized: normalizedPhone,
        withoutPlus: phoneWithoutPlus,
        with00: phoneWith00,
        variations: phoneVariations,
        queryCount: contactQuery.$or.length
      });
      
      contact = await Contact.findOne(contactQuery);
      
      if (contact) {
        console.log(`✅ [ContactService] Found existing contact: ${contact._id}`, {
          contactPhone: contact.phone,
          contactNormalizedPhone: contact.normalizedPhone,
          contactIdentifiers: contact.identifiers
        });
        
        // ✅ Update contact if phone/normalizedPhone/identifiers don't have + prefix
        // This ensures consistency across all contacts
        const updates = {};
        if (contact.phone && !contact.phone.startsWith('+') && (channelType === 'whatsapp' || channelType === 'sms')) {
          updates.phone = normalizedPhone;
        }
        if (!contact.normalizedPhone || !contact.normalizedPhone.startsWith('+')) {
          updates.normalizedPhone = normalizedPhone;
        }
        if (!contact.identifiers) {
          contact.identifiers = {};
        }
        if ((channelType === 'whatsapp' || channelType === 'sms')) {
          if (!contact.identifiers.sms || !contact.identifiers.sms.startsWith('+')) {
            updates['identifiers.sms'] = normalizedPhone;
          }
          if (!contact.identifiers.whatsapp || !contact.identifiers.whatsapp.startsWith('+')) {
            updates['identifiers.whatsapp'] = normalizedPhone;
          }
        }
        
        if (Object.keys(updates).length > 0) {
          await Contact.findByIdAndUpdate(contact._id, { $set: updates });
          console.log(`✅ [ContactService] Updated contact ${contact._id} with normalized phone:`, updates);
          // Reload contact to get updated values
          contact = await Contact.findById(contact._id);
        }
      }
    } else if (channelType === 'email') {
      // For email, check normalized and original
      const normalizedEmail = normalizedIdentifier.toLowerCase();
      contact = await Contact.findOne({
        $or: [
          { email: normalizedEmail },
          { email: identifier.toLowerCase() },
          { email: identifier }, // Original format
          { 'identifiers.email': normalizedEmail },
          { 'identifiers.email': identifier.toLowerCase() },
          { 'identifiers.email': identifier },
        ]
      });
    } else {
      // For other channels, check by identifier
      contact = await Contact.findOne({
        [`identifiers.${channelType}`]: identifier
      });
    }

    // If contact exists, update name if a new name is provided in metadata
    if (contact) {
      console.log(`✅ Found existing contact: ${contact._id}`);
      
      // ✅ Only set name if contact has NO meaningful name yet (never overwrite existing names from incoming messages)
      const newName = metadata?.name || metadata?.contactName;
      const identifier = metadata?.phone || metadata?.email || '';
      const hasNoName = !contact.name || contact.name === 'Unknown' || contact.name === identifier;
      if (newName && newName.trim() && hasNoName) {
        contact.name = newName.trim();
        contact.displayName = newName.trim();
        await contact.save();
        console.log(`✅ Set contact ${contact._id} name to: ${newName} (was empty/unknown)`);
      }
      
      return contact;
    }

    // Create new contact
    // ✅ Use identifier (phone/email) as name if no name provided in metadata
    const contactName = metadata?.name || metadata?.contactName || generateDefaultName(identifier, channelType);
    const contactData = {
      identifier,
      normalizedIdentifier,
      channelType,
      channelAccountId,
      name: contactName, // ✅ Use provided name or identifier as fallback
      displayName: contactName, // ✅ Also set displayName
      status: 'active',
      metadata: metadata || {},
      tenantId: metadata.tenantId, // ✅ Include tenantId if provided in metadata
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add email or phone based on channel type
    if (channelType === 'email') {
      contactData.email = normalizedIdentifier;
    } else if (['whatsapp', 'sms'].includes(channelType)) {
      // ✅ CRITICAL: Ensure phone always has + prefix before storing
      let phoneToStore = normalizedIdentifier;
      if (!phoneToStore.startsWith('+')) {
        phoneToStore = '+' + phoneToStore.replace(/^\+/, '');
      }
      
      contactData.phone = phoneToStore; // ✅ ALWAYS store with + prefix
      contactData.normalizedPhone = phoneToStore; // ✅ ALWAYS store with + prefix
      // ✅ Initialize identifiers object if not exists
      if (!contactData.identifiers) {
        contactData.identifiers = {};
      }
      // ✅ Set both SMS and WhatsApp identifiers (they share the same phone)
      // ✅ ALWAYS store with + prefix for consistency
      contactData.identifiers.sms = phoneToStore;
      contactData.identifiers.whatsapp = phoneToStore;
      
      console.log(`✨ [ContactService] Creating new contact with phone:`, {
        original: identifier,
        stored: phoneToStore
      });
    }

    // Set Contact_Type to 'Customer' if not already set
    if (!contactData.Contact_Type) {
      contactData.Contact_Type = 'Customer';
    }
    contact = await Contact.create(contactData);

    console.log(`✨ Created new contact: ${contact._id} (${channelType})`);

    // Generate WebChat link for new contact
    // Await to ensure the returned contact has the webchat link populated
    try {
      await generateWebChatLinkForContact(contact, tenantDB);
      // Reload contact to include the webchat link
      const updatedContact = await Contact.findById(contact._id);
      if (updatedContact) return updatedContact;
    } catch (error) {
      console.error('⚠️ Failed to create WebChat link for contact:', error);
      // Don't throw - webchat link creation is optional, return original contact
    }

    return contact;

  } catch (error) {
    console.error('Error in findOrCreateContact:', error);
    throw error;
  }
}

/**
 * Normalize identifier based on channel type
 * @param {string} identifier - Raw identifier
 * @param {string} channelType - Channel type
 * @returns {string} - Normalized identifier
 */
function normalizeIdentifier(identifier, channelType) {
  switch (channelType) {
    case 'whatsapp':
    case 'sms':
      // Normalize to E.164 format
      return normalizePhoneNumber(identifier);

    case 'email':
      // Normalize to lowercase
      return normalizeEmail(identifier);

    case 'facebook':
    case 'instagram':
    case 'webchat':
      // Use as-is for social and webchat
      return identifier.toString().trim();

    default:
      return identifier.toString().trim();
  }
}

/**
 * Generate default name for new contact
 * ✅ Use identifier (phone/email) as name instead of generic names like "WhatsApp User"
 * @param {string} identifier - Contact identifier
 * @param {string} channelType - Channel type
 * @returns {string} - Default name (identifier itself)
 */
function generateDefaultName(identifier, channelType) {
  // ✅ Return the identifier itself (phone number or email) as the name
  // This ensures we show the actual phone/email instead of generic names
  return identifier || 'Contact';
}

/**
 * Update contact information
 * @param {Object} params - Update parameters
 * @param {Object} params.tenantDB - Tenant database connection
 * @param {string} params.contactId - Contact ID
 * @param {Object} params.updates - Fields to update
 * @returns {Promise<Object>} - Updated contact
 */
export async function updateContact({ tenantDB, contactId, updates }) {
  try {
    const ContactSchema = (await import('../../models/schemas/Contact.js')).default;
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    const contact = await Contact.findByIdAndUpdate(
      contactId,
      {
        ...updates,
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (!contact) {
      throw new Error('Contact not found');
    }

    console.log(`✅ Updated contact: ${contactId}`);
    return contact;

  } catch (error) {
    console.error('Error in updateContact:', error);
    throw error;
  }
}

/**
 * Find contact by identifier
 * @param {Object} params - Search parameters
 * @param {Object} params.tenantDB - Tenant database connection
 * @param {string} params.identifier - Contact identifier
 * @param {string} params.channelType - Channel type
 * @returns {Promise<Object|null>} - Contact or null
 */
export async function findContactByIdentifier({ tenantDB, identifier, channelType }) {
  try {
    const ContactSchema = (await import('../../models/schemas/Contact.js')).default;
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    const normalizedIdentifier = normalizeIdentifier(identifier, channelType);

    const contact = await Contact.findOne({
      normalizedIdentifier,
      channelType,
    });

    return contact;

  } catch (error) {
    console.error('Error in findContactByIdentifier:', error);
    throw error;
  }
}

/**
 * Generate WebChat link for a contact (async helper)
 * @param {Object} contact - Contact document
 * @param {Object} tenantDB - Tenant database connection
 */
export async function generateWebChatLinkForContact(contact, tenantDB) {
  try {
    const CompanyAccountSchema = (await import('../../models/schemas/CompanyAccount.js')).default;
    const WebChatSessionSchema = (await import('../../models/schemas/WebChatSession.js')).default;
    const DepartmentSchema = (await import('../../models/schemas/Department.js')).default;
    
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', (await import('../../models/schemas/Contact.js')).default);
    
    // Get WebChat account
    const webchatAccount = await CompanyAccount.findOne({
      type: 'webchat',
      isActive: true
    }).lean();
    
    if (!webchatAccount) {
      console.log('⚠️ No WebChat account found, skipping link generation');
      return; // No webchat account configured
    }
    
    // Get department - try contact's department first, then webchat account's department
    const departmentId = contact.department || webchatAccount.departmentId || (webchatAccount.departmentIds && webchatAccount.departmentIds[0]);
    if (!departmentId) {
      console.log('⚠️ No department found, skipping link generation');
      return; // No department found
    }
    
    const department = await Department.findById(departmentId).lean();
    if (!department) {
      console.log('⚠️ Department not found, skipping link generation');
      return; // Department not found
    }
    
    // Check if contact already has a webchat link
    const existingContact = await Contact.findById(contact._id).lean();
    if (!existingContact) {
      console.log(`⚠️ Contact ${contact._id} not found, skipping webchat link generation`);
      return;
    }
    
    if (existingContact?.webchatLink) {
      console.log(`✅ Contact ${contact._id} already has WebChat link: ${existingContact.webchatLink}`);
      return; // Already has a link
    }
    
    // Generate unique link ID
    const linkId = crypto.randomBytes(16).toString('hex');
    // ✅ Use dynamic URL helper for port flexibility
    const { getAppUrl } = await import('../../lib/utils.js');
    const contactLink = `${getAppUrl()}/webchat/${linkId}`;
    
    // Get tenantId from contact or tenantDB name
    const tenantId = contact.tenantId || tenantDB.name?.replace('tenant_', '') || null;
    
    if (!tenantId) {
      console.log('⚠️ No tenantId found for contact, skipping webchat link generation');
      return; // tenantId is required
    }
    
    // Create WebChat session
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
        tenantId: tenantId,
      },
    });
    
    // Update contact with webchat link
    await Contact.findByIdAndUpdate(contact._id, {
      webchatLink: contactLink,
      $set: {
        'identifiers.webchat': linkId
      }
    });
    
    console.log(`✅ Created WebChat link for contact ${contact._id}: ${contactLink}`);
  } catch (error) {
    console.error('❌ Error generating WebChat link for contact:', error);
    // Don't throw - this is optional
  }
}