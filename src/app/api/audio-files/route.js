// src/app/api/audio-files/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as audioFileService from '@/services/audio-files/audioFileService';

/**
 * GET /api/audio-files
 * Get all audio files
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const companyId = context.tenantId;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    const audioFiles = await audioFileService.getAllAudioFiles(companyId);

    return NextResponse.json({
      success: true,
      data: audioFiles
    });
  } catch (error) {
    console.error('Error getting audio files:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to get audio files', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/audio-files
 * Upload an audio file
 */
export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const companyId = context.tenantId;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    // Parse form data for file upload
    const formData = await request.formData();
    const file = formData.get('file');
    const isDefault = formData.get('is_default') === 'true' || formData.get('is_default') === true;

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file provided' },
        { status: 400 }
      );
    }

    // Pass the file directly - the service will handle S3 upload
    const audioFile = await audioFileService.uploadAudioFile(file, companyId, isDefault);

    return NextResponse.json({
      success: true,
      message: 'Audio file uploaded successfully',
      data: audioFile
    }, { status: 201 });
  } catch (error) {
    console.error('Error uploading audio file:', error);

    if (error.message === 'No file provided') {
      return NextResponse.json(
        { success: false, message: 'No file provided' },
        { status: 400 }
      );
    }

    if (error.message.includes('Failed to upload file to S3 storage')) {
      return NextResponse.json(
        { success: false, message: 'Failed to upload file to S3 storage', error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Failed to upload audio file', error: error.message },
      { status: 500 }
    );
  }
}
