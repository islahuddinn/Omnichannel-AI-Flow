// src/services/call-logs/callLogService.js
// Call center backend: CDR/call log persistence, conversation linking, and call history queries per tenant.

import { getTenantDB, getMasterDB } from '../../config/database.js';
import CallLogSchema from '../../models/schemas/CallLog.js';
import ConversationSchema from '../../models/schemas/Conversation.js';
import ContactSchema from '../../models/schemas/Contact.js';
import UserSchema from '../../models/schemas/User.js';
import CallGroupSchema from '../../models/schemas/CallGroup.js';
import CallGroupUserSchema from '../../models/schemas/CallGroupUser.js';
import StatusHistorySchema from '../../models/schemas/StatusHistory.js';
import CompanySchema from '../../models/schemas/Company.js';
import { uploadToS3 } from '../../lib/storage/s3.js';
import { formatDurationHuman,formatDuration, parseCallLength, calculateAnswerTime } from '../../utils/callCenter/callUtils.js';
import { createWriteStream, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';
import axios from 'axios';

const DOWNLOADS_DIR = join(process.cwd(), 'downloads');
if (!existsSync(DOWNLOADS_DIR)) {
  mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

const pbxApiUrl = process.env.PBX_API_URL;
const pbxUsername = process.env.PBX_API_USERNAME;
const pbxPassword = process.env.PBX_API_PASSWORD;
const callLogApiUrl = process.env.API_URL_CALLLOG;
const axiosInstance = axios.create({
  baseURL: pbxApiUrl,
  headers: {
    'Authorization': 'Basic ' + Buffer.from(`${pbxUsername}:${pbxPassword}`).toString('base64'),
    'Content-Type': 'application/json'
  }
});


/**
 * Map CDR direction to our format
 */
const mapDirection = (cdrDirection) => {
  switch (cdrDirection) {
    case 'out': return 'outgoing';
    case 'in': return 'incoming';
    case 'internal': return 'internal';
    default: return 'unknown';
  }
};

/**
 * Map CDR disposition to our status format
 */
const mapDisposition = (disposition) => {
  if (!disposition) return 'unknown';
  const disp = disposition.toLowerCase();
  if (disp.includes('answered')) return 'answered';
  if (disp.includes('no answer') || disp.includes('missed')) return 'no_answer';
  if (disp.includes('busy')) return 'busy';
  if (disp.includes('failed')) return 'failed';
  return 'unknown';
};

/**
 * Call Voice Bot API
 */
const callVoiceBotApi = async (callId, userId, mfile) => {
  try {
    console.log(`🚀 Sending request to Voice Bot API for call ID: ${callId}, userId: ${userId}, mfile: ${mfile}`);

    const response = await axios.post(
      callLogApiUrl,
      {
        callId: callId,
        userId: userId,
        mfile: mfile,
        endpoint: `${process.env.NEXT_PUBLIC_APP_URL}/api/call-logs/create-log`,
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    console.log(`✅ Voice Bot API request accepted for call ${callId}:`, response.status, response.data);
    return true;
  } catch (error) {
    if (error.response) {
      console.error(`❌ Voice Bot API request failed for call ${callId}:`, error.response.status, error.response.data);
    } else {
      console.error(`❌ Voice Bot API request error for call ${callId}:`, error.message);
    }
    return true; // Don't block call log creation
  }
};

/**
 * Save call log in database
 */
const saveCallLogInDB = async (cdrData, recordingLink, recordingTimestamp, tenantDB, type, transcript = null, summary = null) => {
  try {
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const CallLog = tenantDB.models.CallLog || tenantDB.model('CallLog', CallLogSchema);
    const masterDB = await getMasterDB();
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const CallGroup = tenantDB.models.CallGroup || tenantDB.model('CallGroup', CallGroupSchema);

    // Get group_id and operator_id from CDR data
    const groupId = cdrData.group_id;
    const operatorId = cdrData.operator_id;

    // Validate operator exists (only if operatorId is provided)
    let operatorName = null;
    if (operatorId) {
      const operatorExists = await User.findById(operatorId).lean();
      if (operatorExists) {
        operatorName = `${operatorExists.firstName || ''} ${operatorExists.lastName || ''}`.trim() || operatorExists.email;
      } else {
        console.warn(`Operator with ID ${operatorId} not found`);
      }
    }

    // Validate group if it exists
    if (groupId) {
      const groupExists = await CallGroup.findById(groupId).lean();
      if (!groupExists) {
        console.warn(`Call Group with ID ${groupId} not found`);
      }
    }

    // Find conversation based on direction - ONLY for human calls
    let conversation = null;

    if (type === 'human') {
      const isIncoming = cdrData.direction === 'in';

      const primaryNum = isIncoming
        ? cdrData.sourcenum?.replace(/^00/, '')
        : cdrData.destinationnum?.replace(/^00/, '');
      const secondaryNum = isIncoming
        ? cdrData.destinationnum?.replace(/^00/, '')
        : cdrData.sourcenum?.replace(/^00/, '');

      // Normalize phone numbers
      const normalizedPrimary = primaryNum?.replace(/^\+/, '').replace(/\s/g, '') || '';
      const normalizedSecondary = secondaryNum?.replace(/^\+/, '').replace(/\s/g, '') || '';

      // Helper function to build phone search terms
      const buildPhoneSearchTerms = (phone, normalized) => {
        if (!phone) return [];
        return [
          { phone: phone },
          { phone: normalized },
          { phone: `+${normalized}` },
          { normalizedPhone: phone },
          { normalizedPhone: normalized },
          { normalizedPhone: `+${normalized}` },
          { 'identifiers.whatsapp': phone },
          { 'identifiers.whatsapp': normalized },
          { 'identifiers.sms': phone },
          { 'identifiers.sms': normalized }
        ];
      };

      // Build search terms: prioritize primary number, then check secondary as fallback
      const primarySearchTerms = buildPhoneSearchTerms(primaryNum, normalizedPrimary);
      const secondarySearchTerms = buildPhoneSearchTerms(secondaryNum, normalizedSecondary);
      const phoneSearchTerms = [...primarySearchTerms, ...secondarySearchTerms];

      if (phoneSearchTerms.length > 0) {
        // First, try to find contact using primary number (more likely to be correct)
        const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
        let contact = null;

        if (primarySearchTerms.length > 0) {
          contact = await Contact.findOne({
            $or: primarySearchTerms
          }).lean();
        }

        // If not found with primary, try secondary number as fallback
        if (!contact && secondarySearchTerms.length > 0) {
          contact = await Contact.findOne({
            $or: secondarySearchTerms
          }).lean();
        }

        if (contact) {
          console.log(`✅ Found contact ${contact._id} for ${isIncoming ? 'incoming' : 'outgoing'} call ${cdrData.call_id}`);

          // ✅ CRITICAL: Use contact's department to filter conversations for proper department isolation
          const contactDepartment = contact.department || null;

          // First, try to find WhatsApp or SMS conversation (preferred for voice calls)
          const convBaseQuery = {
            contact: contact._id,
            $or: [
              { channel: 'whatsapp' },
              { channel: 'sms' }
            ],
            status: { $ne: 'deleted' },
            ...(contactDepartment ? { department: contactDepartment } : {})
          };
          conversation = await Conversation.findOne(convBaseQuery).sort({ lastMessageAt: -1 }).lean();

          // If no WhatsApp/SMS conversation found, find any active conversation for this contact
          if (!conversation) {
            conversation = await Conversation.findOne({
              contact: contact._id,
              status: { $in: ['active', 'open', 'pending'] },
              ...(contactDepartment ? { department: contactDepartment } : {})
            }).sort({ lastMessageAt: -1 }).lean();
          }

          if (conversation) {
            const disposition = cdrData.disposition?.toLowerCase() || '';

            let messageContent = isIncoming
              ? 'Incoming voice call'
              : 'Outgoing voice call';

            if (disposition.includes('no answer') || disposition.includes('missed')) {
              messageContent = isIncoming
                ? 'Missed incoming call'
                : 'Missed outgoing call';
            } else if (disposition.includes('busy')) {
              messageContent = 'Call not connected (busy)';
            } else if (disposition.includes('failed')) {
              messageContent = 'Call failed';
            }

            // Update conversation's last message info
            await Conversation.findByIdAndUpdate(conversation._id, {
              $set: {
                lastMessageContent: messageContent,
                lastMessageAt: new Date()
              }
            });

            console.log(`✅ Updated conversation (${conversation._id}) with message: ${messageContent}`);
          } else {
            console.log(`ℹ️ No conversation found for contact ${contact._id}, call log will be created without conversation link`);
          }
        } else {
          console.log(`ℹ️ No contact found for ${isIncoming ? 'incoming' : 'outgoing'} call - primary: ${primaryNum || 'N/A'}, secondary: ${secondaryNum || 'N/A'}`);
        }
      }
    }

    // Create call log
    const callDate = cdrData.calldate ? new Date(cdrData.calldate) : new Date();
    const duration = cdrData.duration || 0;
    const endTime = new Date(callDate.getTime() + (duration * 1000));
    const isMissedIncoming =
      mapDisposition(cdrData.disposition) === 'no_answer' &&
      mapDirection(cdrData.direction) === 'incoming';

    const newCallLog = await CallLog.create({
      cdrId: cdrData?.operator_call_id||cdrData?.call_id,
      operatorId: operatorId || null,
      groupId: groupId || null,
      callerNumber: cdrData.sourcenum || '',
      receiverNumber: cdrData.destinationnum || '',
      callLength: formatDuration(duration),
      direction: mapDirection(cdrData.direction),
      status: mapDisposition(cdrData.disposition),
      recordingLink: recordingLink || null,
      type: type,
      transcript: transcript || null,
      summary: summary || null,
      conversationId: conversation ? conversation._id : null,
      cdrData: cdrData,
      isResolved: !isMissedIncoming
    });

    console.log(`✅ Call log created successfully as ${type} ${recordingLink ? 'with' : 'without'} recording`);

    return {
      callLog: newCallLog,
      operator_name: operatorName,
      conversation_id: conversation ? conversation._id : null,
      last_message_content: conversation ? conversation.lastMessageContent : null
    };
  } catch (error) {
    console.error('Error in saveCallLogInDB:', error);
    throw error;
  }
};




const callSentimentAnalysisApi = async (callId, companyId) => {
  try {
    console.log(`🚀 Sending request to Sentiment Analysis API for call ID: ${callId}, companyId: ${companyId}`);

    const response = await axios.post(
      process.env.SENTIMENT_ANALYSIS_API_URL,
      {
        id: callId,
        company_id: companyId
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SENTIMENT_ANALYSIS_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log(`✅ Sentiment Analysis API request accepted for call ${callId}:`, response.status, response.data);
    return response.data;
  } catch (error) {
    console.error(`❌ Sentiment Analysis API request error for call ${callId}:`, error.message);
    return null;
  }
};



/**
 * Create and update call log
 */
export const createAndUpdateCallLog = async ({ type, callId, userId, transcript, summary, cdrData }, companyId) => {
  try {
    const tenantDB = await getTenantDB(companyId);
    const CallLog = tenantDB.models.CallLog || tenantDB.model('CallLog', CallLogSchema);

    if (type === 'human' || type === 'voicebot') {
      // Check if call log already exists
      const existingCallLog = await CallLog.findOne({ cdrId: callId }).lean();

      if (existingCallLog) {
        // Update existing call log with transcript/summary/recording
        const updatedFields = {};
        if (transcript) updatedFields.transcript = transcript;
        if (summary) updatedFields.summary = summary;

        await CallLog.findByIdAndUpdate(existingCallLog._id, { $set: updatedFields });

        const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
        const masterDB = await getMasterDB();
        const User = masterDB.models.User || masterDB.model('User', UserSchema);
        
        // Fetch operator name for updated call logs
        let operatorName = null;
        if (existingCallLog.operatorId) {
          const operator = await User.findById(existingCallLog.operatorId)
            .select('firstName lastName email')
            .lean();
          if (operator) {
            operatorName = `${operator.firstName || ''} ${operator.lastName || ''}`.trim() || operator.email;
          }
        }

        // Get conversation and update last message content if needed
        const conversation = await Conversation.findById(existingCallLog.conversationId)
          .select('_id lastMessageContent')
          .lean();

        // Update conversation's last message content to reflect call log update
        let lastMessageContent = conversation?.lastMessageContent || null;
        if (conversation) {
          // Determine message content based on call status and direction
          const disposition = existingCallLog.status?.toLowerCase() || '';
          const isIncoming = existingCallLog.direction === 'incoming';
          
          let messageContent = isIncoming
            ? 'Incoming voice call'
            : 'Outgoing voice call';

          if (disposition.includes('no answer') || disposition.includes('missed')) {
            messageContent = isIncoming
              ? 'Missed incoming call'
              : 'Missed outgoing call';
          } else if (disposition.includes('busy')) {
            messageContent = 'Call not connected (busy)';
          } else if (disposition.includes('failed')) {
            messageContent = 'Call failed';
          }

          // Update conversation's last message info
          await Conversation.findByIdAndUpdate(conversation._id, {
            $set: {
              lastMessageContent: messageContent,
              lastMessageAt: new Date()
            }
          });

          lastMessageContent = messageContent;
          console.log(`✅ Updated conversation (${conversation._id}) with message: ${messageContent}`);
        }

        console.log('✅ Call log updated with transcript and summary');


        const sentimentResponse = await callSentimentAnalysisApi(
          existingCallLog?._id?.toString(),
          companyId
        );
        
        if (sentimentResponse) {
          console.log('⏳ Sentiment analysis started:', sentimentResponse.message);
        }
        
    

        return {
          callLog: { ...existingCallLog, ...updatedFields },
          operator_name: operatorName,
          conversation_id: existingCallLog.conversationId,
          last_message_content: lastMessageContent
        };
      }

      // Process new call log
      let recordingUrl = null;
      let recordingTimestamp = null;
      const disposition = cdrData?.disposition?.toLowerCase() || '';

      // Process recording if mfile exists in CDR data
      if (cdrData?.mfile) {
        try {
          const httpUrl = cdrData.mfile.replace('/var/spool/asterisk/', 'https://hm-dev.voipsun.cz/');
          console.log('Recording HTTP URL:', httpUrl);

          // Download recording
          const recordingResponse = await axiosInstance.get(httpUrl, {
            responseType: 'stream',
            timeout: 30000
          });

          if (recordingResponse.data) {
            // Save locally temporarily
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `recording-${callId}-${timestamp}.mp3`;
            const localFilePath = join(DOWNLOADS_DIR, filename);

            const writer = createWriteStream(localFilePath);
            recordingResponse.data.pipe(writer);

            await new Promise((resolve, reject) => {
              writer.on('finish', resolve);
              writer.on('error', reject);
            });

            console.log(`✅ Recording downloaded: ${filename}`);

            // Read file as buffer for S3 upload
            const fsPromises = await import('fs/promises');
            const fileBuffer = await fsPromises.readFile(localFilePath);

            // Upload to S3
            console.log('📤 Uploading recording to S3...');
            const key = `call-recordings/${companyId}/${filename}`;
            const { url } = await uploadToS3(fileBuffer, key, 'audio/mpeg');
            console.log('✅ S3 upload complete:', url);

            recordingUrl = url;
            recordingTimestamp = new Date().toISOString();

            // Clean up local file
            try {
              if (existsSync(localFilePath)) {
                unlinkSync(localFilePath);
                console.log('🗑️ Local file deleted');
              }
            } catch (deleteError) {
              console.warn('⚠️ Could not delete local file:', deleteError.message);
            }
          }
        } catch (recordingError) {
          console.error('Recording processing error:', recordingError);
          // Continue without recording
        }
      }

      // Save call log with processed recording URL
      const callLogResult = await saveCallLogInDB(
        cdrData,
        recordingUrl,
        recordingTimestamp,
        tenantDB,
        type
      );

      // Call Voice Bot API if call was answered
      if (!disposition.includes('no answer') &&
        !disposition.includes('missed') &&
        !disposition.includes('failed') &&
        !disposition.includes('busy')) {
        try {
          await callVoiceBotApi(callLogResult.callLog.cdrId, userId, cdrData?.mfile);
          console.log('✅ Voice Bot API called successfully');
        } catch (voiceBotError) {
          console.error('❌ Error calling Voice Bot API:', voiceBotError);
          // Don't throw error as call log is already created
        }
      } else {
        console.log('⏭️ Skipping Voice Bot API because call was missed/failed/busy');
      }

      return callLogResult;
    }

    throw new Error('Invalid type specified');
  } catch (error) {
    console.error('Error in createAndUpdateCallLog service:', error);
    throw error;
  }
};

/**
 * Get all call logs with filtering, pagination, and search
 */
export const getAllCallLogs = async (companyId, queryParams) => {
  try {
    const tenantDB = await getTenantDB(companyId);
    const masterDB = await getMasterDB();
    const CallLog = tenantDB.models.CallLog || tenantDB.model('CallLog', CallLogSchema);
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const CallGroup = tenantDB.models.CallGroup || tenantDB.model('CallGroup', CallGroupSchema);

    // Pagination parameters
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query
    const query = {};

    // Handle multiple operator_ids as comma-separated values
    if (queryParams.operator_id) {
      const operatorIds = queryParams.operator_id.split(',').filter(id => id.trim()).map(id => id.trim());
      if (operatorIds.length > 0) {
        query.operatorId = { $in: operatorIds };
      }
    }

    // Filter by direction
    if (queryParams.filter && queryParams.filter !== 'allcalls') {
      query.direction = queryParams.filter;
    }

    // Handle multiple caller_numbers
    if (queryParams.caller_number) {
      const callerNumbers = queryParams.caller_number.split(',').filter(num => num.trim()).map(num => num.trim());
      if (callerNumbers.length > 0) {
        query.callerNumber = { $in: callerNumbers.map(num => new RegExp(num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) };
      }
    }

    // Handle multiple receiver_numbers
    if (queryParams.reciever_number) {
      const receiverNumbers = queryParams.reciever_number.split(',').filter(num => num.trim()).map(num => num.trim());
      if (receiverNumbers.length > 0) {
        query.receiverNumber = { $in: receiverNumbers.map(num => new RegExp(num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) };
      }
    }

    // Handle multiple group_ids
    if (queryParams.group_id) {
      const groupIds = queryParams.group_id.split(',').filter(id => id.trim()).map(id => id.trim());
      if (groupIds.length > 0) {
        query.groupId = { $in: groupIds };
      }
    }

    // Date range filter
    if (queryParams.start_date || queryParams.end_date) {
      query.createdAt = {};
      if (queryParams.start_date) {
        query.createdAt.$gte = new Date(queryParams.start_date);
      }
      if (queryParams.end_date) {
        const endDateObj = new Date(queryParams.end_date);
        endDateObj.setDate(endDateObj.getDate() + 1);
        query.createdAt.$lt = endDateObj;
      }
    }

    // Search query - search across multiple fields
    if (queryParams.query) {
      const searchTerm = queryParams.query;
      const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      // Find operators whose names match the query
      const matchingUsers = await User.find({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex }
        ]
      }).select('_id').lean();

      const operatorIdsFromQuery = matchingUsers.map(user => user._id.toString());

      // Build search conditions
      const searchConditions = [
        { callerNumber: searchRegex },
        { receiverNumber: searchRegex }
      ];

      if (operatorIdsFromQuery.length > 0) {
        searchConditions.push({ operatorId: { $in: operatorIdsFromQuery } });
      }

      // Combine with existing query
      if (Object.keys(query).length > 0) {
        query.$and = [
          { ...query },
          { $or: searchConditions }
        ];
        // Remove the fields that are now in $and
        delete query.callerNumber;
        delete query.receiverNumber;
        delete query.operatorId;
      } else {
        query.$or = searchConditions;
      }
    }

    // Handle operator_name filter
    if (queryParams.operator_name) {
      const operatorNames = queryParams.operator_name.split(',').filter(name => name.trim()).map(name => name.trim());
      if (operatorNames.length > 0) {
        const nameRegex = operatorNames.map(name => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
        const matchingUsers = await User.find({
          $or: [
            { firstName: { $in: nameRegex } },
            { lastName: { $in: nameRegex } },
            { email: { $in: nameRegex } }
          ]
        }).select('_id').lean();

        const operatorIdsFromName = matchingUsers.map(user => user._id.toString());

        if (operatorIdsFromName.length > 0) {
          if (query.$and) {
            query.$and.push({ operatorId: { $in: operatorIdsFromName } });
          } else {
            query.operatorId = { $in: operatorIdsFromName };
          }
        } else {
          // If operator name was provided but no matches found, return empty result
          return {
            callLogs: [],
            stats: {
              totalCalls: 0,
              totalLengthOfCalls: '00:00:00',
              averageLengthOfCalls: '00:00:00',
              maxLengthOfCalls: '00:00:00',
              unansweredCalls: 0,
              missedCalls: 0,
              answeredCalls: 0
            },
            pagination: {
              totalItems: 0,
              totalPages: 0,
              currentPage: page,
              limit: limit
            }
          };
        }
      }
    }

    // Get all filtered call logs first (without pagination) to remove duplicates
    const allCallLogs = await CallLog.find(query)
      .sort({ createdAt: -1, updatedAt: -1 })
      .lean();

    // Remove duplicates based on cdrId, keeping the most recent
    const uniqueCallLogs = [];
    const seenCdrIds = new Set();

    for (const log of allCallLogs) {
      if (log.cdrId && !seenCdrIds.has(log.cdrId)) {
        seenCdrIds.add(log.cdrId);
        uniqueCallLogs.push(log);
      } else if (!log.cdrId) {
        // Include logs without cdrId
        uniqueCallLogs.push(log);
      }
    }

    // Calculate pagination based on unique results
    const totalItems = uniqueCallLogs.length;
    const totalPages = Math.ceil(totalItems / limit);

    // Apply pagination to unique results
    const paginatedCallLogs = uniqueCallLogs.slice(skip, skip + limit);

    // Extract unique operator_ids and group_ids from the paginated results
    const operatorIds = [...new Set(paginatedCallLogs.map(log => log.operatorId).filter(Boolean))];
    const groupIds = [...new Set(paginatedCallLogs.map(log => log.groupId).filter(Boolean))];

    // Convert to ObjectIds for MongoDB query
    const operatorObjectIds = operatorIds.map(id => {
      try {
        return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
      } catch (error) {
        return null;
      }
    }).filter(Boolean);

    const groupObjectIds = groupIds.map(id => {
      try {
        return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
      } catch (error) {
        return null;
      }
    }).filter(Boolean);

    // Fetch related users (operators)
    const users = operatorObjectIds.length > 0
      ? await User.find({ _id: { $in: operatorObjectIds } })
          .select('_id firstName lastName email')
          .lean()
      : [];

    // Fetch related groups
    const groups = groupObjectIds.length > 0
      ? await CallGroup.find({ _id: { $in: groupObjectIds } })
          .select('_id groupName')
          .lean()
      : [];

    // Convert to objects for quick lookup
    const userMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user;
      return acc;
    }, {});

    const groupMap = groups.reduce((acc, group) => {
      acc[group._id.toString()] = group;
      return acc;
    }, {});

    // Merge user and group details into call logs
    const callLogsWithDetails = paginatedCallLogs.map(log => ({
      ...log,
      operator: log.operatorId ? userMap[log.operatorId.toString()] || null : null,
      group: log.groupId ? groupMap[log.groupId.toString()] || null : null
    }));

    // Calculate detailed statistics using unique call logs
    const totalCalls = uniqueCallLogs.length;
    
    // Total talking time (sum of all call lengths)
    const totalLengthOfCalls = uniqueCallLogs.reduce((sum, log) => sum + parseCallLength(log.callLength), 0);
    const averageLengthOfCalls = totalCalls > 0 ? (totalLengthOfCalls / totalCalls) : 0;
    const maxLengthOfCalls = Math.max(...uniqueCallLogs.map(log => parseCallLength(log.callLength)), 0);

    // Separate inbound and outbound calls
    const inboundCalls = uniqueCallLogs.filter(log => log.direction === 'incoming');
    const outboundCalls = uniqueCallLogs.filter(log => log.direction === 'outgoing');

    // Short calls (outbound < 1 minute = 60 seconds)
    const shortOutboundCalls = outboundCalls.filter(log => {
      const duration = parseCallLength(log.callLength);
      return duration > 0 && duration < 60;
    }).length;

    // Answered calls (inbound)
    const answeredInboundCalls = inboundCalls.filter(log =>
      log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')
    );

    // Missed calls (inbound)
    const missedInboundCalls = inboundCalls.filter(log =>
      log.status && (log.status.toLowerCase() === 'no_answer' || log.status.toLowerCase() === 'missed')
    );

    // Resolved and unresolved missed calls (inbound)
    const resolvedMissedCalls = missedInboundCalls.filter(log => log.isResolved === true).length;
    const unresolvedMissedCalls = missedInboundCalls.filter(log => !log.isResolved).length;

    // Calculate average answer time (inbound) - from cdrData
    const answerTimes = answeredInboundCalls
      .map(log => calculateAnswerTime(log.cdrData))
      .filter(time => time !== null && time >= 0);
    const avgAnswerTime = answerTimes.length > 0
      ? Math.floor(answerTimes.reduce((sum, time) => sum + time, 0) / answerTimes.length)
      : 0;
    const maxAnswerTime = answerTimes.length > 0 ? Math.max(...answerTimes) : 0;

    // Outbound call attempts
    const outboundCallAttempts = outboundCalls.length;

    // Outbound calls answered
    const outboundCallsAnswered = outboundCalls.filter(log =>
      log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')
    ).length;

    // Average waiting time (inbound) - same as answer time
    const avgWaitingTime = avgAnswerTime;
    const maxWaitingTime = maxAnswerTime;

    // Calculate stats by operator if group_by is 'operator'
    let operatorStats = null;
    if (queryParams.group_by === 'operator') {
      const operatorStatsMap = new Map();
      
      uniqueCallLogs.forEach(log => {
        if (!log.operatorId) return;
        const opId = log.operatorId.toString();
        if (!operatorStatsMap.has(opId)) {
          operatorStatsMap.set(opId, {
            operatorId: opId,
            totalCalls: 0,
            totalTalkingTime: 0,
            answeredCalls: 0,
            missedCalls: 0,
            outboundAttempts: 0,
            outboundAnswered: 0
          });
        }
        const stats = operatorStatsMap.get(opId);
        stats.totalCalls++;
        stats.totalTalkingTime += parseCallLength(log.callLength);
        
        if (log.direction === 'incoming') {
          if (log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')) {
            stats.answeredCalls++;
          } else if (log.status && (log.status.toLowerCase() === 'no_answer' || log.status.toLowerCase() === 'missed')) {
            stats.missedCalls++;
          }
        } else if (log.direction === 'outgoing') {
          stats.outboundAttempts++;
          if (log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')) {
            stats.outboundAnswered++;
          }
        }
      });

      // Fetch operator details
      const operatorIdsForStats = Array.from(operatorStatsMap.keys()).map(id => {
        try {
          return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
        } catch (error) {
          return null;
        }
      }).filter(Boolean);

      const operatorsForStats = operatorIdsForStats.length > 0
        ? await User.find({ _id: { $in: operatorIdsForStats } })
            .select('_id firstName lastName email')
            .lean()
        : [];

      const operatorDetailsMap = operatorsForStats.reduce((acc, op) => {
        acc[op._id.toString()] = op;
        return acc;
      }, {});

      operatorStats = Array.from(operatorStatsMap.values()).map(stats => ({
        ...stats,
        operator: operatorDetailsMap[stats.operatorId] || null,
        avgTalkingTime: stats.totalCalls > 0 ? formatDurationHuman(Math.floor(stats.totalTalkingTime / stats.totalCalls)) : '00:00:00',
        totalTalkingTime: formatDurationHuman(stats.totalTalkingTime)
      }));
    }

    // Calculate stats by group if group_by is 'group'
    let groupStats = null;
    if (queryParams.group_by === 'group') {
      const groupStatsMap = new Map();
      
      uniqueCallLogs.forEach(log => {
        if (!log.groupId) return;
        const grpId = log.groupId.toString();
        if (!groupStatsMap.has(grpId)) {
          groupStatsMap.set(grpId, {
            groupId: grpId,
            totalCalls: 0,
            totalTalkingTime: 0,
            answeredCalls: 0,
            missedCalls: 0,
            outboundAttempts: 0,
            outboundAnswered: 0
          });
        }
        const stats = groupStatsMap.get(grpId);
        stats.totalCalls++;
        stats.totalTalkingTime += parseCallLength(log.callLength);
        
        if (log.direction === 'incoming') {
          if (log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')) {
            stats.answeredCalls++;
          } else if (log.status && (log.status.toLowerCase() === 'no_answer' || log.status.toLowerCase() === 'missed')) {
            stats.missedCalls++;
          }
        } else if (log.direction === 'outgoing') {
          stats.outboundAttempts++;
          if (log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')) {
            stats.outboundAnswered++;
          }
        }
      });

      // Fetch group details
      const groupIdsForStats = Array.from(groupStatsMap.keys()).map(id => {
        try {
          return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
        } catch (error) {
          return null;
        }
      }).filter(Boolean);

      const groupsForStats = groupIdsForStats.length > 0
        ? await CallGroup.find({ _id: { $in: groupIdsForStats } })
            .select('_id groupName')
            .lean()
        : [];

      const groupDetailsMap = groupsForStats.reduce((acc, grp) => {
        acc[grp._id.toString()] = grp;
        return acc;
      }, {});

      groupStats = Array.from(groupStatsMap.values()).map(stats => ({
        ...stats,
        group: groupDetailsMap[stats.groupId] || null,
        avgTalkingTime: stats.totalCalls > 0 ? formatDurationHuman(Math.floor(stats.totalTalkingTime / stats.totalCalls)) : '00:00:00',
        totalTalkingTime: formatDurationHuman(stats.totalTalkingTime)
      }));
    }

    return {
      callLogs: callLogsWithDetails,
      stats: {
        // Basic stats
        totalCalls,
        totalLengthOfCalls: formatDurationHuman(totalLengthOfCalls),
        averageLengthOfCalls: formatDurationHuman(Math.floor(averageLengthOfCalls)),
        maxLengthOfCalls: formatDurationHuman(maxLengthOfCalls),
        
        // Outbound stats
        shortOutboundCalls, // Outbound calls < 1 minute
        outboundCallAttempts,
        outboundCallsAnswered,
        
        // Inbound stats
        answeredInboundCalls: answeredInboundCalls.length,
        missedInboundCalls: missedInboundCalls.length,
        resolvedMissedCalls,
        unresolvedMissedCalls,
        avgAnswerTime: formatDurationHuman(avgAnswerTime),
        maxAnswerTime: formatDurationHuman(maxAnswerTime),
        avgWaitingTime: formatDurationHuman(avgWaitingTime),
        maxWaitingTime: formatDurationHuman(maxWaitingTime),
        
        // Legacy stats (for backward compatibility)
        unansweredCalls: uniqueCallLogs.filter(log =>
          log.status && log.status.toLowerCase() !== 'answered' && log.status.toLowerCase() !== 'completed'
        ).length,
        missedCalls: missedInboundCalls.length,
        answeredCalls: uniqueCallLogs.filter(log =>
          log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')
        ).length
      },
      operatorStats,
      groupStats,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        limit
      }
    };
  } catch (error) {
    console.error('Error in getAllCallLogswithSentimentAnalysis service:', error);
    throw error;
  }
};

/**
 * Build access control query for call logs based on user role and permissions
 * This helper function centralizes the access control logic to avoid duplication
 */
export const buildCallLogAccessQuery = async (userId, companyId, baseQuery = {}) => {
  try {
    const masterDB = await getMasterDB();
    const tenantDB = await getTenantDB(companyId);
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const CallGroupUser = tenantDB.models.CallGroupUser || tenantDB.model('CallGroupUser', CallGroupUserSchema);
    
    const user = await User.findById(userId).lean();
    if (!user) {
      // If user not found, default to no access (empty result)
      return { ...baseQuery, operatorId: mongoose.Types.ObjectId('000000000000000000000000') };
    }
    
    const isAdmin = ['company_admin', 'super_admin'].includes(user.role);
    
    // Admins can see all calls - no operator restriction
    if (isAdmin) {
      return baseQuery;
    }
    
    // For agents, apply call access restrictions
    if (user.role === 'agent') {
      const callAccess = user.callCenter?.call_access || 'only-calls-by-him';
      
      if (callAccess === 'only-calls-by-him') {
        baseQuery.operatorId = userId;
      } else if (callAccess === 'calls-by-him-and-group') {
        const userGroups = await CallGroupUser.find({ userId: userId }).lean();
        const groupIds = userGroups.map(group => group.groupId);
        
        if (groupIds.length > 0) {
          const groupMembers = await CallGroupUser.find({ groupId: { $in: groupIds } }).lean();
          const groupMemberIds = [...new Set(groupMembers.map(member => member.userId))];
          baseQuery.operatorId = { $in: groupMemberIds };
        } else {
          baseQuery.operatorId = userId;
        }
      } else if (callAccess === 'all-calls') {
        // No operatorId filter - agent can see all calls
      } else {
        baseQuery.operatorId = userId; // Default
      }
    } else {
      // For other roles, default to only their own calls
      baseQuery.operatorId = userId;
    }
    
    return baseQuery;
  } catch (error) {
    console.error('Error in buildCallLogAccessQuery:', error);
    // On error, default to no access
    return { ...baseQuery, operatorId: mongoose.Types.ObjectId('000000000000000000000000') };
  }
};

/**
 * Get agent call logs with access control
 */
export const getAgentCallLogs = async (userId, companyId, queryParams) => {
  try {
    const masterDB = await getMasterDB();
    const tenantDB = await getTenantDB(companyId);
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const CallLog = tenantDB.models.CallLog || tenantDB.model('CallLog', CallLogSchema);
    const CallGroup = tenantDB.models.CallGroup || tenantDB.model('CallGroup', CallGroupSchema);
    const CallGroupUser = tenantDB.models.CallGroupUser || tenantDB.model('CallGroupUser', CallGroupUserSchema);

    // Get agent details to check their permissions
    const agent = await User.findById(userId).lean();

    if (!agent || agent.role !== 'agent') {
      throw new Error('Agent not found or user is not an agent');
    }

    if (!agent.companyId) {
      throw new Error('Agent is not associated with any company');
    }

    // Pagination parameters
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 10;
    const skip = (page - 1) * limit;

    // Build base query and apply access control using the helper function
    const query = await buildCallLogAccessQuery(userId, companyId, {});

    // Apply additional filters (same as getAllCallLogs)
    if (queryParams.filter && queryParams.filter !== 'allcalls') {
      query.direction = queryParams.filter;
    }

    if (queryParams.caller_number) {
      const callerNumbers = queryParams.caller_number.split(',').filter(num => num.trim()).map(num => num.trim());
      if (callerNumbers.length > 0) {
        query.callerNumber = { $in: callerNumbers.map(num => new RegExp(num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) };
      }
    }

    if (queryParams.reciever_number) {
      const receiverNumbers = queryParams.reciever_number.split(',').filter(num => num.trim()).map(num => num.trim());
      if (receiverNumbers.length > 0) {
        query.receiverNumber = { $in: receiverNumbers.map(num => new RegExp(num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) };
      }
    }

    if (queryParams.group_id) {
      const groupIds = queryParams.group_id.split(',').filter(id => id.trim()).map(id => id.trim());
      if (groupIds.length > 0) {
        query.groupId = { $in: groupIds };
      }
    }

    // Date range filter
    if (queryParams.start_date || queryParams.end_date) {
      query.createdAt = {};
      if (queryParams.start_date) {
        query.createdAt.$gte = new Date(queryParams.start_date);
      }
      if (queryParams.end_date) {
        const endDateObj = new Date(queryParams.end_date);
        endDateObj.setDate(endDateObj.getDate() + 1);
        query.createdAt.$lt = endDateObj;
      }
    }

    // Search query
    if (queryParams.query) {
      const searchTerm = queryParams.query;
      const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      const matchingUsers = await User.find({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex }
        ]
      }).select('_id').lean();

      const operatorIdsFromQuery = matchingUsers.map(user => user._id.toString());

      const searchConditions = [
        { callerNumber: searchRegex },
        { receiverNumber: searchRegex }
      ];

      if (operatorIdsFromQuery.length > 0) {
        searchConditions.push({ operatorId: { $in: operatorIdsFromQuery } });
      }

      if (Object.keys(query).length > 0) {
        query.$and = [
          { ...query },
          { $or: searchConditions }
        ];
        delete query.callerNumber;
        delete query.receiverNumber;
        delete query.operatorId;
      } else {
        query.$or = searchConditions;
      }
    }

    // Get all filtered call logs and remove duplicates
    const allCallLogs = await CallLog.find(query)
      .sort({ createdAt: -1, updatedAt: -1 })
      .lean();

    const uniqueCallLogs = [];
    const seenCdrIds = new Set();

    for (const log of allCallLogs) {
      if (log.cdrId && !seenCdrIds.has(log.cdrId)) {
        seenCdrIds.add(log.cdrId);
        uniqueCallLogs.push(log);
      } else if (!log.cdrId) {
        uniqueCallLogs.push(log);
      }
    }

    // Calculate pagination
    const totalItems = uniqueCallLogs.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedCallLogs = uniqueCallLogs.slice(skip, skip + limit);

    // Fetch related data
    const operatorIds = [...new Set(paginatedCallLogs.map(log => log.operatorId).filter(Boolean))];
    const groupIds = [...new Set(paginatedCallLogs.map(log => log.groupId).filter(Boolean))];

    // Convert to ObjectIds for MongoDB query
    const operatorObjectIds = operatorIds.map(id => {
      try {
        return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
      } catch (error) {
        return null;
      }
    }).filter(Boolean);

    const groupObjectIds = groupIds.map(id => {
      try {
        return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
      } catch (error) {
        return null;
      }
    }).filter(Boolean);

    const users = operatorObjectIds.length > 0
      ? await User.find({ _id: { $in: operatorObjectIds } })
          .select('_id firstName lastName email')
          .lean()
      : [];

    const groups = groupObjectIds.length > 0
      ? await CallGroup.find({ _id: { $in: groupObjectIds } })
          .select('_id groupName')
          .lean()
      : [];

    const userMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user;
      return acc;
    }, {});

    const groupMap = groups.reduce((acc, group) => {
      acc[group._id.toString()] = group;
      return acc;
    }, {});

    // Merge details and check recording download permission
    const canDownloadRecordings = agent.callCenter?.recording_downloads === 'yes' || agent.callCenter?.recording_downloads === 'Yes';
    const callAccess = agent.callCenter?.call_access || 'only-calls-by-him';

    const callLogsWithDetails = paginatedCallLogs.map(log => {
      const logData = {
        ...log,
        operator: log.operatorId ? userMap[log.operatorId.toString()] || null : null,
        group: log.groupId ? groupMap[log.groupId.toString()] || null : null
      };

      // Remove recording_link if agent doesn't have permission
      if (!canDownloadRecordings) {
        delete logData.recordingLink;
      }

      return logData;
    });

    // Calculate statistics
    const totalCalls = uniqueCallLogs.length;
    const totalLengthOfCalls = uniqueCallLogs.reduce((sum, log) => sum + parseCallLength(log.callLength), 0);
    const averageLengthOfCalls = totalCalls > 0 ? (totalLengthOfCalls / totalCalls) : 0;
    const maxLengthOfCalls = Math.max(...uniqueCallLogs.map(log => parseCallLength(log.callLength)), 0);

    const missedCalls = uniqueCallLogs.filter(log =>
      log.status && (log.status.toLowerCase() === 'no_answer' || log.status.toLowerCase() === 'missed')
    ).length;
    const answeredCalls = uniqueCallLogs.filter(log =>
      log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')
    ).length;
    const unansweredCalls = uniqueCallLogs.filter(log =>
      log.status && log.status.toLowerCase() !== 'answered' && log.status.toLowerCase() !== 'completed'
    ).length;

    return {
      callLogs: callLogsWithDetails,
      stats: {
        totalCalls,
        totalLengthOfCalls: formatDurationHuman(totalLengthOfCalls),
        averageLengthOfCalls: formatDurationHuman(Math.floor(averageLengthOfCalls)),
        maxLengthOfCalls: formatDurationHuman(maxLengthOfCalls),
        unansweredCalls,
        missedCalls,
        answeredCalls
      },
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        limit
      },
      accessLevel: callAccess,
      canDownloadRecordings
    };
  } catch (error) {
    console.error('Error in getAgentCallLogs service:', error);
    throw error;
  }
};

/**
 * Mark call log as resolved and mark related missed incoming calls as resolved
 */
export const markCallLogAsResolved = async (callLogId, companyId) => {
  try {
    const tenantDB = await getTenantDB(companyId);
    const CallLog =
      tenantDB.models.CallLog || tenantDB.model('CallLog', CallLogSchema);

    const callLog = await CallLog.findById(callLogId);

    if (!callLog) {
      throw new Error('Call Log not found');
    }

    const isIncomingMissed =
      callLog.direction === 'incoming' &&
      (callLog.status === 'no_answer' || callLog.status === 'missed');

    if (!isIncomingMissed) {
      throw new Error('Only incoming missed calls can be marked as resolved');
    }

    // Mark current log as resolved
    callLog.isResolved = true;
    await callLog.save();

    // 🔑 Calculate 24-hour window (backward from current call time)
    const fromTime = new Date(
      new Date(callLog.createdAt).getTime() - 24 * 60 * 60 * 1000
    );

    // Find related missed incoming calls within last 24 hours
    const relatedCallLogs = await CallLog.find({
      _id: { $ne: callLogId },
      direction: 'incoming',
      status: { $in: ['no_answer', 'missed'] },
      callerNumber: callLog.callerNumber,
      // receiverNumber: callLog.receiverNumber,
      isResolved: false,
      createdAt: {
        $gte: fromTime,
        $lte: callLog.createdAt
      }
    });

    if (relatedCallLogs.length > 0) {
      await CallLog.updateMany(
        { _id: { $in: relatedCallLogs.map(log => log._id) } },
        { $set: { isResolved: true } }
      );
    }

    return {
      success: true,
      message: 'Call log marked as resolved',
      resolvedCount: 1 + relatedCallLogs.length
    };
  } catch (error) {
    console.error('Error in markCallLogAsResolved service:', error);
    throw error;
  }
};


/**
 * Get a single call log by ID with complete details
 */
export const getCallLogById = async (callLogId, companyId) => {
  try {
    const tenantDB = await getTenantDB(companyId);
    const masterDB = await getMasterDB();
    const CallLog = tenantDB.models.CallLog || tenantDB.model('CallLog', CallLogSchema);
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const CallGroup = tenantDB.models.CallGroup || tenantDB.model('CallGroup', CallGroupSchema);
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);

    const callLog = await CallLog.findById(callLogId).lean();

    if (!callLog) {
      return null;
    }

    // Fetch operator details if operatorId exists
    let operator = null;
    if (callLog.operatorId) {
      try {
        operator = await User.findById(callLog.operatorId)
          .select('_id firstName lastName email companyId')
          .lean();
      } catch (error) {
        console.warn('Error fetching operator:', error);
      }
    }

    // Fetch group details if groupId exists
    let group = null;
    if (callLog.groupId) {
      try {
        group = await CallGroup.findById(callLog.groupId)
          .select('_id groupName')
          .lean();
      } catch (error) {
        console.warn('Error fetching group:', error);
      }
    }

    // Fetch company name - ALWAYS from Company model, not from group
    // Company and Group are separate entities - company name should come from Company schema
    let companyName = null;
    if (companyId) {
      try {
        // Try to find company by ID or tenantDatabaseName
        let company = null;
        
        // First try by _id (if companyId is a valid ObjectId)
        if (mongoose.Types.ObjectId.isValid(companyId)) {
          company = await Company.findById(companyId)
            .select('name')
            .lean();
        }
        
        // If not found by ID, try by tenantDatabaseName (e.g., "tenant_<id>")
        if (!company) {
          company = await Company.findOne({ tenantDatabaseName: companyId })
            .select('name')
            .lean();
        }
        
        // If still not found and companyId looks like tenant_<id>, extract the ID part
        if (!company && companyId.startsWith('tenant_')) {
          const extractedId = companyId.replace('tenant_', '');
          if (mongoose.Types.ObjectId.isValid(extractedId)) {
            company = await Company.findById(extractedId)
              .select('name')
              .lean();
          }
        }
        
        // Also try to get companyId from operator as fallback (if companyId parameter didn't work)
        if (!company && operator?.companyId) {
          const operatorCompanyId = operator.companyId;
          if (mongoose.Types.ObjectId.isValid(operatorCompanyId)) {
            company = await Company.findById(operatorCompanyId)
              .select('name')
              .lean();
          }
        }
        
        if (company?.name) {
          companyName = company.name;
        }
      } catch (error) {
        console.warn('Error fetching company name:', error);
      }
    }

    // Calculate answerTime (waitingTime is the same as answerTime)
    const answerTime = calculateAnswerTime(callLog.cdrData);

    return {
      ...callLog,
      operator: operator,
      group: group,
      answerTime: answerTime !== null ? answerTime : null,
      answerTimeFormatted: answerTime !== null ? formatDurationHuman(answerTime) : null,
      waitingTime: answerTime !== null ? answerTime : null,
      company: companyName
    };
  } catch (error) {
    console.error('Error in getCallLogById service:', error);
    throw error;
  }
};

/**
 * Get call logs for a conversation with access control
 * Returns call logs filtered by conversationId and user permissions
 */
export const getConversationCallLogs = async (conversationId, userId, companyId) => {
  try {
    const tenantDB = await getTenantDB(companyId);
    const masterDB = await getMasterDB();
    const CallLog = tenantDB.models.CallLog || tenantDB.model('CallLog', CallLogSchema);
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const CallGroup = tenantDB.models.CallGroup || tenantDB.model('CallGroup', CallGroupSchema);
    
    // Build query with access control
    const query = { conversationId: conversationId };
    const finalQuery = await buildCallLogAccessQuery(userId, companyId, query);
    
    // Fetch call logs
    const allCallLogs = await CallLog.find(finalQuery)
      .sort({ createdAt: 1 }) // Oldest first
      .lean();
    
    // Remove duplicates based on cdrId, keeping the most recent
    const uniqueCallLogs = [];
    const seenCdrIds = new Set();
    
    for (const log of allCallLogs) {
      if (log.cdrId && !seenCdrIds.has(log.cdrId)) {
        seenCdrIds.add(log.cdrId);
        uniqueCallLogs.push(log);
      } else if (!log.cdrId) {
        uniqueCallLogs.push(log);
      }
    }
    
    // Extract unique operator_ids and group_ids from call logs
    const operatorIds = [...new Set(uniqueCallLogs.map(log => log.operatorId).filter(Boolean))];
    const groupIds = [...new Set(uniqueCallLogs.map(log => log.groupId).filter(Boolean))];
    
    // Convert to ObjectIds for MongoDB query
    const operatorObjectIds = operatorIds.map(id => {
      try {
        return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
      } catch (error) {
        return null;
      }
    }).filter(Boolean);
    
    const groupObjectIds = groupIds.map(id => {
      try {
        return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
      } catch (error) {
        return null;
      }
    }).filter(Boolean);
    
    // Fetch related users (operators) from masterDB
    const users = operatorObjectIds.length > 0
      ? await User.find({ _id: { $in: operatorObjectIds } })
          .select('_id firstName lastName email')
          .lean()
      : [];
    
    // Fetch related groups from tenantDB
    const groups = groupObjectIds.length > 0
      ? await CallGroup.find({ _id: { $in: groupObjectIds } })
          .select('_id groupName')
          .lean()
      : [];
    
    // Convert to objects for quick lookup
    const userMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user;
      return acc;
    }, {});
    
    const groupMap = groups.reduce((acc, group) => {
      acc[group._id.toString()] = group;
      return acc;
    }, {});
    
    // Transform call logs to include additional fields
    return uniqueCallLogs.map(log => {
      const answerTime = calculateAnswerTime(log.cdrData);
      return {
        ...log,
        operator: log.operatorId ? userMap[log.operatorId.toString()] || null : null,
        group: log.groupId ? groupMap[log.groupId.toString()] || null : null,
        answerTime: answerTime !== null ? answerTime : null,
        answerTimeFormatted: answerTime !== null ? formatDurationHuman(answerTime) : null
      };
    });
  } catch (error) {
    console.error('Error in getConversationCallLogs service:', error);
    throw error;
  }
};

/**
 * Delete a call log by ID
 */
export const deleteCallLog = async (callLogId, companyId) => {
  try {
    const tenantDB = await getTenantDB(companyId);
    const CallLog = tenantDB.models.CallLog || tenantDB.model('CallLog', CallLogSchema);

    const callLog = await CallLog.findById(callLogId).lean();

    if (!callLog) {
      throw new Error('Call Log not found');
    }

    await CallLog.findByIdAndDelete(callLogId);

    return { success: true, message: 'Call Log deleted successfully' };
  } catch (error) {
    console.error('Error in deleteCallLog service:', error);
    throw error;
  }
};




/**
 * Helper function to calculate agent status times from StatusHistory
 */
const calculateAgentStatusTimes = async (userId, companyId, startDate, endDate) => {
  try {
    const tenantDB = await getTenantDB(companyId);
    const masterDB = await getMasterDB();
    const StatusHistory = tenantDB.models.StatusHistory || tenantDB.model('StatusHistory', StatusHistorySchema);
    const User = masterDB.models.User || masterDB.model('User', UserSchema);

    // Get agent creation date - we should only count time from when agent actually existed
    const agent = await User.findById(userId).select('createdAt').lean();
    const agentCreatedAt = agent?.createdAt ? new Date(agent.createdAt) : null;

    // Normalize dates
    let start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Use the later of startDate or agent creation date as the actual start
    // This ensures we don't count time before the agent existed
    if (agentCreatedAt && agentCreatedAt > start) {
      start = new Date(agentCreatedAt);
      start.setHours(0, 0, 0, 0);
    }

    // If start is after end, return zeros
    if (start > end) {
      return {
        online: 0,
        idle: 0,
        onCall: 0,
        total: 0
      };
    }

    // Fetch status history for the user with statusType 'call'
    const statusHistory = await StatusHistory.find({
      userId: userId,
      statusType: 'call',
      timestamp: { $gte: start, $lte: end }
    })
      .sort({ timestamp: 1 })
      .lean();

    if (statusHistory.length === 0) {
      return {
        online: 0,
        idle: 0,
        onCall: 0,
        total: 0
      };
    }

    // Determine actual start - use first status entry timestamp if it's after our start
    // Don't add artificial entries before the first real status change
    const firstEntryTimestamp = new Date(statusHistory[0].timestamp);
    const lastEntryTimestamp = new Date(statusHistory[statusHistory.length - 1].timestamp);
    const actualStart = firstEntryTimestamp > start ? firstEntryTimestamp : start;

    // Add artificial end marker (don't add artificial start)
    const now = new Date();
    const actualEnd = new Date(Math.min(now.getTime(), end.getTime()));
    
    // Add end marker only if last entry is before the end
    if (lastEntryTimestamp < actualEnd) {
      statusHistory.push({
        userId: userId,
        newStatus: statusHistory[statusHistory.length - 1].newStatus, // Continue last status
        timestamp: actualEnd,
      });
    }

    // Calculate durations
    let onlineTime = 0;
    let idleTime = 0;
    let onCallTime = 0;

    for (let i = 0; i < statusHistory.length - 1; i++) {
      const curr = statusHistory[i];
      const next = statusHistory[i + 1];
      const status = curr.newStatus;

      // Use actual timestamps from status history
      const currTime = new Date(curr.timestamp);
      const nextTime = new Date(next.timestamp);
      
      // Ensure we're within our date range (clamp timestamps to actual range)
      let effectiveCurrTime = currTime < actualStart ? actualStart : currTime;
      let effectiveNextTime = nextTime > actualEnd ? actualEnd : nextTime;

      // If current is after next (shouldn't happen but validate), skip
      if (effectiveCurrTime >= effectiveNextTime) continue;

      const durationSec = Math.floor(
        (effectiveNextTime - effectiveCurrTime) / 1000
      );

      // Only count positive durations (ignore negative or zero durations)
      if (durationSec <= 0) continue;

      // Map statuses - each status should contribute to only one primary category
      // occupied = on call (and also online)
      if (status === 'occupied') {
        onCallTime += durationSec;
        onlineTime += durationSec; // occupied is also online
      }
      // offline || notavailable = idle (NOT online)
      else if (status === 'offline' || status === 'notavailable') {
        idleTime += durationSec;
      }
      // available || outbound = online (but not on call, not idle)
      else if (status === 'available' || status === 'outbound') {
        onlineTime += durationSec;
      }
      // Unknown statuses are not counted (they don't contribute to any time category)
    }

    // Total should be onlineTime + idleTime (onCallTime is already included in onlineTime)
    // Total time period = actualEnd - actualStart
    const totalTimePeriod = Math.floor((actualEnd - actualStart) / 1000);
    const calculatedTotal = onlineTime + idleTime;

    // If calculated total significantly exceeds time period, log warning
    if (calculatedTotal > totalTimePeriod * 1.1) { // Allow 10% tolerance for rounding
      console.warn(`Agent ${userId}: Calculated time (${calculatedTotal}s) exceeds time period (${totalTimePeriod}s)`);
    }

    return {
      online: onlineTime,
      idle: idleTime,
      onCall: onCallTime,
      total: calculatedTotal // Total = onlineTime + idleTime (onCallTime is included in onlineTime)
    };
  } catch (error) {
    console.error('Error calculating agent status times:', error);
    return {
      online: 0,
      idle: 0,
      onCall: 0,
      total: 0
    };
  }
};




export const getAllCallLogswithSentimentAnalysis = async (companyId, queryParams) => {
  try {
    const tenantDB = await getTenantDB(companyId);
    const masterDB = await getMasterDB();
    const CallLog = tenantDB.models.CallLog || tenantDB.model('CallLog', CallLogSchema);
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const CallGroup = tenantDB.models.CallGroup || tenantDB.model('CallGroup', CallGroupSchema);
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);

    // Determine date range for stats and agent status calculation
    let startDate = null;
    let endDate = new Date();

    // Handle time period filter (1, 3, 7, 30 days)
    if (queryParams.time_period) {
      const days = parseInt(queryParams.time_period);
      if (days && days > 0) {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);
      }
    }

    // Handle date range filter
    if (queryParams.start_date) {
      startDate = new Date(queryParams.start_date);
      startDate.setHours(0, 0, 0, 0);
    }
    if (queryParams.end_date) {
      endDate = new Date(queryParams.end_date);
      endDate.setHours(23, 59, 59, 999);
    }

    // If no start date is set, default to 30 days ago
    if (!startDate) {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    }

    // Check if operator_id is provided
    const hasOperatorId = queryParams.operator_id && queryParams.operator_id.trim() !== '';

    // If no operator_id, return stats + agents with status times (no call logs)
    if (!hasOperatorId) {
      // Build query for stats calculation (without operator filter)
      const query = {};

      if (startDate) {
        query.createdAt = { $gte: startDate };
      }
      if (endDate) {
        query.createdAt = query.createdAt || {};
        query.createdAt.$lte = endDate;
      }

      // Handle country filter (CZ or SK)
      if (queryParams.country) {
        const country = queryParams.country.toUpperCase();
        if (country === 'CZ' || country === 'SK') {
          const countryCode = country === 'CZ' ? '420' : '421';
          const countryConditions = [
            { callerNumber: { $regex: `^\\+?00?${countryCode}` } },
            { receiverNumber: { $regex: `^\\+?00?${countryCode}` } }
          ];
          if (query.$or) {
            query.$and = query.$and || [];
            query.$and.push({ $or: countryConditions });
          } else {
            query.$or = countryConditions;
          }
        }
      }

      // Filter by direction
      if (queryParams.filter && queryParams.filter !== 'allcalls') {
        query.direction = queryParams.filter;
      }

      // Get all filtered call logs for stats
      const allCallLogs = await CallLog.find(query)
        .sort({ createdAt: -1, updatedAt: -1 })
        .lean();

      // Remove duplicates
      const uniqueCallLogs = [];
      const seenCdrIds = new Set();
      for (const log of allCallLogs) {
        if (log.cdrId && !seenCdrIds.has(log.cdrId)) {
          seenCdrIds.add(log.cdrId);
          uniqueCallLogs.push(log);
        } else if (!log.cdrId) {
          uniqueCallLogs.push(log);
        }
      }

      // Calculate statistics
      const totalCalls = uniqueCallLogs.length;
      const totalLengthOfCalls = uniqueCallLogs.reduce((sum, log) => sum + parseCallLength(log.callLength), 0);
      const averageLengthOfCalls = totalCalls > 0 ? (totalLengthOfCalls / totalCalls) : 0;
      const maxLengthOfCalls = Math.max(...uniqueCallLogs.map(log => parseCallLength(log.callLength)), 0);

      const inboundCalls = uniqueCallLogs.filter(log => log.direction === 'incoming');
      const outboundCalls = uniqueCallLogs.filter(log => log.direction === 'outgoing');

      const shortOutboundCalls = outboundCalls.filter(log => {
        const duration = parseCallLength(log.callLength);
        return duration > 0 && duration < 60;
      }).length;

      const answeredInboundCalls = inboundCalls.filter(log =>
        log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')
      );

      const missedInboundCalls = inboundCalls.filter(log =>
        log.status && (log.status.toLowerCase() === 'no_answer' || log.status.toLowerCase() === 'missed')
      );

      const resolvedMissedCalls = missedInboundCalls.filter(log => log.isResolved === true).length;
      const unresolvedMissedCalls = missedInboundCalls.filter(log => !log.isResolved).length;

      const answerTimes = answeredInboundCalls
        .map(log => calculateAnswerTime(log.cdrData))
        .filter(time => time !== null && time >= 0);
      const avgAnswerTime = answerTimes.length > 0
        ? Math.floor(answerTimes.reduce((sum, time) => sum + time, 0) / answerTimes.length)
        : 0;
      const maxAnswerTime = answerTimes.length > 0 ? Math.max(...answerTimes) : 0;

      const outboundCallAttempts = outboundCalls.length;
      const outboundCallsAnswered = outboundCalls.filter(log =>
        log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')
      ).length;

      const avgWaitingTime = avgAnswerTime;
      const maxWaitingTime = maxAnswerTime;

      // Get all agents for the company
      const agents = await User.find({
        companyId: companyId,
        role: 'agent'
      })
        .select('_id firstName lastName email')
        .lean();

      // Calculate status times for each agent
      const agentsWithStatusTimes = await Promise.all(
        agents.map(async (agent) => {
          const statusTimes = await calculateAgentStatusTimes(
            agent._id,
            companyId,
            startDate,
            endDate
          );

          return {
            ...agent,
            statusTimes: {
              online: formatDurationHuman(statusTimes.online),
              idle: formatDurationHuman(statusTimes.idle),
              onCall: formatDurationHuman(statusTimes.onCall),
              onlineSeconds: statusTimes.online,
              idleSeconds: statusTimes.idle,
              onCallSeconds: statusTimes.onCall
            }
          };
        })
      );

      return {
        callLogs: [], // No call logs when no operator_id
        agents: agentsWithStatusTimes,
        stats: {
          totalCalls,
          totalLengthOfCalls: formatDurationHuman(totalLengthOfCalls),
          averageLengthOfCalls: formatDurationHuman(Math.floor(averageLengthOfCalls)),
          maxLengthOfCalls: formatDurationHuman(maxLengthOfCalls),
          shortOutboundCalls,
          outboundCallAttempts,
          outboundCallsAnswered,
          answeredInboundCalls: answeredInboundCalls.length,
          missedInboundCalls: missedInboundCalls.length,
          resolvedMissedCalls,
          unresolvedMissedCalls,
          avgAnswerTime: formatDurationHuman(avgAnswerTime),
          maxAnswerTime: formatDurationHuman(maxAnswerTime),
          avgWaitingTime: formatDurationHuman(avgWaitingTime),
          maxWaitingTime: formatDurationHuman(maxWaitingTime),
          unansweredCalls: uniqueCallLogs.filter(log =>
            log.status && log.status.toLowerCase() !== 'answered' && log.status.toLowerCase() !== 'completed'
          ).length,
          missedCalls: missedInboundCalls.length,
          answeredCalls: uniqueCallLogs.filter(log =>
            log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')
          ).length
        },
        operatorStats: null,
        groupStats: null,
        pagination: {
          totalItems: 0,
          totalPages: 0,
          currentPage: 1,
          limit: 10
        }
      };
    }

    // If operator_id is provided, return stats + call logs as before
    // Pagination parameters
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query
    const query = {};

    if (startDate) {
      query.createdAt = { $gte: startDate };
    }
    if (endDate) {
      query.createdAt = query.createdAt || {};
      query.createdAt.$lte = endDate;
    }

    // Handle country filter (CZ or SK)
    if (queryParams.country) {
      const country = queryParams.country.toUpperCase();
      if (country === 'CZ' || country === 'SK') {
        const countryCode = country === 'CZ' ? '420' : '421';
        const countryConditions = [
          { callerNumber: { $regex: `^\\+?00?${countryCode}` } },
          { receiverNumber: { $regex: `^\\+?00?${countryCode}` } }
        ];
        if (query.$or) {
          query.$and = query.$and || [];
          query.$and.push({ $or: countryConditions });
        } else {
          query.$or = countryConditions;
        }
      }
    }

    // Handle multiple operator_ids as comma-separated values
    if (queryParams.operator_id) {
      const operatorIds = queryParams.operator_id.split(',').filter(id => id.trim()).map(id => id.trim());
      if (operatorIds.length > 0) {
        const operatorObjectIds = operatorIds.map(id => {
          try {
            return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
          } catch (error) {
            return null;
          }
        }).filter(Boolean);
        if (operatorObjectIds.length > 0) {
          if (query.$or) {
            query.$and = query.$and || [];
            query.$and.push({ operatorId: { $in: operatorObjectIds } });
          } else {
            query.operatorId = { $in: operatorObjectIds };
          }
        }
      }
    }

    // Filter by direction
    if (queryParams.filter && queryParams.filter !== 'allcalls') {
      query.direction = queryParams.filter;
    }

    // Handle multiple caller_numbers
    if (queryParams.caller_number) {
      const callerNumbers = queryParams.caller_number.split(',').filter(num => num.trim()).map(num => num.trim());
      if (callerNumbers.length > 0) {
        query.callerNumber = { $in: callerNumbers.map(num => new RegExp(num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) };
      }
    }

    // Handle multiple receiver_numbers
    if (queryParams.reciever_number) {
      const receiverNumbers = queryParams.reciever_number.split(',').filter(num => num.trim()).map(num => num.trim());
      if (receiverNumbers.length > 0) {
        query.receiverNumber = { $in: receiverNumbers.map(num => new RegExp(num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) };
      }
    }

    // Handle multiple group_ids
    if (queryParams.group_id) {
      const groupIds = queryParams.group_id.split(',').filter(id => id.trim()).map(id => id.trim());
      if (groupIds.length > 0) {
        query.groupId = { $in: groupIds };
      }
    }

    // Search query - search across multiple fields
    if (queryParams.query) {
      const searchTerm = queryParams.query;
      const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      // Find operators whose names match the query
      const matchingUsers = await User.find({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex }
        ]
      }).select('_id').lean();

      const operatorIdsFromQuery = matchingUsers.map(user => user._id.toString());

      // Build search conditions
      const searchConditions = [
        { callerNumber: searchRegex },
        { receiverNumber: searchRegex }
      ];

      if (operatorIdsFromQuery.length > 0) {
        searchConditions.push({ operatorId: { $in: operatorIdsFromQuery } });
      }

      // Combine with existing query
      if (Object.keys(query).length > 0) {
        query.$and = [
          { ...query },
          { $or: searchConditions }
        ];
        // Remove the fields that are now in $and
        delete query.callerNumber;
        delete query.receiverNumber;
        delete query.operatorId;
      } else {
        query.$or = searchConditions;
      }
    }

    // Handle operator_name filter
    if (queryParams.operator_name) {
      const operatorNames = queryParams.operator_name.split(',').filter(name => name.trim()).map(name => name.trim());
      if (operatorNames.length > 0) {
        const nameRegex = operatorNames.map(name => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
        const matchingUsers = await User.find({
          $or: [
            { firstName: { $in: nameRegex } },
            { lastName: { $in: nameRegex } },
            { email: { $in: nameRegex } }
          ]
        }).select('_id').lean();

        const operatorIdsFromName = matchingUsers.map(user => user._id.toString());

        if (operatorIdsFromName.length > 0) {
          if (query.$and) {
            query.$and.push({ operatorId: { $in: operatorIdsFromName } });
          } else {
            query.operatorId = { $in: operatorIdsFromName };
          }
        } else {
          // If operator name was provided but no matches found, return empty result
          return {
            callLogs: [],
            stats: {
              totalCalls: 0,
              totalLengthOfCalls: '00:00:00',
              averageLengthOfCalls: '00:00:00',
              maxLengthOfCalls: '00:00:00',
              unansweredCalls: 0,
              missedCalls: 0,
              answeredCalls: 0
            },
            pagination: {
              totalItems: 0,
              totalPages: 0,
              currentPage: page,
              limit: limit
            }
          };
        }
      }
    }

    // Get all filtered call logs first (without pagination) to remove duplicates
    const allCallLogs = await CallLog.find(query)
      .sort({ createdAt: -1, updatedAt: -1 })
      .lean();

    // Remove duplicates based on cdrId, keeping the most recent
    const uniqueCallLogs = [];
    const seenCdrIds = new Set();

    for (const log of allCallLogs) {
      if (log.cdrId && !seenCdrIds.has(log.cdrId)) {
        seenCdrIds.add(log.cdrId);
        uniqueCallLogs.push(log);
      } else if (!log.cdrId) {
        // Include logs without cdrId
        uniqueCallLogs.push(log);
      }
    }

    // Calculate pagination based on unique results
    const totalItems = uniqueCallLogs.length;
    const totalPages = Math.ceil(totalItems / limit);

    // Apply pagination to unique results
    const paginatedCallLogs = uniqueCallLogs.slice(skip, skip + limit);

    // Extract unique operator_ids and group_ids from the paginated results
    const operatorIds = [...new Set(paginatedCallLogs.map(log => log.operatorId).filter(Boolean))];
    const groupIds = [...new Set(paginatedCallLogs.map(log => log.groupId).filter(Boolean))];

    // Convert to ObjectIds for MongoDB query
    const operatorObjectIds = operatorIds.map(id => {
      try {
        return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
      } catch (error) {
        return null;
      }
    }).filter(Boolean);

    const groupObjectIds = groupIds.map(id => {
      try {
        return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
      } catch (error) {
        return null;
      }
    }).filter(Boolean);

    // Fetch related users (operators)
    const users = operatorObjectIds.length > 0
      ? await User.find({ _id: { $in: operatorObjectIds } })
          .select('_id firstName lastName email')
          .lean()
      : [];

    // Fetch related groups
    const groups = groupObjectIds.length > 0
      ? await CallGroup.find({ _id: { $in: groupObjectIds } })
          .select('_id groupName')
          .lean()
      : [];

    // Fetch company name from Company model - ALWAYS from Company, not from group
    let companyName = null;
    if (companyId) {
      try {
        let company = null;
        // First try by _id (if companyId is a valid ObjectId)
        if (mongoose.Types.ObjectId.isValid(companyId)) {
          company = await Company.findById(companyId)
            .select('name')
            .lean();
        }
        // If not found by ID, try by tenantDatabaseName
        if (!company) {
          company = await Company.findOne({ tenantDatabaseName: companyId })
            .select('name')
            .lean();
        }
        // If still not found and companyId looks like tenant_<id>, extract the ID part
        if (!company && companyId.startsWith('tenant_')) {
          const extractedId = companyId.replace('tenant_', '');
          if (mongoose.Types.ObjectId.isValid(extractedId)) {
            company = await Company.findById(extractedId)
              .select('name')
              .lean();
          }
        }
        if (company?.name) {
          companyName = company.name;
        }
      } catch (error) {
        console.warn('Error fetching company name:', error);
      }
    }

    // Convert to objects for quick lookup
    const userMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user;
      return acc;
    }, {});

    const groupMap = groups.reduce((acc, group) => {
      acc[group._id.toString()] = group;
      return acc;
    }, {});

    // Merge user and group details into call logs
    // When operator_id is provided, also calculate answerTime for each log
    const callLogsWithDetails = paginatedCallLogs.map(log => {
      const group = log.groupId ? groupMap[log.groupId.toString()] || null : null;
      const logData = {
        ...log,
        operator: log.operatorId ? userMap[log.operatorId.toString()] || null : null,
        group: group
      };
      
      // Calculate answerTime when operator_id is provided
      if (hasOperatorId) {
        const answerTime = calculateAnswerTime(log.cdrData);
        logData.answerTime = answerTime !== null ? answerTime : null;
        logData.answerTimeFormatted = answerTime !== null ? formatDurationHuman(answerTime) : null;
        logData.waitingTime = answerTime !== null ? answerTime : null;
      }
      
      // Add company field - ALWAYS from Company model, not from group
      // Company and Group are separate entities
      logData.company = companyName;
      
      return logData;
    });

    // Calculate detailed statistics using unique call logs
    const totalCalls = uniqueCallLogs.length;
    
    // Total talking time (sum of all call lengths)
    const totalLengthOfCalls = uniqueCallLogs.reduce((sum, log) => sum + parseCallLength(log.callLength), 0);
    const averageLengthOfCalls = totalCalls > 0 ? (totalLengthOfCalls / totalCalls) : 0;
    const maxLengthOfCalls = Math.max(...uniqueCallLogs.map(log => parseCallLength(log.callLength)), 0);

    // Separate inbound and outbound calls
    const inboundCalls = uniqueCallLogs.filter(log => log.direction === 'incoming');
    const outboundCalls = uniqueCallLogs.filter(log => log.direction === 'outgoing');

    // Short calls (outbound < 1 minute = 60 seconds)
    const shortOutboundCalls = outboundCalls.filter(log => {
      const duration = parseCallLength(log.callLength);
      return duration > 0 && duration < 60;
    }).length;

    // Answered calls (inbound)
    const answeredInboundCalls = inboundCalls.filter(log =>
      log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')
    );

    // Missed calls (inbound)
    const missedInboundCalls = inboundCalls.filter(log =>
      log.status && (log.status.toLowerCase() === 'no_answer' || log.status.toLowerCase() === 'missed')
    );

    // Resolved and unresolved missed calls (inbound)
    const resolvedMissedCalls = missedInboundCalls.filter(log => log.isResolved === true).length;
    const unresolvedMissedCalls = missedInboundCalls.filter(log => !log.isResolved).length;

    // Calculate average answer time (inbound) - from cdrData
    const answerTimes = answeredInboundCalls
      .map(log => calculateAnswerTime(log.cdrData))
      .filter(time => time !== null && time >= 0);
    const avgAnswerTime = answerTimes.length > 0
      ? Math.floor(answerTimes.reduce((sum, time) => sum + time, 0) / answerTimes.length)
      : 0;
    const maxAnswerTime = answerTimes.length > 0 ? Math.max(...answerTimes) : 0;

    // Outbound call attempts
    const outboundCallAttempts = outboundCalls.length;

    // Outbound calls answered
    const outboundCallsAnswered = outboundCalls.filter(log =>
      log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')
    ).length;

    // Average waiting time (inbound) - same as answer time
    const avgWaitingTime = avgAnswerTime;
    const maxWaitingTime = maxAnswerTime;

    // Calculate stats by operator if group_by is 'operator'
    let operatorStats = null;
    if (queryParams.group_by === 'operator') {
      const operatorStatsMap = new Map();
      
      uniqueCallLogs.forEach(log => {
        if (!log.operatorId) return;
        const opId = log.operatorId.toString();
        if (!operatorStatsMap.has(opId)) {
          operatorStatsMap.set(opId, {
            operatorId: opId,
            totalCalls: 0,
            totalTalkingTime: 0,
            answeredCalls: 0,
            missedCalls: 0,
            outboundAttempts: 0,
            outboundAnswered: 0
          });
        }
        const stats = operatorStatsMap.get(opId);
        stats.totalCalls++;
        stats.totalTalkingTime += parseCallLength(log.callLength);
        
        if (log.direction === 'incoming') {
          if (log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')) {
            stats.answeredCalls++;
          } else if (log.status && (log.status.toLowerCase() === 'no_answer' || log.status.toLowerCase() === 'missed')) {
            stats.missedCalls++;
          }
        } else if (log.direction === 'outgoing') {
          stats.outboundAttempts++;
          if (log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')) {
            stats.outboundAnswered++;
          }
        }
      });

      // Fetch operator details
      const operatorIdsForStats = Array.from(operatorStatsMap.keys()).map(id => {
        try {
          return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
        } catch (error) {
          return null;
        }
      }).filter(Boolean);

      const operatorsForStats = operatorIdsForStats.length > 0
        ? await User.find({ _id: { $in: operatorIdsForStats } })
            .select('_id firstName lastName email')
            .lean()
        : [];

      const operatorDetailsMap = operatorsForStats.reduce((acc, op) => {
        acc[op._id.toString()] = op;
        return acc;
      }, {});

      operatorStats = Array.from(operatorStatsMap.values()).map(stats => ({
        ...stats,
        operator: operatorDetailsMap[stats.operatorId] || null,
        avgTalkingTime: stats.totalCalls > 0 ? formatDurationHuman(Math.floor(stats.totalTalkingTime / stats.totalCalls)) : '00:00:00',
        totalTalkingTime: formatDurationHuman(stats.totalTalkingTime)
      }));
    }

    // Calculate stats by group if group_by is 'group'
    let groupStats = null;
    if (queryParams.group_by === 'group') {
      const groupStatsMap = new Map();
      
      uniqueCallLogs.forEach(log => {
        if (!log.groupId) return;
        const grpId = log.groupId.toString();
        if (!groupStatsMap.has(grpId)) {
          groupStatsMap.set(grpId, {
            groupId: grpId,
            totalCalls: 0,
            totalTalkingTime: 0,
            answeredCalls: 0,
            missedCalls: 0,
            outboundAttempts: 0,
            outboundAnswered: 0
          });
        }
        const stats = groupStatsMap.get(grpId);
        stats.totalCalls++;
        stats.totalTalkingTime += parseCallLength(log.callLength);
        
        if (log.direction === 'incoming') {
          if (log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')) {
            stats.answeredCalls++;
          } else if (log.status && (log.status.toLowerCase() === 'no_answer' || log.status.toLowerCase() === 'missed')) {
            stats.missedCalls++;
          }
        } else if (log.direction === 'outgoing') {
          stats.outboundAttempts++;
          if (log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')) {
            stats.outboundAnswered++;
          }
        }
      });

      // Fetch group details
      const groupIdsForStats = Array.from(groupStatsMap.keys()).map(id => {
        try {
          return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
        } catch (error) {
          return null;
        }
      }).filter(Boolean);

      const groupsForStats = groupIdsForStats.length > 0
        ? await CallGroup.find({ _id: { $in: groupIdsForStats } })
            .select('_id groupName')
            .lean()
        : [];

      const groupDetailsMap = groupsForStats.reduce((acc, grp) => {
        acc[grp._id.toString()] = grp;
        return acc;
      }, {});

      groupStats = Array.from(groupStatsMap.values()).map(stats => ({
        ...stats,
        group: groupDetailsMap[stats.groupId] || null,
        avgTalkingTime: stats.totalCalls > 0 ? formatDurationHuman(Math.floor(stats.totalTalkingTime / stats.totalCalls)) : '00:00:00',
        totalTalkingTime: formatDurationHuman(stats.totalTalkingTime)
      }));
    }

    return {
      callLogs: callLogsWithDetails,
      stats: {
        // Basic stats
        totalCalls,
        totalLengthOfCalls: formatDurationHuman(totalLengthOfCalls),
        averageLengthOfCalls: formatDurationHuman(Math.floor(averageLengthOfCalls)),
        maxLengthOfCalls: formatDurationHuman(maxLengthOfCalls),
        
        // Outbound stats
        shortOutboundCalls, // Outbound calls < 1 minute
        outboundCallAttempts,
        outboundCallsAnswered,
        
        // Inbound stats
        answeredInboundCalls: answeredInboundCalls.length,
        missedInboundCalls: missedInboundCalls.length,
        resolvedMissedCalls,
        unresolvedMissedCalls,
        avgAnswerTime: formatDurationHuman(avgAnswerTime),
        maxAnswerTime: formatDurationHuman(maxAnswerTime),
        avgWaitingTime: formatDurationHuman(avgWaitingTime),
        maxWaitingTime: formatDurationHuman(maxWaitingTime),
        
        // Legacy stats (for backward compatibility)
        unansweredCalls: uniqueCallLogs.filter(log =>
          log.status && log.status.toLowerCase() !== 'answered' && log.status.toLowerCase() !== 'completed'
        ).length,
        missedCalls: missedInboundCalls.length,
        answeredCalls: uniqueCallLogs.filter(log =>
          log.status && (log.status.toLowerCase() === 'answered' || log.status.toLowerCase() === 'completed')
        ).length
      },
      operatorStats,
      groupStats,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        limit
      }
    };
  } catch (error) {
    console.error('Error in getAllCallLogswithSentimentAnalysis service:', error);
    throw error;
  }
};