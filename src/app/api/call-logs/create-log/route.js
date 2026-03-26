// src/app/api/call-logs/create-log/route.js
import { NextResponse } from 'next/server';
import * as callLogService from '@/services/call-logs/callLogService';
import SocketManager from '@/services/socket/SocketManager.js';

/**
 * POST /api/call-logs/create-log
 * Create or update call log
 * Authenticated using API key (X_API_KEY_CREATE_LOG) for external services
 */
// export async function POST(request) {
//   try {
//     // Verify API key from headers
//     const apiKey = request.headers.get('x-api-key') || request.headers.get('X-API-Key');
//     const expectedApiKey = process.env.X_API_KEY_CREATE_LOG;

//     if (!apiKey || !expectedApiKey || apiKey !== expectedApiKey) {
//       return NextResponse.json(
//         { success: false, error: 'Unauthorized - Invalid API key' },
//         { status: 401 }
//       );
//     }

//     const body = await request.json();
//     const {
//       type = 'human',
//       callId,
//       transcript,
//       summary,
//       userId,
//       cdrData
//     } = body;

//     // Validate required fields
//     if (!cdrData && !callId) {
//       return NextResponse.json(
//         { success: false, message: 'CDR data or callId is required' },
//         { status: 400 }
//       );
//     }

//     // Determine final userId and companyId
//     let finalUserId = null;
//     let companyId = null;

//     // if (userId) {
//     //   const { getMasterDB } = await import('@/config/database.js');
//     //   const masterDB = await getMasterDB();
//     //   const User = masterDB.models.User || masterDB.model('User', (await import('@/models/schemas/User.js')).default);
//     //   const agent = await User.findById(userId).lean();

//     //   console.log(agent,"Agent")

//     //   if (!agent) {
//     //     return NextResponse.json(
//     //       { success: false, message: 'Operator not found or does not belong to any company.' },
//     //       { status: 404 }
//     //     );
//     //   }
//     //   finalUserId = agent.role === 'agent' ? agent.companyId : userId;
//     //   companyId = agent.companyId || agent.tenantId;
//     // }



//     if (userId) {
//       // userId is the companyId
//       companyId = userId;
    
//       const { getMasterDB } = await import('@/config/database.js');
//       const masterDB = await getMasterDB();
//       const User = masterDB.models.User || masterDB.model(
//         'User',
//         (await import('@/models/schemas/User.js')).default
//       );
    
//       // Find the agent/operator from cdrData
//       const agent = await User.findById(cdrData.operator_id).lean();    
//       if (!agent) {
//         return NextResponse.json(
//           { success: false, message: 'Operator not found.' },
//           { status: 404 }
//         );
//       }
    
//       // finalUserId should be the agent's ID
//       finalUserId = agent._id;
//     }
    

//     // If companyId is not found from userId, try to get it from cdrData or require it
//     if (!companyId) {
//       // Try to get companyId from cdrData if available
//       if (cdrData?.companyId) {
//         companyId = cdrData.companyId;
//       } else {
//         return NextResponse.json(
//           { success: false, message: 'Company ID is required. Provide userId or companyId in cdrData.' },
//           { status: 400 }
//         );
//       }
//     }

//     if (!finalUserId && !cdrData?.operator_id) {
//       return NextResponse.json(
//         { success: false, message: 'User ID or operator_id in cdrData is required' },
//         { status: 400 }
//       );
//     }

//     // Use operator_id from cdrData if userId not provided
//     if (!finalUserId && cdrData?.operator_id) {
//       finalUserId = cdrData.operator_id;
//     }

//     // Call the service to create/update the call log
//     const result = await callLogService.createAndUpdateCallLog(
//       {
//         callId: callId || cdrData?.call_id,
//         type,
//         userId: finalUserId,
//         transcript,
//         summary,
//         cdrData
//       },
//       companyId
//     );

//     // Check if call log was created/updated successfully
//     if (!result || !result.callLog) {
//       return NextResponse.json(
//         { success: false, message: 'Failed to create/update call log - no CDR data available' },
//         { status: 400 }
//       );
//     }



   

//     // Emit socket events using SocketManager and SocketEmitter
//     try {
//       if (result.conversation_id) {
//         // Build message object with all call log data
//         const callLogMessage = {
//           _id: result.callLog._id || result.callLog._id?.toString(),
//           type: 'callLog',
//           cdrId: result.callLog.cdrId,
//           operatorId: result.callLog.operatorId,
//           groupId: result.callLog.groupId,
//           callerNumber: result.callLog.callerNumber,
//           receiverNumber: result.callLog.receiverNumber,
//           callLength: result.callLog.callLength,
//           direction: result.callLog.direction,
//           status: result.callLog.status,
//           recordingLink: result.callLog.recordingLink,
//           transcript: result.callLog.transcript || transcript,
//           summary: result.callLog.summary || summary,
//           cdrData: result.callLog.cdrData,
//           isResolved: result.callLog.isResolved,
//           createdAt: result.callLog.createdAt,
//           updatedAt: result.callLog.updatedAt,
//           // Include operator name (from service)
//           operatorName: result.operator_name || null,
//           // Legacy fields for backward compatibility
//           call_id: result.callLog.cdrId,
//           operator_id: result.callLog.operatorId,
//           group_id: result.callLog.groupId,
//           caller_number: result.callLog.callerNumber,
//           reciever_number: result.callLog.receiverNumber,
//           call_length: result.callLog.callLength,
//           recording_link: result.callLog.recordingLink,
//           cdr_id: result.callLog.cdrId,
//           conversation_id: result.conversation_id
//         };

//         // Use emitNewMessage method for proper room-based emission
//         // This emits to conversation-specific and tenant-specific rooms
//         SocketManager.emitNewMessage(
//           result.conversation_id,
//           callLogMessage,
//           companyId
//         );

//         // Emit conversation update to update last message content in real-time
//         if (result.last_message_content) {
//           try {
//             const SocketEmitter = (await import('@/services/socket/SocketEmitter')).default;
//             const { getTenantDB } = await import('@/config/database');
//             const tenantDB = await getTenantDB(companyId);
//             const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', (await import('@/models/schemas/Conversation')).default);
            
//             // Get conversation to extract departmentId
//             const conversation = await Conversation.findById(result.conversation_id)
//               .select('department')
//               .lean();
            
//             const departmentId = conversation?.department || null;
            
//             // Emit conversation update with last message content
//             await SocketEmitter.emitConversationUpdate(
//               result.conversation_id,
//               {
//                 lastMessageContent: result.last_message_content,
//                 lastMessageAt: new Date(),
//                 lastMessageType: 'callLog',
//                 lastMessageDirection: result.callLog.direction === 'incoming' ? 'inbound' : 'outbound'
//               },
//               companyId,
//               departmentId,
//               null
//             );
//           } catch (conversationUpdateError) {
//             console.warn('Could not emit conversation update:', conversationUpdateError);
//             // Don't fail if conversation update emission fails
//           }
//         }
//       }
//     } catch (socketError) {
//       console.error('Error emitting socket event:', socketError);
//       // Don't fail the request if socket emission fails
//     }

//     return NextResponse.json({
//       success: true,
//       message: type === 'human' ? 'Call Log created successfully' : 'Call Log updated successfully',
//       data: result.callLog
//     }, { status: 201 });
//   } catch (error) {
//     console.error('Error creating/updating call log:', error);
//     return NextResponse.json(
//       {
//         success: false,
//         message: 'Failed to create/update call log',
//         error: error.message
//       },
//       { status: 500 }
//     );
//   }
// }


/**
 * POST /api/call-logs/create-log
 * Upserts call-log data coming from PBX/webhook integrations using API-key auth.
 */
export async function POST(request) {
  console.log('=== POST /api/call-log START ===');
  
  try {
    // Verify API key from headers
    console.log('Step 1: Verifying API key');
    const apiKey = request.headers.get('x-api-key') || request.headers.get('X-API-Key');
    const expectedApiKey = process.env.X_API_KEY_CREATE_LOG;
    
    console.log('API Key present:', !!apiKey);
    console.log('Expected API Key present:', !!expectedApiKey);
    
    if (!apiKey || !expectedApiKey || apiKey !== expectedApiKey) {
      console.log('❌ API key validation failed');
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Invalid API key' },
        { status: 401 }
      );
    }
    console.log('✓ API key validated successfully');

    console.log('Step 2: Parsing request body');
    const body = await request.json();
    console.log('Request body:', JSON.stringify(body, null, 2));
    
    const { type = 'human', callId, transcript, summary, userId, cdrData } = body;
    console.log('Extracted fields:', { type, callId, userId, hasTranscript: !!transcript, hasSummary: !!summary, hasCdrData: !!cdrData });

    // Validate required fields
    console.log('Step 3: Validating required fields');
    if (!cdrData && !callId) {
      console.log('❌ Validation failed: CDR data or callId is required');
      return NextResponse.json(
        { success: false, message: 'CDR data or callId is required' },
        { status: 400 }
      );
    }
    console.log('✓ Required fields validated');

    // Determine final userId and companyId
    let finalUserId = null;
    let companyId = null;

    // if (userId) {
    //   console.log('Step 4: Processing userId:', userId);
    //   // userId is the companyId
    //   companyId = userId;
    //   console.log('Set companyId from userId:', companyId);
      
    //   const { getMasterDB } = await import('@/config/database.js');
    //   const masterDB = await getMasterDB();
    //   console.log('✓ Master DB connection established');
      
    //   const User = masterDB.models.User || masterDB.model(
    //     'User',
    //     (await import('@/models/schemas/User.js')).default
    //   );

    //   // Find the agent/operator from cdrData
    //   console.log('Looking up operator with ID:', cdrData?.operator_id);
    //   const agent = await User.findById(cdrData.operator_id).lean();
    //   console.log('Agent found:', agent ? { id: agent._id, role: agent.role, companyId: agent.companyId } : null);
      
    //   if (!agent) {
    //     console.log('❌ Operator not found with ID:', cdrData?.operator_id);
    //     return NextResponse.json(
    //       { success: false, message: 'Operator not found.' },
    //       { status: 404 }
    //     );
    //   }

    //   // finalUserId should be the agent's ID
    //   finalUserId = agent._id;
    //   console.log('✓ Set finalUserId to agent ID:', finalUserId);
    // }

    // If companyId is not found from userId, try to get it from cdrData or require it
    
    


    if (userId) {
      console.log('Step 4: Processing userId:', userId);
    
      const { getMasterDB } = await import('@/config/database.js');
      const masterDB = await getMasterDB();
      console.log('✓ Master DB connection established');
    
      const User =
        masterDB.models.User ||
        masterDB.model(
          'User',
          (await import('@/models/schemas/User.js')).default
        );
    
      let agent = null;
    
      // Prefer explicit operator id when provided by the CDR payload.
      if (cdrData?.operator_id) {
        console.log('Looking up operator via cdrData.operator_id:', cdrData.operator_id);
    
        agent = await User.findById(cdrData.operator_id).lean();
    
        if (!agent) {
          console.log('❌ Operator not found with ID:', cdrData.operator_id);
          return NextResponse.json(
            { success: false, message: 'Operator not found.' },
            { status: 404 }
          );
        }
    
        finalUserId = agent._id;
        companyId = agent.companyId;
    
        console.log('✓ Agent resolved via operator_id:', {
          finalUserId,
          companyId,
        });
    
      } else {
        // Fallback: detect if userId points to an agent record or a company id.
        console.log('Determining whether userId is agentId or companyId');
    
        const user = await User.findById(userId).lean();
    
        if (user) {
          // userId is actually an agent
          finalUserId = user._id;
          companyId = user.companyId;
    
          console.log('✓ userId resolved as agentId:', {
            finalUserId,
            companyId,
          });
        } else {
          // userId is a companyId
          companyId = userId;
    
          console.log('✓ userId resolved as companyId:', companyId);
        }
      }
    }
    
    
    
    console.log('Step 5: Verifying companyId');
    if (!companyId) {
      console.log('companyId not set, checking cdrData');
      // Try to get companyId from cdrData if available
      if (cdrData?.companyId) {
        companyId = cdrData.companyId;
        console.log('✓ Set companyId from cdrData:', companyId);
      } else {
        console.log('❌ Company ID not found in userId or cdrData');
        return NextResponse.json(
          { success: false, message: 'Company ID is required. Provide userId or companyId in cdrData.' },
          { status: 400 }
        );
      }
    } else {
      console.log('✓ companyId already set:', companyId);
    }

    console.log('Step 6: Verifying finalUserId or operator_id');
    if (!finalUserId && !cdrData?.operator_id) {
      console.log('❌ Neither finalUserId nor cdrData.operator_id present');
      return NextResponse.json(
        { success: false, message: 'User ID or operator_id in cdrData is required' },
        { status: 400 }
      );
    }

    // Use operator_id from cdrData if userId not provided
    if (!finalUserId && cdrData?.operator_id) {
      finalUserId = cdrData.operator_id;
      console.log('✓ Set finalUserId from cdrData.operator_id:', finalUserId);
    } else {
      console.log('✓ finalUserId already set:', finalUserId);
    }

    // Service handles create-vs-update behavior and conversation linkage.
    console.log('Step 7: Calling callLogService.createAndUpdateCallLog');
    console.log('Service parameters:', {
      callId: callId || cdrData?.call_id,
      type,
      userId: finalUserId,
      hasTranscript: !!transcript,
      hasSummary: !!summary,
      hasCdrData: !!cdrData,
      companyId
    });
    
    const result = await callLogService.createAndUpdateCallLog(
      {
        callId: callId ||cdrData?.operator_call_id|| cdrData?.call_id,
        type,
        userId: finalUserId,
        transcript,
        summary,
        cdrData
      },
      companyId
    );
    
    console.log('Service result:', result ? {
      hasCallLog: !!result.callLog,
      callLogId: result.callLog?._id,
      conversationId: result.conversation_id,
      operatorName: result.operator_name,
      hasLastMessageContent: !!result.last_message_content
    } : null);

    // Check if call log was created/updated successfully
    if (!result || !result.callLog) {
      console.log('❌ Service failed to create/update call log');
      return NextResponse.json(
        { success: false, message: 'Failed to create/update call log - no CDR data available' },
        { status: 400 }
      );
    }
    console.log('✓ Call log created/updated successfully');

    // Emit realtime updates, but do not fail request on socket issues.
    console.log('Step 8: Emitting socket events');
    try {
      if (result.conversation_id) {
        console.log('Preparing socket emission for conversation:', result.conversation_id);
        
        // Build message object with all call log data
        const callLogMessage = {
          _id: result.callLog._id || result.callLog._id?.toString(),
          type: 'callLog',
          cdrId: result.callLog.cdrId,
          operatorId: result.callLog.operatorId,
          groupId: result.callLog.groupId,
          callerNumber: result.callLog.callerNumber,
          receiverNumber: result.callLog.receiverNumber,
          callLength: result.callLog.callLength,
          direction: result.callLog.direction,
          status: result.callLog.status,
          recordingLink: result.callLog.recordingLink,
          transcript: result.callLog.transcript || transcript,
          summary: result.callLog.summary || summary,
          cdrData: result.callLog.cdrData,
          isResolved: result.callLog.isResolved,
          createdAt: result.callLog.createdAt,
          updatedAt: result.callLog.updatedAt,
          operatorName: result.operator_name || null,
          // Legacy fields for backward compatibility
          call_id: result.callLog.cdrId,
          operator_id: result.callLog.operatorId,
          group_id: result.callLog.groupId,
          caller_number: result.callLog.callerNumber,
          reciever_number: result.callLog.receiverNumber,
          call_length: result.callLog.callLength,
          recording_link: result.callLog.recordingLink,
          cdr_id: result.callLog.cdrId,
          conversation_id: result.conversation_id
        };
        
        console.log('Call log message prepared:', {
          id: callLogMessage._id,
          type: callLogMessage.type,
          conversationId: callLogMessage.conversation_id,
          direction: callLogMessage.direction
        });

        // Use emitNewMessage method for proper room-based emission
        console.log('Emitting new message to conversation:', result.conversation_id, 'companyId:', companyId);
        SocketManager.emitNewMessage(
          result.conversation_id,
          callLogMessage,
          companyId
        );
        console.log('✓ New message emitted');

        // Emit conversation update to update last message content in real-time
        if (result.last_message_content) {
          console.log('Emitting conversation update with last message content');
          try {
            const SocketEmitter = (await import('@/services/socket/SocketEmitter')).default;
            const { getTenantDB } = await import('@/config/database');
            const tenantDB = await getTenantDB(companyId);
            console.log('✓ Tenant DB connection established');
            
            const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', (await import('@/models/schemas/Conversation')).default);

            // Get conversation to extract departmentId
            console.log('Fetching conversation for department ID');
            const conversation = await Conversation.findById(result.conversation_id)
              .select('department')
              .lean();
            const departmentId = conversation?.department || null;
            console.log('Department ID:', departmentId);

            // Emit conversation update with last message content
            const updatePayload = {
              lastMessageContent: result.last_message_content,
              lastMessageAt: new Date(),
              lastMessageType: 'callLog',
              lastMessageDirection: result.callLog.direction === 'incoming' ? 'inbound' : 'outbound'
            };
            console.log('Conversation update payload:', updatePayload);
            
            await SocketEmitter.emitConversationUpdate(
              result.conversation_id,
              updatePayload,
              companyId,
              departmentId,
              null
            );
            console.log('✓ Conversation update emitted');
          } catch (conversationUpdateError) {
            console.warn('⚠️ Could not emit conversation update:', conversationUpdateError);
            console.warn('Error stack:', conversationUpdateError.stack);
            // Don't fail if conversation update emission fails
          }
        } else {
          console.log('ℹ️ No last message content to emit');
        }
      } else {
        console.log('ℹ️ No conversation_id in result, skipping socket emission');
      }
    } catch (socketError) {
      console.error('❌ Error emitting socket event:', socketError);
      console.error('Socket error stack:', socketError.stack);
      // Don't fail the request if socket emission fails
    }

    console.log('Step 9: Returning success response');
    const responseData = {
      success: true,
      message: type === 'human' ? 'Call Log created successfully' : 'Call Log updated successfully',
      data: result.callLog
    };
    console.log('Response:', { success: responseData.success, message: responseData.message, callLogId: responseData.data?._id });
    console.log('=== POST /api/call-log END (SUCCESS) ===\n');
    
    return NextResponse.json(responseData, { status: 201 });

  } catch (error) {
    console.error('❌ ERROR in POST /api/call-log:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.log('=== POST /api/call-log END (ERROR) ===\n');
    
    return NextResponse.json(
      { success: false, message: 'Failed to create/update call log', error: error.message },
      { status: 500 }
    );
  }
}