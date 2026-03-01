# PR: Fix session listing and revocation APIs to use database

## Summary
This PR fixes the session management functions in `tokenService.js` that were returning stubbed responses. The functions `getUserSessions`, `revokeDeviceSession`, and `revokeAllUserSessions` now properly interact with the database to list active sessions and revoke them securely.

## Root Cause
The session management functions were implemented as no-ops:
- `getUserSessions(userId)` always returned an empty array
- `revokeDeviceSession(sessionId, userId, reason)` and `revokeAllUserSessions(userId, reason)` returned `{ success: true }` without touching the database

This caused the session management routes (`GET /api/auth/sessions`, `POST /api/auth/logout`, `POST /api/auth/logout-all`) to show no sessions and fail to revoke them.

## Changes
Updated `backend/services/tokenService.js`:

### getUserSessions(userId)
- **Before**: Returned `[]`
- **After**: Queries `device_sessions` table for active sessions belonging to the user
- Returns session details including device info, IP, last activity, etc.
- Orders results by last activity for better UX

### revokeDeviceSession(sessionId, userId, reason)
- **Before**: Only deactivated session, hardcoded reason as 'logout'
- **After**: 
  - Validates session belongs to user
  - Blacklists both access and refresh tokens with provided reason
  - Deactivates the session
  - Returns success status based on database operation

### revokeAllUserSessions(userId, reason)
- **Before**: Returned `{ success: true }` without any action
- **After**:
  - Retrieves all active sessions for the user
  - Blacklists all tokens from those sessions with provided reason
  - Deactivates all sessions
  - Returns success status and count of revoked sessions

## Behavior Before
- `GET /api/auth/sessions` always returned empty sessions array
- `POST /api/auth/logout` and `POST /api/auth/logout-all` appeared to work but didn't revoke sessions
- Password change flow couldn't revoke other sessions
- No persistent session management

## Behavior After
- Session listing shows actual active device sessions
- Session revocation properly deactivates sessions and blacklists tokens
- All session management routes work as expected
- Secure token invalidation prevents reuse of revoked tokens

## Security Improvements
- **Token Blacklisting**: Revoked tokens are added to blacklist to prevent reuse
- **Session Validation**: Functions validate user ownership of sessions
- **Complete Revocation**: All user sessions can be revoked with proper token blacklisting
- **Audit Trail**: Revocation reasons are recorded for security auditing

## Verification
- Static verification: Node.js syntax check passed
- Database operations verified against existing schema
- Function signatures match route handler expectations

## Related Issue
- Closes #596