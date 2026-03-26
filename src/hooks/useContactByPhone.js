// src/hooks/useContactByPhone.js
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { normalizePhone } from '@/utils/callCenter/callUtils';

/**
 * Hook to fetch contact by phone number
 * @param {string} phoneNumber - Phone number to search for
 * @param {object} options - Query options
 * @returns {object} Query result with contact data
 */
export function useContactByPhone(phoneNumber, options = {}) {
  const { enabled = true, ...queryOptions } = options;

  return useQuery({
    queryKey: ['contact', 'by-phone', phoneNumber],
    queryFn: async () => {
      if (!phoneNumber || phoneNumber === 'Unknown') {
        return null;
      }

      // Normalize phone number for search
      const normalizedPhone = normalizePhone(phoneNumber);
      
      if (!normalizedPhone || normalizedPhone.length < 10) {
        return null;
      }

      try {
        // Search contacts by phone number
        const response = await apiClient.get('/contacts', {
          params: {
            search: normalizedPhone,
            limit: 1, // We only need the first match
          },
        });

        const contacts = response?.data || [];
        
        // Find the best match by comparing normalized phone numbers
        // The API might return multiple results, so we need to find the exact match
        const matchingContact = contacts.find((contact) => {
          const contactPhones = [
            contact.phone,
            contact.normalizedPhone,
            contact.identifiers?.phone,
            contact.identifiers?.sms,
            contact.identifiers?.whatsapp,
            contact.identifiers?.call,
          ].filter(Boolean);

          return contactPhones.some((contactPhone) => {
            const normalizedContactPhone = normalizePhone(String(contactPhone));
            // Match if last 10 digits are the same
            return (
              normalizedContactPhone.slice(-10) === normalizedPhone.slice(-10) &&
              normalizedContactPhone.length >= 10
            );
          });
        });

        return matchingContact || null;
      } catch (error) {
        console.error('Error fetching contact by phone:', error);
        return null;
      }
    },
    enabled: enabled && !!phoneNumber && phoneNumber !== 'Unknown',
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    ...queryOptions,
  });
}

