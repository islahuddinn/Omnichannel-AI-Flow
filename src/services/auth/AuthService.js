// src/services/auth/AuthService.js
import jwt from "jsonwebtoken";
import { getMasterDB, getTenantDB } from "../../config/database.js";
import UserSchema from "../../models/schemas/User.js";
import StatusHistorySchema from "../../models/schemas/StatusHistory.js";
import { TOKEN_EXPIRY } from "../../config/constants.js";

class AuthService {
  constructor() {
    this.initialized = false;
  }

  async initModels() {
    if (this.initialized) return;

    const masterDB = await getMasterDB();
    this.User = masterDB.models.User || masterDB.model("User", UserSchema);

    // ✅ Redis removed - AuthService now uses stateless JWT sessions
    console.log("✅ AuthService initialized (stateless JWT sessions)");

    this.initialized = true;
  }

  async login(email, password) {
    try {
      await this.initModels();
      console.log("🔍 Attempting login for:", email);

      const lowerEmail = email.toLowerCase();
      const user = await this.User.findOne({ email: lowerEmail }).select("+password");

      if (!user) throw new Error("Invalid credentials");
      if (user.isLocked()) throw new Error("Account temporarily locked");

      const isValid = await user.comparePassword(password);
      if (!isValid) {
        await user.incLoginAttempts();
        throw new Error("Invalid credentials");
      }

      if (user.status !== "active") throw new Error("Account is not active");

      await user.resetLoginAttempts();

      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      user.refreshToken = refreshToken;
      user.lastLogin = new Date();
      await user.save();

      console.log("✅ Login successful:", user._id);

      return {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          companyId: user.companyId,
          tenantDatabaseName: user.tenantDatabaseName,
          avatar: user.avatar,
          preferences: user.preferences,
          departments: user.departments?.map((d) => d.toString()) || [],
        },
        accessToken,
        refreshToken,
      };
    } catch (error) {
      console.error("❌ Login error:", error.message);
      throw error;
    }
  }

  async logout(userId, companyId = null) {
    try {
      await this.initModels();
  
      // Get user with current status before updating
      const user = await this.User.findById(userId).lean();
      if (!user) {
        throw new Error("User not found");
      }

      // Get companyId if not provided
      const tenantId = companyId || user.companyId?.toString();
      if (!tenantId) {
        console.warn("⚠️ No companyId found for user, skipping status history");
      }

      // Get previous statuses
      const previousCallStatus = user.callCenter?.call_status || 'offline';
      const previousChatStatus = user.chat?.chat_status || 'offline';

      // Update user status to offline
      await this.User.findByIdAndUpdate(
        userId,
        {
          $unset: {
            refreshToken: 1,
          },
          $set: {
            "chat.chat_status": "offline",
            "callCenter.call_status": "offline",
          },
        }
      );

      // Create status history entries if companyId is available and status changed
      if (tenantId && previousCallStatus !== 'offline') {
        try {
          const tenantDB = await getTenantDB(tenantId);
          const StatusHistory = tenantDB.models.StatusHistory || tenantDB.model('StatusHistory', StatusHistorySchema);
          
          await StatusHistory.create({
            userId: userId,
            statusType: 'call',
            previousStatus: previousCallStatus,
            newStatus: 'offline',
            timestamp: new Date()
          });

          if (previousChatStatus !== 'offline') {
            await StatusHistory.create({
              userId: userId,
              statusType: 'chat',
              previousStatus: previousChatStatus,
              newStatus: 'offline',
              timestamp: new Date()
            });
          }
        } catch (historyError) {
          console.error("❌ Error creating status history on logout:", historyError);
          // Don't fail logout if status history fails
        }
      }
  
      return { success: true };
    } catch (error) {
      console.error("❌ Logout error:", error.message);
      throw error;
    }
  }
  
  

  async refreshToken(refreshToken) {
    try {
      await this.initModels();
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

      const user = await this.User.findById(decoded.userId);
      if (!user) throw new Error("User not found");

      if (user.refreshToken !== refreshToken) {
        throw new Error("Invalid or expired refresh token");
      }

      const newAccess = this.generateAccessToken(user);
      const newRefresh = this.generateRefreshToken(user);

      user.refreshToken = newRefresh;
      await user.save();

      return { accessToken: newAccess, refreshToken: newRefresh };
    } catch (error) {
      console.error("❌ Refresh token error:", error.message);
      throw error;
    }
  }

  async verifyToken(token) {
    try {
      await this.initModels();
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // ✅ Redis session check removed - JWT validation is sufficient
      // JWT token contains all necessary session data
      return decoded;
    } catch (error) {
      console.error("❌ Token verification error:", error.message);
      throw new Error("Session expired or invalid");
    }
  }

  generateAccessToken(user) {
    return jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role,
        companyId: user.companyId?.toString(),
        tenantDatabaseName: user.tenantDatabaseName,
        departments: user.departments?.map((d) => d.toString()) || [],
      },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY.ACCESS }
    );
  }

  generateRefreshToken(user) {
    return jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: TOKEN_EXPIRY.REFRESH }
    );
  }

  // Sessions are stateless (JWT-only). Server-side invalidation relies on:
  // 1. Short access token lifetime (15 minutes)
  // 2. Refresh token revocation on logout ($unset refreshToken from user doc)

  async createSuperAdmin(data) {
    try {
      await this.initModels();

      const exists = await this.User.findOne({ role: "super_admin" });
      if (exists) throw new Error("Super admin already exists");

      const user = new this.User({
        ...data,
        role: "super_admin",
        status: "active",
        emailVerified: true,
      });

      await user.save();
      return {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      };
    } catch (error) {
      console.error("❌ Create super admin error:", error.message);
      throw error;
    }
  }
}

export default new AuthService();
