'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { countries } from '@/utils/countries';
import { Search, ChevronDown } from 'lucide-react';
import CountryFlag from '@/components/shared/CountryFlag';
import { parsePhoneNumber, AsYouType, isValidPhoneNumber, getCountryCallingCode } from 'libphonenumber-js';
import { cn } from '@/lib/utils';

/**
 * Converts a 2-letter country code (ISO 3166-1 alpha-2) to a flag emoji.
 * This method uses code points for better cross-platform compatibility (Windows/Linux).
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
  
  // Return flag emoji using code points for better cross-platform support
  return String.fromCodePoint(firstChar, secondChar);
}

export default function PhoneInput({ value, onChange, error, placeholder = 'Enter phone number', disabled = false }) {
  // ✅ Priority countries: Slovakia first, Czech Republic second, then all others
  const sortedCountries = React.useMemo(() => {
    const skCountry = countries.find(c => c.code === 'SK');
    const czCountry = countries.find(c => c.code === 'CZ');
    const otherCountries = countries.filter(c => c.code !== 'SK' && c.code !== 'CZ');

    return [
      ...(skCountry ? [skCountry] : []),
      ...(czCountry ? [czCountry] : []),
      ...otherCountries
    ];
  }, []);

  // ✅ Default to Slovakia (first country in sortedCountries)
  const defaultCountry = sortedCountries.find(c => c.code === 'SK') || sortedCountries[0];

  const [phone, setPhone] = useState(''); // Raw digits only
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry); // ✅ Initialize with Slovakia
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const searchInputRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const lastEmittedValueRef = useRef('');
  const previousValueRef = useRef(undefined); // ✅ Initialize as undefined to ensure first value is processed

  // Filter countries based on search
  const filteredCountries = sortedCountries.filter(country =>
    country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    country.dialCode.includes(searchQuery) ||
    country.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ✅ Update onChange ref when it changes
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // ✅ Parse value prop using libphonenumber-js
  // ✅ CRITICAL: Only update internal state if value prop actually changed (prevent infinite loops)
  useEffect(() => {
    // ✅ Skip if value hasn't actually changed (but allow undefined -> value transition)
    // Also allow empty string -> value transition (important for edit forms)
    const valueChanged = previousValueRef.current !== value;
    const isEmptyToValue = (previousValueRef.current === '' || previousValueRef.current === undefined) && value && value.length > 0;

    if (!valueChanged && !isEmptyToValue) {
      return;
    }

    // ✅ Check if this update is just an "echo" of what we just emitted
    if (value === lastEmittedValueRef.current) {
      return;
    }

    // ✅ Update ref before processing to prevent loops
    previousValueRef.current = value;

    if (value) {
      try {
        // Try to parse as international number
        const numberWithPlus = value.startsWith('+') ? value : `+${value}`;
        const phoneNumber = parsePhoneNumber(numberWithPlus);

        if (phoneNumber && phoneNumber.country) {
          // ✅ Find country by country code
          const matchedCountry = sortedCountries.find(c => c.code === phoneNumber.country);

          if (matchedCountry) {
            setSelectedCountry(matchedCountry);
            // ✅ Remove leading "0" from national number to match table format
            // Some countries (like Slovakia, Czech Republic) include leading 0 in national format
            // but we want to display without it to match the international format in the table
            let nationalNumber = phoneNumber.nationalNumber;
            if (nationalNumber.startsWith('0')) {
              nationalNumber = nationalNumber.substring(1);
            }
            setPhone(nationalNumber);
            return;
          }
        }
      } catch (error) {
        // If parsing fails, try manual detection
      }

      // ✅ Fallback: Manual country code detection (longest match first)
      const cleanValue = value.replace(/^\+/, '');
      let matchedCountry = null;
      let longestMatch = 0;

      for (const country of sortedCountries) {
        const dialCodeWithoutPlus = country.dialCode.replace('+', '');
        if (cleanValue.startsWith(dialCodeWithoutPlus) && dialCodeWithoutPlus.length > longestMatch) {
          longestMatch = dialCodeWithoutPlus.length;
          matchedCountry = country;
        }
      }

      if (matchedCountry) {
        setSelectedCountry(matchedCountry);
        let numberWithoutCode = cleanValue.substring(matchedCountry.dialCode.replace('+', '').length);
        // ✅ Remove leading "0" from number to match table format
        if (numberWithoutCode.startsWith('0')) {
          numberWithoutCode = numberWithoutCode.substring(1);
        }
        setPhone(numberWithoutCode);
      } else {
        // ✅ Default to Slovakia
        const defaultCountry = sortedCountries.find(c => c.code === 'SK') || sortedCountries[0];
        setSelectedCountry(defaultCountry);
        setPhone(cleanValue);
      }
    } else {
      // ✅ Set default country to Slovakia
      const defaultCountry = sortedCountries.find(c => c.code === 'SK') || sortedCountries[0];
      setSelectedCountry(defaultCountry);
      setPhone('');
    }
  }, [value, sortedCountries]);

  // ✅ Emit E.164 format when phone or country changes
  // ✅ CRITICAL: Only emit when user actually types, not when value prop changes externally
  useEffect(() => {
    // ✅ Skip if value prop matches what we would emit (prevent infinite loops)
    if (!selectedCountry) return;

    // ✅ Calculate what we would emit
    let fullNumberToEmit = '';

    if (phone) {
      try {
        // Try to format as E.164
        const phoneNumber = parsePhoneNumber(phone, selectedCountry.code);
        if (phoneNumber && phoneNumber.isValid()) {
          fullNumberToEmit = phoneNumber.format('E.164'); // +421912345678
        } else {
          // ✅ Fallback: construct manually if not yet valid
          fullNumberToEmit = selectedCountry.dialCode + phone.replace(/\D/g, '');
        }
      } catch (error) {
        // ✅ Fallback: construct manually
        fullNumberToEmit = selectedCountry.dialCode + phone.replace(/\D/g, '');
      }
    } else {
      fullNumberToEmit = '';
    }

    // ✅ Only emit if:
    // 1. The value we would emit is different from what we last emitted
    // 2. The value we would emit is different from the current value prop (prevents loop)
    if (fullNumberToEmit !== lastEmittedValueRef.current) {
      lastEmittedValueRef.current = fullNumberToEmit;
      onChangeRef.current?.(fullNumberToEmit);
    }
  }, [selectedCountry, phone]);

  const handleCountrySelect = (country) => {
    setSelectedCountry(country);
    setIsOpen(false);
    setSearchQuery('');
    // ✅ When country changes, do NOT truncate existing phone number
    // Allow the full number to remain - user can edit if needed
  };

  // ✅ Get maximum length for national number based on country using libphonenumber-js metadata
  // ✅ This uses ITU-T E.164 standards and libphonenumber metadata for accurate limits
  const getMaxNationalLength = React.useCallback((countryCode) => {
    if (!countryCode) return 15; // Default max length
    
    // ✅ Comprehensive country-specific maximum lengths based on libphonenumber-js metadata
    // ✅ These are the actual maximum lengths for national numbers (without country code)
    const countryMaxLengths = {
      // North America
      'US': 10, 'CA': 10, 'PR': 10, 'DO': 10, 'JM': 10, 'BS': 10, 'BB': 10, 'AG': 10, 'VG': 10, 'VI': 10,
      // Europe - Western
      'GB': 10, 'IE': 9, 'FR': 9, 'DE': 11, 'IT': 10, 'ES': 9, 'PT': 9, 'NL': 9, 'BE': 9, 'CH': 9,
      'AT': 10, 'SE': 9, 'NO': 8, 'DK': 8, 'FI': 9, 'PL': 9, 'GR': 10, 'TR': 10,
      // Europe - Central/Eastern
      'SK': 9, 'CZ': 9, 'HU': 9, 'RO': 9, 'BG': 9, 'HR': 9, 'SI': 8, 'EE': 8, 'LV': 8, 'LT': 8,
      'RS': 9, 'BA': 8, 'MK': 8, 'AL': 9, 'ME': 8, 'XK': 8,
      // Europe - Eastern
      'RU': 10, 'UA': 9, 'BY': 9, 'MD': 8, 'GE': 9, 'AM': 8, 'AZ': 9, 'KZ': 10,
      // Middle East
      'AE': 9, 'SA': 9, 'IQ': 10, 'IR': 10, 'IL': 9, 'JO': 9, 'LB': 8, 'SY': 9, 'YE': 9, 'OM': 8,
      'KW': 8, 'QA': 8, 'BH': 8, 'EG': 10,
      // South Asia
      'IN': 10, 'PK': 10, 'BD': 10, 'LK': 9, 'NP': 10, 'BT': 8, 'MV': 7, 'AF': 9,
      // East Asia
      'CN': 11, 'JP': 10, 'KR': 10, 'TW': 9, 'HK': 8, 'MO': 8, 'SG': 8, 'MY': 9, 'TH': 9,
      'VN': 9, 'PH': 10, 'ID': 10, 'MM': 9, 'KH': 9, 'LA': 9,
      // Oceania
      'AU': 9, 'NZ': 8, 'FJ': 7, 'PG': 8, 'NC': 6, 'PF': 6,
      // Africa
      'ZA': 9, 'NG': 10, 'KE': 9, 'GH': 9, 'TZ': 9, 'UG': 9, 'ET': 9, 'MA': 9, 'DZ': 9, 'TN': 8,
      'EG': 10, 'SD': 9, 'AO': 9, 'MZ': 9, 'ZM': 9, 'ZW': 9, 'MW': 9, 'RW': 9,
      // Latin America
      'BR': 11, 'MX': 10, 'AR': 10, 'CO': 10, 'CL': 9, 'PE': 9, 'VE': 10, 'EC': 9, 'GT': 8,
      'CU': 8, 'BO': 8, 'DO': 10, 'HN': 8, 'PY': 9, 'SV': 8, 'NI': 8, 'CR': 8, 'PA': 8, 'UY': 8,
      // Other
      'TR': 10, 'KZ': 10, 'UZ': 9,
    };
    
    // ✅ Return country-specific max length or use library validation as fallback
    if (countryMaxLengths[countryCode]) {
      return countryMaxLengths[countryCode];
    }
    
    // ✅ Fallback: Use libphonenumber-js to determine max length
    try {
      const callingCode = getCountryCallingCode(countryCode);
      // Try different lengths to find the maximum valid length
      for (let length = 15; length >= 7; length--) {
        const testNumber = '1'.repeat(length);
        const fullNumber = `+${callingCode}${testNumber}`;
        try {
          const phoneNumber = parsePhoneNumber(fullNumber);
          if (phoneNumber && phoneNumber.country === countryCode) {
            // Check if the national number length matches
            const nationalLength = phoneNumber.nationalNumber.length;
            if (nationalLength <= length) {
              return Math.min(15, nationalLength + 1); // Add small buffer
            }
          }
        } catch (e) {
          continue;
        }
      }
    } catch (error) {
      // If all else fails, use safe default
    }
    
    // ✅ Safe default based on ITU-T E.164 (max 15 digits total, usually 9-12 for national)
    return 12;
  }, []);

  const handlePhoneChange = (e) => {
    const inputValue = e.target.value;

    if (!selectedCountry) {
      setPhone(inputValue.replace(/\D/g, ''));
      return;
    }

    // ✅ Extract only digits from input (remove formatting)
    const digitsOnly = inputValue.replace(/\D/g, '');
    
    // ✅ Do NOT truncate - allow full number to be entered
    // Use a reasonable maximum (E.164 allows up to 15 digits total, so allow up to 15 for national number)
    const maxReasonableLength = 15;
    const limitedDigits = digitsOnly.slice(0, maxReasonableLength);

    // ✅ Only update if actually different (prevent unnecessary re-renders)
    if (limitedDigits !== phone) {
      setPhone(limitedDigits);
    }
    
    // ✅ If user tried to type beyond reasonable limit, prevent it by resetting input value
    if (digitsOnly.length > maxReasonableLength) {
      // Force the input to show the limited value
      e.target.value = formattedDisplay;
    }
  };

  const handlePhonePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();

    if (!pastedData) return;

    // ✅ Try to parse as international number using libphonenumber-js
    try {
      const numberWithPlus = pastedData.startsWith('+') ? pastedData : `+${pastedData}`;
      const phoneNumber = parsePhoneNumber(numberWithPlus);

      if (phoneNumber && phoneNumber.country) {
        // ✅ Find country by country code
        const matchedCountry = sortedCountries.find(c => c.code === phoneNumber.country);

        if (matchedCountry) {
          setSelectedCountry(matchedCountry);
          // ✅ Preserve full national number without truncation
          let nationalNumber = phoneNumber.nationalNumber;
          // Remove leading "0" if present
          if (nationalNumber.startsWith('0')) {
            nationalNumber = nationalNumber.substring(1);
          }
          // ✅ Do NOT truncate - preserve full number
          setPhone(nationalNumber);
          return;
        }
      }
    } catch (error) {
      // If parsing fails, try manual detection
    }

    // ✅ Fallback: Manual country code detection (longest match first)
    const cleanData = pastedData.replace(/[^\d+]/g, '');

    if (cleanData.startsWith('+')) {
      const numberWithoutPlus = cleanData.substring(1);

      let matchedCountry = null;
      let longestMatch = 0;

      for (const country of sortedCountries) {
        const dialCodeWithoutPlus = country.dialCode.replace('+', '');
        if (numberWithoutPlus.startsWith(dialCodeWithoutPlus) && dialCodeWithoutPlus.length > longestMatch) {
          longestMatch = dialCodeWithoutPlus.length;
          matchedCountry = country;
        }
      }

      if (matchedCountry) {
        setSelectedCountry(matchedCountry);
        let phoneNumber = numberWithoutPlus.substring(matchedCountry.dialCode.replace('+', '').length);
        // Remove leading "0" if present
        if (phoneNumber.startsWith('0')) {
          phoneNumber = phoneNumber.substring(1);
        }
        // ✅ Do NOT truncate - preserve full number
        setPhone(phoneNumber);
      } else {
        // ✅ Default to Slovakia or selected country
        const defaultCountry = selectedCountry || sortedCountries.find(c => c.code === 'SK') || sortedCountries[0];
        setSelectedCountry(defaultCountry);
        // ✅ Do NOT truncate - preserve full number
        setPhone(numberWithoutPlus);
      }
    } else {
      // Just paste as phone number (use current country)
      const cleaned = cleanData.replace(/\D/g, '');
      // ✅ Do NOT truncate - preserve full number
      setPhone(cleaned);
    }
  };

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // ✅ Format phone number for display using AsYouType
  const getFormattedDisplay = () => {
    if (!phone || !selectedCountry) return '';

    try {
      // ✅ Try to parse and format the phone number
      // We need to add the country code back for parsing, then format without leading 0
      const fullNumber = selectedCountry.dialCode + phone.replace(/\D/g, '');
      const phoneNumber = parsePhoneNumber(fullNumber);

      if (phoneNumber && phoneNumber.isValid()) {
        // ✅ Get the international format and remove country code to match table format
        const internationalFormat = phoneNumber.formatInternational();
        // Remove country code prefix (e.g., "+421 " from "+421 911 691 781")
        const dialCodeWithSpace = selectedCountry.dialCode + ' ';
        if (internationalFormat.startsWith(dialCodeWithSpace)) {
          return internationalFormat.substring(dialCodeWithSpace.length);
        }
        // Fallback: try to remove just the dial code
        if (internationalFormat.startsWith(selectedCountry.dialCode)) {
          return internationalFormat.substring(selectedCountry.dialCode.length).trim();
        }
      }

      // ✅ Fallback: Use AsYouType formatter
      const formatter = new AsYouType(selectedCountry.code);
      const formatted = formatter.input(phone);

      if (formatted) {
        // Remove country code if present
        const dialCode = selectedCountry.dialCode.replace('+', '');
        if (formatted.startsWith(dialCode)) {
          let result = formatted.substring(dialCode.length).trim();
          // Remove leading "0" if present
          if (result.startsWith('0')) {
            result = result.substring(1).trim();
          }
          return result;
        }
        // Remove leading "0" if present
        if (formatted.startsWith('0')) {
          return formatted.substring(1).trim();
        }
        return formatted;
      }
    } catch (error) {
      // Fallback to simple formatting
    }

    // ✅ Fallback: Simple formatting with spaces, remove leading 0
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }
    return cleaned.match(/.{1,3}/g)?.join(' ') || cleaned;
  };

  const formattedDisplay = getFormattedDisplay();

  return (
    <div className="space-y-1.5 phone-input-container">
      <div className="flex">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className="px-3 py-2 border border-input rounded-lg hover:bg-accent text-foreground bg-input disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 transition-colors"
            >
              {selectedCountry && (
                <>
                  <CountryFlag countryCode={selectedCountry.code} size={20} />
                  <span className="text-sm font-medium text-foreground">{selectedCountry.dialCode}</span>
                </>
              )}
              <ChevronDown className="h-4 w-4 opacity-50 text-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search country..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 pl-8 border border-input rounded-md text-foreground bg-input placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
                />
              </div>
            </div>
            <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
              {filteredCountries.map((country) => (
                <Button
                  key={country.code}
                  type="button"
                  variant="ghost"
                  className="w-full justify-start px-3 py-2 h-auto"
                  onClick={() => handleCountrySelect(country)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <CountryFlag countryCode={country.code} size={24} />
                    <div className="flex-1 text-left">
                      <div className="font-medium text-foreground">{country.name}</div>
                      <div className="text-sm text-muted-foreground">{country.dialCode}</div>
                    </div>
                    {selectedCountry?.code === country.code && (
                      <div className="text-primary">✓</div>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <input
          type="tel"
          value={formattedDisplay}
          onChange={handlePhoneChange}
          onPaste={handlePhonePaste}
          onKeyDown={(e) => {
            // ✅ Use reasonable maximum (E.164 allows up to 15 digits total)
            if (!selectedCountry) return;
            
            const maxReasonableLength = 15;
            const digitsOnly = phone.replace(/\D/g, '');
            
            // Allow control keys (backspace, delete, arrow keys, tab, etc.)
            if (e.key === 'Backspace' || e.key === 'Delete' || 
                e.key === 'ArrowLeft' || e.key === 'ArrowRight' || 
                e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                e.key === 'Tab' || e.key === 'Enter' ||
                e.ctrlKey || e.metaKey || e.altKey) {
              return;
            }
            
            // ✅ Prevent typing only if we've reached reasonable maximum (15 digits)
            if (digitsOnly.length >= maxReasonableLength && /\d/.test(e.key)) {
              e.preventDefault();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "w-full px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-foreground bg-input placeholder:text-muted-foreground transition-colors",
            error && "border-red-500 focus:border-red-500 focus:ring-red-500"
          )}
        />
      </div>

      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
