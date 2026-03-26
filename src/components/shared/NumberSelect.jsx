// src/components/shared/NumberSelect.jsx
'use client';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from "react";
import { Phone } from "lucide-react";
import { useCallCenterStore } from "@/store/useCallCenterStore";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";

const NumberSelect = ({
  isFromUserProfile = false,
  userId = null,
}) => {
  const { user } = useAuth();
  const actualUserId = userId || user?.id || user?.userId;


  console.log(actualUserId,"actualUserId")
  
  // Get state from store
  const availableOutboundNumbers = useCallCenterStore((state) => state.availableOutboundNumbers);
  const selectedOutboundNumber = useCallCenterStore((state) => state.selectedOutboundNumber);
  const isUserInException = useCallCenterStore((state) => state.isUserInException);
  const setSelectedOutboundNumber = useCallCenterStore((state) => state.setSelectedOutboundNumber);
  const setAvailableOutboundNumbers = useCallCenterStore((state) => state.setAvailableOutboundNumbers);
  const setIsUserInException = useCallCenterStore((state) => state.setIsUserInException);
  
  const EXTENSION_STORAGE_KEY = "selectedExtension";
  const OUTBOUND_STORAGE_KEY = "selectedOutboundNumber";

  // Fetch user profile to get outbound numbers
  // const { data: userProfile } = useQuery({
  //   queryKey: ['user-profile', actualUserId],
  //   queryFn: async () => {
  //     const response = await apiClient.get('/users/profile');
  //     return response;
  //   },
  //   staleTime: 300000, // 5 minutes
  // });

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const response = await apiClient.get('/users/profile');
      return response;
    },
    // enabled: !!user,
    staleTime: 300000, // 5 minutes
  });



  console.log(userProfile,"userProfile NumberSelect")
  // Update available outbound numbers from user profile
  useEffect(() => {
    if (userProfile?.outbound_phone_number) {
      const numbers = userProfile.outbound_phone_number.map(number => ({
        number: number,
        isPrimary: number === userProfile.primary_outbound_phone_number
      }));
      setAvailableOutboundNumbers(numbers);
      setIsUserInException(userProfile?.isInException || false);
      
      // Set default if none selected
      if (!selectedOutboundNumber && userProfile.primary_outbound_phone_number) {
        setSelectedOutboundNumber(userProfile.primary_outbound_phone_number);
      }
    }
  }, [userProfile, setAvailableOutboundNumbers, setIsUserInException, selectedOutboundNumber, setSelectedOutboundNumber]);

  // Safe localStorage access
  const getStoredValue = (key) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return localStorage.getItem(key);
      }
      return null;
    } catch (error) {
      console.error('Error accessing localStorage:', error);
      return null;
    }
  };

  const setStoredValue = (key, value) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      console.error('Error setting localStorage:', error);
    }
  };

  // Create outbound number options
  const outboundNumberOptions = availableOutboundNumbers.map(num => ({
    value: num.number,
    label: num.number,
    isPrimary: num.isPrimary,
  }));

  // Initialize from storage if in user profile
  useEffect(() => {
    if (isFromUserProfile && availableOutboundNumbers.length > 0) {
      const storedOutboundNumber = getStoredValue(OUTBOUND_STORAGE_KEY);
      if (storedOutboundNumber && availableOutboundNumbers.find(num => num.number === storedOutboundNumber)) {
        if (storedOutboundNumber !== selectedOutboundNumber) {
          setSelectedOutboundNumber(storedOutboundNumber);
          console.log('Restored outbound number from storage:', storedOutboundNumber);
        }
      }
    }
  }, [isFromUserProfile, availableOutboundNumbers, selectedOutboundNumber, setSelectedOutboundNumber]);

  // Set primary as default if none selected
  useEffect(() => {
    if (!selectedOutboundNumber && availableOutboundNumbers.length > 0) {
      const primaryOutbound = availableOutboundNumbers.find(num => num.isPrimary) || availableOutboundNumbers[0];
      setSelectedOutboundNumber(primaryOutbound.number);
      if (isFromUserProfile) {
        setStoredValue(OUTBOUND_STORAGE_KEY, primaryOutbound.number);
      }
      console.log('Set default outbound number:', primaryOutbound.number);
    }
  }, [selectedOutboundNumber, availableOutboundNumbers, setSelectedOutboundNumber, isFromUserProfile]);

  const handleOutboundNumberChange = (newValue) => {
    setSelectedOutboundNumber(newValue);
    if (isFromUserProfile) {
      setStoredValue(OUTBOUND_STORAGE_KEY, newValue);
    }
    console.log('Outbound number manually changed to:', newValue);
  };

  const selectedOutboundOption = selectedOutboundNumber
    ? outboundNumberOptions.find(opt => opt.value === selectedOutboundNumber)
    : outboundNumberOptions.find(opt => opt.isPrimary) || outboundNumberOptions[0];

  // Show loading state instead of returning null
  if (availableOutboundNumbers.length === 0) {
    // Check if we're still loading
    if (!userProfile) {
      return (
        <div className="space-y-3">
          <div className="flex gap-5 items-center">
            <div className="w-[180px] h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          </div>
        </div>
      );
    }
    // If profile loaded but no numbers, return null
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-5 items-center">
        <div>
          <div className="space-y-1">
            <Select
              value={selectedOutboundOption?.value || ''}
              onValueChange={handleOutboundNumberChange}
            >
              <SelectTrigger className="w-full min-w-[180px] border border-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-ring">
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Phone size={14} className="text-gray-500 flex-shrink-0" />
                    <SelectValue>
                      {selectedOutboundOption ? (
                        <div className="flex items-center gap-1 truncate">
                          <span className="text-sm">{selectedOutboundOption.value}</span>
                          {selectedOutboundOption.isPrimary && (
                            <span className="text-xs text-primary font-medium whitespace-nowrap">
                              (Primary)
                            </span>
                          )}

                          {isUserInException && (
                            <span className="text-xs text-primary font-medium whitespace-nowrap">
                              (Exception user)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500 text-sm">Select number</span>
                      )}
                    </SelectValue>
                  </div>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {outboundNumberOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="py-2 px-3"
                    >
                      <div className="flex items-center justify-between w-full gap-3">
                        <div className="flex items-center gap-2">
                          <Phone size={12} className="text-gray-500" />
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-sm">{option.value}</span>
                              {option.isPrimary && (
                                <span className="text-xs text-primary font-medium bg-primary/10 px-1 rounded">
                                  Primary
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">
                              Caller ID for outbound calls
                            </span>
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NumberSelect;
