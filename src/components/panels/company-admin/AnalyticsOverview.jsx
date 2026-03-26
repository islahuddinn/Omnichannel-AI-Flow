// src/components/panels/company-admin/AnalyticsOverview.jsx
'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AnalyticsOverview({ data }) {
  // Use real data from the API (messagesByDay array with {date, count})
  const messagesByDay = data?.messagesByDay || [];

  // Format chart data from API response
  const chartData = messagesByDay.map(item => ({
    date: item.date || '',
    messages: item.count || 0,
  }));

  const hasData = chartData.length > 0;

  return (
    <div className="bg-card border" style={{
      position: 'relative',
      width: '100%',
      height: '382px',
      boxShadow: '-2px -2px 4px rgba(0, 0, 0, 0.08), 2px 2px 5px rgba(0, 0, 0, 0.08)',
      borderRadius: '14px',
      padding: '0'
    }}>
      {/* Header Section */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'absolute',
        width: 'calc(100% - 28px)',
        left: '14px',
        top: '22px'
      }}>
        {/* Left side - Title */}
        <h2 className="text-card-foreground" style={{
          fontFamily: 'Nunito Sans, sans-serif',
          fontWeight: 600,
          fontSize: '18px',
          lineHeight: '16px',
          margin: 0
        }}>
          Message Volume Trend
        </h2>

        {/* Center - Legend */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '12px'
        }}>
          {/* Message Legend */}
          <div className="bg-muted" style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            padding: '8px',
            gap: '8px',
            borderRadius: '10px',
            minWidth: '88px',
            height: '32px'
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              background: '#4880FF',
              borderRadius: '50%'
            }}></div>
            <span className="text-muted-foreground" style={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '16px'
            }}>
              Messages
            </span>
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div style={{
        position: 'absolute',
        width: 'calc(100% - 28px)',
        height: '305px',
        left: '14px',
        top: '58px'
      }}>
        {/* Chart Background */}
        <div className="bg-card" style={{
          position: 'absolute',
          width: '100%',
          height: '288px',
          left: '0px',
          top: '17px',
          borderRadius: '20px'
        }}>
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 20, right: 20, left: 20, bottom: 45 }}
              >
                <CartesianGrid
                  strokeDasharray="5 5"
                  stroke="#E2E2E2"
                  horizontal={true}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontFamily: 'Poppins, sans-serif',
                    fontSize: 12,
                    fill: 'currentColor'
                  }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontFamily: 'Poppins, sans-serif',
                    fontSize: 12,
                    fill: 'currentColor'
                  }}
                  dx={-10}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--popover)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    fontFamily: 'Poppins, sans-serif',
                    fontSize: '12px',
                    color: 'var(--popover-foreground)'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="messages"
                  stroke="#4880FF"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#4880FF' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%'
            }}>
              <span className="text-muted-foreground" style={{ fontSize: '14px' }}>
                No message data available
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
