// src/components/panels/superadmin/CompanyGrid.jsx
'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Building2, 
  Users, 
  MessageSquare, 
  TrendingUp,
  MoreVertical,
  Eye
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api/client';
import socketClient from '@/lib/socket/client';
import LoadingSkeleton from '@/components/shared/LoadingSkeleton';
import useUIStore from '@/store/useUIStore';

export default function CompanyGrid() {
  const router = useRouter();
  const { addNotification } = useUIStore();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['recent-companies'],
    queryFn: () => apiClient.get('/companies', {
      params: { limit: 6, sort: '-createdAt' }
    })
  });

  useEffect(() => {
    const socket = socketClient.getSuperAdminSocket();
    
    if (socket) {
      socket.on('company:created', (company) => {
        addNotification({
          type: 'info',
          title: 'New Company',
          message: `${company.name} has been created`
        });
        refetch();
      });

      socket.on('company:updated', (company) => {
        refetch();
      });

      return () => {
        socket.off('company:created');
        socket.off('company:updated');
      };
    }
  }, [refetch, addNotification]);

  if (isLoading) {
    return <LoadingSkeleton rows={3} />;
  }

  const companies = data?.data?.companies || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-black dark:text-gray-100"
            style={{
              fontFamily: 'Nunito Sans, sans-serif',
              fontWeight: 600,
              fontSize: '16px',
              lineHeight: '16px'
            }}>
          Recent Companies
        </h2>
        <Button variant="outline" onClick={() => router.push('/companies')}>
          View All
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies.map((company) => (
          <Card key={company._id} 
                className="border-0 p-0 bg-card shadow-md hover:shadow-lg transition-shadow"
                style={{
                  borderRadius: '10px'
                }}>
            <CardHeader className="px-5 pt-3 pb-0">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base font-semibold text-black dark:text-gray-100 flex-1"
                           style={{
                             fontFamily: 'Nunito Sans, sans-serif',
                             fontWeight: 600,
                             fontSize: '16px',
                             lineHeight: '16px'
                           }}>
                  {company.name}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-9 h-9 bg-[#F8FAFC] dark:bg-gray-700 border border-[rgba(0,0,0,0.05)] dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 shrink-0 ml-2"
                  onClick={() => router.push(`/companies/${company._id}`)}
                >
                  <Eye className="h-4 w-4 text-[#757575] dark:text-gray-300" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-5 pt-3 pb-5">
              {/* Status Badge */}
              <div className="mb-[10px]">
                <Badge 
                  className="px-3 py-1 rounded-[13.5px] text-white text-xs font-semibold border-0"
                  style={{
                    background: company.status === 'active' 
                      ? 'linear-gradient(180deg, #32D299 0%, #16BAA5 100%)'
                      : company.status === 'trial'
                      ? 'linear-gradient(180deg, #F27413 0%, #DE7608 100%)'
                      : 'linear-gradient(180deg, #757285 0%, #5A5A5A 100%)',
                    fontFamily: 'Nunito Sans, sans-serif',
                    fontWeight: 600,
                    fontSize: '12px',
                    lineHeight: '16px'
                  }}>
                  {company.status === 'active' 
                    ? 'Active' 
                    : company.status === 'trial' 
                    ? 'Trial' 
                    : company.status === 'suspended'
                    ? 'Suspended'
                    : company.status === 'expired'
                    ? 'Expired'
                    : 'Inactive'}
                </Badge>
              </div>

              {/* Metrics */}
              <div className="space-y-[10px] mb-[10px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-[7px]">
                    <Users className="h-4 w-[14px] text-[rgba(0,0,0,0.7)] dark:text-gray-400" />
                    <span className="text-sm text-[rgba(0,0,0,0.7)] dark:text-gray-400"
                          style={{
                            fontFamily: 'Nunito Sans, sans-serif',
                            fontWeight: 500,
                            fontSize: '14px',
                            lineHeight: '19px'
                          }}>
                      Users
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-black dark:text-gray-100"
                        style={{
                          fontFamily: 'Nunito Sans, sans-serif',
                          fontWeight: 600,
                          fontSize: '14px',
                          lineHeight: '19px'
                        }}>
                    {company.metadata?.totalUsers || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-[7px]">
                    <MessageSquare className="h-4 w-4 text-[rgba(0,0,0,0.7)] dark:text-gray-400" />
                    <span className="text-sm text-[rgba(0,0,0,0.7)] dark:text-gray-400"
                          style={{
                            fontFamily: 'Nunito Sans, sans-serif',
                            fontWeight: 500,
                            fontSize: '14px',
                            lineHeight: '19px'
                          }}>
                      Messages
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-black dark:text-gray-100"
                        style={{
                          fontFamily: 'Nunito Sans, sans-serif',
                          fontWeight: 600,
                          fontSize: '14px',
                          lineHeight: '19px'
                        }}>
                    {company.metadata?.totalMessages || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-[7px]">
                    <TrendingUp className="h-[11px] w-[21px] text-[rgba(0,0,0,0.6)] dark:text-gray-400" />
                    <span className="text-sm text-[rgba(0,0,0,0.7)] dark:text-gray-400"
                          style={{
                            fontFamily: 'Nunito Sans, sans-serif',
                            fontWeight: 500,
                            fontSize: '14px',
                            lineHeight: '19px'
                          }}>
                      Conversations
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-[#974BF3] dark:text-purple-400"
                        style={{
                          fontFamily: 'Nunito Sans, sans-serif',
                          fontWeight: 600,
                          fontSize: '14px',
                          lineHeight: '19px'
                        }}>
                    {company.metadata?.totalConversations || 0}
                  </span>
                </div>
              </div>
              
              {/* Created Date */}
              <div className="pt-2">
                <p className="text-sm text-[rgba(0,0,0,0.6)] dark:text-gray-400"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 500,
                     fontSize: '14px',
                     lineHeight: '19px'
                   }}>
                  Created {new Date(company.createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}