// src/services/contact/CSVImportService.js
/**
 * CSV Contact Import Service
 * Handles streaming CSV parsing, dynamic field mapping, and batch processing
 */

import { parse } from 'csv-parse';
import { createReadStream } from 'fs';
import { Transform } from 'stream';
import crypto from 'crypto';
import { getTenantDB } from '../../config/database.js';
import ContactSchema from '../../models/schemas/Contact.js';
import WebChatSessionSchema from '../../models/schemas/WebChatSession.js';
import CompanyAccountSchema from '../../models/schemas/CompanyAccount.js';
import DepartmentSchema from '../../models/schemas/Department.js';
import { CHANNEL_TYPES } from '../../config/constants.js';

export class CSVImportService {
  constructor(tenantId, companyId, userId, options = {}) {
    this.tenantId = tenantId;
    this.companyId = companyId;
    this.userId = userId;
    this.batchSize = options.batchSize || 1000;
    this.departmentId = options.departmentId || null;
    this.channelAccountId = options.channelAccountId || null;
    this.importStartTime = new Date(); // ✅ Track import start time to exclude newly imported contacts
    this.importedContactIds = new Set(); // ✅ Track contacts imported in this job to avoid false duplicates
  }

  /**
   * Detect and map CSV columns to Contact schema fields
   * Returns mapping with column names (not indices) since csv-parse with columns:true returns objects
   */
  detectFieldMapping(headers) {
    const mapping = {
      standard: {},
      custom: [],
      identifiers: {},
    };

    const fieldPatterns = {
      name: /^(name|fullname|full_name|fullName|displayname|display_name)$/i,
      firstName: /^(firstname|first_name|firstName|FirstName|first\s+name|First\s+Name|FIRST\s+NAME|first-name|First-Name|FIRST-NAME|fname|givenname|given_name|Given\s+Name)$/i,
      lastName: /^(lastname|last_name|lastName|LastName|last\s+name|Last\s+Name|LAST\s+NAME|last-name|Last-Name|LAST-NAME|lname|surname|familyname|family_name|Family\s+Name)$/i,
      email: /^(email|e-mail|mail|emailaddress|email_address)$/i,
      phone: /^(phone|mobile|tel|telephone|cell|cellphone|cell_phone|phonenumber|phone_number)$/i,
      whatsapp: /^(whatsapp|wa|whatsappnumber|whatsapp_number)$/i,
      facebook: /^(facebook|fb|facebookid|facebook_id)$/i,
      instagram: /^(instagram|ig|instagramid|instagram_id)$/i,
      sms: /^(sms|smsnumber|sms_number)$/i,
      SF_id: /^(sf_id|SF_id|SF_ID|sfId|sfid|salesforce_id|Salesforce\s+ID|salesforceId|salesforce\s+id)$/i,
      Salutation: /^(salutation|Salutation|SALUTATION)$/i,
      Contact_Type: /^(contact\s+type|Contact\s+Type|CONTACT\s+TYPE|contact_type|Contact_Type|CONTACT_TYPE|contactType|ContactType|CONTACTTYPE)$/i,
      Is_Active: /^(is\s+active|Is\s+Active|IS\s+ACTIVE|is_active|Is_Active|IS_ACTIVE|isactive|IsActive|ISACTIVE|status|Status|STATUS|active|Active|ACTIVE)$/i,
    };

    headers.forEach((header) => {
      const normalizedHeader = header.trim();
      let mapped = false;

      // First, try exact match with normalized header
      for (const [field, pattern] of Object.entries(fieldPatterns)) {
        if (pattern.test(normalizedHeader)) {
          if (['whatsapp', 'facebook', 'instagram', 'sms'].includes(field)) {
            mapping.identifiers[field] = normalizedHeader; // Store column name, not index
          } else {
            mapping.standard[field] = normalizedHeader; // Store column name, not index
          }
          mapped = true;
          break;
        }
      }
      
      // If not mapped and header has spaces, try converting to underscore format
      if (!mapped && normalizedHeader.includes(' ')) {
        const underscoreVersion = normalizedHeader.replace(/\s+/g, '_');
        // Check if underscore version matches any pattern
        for (const [field, pattern] of Object.entries(fieldPatterns)) {
          if (pattern.test(underscoreVersion)) {
            if (['whatsapp', 'facebook', 'instagram', 'sms'].includes(field)) {
              mapping.identifiers[field] = normalizedHeader; // Store original column name
            } else {
              mapping.standard[field] = normalizedHeader; // Store original column name
            }
            mapped = true;
            break;
          }
        }
      }
      
      // Also try case-insensitive match for common variations
      if (!mapped) {
        const lowerHeader = normalizedHeader.toLowerCase();
        const underscoreLower = lowerHeader.replace(/\s+/g, '_');
        
        for (const [field, pattern] of Object.entries(fieldPatterns)) {
          if (pattern.test(lowerHeader) || pattern.test(underscoreLower)) {
            if (['whatsapp', 'facebook', 'instagram', 'sms'].includes(field)) {
              mapping.identifiers[field] = normalizedHeader;
            } else {
              mapping.standard[field] = normalizedHeader;
            }
            mapped = true;
            break;
          }
        }
      }

      // If not mapped, add to custom fields
      if (!mapped) {
        mapping.custom.push({ name: normalizedHeader }); // Store column name
      }
    });

    return mapping;
  }

  /**
   * Normalize phone number to E.164 format
   * Handles +, 00, or bare digit prefixes consistently with utils/normalizers.js
   */
  normalizePhone(phone) {
    if (!phone) return null;
    const str = phone.toString().trim();
    if (!str) return null;
    // Remove all non-digit characters (including any existing + sign)
    let digits = str.replace(/\D/g, '');
    // Handle 00 prefix (international format without +) - same as utils/normalizers.js
    if (digits.startsWith('00')) {
      digits = digits.substring(2);
    }
    if (!digits) return null;
    return '+' + digits;
  }

  /**
   * Normalize email - converts to lowercase, trims, and validates basic format
   * Returns null for obviously invalid emails (missing @, no domain)
   */
  normalizeEmail(email) {
    if (!email) return null;
    const str = email.toString().trim();
    if (!str) return null;
    const normalized = str.toLowerCase();
    // Basic email validation - must have @ and a domain with a dot
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) return null;
    return normalized;
  }

  /**
   * Generate WebChat link for contact
   */
  async generateWebChatLink(contactId, tenantDB) {
    try {
      const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);
      const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
      const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);

      // Get WebChat account
      let channelAccount;
      if (this.channelAccountId) {
        channelAccount = await CompanyAccount.findById(this.channelAccountId).lean();
      } else {
        channelAccount = await CompanyAccount.findOne({
          type: CHANNEL_TYPES.WEBCHAT || 'webchat',
          isActive: true,
        }).lean();
      }

      if (!channelAccount) {
        console.warn('⚠️ No WebChat account found, skipping link generation');
        return null;
      }

      // Get department
      const departmentId = this.departmentId || channelAccount.departmentId || (channelAccount.departmentIds && channelAccount.departmentIds[0]);
      if (!departmentId) {
        console.warn('⚠️ No department found, skipping link generation');
        return null;
      }

      const department = await Department.findById(departmentId).lean();
      if (!department) {
        console.warn('⚠️ Department not found, skipping link generation');
        return null;
      }

      // Generate unique link ID
      const linkId = crypto.randomBytes(16).toString('hex');
      // ✅ Use dynamic URL helper for port flexibility
      const { getAppUrl } = await import('../../lib/utils.js');
      const contactLink = `${getAppUrl()}/webchat/${linkId}`;

      // Create WebChat session
      await WebChatSession.create({
        sessionId: linkId,
        visitorId: `visitor_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
        widgetId: channelAccount.identifier || channelAccount._id.toString(),
        channelAccountId: channelAccount._id,
        departmentId: department._id,
        contactId: contactId,
        contactLink,
        pinHash: null,
        status: 'pending_auth',
        isAuthenticated: false,
        isFirstTime: true,
        createdBy: this.userId,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        metadata: {
          tenantId: this.tenantId,
          companyId: this.companyId,
        },
      });

      return { linkId, contactLink };
    } catch (error) {
      console.error('❌ Error generating WebChat link:', error);
      return null;
    }
  }

  /**
   * Transform CSV row to Contact document
   * row is an object with column names as keys (from csv-parse with columns:true)
   */
  async transformRowToContact(row, mapping, rowIndex) {
    const contact = {
      companyId: this.companyId,
      details: {}, // ✅ Store all dynamic/unknown CSV fields here
      identifiers: {},
      metadata: {
        source: 'csv_import',
        importedAt: new Date(),
        rowIndex: rowIndex + 1, // 1-based row number
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Map SF_id (Salesforce ID) - check both standard mapping and direct column name
    const sfIdColumn = mapping.standard.SF_id || Object.keys(row).find(col => 
      /^(sf_id|SF_id|SF_ID|sfId|sfid|salesforce_id|Salesforce\s+ID|salesforceId|salesforce\s+id)$/i.test(col.trim())
    );
    if (sfIdColumn) {
      const sfIdValue = row[sfIdColumn]?.trim();
      if (sfIdValue) {
        contact.SF_id = sfIdValue;
      }
    }

    // Map Salutation - check both standard mapping and direct column name
    const salutationColumn = mapping.standard.Salutation || Object.keys(row).find(col => 
      /^(salutation|Salutation|SALUTATION)$/i.test(col.trim())
    );
    if (salutationColumn) {
      const salutationValue = row[salutationColumn]?.trim();
      if (salutationValue) {
        contact.Salutation = salutationValue;
      }
    }

    // Map Contact_Type - check both standard mapping and direct column name
    const contactTypeColumn = mapping.standard.Contact_Type || Object.keys(row).find(col => 
      /^(contact\s+type|Contact\s+Type|CONTACT\s+TYPE|contact_type|Contact_Type|CONTACT_TYPE|contactType|ContactType|CONTACTTYPE)$/i.test(col.trim())
    );
    if (contactTypeColumn) {
      const contactTypeValue = row[contactTypeColumn]?.trim();
      if (contactTypeValue) {
        contact.Contact_Type = contactTypeValue;
      }
    }

    // Map Is_Active (from "Is Active" field) - check both standard mapping and direct column name
    const isActiveColumn = mapping.standard.Is_Active || Object.keys(row).find(col => 
      /^(is\s+active|Is\s+Active|IS\s+ACTIVE|is_active|Is_Active|IS_ACTIVE|isactive|IsActive|ISACTIVE|status|Status|STATUS|active|Active|ACTIVE)$/i.test(col.trim())
    );
    if (isActiveColumn) {
      const isActiveValue = row[isActiveColumn]?.trim();
      if (isActiveValue) {
        // Handle various formats: TRUE/FALSE, true/false, Yes/No, Y/N, 1/0
        const normalized = isActiveValue.toLowerCase();
        contact.Is_Active = normalized === 'true' || normalized === 'yes' || normalized === 'y' || normalized === '1' || normalized === 'active';
      }
    }

    // Map name fields - handle various formats (FirstName, First Name, first_name, etc.)
    let firstName = null;
    let lastName = null;
    let fullName = null;

    // Try to get firstName from various column formats
    if (mapping.standard.firstName) {
      firstName = row[mapping.standard.firstName]?.trim();
    }

    // Try to get lastName from various column formats
    if (mapping.standard.lastName) {
      lastName = row[mapping.standard.lastName]?.trim();
    }

    // Try to get full name
    if (mapping.standard.name) {
      fullName = row[mapping.standard.name]?.trim();
    }

    // If we have firstName and lastName, use them
    if (firstName || lastName) {
      contact.firstName = firstName || '';
      contact.lastName = lastName || '';
      contact.name = [firstName, lastName].filter(Boolean).join(' ');
      contact.displayName = contact.name;
    } else if (fullName) {
      // If we have full name, try to split it
      contact.name = fullName;
      const nameParts = fullName.split(/\s+/);
      if (nameParts.length > 1) {
        contact.firstName = nameParts[0];
        contact.lastName = nameParts.slice(1).join(' ');
        contact.displayName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
      } else {
        contact.firstName = fullName;
        contact.displayName = fullName;
      }
    }

    // Map email - mapping.standard.email is now the column name
    if (mapping.standard.email) {
      const emailValue = row[mapping.standard.email]?.trim();
      if (emailValue) {
        const email = this.normalizeEmail(emailValue);
        if (email) {
          contact.email = email;
          contact.identifiers.email = email;
        }
      }
    }

    // Map phone - mapping.standard.phone is now the column name
    if (mapping.standard.phone) {
      const phoneValue = row[mapping.standard.phone]?.trim();
      if (phoneValue) {
        const phone = this.normalizePhone(phoneValue);
        if (phone) {
          contact.phone = phone;
          // Set identifiers from phone (insertMany won't trigger pre-save hook)
          contact.identifiers.whatsapp = phone;
          contact.identifiers.sms = phone;
          contact.identifiers.call = phone;
        }
      }
    }

    // Map identifier fields - mapping.identifiers now contains column names
    Object.entries(mapping.identifiers).forEach(([field, columnName]) => {
      const value = row[columnName]?.trim();
      if (value) {
        contact.identifiers[field] = value;
      }
    });

    // Map all unknown/dynamic fields to details object
    // Convert field names with spaces to underscores for consistency
    // Exclude fields that are already mapped to standard fields
    const standardFieldColumns = new Set([
      ...Object.values(mapping.standard),
      ...Object.values(mapping.identifiers),
    ]);
    
    // Also exclude SF_id, Salutation, Contact_Type, and Is_Active columns even if not in mapping
    const excludedColumns = new Set([
      ...standardFieldColumns,
      ...Object.keys(row).filter(col => {
        const normalized = col.trim();
        return /^(sf_id|SF_id|SF_ID|sfId|sfid|salesforce_id|Salesforce\s+ID|salesforceId|salesforce\s+id)$/i.test(normalized) ||
               /^(salutation|Salutation|SALUTATION)$/i.test(normalized) ||
               /^(contact\s+type|Contact\s+Type|CONTACT\s+TYPE|contact_type|Contact_Type|CONTACT_TYPE|contactType|ContactType|CONTACTTYPE)$/i.test(normalized) ||
               /^(is\s+active|Is\s+Active|IS\s+ACTIVE|is_active|Is_Active|IS_ACTIVE|isactive|IsActive|ISACTIVE|status|Status|STATUS|active|Active|ACTIVE)$/i.test(normalized);
      }),
    ]);
    
    // ✅ Initialize details as a plain object (Mongoose will convert it to Map)
    if (!contact.details) {
      contact.details = {};
    }
    
    mapping.custom.forEach(({ name }) => {
      // Skip if this field is already mapped to a standard field or is SF_id/Salutation/Is Active
      if (excludedColumns.has(name)) {
        return;
      }
      
      const value = row[name]?.trim();
      if (value) {
        // Store in details object with original field name as-is
        contact.details[name] = value;
      }
    });

    // ✅ REMOVED: No validation for email/phone - ALL contacts will be imported
    // ✅ Only SF_id duplicate check will skip contacts
    // ✅ Contacts without email or phone are still valid and will be imported
    
    // ✅ Optional: If we have identifiers but no email/phone, try to use identifiers (optional enhancement)
    if (!contact.email && contact.identifiers?.email) {
      contact.email = contact.identifiers.email;
    }
    if (!contact.phone && contact.identifiers?.phone) {
      contact.phone = contact.identifiers.phone;
    }

    // ✅ Return contact regardless of email/phone presence
    // Duplicate check will only be based on SF_id
    return contact;
  }

  /**
   * Count total data rows in a CSV file (excluding header row and empty lines)
   */
  async countCSVRows(filePath) {
    return new Promise((resolve, reject) => {
      let count = 0;
      const readStream = createReadStream(filePath);
      const counter = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
      });
      readStream
        .pipe(counter)
        .on('data', () => { count++; })
        .on('end', () => resolve(count))
        .on('error', (err) => {
          console.warn('⚠️ Could not pre-count CSV rows:', err.message);
          resolve(0); // fallback — progress will estimate
        });
    });
  }

  /**
   * Process CSV file stream
   */
  async processCSVStream(filePath, onProgress) {
    const tenantDB = await getTenantDB(this.tenantId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    // Pre-count total rows for accurate progress reporting
    const totalRows = await this.countCSVRows(filePath);
    console.log(`📊 Pre-counted ${totalRows} data rows in CSV`);

    let headers = null;
    let mapping = null;
    let batch = [];
    let rowIndex = 0;
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0; // Track skipped duplicates
    const errors = [];
    const serviceInstance = this; // Capture 'this' for use in callbacks

    // CSV Parser with streaming support
    const csvParser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    });

    /**
     * Check for duplicates in bulk - based on SF_id, phone, and email.
     * Returns a Map of csvIndex → existingContact._id so callers can merge missing fields.
     */
    const checkDuplicatesBulk = async (contacts) => {
      // Map: csvIndex → existing Mongo _id
      const duplicateMap = new Map();
      if (contacts.length === 0) return duplicateMap;

      // Collect all identifiers from the batch
      const sfIds = new Set();
      const phones = new Set();
      const emails = new Set();

      contacts.forEach((contact) => {
        if (contact.SF_id) {
          const sfId = contact.SF_id.trim();
          if (sfId) sfIds.add(sfId);
        }
        if (contact.phone) {
          phones.add(contact.phone);
          const withoutPlus = contact.phone.replace(/^\+/, '');
          if (withoutPlus) phones.add(withoutPlus);
        }
        if (contact.email) {
          emails.add(contact.email.toLowerCase().trim());
        }
      });

      const hasIdentifiers = sfIds.size > 0 || phones.size > 0 || emails.size > 0;
      if (!hasIdentifiers) {
        console.log(`[CSVImport] No identifiers in batch of ${contacts.length} contacts - all will be imported`);
        return duplicateMap;
      }

      // Build query to find existing contacts matching any identifier
      // Note: No companyId filter needed — tenant DB already scopes to the correct tenant
      const orConditions = [];

      if (sfIds.size > 0) {
        orConditions.push({ SF_id: { $in: Array.from(sfIds) } });
      }
      if (phones.size > 0) {
        const phoneArray = Array.from(phones);
        orConditions.push({ phone: { $in: phoneArray } });
        orConditions.push({ 'identifiers.whatsapp': { $in: phoneArray } });
        orConditions.push({ 'identifiers.sms': { $in: phoneArray } });
        orConditions.push({ 'identifiers.call': { $in: phoneArray } });
      }
      if (emails.size > 0) {
        const emailArray = Array.from(emails);
        orConditions.push({ email: { $in: emailArray } });
        orConditions.push({ 'identifiers.email': { $in: emailArray } });
      }

      const query = { $or: orConditions };

      console.log(`[CSVImport] Checking duplicates: ${sfIds.size} SF_ids, ${phones.size} phones, ${emails.size} emails from batch of ${contacts.length}`);

      const existingContacts = await Contact.find(query)
        .select('SF_id phone email identifiers')
        .lean();

      if (existingContacts.length === 0) {
        console.log(`[CSVImport] No existing contacts found - all ${contacts.length} contacts will be imported`);
        return duplicateMap;
      }

      console.log(`[CSVImport] Found ${existingContacts.length} pre-existing contacts with matching identifiers`);

      // Build lookup maps: identifier → existing contact _id
      const sfIdToId = new Map();
      const phoneToId = new Map();
      const emailToId = new Map();

      const addPhone = (ph, id) => { if (ph) { phoneToId.set(ph, id); phoneToId.set(ph.replace(/^\+/, ''), id); } };

      existingContacts.forEach((c) => {
        const id = c._id;
        if (c.SF_id) sfIdToId.set(c.SF_id.trim(), id);
        addPhone(c.phone, id);
        addPhone(c.identifiers?.whatsapp, id);
        addPhone(c.identifiers?.sms, id);
        addPhone(c.identifiers?.call, id);
        if (c.email) emailToId.set(c.email.toLowerCase().trim(), id);
        if (c.identifiers?.email) emailToId.set(c.identifiers.email.toLowerCase().trim(), id);
      });

      // Match each CSV contact to an existing contact
      contacts.forEach((contact, index) => {
        let existingId = null;
        let reason = null;

        if (contact.SF_id) {
          const sfId = contact.SF_id.trim();
          if (sfId && sfIdToId.has(sfId)) {
            existingId = sfIdToId.get(sfId);
            reason = `SF_id: ${sfId}`;
          }
        }
        if (!existingId && contact.phone) {
          const phoneWithout = contact.phone.replace(/^\+/, '');
          if (phoneToId.has(contact.phone)) {
            existingId = phoneToId.get(contact.phone);
            reason = `phone: ${contact.phone}`;
          } else if (phoneToId.has(phoneWithout)) {
            existingId = phoneToId.get(phoneWithout);
            reason = `phone: ${contact.phone}`;
          }
        }
        if (!existingId && contact.email) {
          const emailLower = contact.email.toLowerCase().trim();
          if (emailToId.has(emailLower)) {
            existingId = emailToId.get(emailLower);
            reason = `email: ${contact.email}`;
          }
        }

        if (existingId) {
          duplicateMap.set(index, existingId);
          if (duplicateMap.size <= 5) {
            console.log(`[CSVImport] Match found: ${reason} — will merge missing fields (row ${index + 1})`);
          }
        }
      });

      if (duplicateMap.size > 0) {
        console.log(`[CSVImport] Found ${duplicateMap.size} existing contacts to merge in batch of ${contacts.length}`);
      }

      return duplicateMap;
    };

    const processBatch = async (contacts) => {
      if (contacts.length === 0) return;

      console.log(`📦 Processing batch of ${contacts.length} contacts...`);

      // Check for existing contacts by SF_id, phone, or email
      // Returns Map<csvIndex, existingContactId> for merge
      const duplicateMap = await checkDuplicatesBulk(contacts);

      console.log(`🔍 Duplicate check complete: ${duplicateMap.size} existing matches found out of ${contacts.length} contacts`);

      // Separate contacts into: new inserts vs merge-updates
      const contactsToInsert = [];
      const contactsToMerge = []; // { csvContact, existingId }
      let contactsWithSfId = 0;
      let contactsWithoutSfId = 0;

      contacts.forEach((contact, index) => {
        if (contact.SF_id) {
          contactsWithSfId++;
        } else {
          contactsWithoutSfId++;
        }

        if (duplicateMap.has(index)) {
          contactsToMerge.push({ csvContact: contact, existingId: duplicateMap.get(index) });
        } else {
          contactsToInsert.push(contact);
        }
      });

      console.log(`📊 Batch breakdown: ${contactsWithSfId} with SF_id, ${contactsWithoutSfId} without SF_id`);
      console.log(`📊 After duplicate check: ${contactsToInsert.length} to insert, ${contactsToMerge.length} to merge`);

      // ── Merge missing fields into existing contacts ──
      if (contactsToMerge.length > 0) {
        let mergedCount = 0;
        for (const { csvContact, existingId } of contactsToMerge) {
          try {
            const existing = await Contact.findById(existingId);
            if (!existing) {
              // Contact was deleted between check and merge — treat as new insert
              contactsToInsert.push(csvContact);
              continue;
            }

            const $set = {};

            // Fill missing top-level standard fields
            if (!existing.name && csvContact.name) $set.name = csvContact.name;
            if (!existing.firstName && csvContact.firstName) $set.firstName = csvContact.firstName;
            if (!existing.lastName && csvContact.lastName) $set.lastName = csvContact.lastName;
            if (!existing.displayName && csvContact.displayName) $set.displayName = csvContact.displayName;
            if (!existing.email && csvContact.email) {
              $set.email = csvContact.email;
              $set['identifiers.email'] = csvContact.email;
            }
            if (!existing.phone && csvContact.phone) {
              $set.phone = csvContact.phone;
              if (csvContact.phone) {
                $set['identifiers.whatsapp'] = csvContact.phone;
                $set['identifiers.sms'] = csvContact.phone;
              }
            }
            if (!existing.SF_id && csvContact.SF_id) $set.SF_id = csvContact.SF_id;
            if (!existing.Salutation && csvContact.Salutation) $set.Salutation = csvContact.Salutation;
            if (!existing.Contact_Type && csvContact.Contact_Type) $set.Contact_Type = csvContact.Contact_Type;
            if (existing.Is_Active === undefined && csvContact.Is_Active !== undefined) $set.Is_Active = csvContact.Is_Active;

            // Fill missing identifier fields
            if (csvContact.identifiers) {
              for (const [key, val] of Object.entries(csvContact.identifiers)) {
                if (val && !existing.identifiers?.[key]) {
                  $set[`identifiers.${key}`] = val;
                }
              }
            }

            // Merge details — only add keys that don't exist yet
            if (csvContact.details && typeof csvContact.details === 'object') {
              const existingDetails = existing.details && typeof existing.details === 'object' ? existing.details : {};
              // Convert Map to plain object if needed
              const existingDetailsObj = existingDetails instanceof Map ? Object.fromEntries(existingDetails) : existingDetails;
              for (const [key, val] of Object.entries(csvContact.details)) {
                if (val !== undefined && val !== null && val !== '' && !(key in existingDetailsObj)) {
                  $set[`details.${key}`] = val;
                }
              }
            }

            if (Object.keys($set).length > 0) {
              $set.updatedAt = new Date();
              await Contact.findByIdAndUpdate(existingId, { $set });
              mergedCount++;
              if (mergedCount <= 5) {
                const id = csvContact.SF_id || csvContact.email || csvContact.phone || 'N/A';
                console.log(`[CSVImport] Merged missing fields into existing contact (${id}): ${Object.keys($set).length} fields`);
              }
            }

            successCount++;
          } catch (mergeError) {
            errorCount++;
            errors.push({
              row: rowIndex - contacts.length + contacts.indexOf(csvContact) + 1,
              field: 'merge',
              error: `Failed to merge into existing contact: ${mergeError.message}`,
            });
          }
        }
        if (mergedCount > 0) {
          console.log(`✅ Merged missing fields into ${mergedCount} existing contacts`);
        }
      }

      if (contactsToInsert.length === 0) {
        // All contacts were merged into existing records
        processedCount += contacts.length;
        const limitedErrors = errors.slice(-500);
        onProgress?.({
          type: 'progress',
          total: totalRows || rowIndex,
          processed: processedCount,
          successful: successCount,
          failed: errorCount,
          skipped: skippedCount,
          errors: limitedErrors,
        });
        return;
      }

      try {
        // ✅ Use insertMany with ordered: false for better performance
        // ✅ Suppress validation errors for individual documents - we'll handle them
        let result;
        let insertedCount = 0;
        let insertedIds = [];
        
        try {
          // ✅ Details is now Schema.Types.Mixed, so we can pass plain objects directly
          // Ensure details is always a plain object (not Map, not array, not null)
          const contactsWithPlainObjects = contactsToInsert.map(contact => {
            const contactCopy = { ...contact };
            
            // ✅ Ensure details is a plain object
            if (contactCopy.details instanceof Map) {
              contactCopy.details = Object.fromEntries(contactCopy.details);
            } else if (!contactCopy.details || typeof contactCopy.details !== 'object' || Array.isArray(contactCopy.details)) {
              contactCopy.details = {};
            }
            
            return contactCopy;
          });
          
          result = await Contact.insertMany(contactsWithPlainObjects, {
            ordered: false, // Continue inserting even if some fail
            rawResult: true,
            runValidators: true, // Still run validators but don't stop on errors
          });
          
          insertedCount = result.insertedCount || 0;
          insertedIds = result.insertedIds ? Object.values(result.insertedIds) : [];
          
          // ✅ CRITICAL: Check if all contacts were inserted
          if (insertedCount < contactsToInsert.length) {
            const missingCount = contactsToInsert.length - insertedCount;
            console.warn(`⚠️ Only ${insertedCount} out of ${contactsToInsert.length} contacts were inserted. Retrying ${missingCount} missing contacts individually...`);
            
            // Find which contacts were actually inserted by querying the database
            const insertedSfIds = new Set();
            if (insertedIds.length > 0) {
              try {
                const insertedContacts = await Contact.find({
                  _id: { $in: insertedIds },
                  companyId: serviceInstance.companyId,
                }).select('SF_id').lean();
                
                insertedContacts.forEach(c => {
                  if (c.SF_id) {
                    const sfId = c.SF_id.trim();
                    if (sfId) insertedSfIds.add(sfId);
                  }
                });
              } catch (queryError) {
                console.error(`❌ Error querying inserted contacts:`, queryError);
              }
            }
            
            // Try to insert remaining contacts individually
            let individualSuccess = 0;
            let individualFailed = 0;
            let individualSkipped = 0;
            
            for (let i = 0; i < contactsToInsert.length; i++) {
              const contact = contactsToInsert[i];
              const sfId = contact.SF_id ? contact.SF_id.trim() : null;
              
              // Skip if already inserted (check by SF_id)
              if (sfId && insertedSfIds.has(sfId)) {
                continue;
              }
              
              // Try to insert individually
              try {
                // ✅ Details is now Schema.Types.Mixed, so we can pass plain objects directly
                const contactToInsert = { ...contact };
                
                // ✅ Ensure details is a plain object
                if (contactToInsert.details instanceof Map) {
                  contactToInsert.details = Object.fromEntries(contactToInsert.details);
                } else if (!contactToInsert.details || typeof contactToInsert.details !== 'object' || Array.isArray(contactToInsert.details)) {
                  contactToInsert.details = {};
                }
                
                const newContact = await Contact.create(contactToInsert);
                insertedIds.push(newContact._id);
                if (sfId) insertedSfIds.add(sfId);
                individualSuccess++;
                insertedCount++;
                
                // Generate WebChat link
                try {
                  const linkData = await serviceInstance.generateWebChatLink(newContact._id, tenantDB);
                  if (linkData) {
                    await Contact.findByIdAndUpdate(newContact._id, {
                      webchatLink: linkData.contactLink,
                      'identifiers.webchat': linkData.linkId,
                    });
                  }
                } catch (linkError) {
                  console.error(`❌ Error generating WebChat link for contact ${newContact._id}:`, linkError);
                }
              } catch (individualError) {
                const errorMessage = individualError.message || 'Unknown error';
                let friendlyError = errorMessage;
                let isDuplicate = false;
                
                if (errorMessage.includes('duplicate key') || errorMessage.includes('E11000')) {
                  friendlyError = 'Duplicate contact (SF_id or unique field already exists)';
                  skippedCount++;
                  individualSkipped++;
                  isDuplicate = true;
                  // Don't count duplicates as failures
                } else {
                  errorCount++;
                  individualFailed++;
                }
                
                errors.push({
                  row: rowIndex - contacts.length + i + 1,
                  field: 'database',
                  error: friendlyError,
                });
                
                if (!isDuplicate && individualFailed <= 10) { // Only log first 10 non-duplicate errors to avoid spam
                  console.error(`❌ Failed to insert contact at index ${i} (SF_id: ${sfId || 'N/A'}): ${friendlyError}`);
                }
              }
            }
            
            if (individualSuccess > 0 || individualFailed > 0 || individualSkipped > 0) {
              console.log(`📊 Individual insert results: ${individualSuccess} succeeded, ${individualSkipped} skipped (duplicates), ${individualFailed} failed`);
            }
          }
        } catch (insertError) {
          // If insertMany throws an error, it might have partial success
          if (insertError.writeErrors && Array.isArray(insertError.writeErrors)) {
            // Partial success - some contacts inserted
            const writeErrorCount = insertError.writeErrors.length;
            insertedCount = contactsToInsert.length - writeErrorCount;
            
            // Get inserted IDs from the error (if available)
            if (insertError.insertedIds) {
              insertedIds = Object.values(insertError.insertedIds);
            }
            
            console.warn(`⚠️ Partial batch insert: ${insertedCount} succeeded, ${writeErrorCount} failed`);
            
            // Handle write errors
            insertError.writeErrors.forEach((writeError) => {
              const errorMessage = writeError.errmsg || writeError.err?.message || 'Unknown database error';
              let friendlyError = errorMessage;
              
              if (errorMessage.includes('duplicate key')) {
                friendlyError = 'Duplicate contact (SF_id or unique field already exists)';
                skippedCount++;
              } else {
                errorCount++;
              }
              
              errors.push({
                row: writeError.index + rowIndex - contacts.length + 1,
                field: 'database',
                error: friendlyError,
              });
            });
            
            // Try to insert remaining contacts individually
            const failedIndices = new Set(insertError.writeErrors.map(we => we.index));
            let individualSuccess = 0;
            
            for (let i = 0; i < contactsToInsert.length; i++) {
              if (failedIndices.has(i)) {
                try {
                  // ✅ Details is now Schema.Types.Mixed, so we can pass plain objects directly
                  const contactToRetry = { ...contactsToInsert[i] };
                  
                  // ✅ Ensure details is a plain object
                  if (contactToRetry.details instanceof Map) {
                    contactToRetry.details = Object.fromEntries(contactToRetry.details);
                  } else if (!contactToRetry.details || typeof contactToRetry.details !== 'object' || Array.isArray(contactToRetry.details)) {
                    contactToRetry.details = {};
                  }
                  
                  const newContact = await Contact.create(contactToRetry);
                  insertedIds.push(newContact._id);
                  individualSuccess++;
                  insertedCount++;
                  
                  // Generate WebChat link
                  try {
                    const linkData = await serviceInstance.generateWebChatLink(newContact._id, tenantDB);
                    if (linkData) {
                      await Contact.findByIdAndUpdate(newContact._id, {
                        webchatLink: linkData.contactLink,
                        'identifiers.webchat': linkData.linkId,
                      });
                    }
                  } catch (linkError) {
                    console.error(`❌ Error generating WebChat link:`, linkError);
                  }
                } catch (retryError) {
                  // Already handled in writeErrors
                }
              }
            }
            
            if (individualSuccess > 0) {
              console.log(`✅ Retried and inserted ${individualSuccess} additional contacts`);
            }
          } else {
            // Complete failure - try individual inserts
            throw insertError; // Will be caught by outer catch block
          }
        }
        
        // ✅ Track successfully imported contact IDs to avoid false duplicates
        insertedIds.forEach(id => {
          if (id) {
            serviceInstance.importedContactIds.add(id.toString());
          }
        });
        
        // Process WebChat links for contacts that don't have them yet
        const linkPromises = insertedIds.map(async (contactId) => {
          try {
            const contact = await Contact.findById(contactId);
            if (contact && !contact.webchatLink) {
              const linkData = await serviceInstance.generateWebChatLink(contactId, tenantDB);
              if (linkData) {
                await Contact.findByIdAndUpdate(contactId, {
                  webchatLink: linkData.contactLink,
                  'identifiers.webchat': linkData.linkId,
                });
              }
            }
          } catch (error) {
            console.error(`❌ Error generating WebChat link for contact ${contactId}:`, error);
          }
        });

        // Wait for all WebChat links to be generated (but don't block on errors)
        await Promise.allSettled(linkPromises);

        successCount += insertedCount;
        processedCount += contacts.length;
        
        console.log(`✅ Batch inserted: ${insertedCount} contacts successfully (batch size: ${contacts.length}, duplicates merged: ${duplicateMap.size})`);

        // Warn if not all contacts were inserted
        if (insertedCount < contactsToInsert.length) {
          console.warn(`⚠️ Only ${insertedCount} out of ${contactsToInsert.length} contacts were inserted in this batch (${contactsToInsert.length - insertedCount} missing)`);
        }
      } catch (error) {
        console.error(`❌ Batch insert error for ${contactsToInsert.length} contacts:`, error.message);
        
        // ✅ Handle partial failures more gracefully
        if (error.writeErrors && Array.isArray(error.writeErrors)) {
          // Partial success - some contacts inserted, some failed
          const writeErrorCount = error.writeErrors.length;
          const successInBatch = contactsToInsert.length - writeErrorCount;
          
          console.log(`⚠️ Partial batch failure: ${successInBatch} succeeded, ${writeErrorCount} failed`);
          
          error.writeErrors.forEach((writeError) => {
            errorCount++;
            const errorMessage = writeError.errmsg || writeError.err?.message || 'Unknown database error';
            
            // ✅ Provide more helpful error messages
            let friendlyError = errorMessage;
            if (errorMessage.includes('duplicate key')) {
              // ✅ Check if it's SF_id duplicate (should be rare since we check before insert)
              friendlyError = 'Duplicate contact (SF_id or unique field already exists)';
              skippedCount++; // Count duplicates as skipped, not failed
              errorCount--; // Don't count duplicates as errors
              console.log(`⚠️ Duplicate key error (likely SF_id): ${friendlyError}`);
            } else if (errorMessage.includes('validation failed')) {
              friendlyError = 'Validation failed: ' + (errorMessage.split(':')[1] || 'Invalid data');
              console.log(`⚠️ Validation error: ${friendlyError}`);
            } else {
              console.log(`⚠️ Database error: ${errorMessage}`);
            }
            
            errors.push({
              row: writeError.index + rowIndex - contacts.length + 1,
              field: 'database',
              error: friendlyError,
            });
          });
          
          // Count successful inserts
          successCount += successInBatch;
          
          // ✅ If all failed, log but don't count as error if they're duplicates
          if (successInBatch === 0 && writeErrorCount === contactsToInsert.length) {
            // Check if all are duplicates
            const allDuplicates = error.writeErrors.every(we => 
              (we.errmsg || we.err?.message || '').includes('duplicate key')
            );
            if (allDuplicates) {
              console.log(`⚠️ All ${contactsToInsert.length} contacts in batch are duplicates (SF_id)`);
              skippedCount += contactsToInsert.length;
              errorCount -= contactsToInsert.length; // Don't count duplicates as errors
            } else {
              console.error(`❌ All ${contactsToInsert.length} contacts in batch failed to insert (not all duplicates)`);
            }
          }
        } else {
          // Complete failure - try to insert one by one to get better error messages
          console.warn(`⚠️ Batch insert completely failed, trying individual inserts for batch of ${contactsToInsert.length}`);
          let individualSuccess = 0;
          let individualErrors = 0;
          let individualSkipped = 0;
          
          for (let i = 0; i < contactsToInsert.length; i++) {
            try {
              // ✅ Details is now Schema.Types.Mixed, so we can pass plain objects directly
              const contactToInsert = { ...contactsToInsert[i] };
              
              // ✅ Ensure details is a plain object
              if (contactToInsert.details instanceof Map) {
                contactToInsert.details = Object.fromEntries(contactToInsert.details);
              } else if (!contactToInsert.details || typeof contactToInsert.details !== 'object' || Array.isArray(contactToInsert.details)) {
                contactToInsert.details = {};
              }
              
              await Contact.create(contactToInsert);
              individualSuccess++;
            } catch (individualError) {
              const errorMessage = individualError.message || 'Unknown error';
              let friendlyError = errorMessage;
              
              if (errorMessage.includes('duplicate key')) {
                // ✅ Check if it's SF_id duplicate (should be rare since we check before insert)
                friendlyError = 'Duplicate contact (SF_id or unique field already exists)';
                skippedCount++;
                individualSkipped++;
                // Don't count duplicates as errors
              } else {
                errorCount++;
                individualErrors++;
              }
              
              errors.push({
                row: rowIndex - contacts.length + i + 1,
                field: 'database',
                error: friendlyError,
              });
            }
          }
          
          console.log(`📊 Individual insert results: ${individualSuccess} succeeded, ${individualSkipped} skipped (duplicates), ${individualErrors} failed`);
          successCount += individualSuccess;
          
          // ✅ Track successfully imported contact IDs
          // Note: Individual inserts don't return IDs easily, so we'll rely on createdAt filter
        }
        processedCount += contacts.length;
      }

      // ✅ Limit errors to prevent memory and database size issues
      const limitedErrors = errors.slice(-500); // Keep last 500 errors
      
      onProgress?.({
        type: 'progress',
        total: totalRows || rowIndex,
        processed: processedCount,
        successful: successCount,
        failed: errorCount,
        skipped: skippedCount,
        errors: limitedErrors,
      });
    };

    // Process CSV stream using for-await-of for proper backpressure handling
    const readStream = createReadStream(filePath);
    const pipeline = readStream.pipe(csvParser);

    try {
      for await (const record of pipeline) {
        try {
          // First row - detect field mapping
          if (!headers) {
            headers = Object.keys(record);
            mapping = serviceInstance.detectFieldMapping(headers);
            console.log('📋 Field mapping detected:', {
              standard: mapping.standard,
              identifiers: mapping.identifiers,
              customCount: mapping.custom.length,
            });
            onProgress?.({ type: 'mapping', mapping, headers });
          }

          const contact = await serviceInstance.transformRowToContact(record, mapping, rowIndex);

          if (contact === null) {
            console.warn(`⚠️ Contact at row ${rowIndex + 1} is null, skipping...`);
            skippedCount++;
            errors.push({
              row: rowIndex + 1,
              field: 'contact',
              error: 'Contact is null (unexpected error)',
            });
            rowIndex++;
            continue;
          }

          batch.push(contact);
          rowIndex++;

          if (rowIndex % 1000 === 0) {
            console.log(`📊 Progress: ${rowIndex}/${totalRows || '?'} rows read, ${batch.length} in current batch`);
          }

          // Process batch when it reaches batch size
          if (batch.length >= serviceInstance.batchSize) {
            await processBatch(batch);
            batch = [];
          }
        } catch (error) {
          console.error(`❌ Error processing row ${rowIndex + 1}:`, error.message);
          errorCount++;
          errors.push({
            row: rowIndex + 1,
            error: error.message,
          });
          rowIndex++;
        }
      }

      // Process remaining batch
      if (batch.length > 0) {
        console.log(`📦 Processing final batch of ${batch.length} contacts...`);
        await processBatch(batch);
      }

      const actualTotal = successCount + skippedCount + errorCount;

      console.log(`\n📊 Import Summary:`);
      console.log(`   Total rows: ${rowIndex}`);
      console.log(`   Successful: ${successCount}`);
      console.log(`   Skipped (duplicates): ${skippedCount}`);
      console.log(`   Failed: ${errorCount}`);
      console.log(`   Total (success + skipped + failed): ${actualTotal}`);

      const finalErrors = errors.slice(-500);

      onProgress?.({
        type: 'complete',
        total: rowIndex,
        processed: rowIndex,
        successful: successCount,
        failed: errorCount,
        skipped: skippedCount,
        errors: finalErrors,
      });

      return {
        total: rowIndex,
        processed: rowIndex,
        successful: successCount,
        failed: errorCount,
        skipped: skippedCount,
        errors: finalErrors,
      };
    } catch (error) {
      onProgress?.({
        type: 'error',
        error: error.message,
      });
      throw error;
    }
  }
}

