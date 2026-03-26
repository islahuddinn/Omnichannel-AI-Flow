// src/utils/callCenter/getIp.js
/**
 * Get user's public IP address
 */
export const getIp = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch IP');
      }
      
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error('Error fetching IP:', error);
      // Fallback: try alternative service
      try {
        const response = await fetch('https://ipapi.co/ip/', {
          method: 'GET',
        });
        if (response.ok) {
          const ip = await response.text();
          return ip.trim();
        }
      } catch (fallbackError) {
        console.error('Fallback IP fetch failed:', fallbackError);
      }
      return null;
    }
  };
  