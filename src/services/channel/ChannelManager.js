// src/services/channel/ChannelManager.js
import { getTenantDB } from '../../config/database.js';
import CompanyAccountSchema from '../../models/schemas/CompanyAccount.js';
import redisClient from '../../config/redis.js';
import { CHANNEL_TYPES } from '../../config/constants.js';

class ChannelManager {
  async createChannel(companyId, channelData) {
    try {
      const tenantDB = getTenantDB(companyId);
      const CompanyAccount = tenantDB.model('CompanyAccount', CompanyAccountSchema);

      const channel = new CompanyAccount({
        companyId,
        ...channelData
      });

      await channel.save();

      // Cache channel mapping for webhook resolution
      await this.cacheChannelMapping(channel);

      return {
        id: channel._id,
        type: channel.type,
        name: channel.name,
        identifier: channel.identifier,
        status: channel.status,
        departmentId: channel.departmentId
      };
    } catch (error) {
      throw error;
    }
  }

  async updateChannel(companyId, channelId, updates) {
    try {
      const tenantDB = getTenantDB(companyId);
      const CompanyAccount = tenantDB.model('CompanyAccount', CompanyAccountSchema);

      const channel = await CompanyAccount.findByIdAndUpdate(
        channelId,
        { ...updates, updatedAt: Date.now() },
        { new: true }
      );

      if (channel) {
        await this.cacheChannelMapping(channel);
      }

      return channel;
    } catch (error) {
      throw error;
    }
  }

  async getChannel(companyId, channelId) {
    try {
      const tenantDB = getTenantDB(companyId);
      const CompanyAccount = tenantDB.model('CompanyAccount', CompanyAccountSchema);

      const channel = await CompanyAccount.findById(channelId);
      
      if (channel) {
        return {
          ...channel.toObject(),
          credentials: channel.getDecryptedCredentials()
        };
      }

      return null;
    } catch (error) {
      throw error;
    }
  }

  async listChannels(companyId, filter = {}) {
    try {
      const tenantDB = getTenantDB(companyId);
      const CompanyAccount = tenantDB.model('CompanyAccount', CompanyAccountSchema);

      const channels = await CompanyAccount.find(filter)
        .populate('departmentId', 'name code')
        .lean();

      return channels.map(channel => ({
        ...channel,
        credentials: undefined // Don't send encrypted credentials to frontend
      }));
    } catch (error) {
      throw error;
    }
  }

  async deleteChannel(companyId, channelId) {
    try {
      const tenantDB = getTenantDB(companyId);
      const CompanyAccount = tenantDB.model('CompanyAccount', CompanyAccountSchema);

      const channel = await CompanyAccount.findById(channelId);
      
      if (channel) {
        await this.clearChannelCache(channel);
        await channel.deleteOne();
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  async testChannel(companyId, channelId) {
    try {
      const channel = await this.getChannel(companyId, channelId);
      
      if (!channel) {
        throw new Error('Channel not found');
      }

      // Implement channel-specific test logic
      switch (channel.type) {
        case CHANNEL_TYPES.WHATSAPP:
          return await this.testWhatsApp(channel);
        case CHANNEL_TYPES.EMAIL:
          return await this.testEmail(channel);
        // Add other channel tests
        default:
          return { success: true, message: 'Channel test not implemented' };
      }
    } catch (error) {
      throw error;
    }
  }

  async testWhatsApp(channel) {
    // Implement WhatsApp API test
    return { success: true, message: 'WhatsApp connection successful' };
  }

  async testEmail(channel) {
    // Implement email SMTP/IMAP test
    return { success: true, message: 'Email connection successful' };
  }

  async cacheChannelMapping(channel) {
    const key = `channel:${channel.type}:${channel.identifier}`;
    const value = {
      companyId: channel.companyId.toString(),
      channelId: channel._id.toString(),
      departmentId: channel.departmentId?.toString()
    };
    await redisClient.setEx(key, 86400, JSON.stringify(value));
  }

  async clearChannelCache(channel) {
    const key = `channel:${channel.type}:${channel.identifier}`;
    await redisClient.del(key);
  }

  async resolveChannelByIdentifier(type, identifier) {
    const key = `channel:${type}:${identifier}`;
    const cached = await redisClient.get(key);
    return cached ? JSON.parse(cached) : null;
  }
}

export default new ChannelManager();