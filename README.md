# Omni Ai Flow

A modern, multi-tenant omnichannel customer support and communication platform built with Next.js.

## 🚀 Features

- **Multi-tenant Architecture**: Complete isolation between different companies/organizations
- **Omnichannel Communication**: Support for WhatsApp, Email, SMS, Web Chat, and more
- **Real-time Messaging**: Socket.IO based instant messaging
- **Role-based Access Control**: Three-tier system (Super Admin, Company Admin, Agent)
- **Advanced Analytics**: Performance tracking and insights
- **Background Workers**: Asynchronous message and webhook processing
- **Modern UI**: Built with Radix UI and Tailwind CSS

## 📋 Prerequisites

- Node.js 18 or higher
- MongoDB 6 or higher
- Redis 6 or higher
- npm, yarn, or pnpm

## 🛠️ Installation

### Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd my-app

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Start services with Docker
docker-compose up -d

# Run the application
npm run dev
```

### Manual Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   Create `.env.local` file with required variables (see [Environment Variables](#environment-variables))

3. **Start Services**
   ```bash
   # Start MongoDB
   mongod

   # Start Redis
   redis-server

   # Run the application
   npm run dev
   ```

4. **Initialize Database**
   ```bash
   node scripts/setup.js
   ```

5. **Access the Application**
   - Frontend: http://localhost:3000
   - API: http://localhost:3000/api

## 📖 Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[Project Documentation](docs/PROJECT_DOCUMENTATION.md)** - Complete project overview and guide
- **[API Documentation](docs/API.md)** - API endpoints reference
- **[Architecture](docs/ARCHITECTURE.md)** - System architecture details
- **[Deployment](docs/DEPLOYMENT.md)** - Deployment instructions
- **[Security](docs/SECURITY.md)** - Security best practices
- **[Contributing](docs/CONTRIBUTING.md)** - Contribution guidelines

## 🏗️ Project Structure

```
my-app/
├── docs/                   # Documentation
├── public/                 # Static assets
├── scripts/                # Utility scripts
├── src/
│   ├── app/               # Next.js App Router
│   │   ├── (superadmin)/ # Super Admin routes
│   │   ├── agent/         # Agent interface
│   │   ├── c/             # Company Admin routes
│   │   ├── api/           # API endpoints
│   │   └── auth/          # Authentication
│   ├── components/        # React components
│   ├── config/            # Configuration
│   ├── services/          # Business logic
│   ├── models/            # Database models
│   ├── workers/           # Background workers
│   └── store/             # State management
├── tests/                  # Test files
└── docker-compose.yml     # Docker configuration
```

## 🔑 Environment Variables

### Required

```env
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=omni_master
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
JWT_SECRET=your_secret_key
```

### Optional

```env
PORT=3000
REDIS_PASSWORD=your_redis_password
AWS_ACCESS_KEY_ID=your_aws_key
SMTP_HOST=smtp.gmail.com
```

See [Environment Variables Section](docs/PROJECT_DOCUMENTATION.md#environment-variables) for complete list.

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm run test:unit
npm run test:integration
```

## 🚢 Deployment

### Docker Deployment

```bash
# Build image
docker build -t omni-ai-flow .

# Run container
docker run -d -p 3000:3000 omni-ai-flow

# Or use docker-compose
docker-compose up -d
```

### Production Checklist

- [ ] Environment variables configured
- [ ] MongoDB indexes created
- [ ] Redis persistence enabled
- [ ] SSL/TLS certificates installed
- [ ] Rate limiting configured
- [ ] Monitoring setup
- [ ] Backup strategy in place

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

## 🎯 Usage

### Starting the Application

```bash
# Development
npm run dev

# Production
npm run build
npm start

# With workers
npm run workers
```

### Creating a Company

1. Login as Super Admin
2. Navigate to Companies section
3. Click "Create Company"
4. Fill in company details
5. Assign a Company Admin

### Managing Users

1. Login as Company Admin or Super Admin
2. Navigate to Users section
3. Create, edit, or delete users
4. Assign roles and departments

### Handling Conversations

1. Login as Agent
2. Select a conversation from the inbox
3. Reply to customer messages
4. Assign to other agents if needed
5. Close conversation when done

## 📊 Features Overview

### Multi-tenant Architecture
Each company has its own isolated database, ensuring complete data separation.

### Real-time Communication
Socket.IO enables instant message delivery and typing indicators.

### Omnichannel Support
Connect and manage multiple communication channels from one interface.

### Advanced Analytics
Track performance metrics, response times, and customer satisfaction.

### Background Processing
BullMQ workers handle message delivery and webhook processing asynchronously.

## 🔐 Security

- JWT-based authentication
- Role-based access control (RBAC)
- Rate limiting on API endpoints
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CSRF protection

See [Security Documentation](docs/SECURITY.md) for more details.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](docs/CONTRIBUTING.md) first.

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📝 License

See LICENSE file for details.

## 💡 Support

- **Documentation**: Check the `docs/` directory
- **Issues**: Open an issue on GitHub
- **Questions**: Contact the development team

## 🗺️ Roadmap

- [ ] Multi-language support
- [ ] Advanced AI integration
- [ ] Mobile applications
- [ ] Enhanced reporting
- [ ] API improvements
- [ ] Performance optimizations

## 📞 Contact

For questions or support, please contact:
- Email: support@omniaiflow.com
- GitHub: [github.com/omni-ai-flow](https://github.com/omni-ai-flow)

---

Built with ❤️ using Next.js, React, MongoDB, Redis, and Socket.IO
