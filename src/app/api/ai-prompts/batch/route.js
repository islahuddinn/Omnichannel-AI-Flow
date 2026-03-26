// src/app/api/ai-prompts/batch/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth.js';
import { getTenantDB } from '@/config/database.js';
import AIPromptSchema from '@/models/schemas/AIPrompt.js';

/**
 * GET /api/ai-prompts/batch?moduleId=xxx
 * Fetch all AI prompts for a channel (moduleId)
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

    if (!moduleId) {
      return NextResponse.json(
        { success: false, message: 'moduleId is required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(auth.user.companyId);
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);

    // Return all prompts for this moduleId
    const prompts = await AIPrompt.find({
      moduleId,
      tenantId: auth.user.companyId.toString(),
      isActive: true
    }).lean();

    return NextResponse.json({
      success: true,
      data: prompts || []
    });
  } catch (error) {
    console.error('❌ Get AI prompts error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch AI prompts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-prompts/batch
 * Create or update multiple AI prompts (batch upsert)
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
    const { prompts } = body;

    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
      return NextResponse.json(
        { success: false, message: 'prompts array is required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(auth.user.companyId);
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);

    const results = [];
    const errors = [];

    for (const promptData of prompts) {
      try {
        const { moduleId, moduleIdDescription, prompt, name, description } = promptData;

        if (!moduleId || !moduleIdDescription) {
          errors.push({
            promptData,
            error: 'moduleId and moduleIdDescription are required'
          });
          continue;
        }

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

        results.push(result);
      } catch (err) {
        console.error('❌ Error processing prompt:', err);
        errors.push({
          promptData,
          error: err.message
        });
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      message: `${results.length} prompt(s) saved successfully${errors.length > 0 ? `, ${errors.length} error(s)` : ''}`,
      data: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('❌ Batch save AI prompts error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to save AI prompts' },
      { status: 500 }
    );
  }
}
