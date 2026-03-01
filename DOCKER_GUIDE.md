# Docker Guide for Wealth Vault

## Overview

This guide provides comprehensive instructions for running Wealth Vault using Docker and Docker Compose. The application consists of three main services: PostgreSQL database, Node.js backend, and React frontend.

## Included Files

This Docker setup includes the following configuration files:

- `docker-compose.yml` - Development environment configuration
- `docker-compose.prod.yml` - Production environment configuration
- `DOCKER_GUIDE.md` - This comprehensive documentation
- `.env.prod.example` - Production environment variables template
- `nginx/nginx.conf` - Nginx reverse proxy configuration
- `nginx/README.md` - Nginx setup instructions
- `backend/Dockerfile` - Backend container configuration
- `frontend/Dockerfile` - Frontend container configuration
- `.dockerignore` - Docker build exclusions

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- At least 4GB RAM available
- 10GB free disk space

## Quick Start

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Wealth-Vault
   ```

2. **Start all services:**
   ```bash
   docker-compose up -d
   ```

3. **Check service status:**
   ```bash
   docker-compose ps
   ```

4. **View logs:**
   ```bash
   docker-compose logs -f
   ```

5. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000
   - Database: localhost:5432

## Docker Compose Configuration

### Complete docker-compose.yml

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  db:
    image: postgres:16-alpine
    container_name: wealth-vault-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: wealthvault
      POSTGRES_PASSWORD: wealthvault123
      POSTGRES_DB: wealth_vault
      POSTGRES_INITDB_ARGS: "--encoding=UTF-8"
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/drizzle:/docker-entrypoint-initdb.d/drizzle
    networks:
      - wealth-vault-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U wealthvault -d wealth_vault"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache (Optional)
  redis:
    image: redis:7-alpine
    container_name: wealth-vault-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - wealth-vault-network
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  # Backend Service
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: wealth-vault-backend
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      - DATABASE_URL=postgresql://wealthvault:wealthvault123@db:5432/wealth_vault
      - DIRECT_URL=postgresql://wealthvault:wealthvault123@db:5432/wealth_vault
      - PORT=5000
      - JWT_SECRET=your-super-secret-jwt-key-change-in-production
      - JWT_EXPIRE=7d
      - NODE_ENV=development
      - FRONTEND_URL=http://localhost:3000
      - REDIS_URL=redis://redis:6379
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    volumes:
      - ./backend:/app
      - /app/node_modules
      - backend_logs:/app/logs
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - wealth-vault-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Frontend Service
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: wealth-vault-frontend
    restart: unless-stopped
    ports:
      - "3000:3002"
    environment:
      - VITE_API_URL=http://localhost:5000
    volumes:
      - ./frontend:/app
      - /app/node_modules
    depends_on:
      - backend
    networks:
      - wealth-vault-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  backend_logs:
    driver: local

networks:
  wealth-vault-network:
    driver: bridge
```

## Environment Variables Setup

### Development Environment

Create a `.env` file in the backend directory:

```bash
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://wealthvault:wealthvault123@db:5432/wealth_vault
DIRECT_URL=postgresql://wealthvault:wealthvault123@db:5432/wealth_vault

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRE=7d

# CORS Configuration
FRONTEND_URL=http://localhost:3000

# Redis Configuration
REDIS_URL=redis://redis:6379

# AI Configuration
GEMINI_API_KEY=your-gemini-api-key-here

# Email Configuration (Optional)
SENDGRID_API_KEY=your-sendgrid-api-key
```

### Production Environment

For production, use stronger secrets and external services:

```bash
# Server Configuration
PORT=5000
NODE_ENV=production

# Database Configuration (Use managed PostgreSQL)
DATABASE_URL=postgresql://user:password@your-db-host:5432/wealth_vault
DIRECT_URL=postgresql://user:password@your-db-host:5432/wealth_vault

# JWT Configuration (Generate strong secret)
JWT_SECRET=generated-256-bit-secret-key
JWT_EXPIRE=24h

# CORS Configuration
FRONTEND_URL=https://yourdomain.com

# Redis Configuration (Use managed Redis)
REDIS_URL=redis://your-redis-host:6379

# AI Configuration
GEMINI_API_KEY=your-production-gemini-key

# Email Configuration
SENDGRID_API_KEY=your-production-sendgrid-key

# SSL Configuration (if using HTTPS)
SSL_CERT_PATH=/path/to/ssl/cert.pem
SSL_KEY_PATH=/path/to/ssl/private.key
```

## Database Initialization

### Automatic Initialization

The PostgreSQL container automatically initializes the database using:

1. **Environment variables** for user, password, and database creation
2. **Volume mounts** for persistent data storage
3. **Health checks** to ensure database readiness

### Manual Database Setup

If you need to manually initialize or migrate the database:

```bash
# Access database container
docker-compose exec db psql -U wealthvault -d wealth_vault

# Run migrations (from backend container)
docker-compose exec backend npm run db:migrate

# Generate migration files
docker-compose exec backend npm run db:generate

# Push schema changes
docker-compose exec backend npm run db:push
```

### Database Backup and Restore

```bash
# Backup database
docker-compose exec db pg_dump -U wealthvault wealth_vault > backup.sql

# Restore database
docker-compose exec -T db psql -U wealthvault -d wealth_vault < backup.sql
```

## Volume Mounting for Persistent Data

### Named Volumes

The docker-compose.yml defines several named volumes:

- `postgres_data`: Stores PostgreSQL data persistently
- `redis_data`: Stores Redis cache data
- `backend_logs`: Stores application logs

### Bind Mounts

For development with hot-reloading:

- `./backend:/app`: Mounts source code for live updates
- `./frontend:/app`: Mounts source code for live updates
- `/app/node_modules`: Anonymous volume prevents npm install conflicts

### Volume Management

```bash
# List all volumes
docker volume ls

# Inspect a specific volume
docker volume inspect wealth-vault_postgres_data

# Remove unused volumes
docker volume prune

# Backup volumes
docker run --rm -v wealth-vault_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz -C /data .
```

## Production Docker Deployment

### Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - postgres_prod_data:/var/lib/postgresql/data
    networks:
      - wealth-vault-prod
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  backend:
    image: wealth-vault-backend:latest
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - NODE_ENV=production
      - FRONTEND_URL=${FRONTEND_URL}
    ports:
      - "5000:5000"
    networks:
      - wealth-vault-prod
    depends_on:
      - db
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
      restart_policy:
        condition: on-failure

  frontend:
    image: wealth-vault-frontend:latest
    environment:
      - VITE_API_URL=${BACKEND_URL}
    ports:
      - "80:3002"
    networks:
      - wealth-vault-prod
    depends_on:
      - backend
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M

volumes:
  postgres_prod_data:
    driver: local

networks:
  wealth-vault-prod:
    driver: overlay
```

## Production Docker Deployment

### Production Docker Compose

A production-ready docker-compose file is provided (`docker-compose.prod.yml`) with:

- **Resource limits** and reservations
- **Health checks** for all services
- **Rolling updates** configuration
- **Nginx reverse proxy** for SSL termination
- **Optimized Redis** configuration with memory limits

### Environment Configuration

Use the provided `.env.prod.example` file for production environment variables:

```bash
cp .env.prod.example .env.prod
# Edit .env.prod with your production values
docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

### SSL/TLS Setup

The production setup includes Nginx with SSL/TLS:

1. **SSL certificates** should be placed in `nginx/ssl/`
2. **Nginx configuration** is provided in `nginx/nginx.conf`
3. **Domain configuration** needs to be updated in the config files

### Build and Deploy

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy to production
docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d

# Scale services as needed
docker-compose -f docker-compose.prod.yml up -d --scale backend=3 --scale frontend=2
```

### Using Docker Swarm

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.prod.yml wealth-vault

# Check services
docker stack services wealth-vault

# Scale services
docker service scale wealth-vault_backend=3
```

### Using Kubernetes

Create `k8s/` directory with deployment files:

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wealth-vault-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: wealth-vault-backend
  template:
    metadata:
      labels:
        app: wealth-vault-backend
    spec:
      containers:
      - name: backend
        image: wealth-vault-backend:latest
        ports:
        - containerPort: 5000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: database-url
        resources:
          limits:
            memory: "512Mi"
          requests:
            memory: "256Mi"
```

## Troubleshooting Common Docker Issues

### Service Won't Start

**Issue:** Container fails to start
```bash
# Check container logs
docker-compose logs <service-name>

# Check container status
docker-compose ps

# Restart specific service
docker-compose restart <service-name>
```

### Database Connection Issues

**Issue:** Backend can't connect to database
```bash
# Check database health
docker-compose exec db pg_isready -U wealthvault -d wealth_vault

# Verify environment variables
docker-compose exec backend env | grep DATABASE

# Test database connection
docker-compose exec backend npm run db:studio
```

### Port Conflicts

**Issue:** Port already in use
```bash
# Find process using port
netstat -tulpn | grep :5000

# Change port mapping in docker-compose.yml
ports:
  - "5001:5000"  # Change host port
```

### Memory Issues

**Issue:** Container runs out of memory
```bash
# Check memory usage
docker stats

# Increase Docker memory limit
# Docker Desktop: Settings > Resources > Memory

# Add memory limits to docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
```

### Volume Permission Issues

**Issue:** Permission denied on mounted volumes
```bash
# Fix permissions on Linux/Mac
sudo chown -R $USER:$USER .

# On Windows, ensure Docker has file sharing permissions
# Docker Desktop: Settings > Resources > File Sharing
```

### Build Failures

**Issue:** Docker build fails
```bash
# Build with no cache
docker-compose build --no-cache

# Check build logs
docker-compose build --progress=plain

# Clean up build cache
docker system prune -f
```

### Network Issues

**Issue:** Services can't communicate
```bash
# Check network
docker network ls

# Inspect network
docker network inspect wealth-vault_default

# Restart network
docker-compose down
docker-compose up -d
```

### Hot Reload Not Working

**Issue:** Changes not reflected in development
```bash
# Check if volumes are properly mounted
docker-compose exec backend ls -la /app

# Restart development server
docker-compose exec backend npm run dev

# Rebuild without cache
docker-compose up -d --build backend
```

### Database Migration Issues

**Issue:** Migrations fail to run
```bash
# Check database connectivity
docker-compose exec backend npm run db:studio

# Run migrations manually
docker-compose exec backend npm run db:migrate

# Reset database (WARNING: destroys data)
docker-compose down -v
docker-compose up -d db
```

## Performance Optimization

### Docker Best Practices

1. **Use Multi-stage Builds:**
```dockerfile
# Multi-stage build for production
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

2. **Optimize Layer Caching:**
```dockerfile
# Copy package files first
COPY package*.json ./
RUN npm install

# Copy source code after
COPY . .
```

3. **Use .dockerignore:**
```
node_modules
.git
.env
*.log
coverage/
.nyc_output/
```

### Resource Management

```yaml
# Set resource limits
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Security Considerations

### Production Security

1. **Use Strong Secrets:**
```bash
# Generate secure JWT secret
openssl rand -hex 32
```

2. **Environment Variables:**
- Never commit secrets to version control
- Use Docker secrets or external secret management
- Rotate secrets regularly

3. **Network Security:**
```yaml
# Use internal networks
services:
  db:
    networks:
      - internal
  backend:
    networks:
      - internal
      - external

networks:
  internal:
    internal: true
  external:
```

4. **Image Security:**
```bash
# Scan images for vulnerabilities
docker scan wealth-vault-backend

# Use specific image tags
image: postgres:16-alpine@sha256:...
```

## Monitoring and Logging

### Health Checks

All services include health checks for automatic recovery:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### Logging

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend

# Follow logs with timestamps
docker-compose logs -f --timestamps

# Export logs
docker-compose logs > app_logs.txt
```

### Monitoring Tools

Consider integrating:
- **Prometheus** for metrics collection
- **Grafana** for visualization
- **ELK Stack** for log aggregation
- **cAdvisor** for container metrics

## Backup and Recovery

### Automated Backups

```bash
# Create backup script
#!/bin/bash
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Database backup
docker-compose exec db pg_dump -U wealthvault wealth_vault > $BACKUP_DIR/db_$DATE.sql

# Volume backup
docker run --rm -v wealth-vault_postgres_data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/volumes_$DATE.tar.gz -C /data .
```

### Disaster Recovery

1. **Stop services:** `docker-compose down`
2. **Restore volumes:** Extract backup archives
3. **Restore database:** Import SQL dump
4. **Start services:** `docker-compose up -d`

## Development Workflow

### Local Development

```bash
# Start development environment
docker-compose up -d

# Run tests
docker-compose exec backend npm test

# Run linting
docker-compose exec frontend npm run lint

# Access database
docker-compose exec db psql -U wealthvault -d wealth_vault
```

### CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Docker CI/CD

on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Build Docker images
      run: docker-compose build

    - name: Run tests
      run: docker-compose run --rm backend npm test

    - name: Deploy to production
      if: github.ref == 'refs/heads/main'
      run: |
        docker-compose -f docker-compose.prod.yml up -d
```

This comprehensive Docker guide covers all aspects of running Wealth Vault in containerized environments, from development setup to production deployment and troubleshooting.