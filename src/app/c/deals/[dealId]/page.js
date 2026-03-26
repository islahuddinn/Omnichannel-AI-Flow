'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, DollarSign, Calendar, TrendingUp, Percent, Star, Phone, Building2, ExternalLink, Globe } from 'lucide-react';
import { toast } from 'sonner';

export default function DealDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.dealId;
  const [deal, setDeal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDeal = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/deals/${dealId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch deal');
        }

        const result = await response.json();
        
        if (result.success) {
          setDeal(result.data);
        } else {
          toast.error(result.error || 'Failed to load deal');
        }
      } catch (error) {
        console.error('Error fetching deal:', error);
        toast.error('Failed to load deal');
      } finally {
        setIsLoading(false);
      }
    };

    if (dealId) {
      fetchDeal();
    }
  }, [dealId]);

  const formatCurrency = (amount, currency = 'USD') => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Parse and render AI Rating Outcome in a user-friendly format
  const renderAIRatingOutcome = (key, value) => {
    let parsedData = null;
    let timestamp = null;
    let title = 'Selected Handymen for Your Deal';

    try {
      // Try to parse as JSON string
      if (typeof value === 'string') {
        // Check if it's a JSON string
        if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
          parsedData = JSON.parse(value);
        } else {
          // Might be a simple string, try to extract JSON from it
          const jsonMatch = value.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
          if (jsonMatch) {
            parsedData = JSON.parse(jsonMatch[0]);
          }
        }
      } else if (typeof value === 'object') {
        parsedData = value;
      }

      // Extract timestamp if available
      if (parsedData && parsedData.timestamp) {
        timestamp = parsedData.timestamp;
      } else if (parsedData && parsedData.date) {
        timestamp = parsedData.date;
      }

      // Extract title if available
      if (parsedData && parsedData.title) {
        title = parsedData.title;
      }

      // Handle array of handymen
      if (Array.isArray(parsedData)) {
        return (
          <div key={key} className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">{key}</h3>
                {timestamp && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {timestamp}
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{title}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {parsedData.map((handyman, index) => (
                <Card key={index} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-foreground mb-1">
                          Handyman #{index + 1}: {handyman.name || handyman.Name || 'Unknown'}
                        </h4>
                        {(handyman.businessName || handyman.Business_Name) && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {handyman.businessName || handyman.Business_Name}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {(handyman.phone || handyman.Phone) && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>Phone: {handyman.phone || handyman.Phone}</span>
                      </div>
                    )}

                    {(handyman.score !== undefined || handyman.SCORE !== undefined) && (
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-500 dark:text-amber-400 fill-amber-500 dark:fill-amber-400" />
                        <span className="text-sm font-medium text-foreground">
                          SCORE: {handyman.score || handyman.SCORE || '0.0'}
                        </span>
                      </div>
                    )}

                    {(handyman.price !== undefined || handyman.Price !== undefined) && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                        <span className="text-sm text-muted-foreground">
                          Price: {formatCurrency(parseFloat(handyman.price || handyman.Price || 0))}
                        </span>
                      </div>
                    )}

                    {(handyman.successRate !== undefined || handyman.Success_Rate !== undefined) && (
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                        <span className="text-sm text-muted-foreground">
                          Success Rate: {handyman.successRate || handyman.Success_Rate || '0.0'}%
                        </span>
                      </div>
                    )}

                    {(handyman.avgRevenue !== undefined || handyman.Avg_Revenue !== undefined) && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-primary" />
                        <span className="text-sm text-muted-foreground">
                          Avg Revenue: {formatCurrency(parseFloat(handyman.avgRevenue || handyman.Avg_Revenue || 0))}
                        </span>
                      </div>
                    )}

                    {(handyman.salesforceLink || handyman.Salesforce_Link) && (
                      <a
                        href={handyman.salesforceLink || handyman.Salesforce_Link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span className="truncate">View in Salesforce</span>
                      </a>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      }

      // Handle object with handymen array
      if (parsedData && parsedData.handymen && Array.isArray(parsedData.handymen)) {
        return renderAIRatingOutcome(key, parsedData.handymen);
      }

      // Handle single handyman object
      if (parsedData && (parsedData.name || parsedData.Name)) {
        return renderAIRatingOutcome(key, [parsedData]);
      }
    } catch (error) {
      console.error('Error parsing AI_RATING_OUTCOME:', error);
    }

    // Fallback to regular display if parsing fails
    return (
      <div key={key} className="border-b border-border pb-2">
        <p className="text-xs text-muted-foreground mb-1">{key}</p>
        <p className="text-sm font-medium text-foreground whitespace-pre-wrap break-words">
          {String(value || '-')}
        </p>
      </div>
    );
  };

  // Convert details to object if needed
  const details = deal?.details instanceof Map 
    ? Object.fromEntries(deal.details) 
    : (deal?.details && typeof deal.details === 'object' ? deal.details : {});

  // Group details by category (similar to contact details)
  const categorizeDetails = (detailsObj) => {
    const categories = {};
    
    Object.entries(detailsObj).forEach(([key, value]) => {
      if (!value || value === '') return;
      
      // Extract category from key (e.g., "B2A_AI_Rating" -> "B2A")
      const categoryMatch = key.match(/^([A-Z0-9]+)_/);
      const category = categoryMatch ? categoryMatch[1] : 'Other';
      
      if (!categories[category]) {
        categories[category] = {};
      }
      categories[category][key] = value;
    });
    
    return categories;
  };

  const categorizedDetails = categorizeDetails(details);

  // Filter categories with 2+ values
  const categoriesWithMultipleValues = Object.entries(categorizedDetails)
    .filter(([_, fields]) => Object.keys(fields).length >= 2)
    .map(([category, fields]) => ({ category, fields }));

  // Merge categories with 0-1 values into "Other"
  const otherFields = {};
  Object.entries(categorizedDetails).forEach(([category, fields]) => {
    if (Object.keys(fields).length < 2) {
      Object.assign(otherFields, fields);
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <DollarSign className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Deal not found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The deal you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {deal.name || 'Deal Details'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Deal information from Salesforce
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Basic Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Name</p>
              <p className="font-medium">{deal.name || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Stage</p>
              <Badge variant="outline">{deal.stage || '-'}</Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Status</p>
              <Badge variant="outline">{deal.status || '-'}</Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Deal ID</p>
              <p className="font-mono text-xs">{deal.deal_id || '-'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Card */}
        <Card>
          <CardHeader>
            <CardTitle>Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {details.Currency && details.Commission && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                  <span className="text-sm text-muted-foreground">Commission</span>
                </div>
                <span className="font-bold">
                  {formatCurrency(parseFloat(details.Commission) || 0, details.Currency)}
                </span>
              </div>
            )}
            {details.Stage && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <span className="text-sm text-muted-foreground">Stage</span>
                </div>
                <Badge variant="outline">{details.Stage}</Badge>
              </div>
            )}
            {details.Status && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Percent className="h-5 w-5 text-purple-500 dark:text-purple-400" />
                  <span className="text-sm text-muted-foreground">Status</span>
                </div>
                <Badge variant="outline">{details.Status}</Badge>
              </div>
            )}
            {details.Created_Date && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                  <span className="text-sm text-muted-foreground">Created Date</span>
                </div>
                <span className="font-medium">{formatDate(details.Created_Date)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Related Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Related Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {details.Owner && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Owner</p>
                <p className="font-medium">{details.Owner}</p>
              </div>
            )}
            {details.Customer && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Customer</p>
                <p className="font-medium">{details.Customer}</p>
              </div>
            )}
            {details.Currency && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Currency</p>
                <p className="font-medium">{details.Currency}</p>
              </div>
            )}
            {details.Campaign && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Campaign</p>
                <p className="font-medium">{details.Campaign}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Details Tabs */}
      {Object.keys(details).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Deal Details</CardTitle>
            <CardDescription>
              All dynamic fields from Salesforce CSV import
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={categoriesWithMultipleValues.length > 0 ? categoriesWithMultipleValues[0].category : 'other'}>
              <TabsList className="flex w-full gap-2">
                {categoriesWithMultipleValues.map(({ category }) => (
                  <TabsTrigger key={category} value={category} className="flex-1">
                    {category}
                  </TabsTrigger>
                ))}
                {Object.keys(otherFields).length > 0 && (
                  <TabsTrigger value="other" className="flex-1">Other</TabsTrigger>
                )}
              </TabsList>

              {categoriesWithMultipleValues.map(({ category, fields }) => (
                <TabsContent key={category} value={category} className="mt-6">
                  <div className="space-y-6">
                    {Object.entries(fields).map(([key, value]) => {
                      // Special handling for AI_RATING_OUTCOME
                      if (key === 'AI_RATING_OUTCOME' || key.includes('AI_RATING_OUTCOME')) {
                        return renderAIRatingOutcome(key, value);
                      }
                      
                      // Regular field display
                      return (
                        <div key={key} className="border-b border-border pb-2">
                          <p className="text-xs text-muted-foreground mb-1">{key}</p>
                          <p className="text-sm font-medium text-foreground">
                            {String(value || '-')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              ))}

              {Object.keys(otherFields).length > 0 && (
                <TabsContent value="other" className="mt-6">
                  <div className="space-y-6">
                    {Object.entries(otherFields).map(([key, value]) => {
                      // Special handling for AI_RATING_OUTCOME
                      if (key === 'AI_RATING_OUTCOME' || key.includes('AI_RATING_OUTCOME')) {
                        return renderAIRatingOutcome(key, value);
                      }
                      
                      // Regular field display
                      return (
                        <div key={key} className="border-b border-border pb-2">
                          <p className="text-xs text-muted-foreground mb-1">{key}</p>
                          <p className="text-sm font-medium text-foreground">
                            {String(value || '-')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {Object.keys(details).length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No additional details available</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
