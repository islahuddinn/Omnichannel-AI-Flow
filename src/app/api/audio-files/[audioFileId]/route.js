// src/app/api/audio-files/[audioFileId]/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as audioFileService from '@/services/audio-files/audioFileService';

/**
 * PUT /api/audio-files/[audioFileId]
 * Update an audio file
 */
export async function PUT(request, { params }) {
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

    const { audioFileId } = await params;
    const body = await request.json();
    const { fileName, isDefault } = body;

    // Build update data object (only include fields that are provided)
    const updateData = {};
    if (fileName !== undefined) {
      updateData.fileName = fileName;
    }
    if (isDefault !== undefined) {
      updateData.isDefault = isDefault === true || isDefault === 'true';
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      );
    }

    const updatedAudioFile = await audioFileService.editAudioFile(audioFileId, companyId, updateData);

    return NextResponse.json({
      success: true,
      message: 'Audio file updated successfully',
      data: updatedAudioFile
    });
  } catch (error) {
    console.error('Error updating audio file:', error);

    if (error.message === 'Audio file not found') {
      return NextResponse.json(
        { success: false, message: 'Audio file not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Failed to update audio file', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/audio-files/[audioFileId]
 * Delete an audio file
 */
export async function DELETE(request, { params }) {
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

    const { audioFileId } = await params;

    const result = await audioFileService.deleteAudioFile(audioFileId, companyId);

    return NextResponse.json({
      success: true,
      message: result.message || 'Audio file deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting audio file:', error);

    if (error.message === 'Audio file not found') {
      return NextResponse.json(
        { success: false, message: 'Audio file not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Failed to delete audio file', error: error.message },
      { status: 500 }
    );
  }
}

