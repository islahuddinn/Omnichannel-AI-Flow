// src/services/pbx/PbxService.js
import axios from 'axios';
import FormData from 'form-data';
import { getMasterDB } from '../../config/database.js';
import PbxExtensionSchema from '../../models/schemas/PbxExtension.js';

const apiUrl = process.env.PBX_API_URL;
const username = process.env.PBX_API_USERNAME;
const password = process.env.PBX_API_PASSWORD;

const axiosInstance = axios.create({
  baseURL: apiUrl,
  headers: {
    'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
    'Content-Type': 'application/json'
  }
});

// ========== EXTENSION SERVICES ==========

/**
 * Create PBX extension
 * @param {Object} userData - User data for extension creation
 * @param {Boolean} skipDBSave - If true, only calls PBX API without saving to DB (for transaction handling)
 */
export const createExtension = async (userData, skipDBSave = false) => {
  try {

    const payload = {
      name: userData.name,
      username: userData.sip_username,
      password: userData.sip_password,
      user_id: userData.userId,
      extensionplan: "Hodinovy Manzel",
      outroute: "OUT",
      internal_extension: userData.internal_extension || 150,
      codecspriority: "8",
      nat: 1,
      webrtc: 1,
      max_contacts: 5,
      outgoing_calls: userData.outbound_calls === "Yes" || userData.outbound_calls === "yes" ? "allowed" : "disallowed",
      inbound_calls: userData.inbound_calls === "Yes" || userData.inbound_calls === "yes" ? "yes" : "no",
      monitor_enable: userData.recording_downloads === "yes" || userData.recording_downloads === "Yes" ? "both" : "off",
      limit_outgoing_calls: userData.waiting_in_line || null,
      limit_incoming_calls: userData.waiting_in_line || null,
      waiting_in_line: userData.waiting_in_line || null,
      // playback_during_paused: userData.playback_during_paused || null,

      playback_during_paused: "choose",

      playback: userData.playback || null
    };

    console.log(payload, "PBX create extension payload");

    const response = await axiosInstance.post('/extensions', payload);
    if (response.data.status !== 'success') {
      throw new Error(response.data.message || 'Failed to create PBX extension');
    }

    // Save extension data to the database only if not skipping DB save
    let pbxExtension = null;
    if (!skipDBSave) {
      const masterDB = await getMasterDB();
      const PbxExtension = masterDB.models.PbxExtension || masterDB.model('PbxExtension', PbxExtensionSchema);

      pbxExtension = await PbxExtension.create({
        userId: userData.userId,
        extension_hash: response.data.hash,
        internal_extension: response.data.internal_extension,
        sip_username: userData.sip_username,
        sip_password: userData.sip_password,
        extension_plan: "Hodinovy Manzel",
        outgoing_calls: userData.outbound_calls === "Yes" || userData.outbound_calls === "yes" ? "allowed" : "disallowed",
        inbound_calls: userData.inbound_calls === "Yes" || userData.inbound_calls === "yes" ? "yes" : "no",
        monitor_enable: userData.recording_downloads === "yes" || userData.recording_downloads === "Yes" ? "both" : "off",
        outroute: "OUT",
        codec_priority: "8",
        nat: 1,
        webrtc: 1,
        waiting_in_line: userData.waiting_in_line || null,
        playback_during_paused: userData.playback_during_paused || null,


        playback: userData.playback || null
      });

      console.log(pbxExtension, "PBX extension created in DB");
    }

    return {
      ...response.data,
      ...(pbxExtension && { pbxExtension: pbxExtension.toObject() })
    };
  } catch (error) {
    console.error('Error creating PBX extension:', error);
    throw error;
  }
};

/**
 * Update PBX extension
 * @param {string} hash - Extension hash
 * @param {Object} updates - Update fields
 * @param {Object} options - Optional parameters
 * @param {Object} options.db - Optional database instance (for tenant DB updates)
 */
export const updateExtension = async (hash, updates, options = {}) => {
  try {
    const masterDB = await getMasterDB();
    const PbxExtension = masterDB.models.PbxExtension || masterDB.model('PbxExtension', PbxExtensionSchema);

    console.log(updates, "PBX update extension updates");

    // Enhanced payload with all possible PBX settings
    // PBX always expects playback_during_paused: "choose" when we send playback URL (not "default")
    const payload = {
      name: updates.name,
      outgoing_calls: updates.outgoing_calls,
      inbound_calls: updates.inbound_calls,
      limit_outgoing_calls: updates.waiting_in_line,
      limit_incoming_calls: updates.waiting_in_line,
      waiting_in_line: updates.waiting_in_line,
      playback: updates.playback,
      ...updates
    };

    // Remove undefined values from payload
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    // Always send "choose" for PBX - we pass the actual playback URL in playback field
    payload.playback_during_paused = "choose";

    console.log(payload, "PBX update extension payload");

    const response = await axiosInstance.put(`/extensions/${hash}`, payload);

    if (response.data.status !== 'updated' && response.data.status !== 'success') {
      throw new Error(response.message || 'Failed to update PBX extension');
    }




    // Update the extension in the master database
    const pbxExtension = await PbxExtension.findOne({ extension_hash: hash });

    if (pbxExtension) {
      const updateFields = {};
      if (updates.name !== undefined) updateFields.name = updates.name;
      if (updates.username !== undefined) updateFields.sip_username = updates.username;
      if (updates.password !== undefined) updateFields.sip_password = updates.password;
      if (updates.internal_extension !== undefined) updateFields.internal_extension = updates.internal_extension;
      if (updates.extensionplan !== undefined) updateFields.extension_plan = updates.extensionplan;
      if (updates.outgoing_calls !== undefined) updateFields.outgoing_calls = updates.outgoing_calls;
      if (updates.inbound_calls !== undefined) updateFields.inbound_calls = updates.inbound_calls;
      if (updates.monitor_enable !== undefined) updateFields.monitor_enable = updates.monitor_enable;
      if (updates.outroute !== undefined) updateFields.outroute = updates.outroute;
      if (updates.codecspriority !== undefined) updateFields.codec_priority = updates.codecspriority;
      if (updates.nat !== undefined) updateFields.nat = updates.nat;
      if (updates.webrtc !== undefined) updateFields.webrtc = updates.webrtc;
      if (updates.waiting_in_line !== undefined) updateFields.waiting_in_line = updates.waiting_in_line;
      if (updates.playback_during_paused !== undefined) updateFields.playback_during_paused = updates.playback_during_paused;
      if (updates.playback !== undefined) updateFields.playback = updates.playback;

      await pbxExtension.updateOne({ $set: updateFields });
    }

    // If tenant DB is provided, also update there
    if (options.db) {
      const TenantPbxExtension = options.db.models.PbxExtension || options.db.model('PbxExtension', PbxExtensionSchema);
      const tenantUpdateFields = {};

      if (updates.name !== undefined) tenantUpdateFields.name = updates.name;
      if (updates.outgoing_calls !== undefined) tenantUpdateFields.outgoing_calls = updates.outgoing_calls;
      if (updates.inbound_calls !== undefined) tenantUpdateFields.inbound_calls = updates.inbound_calls;
      if (updates.monitor_enable !== undefined) tenantUpdateFields.monitor_enable = updates.monitor_enable;
      if (updates.waiting_in_line !== undefined) tenantUpdateFields.waiting_in_line = updates.waiting_in_line;
      if (updates.playback_during_paused !== undefined) tenantUpdateFields.playback_during_paused = updates.playback_during_paused;
      if (updates.playback !== undefined) tenantUpdateFields.playback = updates.playback;

      if (Object.keys(tenantUpdateFields).length > 0) {
        await TenantPbxExtension.updateOne(
          { extension_hash: hash },
          { $set: tenantUpdateFields }
        );
      }
    }

    return response.data;
  } catch (error) {
    console.error('Error updating PBX extension:', error);
    throw error;
  }
};

/**
 * Delete PBX extension
 */
export const deleteExtension = async (hash) => {
  try {
    const masterDB = await getMasterDB();
    const PbxExtension = masterDB.models.PbxExtension || masterDB.model('PbxExtension', PbxExtensionSchema);

    const response = await axiosInstance.delete(`/extensions/${hash}`);

    // Delete the extension from the database
    await PbxExtension.deleteOne({ extension_hash: hash });

    return response.data;
  } catch (error) {
    console.error('Error deleting PBX extension:', error);
    throw error;
  }
};

/**
 * Get PBX extension
 */
export const getExtension = async (hash) => {
  try {
    const masterDB = await getMasterDB();
    const PbxExtension = masterDB.models.PbxExtension || masterDB.model('PbxExtension', PbxExtensionSchema);

    const response = await axiosInstance.get(`/extensions/${hash}`);
    const pbxExtension = await PbxExtension.findOne({ extension_hash: hash }).lean();

    return {
      ...response.data,
      pbxExtension: pbxExtension
    };
  } catch (error) {
    console.error('Error fetching PBX extension:', error);
    throw error;
  }
};

/**
 * Get all PBX extensions
 */
export const getAllExtensions = async () => {
  try {
    const masterDB = await getMasterDB();
    const PbxExtension = masterDB.models.PbxExtension || masterDB.model('PbxExtension', PbxExtensionSchema);

    const response = await axiosInstance.get('/extensions');
    const pbxExtensions = await PbxExtension.find({}).lean();

    return {
      apiResponse: response.data,
      localExtensions: pbxExtensions
    };
  } catch (error) {
    console.error('Error fetching all PBX extensions:', error);
    throw error;
  }
};

// ========== GROUP SERVICES ==========

/**
 * Create PBX group
 */
export const createGroup = async (groupData) => {
  try {
    // Helper function to convert array to comma-separated string
    const arrayToString = (value) => {
      if (Array.isArray(value)) {
        return value.join(',');
      }
      return value || '';
    };

    // Helper function to ensure boolean values are properly formatted
    const formatBoolean = (value) => {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
      }
      return Boolean(value);
    };

    const payload = {
      group_name: groupData.group_name,
      group_id: groupData.group_id,
      assigned_operators: arrayToString(groupData.assigned_operators),
      exception_outbound_numbers: arrayToString(groupData.exception_outbound_numbers),
      allow_calls_waiting_in_line: formatBoolean(groupData.allow_calls_waiting_in_line),
      incoming_calls_waiting_options: groupData.incoming_calls_waiting_options || '',
      incoming_routing_strategy: groupData.incoming_routing_strategy || '',
      music_on_hold: formatBoolean(groupData.music_on_hold),
      outbound_phone_numbers: arrayToString(groupData.outbound_phone_numbers),
      primary_outbound_number: groupData.primary_outbound_number || '',
      redirect_to_occupied_operators: formatBoolean(groupData.redirect_to_occupied_operators),
      time_to_ring_operator: String(groupData.time_to_ring_operator || ''),
      music_file_url: groupData.music_file_url || ''
    };

    console.log('PBX Group payload:', payload);

    const response = await axiosInstance.post('/groups', payload);
    return response.data;
  } catch (error) {
    console.error('Error creating PBX group:', error);
    throw error;
  }
};

/**
 * Update PBX group
 */
export const updateGroup = async (hash, updates) => {
  try {
    // Helper function to convert array to comma-separated string
    const arrayToString = (value) => {
      if (Array.isArray(value)) {
        return value.join(',');
      }
      return value || '';
    };

    // Helper function to ensure boolean values are properly formatted
    const formatBoolean = (value) => {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
      }
      return Boolean(value);
    };

    // Process the updates to ensure proper formatting
    const formattedUpdates = {};

    Object.keys(updates).forEach(key => {
      const value = updates[key];

      switch (key) {
        case 'assigned_operators':
        case 'exception_outbound_numbers':
        case 'outbound_phone_numbers':
          formattedUpdates[key] = arrayToString(value);
          break;
        case 'music_on_hold':
        case 'redirect_to_occupied_operators':
        case 'allow_calls_waiting_in_line':
          formattedUpdates[key] = formatBoolean(value);
          break;
        case 'time_to_ring_operator':
        case 'group_id':
          formattedUpdates[key] = String(value);
          break;
        case 'music_file_url':
          formattedUpdates[key] = value || '';
          break;
        default:
          formattedUpdates[key] = value || '';
          break;
      }
    });

    console.log('PBX Update Group payload:', formattedUpdates);

    const response = await axiosInstance.put(`/groups/${hash}`, formattedUpdates);

    console.log("PBX Updated Group Response", response.data);

    return response.data;
  } catch (error) {
    console.error('Error updating PBX group:', error);
    throw error;
  }
};

/**
 * Delete PBX group
 */
export const deleteGroup = async (hash) => {
  try {
    const response = await axiosInstance.delete(`/groups/${hash}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting PBX group:', error);
    throw error;
  }
};

/**
 * Get PBX group
 */
export const getGroup = async (hash) => {
  try {
    const response = await axiosInstance.get(`/groups/${hash}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching PBX group:', error);
    throw error;
  }
};

/**
 * Get all PBX groups
 */
export const getAllGroups = async () => {
  try {
    const response = await axiosInstance.get('/groups');
    return response.data;
  } catch (error) {
    console.error('Error fetching all PBX groups:', error);
    throw error;
  }
};

// ========== ROUTING SERVICES ==========

/**
 * Create PBX routing
 */
export const createRouting = async (routingData) => {
  try {
    const payload = routingData;
    console.log(payload, "PBX create routing payload");

    const response = await axiosInstance.post('/routing', payload);
    return response.data;
  } catch (error) {
    console.error('Error creating PBX routing:', error);
    throw error;
  }
};

/**
 * Update PBX routing
 */
export const updateRouting = async (hash, updates) => {
  try {
    const payload = updates;
    console.log(payload, "PBX update routing payload");

    const response = await axiosInstance.put(`/routing/${hash}`, payload);
    return response.data;
  } catch (error) {
    console.error('Error updating PBX routing:', error);
    throw error;
  }
};

/**
 * Delete PBX routing
 */
export const deleteRouting = async (hash) => {
  try {
    const response = await axiosInstance.delete(`/routing/${hash}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting PBX routing:', error);
    throw error;
  }
};

/**
 * Get PBX routing
 */
export const getRouting = async (hash) => {
  try {
    const response = await axiosInstance.get(`/routing/${hash}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching PBX routing:', error);
    throw error;
  }
};

/**
 * Get all PBX routing
 */
export const getAllRouting = async () => {
  try {
    const response = await axiosInstance.get('/routing');
    return response.data;
  } catch (error) {
    console.error('Error fetching all PBX routing:', error);
    throw error;
  }
};

// ========== AUDIO FILE SERVICES ==========

/**
 * Upload audio file to PBX
 */
export const uploadAudioFile = async (audioFile, directory = null) => {
  try {
    const formData = new FormData();
    formData.append('audio', audioFile.buffer, {
      filename: audioFile.originalname,
      contentType: audioFile.mimetype
    });

    if (directory) {
      formData.append('directory', directory);
    }

    const response = await axios({
      method: 'post',
      url: `${apiUrl}/audio`,
      data: formData,
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        ...formData.getHeaders()
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading audio file:', error);
    throw error;
  }
};

/**
 * Delete audio file from PBX
 */
export const deleteAudioFile = async (fileHash) => {
  try {
    const response = await axiosInstance.delete(`/audio/${fileHash}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting audio file:', error);
    throw error;
  }
};

/**
 * Download audio file from PBX
 */
export const downloadAudioFile = async (fileHash) => {
  try {
    const response = await axiosInstance.get(`/audio/${fileHash}/download`, {
      responseType: 'stream'
    });
    return response.data;
  } catch (error) {
    console.error('Error downloading audio file:', error);
    throw error;
  }
};

// ========== SYSTEM SERVICES ==========

/**
 * Get PBX status
 */
export const getPbxStatus = async () => {
  try {
    const response = await axiosInstance.get('/status');
    return response.data;
  } catch (error) {
    console.error('Error fetching PBX status:', error);
    throw error;
  }
};

/**
 * Register IP address with PBX
 */
export const registerIp = async (ip) => {
  try {
    if (!ip) throw new Error("IP address is required for registration.");

    const payload = { address: ip };
    console.log(`Registering IP: ${ip}`, payload);

    const response = await axiosInstance.post('/access', payload);

    return response.data;
  } catch (error) {
    console.error(
      `Failed to register IP "${ip}": ${error.response?.data?.status || error.message}`
    );

    throw new Error(
      `Could not register IP "${ip}". ${error.response?.data?.status || "Please check IP format."}`
    );
  }
};

/**
 * Unregister IP address from PBX
 */
export const unRegisterIp = async (ip) => {
  try {
    if (!ip) throw new Error("IP address is required for unregistration.");

    const payload = { address: ip };
    console.log(`Unregistering IP: ${ip}`, payload);

    const response = await axiosInstance.delete('/access', { data: payload });

    return response.data;
  } catch (error) {
    console.error(
      `Failed to unregister IP "${ip}": ${error.response?.data?.status || error.message}`
    );

    throw new Error(
      `Could not unregister IP "${ip}". ${error.response?.data?.status || "Please check IP format."}`
    );
  }
};

// Export all services as a single object
export const pbxService = {
  // Extension Services
  createExtension,
  updateExtension,
  deleteExtension,
  getExtension,
  getAllExtensions,

  // Group Services
  createGroup,
  updateGroup,
  deleteGroup,
  getGroup,
  getAllGroups,

  // Routing Services
  createRouting,
  updateRouting,
  deleteRouting,
  getRouting,
  getAllRouting,

  // Audio File Services
  uploadAudioFile,
  deleteAudioFile,
  downloadAudioFile,

  // System Services
  getPbxStatus,
  registerIp,
  unRegisterIp
};
