# 🐳 Docker Deployment Guide

## Overview

This project includes a complete Docker containerization setup, enabling consistent development environments, simplified deployment, and improved scalability. Docker eliminates the "works on my machine" problem and streamlines the entire development-to-production workflow.

## 🎯 Why Docker for Wealth-Vault?

## 📊 Benefits Summary

| Benefit | Traditional Setup | Docker Setup |
|---------|------------------|--------------|
| Setup Time | 30-60 minutes | 2-5 minutes |
| Dependencies | Manual install | Automated |
| Consistency | Variable | Guaranteed |
| Isolation | System-wide | Container-level |
| Cleanup | Manual uninstall | One command |
| Team Onboarding | High friction | Minimal friction |
| CI/CD Integration | Complex | Straightforward |
| Production Parity | Challenging | Natural |

### Development Benefits
- **Zero Configuration** - No manual installation of Node.js, PostgreSQL, or dependencies
- **Instant Setup** - Get the entire stack running with a single command
- **Consistency** - Identical environment across all team members and CI/CD pipelines
- **Isolation** - No conflicts with other projects or system installations
- **Version Lock** - Guaranteed compatibility with specific Node.js and PostgreSQL versions

### Production Benefits
- **Scalability** - Easy horizontal scaling of frontend and backend services
- **Portability** - Deploy anywhere - local, cloud, or on-premises
- **Resource Efficiency** - Lightweight containers consume fewer resources than VMs
- **Fast Deployment** - Container images can be built once and deployed anywhere
- **Rollback Capability** - Quick rollback to previous versions if issues arise

### Operational Benefits
- **Simplified CI/CD** - Streamlined automated testing and deployment pipelines
- **Environment Parity** - Dev, staging, and production environments are identical
- **Dependency Management** - All dependencies packaged within containers
- **Easy Cleanup** - Remove entire environment with a single command
- **Documentation as Code** - Infrastructure defined in version-controlled files

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Docker Environment                     │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────┐ │
│  │   Frontend   │    │   Backend    │    │   DB     │ │
│  │              │    │              │    │          │ │
│  │  React       │───▶│  Express     │───▶│ Postgres │ │
│  │  Vite        │    │  Node.js     │    │          │ │
│  │              │    │              │    │          │ │
│  │  Port: 3000  │    │  Port: 5000  │    │Port: 5432│ │
│  └──────────────┘    └──────────────┘    └──────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Container Strategy
- **Frontend Container**: Multi-stage build optimizes image size, production-ready Vite build
- **Backend Container**: Node.js Alpine base for minimal footprint, production dependencies only
- **Database Container**: Official PostgreSQL 16 Alpine image with persistent volume storage
- **Network**: Isolated Docker network for secure inter-service communication
- **Volumes**: Named volumes ensure data persistence across container restarts

## 🚀 Quick Start

### Prerequisites
- [Docker Engine](https://docs.docker.com/get-docker/) 20.10+
- [Docker Compose](https://docs.docker.com/compose/install/) 2.0+

### Installation

```bash
# Clone the repository
git clone https://github.com/csxark/Wealth-Vault.git
cd Wealth-Vault

# Start all services
docker-compose up

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:5000/api
```

That's it! Docker handles:
- PostgreSQL database initialization
- Backend server configuration and startup
- Frontend build and deployment
- Network configuration between services
- Volume mounting for data persistence

## 📋 Commands Reference

### Service Management
```bash
# Start all services in foreground (see logs)
docker-compose up

# Start all services in background (detached mode)
docker-compose up -d

# Stop all services gracefully
docker-compose down

# Stop and remove all data (including database)
docker-compose down -v

# Restart specific service
docker-compose restart backend
```

### Development Workflow
```bash
# Rebuild containers after code changes
docker-compose up --build

# View real-time logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f backend

# Check service status and health
docker-compose ps

# Execute commands inside containers
docker-compose exec backend npm run db:migrate
docker-compose exec db psql -U wealthvault -d wealth_vault
```

### Maintenance
```bash
# Remove stopped containers and unused images
docker system prune

# Remove all unused Docker resources
docker system prune -a

# View Docker disk usage
docker system df
```

## ⚙️ Configuration

### Default Settings
| Service  | Port | Image | Credentials |
|----------|------|-------|-------------|
| Frontend | 3000 | node:20-alpine | - |
| Backend  | 5000 | node:20-alpine | - |
| Database | 5432 | postgres:16-alpine | wealthvault/wealthvault123 |

### Environment Variables
Modify `docker-compose.yml` to customize:
- Database credentials (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`)
- JWT configuration (`JWT_SECRET`, `JWT_EXPIRE`)
- API keys for optional services (`GEMINI_API_KEY`, `OPENAI_API_KEY`)
- Port mappings for conflict resolution

### Port Conflicts
If ports are already in use, modify port mappings in `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Map host port 3001 to container port 3000
```

## 🔧 Advanced Usage

### Database Operations
```bash
# Access PostgreSQL CLI
docker-compose exec db psql -U wealthvault -d wealth_vault

# Backup database
docker-compose exec db pg_dump -U wealthvault wealth_vault > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T db psql -U wealthvault wealth_vault

# Reset database (removes all data)
docker-compose down -v
docker-compose up
```

### Performance Optimization
```bash
# Build with no cache (clean build)
docker-compose build --no-cache

# Pull latest base images
docker-compose pull

# Optimize image sizes
docker image prune
```

## 🐛 Troubleshooting

### Common Issues

**Port Already in Use**
```bash
# Find process using port
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # Linux/Mac

# Change port in docker-compose.yml or stop conflicting service
```

**Container Won't Start**
```bash
# View detailed logs
docker-compose logs backend

# Restart with fresh build
docker-compose down -v
docker-compose up --build
```

**Database Connection Failed**
```bash
# Check if database is running
docker-compose ps

# View database logs
docker-compose logs db

# Verify DATABASE_URL in docker-compose.yml
```

**Out of Disk Space**
```bash
# Clean up unused resources
docker system prune -a --volumes

# Check disk usage
docker system df
```

## 🔒 Security Best Practices

### Production Deployment
1. **Change Default Credentials** - Never use default passwords in production
2. **Use Secrets Management** - Store sensitive data in Docker secrets or environment variables
3. **Enable HTTPS** - Use reverse proxy (nginx, traefik) with SSL certificates
4. **Restrict Network Access** - Don't expose database port publicly
5. **Regular Updates** - Keep base images and dependencies updated
6. **Resource Limits** - Set memory and CPU limits in docker-compose.yml
7. **Non-Root Users** - Run containers as non-root users when possible

### Development Security
- Never commit sensitive data to version control
- Use `.env` files for local development (already in `.gitignore`)
- Rotate JWT secrets regularly
- Use strong database passwords

## 🚀 Production Deployment

For production environments, consider:

### Cloud Platforms
- **AWS ECS/EKS** - Elastic Container Service or Kubernetes
- **Google Cloud Run** - Fully managed container platform
- **Azure Container Instances** - Serverless container deployment
- **DigitalOcean App Platform** - Simple container deployment

### Container Orchestration
- **Kubernetes** - For complex, scalable deployments
- **Docker Swarm** - For simpler clustering needs
- **Nomad** - Lightweight orchestration alternative

### CI/CD Integration
```yaml
# Example GitHub Actions workflow
- name: Build Docker images
  run: docker-compose build

- name: Run tests
  run: docker-compose run backend npm test

- name: Push to registry
  run: docker push your-registry/wealth-vault
```

## 📚 Additional Resources

- [Docker Official Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)

---
