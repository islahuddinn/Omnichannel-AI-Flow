// src/services/system/SystemService.js
import { getMasterDB } from '../../config/database.js';
import SystemSettingsSchema from '../../models/schemas/SystemSettings.js';
import SystemLogSchema from '../../models/schemas/SystemLog.js';
import redisClient from '../../config/redis.js';
import mongoose from 'mongoose';

class SystemService {
  constructor() {
    this.initialized = false;
  }

  async initModels() {
    if (this.initialized) return;
    
    const masterDB = await getMasterDB();
    this.SystemSettings = masterDB.models.SystemSettings || masterDB.model('SystemSettings', SystemSettingsSchema);
    this.SystemLog = masterDB.models.SystemLog || masterDB.model('SystemLog', SystemLogSchema);
    
    this.initialized = true;
  }

  async getSystemSettings() {
    try {
      await this.initModels();
      let settings = await this.SystemSettings.findOne();
      
      if (!settings) {
        // Create default settings
        settings = await this.SystemSettings.create({
          maintenance: {
            enabled: false,
            message: ''
          },
          limits: {
            maxCompanies: 1000,
            maxUsersPerCompany: 100,
            maxChannelsPerCompany: 10,
            maxMessagesPerDay: 1000000,
            maxFileSize: 10 * 1024 * 1024 // 10MB
          },
          email: {
            fromName: 'OmniConnect',
            fromEmail: 'noreply@omniconnect.com',
            supportEmail: 'support@omniconnect.com'
          },
          security: {
            passwordMinLength: 8,
            passwordRequireUppercase: true,
            passwordRequireLowercase: true,
            passwordRequireNumbers: true,
            passwordRequireSpecialChars: false,
            sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
            maxLoginAttempts: 5,
            lockoutDuration: 30 * 60 * 1000 // 30 minutes
          },
          features: {
            enableSignup: false,
            enableGoogleAuth: false,
            enableTwoFactor: false,
            enableAPIAccess: true,
            enableWebhooks: true
          }
        });
      }

      return settings;
    } catch (error) {
      throw error;
    }
  }

  async updateSystemSettings(updates) {
    try {
      await this.initModels();
      const settings = await this.SystemSettings.findOneAndUpdate(
        {},
        { ...updates, updatedAt: Date.now() },
        { new: true, upsert: true }
      );

      // Clear cache
      await redisClient.del('system:settings');

      return settings;
    } catch (error) {
      throw error;
    }
  }

  async getSystemLogs(options = {}) {
    try {
      await this.initModels();
      const {
        page = 1,
        limit = 50,
        level,
        search,
        startDate,
        endDate
      } = options;

      const query = {};

      if (level) {
        query.level = level;
      }

      if (search) {
        query.$or = [
          { message: { $regex: search, $options: 'i' } },
          { metadata: { $regex: search, $options: 'i' } }
        ];
      }

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const skip = (page - 1) * limit;

      const [logs, total] = await Promise.all([
        this.SystemLog.find(query)
          .sort('-timestamp')
          .skip(skip)
          .limit(limit)
          .lean(),
        this.SystemLog.countDocuments(query)
      ]);

      return {
        logs,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw error;
    }
  }

  async logSystemEvent(level, message, metadata = {}) {
    try {
      await this.initModels();
      await this.SystemLog.create({
        level,
        message,
        metadata,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to log system event:', error);
    }
  }

  async getSystemHealth() {
    try {
      const [
        dbStatus,
        redisStatus,
        diskSpace,
        memoryUsage,
        cpuUsage
      ] = await Promise.all([
        this.checkDatabaseHealth(),
        this.checkRedisHealth(),
        this.checkDiskSpace(),
        this.checkMemoryUsage(),
        this.checkCPUUsage()
      ]);

      return {
        status: 'healthy',
        checks: {
          database: dbStatus,
          redis: redisStatus,
          disk: diskSpace,
          memory: memoryUsage,
          cpu: cpuUsage
        },
        timestamp: new Date()
      };
    } catch (error) {
      throw error;
    }
  }

  async checkDatabaseHealth() {
    try {
      const adminDb = mongoose.connection.db.admin();
      const result = await adminDb.ping();
      return { status: 'healthy', responseTime: result.ok };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  async checkRedisHealth() {
    try {
      const start = Date.now();
      await redisClient.ping();
      const responseTime = Date.now() - start;
      return { status: 'healthy', responseTime };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  async checkDiskSpace() {
    // Implement disk space check
    return { status: 'healthy', usage: '45%', available: '55GB' };
  }

  async checkMemoryUsage() {
    const used = process.memoryUsage();
    return {
      status: 'healthy',
      rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`
    };
  }

  async checkCPUUsage() {
    // Implement CPU usage check
    return { status: 'healthy', usage: '25%' };
  }

  async listBackups() {
    // Implement backup listing
    return [
      {
        id: '1',
        name: 'backup_2024_01_15',
        size: '2.5GB',
        date: new Date('2024-01-15'),
        status: 'completed'
      }
    ];
  }

  async createBackup(options = {}) {
    // Implement backup creation
    return {
      id: Date.now().toString(),
      name: `backup_${Date.now()}`,
      status: 'in_progress',
      startedAt: new Date()
    };
  }

  async restoreBackup(backupId) {
    // Implement backup restoration
    return {
      success: true,
      message: 'Backup restoration started'
    };
  }
}

export default new SystemService();