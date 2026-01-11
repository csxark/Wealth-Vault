# 💰 Wealth Vault — Financial Wellness App

> **Take control of your money. Build healthier financial habits.**  
> Wealth Vault is a modern financial wellness platform that helps users understand spending behavior, set meaningful goals, and make smarter financial decisions using **AI-powered insights**.

> 💡 Take control of your finances with intelligent tracking and personalized guidance.

## Features

---

## ✨ What Makes Wealth Vault Different?

Wealth Vault goes beyond simple expense tracking. It focuses on **behavior-aware finance**, helping users understand _why_ they spend — not just _what_ they spend.

### 🔑 Key Features

- 🧠 **Smart Spending Analysis**  
  Categorizes expenses into **Safe**, **Impulsive**, and **Anxious** spending patterns

- 🎯 **Financial Goals Management**  
  Set, track, and visualize progress toward financial objectives

- 🤖 **AI Financial Coach**  
  Personalized insights and actionable recommendations

- 📷 **QR Code Expense Entry**  
  Log expenses instantly using QR codes and UPI

- 📊 **Visual Analytics Dashboard**  
  Interactive charts for clear spending insights

- 📁 **CSV Data Import**  
  Import historical financial data with ease

- 👤 **User Profiles**  
  Personalized financial preferences and income settings

- 🎨 **User-Friendly Interface**  
  Clean, responsive UI built for everyday use

---

## 🛠 Tech Stack

| Layer        | Technology                 |
| ------------ | -------------------------- |
| Frontend     | React 18, TypeScript, Vite |
| Styling      | Tailwind CSS               |
| Backend & DB | Supabase (PostgreSQL)      |
| Auth         | Supabase Auth              |
| Charts       | Chart.js, React-Chartjs-2  |
| Icons        | Lucide React               |
| QR Scanning  | @zxing/browser             |

---

## ✅ Prerequisites

- Node.js **18+**
- npm
- Git

---

## ⚡ Quick Setup

### Option 1: Automated Setup (Recommended)

````bash
npm run sync


### Option 2: Manual Setup
```bash
# 1. Install all dependencies
npm install

# 2. Set up environment files
npm run setup

# 3. Start both applications
npm run dev
````

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

This project uses environment variables for Supabase and app configuration.

1. Copy the example environment file:

````bash
cp .env.example .env

###3. Database Setup
The application uses Supabase (PostgreSQL) for data storage.

Ensure your Supabase project is set up correctly and the required environment variables are configured in the `.env` file.

### 4. Run the Application

```bash
# Start both frontend and backend
npm run dev

# Or start individually
npm run dev: backend  # Backend only (port 5000)
npm run dev: frontend # Frontend only (port 3000)
````

### 5. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api
- **API Health Check**: http://localhost:5000/api/health
- **API Documentation**: http://localhost:5000/api-docs

---

## 🔒 Security Features

### Rate Limiting

The API implements rate limiting to prevent abuse:

- **General API**: 100 requests per 15 minutes
- **Authentication routes**: 5 requests per 15 minutes (prevents brute force)
- **AI/Gemini routes**: 20 requests per 15 minutes

### Password Security

- Strong password requirements enforced during registration
- Real-time password strength meter with visual feedback
- Requirements: 9+ characters, uppercase, lowercase, number, special character

---

## 📚 API Documentation

Interactive API documentation is available via Swagger UI at `/api-docs` when the backend is running.

The documentation includes:

- All available endpoints
- Request/response schemas
- Authentication requirements
- Try-it-out functionality

---

## API Synchronization

The frontend and backend are fully synchronized with matching data models:

- **User Management**: Authentication handled via Supabase Auth
- **Expense Tracking**: Real-time expense management with categories
- **Goal Management**: Financial goals with progress tracking
- **Category Management**: Hierarchical categories with budgets

## Database Schema

The app uses Supabase (PostgreSQL) with the following main tables:

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

| Variable                 | Description                   | Required |
| ------------------------ | ----------------------------- | -------- |
| `VITE_SUPABASE_URL`      | Your Supabase project URL     | Yes      |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key | Yes      |
| `VITE_DEBUG`             | Enable debug mode             | No       |

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
2. Set environment variables in the Vercel dashboard
3. Deploy automatically on push to main branch

## Troubleshooting

### Common Issues

1. **Environment Variables Not Loading**

   - Ensure `.env` file is in the `frontend` directory
   - Restart the development server after adding variables

2. **Database Connection Errors**

   - Verify the Supabase URL and key are correct
   - Check if the database schema is properly set up
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

## Contributors

<a href="https://github.com/csxark/Wealth-Vault/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=csxark/Wealth-Vault&max=300" />
</a>

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:

- Create an issue in the GitHub repository
- Check the troubleshooting section above
- Review Supabase documentation for database-related issues
