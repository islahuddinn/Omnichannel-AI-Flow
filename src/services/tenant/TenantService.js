
// src/services/tenant/TenantService.js
import mongoose from 'mongoose';
import { getMasterDB, getTenantDB } from '../../config/database.js';
import CompanySchema from '../../models/schemas/Company.js';
import UserSchema from '../../models/schemas/User.js';
import DepartmentSchema from '../../models/schemas/Department.js';
import CompanyAccountSchema from '../../models/schemas/CompanyAccount.js';
import redisClient from '../../config/redis.js';
import { ROLES } from '../../config/constants.js';
import { getRedisClient } from '../../config/redis.js';

class TenantService {
  constructor() {
    this.initialized = false;
  }

  async initModels() {
    if (this.initialized) return;

    const masterDB = await getMasterDB();

    // ✅ FIX: use existing models if already compiled
    this.Company =
      masterDB.models.Company || masterDB.model('Company', CompanySchema);

    this.User =
      masterDB.models.User || masterDB.model('User', UserSchema);

    this.initialized = true;
  }

async createCompany(data, createdBy) {
  await this.initModels();

  let session = null;
  let supportsTransactions = false;
  let transactionCommitted = false; // ✅ Track if transaction was committed

  try {
    const masterDB = await getMasterDB();

    const serverStatus = await masterDB.db.admin().serverStatus();
    if (serverStatus.repl || serverStatus.process === 'mongos') {
      supportsTransactions = true;
    }

    if (supportsTransactions) {
      session = await mongoose.startSession();
      session.startTransaction();
    }

    // Check if email already exists
    const existingUser = await this.User.findOne({ 
      email: data.adminEmail.toLowerCase() 
    });
    if (existingUser) {
      throw new Error('Admin email already exists');
    }

    // Generate slug
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // ✅ Create company with explicit timestamps
    const now = new Date().toISOString();

    const company = new this.Company({
      name: data.name,
      slug: `${slug}-${Date.now()}`,
      status: 'active',
      subscription: data.subscription || {
        plan: 'trial',
        status: 'active',
        startDate: new Date(),
        limits: {
          maxUsers: 5,
          maxConversations: 1000,
          maxChannels: 3,
        },
      },
      createdBy,
      createdAt: now,
      updatedAt: now, // ensure updatedAt also present
    });

    await company.save(supportsTransactions ? { session } : undefined);

    const tenantDatabaseName = `tenant_${company._id.toString()}`;
    company.tenantDatabaseName = tenantDatabaseName;
    await company.save(supportsTransactions ? { session } : undefined);

    const adminUser = new this.User({
      email: data.adminEmail.toLowerCase(),
      password: data.adminPassword,
      firstName: data.adminFirstName,
      lastName: data.adminLastName,
      phone: data.adminPhone || '',
      role: ROLES.COMPANY_ADMIN,
      companyId: company._id,
      tenantDatabaseName: tenantDatabaseName,
      status: 'active',
      emailVerified: true,
      permissions: {
        canCreateUsers: true,
        canDeleteUsers: true,
        canManageChannels: true,
        canManageDepartments: true,
        canDeleteConversations: true,
        canTransferConversations: true,
        canMergeConversations: true,
        canUnmergeConversations: true,
        canExportData: true,
        canViewAnalytics: true,
      },
      createdBy,
    });

    await adminUser.save(supportsTransactions ? { session } : undefined);

    company.ownerId = adminUser._id;
    await company.save(supportsTransactions ? { session } : undefined);

    // ✅ Commit transaction BEFORE tenant database operations
    // Tenant database operations are separate and don't need to be in the same transaction
    if (supportsTransactions && session) {
      await session.commitTransaction();
      transactionCommitted = true; // ✅ Mark as committed
    }

    // ✅ Initialize tenant database AFTER transaction commit
    // This is safe because tenant DB operations are independent
    await this.initializeTenantDatabase(company._id.toString());

    const tenantDB = await getTenantDB(company._id.toString());
    const Department =
      tenantDB.models.Department ||
      tenantDB.model('Department', DepartmentSchema);

    const defaultDepartment = new Department({
      companyId: company._id,
      name: 'General',
      code: 'GEN',
      description: 'Default department',
      manager: adminUser._id,
      agents: [adminUser._id],
      isActive: true,
    });
    // ✅ Don't use session for tenant DB operations (they're in a different database)
    await defaultDepartment.save();

    // ✅ Cache + normalize before returning
    const plainCompany = company.toObject();
    plainCompany.createdAt = plainCompany.createdAt
      ? new Date(plainCompany.createdAt).toISOString()
      : now;
    plainCompany.updatedAt = plainCompany.updatedAt
      ? new Date(plainCompany.updatedAt).toISOString()
      : now;

    try {
      await this.cacheCompanyData(company._id.toString(), {
        id: company._id.toString(),
        name: company.name,
        slug: company.slug,
        tenantDatabaseName: company.tenantDatabaseName,
        status: company.status,
        subscription: company.subscription,
        createdAt: plainCompany.createdAt,
      });
    } catch (cacheError) {
      console.warn('⚠️ Failed to cache company data:', cacheError.message);
    }

    // ✅ Always return normalized dates to API
    return {
      company: plainCompany,
      adminUser: {
        id: adminUser._id,
        email: adminUser.email,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        role: adminUser.role,
      },
    };
  } catch (error) {
    // ✅ Only abort transaction if it hasn't been committed yet
    if (session && supportsTransactions && !transactionCommitted) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        // Ignore abort errors (transaction might already be aborted)
        console.warn('⚠️ Error aborting transaction:', abortError.message);
      }
    }

    if (error.code === 11000) {
      if (error.message.includes('email')) {
        throw new Error('Admin email already exists');
      }
      if (error.message.includes('slug')) {
        throw new Error('Company name already exists');
      }
      throw new Error('Duplicate entry found');
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      throw new Error(messages.join(', '));
    }

    throw new Error(error.message || 'Failed to create company');
  } finally {
    if (session) {
      try {
        session.endSession();
      } catch (endError) {
        // Ignore errors when ending session
        console.warn('⚠️ Error ending session:', endError.message);
      }
    }
  }
}



  async initializeTenantDatabase(companyId) {
    try {
      // ✅ CRITICAL: Check if tenant database has already been initialized
      // This prevents duplicate initialization if called multiple times
      const masterDB = await getMasterDB();
      const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
      
      const company = await Company.findById(companyId).select('tenantDatabaseInitialized').lean();
      
      if (!company) {
        throw new Error(`Company ${companyId} not found`);
      }
      
      // ✅ If already initialized, skip and return success
      if (company.tenantDatabaseInitialized === true) {
        console.log(`ℹ️ Tenant database for company ${companyId} already initialized, skipping...`);
        return { alreadyInitialized: true, success: true };
      }
      
      // ✅ Additional check: Verify if collections already exist in tenant database
      const tenantDB = await getTenantDB(companyId);
      const existingCollections = await tenantDB.db.listCollections().toArray();
      const collectionNames = existingCollections.map(c => c.name);
      
      // Check if key collections already exist (departments is always created first)
      if (collectionNames.includes('departments') && collectionNames.includes('conversations')) {
        console.log(`ℹ️ Tenant database for company ${companyId} already has collections, marking as initialized...`);
        // Update flag in company document
        await Company.findByIdAndUpdate(companyId, { 
          tenantDatabaseInitialized: true 
        });
        return { alreadyInitialized: true, success: true };
      }

      console.log(`🔄 Initializing tenant database for company ${companyId}...`);

      // Create collections with indexes
      const collections = [
        'departments',
        'companyaccounts',
        'contacts',
        'conversations',
        'messages',
        'tags',
        'auditlogs',
        // Call Center collections
        'audiofiles',
        'callgroups',
        'callgroupusers',
        'calllogs',
        'callroutes',
        'callstatustabs',
        'phonenumbers',
        'pbxextensions',
        'statushistories',
        'queues',
      ];

      for (const collection of collections) {
        await tenantDB.createCollection(collection).catch(() => {});
      }

      await this.createTenantIndexes(tenantDB);
      
      // ✅ Mark tenant database as initialized in company document
      await Company.findByIdAndUpdate(companyId, { 
        tenantDatabaseInitialized: true 
      });
      
      console.log(`✅ Tenant database initialized successfully for company ${companyId}`);
      return { success: true, initialized: true };
    } catch (error) {
      console.error('Failed to initialize tenant database:', error);
      throw error;
    }
  }

  async createTenantIndexes(tenantDB) {
    await tenantDB.collection('departments').createIndex({ companyId: 1 });
    // ✅ Use sparse: true to allow multiple null values (indexes only non-null values)
    await tenantDB
      .collection('departments')
      .createIndex({ code: 1, companyId: 1 }, { unique: true, sparse: true });

    await tenantDB
      .collection('companyaccounts')
      .createIndex({ companyId: 1, type: 1 });
    await tenantDB
      .collection('companyaccounts')
      .createIndex({ identifier: 1, type: 1 });

    await tenantDB.collection('contacts').createIndex({ companyId: 1 });
    // ✅ Unique compound index on SF_id + companyId to prevent duplicates
    await tenantDB.collection('contacts').createIndex(
      { SF_id: 1, companyId: 1 }, 
      { unique: true, sparse: true }
    );
    // ❌ REMOVED: Mongoose Contact schema already defines these indexes
    // await tenantDB.collection('contacts').createIndex({ phone: 1 });
    // await tenantDB.collection('contacts').createIndex({ email: 1 });

    await tenantDB.collection('conversations').createIndex({ companyId: 1 });
    await tenantDB.collection('conversations').createIndex({ status: 1 });
    await tenantDB.collection('conversations').createIndex({ assignedTo: 1 });
    await tenantDB.collection('conversations').createIndex({ updatedAt: -1 });

    await tenantDB.collection('messages').createIndex({ conversationId: 1 });
    await tenantDB.collection('messages').createIndex({ createdAt: -1 });
    await tenantDB.collection('messages').createIndex({ status: 1 });

    await tenantDB.collection('auditlogs').createIndex({ companyId: 1 });
    await tenantDB.collection('auditlogs').createIndex({ userId: 1 });
    await tenantDB.collection('auditlogs').createIndex({ createdAt: -1 });

    // Queues collection indexes
    await tenantDB.collection('queues').createIndex({ action: 1, status: 1, perform_at: 1 });
    await tenantDB.collection('queues').createIndex({ tenantId: 1, status: 1 });
    await tenantDB.collection('queues').createIndex({ createdAt: -1 });
  }

  async getCompany(companyId) {
    await this.initModels();
    
    // ✅ Fetch company with populated fields (including phone)
    const company = await this.Company.findById(companyId)
      .populate('createdBy', 'firstName lastName email role phone')
      .populate('ownerId', 'firstName lastName email role phone')
      .lean();

    if (!company) {
      return null;
    }

    // ✅ Get full admin user data (including phone) if populated user is just an ID
    let adminUserFull = null;
    const adminUserId = company.ownerId?._id || company.ownerId || company.createdBy?._id || company.createdBy;
    
    if (adminUserId) {
      try {
        // If ownerId/createdBy is already populated, use it; otherwise fetch full user
        if (typeof adminUserId === 'object' && adminUserId.firstName) {
          adminUserFull = adminUserId;
        } else {
          adminUserFull = await this.User.findById(adminUserId)
            .select('firstName lastName email role phone')
            .lean();
        }
      } catch (error) {
        console.warn(`⚠️ Could not fetch admin user for company ${companyId}:`, error.message);
      }
    }

    // ✅ Use populated admin user or fetched full user
    const adminUser = adminUserFull || company.ownerId || company.createdBy;

    // ✅ Get metadata (user, message, conversation counts)
    let metadata = {
      totalUsers: 0,
      totalMessages: 0,
      totalConversations: 0,
      activeUsers: 0,
    };

    try {
      // Get user count from master DB
      const [totalUsers, activeUsers] = await Promise.all([
        this.User.countDocuments({ companyId: company._id }),
        this.User.countDocuments({ 
          companyId: company._id,
          status: 'active'
        }),
      ]);

      metadata.totalUsers = totalUsers;
      metadata.activeUsers = activeUsers;

      // Get message and conversation counts from tenant DB
      try {
        const tenantDB = await getTenantDB(companyId.toString());
        [metadata.totalMessages, metadata.totalConversations] = await Promise.all([
          tenantDB.collection('messages').countDocuments().catch(() => 0),
          tenantDB.collection('conversations').countDocuments().catch(() => 0),
        ]);
      } catch (tenantError) {
        console.warn(`⚠️ Could not fetch tenant metrics for company ${companyId}:`, tenantError.message);
      }
    } catch (error) {
      console.warn(`⚠️ Error fetching metadata for company ${companyId}:`, error.message);
    }

    // ✅ Ensure subscription limits are properly formatted
    const subscription = {
      plan: company.subscription?.plan || 'trial',
      status: company.subscription?.status || company.status || 'active',
      startDate: company.subscription?.startDate || company.createdAt,
      endDate: company.subscription?.endDate || null,
      limits: {
        maxUsers: company.subscription?.limits?.maxUsers || 5,
        maxConversations: company.subscription?.limits?.maxConversations || 1000,
        maxChannels: company.subscription?.limits?.maxChannels || 3,
        maxMessages: company.subscription?.limits?.maxMessages || null,
      },
    };

    // ✅ Ensure settings are properly formatted
    const settings = {
      timezone: company.settings?.timezone || 'UTC',
      language: company.settings?.language || 'en',
      dateFormat: company.settings?.dateFormat || 'YYYY-MM-DD',
      timeFormat: company.settings?.timeFormat || '12h',
      currency: company.settings?.currency || 'USD',
    };

    // ✅ Ensure branding is properly formatted
    const branding = {
      logo: company.branding?.logo || null,
      primaryColor: company.branding?.primaryColor || '#4f46e5',
      secondaryColor: company.branding?.accentColor || company.branding?.secondaryColor || '#6366f1',
    };

    // ✅ Get phone from company or admin user
    const phone = company.phone || adminUser?.phone || null;
    
    // ✅ Get email from company or admin user
    const email = company.email || adminUser?.email || null;

    // ✅ Return complete company object with all data
    return {
      ...company,
      metadata,
      subscription,
      settings,
      branding,
      adminUser: adminUser ? {
        firstName: adminUser.firstName || 'Super',
        lastName: adminUser.lastName || 'Admin',
        email: adminUser.email || 'superadmin@example.com',
        role: adminUser.role || 'company_admin',
        phone: adminUser.phone || null,
      } : null,
      email: email || 'N/A',
      phone: phone || 'N/A',
      address: company.address || null,
    };
  }

  async listCompanies(filter = {}, options = {}) {
    await this.initModels();
    const { page = 1, limit = 20, sort = '-createdAt', search } = options;

    const query = { ...filter };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [companies, total] = await Promise.all([
      this.Company.find(query).sort(sort).limit(limit).skip(skip).lean(),
      this.Company.countDocuments(query),
    ]);

    // ✅ Add metadata (user, message, conversation counts) for each company
    const companiesWithMetadata = await Promise.all(
      companies.map(async (company) => {
        try {
          // Get user count from master DB
          const totalUsers = await this.User.countDocuments({ 
            companyId: company._id 
          });

          // Get message and conversation counts from tenant DB
          let totalMessages = 0;
          let totalConversations = 0;
          
          try {
            const tenantDB = await getTenantDB(company._id.toString());
            [totalMessages, totalConversations] = await Promise.all([
              tenantDB.collection('messages').countDocuments().catch(() => 0),
              tenantDB.collection('conversations').countDocuments().catch(() => 0),
            ]);
          } catch (tenantError) {
            // If tenant DB doesn't exist or error, counts remain 0
            console.warn(`⚠️ Could not fetch metrics for company ${company._id}:`, tenantError.message);
          }

          return {
            ...company,
            metadata: {
              totalUsers,
              totalMessages,
              totalConversations,
            },
          };
        } catch (error) {
          console.warn(`⚠️ Error fetching metadata for company ${company._id}:`, error.message);
          // Return company with zero counts if there's an error
          return {
            ...company,
            metadata: {
              totalUsers: 0,
              totalMessages: 0,
              totalConversations: 0,
            },
          };
        }
      })
    );

    return {
      companies: companiesWithMetadata,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async updateCompany(companyId, updates) {
    await this.initModels();
    const company = await this.Company.findByIdAndUpdate(
      companyId,
      { ...updates, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    if (company) {
      await this.cacheCompanyData(companyId, company.toObject());
    }

    return company;
  }

  async suspendCompany(companyId) {
    await this.initModels();
    const company = await this.updateCompany(companyId, {
      status: 'suspended',
    });

    await this.User.updateMany({ companyId }, { status: 'suspended' });
    await this.clearCompanyCache(companyId);

    return company;
  }

  async activateCompany(companyId) {
    await this.initModels();
    const company = await this.updateCompany(companyId, {
      status: 'active',
    });

    await this.User.updateMany(
      { companyId, status: 'suspended' },
      { status: 'active' }
    );

    return company;
  }

  async getCompanyMetrics(companyId) {
    await this.initModels();
    const tenantDB = await getTenantDB(companyId);

    const [
      totalUsers,
      totalDepartments,
      totalChannels,
      totalConversations,
      totalMessages,
      activeConversations,
    ] = await Promise.all([
      this.User.countDocuments({ companyId }),
      tenantDB.collection('departments').countDocuments(),
      tenantDB.collection('companyaccounts').countDocuments({ isActive: true }),
      tenantDB.collection('conversations').countDocuments(),
      tenantDB.collection('messages').countDocuments(),
      tenantDB.collection('conversations').countDocuments({ status: 'active' }),
    ]);

    return {
      users: totalUsers,
      departments: totalDepartments,
      channels: totalChannels,
      conversations: {
        total: totalConversations,
        active: activeConversations,
      },
      messages: totalMessages,
    };
  }

  async getGlobalMetrics() {
  await this.initModels();
  
  const [
    totalCompanies,
    activeCompanies,
    totalUsers,
    onlineUsers,
  ] = await Promise.all([
    this.Company.countDocuments(),
    this.Company.countDocuments({ status: 'active' }),
    this.User.countDocuments(),
    this.User.countDocuments({
      lastActivity: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
    }),
  ]);

  // ✅ Get total conversations and messages across all companies/tenants
  let totalConversations = 0;
  let totalMessages = 0;
  try {
    const companies = await this.Company.find({ status: 'active' }).select('_id').lean();
    const ConversationSchema = (await import('../../models/schemas/Conversation.js')).default;
    const MessageSchema = (await import('../../models/schemas/Message.js')).default;
    
    // Count conversations and messages from all active tenant databases
    const counts = await Promise.all(
      companies.map(async (company) => {
        try {
          const tenantDB = await getTenantDB(company._id.toString());
          const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
          const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
          
          const [convCount, msgCount] = await Promise.all([
            Conversation.countDocuments().catch(() => 0),
            Message.countDocuments().catch(() => 0)
          ]);
          
          return { conversations: convCount, messages: msgCount };
        } catch (error) {
          console.warn(`⚠️ Could not fetch metrics for company ${company._id}:`, error.message);
          return { conversations: 0, messages: 0 };
        }
      })
    );
    
    totalConversations = counts.reduce((sum, item) => sum + item.conversations, 0);
    totalMessages = counts.reduce((sum, item) => sum + item.messages, 0);
  } catch (error) {
    console.warn('⚠️ Failed to get total conversations and messages:', error.message);
  }

  // ✅ Use getRedisClient() instead of redisClient
  let throughput = 0;
  try {
    // ✅ Use singleton Redis client - never creates new connection
    const redis = await getRedisClient();
    if (redis && (redis.status === 'ready' || redis.status === 'connect')) {
      throughput = (await redis.get('metrics:message:throughput')) || 0;
    }
  } catch (error) {
    console.warn('⚠️ Failed to get throughput metrics:', error.message);
  }

  return {
    companies: {
      total: totalCompanies,
      active: activeCompanies,
    },
    users: {
      total: totalUsers,
      online: onlineUsers,
    },
    conversations: {
      total: totalConversations,
    },
    messages: {
      total: totalMessages,
    },
    throughput: parseInt(throughput),
  };
}

  // ✅ Get conversation metrics with time range for charts
  async getConversationMetrics(timeRange = 'realtime') {
    await this.initModels();
    
    const now = new Date();
    let startDate = new Date();
    
    // Calculate start date based on time range
    switch (timeRange) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'realtime':
      default:
        // For real-time, get last 24 hours but group by hour
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
    }
    
    try {
      const companies = await this.Company.find({ status: 'active' }).select('_id').lean();
      const ConversationSchema = (await import('../../models/schemas/Conversation.js')).default;
      const MessageSchema = (await import('../../models/schemas/Message.js')).default;
      
      // Get conversation and message data from all active tenant databases
      const allConversations = [];
      const allMessages = [];
      
      for (const company of companies) {
        try {
          const tenantDB = await getTenantDB(company._id.toString());
          const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
          const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
          
          // Get conversations and messages within the time range
          const [conversations, messages] = await Promise.all([
            Conversation.find({
              createdAt: { $gte: startDate }
            }).select('createdAt').lean().catch(() => []),
            Message.find({
              createdAt: { $gte: startDate }
            }).select('createdAt').lean().catch(() => [])
          ]);
          
          allConversations.push(...conversations);
          allMessages.push(...messages);
        } catch (error) {
          console.warn(`⚠️ Could not fetch metrics for company ${company._id}:`, error.message);
        }
      }
      
      // Group conversations and messages by time intervals based on range
      const groupedConversations = {};
      const groupedMessages = {};
      const intervalMs = timeRange === 'realtime' ? 60 * 60 * 1000 : // 1 hour for real-time
                        timeRange === '24h' ? 60 * 60 * 1000 : // 1 hour for 24h
                        timeRange === '7d' ? 24 * 60 * 60 * 1000 : // 1 day for 7d
                        24 * 60 * 60 * 1000; // 1 day for 30d
      
      allConversations.forEach(conv => {
        const convDate = new Date(conv.createdAt);
        const intervalStart = new Date(Math.floor(convDate.getTime() / intervalMs) * intervalMs);
        const timeKey = intervalStart.toISOString();
        
        if (!groupedConversations[timeKey]) {
          groupedConversations[timeKey] = 0;
        }
        groupedConversations[timeKey]++;
      });
      
      allMessages.forEach(msg => {
        const msgDate = new Date(msg.createdAt);
        const intervalStart = new Date(Math.floor(msgDate.getTime() / intervalMs) * intervalMs);
        const timeKey = intervalStart.toISOString();
        
        if (!groupedMessages[timeKey]) {
          groupedMessages[timeKey] = 0;
        }
        groupedMessages[timeKey]++;
      });
      
      // Combine into chart data format
      const allTimeKeys = new Set([...Object.keys(groupedConversations), ...Object.keys(groupedMessages)]);
      const chartData = Array.from(allTimeKeys)
        .map(timeKey => ({
          time: timeRange === 'realtime' || timeRange === '24h' 
            ? new Date(timeKey).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : new Date(timeKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          conversations: groupedConversations[timeKey] || 0,
          messages: groupedMessages[timeKey] || 0,
          timestamp: timeKey
        }))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Get total and active conversations, and total messages
      let totalConversations = 0;
      let activeConversations = 0;
      let totalMessages = 0;
      
      for (const company of companies) {
        try {
          const tenantDB = await getTenantDB(company._id.toString());
          const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
          const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
          
          const [total, active, msgTotal] = await Promise.all([
            Conversation.countDocuments().catch(() => 0),
            Conversation.countDocuments({ status: { $in: ['open', 'pending'] } }).catch(() => 0),
            Message.countDocuments().catch(() => 0)
          ]);
          
          totalConversations += total;
          activeConversations += active;
          totalMessages += msgTotal;
        } catch (error) {
          // Skip if tenant DB error
        }
      }
      
      return {
        total: totalConversations,
        active: activeConversations,
        totalMessages: totalMessages,
        chartData
      };
    } catch (error) {
      console.error('⚠️ Error getting conversation metrics:', error);
      return {
        total: 0,
        active: 0,
        chartData: []
      };
    }
  }

  // Update cacheCompanyData method
  async cacheCompanyData(companyId, data) {
  try {
    // ✅ Use singleton Redis client - never creates new connection
    const redis = await getRedisClient();
    if (!redis || (redis.status !== 'ready' && redis.status !== 'connect')) {
      console.warn('⚠️ Redis not available, skipping cache');
      return;
    }
    const key = `company:${companyId}`;
    await redis.setEx(key, 3600, JSON.stringify(data));
  } catch (error) {
    console.warn('⚠️ Cache operation failed:', error.message);
  }
}

  async getCachedCompanyData(companyId) {
  try {
    // ✅ Use singleton Redis client - never creates new connection
    const redis = await getRedisClient();
    if (!redis || (redis.status !== 'ready' && redis.status !== 'connect')) return null;
    
    const key = `company:${companyId}`;
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn('⚠️ Cache read failed:', error.message);
    return null;
  }
}

  async clearCompanyCache(companyId) {
  try {
    // ✅ Use singleton Redis client - never creates new connection
    const redis = await getRedisClient();
    if (!redis || (redis.status !== 'ready' && redis.status !== 'connect')) return;
    
    const key = `company:${companyId}`;
    await redis.del(key);
  } catch (error) {
    console.warn('⚠️ Cache clear failed:', error.message);
  }
}
}

export default new TenantService();
