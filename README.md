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

## Roadmap

- [ ] Mobile app (React Native)
- [ ] Advanced analytics and insights
- [ ] Budget planning tools
- [ ] Investment tracking
- [ ] Multi-currency support
- [ ] Family/shared accounts
- [ ] Export functionality
- [ ] Dark/light theme toggle