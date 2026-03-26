// src/app/api/ai-prompts/[promptId]/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import AIPromptSchema from '@/models/schemas/AIPrompt';

/**
 * GET /api/ai-prompts/[promptId]
 * Get a specific AI prompt by ID
 */
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { promptId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);

    const prompt = await AIPrompt.findOne({
      _id: promptId,
      tenantId: context.tenantId
    }).lean();

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'AI prompt not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: prompt
    });
  } catch (error) {
    console.error('Get AI prompt error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get AI prompt' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/ai-prompts/[promptId]
 * Update a specific AI prompt
 */
export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { promptId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);

    const body = await request.json();
    const {
      prompt,
      name,
      description,
      isActive,
      metadata
    } = body;

    const promptDoc = await AIPrompt.findOne({
      _id: promptId,
      tenantId: context.tenantId
    });

    if (!promptDoc) {
      return NextResponse.json(
        { success: false, error: 'AI prompt not found' },
        { status: 404 }
      );
    }

    // Update fields
    if (prompt !== undefined) promptDoc.prompt = prompt.trim();
    if (name !== undefined) promptDoc.name = name.trim();
    if (description !== undefined) promptDoc.description = description.trim();
    if (isActive !== undefined) promptDoc.isActive = isActive;
    if (metadata !== undefined) promptDoc.metadata = { ...promptDoc.metadata, ...metadata };
    promptDoc.updatedBy = auth.user.userId;
    promptDoc.version = (promptDoc.version || 1) + 1;

    await promptDoc.save();

    return NextResponse.json({
      success: true,
      data: promptDoc.toObject(),
      message: 'AI prompt updated successfully'
    });
  } catch (error) {
    console.error('Update AI prompt error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update AI prompt' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ai-prompts/[promptId]
 * Delete (deactivate) a specific AI prompt
 */
export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { promptId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);

    const prompt = await AIPrompt.findOne({
      _id: promptId,
      tenantId: context.tenantId
    });

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'AI prompt not found' },
        { status: 404 }
      );
    }

    // Soft delete - set isActive to false
    prompt.isActive = false;
    prompt.updatedBy = auth.user.userId;
    await prompt.save();

    return NextResponse.json({
      success: true,
      message: 'AI prompt deactivated successfully'
    });
  } catch (error) {
    console.error('Delete AI prompt error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete AI prompt' },
      { status: 500 }
    );
  }
}

