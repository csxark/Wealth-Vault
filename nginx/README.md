# Nginx Configuration for Wealth Vault

This directory contains the Nginx configuration for production deployment of Wealth Vault.

## Files

- `nginx.conf` - Main Nginx configuration file
- `ssl/` - Directory for SSL certificates (create this directory and add your certificates)

## SSL Certificate Setup

1. **Obtain SSL certificates** from a trusted CA (Let's Encrypt, etc.) or generate self-signed certificates for testing:

   ```bash
   # Generate self-signed certificate (for testing only)
   openssl req -x509 -newkey rsa:4096 -keyout ssl/private.key -out ssl/cert.pem -days 365 -nodes -subj "/CN=yourdomain.com"
   ```

2. **Update nginx.conf** with your domain name:
   - Replace `yourdomain.com` with your actual domain
   - Update SSL certificate paths if different

3. **File permissions**:
   ```bash
   chmod 600 ssl/private.key
   chmod 644 ssl/cert.pem
   ```

## Configuration Features

### Security
- SSL/TLS encryption
- Security headers (X-Frame-Options, CSP, etc.)
- Rate limiting for API endpoints
- Blocked access to sensitive files

### Performance
- Gzip compression
- Static asset caching
- Connection keep-alive
- Optimized SSL settings

### Load Balancing
- Backend service load balancing
- Health checks
- Automatic failover

## Usage

1. **Update domain name** in `nginx.conf`
2. **Add SSL certificates** to the `ssl/` directory
3. **Mount the nginx directory** in docker-compose.prod.yml:

   ```yaml
   nginx:
     volumes:
       - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
       - ./nginx/ssl:/etc/nginx/ssl:ro
   ```

4. **Start the services**:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d nginx
   ```

## Monitoring

Check Nginx logs:
```bash
docker-compose -f docker-compose.prod.yml logs -f nginx
```

## Troubleshooting

### SSL Certificate Issues
- Verify certificate paths in nginx.conf
- Check certificate validity: `openssl x509 -in ssl/cert.pem -text -noout`
- Ensure correct file permissions

### Connection Issues
- Check if backend/frontend services are healthy
- Verify upstream server configurations
- Check firewall settings

### Performance Issues
- Monitor Nginx access/error logs
- Check rate limiting configurations
- Adjust worker connections if needed