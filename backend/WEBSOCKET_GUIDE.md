# Real-Time Event Notifications with WebSockets

## Overview

This document covers the implementation of real-time event notifications using WebSockets for the Wealth-Vault application. The system provides instant updates for critical events while maintaining a fallback polling mechanism for clients without WebSocket support.

## Architecture

### Components

1. **WebSocket Server** (`websocket/server.js`)
   - Socket.IO server with authentication
   - Tenant-isolated rooms
   - Event broadcasting system
   - Connection management

2. **Event Types** (`websocket/eventTypes.js`)
   - 30+ predefined event types
   - Event schemas and validation
   - Event priority levels
   - Configuration for persistence and notifications

3. **Event Handlers** (`websocket/eventHandlers.js`)
   - Business logic for emitting events
   - Organized by domain (expenses, goals, team, etc.)
   - Automatic broadcast to relevant clients

4. **Polling Service** (`websocket/polling.js`)
   - REST API fallback for WebSocket unsupported clients
   - Event storage and retrieval
   - Acknowledgment mechanism
   - Event lifecycle management

5. **Integration Example** (`websocket/integration-example.js`)
   - Complete working example
   - Copy patterns for other routes
   - Event emission on CRUD operations

## Getting Started

### Step 1: Install Dependencies

```bash
npm install socket.io jsonwebtoken
```

Already included in package.json? Check:
```bash
npm list socket.io
```

### Step 2: Update server.js

```javascript
import { createServer } from 'http';
import setupWebSocketServer from './websocket/server.js';
import { createPollingRoutes } from './websocket/polling.js';
import { initializeEventHandlers } from './websocket/eventHandlers.js';

// Create HTTP server
const httpServer = createServer(app);

// Setup WebSocket
const { broadcast, eventBus } = setupWebSocketServer(httpServer);

// Setup polling endpoints
const pollingRoutes = createPollingRoutes();
app.use('/api/polling', pollingRoutes);

// Initialize event handlers
const eventHandlers = initializeEventHandlers(broadcast, db, schema);

// Export for use in routes
app.locals.broadcast = broadcast;
app.locals.eventHandlers = eventHandlers;
app.locals.polling = polling;

// Start server with HTTP
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Step 3: Update Routes with Events

For each route that modifies data, add event emissions:

```javascript
// BEFORE
router.post('/expenses', protect, validateTenantAccess, async (req, res) => {
  const expense = await createExpense(data);
  return res.json(expense);
});

// AFTER
router.post('/expenses', protect, validateTenantAccess, async (req, res) => {
  const expense = await createExpense(data);
  
  // Add these 2 lines:
  req.app.locals.eventHandlers.expenseEvents.onExpenseCreated(expense);
  req.app.locals.polling.storeEventForPolling(req.tenant.id, req.user.id, 'expense:created', expense);
  
  return res.json(expense);
});
```

## Client-Side Implementation

### Option 1: WebSocket (Recommended)

```javascript
import { io } from 'socket.io-client';

// Connect
const socket = io('http://localhost:3000', {
  auth: {
    token: localStorage.getItem('jwt_token')
  }
});

// Join tenant room
socket.emit('join-tenant', tenantId, (response) => {
  console.log('Joined room:', response);
});

// Listen for events
socket.on('expense:created', (data) => {
  console.log('New expense:', data);
  updateExpenseList();
});

socket.on('goal:achieved', (data) => {
  console.log('Goal achieved!', data);
  showCelebration();
});

socket.on('budget:exceeded', (data) => {
  console.log('Budget warning:', data);
  showAlert(data.message);
});

// Reconnection handling
socket.on('disconnect', () => {
  console.log('disconnected, falling back to polling');
  startPolling();
});

socket.on('reconnect', () => {
  console.log('reconnected');
  stopPolling();
});
```

### Option 2: Polling (Fallback)

```javascript
// For clients without WebSocket support
let lastPoll = null;
let pollingInterval = null;

async function startPolling() {
  pollingInterval = setInterval(async () => {
    try {
      const response = await fetch(
        `/api/polling/${tenantId}/events?since=${lastPoll || new Date(0).toISOString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const { data: events } = await response.json();

      // Process events
      events.forEach(event => {
        handleEvent(event.type, event.payload);
      });

      // Acknowledge events
      if (events.length > 0) {
        await fetch(`/api/polling/${tenantId}/events/acknowledge`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            eventIds: events.map(e => e.id)
          })
        });
      }

      lastPoll = new Date().toISOString();
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 10000); // Poll every 10 seconds
}

function stopPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
}
```

### React Hook for WebSocket

```javascript
// hooks/useWebSocket.js
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export function useWebSocket(tenantId) {
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('jwt_token');
    const newSocket = io(process.env.REACT_APP_API_URL, {
      auth: { token }
    });

    newSocket.on('connect', () => {
      setConnected(true);
      newSocket.emit('join-tenant', tenantId);
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, [tenantId]);

  return { socket, connected };
}

// Usage in component
function ExpenseList({ tenantId }) {
  const { socket, connected } = useWebSocket(tenantId);
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    if (!socket) return;

    socket.on('expense:created', (expense) => {
      setExpenses(prev => [...prev, expense]);
    });

    socket.on('expense:deleted', ({ id }) => {
      setExpenses(prev => prev.filter(e => e.id !== id));
    });

    return () => {
      socket.off('expense:created');
      socket.off('expense:deleted');
    };
  }, [socket]);

  return (
    <div>
      <p>Connected: {connected ? 'Yes' : 'No'}</p>
      {expenses.map(e => <ExpenseItem key={e.id} expense={e} />)}
    </div>
  );
}
```

## Event Types

### Expense Events
- `expense:created` - New expense created
- `expense:updated` - Expense modified
- `expense:deleted` - Expense removed
- `expenses:bulk-deleted` - Multiple expenses deleted

### Goal Events
- `goal:created` - New goal created
- `goal:achieved` - Goal completed
- `goal:deleted` - Goal removed
- `milestone:completed` - Milestone reached

### Budget Events
- `budget:warning` - 80% of budget spent
- `budget:exceeded` - Budget limit exceeded

### Team Events
- `member:joined` - New team member
- `member:left` - Member removed
- `member:role-changed` - Permissions updated

### Other Events
- `notification:created` - New notification
- `sync:completed` - Data sync finished
- `error:occurred` - System error

## Configuration

### WebSocket Server Options

```javascript
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true
  },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  pingInterval: 25000,
  pingTimeout: 60000,
  transports: ['websocket', 'polling']
});
```

### Polling Configuration

```javascript
// Default settings in websocket/polling.js
pollingConfig = {
  minInterval: 5000,      // 5 sec minimum
  defaultInterval: 10000, // 10 sec default
  maxInterval: 60000,     // 60 sec maximum
  backoffMultiplier: 1.5, // Exponential backoff
  maxRetries: 5           // Give up after 5 retries
};
```

## Security

### Authentication
- JWT token validation on connection
- Token extraction from handshake auth
- Automatic disconnect on invalid token

### Authorization
- Tenant membership verification
- Room-based isolation
- No cross-tenant data access

### Best Practices
- Always validate token before processing events
- Only broadcast to authorized rooms
- Log all connection/disconnection events
- Implement rate limiting for expensive events

## Debugging

### Check WebSocket Connection

```javascript
// Browser console
const socket = io();
socket.on('connect', () => console.log('Connected!'));
socket.on('disconnect', () => console.log('Disconnected'));
socket.on_error = (error) => console.log('Error:', error);
```

### Monitor Events

```javascript
// Listen to all events
socket.onAny((event, ...args) => {
  console.log('Event:', event, args);
});
```

### Check Connection Stats

```javascript
// Get server stats
const stats = io.getStats();
console.log('Connected users:', stats.totalConnections);
console.log('Active rooms:', stats.rooms);
```

## Performance Considerations

1. **Event Batching**: Combine multiple rapid events into one
2. **Debouncing**: Delay processing of frequent events
3. **Memory Management**: Clean up old polling events (3600s TTL)
4. **Room Isolation**: Keep rooms small for efficient broadcasting
5. **Reconnection**: Exponential backoff prevents thundering herd

## Troubleshooting

### WebSocket Connection Fails
- Check CORS configuration
- Verify JWT token is valid
- Ensure server supports WebSocket (not blocked by proxy)

### Events Not Received
- Verify client joined correct room
- Check event types match
- Look at browser console for errors

### High Memory Usage
- Reduce polling event TTL
- Clean up disconnected sockets
- Monitor room sizes

### Slow Performance
- Check network latency
- Reduce event frequency
- Use polling instead of WebSocket if needed

## Testing

```javascript
// Test WebSocket connection
io.on('connection', (socket) => {
  socket.on('test', (data, callback) => {
    callback({ received: data });
  });
});

// Client test
socket.emit('test', 'hello', (response) => {
  console.log('Response:', response);
});
```

## Examples

### Listen to Multiple Events

```javascript
const eventHandlers = {
  'expense:created': (data) => updateExpenseList(),
  'goal:achieved': (data) => showCelebration(),
  'budget:exceeded': (data) => showAlert(data.message),
  'member:joined': (data) => updateTeamList()
};

Object.entries(eventHandlers).forEach(([event, handler]) => {
  socket.on(event, handler);
});
```

### Batch Updates

```javascript
let pendingUpdates = [];

socket.on('expense:created', (data) => {
  pendingUpdates.push(data);
  
  if (pendingUpdates.length === 1) {
    setTimeout(() => {
      updateUI(pendingUpdates);
      pendingUpdates = [];
    }, 100);
  }
});
```

### Selective Listening

```javascript
// Only listen to own expenses
socket.on('expense:created', (data) => {
  if (data.userId === currentUser.id) {
    updateExpenseList();
  }
});
```

## Next Steps

1. Install socket.io: `npm install socket.io`
2. Update server.js with WebSocket setup
3. Update routes with event emissions
4. Test with browser WebSocket DevTools
5. Implement client-side listeners
6. Add error handling and fallback
7. Deploy and monitor

---

**Status**: Ready for Implementation  
**Version**: 1.0.0  
**Last Updated**: March 1, 2026
