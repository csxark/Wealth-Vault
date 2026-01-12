# 💰 Wealth Vault — Financial Wellness App

> **Take control of your money. Build healthier financial habits.**  
> Wealth Vault is a modern financial wellness platform that helps users understand spending behavior, set meaningful goals, and make smarter financial decisions using **AI-powered insights**.

---

## 🌐 Website Flow

Wealth Vault guides users through a **simple three-step flow**:

1. **Landing Page**  
   Introduces Wealth Vault, highlights features, and encourages users to sign up.  
   <div align="center">
     <img src="./assets/Home.png" alt="Home Page" width="80%" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);" />
   </div>

2. **Authentication (Sign Up / Login)**  
   Secure user registration and login powered by **Supabase Auth**.
   <div align="center">
     <img src="./assets/Auth.png" alt="Dashboard" width="80%" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);" />
   </div>

3. **Dashboard**  
   Personalized financial insights, expense tracking, goal management, and visual analytics.  
   <div align="center">
     <img src="./assets/Dashboard.png" alt="Dashboard" width="80%" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);" />
   </div>

---

## ✨ What Makes Wealth Vault Different?

Wealth Vault goes beyond simple expense tracking. It focuses on **behavior-aware finance**, helping users understand _why_ they spend — not just _what_ they spend.

### 🔑 Key Features

- 🧠 **Smart Spending Analysis** — Categorizes expenses into **Safe**, **Impulsive**, and **Anxious** patterns  
- 🎯 **Financial Goals Management** — Set, track, and visualize progress toward financial objectives  
- 🤖 **AI Financial Coach** — Personalized insights and actionable recommendations  
- 📷 **QR Code Expense Entry** — Log expenses instantly using QR codes and UPI  
- 📊 **Visual Analytics Dashboard** — Interactive charts for clear spending insights  
- 📁 **CSV Data Import** — Import historical financial data easily  
- 👤 **User Profiles** — Personalized financial preferences and income settings  
- 🎨 **User-Friendly Interface** — Clean, responsive UI built for everyday use  

---

## 🛠 Tech Stack

| Layer        | Technology                  |
| ------------ | --------------------------- |
| Frontend     | React 18, TypeScript, Vite  |
| Styling      | Tailwind CSS                |
| Backend & DB | Supabase (PostgreSQL)       |
| Auth         | Supabase Auth               |
| Charts       | Chart.js, React-Chartjs-2   |
| Icons        | Lucide React                |
| QR Scanning  | @zxing/browser              |

---

## ⚡ Quick Setup

### Option 1: Automated Setup (Recommended)

```bash
npm run sync
````

### Option 2: Manual Setup

```bash
# Install dependencies
npm install

# Set up environment variables
npm run setup

# Start both frontend and backend
npm run dev
```

### Windows Users

Double-click `run-setup.bat` for automated setup.

### Unix/Mac Users

```bash
chmod +x run-setup.sh
./run-setup.sh
```

---

## 🔧 Detailed Setup Instructions

### 1️⃣ Clone the Repository

```bash
git clone <repository-url>
cd Wealth-Vault
```

### 2️⃣ Environment Configuration

```bash
cp .env.example .env
```

Fill in your **Supabase credentials** and other required variables.

### 3️⃣ Database Setup

Ensure your Supabase project is correctly set up and **RLS policies** are enabled.

### 4️⃣ Run the Application

```bash
# Start both frontend and backend
npm run dev

# Or start individually
npm run dev:backend   # Backend only (port 5000)
npm run dev:frontend  # Frontend only (port 3000)
```

### 5️⃣ Access the Application

* **Frontend**: [http://localhost:3000](http://localhost:3000)
* **Backend API**: [http://localhost:5000/api](http://localhost:5000/api)
* **API Health Check**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
* **API Documentation**: [http://localhost:5000/api-docs](http://localhost:5000/api-docs)

---

## 🔒 Security Features

* **Rate Limiting**

  * General API: 100 requests / 15 min
  * Authentication routes: 5 requests / 15 min
  * AI/Gemini routes: 20 requests / 15 min

* **Password Security**

  * Strong password enforcement
  * Real-time password strength meter
  * Requirements: ≥9 characters, uppercase, lowercase, number, special character

---

## 📚 API Documentation

Interactive API documentation is available via **Swagger UI** at `/api-docs` when the backend is running.

Includes:

* All available endpoints
* Request/response schemas
* Authentication requirements
* Try-it-out functionality

---

## 📊 Dashboard & Key Components

### Dashboard

* Spending overview with charts
* Category breakdown: **Safe, Impulsive, Anxious**
* Budget tracking and safe spend zone

### Goals Management

* Create and track financial goals
* Visual progress indicators
* Goal completion tracking

### Profile Management

* Personal info & financial preferences
* Income and goal settings

### Expense Tracking

* QR code scanning for quick entry
* Manual expense logging
* Category classification

---

## 🌱 Project Structure

```
frontend/
├── src/
│   ├── components/     # React components
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # External library configurations
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Utility functions
├── public/             # Static assets
└── package.json        # Dependencies and scripts
```

---

## 🚀 Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in the Vercel dashboard
3. Deploy automatically on push to `main` branch

---

## ⚠️ Troubleshooting

* **Environment Variables Not Loading**
  Ensure `.env` exists in `frontend` and restart the dev server

* **Database Connection Errors**
  Verify Supabase URL/key, check schema, confirm RLS policies

* **Authentication Issues**
  Ensure Supabase Auth is enabled, check site URL, clear browser cache

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

## 👥 Contributors

<a href="https://github.com/csxark/Wealth-Vault/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=csxark/Wealth-Vault&max=300" />
</a>

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🛠 Support

* Open an issue in the GitHub repository
* Review [Supabase documentation](https://supabase.com/docs) for database issues
