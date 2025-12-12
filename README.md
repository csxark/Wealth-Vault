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
- MongoDB (running locally or accessible)
- Git (for version control)

## Quick Setup

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

### Windows Users
Double-click `run-setup.bat` for automated setup.

### Unix/Mac Users
```bash
chmod +x run-setup.sh
./run-setup.sh
```

## Detailed Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Wealth-Vault
```

### 2. Environment Configuration

The setup script will automatically create the necessary environment files:

- **Backend** (`.env`): MongoDB connection, JWT configuration, CORS settings
- **Frontend** (`.env`): API URL, Supabase configuration (for future use)

### 3. Database Setup

The application uses MongoDB for data storage. Ensure MongoDB is running locally or update the connection string in `backend/.env`.

### 4. Run the Application

```bash
# Start both frontend and backend
npm run dev

# Or start individually
npm run dev:backend  # Backend only (port 5000)
npm run dev:frontend # Frontend only (port 3000)
```

### 5. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api
- **API Health Check**: http://localhost:5000/api/health

## API Synchronization

The frontend and backend are fully synchronized with matching data models:

- **User Management**: JWT authentication with MongoDB
- **Expense Tracking**: Real-time expense management with categories
- **Goal Management**: Financial goals with progress tracking
- **Category Management**: Hierarchical categories with budgets

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

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section above
- Review Supabase documentation for database-related issues

