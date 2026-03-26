// src/lib/utils/nameFormatter.js
/**
 * Format contact name for display
 * - Single name: returns the name as is (first name only)
 * - Multiple names: returns formatted name
 * 
 * @param {string|null|undefined} name - The contact name to format
 * @returns {string} Formatted name
 */
export function formatContactName(name) {
  if (!name || typeof name !== 'string') return 'Unknown';
  
  const nameParts = name.trim().split(/\s+/).filter(part => part.length > 0);
  
  if (nameParts.length === 0) return 'Unknown';
  
  // If single name, return as is (first name only)
  if (nameParts.length === 1) {
    return nameParts[0];
  }
  
  // If 2 or more names, return formatted
  return nameParts.join(' ');
}

/**
 * Get initials from a contact name
 * @param {string|null|undefined} name - The contact name
 * @returns {string} Initials (1 letter for single name, 2 letters for multiple)
 */
export function getContactInitials(name) {
  if (!name || typeof name !== 'string') return 'U';
  
  const nameParts = name.trim().split(/\s+/).filter(part => part.length > 0);
  
  if (nameParts.length === 0) return 'U';
  
  if (nameParts.length === 1) {
    return nameParts[0][0]?.toUpperCase() || 'U';
  }
  
  // First letter of first name + first letter of last name
  return (nameParts[0][0] + (nameParts[nameParts.length - 1][0] || '')).toUpperCase();
}

