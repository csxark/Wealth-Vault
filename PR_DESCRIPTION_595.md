# PR: Fix refreshAccessToken to validate tokens and preserve user identity

## Summary
This PR fixes the `refreshAccessToken` function in `tokenService.js` which was issuing tokens for a dummy user and completely bypassing token validation. The function now properly validates refresh tokens against the database, enforces token blacklisting, and preserves the actual user identity.

## Root Cause
The original `refreshAccessToken(refreshToken, ipAddress)` implementation:
- Hardcoded `userId = 'temp-user'` instead of validating the provided refresh token
- Did not check if the token exists in any device session
- Ignored token blacklist and expiration
- Made the refresh endpoint semantically broken and potentially unsafe

## Changes
Updated `backend/services/tokenService.js`:

### Database Integration
- Added imports for database router service (`dbRouter.primaryDb`)
- Integrated with existing `device_sessions` and `token_blacklist` tables

### Token Validation Logic
- **Blacklist Check**: Query `token_blacklist` table to ensure token isn't revoked
- **Session Validation**: Find active device session with matching refresh token
- **Expiration Check**: Verify session hasn't expired
- **User Identity**: Extract actual `userId` from validated session

### Session Management
- Update session with new tokens and timestamps on successful refresh
- Proper error handling for invalid/expired tokens

### Complete Database Implementation
Updated all token service functions to use database instead of dummy implementations:
- `blacklistToken()` - Inserts tokens into blacklist table
- `isTokenBlacklisted()` - Checks blacklist table
- `getDeviceSession()` - Retrieves session data
- `invalidateDeviceSession()` - Deactivates sessions
- `getUserDeviceSessions()` - Lists user sessions
- `cleanupExpiredTokens()` - Removes expired entries

## Behavior Before
- `POST /api/auth/refresh` with any string as `refreshToken`
- Returns access/refresh tokens for dummy user `'temp-user'`
- No validation of token authenticity or ownership
- Potential security vulnerability allowing token generation for non-existent users

## Behavior After
- Refresh tokens are validated against database
- Tokens must belong to active, non-expired device sessions
- Blacklisted tokens are rejected
- Returns tokens for the actual authenticated user
- Proper error responses for invalid tokens

## Security Improvements
- **Token Validation**: Refresh tokens properly validated against database
- **Blacklist Enforcement**: Prevents use of revoked tokens
- **Session Integrity**: Ensures tokens belong to active sessions
- **User Identity Preservation**: Returns tokens for correct user, not placeholder

## Verification
- Static verification: Node.js syntax check passed
- Database schema integration verified against existing tables
- Token validation logic follows established patterns in codebase

## Related Issue
- Closes #595