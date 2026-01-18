# Frontend Dockerfile for Wealth-Vault
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Start development server (no build needed)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
