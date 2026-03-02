# WebSocket Real-Time Events - Quick Start

Get real-time notifications running in 15 minutes.

## Prerequisites

- Node.js 18+
- Wealth-Vault backend running
- JWT authentication configured

## Step 1: Install Package (2 min)

```bash
cd backend
npm install socket.io
```

**Verify installation:**
```bash
npm list socket.io
# Should show: socket.io@^4.x.x
```

## Step 2: Update server.js (3 min)

In your main `server.js` or `app.js`:

```javascript
import { createServer } from 'http';
import setupWebSocketServer from './websocket/server.js';

// CHANGE THIS:
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));

// TO THIS:
const PORT = process.env.PORT || 3000;
const httpServer = createServer(app);

// Setup WebSocket
const { broadcast, eventHandlers, polling } = setupWebSocketServer(httpServer);

// Make available to routes
app.locals.broadcast = broadcast;
app.locals.eventHandlers = eventHandlers;
app.locals.polling = polling;

httpServer.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready at ws://localhost:${PORT}`);
});
```

## Step 3: Add Event to One Route (3 min)

In `routes/expenses.js` (after creating an expense):

```javascript
router.post('/', protect, validateTenantAccess, async (req, res) => {
  // ... existing code ...
  const newExpense = await db.insert(expenses).values({...}).returning();

  // ✅ ADD THESE 2 LINES:
  req.app.locals.eventHandlers.expenseEvents.onExpenseCreated(newExpense);
  req.app.locals.polling.storeEventForPolling(
    req.tenant.id, 
    req.user.id, 
    'expense:created', 
    newExpense
  );

  return res.json(newExpense);
});
```

## Step 4: Test on Frontend (7 min)

Install client package:

```bash
cd frontend
npm install socket.io-client
```

Create a simple test component:

```javascript
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export function WebSocketTest() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    // Connect to WebSocket
    const socket = io('http://localhost:3000', {
      auth: {
        token: localStorage.getItem('jwt_token')
      }
    });

    socket.on('connect', () => {
      console.log('✅ WebSocket connected!');
      setConnected(true);
      
      // Join your tenant room
      socket.emit('join-tenant', localStorage.getItem('tenantId'));
    });

    socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
      setConnected(false);
    });

    // Listen for expense events
    socket.on('expense:created', (data) => {
      console.log('📊 New expense:', data);
      setEvents(prev => [...prev, { type: 'expense:created', data }]);
    });

    socket.on('expense:deleted', (data) => {
      console.log('🗑️ Expense deleted:', data);
      setEvents(prev => [...prev, { type: 'expense:deleted', data }]);
    });

    return () => socket.close();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>WebSocket Status</h2>
      <p>
        Connection: 
        <strong style={{ color: connected ? 'green' : 'red' }}>
          {connected ? '✅ Connected' : '❌ Disconnected'}
        </strong>
      </p>

      <h3>Events Received ({events.length})</h3>
      <div style={{ maxHeight: '300px', overflow: 'auto' }}>
        {events.map((e, i) => (
          <div key={i} style={{ 
            padding: '8px', 
            margin: '4px 0', 
            backgroundColor: '#f0f0f0',
            borderLeft: '3px solid blue'
          }}>
            <strong>{e.type}</strong>
            <pre>{JSON.stringify(e.data, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Add to your app:

```jsx
<WebSocketTest />
```

## Step 5: Test It (2 min)

1. **Start backend**: `npm run dev`
2. **Open your app** in browser
3. **Verify connection**: Check if "✅ Connected" shows
4. **Create an expense**: Fill form and submit
5. **Check console**: Should see "📊 New expense" logged

## 🎉 That's It!

Real-time events are now working!

## Next Steps

### Add More Events

Add to other routes (goals, categories, team):

```javascript
// Goal achievement
req.app.locals.eventHandlers.goalEvents.onGoalAchieved(goal);

// Budget warning
req.app.locals.eventHandlers.budgetEvents.onBudgetWarning(
  tenantId, userId, 'Food', spent, limit
);

// Team member joined
req.app.locals.eventHandlers.teamEvents.onMemberJoined(tenantId, user, role);
```

### Handle All Event Types

```javascript
socket.on('goal:achieved', (data) => {
  showNotification('🎉 Goal achieved!', data.title);
});

socket.on('budget:exceeded', (data) => {
  showAlert('⚠️ ' + data.message);
});

socket.on('member:joined', (data) => {
  updateTeamList();
});
```

### Add Fallback Polling

For clients without WebSocket:

```javascript
async function startPolling() {
  setInterval(async () => {
    const res = await fetch(`/api/polling/${tenantId}/events`);
    const { data: events } = await res.json();
    
    events.forEach(e => {
      socket.emit(e.type, e.payload);
    });
  }, 10000); // Every 10 seconds
}
```

## Files Reference

| File | Purpose |
|------|---------|
| `websocket/server.js` | WebSocket server setup |
| `websocket/eventTypes.js` | Event definitions |
| `websocket/eventHandlers.js` | Event emission logic |
| `websocket/polling.js` | Fallback polling API |
| `websocket/integration-example.js` | Copy patterns from here |

## Troubleshooting

### "Cannot GET /socket.io"
- Check server is actually running WebSocket server
- Verify `createServer` and `setupWebSocketServer` are called

### Events not received
- Check browser console for WebSocket connection errors
- Verify JWT token in auth handshake
- Make sure client joined correct tenant room

### "Authentication failed"
- Check JWT token is valid
- Verify CORS is configured
- Check request includes token in auth field

## Environment Variables

Add if needed:

```env
# .env
WEBSOCKET_ENABLED=true
FRONTEND_URL=http://localhost:5173
WEBSOCKET_PORT=3000
```

## Performance Tips

1. **Batch updates** - Don't update UI on every event
2. **Use debouncing** - For frequent events
3. **Clean up listeners** - Remove event listeners on unmount
4. **Implement fallback** - Polling for mobile/offline
5. **Monitor connections** - Check memory usage

## Example: Real-World Setup

```javascript
// Complete integration for expenses
export const useExpenseEvents = (tenantId) => {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const socket = io('http://localhost:3000', {
      auth: { token: localStorage.getItem('jwt_token') }
    });

    socket.on('connect', () => {
      socket.emit('join-tenant', tenantId);
    });

    // Real-time updates
    socket.on('expense:created', () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    });

    socket.on('expense:updated', () => {
      queryClient.refetchQueries({ queryKey: ['expenses'] });
    });

    socket.on('expense:deleted', ({ id }) => {
      queryClient.setQueryData(['expenses'], prev => 
        prev.filter(e => e.id !== id)
      );
    });

    return () => socket.disconnect();
  }, [tenantId]);
};
```

## Command Reference

```bash
# Start with WebSocket
npm run dev

# Check if running
lsof -i :3000

# Test WebSocket
npx socket.io-client-debug http://localhost:3000

# View logs
npm run logs | grep -i websocket
```

---

**Status**: ✅ Ready to Use  
**Setup Time**: ~15 minutes  
**Difficulty**: Beginner  
**Difficulty**: Easy
