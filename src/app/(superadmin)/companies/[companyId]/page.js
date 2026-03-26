// src/app/(superadmin)/companies/[id]/page.js
'use client';

import { use } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Users, MessageSquare, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StatusBadge from '@/components/shared/StatusBadge';
import apiClient from '@/lib/api/client';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { formatDistanceToNow } from 'date-fns';
import PhoneNumberDisplay from '@/components/shared/PhoneNumberDisplay';
import parsePhoneNumber from 'libphonenumber-js';

export default function CompanyDetailsPage({ params }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { companyId: id } = use(params);

  const { data: company, isLoading, error } = useQuery({
    queryKey: ['company', id],
    queryFn: () => apiClient.get(`/companies/${id}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !company?.data) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Company Not Found
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            The company you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <Button
            onClick={() => router.push('/companies')}
            className="mt-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        </div>
      </div>
    );
  }

  const companyData = company.data;

  const getStatusBadge = (status) => {
    const isActive = status === 'active' || status === 'trial';
    let activeLabel = 'Active';
    let inactiveLabel = 'Inactive';
    
    if (status === 'trial') {
      activeLabel = 'Trial';
    } else if (status === 'suspended') {
      inactiveLabel = 'Suspended';
    } else if (status === 'expired') {
      inactiveLabel = 'Expired';
    } else if (status === 'inactive') {
      inactiveLabel = 'Inactive';
    }
    
    return (
      <StatusBadge 
        isActive={isActive} 
        activeLabel={activeLabel}
        inactiveLabel={inactiveLabel}
      />
    );
  };

  // Format phone number with country code badge
  const formatPhoneWithBadge = (phone) => {
    if (!phone || phone === 'N/A') return null;
    
    try {
      let phoneToParse = phone;
      if (!phoneToParse.startsWith('+')) {
        phoneToParse = `+${phoneToParse.replace(/\D/g, '')}`;
      }
      const parsed = parsePhoneNumber(phoneToParse);
      if (parsed && parsed.isValid()) {
        const countryCode = parsed.country || null;
        const nationalNumber = parsed.nationalNumber;
        return { countryCode, number: nationalNumber };
      }
    } catch (error) {
      // Fallback parsing
    }
    
    // Fallback: try to extract country code
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('92') && cleaned.length > 2) {
      return { countryCode: 'PK', number: cleaned.substring(2) };
    }
    // Try to extract first 2 digits as country code
    if (cleaned.length > 2) {
      const potentialCountryCode = cleaned.substring(0, 2);
      return { countryCode: potentialCountryCode, number: cleaned.substring(2) };
    }
    return { countryCode: null, number: phone };
  };

  // Format address
  const formatAddress = (address) => {
    if (!address) return 'N/A';
    const parts = [];
    if (address.city) parts.push(address.city);
    if (address.country) parts.push(address.country);
    if (address.zipCode) parts.push(address.zipCode);
    return parts.length > 0 ? parts.join(', ') : 'N/A';
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/companies')}
            className="flex-shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 truncate"
                  style={{
                    fontFamily: 'Nunito Sans, sans-serif'
                  }}>
                {companyData.name}
              </h1>
              {companyData.status === 'active' || companyData.status === 'trial' ? (
                <div className="inline-flex items-center gap-1 px-2 py-1 bg-[#D7EDE1] dark:bg-green-900/30 border border-[#00B69B] dark:border-green-500 rounded-[22.5px]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#25C79F] dark:bg-green-400"></div>
                  <span className="text-xs font-semibold text-[#1DC0A2] dark:text-green-400"
                        style={{
                          fontFamily: 'Nunito Sans, sans-serif',
                          fontWeight: 600,
                          fontSize: '12px',
                          lineHeight: '16px'
                        }}>
                    Active
                  </span>
                </div>
              ) : (
                getStatusBadge(companyData.status)
              )}
            </div>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1 truncate"
               style={{
                 fontFamily: 'Nunito Sans, sans-serif'
               }}>
              {companyData.email && companyData.email !== 'N/A' ? companyData.email : 'No email provided'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[15px]">
        {/* Total Users Card */}
        <Card className="border-0 p-0 bg-white dark:bg-gray-800" 
              style={{
                boxShadow: '6px 6px 54px rgba(0, 0, 0, 0.05)',
                borderRadius: '14px',
                minHeight: '134px'
              }}>
          <CardContent className="p-0">
            <div className="flex flex-row items-center justify-between px-3 pt-3 pb-0 gap-4">
              <h3 className="text-base font-semibold text-[#202224] dark:text-gray-200 flex-1" 
                  style={{
                    fontFamily: 'Nunito Sans, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    lineHeight: '22px',
                    opacity: 0.7
                  }}>
                Total Users
              </h3>
              <div className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0 bg-[#E9EFFD] dark:bg-blue-900/30"
                   style={{
                     borderRadius: '12px'
                   }}>
                <Users className="w-[27px] h-[24px] text-[#4880FF] dark:text-blue-400" />
              </div>
            </div>
            <div className="flex flex-col items-start px-3 pt-3 pb-3">
              <div className="text-[28px] font-bold text-[#202224] dark:text-gray-100 leading-[38px] tracking-[1px]"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '28px',
                     lineHeight: '38px',
                     letterSpacing: '1px'
                   }}>
                {companyData.metadata?.totalUsers || 0}
              </div>
              <p className="text-sm font-semibold text-[#00B69B] dark:text-green-400 mt-1"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px',
                   opacity: 0.7
                 }}>
                {companyData.metadata?.activeUsers || 0} Active
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Conversations Card */}
        <Card className="border-0 p-0 bg-white dark:bg-gray-800" 
              style={{
                boxShadow: '6px 6px 54px rgba(0, 0, 0, 0.05)',
                borderRadius: '14px',
                minHeight: '134px'
              }}>
          <CardContent className="p-0">
            <div className="flex flex-row items-center justify-between px-3 pt-3 pb-0 gap-4">
              <h3 className="text-base font-semibold text-[#202224] dark:text-gray-200 flex-1" 
                  style={{
                    fontFamily: 'Nunito Sans, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    lineHeight: '22px',
                    opacity: 0.7
                  }}>
                Total Conversations
              </h3>
              <div className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0 bg-[#E7F7F6] dark:bg-green-900/30"
                   style={{
                     borderRadius: '12px'
                   }}>
                <Building2 className="w-[22.4px] h-[22.4px] text-[#27C89E] dark:text-green-400" />
              </div>
            </div>
            <div className="flex flex-col items-start px-3 pt-3 pb-3">
              <div className="text-[28px] font-bold text-[#202224] dark:text-gray-100 leading-[38px] tracking-[1px]"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '28px',
                     lineHeight: '38px',
                     letterSpacing: '1px'
                   }}>
                {companyData.metadata?.totalConversations || 0}
              </div>
              <p className="text-sm font-semibold text-[#757285] dark:text-gray-400 mt-1"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px',
                   opacity: 0.7
                 }}>
                Total Conversations
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Messages Card */}
        <Card className="border-0 p-0 bg-white dark:bg-gray-800" 
              style={{
                boxShadow: '6px 6px 54px rgba(0, 0, 0, 0.05)',
                borderRadius: '14px',
                minHeight: '134px'
              }}>
          <CardContent className="p-0">
            <div className="flex flex-row items-center justify-between px-3 pt-3 pb-0 gap-4">
              <h3 className="text-base font-semibold text-[#202224] dark:text-gray-200 flex-1" 
                  style={{
                    fontFamily: 'Nunito Sans, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    lineHeight: '22px',
                    opacity: 0.7
                  }}>
                Message
              </h3>
              <div className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0"
                   style={{
                     background: 'linear-gradient(180deg, rgba(242, 116, 19, 0.15) 0%, rgba(222, 118, 8, 0.15) 100%)',
                     borderRadius: '12px'
                   }}>
                <MessageSquare className="w-6 h-6 text-[#DE7608] dark:text-orange-400" />
              </div>
            </div>
            <div className="flex flex-col items-start px-3 pt-3 pb-3">
              <div className="text-[28px] font-bold text-[#202224] dark:text-gray-100 leading-[38px] tracking-[1px]"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '28px',
                     lineHeight: '38px',
                     letterSpacing: '1px'
                   }}>
                {companyData.metadata?.totalMessages || 0}
              </div>
              <p className="text-sm font-semibold text-[#757285] dark:text-gray-400 mt-1"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px',
                   opacity: 0.7
                 }}>
                Total Messages
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Created Card */}
        <Card className="border-0 p-0 bg-white dark:bg-gray-800" 
              style={{
                boxShadow: '6px 6px 54px rgba(0, 0, 0, 0.05)',
                borderRadius: '14px',
                minHeight: '134px'
              }}>
          <CardContent className="p-0">
            <div className="flex flex-row items-center justify-between px-3 pt-3 pb-0 gap-4">
              <h3 className="text-base font-semibold text-[#202224] dark:text-gray-200 flex-1" 
                  style={{
                    fontFamily: 'Nunito Sans, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    lineHeight: '22px',
                    opacity: 0.7
                  }}>
                Created
              </h3>
              <div className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0"
                   style={{
                     background: 'linear-gradient(180deg, rgba(154, 77, 244, 0.15) 0%, rgba(133, 64, 239, 0.15) 100%)',
                     borderRadius: '12px'
                   }}>
                <Calendar className="w-7 h-7 text-[#8540EF] dark:text-purple-400" style={{ border: '2px solid', borderRadius: '4px' }} />
              </div>
            </div>
            <div className="flex flex-col items-start px-3 pt-3 pb-3">
              <div className="text-2xl font-bold text-[#202224] dark:text-gray-100 leading-[33px] tracking-[1px]"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '24px',
                     lineHeight: '33px',
                     letterSpacing: '1px'
                   }}>
                {formatDistanceToNow(new Date(companyData.createdAt), { addSuffix: true })}
              </div>
              <p className="text-sm font-semibold text-[#757285] dark:text-gray-400 mt-1"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px',
                   opacity: 0.7
                 }}>
                {new Date(companyData.createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Company Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card className="border-0 p-0 bg-white dark:bg-gray-800"
              style={{
                boxShadow: '-2px -2px 4px rgba(0, 0, 0, 0.08), 2px 2px 5px rgba(0, 0, 0, 0.08)',
                borderRadius: '10px'
              }}>
          <CardHeader className="px-5 pt-3 pb-0">
            <CardTitle className="text-base font-semibold text-black dark:text-gray-100"
                       style={{
                         fontFamily: 'Nunito Sans, sans-serif',
                         fontWeight: 600,
                         fontSize: '16px',
                         lineHeight: '16px'
                       }}>
              Company Information
            </CardTitle>
            <div className="h-px bg-[rgba(151,151,151,0.2)] dark:bg-gray-700 mt-3"></div>
          </CardHeader>
          <CardContent className="px-5 pt-5 pb-5 space-y-5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[rgba(0,0,0,0.5)] dark:text-gray-400"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '12px',
                       lineHeight: '16px'
                     }}>
                Company Name
              </label>
              <p className="text-sm font-semibold text-[rgba(0,0,0,0.8)] dark:text-gray-200"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px'
                 }}>
                {companyData.name}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[rgba(0,0,0,0.5)] dark:text-gray-400"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '12px',
                       lineHeight: '16px'
                     }}>
                Email
              </label>
              <p className="text-sm font-semibold text-[rgba(0,0,0,0.8)] dark:text-gray-200"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px'
                 }}>
                {companyData.email && companyData.email !== 'N/A' ? companyData.email : 'N/A'}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[rgba(0,0,0,0.5)] dark:text-gray-400"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '12px',
                       lineHeight: '16px'
                     }}>
                Phone
              </label>
              {companyData.phone && companyData.phone !== 'N/A' ? (
                (() => {
                  const phoneData = formatPhoneWithBadge(companyData.phone);
                  return phoneData ? (
                    <div className="flex items-center gap-1">
                      <div className="px-2 py-1 bg-[#F1F4F9] dark:bg-gray-700 border border-[rgba(151,151,151,0.5)] dark:border-gray-600 rounded-[22.5px]"
                           style={{
                             fontFamily: 'Nunito Sans, sans-serif',
                             fontWeight: 600,
                             fontSize: '15px',
                             lineHeight: '20px',
                             color: 'rgba(0,0,0,0.7)'
                           }}>
                        {phoneData.countryCode || 'PK'}
                      </div>
                      <span className="text-sm font-semibold text-[rgba(0,0,0,0.8)] dark:text-gray-200"
                            style={{
                              fontFamily: 'Nunito Sans, sans-serif',
                              fontWeight: 600,
                              fontSize: '14px',
                              lineHeight: '19px'
                            }}>
                        {phoneData.number}
                      </span>
                    </div>
                  ) : (
                    <PhoneNumberDisplay phone={companyData.phone} />
                  );
                })()
              ) : (
                <p className="text-sm font-semibold text-[rgba(0,0,0,0.8)] dark:text-gray-200"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 600,
                     fontSize: '14px',
                     lineHeight: '19px'
                   }}>
                  N/A
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[rgba(0,0,0,0.5)] dark:text-gray-400"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '12px',
                       lineHeight: '16px'
                     }}>
                Address
              </label>
              <p className="text-sm font-semibold text-[rgba(0,0,0,0.8)] dark:text-gray-200"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px'
                 }}>
                {formatAddress(companyData.address)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 p-0 bg-white dark:bg-gray-800"
              style={{
                boxShadow: '-2px -2px 4px rgba(0, 0, 0, 0.08), 2px 2px 5px rgba(0, 0, 0, 0.08)',
                borderRadius: '10px'
              }}>
          <CardHeader className="px-5 pt-3 pb-0">
            <CardTitle className="text-base font-semibold text-black dark:text-gray-100"
                       style={{
                         fontFamily: 'Nunito Sans, sans-serif',
                         fontWeight: 600,
                         fontSize: '16px',
                         lineHeight: '16px'
                       }}>
              Subscription Details
            </CardTitle>
            <div className="h-px bg-[rgba(151,151,151,0.2)] dark:bg-gray-700 mt-3"></div>
          </CardHeader>
          <CardContent className="px-5 pt-5 pb-5 space-y-5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[rgba(0,0,0,0.5)] dark:text-gray-400"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '12px',
                       lineHeight: '16px'
                     }}>
                Plan
              </label>
              <p className="text-sm font-semibold text-[rgba(0,0,0,0.8)] dark:text-gray-200 capitalize"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px'
                 }}>
                {companyData.subscription?.plan || 'Trial'}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[rgba(0,0,0,0.5)] dark:text-gray-400"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '12px',
                       lineHeight: '16px'
                     }}>
                Status
              </label>
              <div className="mt-1">
                {companyData.status === 'active' || companyData.status === 'trial' ? (
                  <div className="inline-flex items-center gap-1 px-2 py-1 bg-[#D7EDE1] dark:bg-green-900/30 border border-[#00B69B] dark:border-green-500 rounded-[22.5px]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#25C79F] dark:bg-green-400"></div>
                    <span className="text-xs font-semibold text-[#1DC0A2] dark:text-green-400"
                          style={{
                            fontFamily: 'Nunito Sans, sans-serif',
                            fontWeight: 600,
                            fontSize: '12px',
                            lineHeight: '16px'
                          }}>
                      Active
                    </span>
                  </div>
                ) : (
                  getStatusBadge(companyData.status)
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[rgba(0,0,0,0.5)] dark:text-gray-400"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '12px',
                       lineHeight: '16px'
                     }}>
                Started
              </label>
              <p className="text-sm font-semibold text-[rgba(0,0,0,0.8)] dark:text-gray-200"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px'
                 }}>
                {companyData.subscription?.startDate
                  ? new Date(companyData.subscription.startDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  : companyData.createdAt
                  ? new Date(companyData.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  : 'N/A'}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-[rgba(0,0,0,0.5)] dark:text-gray-400"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '12px',
                       lineHeight: '16px'
                     }}>
                Limits
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#F8F9FD] dark:bg-gray-700/50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-[#757285] dark:text-gray-400 mb-1"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '14px',
                       lineHeight: '19px',
                       opacity: 0.7
                     }}>
                    Users
                  </p>
                  <p className="text-lg font-bold text-[#202224] dark:text-gray-100"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 700,
                       fontSize: '18px',
                       lineHeight: '25px',
                       letterSpacing: '1px'
                     }}>
                    {companyData.subscription?.limits?.maxUsers ?? 'N/A'}
                  </p>
                </div>
                <div className="bg-[#F8F9FD] dark:bg-gray-700/50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-[#757285] dark:text-gray-400 mb-1"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '14px',
                       lineHeight: '19px',
                       opacity: 0.7
                     }}>
                    Conversations
                  </p>
                  <p className="text-lg font-bold text-[#202224] dark:text-gray-100"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 700,
                       fontSize: '18px',
                       lineHeight: '25px',
                       letterSpacing: '1px'
                     }}>
                    {companyData.subscription?.limits?.maxConversations ?? 'N/A'}
                  </p>
                </div>
                <div className="bg-[#F8F9FD] dark:bg-gray-700/50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-[#757285] dark:text-gray-400 mb-1"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '14px',
                       lineHeight: '19px',
                       opacity: 0.7
                     }}>
                    Messages
                  </p>
                  <p className="text-lg font-bold text-[#202224] dark:text-gray-100"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 700,
                       fontSize: '18px',
                       lineHeight: '25px',
                       letterSpacing: '1px'
                     }}>
                    {companyData.subscription?.limits?.maxMessages ?? 'Unlimited'}
                  </p>
                </div>
                <div className="bg-[#F8F9FD] dark:bg-gray-700/50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-[#757285] dark:text-gray-400 mb-1"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '14px',
                       lineHeight: '19px',
                       opacity: 0.7
                     }}>
                    Channels
                  </p>
                  <p className="text-lg font-bold text-[#202224] dark:text-gray-100"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 700,
                       fontSize: '18px',
                       lineHeight: '25px',
                       letterSpacing: '1px'
                     }}>
                    {companyData.subscription?.limits?.maxChannels ?? 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Information */}
      <Card className="border-0 p-0 bg-white dark:bg-gray-800"
            style={{
              boxShadow: '-2px -2px 4px rgba(0, 0, 0, 0.08), 2px 2px 5px rgba(0, 0, 0, 0.08)',
              borderRadius: '10px'
            }}>
        <CardHeader className="px-5 pt-3 pb-0">
          <CardTitle className="text-base font-semibold text-black dark:text-gray-100"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '16px',
                       lineHeight: '16px'
                     }}>
            Administrator
          </CardTitle>
          <div className="h-px bg-[rgba(151,151,151,0.2)] dark:bg-gray-700 mt-3"></div>
        </CardHeader>
        <CardContent className="px-5 pt-5 pb-5">
          <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-10">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-semibold text-[rgba(0,0,0,0.5)] dark:text-gray-400"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '12px',
                       lineHeight: '16px'
                     }}>
                Name
              </label>
              <p className="text-sm font-semibold text-[rgba(0,0,0,0.8)] dark:text-gray-200"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px'
                 }}>
                {companyData.adminUser?.firstName || companyData.createdBy?.firstName || 'N/A'} {companyData.adminUser?.lastName || companyData.createdBy?.lastName || ''}
              </p>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-semibold text-[rgba(0,0,0,0.5)] dark:text-gray-400"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '12px',
                       lineHeight: '16px'
                     }}>
                Email
              </label>
              <p className="text-sm font-semibold text-[rgba(0,0,0,0.8)] dark:text-gray-200"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px'
                 }}>
                {companyData.adminUser?.email || companyData.createdBy?.email || 'N/A'}
              </p>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-semibold text-[rgba(0,0,0,0.5)] dark:text-gray-400"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '12px',
                       lineHeight: '16px'
                     }}>
                Role
              </label>
              <div className="mt-1">
                <div className="inline-flex items-center justify-center px-3 py-1 bg-[rgba(72,128,255,0.1)] dark:bg-blue-900/30 border border-[rgba(72,128,255,0.3)] dark:border-blue-500 rounded-[22.5px]">
                  <span className="text-xs font-semibold text-[#4880FF] dark:text-blue-400"
                        style={{
                          fontFamily: 'Nunito Sans, sans-serif',
                          fontWeight: 600,
                          fontSize: '13px',
                          lineHeight: '18px'
                        }}>
                    {companyData.adminUser?.role || companyData.createdBy?.role || 'Company Admin'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings & Branding */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card className="border-0 p-0 bg-white dark:bg-gray-800"
              style={{
                boxShadow: '-2px -2px 4px rgba(0, 0, 0, 0.08), 2px 2px 5px rgba(0, 0, 0, 0.08)',
                borderRadius: '10px'
              }}>
          <CardHeader className="px-5 pt-3 pb-0">
            <CardTitle className="text-base font-semibold text-black dark:text-gray-100"
                       style={{
                         fontFamily: 'Nunito Sans, sans-serif',
                         fontWeight: 600,
                         fontSize: '16px',
                         lineHeight: '16px'
                       }}>
              Settings
            </CardTitle>
            <div className="h-px bg-[rgba(151,151,151,0.2)] dark:bg-gray-700 mt-3"></div>
          </CardHeader>
          <CardContent className="px-5 pt-5 pb-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#F9FAFC] dark:bg-gray-700/50 rounded-lg p-4">
                <p className="text-sm font-semibold text-[#757285] dark:text-gray-400 mb-1"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 600,
                     fontSize: '14px',
                     lineHeight: '19px',
                     opacity: 0.7
                   }}>
                  Time Zone
                </p>
                <p className="text-lg font-bold text-[#202224] dark:text-gray-100"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '18px',
                     lineHeight: '25px',
                     letterSpacing: '1px'
                   }}>
                  {companyData.settings?.timezone || 'UTC'}
                </p>
              </div>
              <div className="bg-[#F9FAFC] dark:bg-gray-700/50 rounded-lg p-4">
                <p className="text-sm font-semibold text-[#757285] dark:text-gray-400 mb-1"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 600,
                     fontSize: '14px',
                     lineHeight: '19px',
                     opacity: 0.7
                   }}>
                  Language
                </p>
                <p className="text-lg font-bold text-[#202224] dark:text-gray-100"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '18px',
                     lineHeight: '25px',
                     letterSpacing: '1px'
                   }}>
                  {companyData.settings?.language || 'EN'}
                </p>
              </div>
              <div className="bg-[#F9FAFC] dark:bg-gray-700/50 rounded-lg p-4">
                <p className="text-sm font-semibold text-[#757285] dark:text-gray-400 mb-1"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 600,
                     fontSize: '14px',
                     lineHeight: '19px',
                     opacity: 0.7
                   }}>
                  Date Format
                </p>
                <p className="text-lg font-bold text-[#202224] dark:text-gray-100"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '18px',
                     lineHeight: '25px',
                     letterSpacing: '1px'
                   }}>
                  {companyData.settings?.dateFormat || 'YYYY-MM-DD'}
                </p>
              </div>
              <div className="bg-[#F9FAFC] dark:bg-gray-700/50 rounded-lg p-4">
                <p className="text-sm font-semibold text-[#757285] dark:text-gray-400 mb-1"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 600,
                     fontSize: '14px',
                     lineHeight: '19px',
                     opacity: 0.7
                   }}>
                  Time Format
                </p>
                <p className="text-lg font-bold text-[#202224] dark:text-gray-100"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '18px',
                     lineHeight: '25px',
                     letterSpacing: '1px'
                   }}>
                  {companyData.settings?.timeFormat || '12h'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 p-0 bg-white dark:bg-gray-800"
              style={{
                boxShadow: '-2px -2px 4px rgba(0, 0, 0, 0.08), 2px 2px 5px rgba(0, 0, 0, 0.08)',
                borderRadius: '10px'
              }}>
          <CardHeader className="px-5 pt-3 pb-0">
            <CardTitle className="text-base font-semibold text-black dark:text-gray-100"
                       style={{
                         fontFamily: 'Nunito Sans, sans-serif',
                         fontWeight: 600,
                         fontSize: '16px',
                         lineHeight: '16px'
                       }}>
              Branding
            </CardTitle>
            <div className="h-px bg-[rgba(151,151,151,0.2)] dark:bg-gray-700 mt-3"></div>
          </CardHeader>
          <CardContent className="px-5 pt-5 pb-5 space-y-5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[rgba(0,0,0,0.5)] dark:text-gray-400"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '12px',
                       lineHeight: '16px'
                     }}>
                Primary Color
              </label>
              <div className="flex items-center gap-2.5 mt-1">
                <div
                  className="w-9 h-9 rounded-lg"
                  style={{ backgroundColor: companyData.branding?.primaryColor || '#4F46E5' }}
                />
                <p className="text-sm font-semibold text-[rgba(0,0,0,0.8)] dark:text-gray-200"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 600,
                     fontSize: '14px',
                     lineHeight: '19px'
                   }}>
                  {companyData.branding?.primaryColor || '#4f46e5'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[rgba(0,0,0,0.5)] dark:text-gray-400"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 600,
                       fontSize: '12px',
                       lineHeight: '16px'
                     }}>
                Secondary Color
              </label>
              <div className="flex items-center gap-2.5 mt-1">
                <div
                  className="w-9 h-9 rounded-lg"
                  style={{ backgroundColor: companyData.branding?.secondaryColor || '#6366F1' }}
                />
                <p className="text-sm font-semibold text-[rgba(0,0,0,0.8)] dark:text-gray-200"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 600,
                     fontSize: '14px',
                     lineHeight: '19px'
                   }}>
                  {companyData.branding?.secondaryColor || '#6366f1'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 justify-end">
        <Button 
          variant="outline" 
          onClick={() => router.push(`/companies/${id}/edit`)}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          style={{
            fontFamily: 'Nunito Sans, sans-serif'
          }}>
          Edit Company
        </Button>
        {companyData.status === 'active' && (
          <Button 
            onClick={async () => {
              if (confirm('Are you sure you want to suspend this company? All users will be unable to access the system.')) {
                try {
                  await apiClient.delete(`/companies/${id}`);
                  router.push('/companies');
                } catch (error) {
                  alert('Failed to suspend company: ' + (error.response?.data?.message || error.message));
                }
              }
            }}
            className="bg-[#F27413] hover:bg-[#DE7608] text-white border-0"
            style={{
              fontFamily: 'Nunito Sans, sans-serif'
            }}>
            <span>→</span> Suspend Company
          </Button>
        )}
        {companyData.status === 'suspended' && (
          <Button
            onClick={async () => {
              try {
                await apiClient.put(`/companies/${id}`, { status: 'active' });
                // Invalidate and refetch the company data
                await queryClient.invalidateQueries({ queryKey: ['company', id] });
              } catch (error) {
                alert('Failed to activate company: ' + (error.response?.data?.message || error.message));
              }
            }}
            className="bg-[#00B69B] hover:bg-[#0E9B87] text-white"
            style={{
              fontFamily: 'Nunito Sans, sans-serif'
            }}>
            Activate Company
          </Button>
        )}
      </div>
    </div>
  );
}