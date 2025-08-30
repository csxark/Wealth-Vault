# Wealth Vault - API Connectivity Setup Guide

## Overview
This guide helps you set up and fix the API connectivity between the frontend (React + Vite) and backend (Node.js + Express) of the Wealth Vault application.

## Current Configuration

### Frontend (Port 3000)
- **Framework**: React + TypeScript + Vite
- **Port**: 3000
- **API Proxy**: Enabled (routes `/api/*` to backend)
- **Base URL**: `/api` (uses Vite proxy)

### Backend (Port 5000)
- **Framework**: Node.js + Express
- **Port**: 5000
- **API Routes**: `/api/*`
- **CORS**: Configured for frontend ports

## Quick Start

### 1. Install Dependencies
```bash
# Install root dependencies (including concurrently)
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Start Both Services
```bash
# From root directory - starts both frontend and backend
npm run dev

# Or start them separately:
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
npm run dev:frontend
```

## Manual Setup

### Backend Setup
1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Create environment file** (copy from env.example):
   ```bash
   cp env.example .env
   ```

3. **Configure .env file**:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/wealth-vault
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_EXPIRE=30d
   FRONTEND_URL=http://localhost:3000
   ```

4. **Start backend**:
   ```bash
   npm run dev
   ```

### Frontend Setup
1. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

2. **Create environment file**:
   ```env
   VITE_API_URL=http://localhost:5000/api
   VITE_APP_NAME=Wealth Vault
   VITE_APP_VERSION=1.0.0
   ```

3. **Start frontend**:
   ```bash
   npm run dev
   ```

## Testing Connectivity

### 1. Health Check
- **Backend**: `http://localhost:5000/api/health`
- **Frontend**: Use the ConnectionTest component in the app

### 2. Auth Test Endpoint
- **URL**: `http://localhost:5000/api/auth/test`
- **Method**: GET
- **Expected Response**: JSON with success status

### 3. Frontend Proxy Test
- **URL**: `http://localhost:3000/api/health`
- **Should**: Route to backend via Vite proxy

## Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Check what's using port 5000
netstat -ano | findstr :5000

# Kill process (Windows)
taskkill /PID <PID> /F

# Check what's using port 3000
netstat -ano | findstr :3000
```

#### 2. CORS Errors
- Ensure backend CORS configuration includes frontend URL
- Check that `credentials: true` is set
- Verify frontend is running on expected port

#### 3. Proxy Not Working
- Ensure Vite proxy configuration is correct
- Check that backend is running on port 5000
- Verify API calls use `/api` prefix

#### 4. MongoDB Connection Issues
- Ensure MongoDB is running locally
- Check connection string in `.env` file
- Verify database name and credentials

### Debug Steps

1. **Check Backend Logs**:
   ```bash
   cd backend
   npm run dev
   ```

2. **Check Frontend Console**:
   - Open browser DevTools
   - Check Console and Network tabs
   - Look for CORS or connection errors

3. **Test API Endpoints**:
   ```bash
   # Test health endpoint
   curl http://localhost:5000/api/health
   
   # Test auth endpoint
   curl http://localhost:5000/api/auth/test
   ```

4. **Verify Network Requests**:
   - Use browser DevTools Network tab
   - Check request/response headers
   - Verify proxy routing

## Environment Variables Reference

### Backend (.env)
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | 5000 |
| `NODE_ENV` | Environment mode | development |
| `MONGODB_URI` | MongoDB connection string | mongodb://localhost:27017/wealth-vault |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_EXPIRE` | JWT expiration time | 30d |
| `FRONTEND_URL` | Frontend URL for CORS | http://localhost:3000 |

### Frontend (.env)
| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | API base URL | /api |
| `VITE_APP_NAME` | Application name | Wealth Vault |
| `VITE_APP_VERSION` | Application version | 1.0.0 |

## API Endpoints

### Health Check
- `GET /api/health` - Server health status

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile
- `PUT /api/auth/change-password` - Change password
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout
- `GET /api/auth/test` - Test endpoint

### Expenses
- `GET /api/expenses` - Get all expenses
- `POST /api/expenses` - Create expense
- `GET /api/expenses/:id` - Get expense by ID
- `PUT /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense

### Categories
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create category
- `GET /api/categories/:id` - Get category by ID
- `PUT /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Delete category

### Goals
- `GET /api/goals` - Get all goals
- `POST /api/goals` - Create goal
- `GET /api/goals/:id` - Get goal by ID
- `PUT /api/goals/:id` - Update goal
- `DELETE /api/goals/:id` - Delete goal

## Support

If you encounter issues:
1. Check this guide first
2. Verify all dependencies are installed
3. Ensure both services are running
4. Check console logs for errors
5. Test individual endpoints
6. Verify environment configuration
