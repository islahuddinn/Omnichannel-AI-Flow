// src/components/panels/company-admin/CompanyAdminDashboard.jsx
'use client';

import { BarChart3, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UsageChart from './UsageChart';
import TeamPerformance from './TeamPerformance';

export default function CompanyAdminDashboard() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/60 dark:bg-muted/40 border border-border/50 h-auto">
          <TabsTrigger
            value="overview"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/50 data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <BarChart3 className="w-4 h-4" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger
            value="teams"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/50 data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <Users className="w-4 h-4" />
            <span>Teams</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <UsageChart />
        </TabsContent>
        <TabsContent value="teams">
          <TeamPerformance />
        </TabsContent>
      </Tabs>
    </div>
  );
}
