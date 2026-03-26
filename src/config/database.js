// src/config/database.js
import mongoose from 'mongoose';

let isConnected = false;
let mainConnection = null;

/**
 * Connect to MongoDB once globally.
 * Environment isolation is achieved through SEPARATE MongoDB instances,
 * not database name prefixes.
 * 
 * - Local: MONGODB_URI points to local MongoDB (mongodb://localhost:27017)
 * - Staging: MONGODB_URI points to staging MongoDB (mongodb://staging-host:27017)
 * - Production: MONGODB_URI points to production MongoDB (mongodb://prod-host:27017)
 */
export const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const rawUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.DATABASE_NAME || 'omni_master';

  // ✅ Auto-remove any DB name suffix from the URI
  const uri = (() => {
    try {
      const parsed = new URL(rawUri);
      // Remove any trailing path after host
      parsed.pathname = '/';
      return parsed.toString().replace(/\/$/, ''); // ensure no trailing slash
    } catch {
      // Fallback if URL parsing fails
      return rawUri.split('/')[0] + '//' + rawUri.split('/')[2];
    }
  })();

  try {
    const environment = process.env.NODE_ENV || 'development';
    
    console.log('⏳ Connecting to MongoDB...');
    console.log(`   Environment: ${environment}`);
    console.log(`   MongoDB URI: ${uri.replace(/\/\/.*@/, '//***:***@')}`); // Mask credentials
    console.log(`   Database Strategy: Separate MongoDB instances per environment`);

    const conn = await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });

    isConnected = true;
    mainConnection = conn.connection;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`✅ Environment Isolation: Via separate MongoDB instances`);

    return conn.connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
};

// ✅ Get master database connection
export const getMasterDB = async () => {
  if (!isConnected || mongoose.connection.readyState !== 1) {
    await connectDB();
  }

  const dbName = process.env.DATABASE_NAME || 'omni_master';
  const connection = mongoose.connection.useDb(dbName, { useCache: true });
  
  // Only log on first access
  if (!mongoose.connection._masterDbLogged) {
    console.log(`🗄️  Using Master DB: ${dbName}`);
    mongoose.connection._masterDbLogged = true;
  }
  
  return connection;
};

// ✅ Get tenant database connection
export const getTenantDB = async (tenantId) => {
  if (!isConnected || mongoose.connection.readyState !== 1) {
    await connectDB();
  }

  const dbName = `tenant_${tenantId}`;
  
  // Only log on first access to avoid spam
  if (!mongoose.connection._usedDatabases) {
    mongoose.connection._usedDatabases = new Set();
  }
  if (!mongoose.connection._usedDatabases.has(dbName)) {
    console.log(`🗄️  Using Tenant DB: ${dbName}`);
    mongoose.connection._usedDatabases.add(dbName);
  }
  
  const connection = mongoose.connection.useDb(dbName, { useCache: true });
  return connection;
};
// ✅ Export connectDB function
export default connectDB;
