// Script to generate comprehensive Postman collection
import fs from 'fs';

const collection = {
  info: {
    name: "OmniConnect API Collection",
    description: "Complete API collection for all panels: Super Admin, Company Admin, Agent, WebChat, and Public APIs",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  variable: [
    { key: "baseUrl", value: "http://localhost:3000", type: "string" },
    { key: "token", value: "", type: "string" },
    { key: "refreshToken", value: "", type: "string" },
    { key: "conversationId", value: "", type: "string" },
    { key: "contactId", value: "", type: "string" },
    { key: "userId", value: "", type: "string" },
    { key: "channelId", value: "", type: "string" },
    { key: "dealId", value: "", type: "string" },
    { key: "templateId", value: "", type: "string" },
    { key: "departmentId", value: "", type: "string" },
    { key: "companyId", value: "", type: "string" },
    { key: "messageId", value: "", type: "string" },
    { key: "widgetId", value: "", type: "string" },
    { key: "sessionId", value: "", type: "string" }
  ],
  item: []
};

// Helper function to create request
function createRequest(name, method, path, body = null, query = [], description = "") {
  const request = {
    name,
    request: {
      method,
      header: [
        {
          key: "Content-Type",
          value: "application/json",
          type: "text"
        }
      ],
      url: {
        raw: `{{baseUrl}}${path}`,
        host: ["{{baseUrl}}"],
        path: path.split('/').filter(p => p)
      },
      description
    }
  };

  // Add auth header if not public endpoint
  if (!path.includes('/webhooks/') && !path.includes('/health') && !path.includes('/setup/') && path !== '/api/auth/login' && path !== '/api/auth/forgot-password' && path !== '/api/auth/reset-password' && path !== '/api/webchat/init') {
    request.request.header.push({
      key: "Cookie",
      value: "token={{token}}",
      type: "text"
    });
  }

  // Add query parameters
  if (query.length > 0) {
    request.request.url.query = query.map(q => ({
      key: q.key,
      value: q.value || `{{${q.key}}}`,
      description: q.description || ""
    }));
  }

  // Add body
  if (body) {
    request.request.body = {
      mode: "raw",
      raw: JSON.stringify(body, null, 2),
      options: {
        raw: {
          language: "json"
        }
      }
    };
  }

  return request;
}

// 1. SETUP & AUTHENTICATION
const setupAuth = {
  name: "1. Setup & Authentication",
  item: [
    createRequest("Create Super Admin", "POST", "/api/setup/super-admin", {
      email: "superadmin@example.com",
      password: "SecurePass123!",
      firstName: "Super",
      lastName: "Admin",
      phone: "+1234567890"
    }, [], "Create the first super admin user"),
    createRequest("Check Super Admin Exists", "GET", "/api/setup/super-admin", null, [], "Check if super admin already exists"),
    createRequest("Login", "POST", "/api/auth/login", {
      email: "user@example.com",
      password: "password123"
    }, [], "Login and get access token"),
    createRequest("Get Current User", "GET", "/api/auth/me", null, [], "Get current authenticated user"),
    createRequest("Refresh Token", "POST", "/api/auth/refresh", {
      refreshToken: "{{refreshToken}}"
    }, [], "Refresh access token"),
    createRequest("Logout", "POST", "/api/auth/logout", null, [], "Logout current user"),
    createRequest("Forgot Password", "POST", "/api/auth/forgot-password", {
      email: "user@example.com"
    }, [], "Request password reset OTP"),
    createRequest("Reset Password", "POST", "/api/auth/reset-password", {
      email: "user@example.com",
      otp: "123456",
      newPassword: "NewPassword123!"
    }, [], "Reset password with OTP"),
    createRequest("Verify OTP", "POST", "/api/auth/verify-otp", {
      email: "user@example.com",
      otp: "123456"
    }, [], "Verify OTP code")
  ]
};

// 2. SUPER ADMIN APIs
const superAdmin = {
  name: "2. Super Admin",
  item: [
    {
      name: "Companies",
      item: [
        createRequest("List Companies", "GET", "/api/companies", null, [
          { key: "page", value: "1" },
          { key: "limit", value: "20" },
          { key: "search", value: "" },
          { key: "status", value: "" }
        ], "List all companies"),
        createRequest("Create Company", "POST", "/api/companies", {
          name: "New Company",
          adminEmail: "admin@company.com",
          adminPassword: "AdminPass123!",
          adminFirstName: "Admin",
          adminLastName: "User",
          status: "active"
        }, [], "Create a new company"),
        createRequest("Get Company", "GET", "/api/companies/{{companyId}}", null, [], "Get company details"),
        createRequest("Update Company", "PUT", "/api/companies/{{companyId}}", {
          name: "Updated Company Name",
          status: "active"
        }, [], "Update company"),
        createRequest("Suspend Company", "POST", "/api/companies/{{companyId}}/suspend", {
          reason: "Violation of terms"
        }, [], "Suspend a company"),
        createRequest("Activate Company", "POST", "/api/companies/{{companyId}}/activate", null, [], "Activate a company"),
        createRequest("Get Company Metrics", "GET", "/api/companies/{{companyId}}/metrics", null, [], "Get company metrics"),
        createRequest("Get Company Channels", "GET", "/api/companies/{{companyId}}/channels", null, [], "Get company channels")
      ]
    },
    {
      name: "System",
      item: [
        createRequest("Get System Settings", "GET", "/api/system/settings", null, [], "Get system settings"),
        createRequest("Update System Settings", "PUT", "/api/system/settings", {
          maintenanceMode: false,
          maxUsersPerCompany: 100
        }, [], "Update system settings"),
        createRequest("Get System Metrics", "GET", "/api/system/metrics", null, [], "Get system metrics"),
        createRequest("Get System Logs", "GET", "/api/system/logs", null, [
          { key: "page", value: "1" },
          { key: "limit", value: "50" },
          { key: "level", value: "" }
        ], "Get system logs"),
        createRequest("Create Backup", "POST", "/api/system/backup", {
          type: "full"
        }, [], "Create system backup")
      ]
    }
  ]
};

// 3. COMPANY ADMIN APIs
const companyAdmin = {
  name: "3. Company Admin",
  item: [
    {
      name: "Current Company",
      item: [
        createRequest("Get Current Company", "GET", "/api/companies/current", null, [], "Get current company info"),
        createRequest("Update Company Settings", "PUT", "/api/companies/settings", {
          name: "Company Name",
          timezone: "UTC",
          language: "en"
        }, [], "Update company settings")
      ]
    },
    {
      name: "Users",
      item: [
        createRequest("List Users", "GET", "/api/users", null, [
          { key: "page", value: "1" },
          { key: "limit", value: "50" },
          { key: "role", value: "" },
          { key: "status", value: "" },
          { key: "search", value: "" }
        ], "List all users"),
        createRequest("Create User (Agent)", "POST", "/api/users", {
          email: "agent@example.com",
          password: "AgentPass123!",
          firstName: "Agent",
          lastName: "User",
          phone: "+1234567890",
          departments: ["{{departmentId}}"],
          permissions: {}
        }, [], "Create a new agent user"),
        createRequest("Get User", "GET", "/api/users/{{userId}}", null, [], "Get user details"),
        createRequest("Update User", "PUT", "/api/users/{{userId}}", {
          firstName: "Updated",
          lastName: "Name",
          phone: "+1234567890",
          departments: ["{{departmentId}}"],
          status: "active"
        }, [], "Update user"),
        createRequest("Delete User", "DELETE", "/api/users/{{userId}}", null, [], "Delete user"),
        createRequest("Get User Profile", "GET", "/api/users/profile", null, [], "Get current user profile"),
        createRequest("Update User Profile", "PUT", "/api/users/profile", {
          firstName: "John",
          lastName: "Doe",
          phone: "+1234567890"
        }, [], "Update current user profile"),
        createRequest("Update User Permissions", "PUT", "/api/users/{{userId}}/permissions", {
          canCreateUsers: true,
          canDeleteConversations: true
        }, [], "Update user permissions"),
        createRequest("Update User Departments", "PUT", "/api/users/{{userId}}/departments", {
          departments: ["{{departmentId}}"]
        }, [], "Update user departments")
      ]
    },
    {
      name: "Departments",
      item: [
        createRequest("List Departments", "GET", "/api/departments", null, [
          { key: "page", value: "1" },
          { key: "limit", value: "50" }
        ], "List all departments"),
        createRequest("Create Department", "POST", "/api/departments", {
          name: "Sales Department",
          description: "Handles sales inquiries",
          code: "SALES"
        }, [], "Create a new department"),
        createRequest("Get Department", "GET", "/api/departments/{{departmentId}}", null, [], "Get department details"),
        createRequest("Update Department", "PUT", "/api/departments/{{departmentId}}", {
          name: "Updated Department",
          description: "Updated description"
        }, [], "Update department"),
        createRequest("Delete Department", "DELETE", "/api/departments/{{departmentId}}", null, [], "Delete department"),
        createRequest("Get Department Agents", "GET", "/api/departments/{{departmentId}}/agents", null, [], "Get department agents"),
        createRequest("Get Department Channels", "GET", "/api/departments/{{departmentId}}/channels", null, [], "Get department channels")
      ]
    },
    {
      name: "Channels",
      item: [
        createRequest("List Channels", "GET", "/api/channels", null, [
          { key: "type", value: "" },
          { key: "status", value: "" },
          { key: "departmentId", value: "" }
        ], "List all channels"),
        createRequest("Create Channel", "POST", "/api/channels", {
          type: "whatsapp",
          name: "WhatsApp Business",
          identifier: "whatsapp_business_1",
          credentials: {
            phoneNumberId: "123456789",
            accessToken: "token",
            verifyToken: "verify_token"
          },
          departmentIds: ["{{departmentId}}"],
          settings: {}
        }, [], "Create a new channel"),
        createRequest("Get Channel", "GET", "/api/channels/{{channelId}}", null, [], "Get channel details"),
        createRequest("Update Channel", "PUT", "/api/channels/{{channelId}}", {
          name: "Updated Channel",
          isActive: true
        }, [], "Update channel"),
        createRequest("Delete Channel", "DELETE", "/api/channels/{{channelId}}", null, [], "Delete channel"),
        createRequest("Disconnect Channel", "POST", "/api/channels/{{channelId}}/disconnect", null, [], "Disconnect channel"),
        createRequest("Test Channel", "POST", "/api/channels/{{channelId}}/test", {
          testMessage: "Test message"
        }, [], "Test channel connection"),
        createRequest("Verify Channel", "POST", "/api/channels/verify", {
          type: "whatsapp",
          credentials: {
            phoneNumberId: "123456789",
            accessToken: "token"
          }
        }, [], "Verify channel credentials")
      ]
    },
    {
      name: "Templates",
      item: [
        createRequest("List Templates", "GET", "/api/templates", null, [
          { key: "channel", value: "" },
          { key: "channelAccountId", value: "" },
          { key: "includeInactive", value: "false" }
        ], "List all templates"),
        createRequest("Create Template", "POST", "/api/templates", {
          name: "Welcome Template",
          channel: "whatsapp",
          companyAccounts: ["{{channelId}}"],
          templateLanguage: "en",
          body: "Hello {{name}}, welcome!",
          category: "UTILITY",
          isActive: true
        }, [], "Create a new template"),
        createRequest("Get Template", "GET", "/api/templates/{{templateId}}", null, [], "Get template details"),
        createRequest("Update Template", "PUT", "/api/templates/{{templateId}}", {
          name: "Updated Template",
          body: "Updated body",
          isActive: true
        }, [], "Update template"),
        createRequest("Delete Template", "DELETE", "/api/templates/{{templateId}}", null, [], "Delete template"),
        createRequest("Duplicate Template", "POST", "/api/templates/{{templateId}}/duplicate", {
          name: "Copied Template"
        }, [], "Duplicate template")
      ]
    },
    {
      name: "Contacts",
      item: [
        createRequest("List Contacts", "GET", "/api/contacts", null, [
          { key: "page", value: "1" },
          { key: "limit", value: "20" },
          { key: "search", value: "" }
        ], "List all contacts"),
        createRequest("Create Contact", "POST", "/api/contacts", {
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+1234567890",
          Contact_Type: "Customer"
        }, [], "Create a new contact"),
        createRequest("Get Contact", "GET", "/api/contacts/{{contactId}}", null, [], "Get contact details"),
        createRequest("Update Contact", "PUT", "/api/contacts/{{contactId}}", {
          firstName: "Updated",
          lastName: "Name",
          email: "updated@example.com"
        }, [], "Update contact"),
        createRequest("Delete Contact", "DELETE", "/api/contacts/{{contactId}}", null, [], "Delete contact"),
        createRequest("Search Contacts", "GET", "/api/contacts/search", null, [
          { key: "q", value: "john" }
        ], "Search contacts"),
        createRequest("Filter Contacts", "POST", "/api/contacts/filter", {
          filters: {
            Contact_Type: "Customer"
          },
          page: 1,
          limit: 20
        }, [], "Filter contacts"),
        createRequest("Get Contact Conversations", "GET", "/api/contacts/{{contactId}}/conversations", null, [], "Get contact conversations"),
        createRequest("Get Contact Deals", "GET", "/api/contacts/{{contactId}}/deals", null, [], "Get contact deals"),
        createRequest("Merge Contacts", "POST", "/api/contacts/{{contactId}}/merge", {
          targetContactId: "target_contact_id"
        }, [], "Merge contacts"),
        createRequest("Get Contact Fields", "GET", "/api/contacts/fields", null, [], "Get contact custom fields"),
        createRequest("Get Contact Field Values", "GET", "/api/contacts/field-values", null, [
          { key: "fieldName", value: "Contact_Type" }
        ], "Get contact field values"),
        createRequest("Add Contact Custom Field", "POST", "/api/contacts/{{contactId}}/custom-fields", {
          fieldName: "CustomField",
          value: "Value"
        }, [], "Add custom field to contact"),
        createRequest("Update Contact Custom Field", "PUT", "/api/contacts/{{contactId}}/custom-fields/{{fieldId}}", {
          value: "Updated Value"
        }, [], "Update contact custom field"),
        createRequest("Delete Contact Custom Field", "DELETE", "/api/contacts/{{contactId}}/custom-fields/{{fieldId}}", null, [], "Delete contact custom field"),
        createRequest("Import Contacts", "POST", "/api/contacts/import", null, [], "Import contacts from CSV (multipart/form-data)"),
        createRequest("Get Import Job Status", "GET", "/api/contacts/import/{{jobId}}", null, [], "Get import job status"),
        createRequest("Preview Import", "GET", "/api/contacts/preview", null, [
          { key: "fileUrl", value: "" }
        ], "Preview import file")
      ]
    },
    {
      name: "Deals",
      item: [
        createRequest("List Deals", "GET", "/api/deals", null, [
          { key: "page", value: "1" },
          { key: "limit", value: "20" },
          { key: "search", value: "" }
        ], "List all deals"),
        createRequest("Get Deal", "GET", "/api/deals/{{dealId}}", null, [], "Get deal details"),
        createRequest("Import Deals", "POST", "/api/deals/import", null, [], "Import deals from CSV (multipart/form-data)"),
        createRequest("Get Import Status", "GET", "/api/deals/import", null, [
          { key: "jobId", value: "" }
        ], "Get deal import status")
      ]
    },
    {
      name: "Analytics",
      item: [
        createRequest("Get Overview Analytics", "GET", "/api/analytics/overview", null, [
          { key: "period", value: "7d" }
        ], "Get overview analytics (24h, 7d, 30d, 90d)"),
        createRequest("Get Conversation Analytics", "GET", "/api/analytics/conversations", null, [
          { key: "period", value: "7d" }
        ], "Get conversation analytics"),
        createRequest("Get Agent Analytics", "GET", "/api/analytics/agents", null, [
          { key: "period", value: "7d" }
        ], "Get agent analytics"),
        createRequest("Export Analytics", "GET", "/api/analytics/export", null, [
          { key: "type", value: "conversations" },
          { key: "period", value: "7d" },
          { key: "format", value: "csv" }
        ], "Export analytics data")
      ]
    },
    {
      name: "Admin",
      item: [
        createRequest("Get Webhook URLs", "GET", "/api/admin/webhooks", null, [], "Get webhook URLs for all channels"),
        createRequest("Verify WhatsApp Webhook", "GET", "/api/admin/webhooks/verify-whatsapp", null, [
          { key: "hub.mode", value: "subscribe" },
          { key: "hub.verify_token", value: "token" },
          { key: "hub.challenge", value: "challenge" }
        ], "Verify WhatsApp webhook"),
        createRequest("Get Queue Stats", "GET", "/api/admin/queue-stats", null, [], "Get queue statistics"),
        createRequest("Get Message Logs", "GET", "/api/admin/logs", null, [
          { key: "page", value: "1" },
          { key: "limit", value: "50" }
        ], "Get message logs"),
        createRequest("Get Conversation Logs", "GET", "/api/admin/logs/conversation/{{conversationId}}", null, [], "Get conversation logs"),
        createRequest("Get Message Log", "GET", "/api/admin/logs/{{messageId}}", null, [], "Get specific message log"),
        createRequest("Get Webchat Stats", "GET", "/api/admin/webchat", null, [], "Get webchat statistics")
      ]
    }
  ]
};

// 4. AGENT APIs
const agent = {
  name: "4. Agent",
  item: [
    {
      name: "Conversations",
      item: [
        createRequest("List Conversations", "GET", "/api/conversations", null, [
          { key: "page", value: "1" },
          { key: "limit", value: "50" },
          { key: "status", value: "active" },
          { key: "channel", value: "" },
          { key: "search", value: "" }
        ], "List conversations (filtered by agent's departments)"),
        createRequest("Get Conversation", "GET", "/api/conversations/{{conversationId}}", null, [], "Get conversation details"),
        createRequest("Update Conversation", "PUT", "/api/conversations/{{conversationId}}", {
          status: "open",
          tags: ["important"]
        }, [], "Update conversation"),
        createRequest("Start Conversation", "POST", "/api/conversations/start", {
          contactId: "{{contactId}}",
          channelType: "whatsapp",
          channelAccountId: "{{channelId}}"
        }, [], "Start a new conversation"),
        createRequest("Create New Conversation", "POST", "/api/conversations/new", {
          contactId: "{{contactId}}",
          channel: "whatsapp",
          channelAccountId: "{{channelId}}"
        }, [], "Create new conversation"),
        createRequest("Assign Conversation", "POST", "/api/conversations/{{conversationId}}/assign", {
          agentId: "{{userId}}"
        }, [], "Assign conversation to agent"),
        createRequest("Transfer Conversation", "POST", "/api/conversations/{{conversationId}}/transfer", {
          departmentId: "{{departmentId}}",
          agentId: "{{userId}}",
          reason: "Better suited for this department"
        }, [], "Transfer conversation"),
        createRequest("Close Conversation", "POST", "/api/conversations/{{conversationId}}/close", {
          reason: "Resolved"
        }, [], "Close conversation"),
        createRequest("Get Conversation Messages", "GET", "/api/conversations/{{conversationId}}/messages", null, [
          { key: "page", value: "1" },
          { key: "limit", value: "50" }
        ], "Get conversation messages"),
        createRequest("Get Conversation History", "GET", "/api/conversations/{{conversationId}}/history", null, [], "Get conversation history"),
        createRequest("Merge Conversations", "POST", "/api/conversations/merge", {
          primaryConversationId: "{{conversationId}}",
          secondaryConversationIds: ["conv_id_2"]
        }, [], "Merge conversations"),
        createRequest("Unmerge Conversations", "POST", "/api/conversations/unmerge", {
          conversationId: "{{conversationId}}"
        }, [], "Unmerge conversations"),
        createRequest("Get Merge History", "GET", "/api/conversations/merge-history", null, [
          { key: "conversationId", value: "{{conversationId}}" }
        ], "Get merge history"),
        createRequest("Conversation Action", "POST", "/api/conversations/{{conversationId}}/actions", {
          action: "tag",
          data: { tag: "important" }
        }, [], "Perform conversation action"),
        createRequest("Update Conversation Mode", "PATCH", "/api/conversations/{{conversationId}}/mode", {
          mode: "away"
        }, [], "Update conversation mode"),
        createRequest("Get Webchat Link", "GET", "/api/conversations/{{conversationId}}/webchat-link", null, [], "Get webchat link for conversation"),
        createRequest("Create Webchat Link", "POST", "/api/conversations/{{conversationId}}/webchat-link", {
          contactId: "{{contactId}}"
        }, [], "Create webchat link")
      ]
    },
    {
      name: "Messages",
      item: [
        createRequest("Send Message", "POST", "/api/messages/send", {
          conversationId: "{{conversationId}}",
          content: {
            type: "text",
            text: "Hello, how can I help you?"
          },
          metadata: {}
        }, [], "Send a message"),
        createRequest("Send Template Message", "POST", "/api/messages/send", {
          conversationId: "{{conversationId}}",
          content: {
            type: "template",
            templateName: "welcome_template",
            parameters: ["John"]
          },
          metadata: {}
        }, [], "Send template message"),
        createRequest("React to Message", "POST", "/api/messages/{{conversationId}}/{{messageId}}/react", {
          emoji: "👍"
        }, [], "React to a message"),
        createRequest("Resend Message", "POST", "/api/messages/{{conversationId}}/resend", {
          messageId: "{{messageId}}"
        }, [], "Resend failed message"),
        createRequest("Get Message Reactions", "GET", "/api/conversations/{{conversationId}}/messages/{{messageId}}/reactions", null, [], "Get message reactions"),
        createRequest("Remove Reaction", "DELETE", "/api/conversations/{{conversationId}}/messages/{{messageId}}/reactions", null, [
          { key: "emoji", value: "👍" }
        ], "Remove reaction from message"),
        createRequest("Send Bulk SMS", "POST", "/api/messages/bulk-sms", {
          contactIds: ["{{contactId}}"],
          message: "Bulk message text",
          channelAccountId: "{{channelId}}"
        }, [], "Send bulk SMS")
      ]
    },
    {
      name: "Search",
      item: [
        createRequest("Global Search", "GET", "/api/search/global", null, [
          { key: "q", value: "search query" },
          { key: "type", value: "all" }
        ], "Global search across contacts, conversations, users, deals, messages")
      ]
    }
  ]
};

// 5. WEBCHAT APIs
const webchat = {
  name: "5. WebChat",
  item: [
    createRequest("Initialize WebChat", "POST", "/api/webchat/init", {
      widgetId: "{{widgetId}}",
      metadata: {
        userAgent: "Mozilla/5.0",
        referrer: "https://example.com",
        page: "/",
        language: "en",
        timezone: "UTC"
      }
    }, [], "Initialize webchat session"),
    createRequest("WebChat Auth", "POST", "/api/webchat/auth", {
      sessionId: "{{sessionId}}",
      pin: "1234"
    }, [], "Authenticate with PIN"),
    createRequest("Verify WebChat Auth", "GET", "/api/webchat/auth/verify", null, [
      { key: "token", value: "{{token}}" }
    ], "Verify webchat auth token"),
    createRequest("Update WebChat Auth", "PUT", "/api/webchat/auth", {
      sessionId: "{{sessionId}}",
      pin: "1234"
    }, [], "Update webchat authentication"),
    createRequest("Get WebChat Profile", "GET", "/api/webchat/profile", null, [], "Get webchat visitor profile"),
    createRequest("Update WebChat Profile", "PUT", "/api/webchat/profile", {
      name: "John Doe",
      email: "john@example.com"
    }, [], "Update webchat profile"),
    createRequest("Change PIN", "POST", "/api/webchat/change-pin", {
      currentPin: "1234",
      newPin: "5678"
    }, [], "Change webchat PIN"),
    createRequest("Reset PIN", "POST", "/api/webchat/reset-pin", {
      sessionId: "{{sessionId}}"
    }, [], "Reset webchat PIN"),
    createRequest("Forgot PIN", "POST", "/api/webchat/forgot-pin", {
      sessionId: "{{sessionId}}"
    }, [], "Request PIN reset OTP"),
    createRequest("Verify PIN OTP", "POST", "/api/webchat/verify-pin-otp", {
      sessionId: "{{sessionId}}",
      otp: "123456"
    }, [], "Verify PIN reset OTP"),
    createRequest("Get Notification Tunes", "GET", "/api/webchat/notification-tunes", null, [], "Get available notification tunes"),
    createRequest("Set Notification Tune", "POST", "/api/webchat/notification-tunes", {
      tune: "message.mp3"
    }, [], "Set notification tune"),
    createRequest("Update Notification Tune", "PUT", "/api/webchat/notification-tunes", {
      tuneId: "tune_id",
      tune: "notification.mp3"
    }, [], "Update notification tune"),
    createRequest("Delete Notification Tune", "DELETE", "/api/webchat/notification-tunes", null, [
      { key: "tuneId", value: "tune_id" }
    ], "Delete notification tune"),
    createRequest("Get Contact Link", "GET", "/api/webchat/contact-link", null, [
      { key: "linkId", value: "link_id" }
    ], "Get contact link details"),
    createRequest("Create Contact Link", "POST", "/api/webchat/contact-link", {
      contactId: "{{contactId}}"
    }, [], "Create contact link")
  ]
};

// 6. WEBHOOKS (Public)
const webhooks = {
  name: "6. Webhooks (Public)",
  item: [
    createRequest("Meta Webhook (WhatsApp/Facebook/Instagram)", "POST", "/api/webhooks/meta", {
      object: "whatsapp_business_account",
      entry: []
    }, [], "Meta webhook endpoint"),
    createRequest("Meta Webhook Verify", "GET", "/api/webhooks/meta", null, [
      { key: "hub.mode", value: "subscribe" },
      { key: "hub.verify_token", value: "token" },
      { key: "hub.challenge", value: "challenge" }
    ], "Meta webhook verification"),
    createRequest("WhatsApp Webhook", "POST", "/api/webhooks/whatsapp", {
      messages: []
    }, [], "WhatsApp webhook endpoint"),
    createRequest("WhatsApp Webhook Verify", "GET", "/api/webhooks/whatsapp", null, [
      { key: "hub.mode", value: "subscribe" },
      { key: "hub.verify_token", value: "token" },
      { key: "hub.challenge", value: "challenge" }
    ], "WhatsApp webhook verification"),
    createRequest("SMS Webhook", "POST", "/api/webhooks/sms", {
      From: "+1234567890",
      To: "+0987654321",
      Body: "Message text"
    }, [], "SMS webhook endpoint"),
    createRequest("Email Webhook", "POST", "/api/webhooks/email", {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Subject",
      text: "Email body"
    }, [], "Email webhook endpoint"),
    createRequest("Email Webhook (GET)", "GET", "/api/webhooks/email", null, [], "Email webhook GET endpoint"),
    createRequest("WebChat Webhook", "POST", "/api/webhooks/webchat", {
      event: "message",
      data: {}
    }, [], "WebChat webhook endpoint")
  ]
};

// 7. PUBLIC & UTILITY APIs
const publicApis = {
  name: "7. Public & Utility",
  item: [
    createRequest("Health Check", "GET", "/api/health", null, [], "Health check endpoint"),
    createRequest("Redis Health", "GET", "/api/health/redis", null, [], "Redis health check"),
    createRequest("Upload File", "POST", "/api/upload", null, [], "Upload file (multipart/form-data)"),
    createRequest("Get Media", "GET", "/api/media/{{path}}", null, [], "Get media file"),
    createRequest("Email Read Tracking", "GET", "/api/tracking/email/{{messageId}}/read.gif", null, [], "Email read tracking pixel"),
    createRequest("Test Webhook", "POST", "/api/test/webhook", {
      type: "whatsapp",
      data: {}
    }, [], "Test webhook endpoint")
  ]
};

// 8. AI PROMPTS (if applicable)
const aiPrompts = {
  name: "8. AI Prompts",
  item: [
    createRequest("List AI Prompts", "GET", "/api/ai-prompts", null, [], "List AI prompts"),
    createRequest("Create AI Prompt", "POST", "/api/ai-prompts", {
      name: "Prompt Name",
      prompt: "Prompt text",
      category: "general"
    }, [], "Create AI prompt"),
    createRequest("Get AI Prompt", "GET", "/api/ai-prompts/{{promptId}}", null, [], "Get AI prompt"),
    createRequest("Update AI Prompt", "PUT", "/api/ai-prompts/{{promptId}}", {
      name: "Updated Prompt",
      prompt: "Updated text"
    }, [], "Update AI prompt"),
    createRequest("Delete AI Prompt", "DELETE", "/api/ai-prompts/{{promptId}}", null, [], "Delete AI prompt")
  ]
};

// 9. AUTOMATIONS (if applicable)
const automations = {
  name: "9. Automations",
  item: [
    createRequest("List Automations", "GET", "/api/automations", null, [], "List automations"),
    createRequest("Create Automation", "POST", "/api/automations", {
      name: "Auto Reply",
      trigger: "new_message",
      actions: []
    }, [], "Create automation"),
    createRequest("Get Automation", "GET", "/api/automations/{{automationId}}", null, [], "Get automation"),
    createRequest("Update Automation", "PUT", "/api/automations/{{automationId}}", {
      name: "Updated Automation"
    }, [], "Update automation"),
    createRequest("Delete Automation", "DELETE", "/api/automations/{{automationId}}", null, [], "Delete automation"),
    createRequest("Publish Automation", "PUT", "/api/automations/{{automationId}}/publish", null, [], "Publish automation"),
    createRequest("Copy Automation", "POST", "/api/automations/{{automationId}}/copy", {
      name: "Copied Automation"
    }, [], "Copy automation"),
    createRequest("Get Automation Stats", "GET", "/api/automations/{{automationId}}/stats", null, [], "Get automation statistics"),
    createRequest("List Automation Outcomes", "GET", "/api/automations/{{automationId}}/outcomes", null, [], "List automation outcomes"),
    createRequest("Create Automation Outcome", "POST", "/api/automations/{{automationId}}/outcomes", {
      name: "Outcome Name",
      conditions: []
    }, [], "Create automation outcome"),
    createRequest("Get Automation Outcome", "GET", "/api/automations/{{automationId}}/outcomes/{{outcomeId}}", null, [], "Get automation outcome"),
    createRequest("Update Automation Outcome", "PUT", "/api/automations/{{automationId}}/outcomes/{{outcomeId}}", {
      name: "Updated Outcome"
    }, [], "Update automation outcome"),
    createRequest("Delete Automation Outcome", "DELETE", "/api/automations/{{automationId}}/outcomes/{{outcomeId}}", null, [], "Delete automation outcome"),
    createRequest("List Outcome Matches", "GET", "/api/automations/{{automationId}}/outcome-matches", null, [], "List outcome matches"),
    createRequest("Create Outcome Match", "POST", "/api/automations/{{automationId}}/outcome-matches", {
      outcomeId: "{{outcomeId}}",
      conversationId: "{{conversationId}}"
    }, [], "Create outcome match"),
    createRequest("Get Outcome Match", "GET", "/api/outcome-matches/{{matchId}}", null, [], "Get outcome match"),
    createRequest("Update Outcome Match", "PUT", "/api/outcome-matches/{{matchId}}", {
      status: "completed"
    }, [], "Update outcome match"),
    createRequest("Delete Outcome Match", "DELETE", "/api/outcome-matches/{{matchId}}", null, [], "Delete outcome match")
  ]
};

// Combine all sections
collection.item = [
  setupAuth,
  superAdmin,
  companyAdmin,
  agent,
  webchat,
  webhooks,
  publicApis,
  aiPrompts,
  automations
];

// Write to file
fs.writeFileSync('postman_collection.json', JSON.stringify(collection, null, 2));
console.log('✅ Postman collection generated successfully!');
console.log('📁 File: postman_collection.json');
console.log('📥 Import this file into Postman to use all APIs');

