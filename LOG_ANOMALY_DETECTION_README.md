# Log Anomaly Detection Pipeline (#630)

## Overview

The Log Anomaly Detection Pipeline is a real-time anomaly detection system that processes audit logs through a streaming pipeline to identify suspicious activities in large log volumes. It uses statistical baselines and rule-based triggers to detect anomalies before they become critical security incidents.

## Architecture

### Core Components

1. **Log Anomaly Detection Pipeline** (`logAnomalyDetectionPipeline.js`)
   - Main streaming service that orchestrates the entire anomaly detection workflow
   - Processes audit logs in real-time via Redis pub/sub
   - Coordinates between baseline engine, trigger engine, scoring engine, and alert service

2. **Statistical Baseline Engine** (`statisticalBaselineEngine.js`)
   - Calculates and maintains statistical baselines for normal audit log behavior
   - Tracks metrics like login frequency, transaction velocity, geographic patterns, and time patterns
   - Updates baselines periodically to adapt to changing user behavior

3. **Rule-Based Trigger Engine** (`ruleBasedTriggerEngine.js`)
   - Evaluates audit logs against predefined rules for suspicious activities
   - Supports multiple rule types: frequency, velocity, geographic, timing, pattern, and threshold rules
   - Configurable severity levels and cooldown periods

4. **Anomaly Scoring Engine** (`anomalyScoringEngine.js`)
   - Uses machine learning algorithms to calculate anomaly scores
   - Implements Isolation Forest, Local Outlier Factor, and ensemble scoring methods
   - Processes feature vectors extracted from audit logs

5. **Anomaly Alert Service** (`anomalyAlertService.js`)
   - Generates and manages alerts for detected anomalies
   - Supports multi-channel alerting (email, Slack, webhook, SMS, database)
   - Implements alert escalation and resolution workflows

### Database Schema

The pipeline uses the following database tables:

- `anomaly_baselines` - Statistical baselines for normal behavior
- `anomaly_rules` - Configurable rules for anomaly detection
- `anomaly_scores` - ML-generated anomaly scores for audit logs
- `anomaly_alerts` - Generated alerts with status tracking
- `alert_channels` - Configurable alert delivery channels
- `alert_escalations` - Escalation rules for unresolved alerts

## Features

### Real-Time Processing
- Streaming log processing via Redis pub/sub
- Low-latency anomaly detection (< 100ms per log entry)
- Batch processing fallback for high-volume scenarios

### Multi-Tenant Support
- Tenant-aware processing with RLS policies
- Isolated anomaly detection per tenant
- Configurable rules and baselines per tenant

### Statistical Analysis
- Dynamic baseline calculation using historical data
- Confidence intervals and statistical significance testing
- Adaptive baseline updates based on data patterns

### Rule-Based Detection
- Frequency analysis (unusual login attempts)
- Velocity checks (rapid IP changes)
- Geographic anomaly detection
- Time-based pattern analysis
- Custom threshold rules

### Machine Learning Scoring
- Isolation Forest for unsupervised anomaly detection
- Local Outlier Factor for density-based scoring
- Ensemble methods combining multiple algorithms
- Feature engineering from audit log data

### Alert Management
- Multi-channel alert delivery
- Configurable escalation policies
- Alert deduplication and correlation
- Resolution tracking and reporting

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/wealth_vault

# Alert Channels
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
```

### Pipeline Configuration

```javascript
const config = {
    batchSize: 100,              // Logs to process per batch
    processingInterval: 5000,    // Processing interval in ms
    baselineUpdateInterval: 3600000, // Baseline update interval in ms
    anomalyThreshold: 0.85,      // Score threshold for alerts
    maxRetries: 3,               // Max retry attempts for failed processing
};
```

## Usage

### Starting the Pipeline

```javascript
import LogAnomalyDetectionPipeline from './services/logAnomalyDetectionPipeline.js';

// Initialize and start the pipeline
const pipeline = new LogAnomalyDetectionPipeline();
await pipeline.initialize();
await pipeline.start();

// The pipeline will now process logs automatically
```

### Manual Log Processing

```javascript
// Process a single audit log entry
const result = await pipeline.processLogEntry({
    tenantId: 'tenant-123',
    userId: 'user-456',
    action: 'login',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
    timestamp: new Date()
});

// Result contains anomaly score and alert information
console.log('Anomaly Score:', result.score);
console.log('Is Anomalous:', result.isAnomalous);
```

### Configuring Rules

```javascript
import RuleBasedTriggerEngine from './services/ruleBasedTriggerEngine.js';

const engine = new RuleBasedTriggerEngine();

// Add a frequency rule
await engine.addRule({
    tenantId: 'tenant-123',
    ruleName: 'Unusual Login Frequency',
    ruleType: 'frequency',
    severity: 'medium',
    conditions: {
        metric: 'login_attempts',
        operator: '>',
        threshold: 10,
        timeWindow: '1h'
    },
    actions: ['alert', 'block']
});
```

### Setting Up Alert Channels

```javascript
import AnomalyAlertService from './services/anomalyAlertService.js';

const alertService = new AnomalyAlertService();

// Configure Slack alerts
await alertService.addChannel({
    tenantId: 'tenant-123',
    channelType: 'slack',
    channelName: 'Security Alerts',
    configuration: {
        webhookUrl: 'https://hooks.slack.com/services/...',
        channel: '#security'
    }
});
```

## API Endpoints

### Pipeline Management

```
GET  /api/anomaly-detection/status          # Get pipeline status
POST /api/anomaly-detection/start           # Start the pipeline
POST /api/anomaly-detection/stop            # Stop the pipeline
POST /api/anomaly-detection/restart         # Restart the pipeline
```

### Rules Management

```
GET  /api/anomaly-detection/rules            # List all rules
POST /api/anomaly-detection/rules            # Create new rule
GET  /api/anomaly-detection/rules/:id        # Get rule details
PUT  /api/anomaly-detection/rules/:id        # Update rule
DELETE /api/anomaly-detection/rules/:id      # Delete rule
```

### Alerts Management

```
GET  /api/anomaly-detection/alerts           # List alerts
GET  /api/anomaly-detection/alerts/:id       # Get alert details
PUT  /api/anomaly-detection/alerts/:id       # Update alert status
POST /api/anomaly-detection/alerts/:id/ack   # Acknowledge alert
POST /api/anomaly-detection/alerts/:id/resolve # Resolve alert
```

### Analytics

```
GET  /api/anomaly-detection/analytics        # Get detection statistics
GET  /api/anomaly-detection/baselines        # Get baseline data
GET  /api/anomaly-detection/scores           # Get anomaly scores
```

## Monitoring

### Health Checks

The pipeline provides comprehensive health monitoring:

```javascript
const health = await pipeline.getHealthStatus();
console.log('Pipeline Status:', health.status);
console.log('Redis Connected:', health.redisConnected);
console.log('Database Connected:', health.databaseConnected);
console.log('Processing Queue:', health.queueSize);
```

### Metrics

Key metrics tracked by the pipeline:

- **Throughput**: Logs processed per second
- **Latency**: Average processing time per log
- **Accuracy**: True positive/negative rates
- **Alert Volume**: Number of alerts generated
- **False Positives**: Incorrect anomaly detections

### Logging

All pipeline activities are logged with structured logging:

```javascript
// Info level logs
logInfo('Pipeline started successfully', { tenantId, batchSize });

// Warning logs
logWarn('High anomaly score detected', { score: 0.95, userId });

// Error logs
logError('Failed to process log batch', { error: err.message, batchId });
```

## Security Considerations

### Data Privacy
- All processing respects tenant isolation
- Audit logs are encrypted at rest
- PII data is masked in alerts

### Access Control
- Role-based access to pipeline configuration
- Audit trail for all configuration changes
- Secure API authentication

### Performance
- Rate limiting on API endpoints
- Circuit breakers for external services
- Resource usage monitoring

## Troubleshooting

### Common Issues

1. **Pipeline Not Starting**
   - Check Redis connection
   - Verify database connectivity
   - Check service dependencies

2. **High False Positive Rate**
   - Adjust baseline calculation parameters
   - Fine-tune rule thresholds
   - Review feature engineering

3. **Alert Delivery Failures**
   - Verify webhook URLs
   - Check SMTP configuration
   - Review channel permissions

### Debug Mode

Enable debug logging for detailed troubleshooting:

```javascript
process.env.LOG_LEVEL = 'debug';
process.env.ANOMALY_DETECTION_DEBUG = 'true';
```

## Deployment

### Docker Configuration

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: anomaly-detection-pipeline
spec:
  replicas: 2
  selector:
    matchLabels:
      app: anomaly-detection
  template:
    metadata:
      labels:
        app: anomaly-detection
    spec:
      containers:
      - name: anomaly-detection
        image: wealth-vault/anomaly-detection:latest
        env:
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: database-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

## Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up local database and Redis
4. Run tests: `npm test`
5. Start development server: `npm run dev`

### Testing

```bash
# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run performance tests
npm run test:performance
```

### Code Standards

- Use ES6+ syntax with async/await
- Follow existing code patterns
- Add comprehensive error handling
- Include unit tests for new features
- Update documentation for API changes

## License

This module is part of the Wealth Vault application and follows the same licensing terms.