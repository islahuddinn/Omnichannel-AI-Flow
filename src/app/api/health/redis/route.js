// src/app/api/health/redis/route.js
import { NextResponse } from 'next/server';
import { checkRedisHealth, getConnectionStats } from '@/config/redis';

export async function GET(request) {
  try {
    const health = await checkRedisHealth();
    const connectionStats = getConnectionStats();
    
    return NextResponse.json({
      ...health,
      connections: connectionStats,
      timestamp: new Date().toISOString()
    }, {
      status: health.healthy ? 200 : 503
    });

  } catch (error) {
    return NextResponse.json({
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}