# 💰 Wealth Vault — Financial Wellness App

> **Take control of your money. Build healthier financial habits.**  
> Wealth Vault is a modern financial wellness platform that helps users understand spending behavior, set meaningful goals, and make smarter financial decisions using **AI-powered insights**.

## 📊 Badges



![GitHub stars](https://img.shields.io/github/stars/csxark/Wealth-Vault?style=social)
![GitHub forks](https://img.shields.io/github/forks/csxark/Wealth-Vault?style=social)
![Visitors](https://visitor-badge.laobi.icu/badge?page_id=csxark.Wealth-Vault)
![GitHub issues](https://img.shields.io/github/issues/csxark/Wealth-Vault)
![License](https://img.shields.io/github/license/csxark/Wealth-Vault)


---

## 🌐 Website Flow

Wealth Vault guides users through a **simple three-step flow**:

1. **Landing Page**  
   Introduces Wealth Vault, highlights features, and encourages users to sign up.  
   <div align="center">
     <img src="./assets/Home.png" alt="Home Page" width="80%" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);" />
   </div>

2. **Authentication (Sign Up / Login)**  
   Secure user registration and login powered by **JWT Authentication**.
   <div align="center">
     <img src="./assets/Auth.png" alt="Dashboard" width="80%" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);" />
   </div>

3. **Dashboard**  
   Personalized financial insights, expense tracking, goal management, and visual analytics.  
   <div align="center">
     <img src="./assets/Dashboard.png" alt="Dashboard" width="80%" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);" />
   </div>

> Screenshots are illustrative and taken from the current main UI, but may occasionally show in-progress features. The running app reflects the source of truth for what is available today.

---

## ✨ What Makes Wealth Vault Different?

Wealth Vault goes beyond simple expense tracking. It focuses on **behavior-aware finance**, helping users understand _why_ they spend — not just _what_ they spend.

### 🔑 Key Features (Available Today)

These features are implemented in the current main branch:

- 🧠 **Smart Spending Analysis**  
  Categorizes expenses into **Safe**, **Impulsive**, and **Anxious** spending patterns.

- 🎯 **Financial Goals Management**  
  Set, track, and visualize progress toward financial objectives.

- 🤖 **AI Financial Coach**  
  Personalized insights and actionable recommendations.
  - Requires configuring `GEMINI_API_KEY` for live AI responses; without it, the coach falls back to limited guidance.

- 📷 **QR Code Expense Entry**  
  Log expenses using QR codes and UPI, including receipt and expense QR flows.

- 📊 **Visual Analytics Dashboard**  
  Interactive charts for clear spending and goal insights.

- 📁 **CSV Data Import**  
  Import historical transaction data from CSV files to get started quickly.

- 👤 **User Profiles**  
  Personalized financial preferences and income settings.

- 🎨 **User-Friendly Interface**  
  Clean, responsive UI designed for everyday use.

### 🚧 Roadmap & Coming Soon

The codebase contains foundations for additional capabilities that are still evolving and may not be fully productized in the main UI yet. Examples include:

- Real-time notifications and streaming updates powered by WebSockets and polling fallbacks.
- Deeper multi-tenant administration and advanced workspace controls.
- Expanded AI journeys and simulations for long-term planning and "what-if" scenarios.

These items should be considered **in development / coming soon**, not guaranteed as stable user-facing features. Check the documentation under `backend/` (for example, WebSocket and multi-tenancy guides) and release notes for their current status.

---

## 🛠 Tech Stack

| Layer        | Technology                  |
| ------------ | --------------------------- |
| Frontend     | React 18, TypeScript, Vite  |
| Styling      | Tailwind CSS                |
| Backend      | Node.js, Express.js         |
| Database     | PostgreSQL                  |
| ORM          | Drizzle ORM                 |
| Auth         | JWT Authentication          |
| Charts       | Chart.js, React-Chartjs-2   |
| Icons        | Lucide React                |
| QR Scanning  | @zxing/browser              |
| AI           | Google Gemini API           |
| Caching      | Redis                       |

---

## ✅ Prerequisites

- Node.js **18+**
- npm
- Git

**OR** 

- Docker & Docker Compose ([see Docker setup](DOCKER_GUIDE.md))

---

## ⚡ Quick Setup

### 🚀 Automated Setup (Recommended)

Run this single command to set up everything automatically:

```bash
npm run sync
```

This will:

- Install all dependencies (root, backend, and frontend)
- Create environment configuration files
- Set up the database connection

---

### 🐳 Docker Setup

If you have Docker installed:

```bash
git clone https://github.com/csxark/Wealth-Vault.git
cd Wealth-Vault
docker-compose up
```

Access at http://localhost:3000 | [Full Docker docs →](DOCKER_GUIDE.md)


---

### 🔧 Manual Setup (Step by Step)

If you prefer manual control or the automated setup fails, follow these steps:

#### Step 1: Install Dependencies

```bash
# Install root dependencies and all sub-projects
npm install
```

**Or install individually:**

```bash
# Root dependencies
npm install

# Backend dependencies
cd .\backend\
npm install
cd ..

# Frontend dependencies
cd .\frontend\
npm install
cd ..
```

#### Step 2: Configure Environment Variables

**Automatic method:**

```bash
npm run setup
```

This creates `.env` files in both `backend/` and `frontend/` directories with template values.

**Manual method (Windows):**

1. **Backend environment:**

   - Copy `backend\.env.example` to `backend\.env`
   - Edit `backend\.env` and update:
     ```
     DATABASE_URL=postgresql://username:password@localhost:5432/wealth_vault
     DIRECT_URL=postgresql://username:password@localhost:5432/wealth_vault
     JWT_SECRET=your-super-secret-jwt-key-here
     PORT=5000
     NODE_ENV=development
     FRONTEND_URL=http://localhost:3000
     ```

2. **Frontend environment:**
   - Copy `frontend\.env.example` to `frontend\.env`
   - Edit `frontend\.env` and update:
     ```
     VITE_API_URL=http://localhost:5000
     ```

> **📝 Note:** For PostgreSQL setup, you can use a local PostgreSQL instance or a cloud provider like AWS RDS, Google Cloud SQL, or Azure Database.

#### Step 3: Set Up Database

The application uses PostgreSQL with Drizzle ORM for data storage. You have two options:

**Option A: Local PostgreSQL**
- Install PostgreSQL locally
- Create a database named `wealth_vault`
- Update the `DATABASE_URL` in `backend\.env`

**Option B: Docker PostgreSQL (Recommended for development)**
```bash
# Start PostgreSQL with Docker
docker run --name wealth-vault-db -e POSTGRES_DB=wealth_vault -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:16-alpine
```

**Option C: Cloud PostgreSQL**
- Use services like AWS RDS, Google Cloud SQL, Azure Database, or Supabase
- Update the `DATABASE_URL` in `backend\.env` with your cloud database URL

#### Step 4: Run Database Migrations

```bash
cd backend
npm run db:push  # Push schema to database
npm run db:migrate  # Run any pending migrations
```

#### Step 5: Start the Application

**Start both frontend and backend together:**

```bash
npm run dev
```

**Or start individually:**

```bash
#install this package first
npm install concurrently --save-dev
# Backend only (runs on port 5000)
npm run dev:backend

# Frontend only (runs on port 3000)
npm run dev:frontend
```

**For separate terminals:**

```powershell
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 5️⃣ Access the Application

* **Frontend**: [http://localhost:3000](http://localhost:3000)
* **Backend API**: [http://localhost:5000/api](http://localhost:5000/api)
* **API Health Check**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
* **API Documentation**: [http://localhost:5000/api-docs](http://localhost:5000/api-docs)

---

## 🔒 Security Overview

Wealth Vault is designed with multiple layers of defense across authentication, data protection, request hardening, and auditing. This section summarizes the key security features implemented in the app.

For a detailed security policy and disclosure process, see [SECURITY.md](SECURITY.md).

### Multi-Factor Authentication (MFA)

- **TOTP-based MFA** using industry-standard Time-based One-Time Passwords (compatible with Google Authenticator, Authy, Microsoft Authenticator, etc.).
- **MFA enrollment and management** via the profile page (Two-Factor Authentication section), backed by `/auth/mfa/*` API endpoints.
- **Recovery codes** (single-use) for account recovery when an authenticator device is unavailable.
- **Secure storage of MFA data**:
  - MFA secrets are encrypted at rest using AES-256-GCM.
  - Recovery codes are hashed (not stored in plain text) and can be regenerated.

More implementation details are available in [MFA_README.md](MFA_README.md).

### Password Security & Authentication

- Passwords are **hashed with bcrypt** before storage; plain-text passwords are never persisted.
- Strong password guidance and validation via a **password strength meter** (zxcvbn-based) to discourage weak credentials.
- JWT-based authentication with configurable token lifetime.

### Rate Limiting & Abuse Protection

- Centralized rate limiting middleware protects critical endpoints:
  - General API routes: defensive limits against bulk abuse.
  - Authentication routes: stricter limits to slow brute-force login attempts.
  - AI / Gemini routes: dedicated limits to protect upstream APIs and control cost.

### Security Headers & Transport

- **Helmet** is enabled globally to set secure HTTP headers, including:
  - `X-Content-Type-Options`, `X-DNS-Prefetch-Control`, `X-Download-Options`, and related best-practice headers.
  - Custom cross-origin policies tuned for the SPA frontend:
    - `Cross-Origin-Resource-Policy: cross-origin`
    - `Cross-Origin-Opener-Policy: same-origin-allow-popups`.
- CORS is configured with an **allowlist of frontend origins** (local dev ports plus `FRONTEND_URL`), rejecting unknown origins.
- Production deployments are expected to run behind HTTPS (for example via Nginx as documented in [nginx/README.md](nginx/README.md)).

### Input Sanitization & Hardening

- Request bodies are sanitized to reduce the risk of XSS and injection attacks.
- Strict JSON body size limits and URL-encoded payload limits are enforced.

### Audit Logging

- A dedicated **audit logging pipeline** records high-value security events and sensitive changes, including:
  - Authentication flows (login, logout, token refresh, registration).
  - Authorization and RBAC changes (roles, permissions).
  - Requests resulting in `401`, `403`, or `429` responses.
  - Mutating API operations (create/update/delete) for financial data.
- Sensitive fields (passwords, tokens, secrets, etc.) are **automatically redacted** from audit payloads before persistence.
- Each audit log entry includes a **cryptographic hash** linked to the previous entry, forming an append-only hash chain to support tamper-evidence.
- Request-level audit logging is wired through middleware that attaches a request ID and response timing; this supports forensic analysis and incident response.

These mechanisms are continually evolving; when adding new features, follow existing patterns (rate limiting, sanitization, audit logging, and MFA-aware authentication) to keep the security posture consistent.

---

## 📚 API Documentation

Interactive API documentation is available via **Swagger UI** at `/api-docs` when the backend is running.

Includes:

* All available endpoints
* Request/response schemas
* Authentication requirements
* Try-it-out functionality

---

## API Synchronization

The frontend and backend are fully synchronized with matching data models:

- **User Management**: JWT-based authentication with secure token handling
- **Expense Tracking**: Real-time expense management with categories
- **Goal Management**: Financial goals with progress tracking
- **Category Management**: Hierarchical categories with budgets

## Database Schema

The app uses PostgreSQL with Drizzle ORM and the following main tables:

- **profiles**: User profile information
- **transactions**: Financial transactions with spending categories
- **goals**: Financial goals and progress tracking

All tables have Row Level Security (RLS) enabled to ensure users can only access their own data.

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

## Environment Variables

### Backend Variables

| Variable          | Description                          | Required |
| ----------------- | ------------------------------------ | -------- |
| `DATABASE_URL`    | PostgreSQL connection string         | Yes      |
| `DIRECT_URL`      | Direct PostgreSQL connection string  | Yes      |
| `JWT_SECRET`      | Secret key for JWT signing           | Yes      |
| `JWT_EXPIRE`      | JWT token expiration time            | No       |
| `PORT`            | Backend server port                  | No       |
| `NODE_ENV`        | Environment (development/production) | No       |
| `FRONTEND_URL`    | Frontend application URL             | No       |
| `REDIS_URL`       | Redis connection string              | No       |
| `GEMINI_API_KEY`  | Google Gemini AI API key             | No       |

### Frontend Variables

| Variable      | Description              | Required |
| ------------- | ------------------------ | -------- |
| `VITE_API_URL`| Backend API URL          | Yes      |
| `VITE_DEBUG`  | Enable debug mode        | No       |

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

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

This project can be deployed in several ways depending on your infrastructure and operational needs.

### 1. Docker + Nginx (Production, Recommended)

For a full-stack deployment (frontend, backend, and database) on your own infrastructure or a VM:

- Use the provided Docker configuration and compose files:
  - `docker-compose.yml` (development)
  - `docker-compose.prod.yml` (production)
  - `backend/Dockerfile`, `frontend/Dockerfile`
- Use Nginx as an HTTPS reverse proxy in front of the app:
  - `nginx/nginx.conf`
  - `nginx/ssl/` (place certificates here)

High-level production steps:

1. Review the full Docker documentation: [DOCKER_GUIDE.md](DOCKER_GUIDE.md)
2. Copy `.env.prod.example` to `.env.prod` (or similar) and set strong secrets and production URLs
3. Configure Nginx and SSL certificates (see [nginx/README.md](nginx/README.md))
4. Run the stack:
  ```bash
  docker-compose -f docker-compose.prod.yml up -d
  ```
5. Access the app via your Nginx HTTPS endpoint (for example, `https://yourdomain.com`)

### 2. Frontend on Vercel / Static Hosting

You can deploy the frontend as a static site to Vercel, Netlify, Cloudflare Pages, or similar platforms. The backend must be deployed separately (see the next section).

#### Frontend build

```bash
cd frontend
npm install
npm run build
```

This produces a static build in `frontend/dist`.

#### Vercel example

1. Connect your GitHub repository to Vercel
2. Set build settings:
  - Build command: `npm run build`
  - Output directory: `dist`
3. Configure environment variables in the Vercel dashboard, for example:
  - `VITE_API_URL=https://api.yourdomain.com`
4. Deploy automatically on push to `main` (or your chosen branch)

The same build output can be served by other static hosts (Netlify, Cloudflare Pages, S3 + CloudFront) by uploading `frontend/dist` and configuring SPA-style routing.

### 3. Backend on Container Platforms

The backend is a Node.js service that can be deployed as a container to platforms like:

- Render, Railway, Fly.io
- AWS ECS/Fargate, AWS App Runner
- Azure App Service (for Containers)
- Google Cloud Run or similar

Typical steps:

1. Build the backend image using `backend/Dockerfile`:
  ```bash
  cd backend
  docker build -t wealth-vault-backend:latest .
  ```
2. Push the image to your container registry (Docker Hub, ECR, ACR, GCR, etc.)
3. Create a service in your platform of choice, exposing port `5000`
4. Configure environment variables (see next section) and health checks on `/api/health`
5. Point your frontend `VITE_API_URL` to the backend URL (for example, `https://api.yourdomain.com`)

### 4. Production Environment Configuration

For a secure production setup, configure at minimum the following:

**Backend (examples):**

- `NODE_ENV=production`
- `PORT=5000`
- `DATABASE_URL` — connection string to your managed PostgreSQL instance
- `DIRECT_URL` — direct DB URL for migrations/maintenance
- `JWT_SECRET` — long, random secret key
- `JWT_EXPIRE` — token lifetime (for example, `24h`)
- `FRONTEND_URL` — public URL of the frontend (for example, `https://yourdomain.com`)
- `REDIS_URL` — Redis instance URL (for caching, if used)
- `GEMINI_API_KEY` — AI provider key (if using AI features)
- `SENDGRID_API_KEY` or other email provider keys

**Frontend (examples):**

- `VITE_API_URL` — public URL of the backend API (for example, `https://api.yourdomain.com`)
- `VITE_DEBUG` — set to `false` in production

Refer to [DOCKER_GUIDE.md](DOCKER_GUIDE.md) and `backend/.env.example` for a more complete list of environment variables and their roles.

### 5. SSL / HTTPS Configuration

For production, always terminate HTTPS in front of the application (for example, using Nginx, a cloud load balancer, or your hosting provider’s TLS termination).

Using the provided Nginx setup:

1. Obtain certificates from a trusted CA (for example, Let’s Encrypt) or generate self-signed certificates for testing
2. Place your certificates in `nginx/ssl/` (for example, `cert.pem`, `private.key`)
3. Update `nginx/nginx.conf` with your domain and certificate paths
4. Mount the Nginx config and SSL directory in `docker-compose.prod.yml` as documented in [nginx/README.md](nginx/README.md)
5. Expose port `443` from the Nginx container and route traffic to the backend/frontend services

If you are deploying to a managed platform (for example, Vercel, Netlify, Cloudflare, AWS ALB), you can usually enable HTTPS directly in that platform’s dashboard without managing certificates manually.

### 6. Monitoring, Logging, and Scaling

To operate Wealth Vault reliably in production, set up basic observability and scaling:

**Logging:**

- Collect container logs (`docker-compose logs -f` or platform log streams)
- Centralize logs using your cloud provider’s logging service or a stack like ELK/EFK

**Health checks:**

- Use the backend health endpoint at `/api/health` for container, load balancer, or uptime monitoring

**Metrics and monitoring:**

- Monitor CPU, memory, and response times for backend containers
- Track database health (connections, slow queries, storage)
- Optionally integrate with Prometheus/Grafana or your cloud provider’s monitoring tools

**Scaling:**

- Scale backend instances horizontally (increase replica count) when CPU or latency is high
- Ensure the database and Redis (if used) are sized appropriately and can handle increased connections
- For Docker Swarm/Kubernetes, configure resource limits/requests and autoscaling based on metrics

These practices help ensure smooth, secure, and predictable production deployments across different platforms.

---

## Troubleshooting

This section lists common problems and concrete steps to diagnose and fix them.

### 1. Environment & Setup Issues

**Symptoms:** `process.env` values are `undefined`, app crashes on startup, or frontend cannot reach the backend.

- Ensure `.env` files exist in the correct directories:
  - `backend/.env`
  - `frontend/.env`
- After editing `.env` files, restart the dev servers (`npm run dev`, or individual backend/frontend dev commands).
- Check variable naming and formatting:
  - No spaces around `=` (use `KEY=value`, not `KEY = value`).
  - Keys must match those documented in the Environment Variables section.
- If Docker is used, confirm the compose file is loading the right env file (`.env`, `.env.prod`, etc.).

### 2. Database Connection & Migration Issues

**Symptoms:** Backend fails to start with connection errors, 500 errors on API calls, or schema mismatch errors.

- Verify the PostgreSQL connection string in `backend/.env` (`DATABASE_URL` and `DIRECT_URL`).
- Check that PostgreSQL is running and reachable:
  - Local: confirm the container or local service is up and listening on port `5432`.
  - Remote: test connectivity with a DB client using the same URL.
- Ensure the database and user exist and have the right permissions.
- Run migrations from the backend directory:
  - `npm run db:push` — sync schema to the database.
  - `npm run db:migrate` — apply any pending migrations.
- If you see “relation does not exist” or similar errors:
  - Re-check that you are pointing to the correct database (dev vs test vs prod).
  - Re-run the migration commands and inspect the logs for failures.
- For Docker-based DB (from the README’s Docker instructions):
  - Ensure the database container is healthy (`docker ps`, `docker logs` for the DB container).

### 3. Authentication & MFA Issues

**Symptoms:** Login fails unexpectedly, JWT validation errors, or MFA prompts behave unexpectedly.

- Confirm `JWT_SECRET` is set in `backend/.env` and is a sufficiently long, random string (at least 32 characters).
- Check token lifetime settings (for example, `JWT_EXPIRE`) if tokens expire sooner than expected.
- If you cannot log in after changing auth settings:
  - Clear browser local storage / cookies and try again.
  - Make sure the frontend `VITE_API_URL` matches the backend URL (including protocol and port).
- MFA-specific issues:
  - Ensure your device time is accurate—TOTP codes are time-based.
  - If setup fails, try regenerating the QR code and scanning again.
  - If locked out, use recovery codes (if enabled) or disable MFA via admin/dev tooling as appropriate.

### 4. Performance & Latency Problems

**Symptoms:** Slow page loads, delayed API responses, or high CPU usage during local development.

- Start with the backend health endpoint: `GET /api/health`.
  - Use it to verify database and Redis connectivity and general service status.
- Check logs for slow endpoints:
  - Backend logs (via `morgan`, request logging, and performance middleware) will highlight slow requests.
- Common local performance tips:
  - Ensure you are not running multiple dev servers against the same database unintentionally.
  - Disable unnecessary heavy background jobs in development if they are enabled.
  - Confirm your machine is not resource-starved (CPU/RAM/bandwidth).
- For frontend slowness:
  - Use the browser dev tools (Network/Performance tabs) to identify large or repeated requests.
  - Set `VITE_DEBUG=true` temporarily to see additional logs during development.

### 5. Frontend–Backend Connectivity

**Symptoms:** Frontend shows “Network error”, cannot fetch data, or CORS errors in the browser console.

- Confirm the backend is running on the expected port (default `5000`).
- Ensure `VITE_API_URL` in `frontend/.env` points to the correct backend URL.
- If you see CORS-related errors:
  - Verify the frontend origin (e.g., `http://localhost:3000` or Vite dev port) is included in the backend CORS allowlist or `FRONTEND_URL`.
  - Restart the backend after changing CORS-related environment variables.

### Debug Mode

Enable debug mode in the frontend by setting `VITE_DEBUG=true` in the frontend environment file to see more detailed console logs during development.

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
