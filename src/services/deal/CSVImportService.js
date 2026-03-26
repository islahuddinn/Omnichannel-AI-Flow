// src/services/deal/CSVImportService.js
/**
 * CSV Deal Import Service
 * Handles streaming CSV parsing, dynamic field mapping, and batch processing for deals
 */

import { parse } from 'csv-parse';
import { createReadStream } from 'fs';
import DealSchema from '../../models/schemas/Deal.js';

export class DealCSVImportService {
  constructor(tenantId, companyId, userId, options = {}) {
    this.tenantId = tenantId;
    this.companyId = companyId;
    this.userId = userId;
    this.batchSize = options.batchSize || 1000;
    this.importStartTime = new Date(); // ✅ Track import start time to exclude newly imported deals
    this.importedDealIds = new Set(); // ✅ Track deals imported in this job to avoid false duplicates
  }

  /**
   * Detect and map CSV columns to Deal schema fields
   */
  detectFieldMapping(headers) {
    const mapping = {
      standard: {},
      custom: [],
    };

    const fieldPatterns = {
      name: /^(name|Name|NAME)$/i,
      stage: /^(stage|Stage|STAGE)$/i,
      status: /^(status|Status|STATUS)$/i,
      dealId: /^(id|Id|ID)$/i, // CSV column "Id" maps to deal_id
    };

    headers.forEach((header) => {
      // ✅ Ensure header is a string and trim it
      const normalized = String(header).trim();
      let mapped = false;

      // Check standard field patterns
      for (const [field, pattern] of Object.entries(fieldPatterns)) {
        if (pattern.test(normalized)) {
          // ✅ Store the original header name (not normalized) for exact matching
          mapping.standard[field] = header; // Use original header for exact key matching
          mapped = true;
          console.log(`✅ Mapped header "${header}" to field "${field}"`);
          break;
        }
      }

      // If not mapped to standard field, add to custom
      if (!mapped) {
        mapping.custom.push({ name: normalized });
      }
    });

    // ✅ Debug: Log the mapping result
    console.log('📋 Field mapping result:', {
      dealId: mapping.standard.dealId,
      name: mapping.standard.name,
      stage: mapping.standard.stage,
      status: mapping.standard.status,
    });

    return mapping;
  }

  /**
   * Transform CSV row to Deal document
   */
  transformRowToDeal(row, mapping, rowIndex) {
    const deal = {
      details: {},
      metadata: {
        source: 'csv_import',
        importedAt: new Date(),
        rowIndex: rowIndex + 1,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Map deal_id from CSV "Id" column - primary identifier
    // ✅ CRITICAL: Check actual row keys first (CSV parser uses original column names as keys)
    const rowKeys = Object.keys(row);
    
    // ✅ Debug: Log row keys for first few rows
    if (rowIndex < 3) {
      console.log(`🔍 Row ${rowIndex + 1} keys:`, rowKeys);
      console.log(`🔍 Row ${rowIndex + 1} sample values:`, Object.fromEntries(
        rowKeys.slice(0, 5).map(key => [key, row[key]])
      ));
    }
    
    // ✅ First try to use the mapped column name (original header name from CSV)
    let dealIdColumn = mapping.standard.dealId;
    
    // ✅ If mapping has dealId, use it directly (it's the original header name)
    if (dealIdColumn) {
      // ✅ Check if the column exists in the row (case-sensitive match first)
      if (!(dealIdColumn in row)) {
        // ✅ Try case-insensitive match
        const caseInsensitiveMatch = rowKeys.find(col => 
          String(col).trim().toLowerCase() === String(dealIdColumn).trim().toLowerCase()
        );
        if (caseInsensitiveMatch) {
          dealIdColumn = caseInsensitiveMatch;
          console.log(`✅ Found case-insensitive match for dealId: "${dealIdColumn}"`);
        }
      }
    }
    
    // ✅ If not in mapping or not found, search all column names for "Id" (case-insensitive)
    if (!dealIdColumn || !(dealIdColumn in row)) {
      dealIdColumn = rowKeys.find(col => {
        const normalized = String(col).trim();
        // Match exactly "Id", "id", "ID" (case-insensitive)
        return /^id$/i.test(normalized);
      });
    }
    
    // ✅ If still not found, try more flexible patterns
    if (!dealIdColumn) {
      dealIdColumn = rowKeys.find(col => {
        const normalized = String(col).trim();
        // Match "Id", "ID", "id", "deal_id", "Deal_Id", etc.
        return /^(id|deal[_\s]?id)$/i.test(normalized);
      });
    }
    
    // ✅ Debug: Log what we found
    if (rowIndex < 3) {
      console.log(`🔍 Row ${rowIndex + 1} - dealIdColumn found:`, dealIdColumn);
      if (dealIdColumn) {
        console.log(`🔍 Row ${rowIndex + 1} - dealIdColumn value:`, row[dealIdColumn]);
        console.log(`🔍 Row ${rowIndex + 1} - dealIdColumn value type:`, typeof row[dealIdColumn]);
      }
    }
    
    if (dealIdColumn && (dealIdColumn in row)) {
      const dealIdValue = row[dealIdColumn];
      if (dealIdValue !== undefined && dealIdValue !== null && dealIdValue !== '') {
        // ✅ Convert to string and trim to ensure it's saved correctly
        const trimmedValue = String(dealIdValue).trim();
        if (trimmedValue) {
          deal.deal_id = trimmedValue;
          if (rowIndex < 3) {
            console.log(`✅ Mapped deal_id from column "${dealIdColumn}": "${trimmedValue}"`);
          }
        } else {
          if (rowIndex < 3) {
            console.warn(`⚠️ Row ${rowIndex + 1} - dealIdColumn "${dealIdColumn}" has empty value after trim:`, dealIdValue);
          }
        }
      } else {
        if (rowIndex < 3) {
          console.warn(`⚠️ Row ${rowIndex + 1} - dealIdColumn "${dealIdColumn}" has no value (undefined/null/empty):`, dealIdValue);
        }
      }
    } else {
      console.warn(`⚠️ No "Id" column found in CSV row ${rowIndex + 1}. Available columns: ${rowKeys.join(', ')}`);
      // ✅ Try to find any column that might be the ID
      const possibleIdColumns = rowKeys.filter(col => {
        const normalized = String(col).toLowerCase().trim();
        return normalized.includes('id') || normalized === 'id';
      });
      if (possibleIdColumns.length > 0) {
        console.warn(`⚠️ Possible ID columns found: ${possibleIdColumns.join(', ')}`);
        // ✅ Try the first possible ID column
        if (possibleIdColumns.length > 0 && rowIndex < 3) {
          const firstIdColumn = possibleIdColumns[0];
          console.log(`⚠️ Trying first possible ID column "${firstIdColumn}" with value:`, row[firstIdColumn]);
        }
      }
    }

    // Map standard fields (only name, stage, status)
    if (mapping.standard.name) {
      const nameValue = row[mapping.standard.name]?.trim();
      if (nameValue) {
        deal.name = nameValue;
      }
    }

    if (mapping.standard.stage) {
      const stageValue = row[mapping.standard.stage]?.trim();
      if (stageValue) {
        deal.stage = stageValue;
      }
    }

    if (mapping.standard.status) {
      const statusValue = row[mapping.standard.status]?.trim();
      if (statusValue) {
        deal.status = statusValue;
      }
    }

    // Map ALL CSV fields to details object (including Name, Stage, Status, etc.)
    // Only exclude the Id column (which is mapped to deal_id)
    const excludedColumns = new Set([
      ...Object.keys(row).filter(col => {
        const normalized = col.trim();
        return /^(id|Id|ID)$/i.test(normalized);
      }),
    ]);
    
    // Initialize details as a plain object
    if (!deal.details) {
      deal.details = {};
    }
    
    // Store ALL CSV fields in details (except Id which is mapped to deal_id)
    Object.keys(row).forEach((columnName) => {
      if (excludedColumns.has(columnName)) {
        return; // Skip Id column
      }
      
      const value = row[columnName]?.trim();
      if (value !== undefined && value !== '') {
        // Store in details object with original field name as-is
        deal.details[columnName] = value;
      }
    });

    return deal;
  }

  /**
   * Count total data rows in a CSV file (excluding header row and empty lines)
   */
  async countCSVRows(filePath) {
    return new Promise((resolve, reject) => {
      let count = 0;
      const readStream = createReadStream(filePath);
      const counter = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
      });
      readStream
        .pipe(counter)
        .on('data', () => { count++; })
        .on('end', () => resolve(count))
        .on('error', (err) => {
          console.warn('⚠️ Could not pre-count CSV rows:', err.message);
          resolve(0);
        });
    });
  }

  /**
   * Process CSV file stream
   */
  async processCSVStream(filePath, onProgress) {
    const { getTenantDB } = await import('../../config/database.js');
    const tenantDB = await getTenantDB(this.tenantId);

    // Delete existing model if it exists to avoid schema conflicts
    if (tenantDB.models.Deal) {
      delete tenantDB.models.Deal;
    }

    // Create model with fresh schema
    const Deal = tenantDB.model('Deal', DealSchema);

    // Pre-count total rows for accurate progress reporting
    const totalRows = await this.countCSVRows(filePath);
    console.log(`📊 Pre-counted ${totalRows} data rows in CSV`);

    let headers = null;
    let mapping = null;
    let batch = [];
    let rowIndex = 0;
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const errors = [];
    const serviceInstance = this;

    // CSV Parser with streaming support
    const csvParser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_records_with_empty_values: false,
      cast: false,
    });

    /**
     * Check for duplicates in bulk - ONLY based on deal_id
     */
    const checkDuplicatesBulk = async (deals) => {
      const dealIds = new Set();
      const dealIdMap = new Map();

      deals.forEach((deal, index) => {
        if (deal.deal_id) {
          const dealId = deal.deal_id.trim();
          if (dealId) {
            dealIds.add(dealId);
            dealIdMap.set(dealId, index);
          }
        }
      });

      if (dealIds.size === 0) {
        console.log(`✅ No deal_ids in batch of ${deals.length} deals - all will be imported`);
        return new Set();
      }

      // ✅ Query for existing deals with matching deal_ids
      // ✅ CRITICAL: Only check against deals that existed BEFORE this import started
      // This prevents false duplicates from deals imported in previous batches
      // Note: Deals don't have companyId in schema, but we use tenantId for database selection
      const query = {
        deal_id: { $in: Array.from(dealIds) },
        // ✅ Exclude deals imported in this job (created after import start time minus 1 second buffer)
        createdAt: { $lt: new Date(this.importStartTime.getTime() - 1000) },
      };

      console.log(`🔍 Checking ${dealIds.size} unique deal_ids from batch of ${deals.length} deals`);
      console.log(`   Query: deal_id in [${Array.from(dealIds).slice(0, 5).join(', ')}${dealIds.size > 5 ? '...' : ''}]`);
      
      const existingDeals = await Deal.find(query).select('deal_id createdAt').lean();
      
      // ✅ Log how many existing deals we're checking against
      if (existingDeals.length > 0) {
        console.log(`⚠️ Found ${existingDeals.length} pre-existing deals with matching deal_ids (created before ${this.importStartTime.toISOString()})`);
      } else {
        console.log(`✅ No existing deals found with matching deal_ids - all ${deals.length} deals will be imported`);
      }
      
      const existingDealIds = new Set();
      existingDeals.forEach((deal) => {
        if (deal.deal_id) {
          const dealId = deal.deal_id.trim();
          if (dealId) {
            existingDealIds.add(dealId);
          }
        }
      });

      const duplicateIndices = new Set();
      deals.forEach((deal, index) => {
        if (deal.deal_id) {
          const dealId = deal.deal_id.trim();
          if (dealId && existingDealIds.has(dealId)) {
            duplicateIndices.add(index);
            if (duplicateIndices.size <= 5) {
              console.log(`⚠️ Duplicate detected: deal_id ${dealId} already exists in database`);
            }
          }
        }
      });

      if (duplicateIndices.size > 0) {
        console.log(`⚠️ Found ${duplicateIndices.size} duplicates in batch of ${deals.length} (based on deal_id only)`);
      }

      return duplicateIndices;
    };

    const processBatch = async (deals) => {
      if (deals.length === 0) return;

      console.log(`📦 Processing batch of ${deals.length} deals...`);
      
      const duplicateIndices = await checkDuplicatesBulk(deals);
      
      console.log(`🔍 Duplicate check complete: ${duplicateIndices.size} duplicates found out of ${deals.length} deals`);
      
      const dealsToInsert = [];
      let dealsWithDealId = 0;
      let dealsWithoutDealId = 0;
      
      deals.forEach((deal, index) => {
        if (deal.deal_id) {
          dealsWithDealId++;
        } else {
          dealsWithoutDealId++;
        }
        
        if (duplicateIndices.has(index)) {
          skippedCount++;
          errors.push({
            row: rowIndex - deals.length + index + 1,
            field: 'deal_id',
            error: `Duplicate deal (deal_id ${deal.deal_id || 'N/A'} already exists in database)`,
          });
        } else {
          dealsToInsert.push(deal);
        }
      });
      
      console.log(`📊 Batch breakdown: ${dealsWithDealId} with deal_id, ${dealsWithoutDealId} without deal_id`);
      console.log(`📊 After duplicate check: ${dealsToInsert.length} to insert, ${duplicateIndices.size} skipped`);

      if (dealsToInsert.length === 0) {
        processedCount += deals.length;
        const limitedErrors = errors.slice(-500);
        onProgress?.({
          type: 'progress',
          total: totalRows || rowIndex,
          processed: processedCount,
          successful: successCount,
          failed: errorCount,
          skipped: skippedCount,
          errors: limitedErrors,
        });
        return;
      }

      try {
        let result;
        let insertedCount = 0;
        let insertedIds = [];
        
        try {
          // Ensure details is always a plain object and deal_id is preserved
          const dealsWithPlainObjects = dealsToInsert.map((deal, idx) => {
            const dealCopy = { ...deal };
            
            // ✅ CRITICAL: Ensure deal_id is preserved - this is the primary identifier
            if (deal.deal_id !== undefined && deal.deal_id !== null && deal.deal_id !== '') {
              dealCopy.deal_id = String(deal.deal_id).trim();
              // ✅ Debug log for first few deals
              if (idx < 3) {
                console.log(`✅ Preserving deal_id for deal ${idx + 1}: "${dealCopy.deal_id}" (original: "${deal.deal_id}")`);
              }
            } else {
              // ✅ Warn if deal_id is missing
              if (idx < 3) {
                console.warn(`⚠️ Deal ${idx + 1} has no deal_id! Deal object:`, {
                  deal_id: deal.deal_id,
                  name: deal.name,
                  keys: Object.keys(deal),
                });
              }
            }
            
            // ✅ Ensure name, stage, status are preserved
            if (deal.name) dealCopy.name = String(deal.name).trim();
            if (deal.stage) dealCopy.stage = String(deal.stage).trim();
            if (deal.status) dealCopy.status = String(deal.status).trim();
            
            // ✅ Ensure details is always a plain object
            if (dealCopy.details instanceof Map) {
              dealCopy.details = Object.fromEntries(dealCopy.details);
            } else if (!dealCopy.details || typeof dealCopy.details !== 'object' || Array.isArray(dealCopy.details)) {
              dealCopy.details = {};
            }
            
            // ✅ Ensure metadata is always a plain object
            if (dealCopy.metadata instanceof Map) {
              dealCopy.metadata = Object.fromEntries(dealCopy.metadata);
            } else if (!dealCopy.metadata || typeof dealCopy.metadata !== 'object' || Array.isArray(dealCopy.metadata)) {
              dealCopy.metadata = dealCopy.metadata || {};
            }
            
            return dealCopy;
          });
          
          // ✅ Debug: Log first deal before insert
          if (dealsWithPlainObjects.length > 0) {
            console.log(`🔍 First deal before insertMany:`, {
              deal_id: dealsWithPlainObjects[0].deal_id,
              name: dealsWithPlainObjects[0].name,
              stage: dealsWithPlainObjects[0].stage,
              status: dealsWithPlainObjects[0].status,
              hasDetails: !!dealsWithPlainObjects[0].details,
            });
          }
          
          result = await Deal.insertMany(dealsWithPlainObjects, {
            ordered: false,
            rawResult: true,
            runValidators: true,
          });
          
          insertedCount = result.insertedCount || 0;
          insertedIds = result.insertedIds ? Object.values(result.insertedIds) : [];
          
          // ✅ Debug: Verify deal_id was saved correctly
          if (insertedIds.length > 0) {
            try {
              const insertedDeals = await Deal.find({
                _id: { $in: insertedIds.slice(0, 3) }
              }).select('deal_id name').lean();
              
              insertedDeals.forEach((savedDeal, idx) => {
                const originalDeal = dealsWithPlainObjects[idx];
                if (savedDeal.deal_id) {
                  console.log(`✅ Deal ${idx + 1} saved with deal_id: "${savedDeal.deal_id}"`);
                } else {
                  console.error(`❌ Deal ${idx + 1} saved WITHOUT deal_id! Original had: "${originalDeal?.deal_id || 'N/A'}"`);
                }
              });
            } catch (verifyError) {
              console.error('❌ Error verifying saved deals:', verifyError);
            }
          }
          
          if (insertedCount < dealsToInsert.length) {
            const missingCount = dealsToInsert.length - insertedCount;
            console.warn(`⚠️ Only ${insertedCount} out of ${dealsToInsert.length} deals were inserted. Retrying ${missingCount} missing deals individually...`);
            
            const insertedDealIds = new Set();
            if (insertedIds.length > 0) {
              try {
                const insertedDeals = await Deal.find({
                  _id: { $in: insertedIds },
                }).select('deal_id').lean();
                
                insertedDeals.forEach(d => {
                  if (d.deal_id) {
                    const dealId = d.deal_id.trim();
                    if (dealId) insertedDealIds.add(dealId);
                  }
                });
              } catch (queryError) {
                console.error(`❌ Error querying inserted deals:`, queryError);
              }
            }
            
            let individualSuccess = 0;
            let individualFailed = 0;
            let individualSkipped = 0;
            
            for (let i = 0; i < dealsToInsert.length; i++) {
              const deal = dealsToInsert[i];
              const dealId = deal.deal_id ? deal.deal_id.trim() : null;
              
              if (dealId && insertedDealIds.has(dealId)) {
                continue;
              }
              
              try {
                const dealToInsert = { ...deal };
                
                // ✅ Ensure deal_id is preserved
                if (deal.deal_id) {
                  dealToInsert.deal_id = String(deal.deal_id).trim();
                }
                
                // ✅ Ensure name, stage, status are preserved
                if (deal.name) dealToInsert.name = String(deal.name).trim();
                if (deal.stage) dealToInsert.stage = String(deal.stage).trim();
                if (deal.status) dealToInsert.status = String(deal.status).trim();
                
                // ✅ Ensure details is always a plain object
                if (dealToInsert.details instanceof Map) {
                  dealToInsert.details = Object.fromEntries(dealToInsert.details);
                } else if (!dealToInsert.details || typeof dealToInsert.details !== 'object' || Array.isArray(dealToInsert.details)) {
                  dealToInsert.details = {};
                }
                
                // ✅ Ensure metadata is always a plain object
                if (dealToInsert.metadata instanceof Map) {
                  dealToInsert.metadata = Object.fromEntries(dealToInsert.metadata);
                } else if (!dealToInsert.metadata || typeof dealToInsert.metadata !== 'object' || Array.isArray(dealToInsert.metadata)) {
                  dealToInsert.metadata = dealToInsert.metadata || {};
                }
                
                const newDeal = await Deal.create(dealToInsert);
                insertedIds.push(newDeal._id);
                if (dealId) insertedDealIds.add(dealId);
                individualSuccess++;
                insertedCount++;
              } catch (individualError) {
                const errorMessage = individualError.message || 'Unknown error';
                let friendlyError = errorMessage;
                let isDuplicate = false;
                
                if (errorMessage.includes('duplicate key') || errorMessage.includes('E11000')) {
                  friendlyError = 'Duplicate deal (deal_id or unique field already exists)';
                  skippedCount++;
                  individualSkipped++;
                  isDuplicate = true;
                } else {
                  errorCount++;
                  individualFailed++;
                }
                
                errors.push({
                  row: rowIndex - deals.length + i + 1,
                  field: 'database',
                  error: friendlyError,
                });
                
                if (!isDuplicate && individualFailed <= 10) {
                  console.error(`❌ Failed to insert deal at index ${i} (deal_id: ${dealId || 'N/A'}): ${friendlyError}`);
                }
              }
            }
            
            if (individualSuccess > 0 || individualFailed > 0 || individualSkipped > 0) {
              console.log(`📊 Individual insert results: ${individualSuccess} succeeded, ${individualSkipped} skipped (duplicates), ${individualFailed} failed`);
            }
          }
        } catch (insertError) {
          console.error(`❌ Batch insert error for ${dealsToInsert.length} deals:`, insertError.message);
          
          if (insertError.writeErrors && Array.isArray(insertError.writeErrors)) {
            const writeErrorCount = insertError.writeErrors.length;
            insertedCount = dealsToInsert.length - writeErrorCount;
            
            if (insertError.insertedIds) {
              insertedIds = Object.values(insertError.insertedIds);
            }
            
            console.warn(`⚠️ Partial batch insert: ${insertedCount} succeeded, ${writeErrorCount} failed`);
            
            insertError.writeErrors.forEach((writeError) => {
              const errorMessage = writeError.errmsg || writeError.err?.message || 'Unknown database error';
              let friendlyError = errorMessage;
              
              if (errorMessage.includes('duplicate key')) {
                friendlyError = 'Duplicate deal (deal_id or unique field already exists)';
                skippedCount++;
              } else {
                errorCount++;
              }
              
              errors.push({
                row: writeError.index + rowIndex - deals.length + 1,
                field: 'database',
                error: friendlyError,
              });
            });
          } else {
            console.warn(`⚠️ Batch insert completely failed, trying individual inserts for batch of ${dealsToInsert.length}`);
            let individualSuccess = 0;
            let individualErrors = 0;
            let individualSkipped = 0;
            
            for (let i = 0; i < dealsToInsert.length; i++) {
              try {
                const dealToInsert = { ...dealsToInsert[i] };
                
                if (dealToInsert.details instanceof Map) {
                  dealToInsert.details = Object.fromEntries(dealToInsert.details);
                } else if (!dealToInsert.details || typeof dealToInsert.details !== 'object' || Array.isArray(dealToInsert.details)) {
                  dealToInsert.details = {};
                }
                
                await Deal.create(dealToInsert);
                individualSuccess++;
                insertedCount++;
              } catch (individualError) {
                const errorMessage = individualError.message || 'Unknown error';
                let friendlyError = errorMessage;
                
                if (errorMessage.includes('duplicate key') || errorMessage.includes('E11000')) {
                  friendlyError = 'Duplicate deal (deal_id or unique field already exists)';
                  skippedCount++;
                  individualSkipped++;
                } else {
                  errorCount++;
                  individualErrors++;
                }
                
                errors.push({
                  row: rowIndex - deals.length + i + 1,
                  field: 'database',
                  error: friendlyError,
                });
              }
            }
            
            console.log(`📊 Individual insert results: ${individualSuccess} succeeded, ${individualSkipped} skipped (duplicates), ${individualErrors} failed`);
          }
        }

        successCount += insertedCount;
        processedCount += deals.length;
        
        console.log(`✅ Batch inserted: ${insertedCount} deals successfully (batch size: ${deals.length}, skipped: ${skippedCount})`);

        if (insertedCount < dealsToInsert.length) {
          console.warn(`⚠️ Only ${insertedCount} out of ${dealsToInsert.length} deals were inserted in this batch`);
        }
      } catch (error) {
        console.error(`❌ Batch insert error for ${dealsToInsert.length} deals:`, error.message);
        errorCount += dealsToInsert.length;
        processedCount += deals.length;
      }

      const limitedErrors = errors.slice(-500);
      onProgress?.({
        type: 'progress',
        total: totalRows || rowIndex,
        processed: processedCount,
        successful: successCount,
        failed: errorCount,
        skipped: skippedCount,
        errors: limitedErrors,
      });
    };

    // Process CSV stream using for-await-of for proper backpressure handling
    const readStream = createReadStream(filePath);
    const pipeline = readStream.pipe(csvParser);

    try {
      for await (const record of pipeline) {
        try {
          if (!headers) {
            headers = Object.keys(record);
            mapping = serviceInstance.detectFieldMapping(headers);
            console.log('📋 Field mapping detected:', {
              standard: mapping.standard,
              customCount: mapping.custom.length,
            });
            console.log('📋 Available CSV columns:', headers);

            const idColumnCheck = headers.find(col => /^id$/i.test(col.trim()));
            console.log('📋 "Id" column check:', idColumnCheck ? `Found: "${idColumnCheck}"` : 'NOT FOUND');

            onProgress?.({ type: 'mapping', mapping, headers });
          }

          const deal = serviceInstance.transformRowToDeal(record, mapping, rowIndex);

          if (rowIndex < 3) {
            console.log(`🔍 Deal ${rowIndex + 1} after transform:`, {
              deal_id: deal.deal_id,
              name: deal.name,
              stage: deal.stage,
              status: deal.status,
            });
          }

          if (deal === null) {
            console.warn(`⚠️ Deal at row ${rowIndex + 1} is null, skipping...`);
            skippedCount++;
            errors.push({
              row: rowIndex + 1,
              field: 'deal',
              error: 'Deal is null (unexpected error)',
            });
            rowIndex++;
            continue;
          }

          batch.push(deal);
          rowIndex++;

          if (rowIndex % 1000 === 0) {
            console.log(`📊 Progress: ${rowIndex}/${totalRows || '?'} rows read, ${batch.length} in current batch`);
          }

          if (batch.length >= serviceInstance.batchSize) {
            await processBatch(batch);
            batch = [];
          }
        } catch (error) {
          console.error(`❌ Error processing row ${rowIndex + 1}:`, error.message);
          errorCount++;
          errors.push({
            row: rowIndex + 1,
            error: error.message,
          });
          rowIndex++;
        }
      }

      // Process remaining batch
      if (batch.length > 0) {
        console.log(`📦 Processing final batch of ${batch.length} deals...`);
        await processBatch(batch);
      }

      const actualTotal = successCount + skippedCount + errorCount;

      console.log(`\n📊 Import Summary:`);
      console.log(`   Total rows: ${rowIndex}`);
      console.log(`   Successful: ${successCount}`);
      console.log(`   Skipped (duplicates): ${skippedCount}`);
      console.log(`   Failed: ${errorCount}`);
      console.log(`   Total (success + skipped + failed): ${actualTotal}`);

      const finalErrors = errors.slice(-500);

      onProgress?.({
        type: 'complete',
        total: rowIndex,
        processed: rowIndex,
        successful: successCount,
        failed: errorCount,
        skipped: skippedCount,
        errors: finalErrors,
      });

      return {
        total: rowIndex,
        processed: rowIndex,
        successful: successCount,
        failed: errorCount,
        skipped: skippedCount,
        errors: finalErrors,
      };
    } catch (error) {
      onProgress?.({
        type: 'error',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Process CSV stream from a Node.js stream (for direct uploads)
   * Streams file line-by-line to avoid loading entire file into memory
   * File is not stored anywhere - only processed deals are saved to database
   */
  async processCSVStreamFromStream(fileStream, onProgress) {
    const { getTenantDB } = await import('../../config/database.js');
    const tenantDB = await getTenantDB(this.tenantId);
    
    // Delete existing model if it exists to avoid schema conflicts
    if (tenantDB.models.Deal) {
      delete tenantDB.models.Deal;
    }
    
    // Create model with fresh schema
    const Deal = tenantDB.model('Deal', DealSchema);

    let headers = null;
    let mapping = null;
    let batch = [];
    let rowIndex = 0;
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const errors = [];
    const serviceInstance = this;

    // CSV Parser with streaming support
    const csvParser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_records_with_empty_values: false,
      cast: false,
    });

    // Same helper functions as processCSVStream
    const checkDuplicatesBulk = async (deals) => {
      const dealIds = new Set();
      const dealIdMap = new Map();

      deals.forEach((deal, index) => {
        if (deal.deal_id) {
          const dealId = deal.deal_id.trim();
          if (dealId) {
            dealIds.add(dealId);
            dealIdMap.set(dealId, index);
          }
        }
      });

      if (dealIds.size === 0) {
        return new Set();
      }

      const query = {
        deal_id: { $in: Array.from(dealIds) },
        createdAt: { $lt: new Date(this.importStartTime.getTime() - 1000) },
      };

      const existingDeals = await Deal.find(query).select('deal_id createdAt').lean();
      
      const existingDealIds = new Set();
      existingDeals.forEach((deal) => {
        if (deal.deal_id) {
          const dealId = deal.deal_id.trim();
          if (dealId) {
            existingDealIds.add(dealId);
          }
        }
      });

      const duplicateIndices = new Set();
      deals.forEach((deal, index) => {
        if (deal.deal_id) {
          const dealId = deal.deal_id.trim();
          if (dealId && existingDealIds.has(dealId)) {
            duplicateIndices.add(index);
          }
        }
      });

      return duplicateIndices;
    };

    const processBatch = async () => {
      if (batch.length === 0) return;

      const duplicateIndices = await checkDuplicatesBulk(batch);
      const dealsToInsert = [];
      const dealsToUpdate = [];

      batch.forEach((deal, index) => {
        if (duplicateIndices.has(index)) {
          skippedCount++;
          errors.push({
            row: rowIndex - batch.length + index + 1,
            field: 'deal_id',
            error: `Duplicate deal_id: ${deal.deal_id}`,
          });
        } else {
          if (deal.deal_id) {
            dealsToUpdate.push(deal);
          } else {
            dealsToInsert.push(deal);
          }
        }
      });

      try {
        if (dealsToInsert.length > 0) {
          await Deal.insertMany(dealsToInsert, { ordered: false });
          successCount += dealsToInsert.length;
        }

        for (const deal of dealsToUpdate) {
          try {
            await Deal.findOneAndUpdate(
              { deal_id: deal.deal_id },
              { $set: deal },
              { upsert: true, new: true }
            );
            successCount++;
          } catch (updateError) {
            errorCount++;
            errors.push({
              row: rowIndex - batch.length + dealsToUpdate.indexOf(deal) + 1,
              error: updateError.message,
            });
          }
        }

        processedCount += batch.length;
        onProgress?.({
          type: 'progress',
          processed: processedCount,
          successful: successCount,
          failed: errorCount,
          skipped: skippedCount,
          errors: errors.slice(-500),
        });
      } catch (batchError) {
        errorCount += batch.length;
        batch.forEach((_, index) => {
          errors.push({
            row: rowIndex - batch.length + index + 1,
            error: batchError.message,
          });
        });
        onProgress?.({
          type: 'progress',
          processed: processedCount,
          successful: successCount,
          failed: errorCount,
          skipped: skippedCount,
          errors: errors.slice(-500),
        });
      }

      batch = [];
    };

    // Process CSV stream using for-await-of for proper backpressure handling
    const pipeline = fileStream.pipe(csvParser);

    try {
      for await (const record of pipeline) {
        rowIndex++;

        try {
          if (!headers) {
            headers = Object.keys(record);
            mapping = serviceInstance.detectFieldMapping(headers);
            console.log('📋 Field mapping detected:', {
              standard: mapping.standard,
              customCount: mapping.custom.length,
            });

            onProgress?.({
              type: 'mapping',
              headers,
              mapping,
            });
          }

          const deal = serviceInstance.transformRowToDeal(record, mapping, rowIndex - 1);
          batch.push(deal);

          if (batch.length >= serviceInstance.batchSize) {
            await processBatch();
          }
        } catch (rowError) {
          errorCount++;
          errors.push({
            row: rowIndex,
            error: rowError.message,
          });
        }
      }

      // Process remaining batch
      if (batch.length > 0) {
        await processBatch();
      }

      const finalErrors = errors.slice(-500);

      onProgress?.({
        type: 'complete',
        total: rowIndex,
        processed: processedCount,
        successful: successCount,
        failed: errorCount,
        skipped: skippedCount,
        errors: finalErrors,
      });

      return {
        total: rowIndex,
        processed: processedCount,
        successful: successCount,
        failed: errorCount,
        skipped: skippedCount,
        errors: finalErrors,
      };
    } catch (error) {
      onProgress?.({
        type: 'error',
        error: error.message,
      });
      throw error;
    }
  }
}

