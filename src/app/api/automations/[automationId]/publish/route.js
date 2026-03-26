// src/app/api/automations/[automationId]/publish/route.js
import { NextResponse } from 'next/server';
import { getTenantDB, getMasterDB } from '@/config/database';
import AutomationSchema from '@/models/schemas/Automation';
import TemplateSchema from '@/models/schemas/Template';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import DepartmentSchema from '@/models/schemas/Department';
import UserSchema from '@/models/schemas/User';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    const masterDB = await getMasterDB();
    
    // Register schemas in tenant DB
    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
    const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    
    const body = await request.json();
    const { isPublished } = body;

    const automation = await Automation.findById(automationId);

    if (!automation) {
      return NextResponse.json(
        { success: false, error: 'Automation not found' },
        { status: 404 }
      );
    }

    if (automation.tenantId !== context.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Validate automation is complete before publishing
    if (isPublished === true) {
      if (!automation.name || automation.name.trim() === '') {
        return NextResponse.json(
          { success: false, error: 'Automation name is required' },
          { status: 400 }
        );
      }
      
      if (!automation.departments || automation.departments.length === 0) {
        return NextResponse.json(
          { success: false, error: 'At least one department must be selected' },
          { status: 400 }
        );
      }
      
      if (!automation.channels || automation.channels.length === 0) {
        return NextResponse.json(
          { success: false, error: 'At least one channel must be configured' },
          { status: 400 }
        );
      }
      
      // Validate trigger conditions - must exist, have at least one condition, and all conditions must be complete
      if (!automation.triggerConditions || !automation.triggerConditions.conditions || automation.triggerConditions.conditions.length === 0) {
        console.log(`[Publish] Validation failed: No trigger conditions found. Automation: ${automationId}`, {
          triggerConditions: automation.triggerConditions,
          conditionsLength: automation.triggerConditions?.conditions?.length || 0
        });
        return NextResponse.json(
          { success: false, error: 'At least one trigger condition must be configured' },
          { status: 400 }
        );
      }
      
      // Validate that all conditions are complete (have entity, field, and selectedValue)
      const incompleteConditions = automation.triggerConditions.conditions.filter(
        cond => !cond.entity || !cond.field || !cond.selectedValue || cond.selectedValue === ''
      );
      
      if (incompleteConditions.length > 0) {
        console.log(`[Publish] Validation failed: Found ${incompleteConditions.length} incomplete conditions. Automation: ${automationId}`, {
          totalConditions: automation.triggerConditions.conditions.length,
          incompleteConditions: incompleteConditions,
          allConditions: automation.triggerConditions.conditions
        });
        return NextResponse.json(
          { success: false, error: `Found ${incompleteConditions.length} incomplete trigger condition(s). All conditions must have entity, field, and value selected.` },
          { status: 400 }
        );
      }
      
      // Validate contact type is selected
      if (!automation.triggerConditions.contactType || automation.triggerConditions.contactType === '') {
        console.log(`[Publish] Validation failed: Contact type not selected. Automation: ${automationId}`);
        return NextResponse.json(
          { success: false, error: 'Contact type must be selected' },
          { status: 400 }
        );
      }

      // Validate at least one outcome exists
      const OWMOutcomeSchema = (await import('@/models/schemas/OWMOutcome')).default;
      const OWMOutcome = tenantDB.models.OWMOutcome || tenantDB.model('OWMOutcome', OWMOutcomeSchema);
      const outcomeCount = await OWMOutcome.countDocuments({ tenantId: context.tenantId, automationId });
      if (outcomeCount === 0) {
        return NextResponse.json(
          { success: false, error: 'At least one outcome must be configured before publishing' },
          { status: 400 }
        );
      }
      
      console.log(`[Publish] Trigger conditions validation passed. Automation: ${automationId}`, {
        contactType: automation.triggerConditions.contactType,
        conditionsCount: automation.triggerConditions.conditions.length,
        conditions: automation.triggerConditions.conditions.map(c => ({
          entity: c.entity,
          field: c.field,
          hasValue: !!c.selectedValue && c.selectedValue !== ''
        }))
      });
    }

    // ✅ CRITICAL: Convert to plain object to avoid Mongoose's `type` field conflict
    // Mongoose interprets `.type` as a SchemaType property, not the stored value.
    // Using .toObject() ensures we get the actual stored timing data.
    const timingData = automation.toObject().timing;

    // Ensure timing is preserved - don't reset it when unpublishing
    // Only set default if timing is completely missing
    if (!timingData || !timingData.type) {
      automation.timing = {
        type: 'immediate',
        delay: { days: 0, hours: 0, minutes: 0 },
        scheduledAt: null,
      };
    }

    // Re-read timing after potential default assignment
    const resolvedTiming = automation.toObject().timing;

    // Log current timing configuration
    console.log(`[Publish] Automation ${automationId} current timing:`, {
      type: resolvedTiming.type,
      delay: resolvedTiming.delay,
      scheduledAt: resolvedTiming.scheduledAt,
    });

    automation.isPublished = isPublished === true;
    await automation.save();

    // If publishing, enqueue automation execution to RabbitMQ based on timing type
    if (isPublished === true) {
      try {
        const { publishToQueue, QUEUES } = await import('@/lib/queue/rabbitmq');
        // ✅ Use resolvedTiming (plain object) to avoid Mongoose `type` field conflict
        const timingType = resolvedTiming.type;

        if (!timingType) {
          throw new Error('Automation timing type is required. Please configure timing before publishing.');
        }
        
        // Get server timezone for logging
        const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        
        console.log(`[Publish] Automation ${automationId} timing type: ${timingType}`);
        
        let delayMs = 0;
        let scheduledFor = null;
        
        // Get current time in UTC (server time)
        const now = new Date();
        const nowUTC = new Date(now.toISOString());
        
        // Format for local timezone display
        const formatLocalTime = (date) => {
          return date.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
            timeZone: serverTimezone
          });
        };
        
        if (timingType === 'delayed') {
          // Calculate delay in milliseconds
          const delay = resolvedTiming.delay || { days: 0, hours: 0, minutes: 0 };
          delayMs = (delay.days * 24 * 60 * 60 * 1000) + 
                   (delay.hours * 60 * 60 * 1000) + 
                   (delay.minutes * 60 * 1000);
          
          if (delayMs > 0) {
            // Calculate scheduled time: current UTC time + delay
            scheduledFor = new Date(nowUTC.getTime() + delayMs);
            const localScheduledTime = formatLocalTime(scheduledFor);
            console.log(`[Publish] Current time (${serverTimezone}): ${formatLocalTime(nowUTC)}`);
            console.log(`[Publish] Delay: ${delay.days}d ${delay.hours}h ${delay.minutes}m (${delayMs}ms)`);
            console.log(`[Publish] Scheduled for (${serverTimezone}): ${localScheduledTime}`);
            console.log(`[Publish] Scheduled for (UTC): ${scheduledFor.toISOString()}`);
          } else {
            scheduledFor = nowUTC;
            console.log(`[Publish] No delay specified, executing immediately at ${formatLocalTime(nowUTC)}`);
          }
        } else if (timingType === 'schedule') {
          // Calculate delay until scheduled time
          const scheduledAt = resolvedTiming.scheduledAt;
          if (scheduledAt) {
            // scheduledAt is already in ISO format from frontend (UTC), parse it
            const scheduledDate = new Date(scheduledAt);
            
            // Validate the date
            if (isNaN(scheduledDate.getTime())) {
              console.warn(`[Publish] Invalid scheduledAt date: ${scheduledAt}`);
              delayMs = 0;
              scheduledFor = nowUTC;
            } else {
              // Calculate delay from now to scheduled time
              delayMs = scheduledDate.getTime() - nowUTC.getTime();
              scheduledFor = scheduledDate;
              
              const localScheduledTime = formatLocalTime(scheduledDate);
              console.log(`[Publish] Current time (${serverTimezone}): ${formatLocalTime(nowUTC)}`);
              console.log(`[Publish] Scheduled time (${serverTimezone}): ${localScheduledTime}`);
              console.log(`[Publish] Scheduled time (UTC): ${scheduledDate.toISOString()}`);
              console.log(`[Publish] Delay: ${Math.floor(delayMs / 1000 / 60)} minutes (${delayMs}ms)`);
              
              if (delayMs <= 0) {
                // If scheduled time is in the past, execute immediately
                console.warn(`[Publish] Automation ${automationId} scheduled time is in the past, executing immediately`);
                delayMs = 0;
                scheduledFor = nowUTC;
              }
            }
          } else {
            console.warn(`[Publish] Automation ${automationId} has schedule type but no scheduledAt date, executing immediately`);
            delayMs = 0;
            scheduledFor = nowUTC;
          }
        } else {
          // Immediate execution
          delayMs = 0;
          scheduledFor = nowUTC;
          console.log(`[Publish] Immediate execution at ${formatLocalTime(nowUTC)} (${serverTimezone})`);
        }
        
        // Enqueue automation execution to RabbitMQ
        // Worker will check scheduledFor time and execute when ready
        const queueData = {
          automationId: automationId.toString(),
          tenantId: context.tenantId,
          executionType: timingType,
          scheduledFor: scheduledFor ? scheduledFor.toISOString() : new Date().toISOString(),
          triggeredBy: (auth.user._id || auth.user.id)?.toString(),
        };
        
        console.log(`[Publish] Queuing automation ${automationId} | type: ${timingType} | delay: ${delayMs}ms | scheduledFor: ${scheduledFor?.toISOString()}`);
        
        await publishToQueue(QUEUES.AUTOMATION_EXECUTE, queueData);
        
        console.log(`[Publish] Automation ${automationId} queued successfully`);
        
        // Log automation queued event
        try {
          const { getTenantDB } = await import('@/config/database');
          const tenantDB = await getTenantDB(context.tenantId);
          const MessageLogSchema = (await import('@/models/schemas/MessageLog')).default;
          const MessageLog = tenantDB.models.MessageLog || tenantDB.model('MessageLog', MessageLogSchema);
          
          await MessageLog.create({
            automationId: automationId,
            logType: 'automation',
            eventType: 'queued',
            message: `Automation "${automation.name}" queued for ${timingType} execution${scheduledFor ? ` at ${scheduledFor.toISOString()}` : ''}`,
            status: 'info',
            tenantId: context.tenantId,
            userId: auth.user._id || auth.user.id,
            data: {
              timingType,
              delayMs,
              scheduledFor: scheduledFor?.toISOString(),
            },
          });
        } catch (logError) {
          console.error('[Publish] Failed to log automation queued event:', logError);
        }
      } catch (error) {
        console.error('[Publish] Error queuing automation execution:', error);
        // Don't fail the publish request if queuing fails
      }
    }

    await automation.populate('departments', 'name');
    await automation.populate('channels.channelAccountId', 'name type identifier');
    await automation.populate('channels.templateId', 'name channel body subject');
    
    // Manually populate createdBy from master DB
    const automationObj = automation.toObject();
    if (automationObj.createdBy) {
      const user = await User.findById(automationObj.createdBy)
        .select('firstName lastName email')
        .lean();
      automationObj.createdBy = user;
    }

    return NextResponse.json({
      success: true,
      data: automationObj,
      message: isPublished ? 'Automation published successfully' : 'Automation unpublished successfully'
    });
  } catch (error) {
    console.error('[Automation] Publish error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to update automation status' },
      { status: 500 }
    );
  }
}

