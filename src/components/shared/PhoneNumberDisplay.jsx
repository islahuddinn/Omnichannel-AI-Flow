'use client';

import parsePhoneNumber, { AsYouType } from 'libphonenumber-js';
import CountryFlag from '@/components/shared/CountryFlag';

/**
 * Converts a 2-letter country code (ISO 3166-1 alpha-2) to a flag emoji.
 * @param {string} countryCode - Two-letter country code (e.g., 'US', 'PK', 'SK').
 * @returns {string} - Flag emoji or empty string if invalid.
 */
function getCountryFlag(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '';
  
  // Convert country code to uppercase
  const code = countryCode.toUpperCase();
  
  // Convert each letter to Regional Indicator Symbol
  // 'A' = 0x1F1E6 (Regional Indicator Symbol Letter A)
  const codePointA = 0x1F1E6; // 'A' in Regional Indicator Symbols
  const firstChar = code.charCodeAt(0) - 0x41 + codePointA;
  const secondChar = code.charCodeAt(1) - 0x41 + codePointA;
  
  // Check if valid range (A-Z)
  if (firstChar < codePointA || firstChar > codePointA + 25 ||
      secondChar < codePointA || secondChar > codePointA + 25) {
    return '';
  }
  
  // Return flag emoji
  return String.fromCodePoint(firstChar, secondChar);
}

/**
 * Reusable component to display a phone number in international format with country flag.
 * Handles parsing, validation, and fallback formatting using libphonenumber-js.
 * Supports all countries worldwide (200+ countries) with country-specific formatting rules.
 * @param {string} phone - The raw phone number string (e.g., '+9231774723' or '923 17 74 723').
 * @param {boolean} showFlag - Whether to show the country flag (default: true).
 * @returns {JSX.Element} - Formatted phone number with flag or fallback.
 */
export default function PhoneNumberDisplay({ phone, showFlag = true }) {
  const formatPhoneNumberLib = (phoneNumber) => {
    if (!phoneNumber) return { formatted: '-', countryCode: null };
    
    // ✅ Clean the phone number - preserve + sign
    let cleaned = phoneNumber.toString().trim();
    const hasPlus = cleaned.startsWith('+');
    
    // ✅ Try parsing with libphonenumber-js first
    try {
      let phoneToParse = cleaned;
      
      // If no +, add it for parsing
      if (!hasPlus) {
        phoneToParse = `+${cleaned.replace(/\D/g, '')}`;
      }
      
      const parsed = parsePhoneNumber(phoneToParse);
      
      // ✅ If parsing succeeded and is valid, format it internationally
      if (parsed && parsed.isValid()) {
        return {
          formatted: parsed.formatInternational(),
          countryCode: parsed.country || null
        };
      }
    } catch (error) {
      // If parsing fails, continue to fallback
    }
    
    // ✅ Fallback: Use AsYouType formatter for better formatting
    try {
      const formatter = new AsYouType();
      const phoneToFormat = hasPlus ? cleaned : `+${cleaned.replace(/\D/g, '')}`;
      const formatted = formatter.input(phoneToFormat);
      if (formatted && formatted.length > 0) {
        // Try to get country from formatter
        const country = formatter.getCountry();
        return {
          formatted: formatted,
          countryCode: country || null
        };
      }
    } catch (error) {
      // Continue to basic fallback
    }
    
    // ✅ Final fallback: Basic formatting with proper spacing
    const digitsOnly = cleaned.replace(/\D/g, '');
    if (digitsOnly.length === 0) return { formatted: '-', countryCode: null };
    
    // Basic grouping: country code (1-3 digits) + rest grouped by 3 digits
    let formattedNumber = '';
    let detectedCountryCode = null;
    
    if (digitsOnly.length > 3) {
      // Try to detect country code (usually 1-3 digits)
      let countryCode = '';
      let rest = '';
      
      // Common country codes: 1 digit (US: +1), 2 digits (most countries: +92, +44), 3 digits (some: +421)
      if (digitsOnly.length >= 4) {
        // Try 1-digit country code first (US, Canada) - only if total length is 11
        if (digitsOnly[0] === '1' && digitsOnly.length === 11) {
          countryCode = '+1';
          rest = digitsOnly.substring(1);
          detectedCountryCode = 'US'; // Default to US for +1
        } else if (digitsOnly.length >= 5) {
          // Try 2-digit country code (most common: +92, +44, +33, etc.)
          countryCode = `+${digitsOnly.substring(0, 2)}`;
          rest = digitsOnly.substring(2);
        } else {
          // Fallback: use first 3 digits as country code
          countryCode = `+${digitsOnly.substring(0, 3)}`;
          rest = digitsOnly.substring(3);
        }
      } else {
        return { formatted: `+${digitsOnly}`, countryCode: null };
      }
      
      // Group rest by 3 digits
      if (rest.length > 0) {
        const groups = rest.match(/.{1,3}/g);
        if (groups && groups.length > 0) {
          formattedNumber = `${countryCode} ${groups.join(' ')}`;
        } else {
          formattedNumber = `${countryCode} ${rest}`;
        }
      } else {
        formattedNumber = countryCode;
      }
    } else {
      formattedNumber = `+${digitsOnly}`;
    }
    
    return { formatted: formattedNumber, countryCode: detectedCountryCode };
  };
  
  const { formatted, countryCode } = formatPhoneNumberLib(phone);

  return (
    <span className="font-mono text-sm inline-flex items-center gap-1.5 min-w-0 max-w-full">
      {showFlag && countryCode && <CountryFlag countryCode={countryCode} size={18} className="flex-shrink-0" />}
      <span className="truncate">{formatted}</span>
    </span>
  );
}