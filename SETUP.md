# Wealth Vault - Setup & Synchronization Guide

This guide will help you set up and synchronize the Wealth Vault frontend and backend applications.

## 🚀 Quick Start

### Option 1: Automated Setup (Recommended)
```bash
# Run the automated sync script
npm run sync
```

### Option 2: Manual Setup
```bash
# 1. Install all dependencies
npm run install-all

# 2. Set up environment files
npm run setup

# 3. Start both applications
npm run dev
```

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **npm** (v8 or higher)
- **MongoDB** (running locally or accessible)
- **Git** (for version control)

## 🔧 Environment Configuration

### Backend Environment (.env)
The backend requires the following environment variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/wealth-vault

# JWT Configuration
JWT_SECRET=wealth-vault-super-secret-jwt-key-2024
JWT_EXPIRE=30d

# CORS Configuration
FRONTEND_URL=http://localhost:3000
```

### Frontend Environment (.env)
The frontend requires the following environment variables:

```env
# Supabase Configuration (for future use)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# API Configuration
VITE_API_URL=http://localhost:5000/api

# Optional: Enable debug mode
VITE_DEBUG=false
```

## 🏗️ Project Structure

```
Wealth-Vault/
├── backend/                 # Node.js/Express API
│   ├── config/             # Database configuration
│   ├── middleware/         # Authentication & validation
│   ├── models/            # MongoDB schemas
│   ├── routes/            # API endpoints
│   └── server.js          # Main server file
├── frontend/              # React/Vite application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── services/      # API services
│   │   ├── types/         # TypeScript interfaces
│   │   └── utils/         # Utility functions
│   └── package.json
├── setup-env.js           # Environment setup script
├── sync-app.js            # Synchronization script
└── test-api.js            # API testing script
```

## 🔄 API Synchronization

### Data Models Alignment

The frontend and backend are synchronized through matching data models:

#### User Model
- **Backend**: MongoDB schema with authentication
- **Frontend**: TypeScript interface with JWT token handling

#### Expense Model
- **Backend**: Full expense tracking with categories
- **Frontend**: Expense management with real-time updates

#### Category Model
- **Backend**: Hierarchical categories with budgets
- **Frontend**: Category management with color coding

#### Goal Model
- **Backend**: Financial goals with progress tracking
- **Frontend**: Goal visualization and contribution tracking

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | User authentication |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/expenses` | Get user expenses |
| POST | `/api/expenses` | Create expense |
| GET | `/api/categories` | Get user categories |
| POST | `/api/categories` | Create category |
| GET | `/api/goals` | Get user goals |
| POST | `/api/goals` | Create goal |

## 🚨 Common Issues & Solutions

### 1. MongoDB Connection Error
**Error**: `MongoServerSelectionError: connect ECONNREFUSED`
**Solution**: 
```bash
# Start MongoDB service
# Windows: Start MongoDB service from Services
# macOS/Linux: brew services start mongodb-community
```

### 2. Port Already in Use
**Error**: `EADDRINUSE: address already in use :::5000`
**Solution**:
```bash
# Find and kill process using port 5000
lsof -ti:5000 | xargs kill -9
# Or change PORT in backend/.env
```

### 3. CORS Error
**Error**: `Access to fetch at 'http://localhost:5000/api' from origin 'http://localhost:3000' has been blocked by CORS policy`
**Solution**: Ensure CORS is properly configured in backend/server.js

### 4. JWT Token Error
**Error**: `JsonWebTokenError: invalid token`
**Solution**: Check JWT_SECRET in backend/.env and ensure token is properly stored in localStorage

### 5. Environment Variables Not Loading
**Error**: `process.env.VITE_API_URL is undefined`
**Solution**: Restart the development server after updating .env files

## 🧪 Testing

### Test API Connection
```bash
npm run test-api
```

### Manual API Testing
```bash
# Health check
curl http://localhost:5000/api/health

# Register user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","firstName":"John","lastName":"Doe"}'
```

## 🔍 Debugging

### Enable Debug Mode
Set `VITE_DEBUG=true` in frontend/.env to enable detailed logging.

### Backend Logging
The backend uses Morgan for HTTP request logging and console.log for debugging.

### Frontend Logging
Check browser console for API request/response logs and error messages.

## 📦 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run setup` | Create environment files |
| `npm run sync` | Full synchronization setup |
| `npm run install-all` | Install all dependencies |
| `npm run dev` | Start both frontend and backend |
| `npm run dev:backend` | Start backend only |
| `npm run dev:frontend` | Start frontend only |
| `npm run test-api` | Test API connectivity |
| `npm run build` | Build frontend for production |
| `npm start` | Start production backend |

## 🌐 Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api
- **API Health Check**: http://localhost:5000/api/health

## 🔐 Security Notes

- JWT_SECRET should be a strong, unique key in production
- Enable HTTPS in production
- Implement rate limiting for API endpoints
- Validate all user inputs
- Use environment variables for sensitive data

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Verify all prerequisites are installed
3. Ensure MongoDB is running
4. Check console logs for detailed error messages
5. Verify environment variables are correctly set

## 🎯 Next Steps

After successful setup:

1. Create your first user account
2. Add some expense categories
3. Track your first expenses
4. Set up financial goals
5. Explore the dashboard features
