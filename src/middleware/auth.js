// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import AuthService from '../services/auth/AuthService.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const decoded = await AuthService.verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

export const verifyAuth = async (request) => {
  try {
    let token;
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      const cookie = request.cookies.get('token');
      token = cookie ? cookie.value : null;
    }

    if (!token) {
      return { success: false, message: 'Authentication required' };
    }

    const decoded = await AuthService.verifyToken(token);
    return { success: true, user: decoded };
  } catch (error) {
    console.error('Auth verification error:', error);
    return { success: false, message: 'Invalid or expired token' };
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

export const requireSuperAdmin = requireRole('super_admin');
export const requireCompanyAdmin = requireRole('company_admin', 'super_admin');
export const requireAgent = requireRole('agent', 'company_admin', 'super_admin');