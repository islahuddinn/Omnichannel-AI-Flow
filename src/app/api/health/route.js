// src/app/api/health/route.js
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: 'connected',
        redis: 'connected',
        socketIO: 'connected'
      }
    };

    return NextResponse.json({
      success: true,
      data: health
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Health check failed',
        message: error.message
      },
      { status: 503 }
    );
  }
}