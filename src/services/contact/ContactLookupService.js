// src/services/contact/ContactLookupService.js
/**
 * Comprehensive contact lookup service
 * Uses the EXACT same logic as webhook handlers to ensure consistency
 * Prevents duplicate contacts across all channels
 */

import { normalizePhoneNumber, normalizeEmail } from '../../utils/normalizers.js';

/**
 * Find existing contact by phone or email using comprehensive search
 * This is the SAME logic used by webhook handlers to prevent duplicates
 * @param {Object} params - Search parameters
 * @param {Object} params.tenantDB - Tenant database connection
 * @param {string} params.phone - Phone number (optional)
 * @param {string} params.email - Email address (optional)
 * @returns {Promise<Object|null>} - Contact or null
 */
export async function findContactByPhoneOrEmail({ tenantDB, phone, email }) {
  try {
    const ContactSchema = (await import('../../models/schemas/Contact.js')).default;
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    // Build comprehensive query (same as webhook handlers)
    // ✅ NOTE: Do NOT include tenantId in query - tenant database connection already scopes it
    const contactQuery = {
      $or: []
    };

    // Search by phone with all variations (same as webhook handlers)
    if (phone) {
      const normalizedPhone = normalizePhoneNumber(phone);
      const phoneWithoutPlus = normalizedPhone.replace(/^\+/, '');
      const phoneWith00 = phoneWithoutPlus ? `00${phoneWithoutPlus}` : null;

      // Build array of all phone variations to search
      const phoneVariations = [
        normalizedPhone, // With + prefix (normalized)
        phoneWithoutPlus, // Without + prefix
        phone, // Original format
      ];
      if (phoneWith00) {
        phoneVariations.push(phoneWith00); // With 00 prefix
      }

      // Add all variations for each field - including webchat and all phone identifier fields
      phoneVariations.forEach(phoneVar => {
        if (phoneVar) {
          contactQuery.$or.push(
            { phone: phoneVar },
            { normalizedPhone: phoneVar },
            { 'identifiers.whatsapp': phoneVar },
            { 'identifiers.sms': phoneVar },
            { 'identifiers.webchat': phoneVar }, // Also check webchat identifier
            { 'identifiers.call': phoneVar } // Also check call identifier
          );
        }
      });
    }

    // Search by email with all variations (same as webhook handlers)
    if (email) {
      const normalizedEmail = normalizeEmail(email);
      contactQuery.$or.push(
        { email: normalizedEmail },
        { email: email.toLowerCase() },
        { email: email }, // Original format
        { 'identifiers.email': normalizedEmail },
        { 'identifiers.email': email.toLowerCase() },
        { 'identifiers.email': email }
      );
    }

    // Only search if we have at least one search criteria
    if (contactQuery.$or.length === 0) {
      return null;
    }

    // Find contact using comprehensive query
    const contact = await Contact.findOne(contactQuery).lean();

    if (contact) {
      console.log(`✅ Found existing contact ${contact._id} by phone/email lookup`);
    }

    return contact;
  } catch (error) {
    console.error('Error in findContactByPhoneOrEmail:', error);
    return null;
  }
}

/**
 * Create or update contact for testing persona
 * Ensures testing persona fields are set correctly
 * @param {Object} params - Contact parameters
 * @param {Object} params.tenantDB - Tenant database connection
 * @param {Object} params.contact - Existing contact (if found)
 * @param {Object} params.persona - Testing persona object
 * @returns {Promise<Object>} - Contact document
 */
export async function createOrUpdateContactForPersona({ tenantDB, contact, persona }) {
  try {
    const ContactSchema = (await import('../../models/schemas/Contact.js')).default;
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const { normalizePhoneNumber, normalizeEmail } = await import('../../utils/normalizers.js');

    // If contact exists, update it with testing persona fields and ensure identifiers are set
    if (contact) {
      const normalizedPhone = persona.phone ? normalizePhoneNumber(persona.phone) : null;
      const normalizedEmail = persona.email ? normalizeEmail(persona.email) : null;
      
      // Build identifiers object from persona data
      const identifiersUpdate = {};
      if (normalizedPhone) {
        identifiersUpdate['identifiers.whatsapp'] = normalizedPhone;
        identifiersUpdate['identifiers.sms'] = normalizedPhone;
        identifiersUpdate['identifiers.call'] = normalizedPhone;
      }
      if (normalizedEmail) {
        identifiersUpdate['identifiers.email'] = normalizedEmail;
      }
      
      // Check if we need to update testing persona fields
      const needsPersonaUpdate = !contact.isTestingPersona || 
                                 !contact.testingPersonaId || 
                                 contact.testingPersonaId.toString() !== persona._id.toString();
      
      // Check if we need to update identifiers
      const needsIdentifierUpdate = 
        (normalizedPhone && (!contact.identifiers?.whatsapp || !contact.identifiers?.sms)) ||
        (normalizedEmail && !contact.identifiers?.email) ||
        (normalizedPhone && contact.phone !== normalizedPhone) ||
        (normalizedEmail && contact.email !== normalizedEmail);

      // Build update object
      const updateFields = {};
      
      if (needsPersonaUpdate) {
        updateFields.isTestingPersona = true;
        updateFields.testingPersonaId = persona._id;
      }
      
      if (needsIdentifierUpdate) {
        // Initialize identifiers if it doesn't exist
        if (!contact.identifiers) {
          updateFields.identifiers = {};
        }
        
        // Update identifiers
        if (normalizedPhone) {
          updateFields['identifiers.whatsapp'] = normalizedPhone;
          updateFields['identifiers.sms'] = normalizedPhone;
          updateFields['identifiers.call'] = normalizedPhone;
        }
        if (normalizedEmail) {
          updateFields['identifiers.email'] = normalizedEmail;
        }
        
        // Also update main email/phone fields if they're missing or different
        if (normalizedEmail && (!contact.email || contact.email !== normalizedEmail)) {
          updateFields.email = normalizedEmail;
        }
        if (normalizedPhone && (!contact.phone || contact.phone !== normalizedPhone)) {
          updateFields.phone = normalizedPhone;
          updateFields.normalizedPhone = normalizedPhone;
        }
      }

      if (Object.keys(updateFields).length > 0) {
        await Contact.findByIdAndUpdate(contact._id, {
          $set: updateFields
        });
        console.log(`✅ Updated existing contact with testing persona fields and identifiers:`, contact._id, updateFields);
      }

      // ✅ Reload contact to get updated fields - ensure we get all identifier fields
      return await Contact.findById(contact._id)
        .select('name displayName email phone normalizedPhone identifiers isTestingPersona testingPersonaId');
    }

    // Create new contact if not found
    const normalizedPhone = persona.phone ? normalizePhoneNumber(persona.phone) : null;
    const normalizedEmail = persona.email ? normalizeEmail(persona.email) : null;

    // Build identifiers object
    const identifiers = {};
    if (normalizedPhone) {
      identifiers.whatsapp = normalizedPhone;
      identifiers.sms = normalizedPhone;
      identifiers.call = normalizedPhone;
    }
    if (normalizedEmail) {
      identifiers.email = normalizedEmail;
    }

    const newContact = await Contact.create({
      tenantId: persona.tenantId,
      name: persona.name,
      displayName: persona.name,
      email: normalizedEmail || null,
      phone: normalizedPhone || null,
      normalizedPhone: normalizedPhone || null,
      identifiers: identifiers,
      isTestingPersona: true,
      testingPersonaId: persona._id,
      Contact_Type: 'Customer',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log(`✅ Created new contact for testing persona:`, {
      contactId: newContact._id,
      phone: normalizedPhone,
      email: normalizedEmail,
      personaId: persona._id
    });

    return newContact;
  } catch (error) {
    console.error('Error in createOrUpdateContactForPersona:', error);
    throw error;
  }
}
