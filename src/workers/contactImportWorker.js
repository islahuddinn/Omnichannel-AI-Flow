// src/workers/contactImportWorker.js
/**
 * Contact Import Worker
 * Processes CSV contact imports in background using RabbitMQ
 */

import { consumeFromQueue, QUEUES } from '../lib/queue/rabbitmq.js';
import { CSVImportService } from '../services/contact/CSVImportService.js';
import { getTenantDB } from '../config/database.js';
import ImportJobSchema from '../models/schemas/ImportJob.js';
import fs from 'fs/promises';
import path from 'path';

const QUEUE_NAME = 'contact_import';

// ✅ Singleton guard - prevent multiple initializations
let contactImportWorker = null;
let isContactImportWorkerInitialized = false;

/**
 * Process contact import job
 */
async function processImportJob(jobData) {
  const {
    jobId: importJobId, // MongoDB _id (ObjectId string)
    tenantId,
    companyId,
    userId,
    filePath,
    fileName,
    options = {},
  } = jobData;

  console.log(`📥 Processing contact import job: ${importJobId} (${fileName})`);

  const tenantDB = await getTenantDB(tenantId);
  const ImportJob = tenantDB.models.ImportJob || tenantDB.model('ImportJob', ImportJobSchema);

  // ✅ CRITICAL: Find job by _id (ObjectId) - the jobId in data is the MongoDB _id
  let importJobDoc;
  try {
    // Try to find by _id first (ObjectId)
    importJobDoc = await ImportJob.findById(importJobId);
    if (!importJobDoc) {
      // Fallback: try to find by jobId field (hex string)
      importJobDoc = await ImportJob.findOne({ jobId: importJobId });
    }
  } catch (error) {
    console.error(`❌ Error finding import job ${importJobId}:`, error);
    throw new Error(`Import job not found: ${importJobId}`);
  }

  if (!importJobDoc) {
    throw new Error(`Import job not found: ${importJobId}`);
  }

  // Update job status to processing
  await ImportJob.findByIdAndUpdate(importJobDoc._id, {
    status: 'processing',
    startedAt: new Date(),
  });

  try {
    // Initialize CSV import service
    const importService = new CSVImportService(tenantId, companyId, userId, options);

    // Track progress
    let totalRecords = 0;
    let processedRecords = 0;
    let successfulImports = 0;
    let failedImports = 0;
    let skippedImports = 0;
    const errors = [];

    // Progress callback
    const onProgress = async (progress) => {
      if (progress.type === 'mapping') {
        // Field mapping detected
        console.log(`📋 Field mapping detected: ${progress.headers.length} columns`);
        await ImportJob.findByIdAndUpdate(importJobDoc._id, {
          fieldMapping: progress.mapping,
          headers: progress.headers,
        });
      } else if (progress.type === 'progress') {
        if (progress.total && progress.total > 0) {
          totalRecords = progress.total;
        }

        processedRecords = progress.processed;
        successfulImports = progress.successful;
        failedImports = progress.failed;
        skippedImports = progress.skipped || 0;

        // Calculate progress percentage, capped at 99% during processing (100% only on complete)
        let progressPercentage;
        if (totalRecords > 0) {
          progressPercentage = Math.min(99, Math.round((processedRecords / totalRecords) * 100));
        } else {
          progressPercentage = Math.min(95, Math.round((processedRecords / (processedRecords + 100)) * 100));
        }

        const limitedErrors = (progress.errors || []).slice(-500);

        await ImportJob.findByIdAndUpdate(importJobDoc._id, {
          totalRecords: totalRecords || 0,
          processedRecords,
          successfulImports,
          failedImports,
          skippedImports,
          importErrors: limitedErrors,
          progress: progressPercentage,
          updatedAt: new Date(),
        });
      } else if (progress.type === 'complete') {
        totalRecords = progress.total;
        processedRecords = progress.processed;
        successfulImports = progress.successful;
        failedImports = progress.failed;
        skippedImports = progress.skipped || 0;
        
        console.log(`✅ Import completed: ${successfulImports} successful, ${failedImports} failed, ${skippedImports} skipped (duplicates)`);
      }
    };

    // Process CSV file
    const result = await importService.processCSVStream(filePath, onProgress);

    // ✅ Limit errors to prevent document size issues (max 500 errors)
    const finalErrors = (result.errors || errors || []).slice(-500);
    
    // ✅ Update final status with all counts
    await ImportJob.findByIdAndUpdate(importJobDoc._id, {
      status: 'completed',
      totalRecords: result.total || totalRecords,
      processedRecords: result.processed || processedRecords,
      successfulImports: result.successful || successfulImports,
      failedImports: result.failed || failedImports,
      skippedImports: result.skipped || skippedImports, // Track skipped duplicates
      importErrors: finalErrors, // ✅ Limit errors to prevent document size issues
      progress: 100,
      completedAt: new Date(),
      updatedAt: new Date(),
    });

    // Clean up uploaded file
    try {
      await fs.unlink(filePath);
      console.log(`🗑️ Cleaned up file: ${filePath}`);
    } catch (error) {
      console.warn(`⚠️ Failed to delete file ${filePath}:`, error);
    }

    console.log(`✅ Contact import job ${importJobId} completed successfully`);

    return {
      success: true,
      total: result.total,
      processed: result.processed,
      successful: result.successful,
      failed: result.failed,
      skipped: result.skipped || 0,
      errors: result.errors,
    };
  } catch (error) {
    console.error(`❌ Contact import job ${importJobId} failed:`, error);

    // ✅ Update job status to failed (use importJobDoc._id if available)
    try {
      if (importJobDoc && importJobDoc._id) {
        await ImportJob.findByIdAndUpdate(importJobDoc._id, {
          status: 'failed',
          error: error.message,
          failedAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        // Fallback: try to find and update by importJobId
        const fallbackJob = await ImportJob.findById(importJobId) || await ImportJob.findOne({ jobId: importJobId });
        if (fallbackJob) {
          await ImportJob.findByIdAndUpdate(fallbackJob._id, {
            status: 'failed',
            error: error.message,
            failedAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
    } catch (updateError) {
      console.error(`❌ Failed to update job status to failed:`, updateError);
    }

    // Clean up uploaded file
    try {
      await fs.unlink(filePath);
    } catch (unlinkError) {
      console.warn(`⚠️ Failed to delete file ${filePath}:`, unlinkError);
    }

    // Mark as non-retryable so RabbitMQ acknowledges instead of requeuing
    error.retryable = false;
    throw error;
  }
}

/**
 * Create and start contact import worker
 */
export async function createContactImportWorker() {
  // ✅ CRITICAL: Prevent multiple initializations
  if (isContactImportWorkerInitialized && contactImportWorker) {
    console.log('✅ Contact import worker already initialized, reusing existing instance');
    return contactImportWorker;
  }

  try {
    // ✅ Use RabbitMQ instead of BullMQ
    contactImportWorker = await consumeFromQueue(
      QUEUES.CONTACT_IMPORT,
      async (jobData, msg) => {
        console.log(`📥 Contact import worker received job: ${jobData.jobId}`);
        try {
          return await processImportJob(jobData);
        } catch (error) {
          console.error(`❌ Error processing contact import job ${jobData.jobId}:`, error);
          throw error;
        }
      },
      {
        maxRetries: 3,
        requeue: true,
      }
    );

    console.log(`✅ Contact import worker started for queue: ${QUEUES.CONTACT_IMPORT}`);
    isContactImportWorkerInitialized = true;

    return contactImportWorker;
  } catch (error) {
    console.error(`❌ Failed to create contact import worker:`, error);
    isContactImportWorkerInitialized = false;
    contactImportWorker = null;
    throw error;
  }
}

/**
 * Stop contact import worker
 */
export async function stopContactImportWorker() {
  if (contactImportWorker) {
    await contactImportWorker.cancel();
    contactImportWorker = null;
    isContactImportWorkerInitialized = false;
    console.log('🛑 Contact import worker stopped');
  }
}

