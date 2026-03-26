// src/app/api/contacts/search/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import Contact from '@/models/schemas/Contact';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { normalizePhoneNumber } from '@/utils/normalizers';

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);
    
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!q || q.length < 2) {
      return NextResponse.json({
        success: true,
        data: []
      });
    }

    // Escape special regex characters in search query for text fields
    // This prevents "nothing to repeat" errors when search contains +, *, ?, etc.
    const escapedSearch = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Build search conditions
    const searchConditions = [
      { name: { $regex: escapedSearch, $options: 'i' } },
      { email: { $regex: escapedSearch, $options: 'i' } }
    ];

    // Check if search query looks like a phone number (contains digits)
    const hasDigits = /\d/.test(q);
    
    if (hasDigits) {
      // Normalize the search query to E.164 format
      const normalizedSearch = normalizePhoneNumber(q);
      // Remove all non-digits for flexible matching
      const digitsOnly = q.replace(/\D/g, '');
      const normalizedDigitsOnly = normalizedSearch.replace(/\D/g, '');
      
      // Generate all possible phone number variations for searching
      const phoneVariations = new Set();
      
      // Add original search (if it has digits)
      if (digitsOnly.length > 0) {
        phoneVariations.add(q.trim());
        phoneVariations.add(normalizedSearch);
        phoneVariations.add(normalizedSearch.replace(/^\+/, ''));
        phoneVariations.add(digitsOnly);
        phoneVariations.add(normalizedDigitsOnly);
        phoneVariations.add(`+${digitsOnly}`);
        phoneVariations.add(`+${normalizedDigitsOnly}`);
        // No spaces version
        phoneVariations.add(q.replace(/\s/g, '').trim());
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
            console.error('[Contacts Search] Regex pattern failed, skipping regex search:', regexError.message);
            // Skip regex search, rely on exact matches only
            // The exact matches ($in) should be sufficient for most cases
          }
        }
      }
    } else {
      // If it doesn't look like a phone number, just do a simple regex search on phone field
      searchConditions.push({ phone: { $regex: q, $options: 'i' } });
    }

    const contacts = await Contact.find({
      $or: searchConditions
    })
      .select('name email phone avatar')
      .limit(limit)
      .lean();

    return NextResponse.json({
      success: true,
      data: contacts
    });
  } catch (error) {
    console.error('Search contacts error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to search contacts' },
      { status: 500 }
    );
  }
}