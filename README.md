<<<<<<< Updated upstream
# Wealth Vault - Financial Wellness App

A comprehensive financial wellness application that helps users track spending patterns, set financial goals, and make informed financial decisions using AI-powered insights.

## Features

- **Smart Spending Tracking**: Categorize expenses into Safe, Impulsive, and Anxious spending patterns
- **Financial Goals Management**: Set, track, and visualize progress towards financial objectives
- **AI Financial Coach**: Get personalized financial advice and insights
- **QR Code Expense Entry**: Quick expense logging using QR codes and UPI
- **Data Import**: Import financial data from CSV files
- **Responsive Dashboard**: Beautiful charts and analytics for spending insights
- **User Profiles**: Manage personal information and financial preferences

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Charts**: Chart.js + React-Chartjs-2
- **Icons**: Lucide React
- **QR Scanning**: @zxing/browser

## Prerequisites

- Node.js 18+ and npm
- Supabase account and project

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Wealth-Vault
```

### 2. Install Dependencies

```bash
cd frontend
npm install
```

### 3. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once your project is created, go to Settings > API
3. Copy your Project URL and anon/public key

### 4. Configure Environment Variables

1. Create a `.env` file in the `frontend` directory:

```bash
cd frontend
cp env.example .env
```

2. Edit the `.env` file with your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_DEBUG=false
```

### 5. Set Up Database Schema

1. In your Supabase dashboard, go to SQL Editor
2. Copy and paste the contents of `supabase-schema.sql`
3. Run the SQL script to create all necessary tables and policies

### 6. Configure Authentication

1. In Supabase dashboard, go to Authentication > Settings
2. Add your app's domain to the Site URL
3. Configure any additional authentication providers if needed

### 7. Run the Application

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Database Schema

The app uses three main tables:

- **profiles**: User profile information
- **transactions**: Financial transactions with spending categories
- **goals**: Financial goals and progress tracking

All tables have Row Level Security (RLS) enabled to ensure users can only access their own data.

## Key Components

### Dashboard
- Spending overview with charts
- Category breakdown (Safe, Impulsive, Anxious)
- Budget tracking and safe spend zone

### Goals Management
- Create and track financial goals
- Visual progress indicators
- Goal completion tracking

### Profile Management
- Personal information
- Financial preferences
- Income and goal settings

### Expense Tracking
- QR code scanning for quick entry
- Manual expense logging
- Category classification

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key | Yes |
| `VITE_DEBUG` | Enable debug mode | No |

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Project Structure

```
frontend/
├── src/
│   ├── components/     # React components
│   ├── hooks/         # Custom React hooks
│   ├── lib/           # External library configurations
│   ├── types/         # TypeScript type definitions
│   └── utils/         # Utility functions
├── public/            # Static assets
└── package.json       # Dependencies and scripts
```

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Netlify

1. Connect your GitHub repository to Netlify
2. Set environment variables in Netlify dashboard
3. Build command: `npm run build`
4. Publish directory: `dist`

## Troubleshooting

### Common Issues

1. **Environment Variables Not Loading**
   - Ensure `.env` file is in the `frontend` directory
   - Restart the development server after adding variables

2. **Database Connection Errors**
   - Verify Supabase URL and key are correct
   - Check if database schema is properly set up
   - Ensure RLS policies are configured

3. **Authentication Issues**
   - Verify Supabase Auth is enabled
   - Check Site URL configuration in Supabase
   - Clear browser cache and local storage

### Debug Mode

Enable debug mode by setting `VITE_DEBUG=true` to see detailed console logs.

## Contributing
=======
# Wealth Vault - Financial Management Application

A comprehensive financial management application built with React, Node.js, and MongoDB.

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- MongoDB running locally or MongoDB Atlas connection
- npm or yarn package manager

### 1. Clone and Install
```bash
git clone <repository-url>
cd Wealth-Vault
npm install
```

### 2. Environment Setup

#### Backend (.env)
Create `backend/.env` file:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/wealth-vault
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRE=30d
FRONTEND_URL=http://localhost:3000
```

#### Frontend (.env)
Create `frontend/.env` file:
```env
VITE_API_URL=http://localhost:5000/api
VITE_APP_NAME=Wealth Vault
VITE_APP_VERSION=1.0.0
```

### 3. Start Development Environment

#### Option A: Use Scripts (Recommended)
```bash
# Windows
start-dev.bat

# PowerShell
.\start-dev.ps1

# Cross-platform
npm run dev
```

#### Option B: Manual Start
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## 🔧 API Connectivity Issues Fixed

### What Was Fixed
1. **Port Configuration**: Frontend (3000) ↔ Backend (5000)
2. **CORS Settings**: Multiple origin support with credentials
3. **Vite Proxy**: Proper API routing from frontend to backend
4. **Environment Variables**: Consistent configuration across services
5. **Error Handling**: Enhanced API error handling and logging

### Configuration Details
- **Frontend**: Uses Vite proxy to route `/api/*` requests to backend
- **Backend**: CORS configured for multiple frontend ports
- **API Base**: Consistent `/api` prefix across all endpoints
- **Authentication**: JWT-based with automatic token handling

## 🧪 Testing Connectivity

### 1. Health Check
- **Backend**: `http://localhost:5000/api/health`
- **Frontend**: `http://localhost:3000/api/health` (via proxy)

### 2. Connection Test Component
The frontend includes a `ConnectionTest` component that automatically tests:
- Backend health endpoint
- Auth endpoints
- Proxy functionality
- CORS configuration

### 3. API Test Script
Run the included test script:
```bash
node test-api.js
```

## 📁 Project Structure

```
Wealth-Vault/
├── backend/                 # Node.js + Express API
│   ├── config/             # Database configuration
│   ├── middleware/         # Authentication middleware
│   ├── models/             # MongoDB models
│   ├── routes/             # API routes
│   └── server.js           # Main server file
├── frontend/               # React + TypeScript app
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── services/       # API services
│   │   └── types/          # TypeScript types
│   └── vite.config.ts      # Vite configuration
├── start-dev.bat           # Windows startup script
├── start-dev.ps1           # PowerShell startup script
└── test-api.js             # API connectivity test
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile

### Financial Management
- `GET /api/expenses` - Get all expenses
- `POST /api/expenses` - Create expense
- `GET /api/categories` - Get categories
- `GET /api/goals` - Get financial goals

## 🐛 Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Check ports
netstat -ano | findstr :5000
netstat -ano | findstr :3000

# Kill processes (Windows)
taskkill /PID <PID> /F
```

#### 2. MongoDB Connection
- Ensure MongoDB is running locally
- Check connection string in `.env`
- Verify database exists

#### 3. CORS Errors
- Check browser console for CORS messages
- Verify backend CORS configuration
- Ensure frontend URL is in allowed origins

#### 4. Proxy Issues
- Verify Vite proxy configuration
- Check that backend is running on port 5000
- Ensure API calls use `/api` prefix

### Debug Steps
1. Check backend console for errors
2. Check frontend browser console
3. Test API endpoints directly
4. Verify environment configuration
5. Check network requests in DevTools

## 🚀 Production Deployment

### Backend
1. Set `NODE_ENV=production`
2. Use production MongoDB URI
3. Set strong JWT secret
4. Configure production CORS origins

### Frontend
1. Build: `npm run build`
2. Serve static files from backend or CDN
3. Update API base URL for production

## 📚 Additional Resources

- [Connection Setup Guide](CONNECTION_SETUP.md) - Detailed connectivity instructions
- [API Documentation](CONNECTION_SETUP.md#api-endpoints) - Complete endpoint reference
- [Troubleshooting Guide](CONNECTION_SETUP.md#troubleshooting) - Common issues and solutions

## 🤝 Contributing
>>>>>>> Stashed changes

1. Fork the repository
2. Create a feature branch
3. Make your changes
<<<<<<< Updated upstream
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section above
- Review Supabase documentation for database-related issues

## Roadmap

- [ ] Mobile app (React Native)
- [ ] Advanced analytics and insights
- [ ] Budget planning tools
- [ ] Investment tracking
- [ ] Multi-currency support
- [ ] Family/shared accounts
- [ ] Export functionality
- [ ] Dark/light theme toggle
=======
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter issues:
1. Check the troubleshooting section
2. Review the connection setup guide
3. Check console logs and network requests
4. Create an issue with detailed error information
>>>>>>> Stashed changes
