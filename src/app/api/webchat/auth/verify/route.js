// src/app/api/webchat/auth/verify/route.js
/**
 * WebChat Token Verification API
 * GET /api/webchat/auth/verify?token=xxx - Verify WebChat JWT token
 */

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getTenantDB, getMasterDB } from '@/config/database';
import WebChatSessionSchema from '@/models/schemas/WebChatSession';
import ConversationSchema from '@/models/schemas/Conversation';
import DepartmentSchema from '@/models/schemas/Department';
import UserSchema from '@/models/schemas/User';
import CompanySchema from '@/models/schemas/Company';
import { getWebChatSecret } from '@/lib/auth/webchatSecret';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, getWebChatSecret());
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { tenantId, sessionId } = decoded;

    if (!tenantId || !sessionId) {
      return NextResponse.json(
        { success: false, error: 'Invalid token payload' },
        { status: 400 }
      );
    }

    // Verify session exists and is authenticated
    const tenantDB = await getTenantDB(tenantId);
    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);
    
    const session = await WebChatSession.findOne({ sessionId }).lean();

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    if (!session.isAuthenticated) {
      return NextResponse.json(
        { success: false, error: 'Session not authenticated', requiresAuth: true },
        { status: 401 }
      );
    }

    // ✅ Fetch company and agent information
    let companyInfo = null;
    let agentInfo = null;
    
    try {
      // Get company info from master database
      const masterDB = await getMasterDB();
      const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
      const company = await Company.findById(tenantId).lean();
      
      if (company) {
        companyInfo = {
          name: company.name,
          email: company.email,
          phone: company.phone,
          website: company.website,
          address: company.address,
        };
      }
      
      // Get agent info from conversation if assigned
      if (session.conversationId) {
        const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
        const conversation = await Conversation.findById(session.conversationId).lean();
        
        if (conversation?.assignedTo) {
          const User = tenantDB.models.User || tenantDB.model('User', UserSchema);
          const agent = await User.findById(conversation.assignedTo).select('firstName lastName email avatar role').lean();
          
          if (agent) {
            agentInfo = {
              id: agent._id.toString(),
              name: `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || 'Support Agent',
              email: agent.email,
              avatar: agent.avatar,
              role: agent.role,
            };
          }
        }
      }
      
      // If no agent assigned, get department manager or first agent
      if (!agentInfo && session.departmentId) {
        const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
        const department = await Department.findById(session.departmentId).lean();
        
        if (department) {
          // Try manager first
          if (department.manager) {
            const User = tenantDB.models.User || tenantDB.model('User', UserSchema);
            const manager = await User.findById(department.manager).select('firstName lastName email avatar role').lean();
            
            if (manager) {
              agentInfo = {
                id: manager._id.toString(),
                name: `${manager.firstName || ''} ${manager.lastName || ''}`.trim() || 'Support Manager',
                email: manager.email,
                avatar: manager.avatar,
                role: manager.role,
              };
            }
          }
          
          // If no manager, try first agent
          if (!agentInfo && department.agents && department.agents.length > 0) {
            const User = tenantDB.models.User || tenantDB.model('User', UserSchema);
            const firstAgent = await User.findById(department.agents[0]).select('firstName lastName email avatar role').lean();
            
            if (firstAgent) {
              agentInfo = {
                id: firstAgent._id.toString(),
                name: `${firstAgent.firstName || ''} ${firstAgent.lastName || ''}`.trim() || 'Support Agent',
                email: firstAgent.email,
                avatar: firstAgent.avatar,
                role: firstAgent.role,
              };
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching company/agent info in verify route:', error);
      // Continue without company/agent info
    }

    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        session: {
          sessionId: session.sessionId,
          contactId: session.contactId,
          conversationId: session.conversationId,
          tenantId,
          companyInfo,
          agentInfo,
          // ✅ Include contactInfo with phone number for welcome message
          contactInfo: session.contactInfo ? {
            name: session.contactInfo.name,
            email: session.contactInfo.email,
            phone: session.contactInfo.phone,
            collectedAt: session.contactInfo.collectedAt,
          } : null,
        },
        companyInfo,
        agentInfo,
      },
    });

  } catch (error) {
    console.error('❌ WebChat token verification error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Token verification failed',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

