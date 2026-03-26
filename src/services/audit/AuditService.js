// src/services/audit/AuditService.js
import { getMasterDB } from '../../config/database.js';
import AuditLogSchema from '../../models/schemas/AuditLog.js';
import UserSchema from '../../models/schemas/User.js';
import CompanySchema from '../../models/schemas/Company.js';

class AuditService {
  /**
   * Get the AuditLog model from master database
   */
  async getAuditLogModel() {
    const masterDB = await getMasterDB();
    return masterDB.models.AuditLog || masterDB.model('AuditLog', AuditLogSchema);
  }

  /**
   * Create an audit log entry
   */
  async log({
    action,
    actor,
    companyId = null,
    resourceType,
    resourceId = null,
    changes = {},
    metadata = {},
    status = 'success',
    errorMessage = null,
    errorStack = null
  }) {
    try {
      const AuditLog = await this.getAuditLogModel();
      
      // Get actor details if actor ID is provided
      let actorDetails = {};
      let companyName = null;
      
      if (actor) {
        const masterDB = await getMasterDB();
        const User = masterDB.models.User || masterDB.model('User', UserSchema);
        const user = await User.findById(actor).select('email firstName lastName role').lean();
        if (user) {
          actorDetails = {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
          };
        }
      }
      
      // Get company name if companyId is provided
      if (companyId) {
        const masterDB = await getMasterDB();
        const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
        const company = await Company.findById(companyId).select('name').lean();
        if (company) {
          companyName = company.name;
        }
      }
      
      const auditLog = await AuditLog.create({
        action,
        actor,
        actorDetails,
        companyId,
        companyName,
        resourceType,
        resourceId,
        changes,
        metadata,
        status,
        errorMessage,
        errorStack,
        timestamp: new Date()
      });
      
      return auditLog;
    } catch (error) {
      console.error('Error creating audit log:', error);
      // Don't throw - audit logging should not break the main flow
      return null;
    }
  }

  /**
   * Get audit logs with filters
   */
  async getLogs({
    companyId = null,
    actor = null,
    action = null,
    resourceType = null,
    resourceId = null,
    status = null,
    startDate = null,
    endDate = null,
    ipAddress = null,
    page = 1,
    limit = 50,
    sortBy = 'timestamp',
    sortOrder = 'desc'
  }) {
    try {
      const AuditLog = await this.getAuditLogModel();
      
      // Build query
      const query = {};
      
      if (companyId) {
        query.companyId = companyId;
      }
      
      if (actor) {
        query.actor = actor;
      }
      
      if (action) {
        query.action = action;
      }
      
      if (resourceType) {
        query.resourceType = resourceType;
      }
      
      if (resourceId) {
        query.resourceId = resourceId;
      }
      
      if (status) {
        query.status = status;
      }
      
      if (ipAddress) {
        query['metadata.ipAddress'] = ipAddress;
      }
      
      // Date range filter
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
          query.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          query.timestamp.$lte = new Date(endDate);
        }
      }
      
      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
      
      // Execute query
      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments(query)
      ]);
      
      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      throw error;
    }
  }

  /**
   * Get user activity logs
   */
  async getUserActivityLogs(userId, { page = 1, limit = 50 } = {}) {
    return this.getLogs({
      actor: userId,
      page,
      limit
    });
  }

  /**
   * Get failed login attempts
   */
  async getFailedLoginAttempts({
    companyId = null,
    startDate = null,
    endDate = null,
    ipAddress = null,
    page = 1,
    limit = 50
  } = {}) {
    return this.getLogs({
      action: 'user.login_failed',
      companyId,
      status: 'failure',
      startDate,
      endDate,
      ipAddress,
      page,
      limit
    });
  }

  /**
   * Get API access logs
   */
  async getApiAccessLogs({
    companyId = null,
    endpoint = null,
    method = null,
    statusCode = null,
    startDate = null,
    endDate = null,
    page = 1,
    limit = 50
  } = {}) {
    try {
      const AuditLog = await this.getAuditLogModel();
      
      const query = {
        action: 'api.access',
        resourceType: 'api'
      };
      
      if (companyId) query.companyId = companyId;
      if (endpoint) query['metadata.endpoint'] = { $regex: endpoint, $options: 'i' };
      if (method) query['metadata.method'] = method;
      if (statusCode) query['metadata.statusCode'] = statusCode;
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }
      
      const skip = (page - 1) * limit;
      
      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments(query)
      ]);
      
      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching API access logs:', error);
      throw error;
    }
  }

  /**
   * Get data change history for a specific resource
   */
  async getDataChangeHistory(resourceType, resourceId, { page = 1, limit = 50 } = {}) {
    return this.getLogs({
      resourceType,
      resourceId,
      action: { $in: [`${resourceType}.created`, `${resourceType}.updated`, `${resourceType}.deleted`] },
      page,
      limit
    });
  }

  /**
   * Export logs to CSV format
   */
  async exportLogsToCSV(filters = {}) {
    try {
      const { logs } = await this.getLogs({ ...filters, limit: 10000 });
      
      const headers = [
        'Timestamp',
        'Action',
        'Actor Email',
        'Actor Name',
        'Company',
        'Resource Type',
        'Resource ID',
        'Status',
        'IP Address',
        'User Agent',
        'Endpoint',
        'Method',
        'Status Code',
        'Error Message'
      ];
      
      const rows = logs.map(log => [
        log.timestamp?.toISOString() || '',
        log.action || '',
        log.actorDetails?.email || '',
        `${log.actorDetails?.firstName || ''} ${log.actorDetails?.lastName || ''}`.trim(),
        log.companyName || '',
        log.resourceType || '',
        log.resourceId?.toString() || '',
        log.status || '',
        log.metadata?.ipAddress || '',
        log.metadata?.userAgent || '',
        log.metadata?.endpoint || '',
        log.metadata?.method || '',
        log.metadata?.statusCode || '',
        log.errorMessage || ''
      ]);
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      
      return csvContent;
    } catch (error) {
      console.error('Error exporting logs to CSV:', error);
      throw error;
    }
  }

  /**
   * Export logs to JSON format
   */
  async exportLogsToJSON(filters = {}) {
    try {
      const { logs } = await this.getLogs({ ...filters, limit: 10000 });
      return JSON.stringify(logs, null, 2);
    } catch (error) {
      console.error('Error exporting logs to JSON:', error);
      throw error;
    }
  }

  /**
   * Get statistics for audit logs
   */
  async getStatistics({
    companyId = null,
    startDate = null,
    endDate = null
  } = {}) {
    try {
      const AuditLog = await this.getAuditLogModel();
      
      const query = {};
      if (companyId) query.companyId = companyId;
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }
      
      const [
        totalLogs,
        successLogs,
        failureLogs,
        actionCounts,
        topActors,
        topCompanies
      ] = await Promise.all([
        AuditLog.countDocuments(query),
        AuditLog.countDocuments({ ...query, status: 'success' }),
        AuditLog.countDocuments({ ...query, status: 'failure' }),
        AuditLog.aggregate([
          { $match: query },
          { $group: { _id: '$action', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]),
        AuditLog.aggregate([
          { $match: query },
          { $group: { _id: '$actor', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]),
        AuditLog.aggregate([
          { $match: { ...query, companyId: { $exists: true, $ne: null } } },
          { $group: { _id: '$companyId', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ])
      ]);
      
      return {
        total: totalLogs,
        success: successLogs,
        failure: failureLogs,
        actionCounts,
        topActors,
        topCompanies
      };
    } catch (error) {
      console.error('Error getting audit log statistics:', error);
      throw error;
    }
  }
}

export default new AuditService();

