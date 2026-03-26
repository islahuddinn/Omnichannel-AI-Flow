// src/services/conversation/ConversationModeHelper.js
/**
 * Helper service to determine conversation mode based on department AI bot settings
 */

/**
 * Get the appropriate conversation mode based on department's AI bot enabled status
 * @param {Object} params - Parameters
 * @param {string|ObjectId} params.departmentId - Department ID
 * @param {Object} params.tenantDB - Tenant database instance
 * @returns {Promise<'auto'|'manual'>} Conversation mode
 */
export async function getConversationModeForDepartment({ departmentId, tenantDB }) {
  try {
    // If no department, default to manual mode (no AI bot)
    if (!departmentId) {
      console.log('⚠️ No department ID provided, defaulting to manual mode');
      return 'manual';
    }

    // Get department AI bot enabled status
    const DepartmentSchema = (await import('../../models/schemas/Department.js')).default;
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    
    const department = await Department.findById(departmentId).select('aiBotEnabled name').lean();
    
    if (!department) {
      console.log(`⚠️ Department ${departmentId} not found, defaulting to manual mode`);
      return 'manual';
    }

    // If AI bot is enabled for department, use auto mode; otherwise manual mode
    const mode = department.aiBotEnabled ? 'auto' : 'manual';
    
    console.log(`✅ Conversation mode determined for department "${department.name}": ${mode} (aiBotEnabled: ${department.aiBotEnabled})`);
    
    return mode;
  } catch (error) {
    console.error('❌ Error determining conversation mode for department:', error);
    // Default to manual mode on error to be safe
    return 'manual';
  }
}

/**
 * Update all conversations for a department to match the department's AI bot enabled status
 * @param {Object} params - Parameters
 * @param {string|ObjectId} params.departmentId - Department ID
 * @param {boolean} params.aiBotEnabled - Whether AI bot is enabled
 * @param {Object} params.tenantDB - Tenant database instance
 * @returns {Promise<Object>} Update result with count of updated conversations
 */
export async function updateConversationsModeForDepartment({ departmentId, aiBotEnabled, tenantDB }) {
  try {
    const ConversationSchema = (await import('../../models/schemas/Conversation.js')).default;
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    
    // Determine target mode based on AI bot enabled status
    const targetMode = aiBotEnabled ? 'auto' : 'manual';
    
    // Find all active conversations for this department
    const conversations = await Conversation.find({
      department: departmentId,
      status: { $in: ['active', 'open', 'pending'] }
    }).select('_id mode').lean();
    
    // Filter conversations that need mode update
    const conversationsToUpdate = conversations.filter(conv => conv.mode !== targetMode);
    
    if (conversationsToUpdate.length === 0) {
      console.log(`ℹ️ No conversations need mode update for department ${departmentId} (all already in ${targetMode} mode)`);
      return {
        totalConversations: conversations.length,
        updatedCount: 0,
        targetMode
      };
    }
    
    // Update all conversations to target mode
    const updateResult = await Conversation.updateMany(
      {
        department: departmentId,
        status: { $in: ['active', 'open', 'pending'] },
        mode: { $ne: targetMode } // Only update conversations that don't match target mode
      },
      {
        $set: { mode: targetMode }
      }
    );
    
    console.log(`✅ Updated ${updateResult.modifiedCount} conversations to ${targetMode} mode for department ${departmentId}`);
    
    return {
      totalConversations: conversations.length,
      updatedCount: updateResult.modifiedCount,
      targetMode
    };
  } catch (error) {
    console.error('❌ Error updating conversations mode for department:', error);
    throw error;
  }
}

