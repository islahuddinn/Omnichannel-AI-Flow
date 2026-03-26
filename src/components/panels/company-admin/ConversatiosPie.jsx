// src/components/panels/company-admin/SalesByCategory.jsx
'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export default function ConversationsPi() {


  // Sample data for the pie chart
  const data = [
    { name: 'SMS', value: 35, color: '#318DFF' },
    { name: 'Calls', value: 30, color: '#C466DC' },
    { name: 'Webchat', value: 20, color: '#18D837' },
    { name: 'Emails', value: 15, color: '#F76B1D' }
  ];

  return (
    <div className="bg-card rounded-[14px]" style={{
      position: 'relative',
      flex: '0 0 42%',
      height: '511px',
      boxShadow: '-2px -2px 4px rgba(0, 0, 0, 0.08), 2px 2px 5px rgba(0, 0, 0, 0.08)',
      padding: '0'
    }}>
      {/* Header */}
      <div style={{
        position: 'absolute',
        left: '14px',
        top: '22px'
      }}>
        <h2 className="text-foreground" style={{
          fontFamily: 'Nunito Sans, sans-serif',
          fontWeight: 600,
          fontSize: '18px',
          lineHeight: '16px',
          margin: 0,
          width: '215px',
          height: '16px'
        }}>
          Conversations By Status
        </h2>
      </div>

      {/* Main Content Area */}
      <div style={{
        position: 'absolute',
        width: '347px',
        height: '315px',
        left: '50%',
        top: '88px',
        transform: 'translateX(-50%)'
      }}>
        {/* Background Rectangle */}
        <div className="bg-card rounded-[20px]" style={{
          position: 'absolute',
          width: '347px',
          height: '315px',
          left: '0px',
          top: '0px'
        }}>

          {/* Chart Container */}
          <div style={{
            position: 'absolute',
            width: '170px',
            height: '170px',
            left: '89px',
            top: '94px'
          }}>
            <ResponsiveContainer width={170} height={170}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={85}
                  startAngle={90}
                  endAngle={450}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Center Text - Total */}
          <div className="text-foreground" style={{
            position: 'absolute',
            width: '76px',
            height: '32px',
            left: '136px',
            top: '156px',
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 600,
            fontSize: '21px',
            lineHeight: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            203,015
          </div>

          {/* Center Text - Label */}
          <div className="text-muted-foreground" style={{
            position: 'absolute',
            width: '80px',
            height: '32px',
            left: '134px',
            top: '200px',
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 400,
            fontSize: '12px',
            lineHeight: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center'
          }}>
            Total<br />Contacts
          </div>

          {/* Labels with connecting lines */}

          {/* Total SMS - Top Left */}
          <div style={{
            position: 'absolute',
            width: '76.5px',
            height: '46px',
            left: '30px',
            top: '105px'
          }}>
            <div className="text-foreground" style={{
              position: 'absolute',
              width: '58px',
              height: '18px',
              left: '0px',
              top: '0px',
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '18px',
              display: 'flex',
              alignItems: 'center'
            }}>
              Total SMS
            </div>
            {/* Dashed line pointing to SMS segment */}
            <div className="border-muted-foreground" style={{
              position: 'absolute',
              width: '25px',
              height: '1px',
              left: '58px',
              top: '9px',
              borderTopWidth: '1px',
              borderTopStyle: 'dashed',
              transform: 'rotate(25deg)',
              transformOrigin: 'left center'
            }}></div>
          </div>

          {/* Total Calls - Top Right */}
          <div style={{
            position: 'absolute',
            width: '87px',
            height: '39.5px',
            left: '240px',
            top: '90px'
          }}>
            <div className="text-foreground" style={{
              position: 'absolute',
              width: '63px',
              height: '18px',
              left: '24px',
              top: '0px',
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '18px',
              display: 'flex',
              alignItems: 'center'
            }}>
              Total Calls
            </div>
            {/* Dashed line pointing to Calls segment */}
            <div className="border-muted-foreground" style={{
              position: 'absolute',
              width: '25px',
              height: '1px',
              left: '0px',
              top: '9px',
              borderTopWidth: '1px',
              borderTopStyle: 'dashed',
              transform: 'rotate(-25deg)',
              transformOrigin: 'left center'
            }}></div>
          </div>

          {/* Total Webchat - Bottom Right */}
          <div style={{
            position: 'absolute',
            width: '100px',
            height: '28.5px',
            left: '230px',
            top: '240px'
          }}>
            <div className="text-foreground" style={{
              position: 'absolute',
              width: '88px',
              height: '18px',
              left: '12px',
              top: '0px',
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '18px',
              display: 'flex',
              alignItems: 'center'
            }}>
              Total Webchat
            </div>
            {/* Dashed line pointing to Webchat segment */}
            <div className="border-muted-foreground" style={{
              position: 'absolute',
              width: '25px',
              height: '1px',
              left: '0px',
              top: '9px',
              borderTopWidth: '1px',
              borderTopStyle: 'dashed',
              transform: 'rotate(-155deg)',
              transformOrigin: 'left center'
            }}></div>
          </div>

          {/* Total Emails - Bottom Left */}
          <div style={{
            position: 'absolute',
            width: '91px',
            height: '29px',
            left: '30px',
            top: '220px'
          }}>
            <div className="text-foreground" style={{
              position: 'absolute',
              width: '73px',
              height: '18px',
              left: '0px',
              top: '0px',
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '18px',
              display: 'flex',
              alignItems: 'center'
            }}>
              Total emails
            </div>
            {/* Dashed line pointing to Emails segment */}
            <div className="border-muted-foreground" style={{
              position: 'absolute',
              width: '25px',
              height: '1px',
              left: '73px',
              top: '9px',
              borderTopWidth: '1px',
              borderTopStyle: 'dashed',
              transform: 'rotate(155deg)',
              transformOrigin: 'left center'
            }}></div>
          </div>

        </div>
      </div>
    </div>
  );
}