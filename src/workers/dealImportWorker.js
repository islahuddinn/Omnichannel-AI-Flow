// src/workers/dealImportWorker.js
/**
 * Deal Import Worker
 * Processes CSV deal imports in background using RabbitMQ
 */

import { consumeFromQueue, QUEUES } from '../lib/queue/rabbitmq.js';
import { DealCSVImportService } from '../services/deal/CSVImportService.js';
import { getTenantDB } from '../config/database.js';
import ImportJobSchema from '../models/schemas/ImportJob.js';
import fs from 'fs/promises';
import path from 'path';

const QUEUE_NAME = 'deal_import';

// ✅ Singleton guard - prevent multiple initializations
let dealImportWorker = null;
let isDealImportWorkerInitialized = false;

/**
 * Process deal import job
 */
async function processImportJob(jobData) {
  const {
    jobId: importJobId,
    tenantId,
    companyId,
    userId,
    filePath,
    fileName,
    options = {},
  } = jobData;

  console.log(`📥 Processing deal import job: ${importJobId} (${fileName})`);

  const tenantDB = await getTenantDB(tenantId);
  const ImportJob = tenantDB.models.ImportJob || tenantDB.model('ImportJob', ImportJobSchema);

  let importJobDoc;
  try {
    importJobDoc = await ImportJob.findById(importJobId);
    if (!importJobDoc) {
      importJobDoc = await ImportJob.findOne({ jobId: importJobId });
    }
  } catch (error) {
    console.error(`❌ Error finding import job ${importJobId}:`, error);
    throw new Error(`Import job not found: ${importJobId}`);
  }

  if (!importJobDoc) {
    throw new Error(`Import job not found: ${importJobId}`);
  }

  await ImportJob.findByIdAndUpdate(importJobDoc._id, {
    status: 'processing',
    startedAt: new Date(),
  });

    try {
      // Initialize CSV import service with tenantId and companyId (same as contact import)
      const importService = new DealCSVImportService(tenantId, companyId, userId, options);

    let totalRecords = 0;
    let processedRecords = 0;
    let successfulImports = 0;
    let failedImports = 0;
    let skippedImports = 0;
    const errors = [];

    const onProgress = async (progress) => {
      if (progress.type === 'mapping') {
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
        
        const progressPercentage = totalRecords > 0 
          ? Math.round((progress.processed / totalRecords) * 100)
          : Math.min(95, Math.round((progress.processed / (progress.processed + 100)) * 100));
        
        const limitedErrors = (progress.errors || []).slice(-500);
        
        await ImportJob.findByIdAndUpdate(importJobDoc._id, {
          totalRecords: totalRecords || 0,
          processedRecords: progress.processed,
          successfulImports: progress.successful,
          failedImports: progress.failed,
          skippedImports: skippedImports,
          importErrors: limitedErrors,
          progress: progressPercentage,
          updatedAt: new Date(),
        });

        // ✅ Progress is tracked in database only (no BullMQ job progress)
      } else if (progress.type === 'complete') {
        totalRecords = progress.total;
        processedRecords = progress.processed;
        successfulImports = progress.successful;
        failedImports = progress.failed;
        skippedImports = progress.skipped || 0;
        
        console.log(`✅ Deal import completed: ${successfulImports} successful, ${failedImports} failed, ${skippedImports} skipped (duplicates)`);
      }
    };

      const result = await importService.processCSVStream(filePath, onProgress, tenantId);

    const finalErrors = (result.errors || errors || []).slice(-500);
    
    await ImportJob.findByIdAndUpdate(importJobDoc._id, {
      status: 'completed',
      totalRecords: result.total || totalRecords,
      processedRecords: result.processed || processedRecords,
      successfulImports: result.successful || successfulImports,
      failedImports: result.failed || failedImports,
      skippedImports: result.skipped || skippedImports,
      importErrors: finalErrors,
      progress: 100,
      completedAt: new Date(),
      updatedAt: new Date(),
    });

    try {
      await fs.unlink(filePath);
      console.log(`🗑️ Cleaned up file: ${filePath}`);
    } catch (error) {
      console.warn(`⚠️ Failed to delete file ${filePath}:`, error);
    }

    console.log(`✅ Deal import job ${importJobId} completed successfully`);

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
    console.error(`❌ Deal import job ${importJobId} failed:`, error);

    try {
      if (importJobDoc && importJobDoc._id) {
        await ImportJob.findByIdAndUpdate(importJobDoc._id, {
          status: 'failed',
          error: error.message,
          failedAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
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
 * Create and start deal import worker (lazy-loaded)
 * This worker is only created when actually needed (when a job is queued)
 */
export async function createDealImportWorker() {
  if (isDealImportWorkerInitialized && dealImportWorker) {
    console.log('✅ Deal import worker already initialized, reusing existing instance');
    return dealImportWorker;
  }

  try {
    // ✅ Use RabbitMQ instead of BullMQ
    dealImportWorker = await consumeFromQueue(
      QUEUES.DEAL_IMPORT,
      async (jobData, msg) => {
        console.log(`📥 Deal import worker received job: ${jobData.jobId}`);
        try {
          return await processImportJob(jobData);
        } catch (error) {
          console.error(`❌ Error processing deal import job ${jobData.jobId}:`, error);
          throw error;
        }
      },
      {
        maxRetries: 3,
        requeue: true,
      }
    );

    console.log(`✅ Deal import worker started for queue: ${QUEUES.DEAL_IMPORT}`);
    isDealImportWorkerInitialized = true;

    return dealImportWorker;
  } catch (error) {
    console.error(`❌ Failed to create deal import worker:`, error);
    isDealImportWorkerInitialized = false;
    dealImportWorker = null;
    throw error;
  }
}

/**
 * Stop deal import worker
 */
export async function stopDealImportWorker() {
  if (dealImportWorker) {
    await dealImportWorker.cancel();
    dealImportWorker = null;
    isDealImportWorkerInitialized = false;
    console.log('🛑 Deal import worker stopped');
  }
}

