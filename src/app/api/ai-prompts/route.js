// src/app/api/ai-prompts/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth.js';
import { getTenantDB } from '@/config/database.js';
import AIPromptSchema from '@/models/schemas/AIPrompt.js';

/**
 * GET /api/ai-prompts
 * Fetch single AI prompt by moduleId and moduleIdDescription
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const moduleId = searchParams.get('moduleId');
    const moduleIdDescription = searchParams.get('moduleIdDescription');

    if (!moduleId || !moduleIdDescription) {
      return NextResponse.json(
        { success: false, message: 'moduleId and moduleIdDescription are required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(auth.user.companyId);
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);

    const prompt = await AIPrompt.findOne({
      moduleId,
      moduleIdDescription,
      tenantId: auth.user.companyId.toString(),
      isActive: true
    }).lean();

    return NextResponse.json({
      success: true,
      data: prompt || null
    });
  } catch (error) {
    console.error('❌ Get AI prompt error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch AI prompt' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-prompts
 * Create or update single AI prompt (upsert)
 */
export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { moduleId, moduleIdDescription, prompt, name, description } = body;

    if (!moduleId || !moduleIdDescription) {
      return NextResponse.json(
        { success: false, message: 'moduleId and moduleIdDescription are required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(auth.user.companyId);
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);

    // Upsert: update if exists, create if not
    const existingPrompt = await AIPrompt.findOne({
      moduleId,
      moduleIdDescription,
      tenantId: auth.user.companyId.toString()
    });

    let result;
    if (existingPrompt) {
      // Update existing prompt
      existingPrompt.prompt = prompt || '';
      existingPrompt.name = name || '';
      existingPrompt.description = description || '';
      existingPrompt.updatedBy = auth.user.userId;
      existingPrompt.updatedAt = new Date();
      existingPrompt.isActive = true;
      result = await existingPrompt.save();
    } else {
      // Create new prompt
      result = await AIPrompt.create({
        moduleId,
        moduleIdDescription,
        prompt: prompt || '',
        name: name || '',
        description: description || '',
        tenantId: auth.user.companyId.toString(),
        createdBy: auth.user.userId,
        updatedBy: auth.user.userId,
        isActive: true
      });
    }

    return NextResponse.json({
      success: true,
      message: existingPrompt ? 'AI prompt updated successfully' : 'AI prompt created successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Save AI prompt error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to save AI prompt' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ai-prompts
 * Soft delete AI prompt (set isActive to false)
 */
export async function DELETE(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const moduleId = searchParams.get('moduleId');
    const moduleIdDescription = searchParams.get('moduleIdDescription');

    if (!moduleId || !moduleIdDescription) {
      return NextResponse.json(
        { success: false, message: 'moduleId and moduleIdDescription are required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(auth.user.companyId);
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);

    await AIPrompt.updateOne(
      {
        moduleId,
        moduleIdDescription,
        tenantId: auth.user.companyId.toString()
      },
      {
        isActive: false,
        updatedBy: auth.user.userId,
        updatedAt: new Date()
      }
    );

    return NextResponse.json({
      success: true,
      message: 'AI prompt deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete AI prompt error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete AI prompt' },
      { status: 500 }
    );
  }
}
