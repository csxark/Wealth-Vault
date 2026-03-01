# Bug Fix #594: Refresh token endpoint uses undefined `refreshToken` variable

## Issue
The `POST /api/auth/refresh` route validated `body("refreshToken")` but called:

- `refreshAccessToken(refreshToken, ipAddress)`

without defining `refreshToken` first.

This caused `ReferenceError: refreshToken is not defined` and returned `500` whenever the endpoint was hit.

## Root Cause
`refreshToken` was used without being extracted from request input.

## Fix Applied
Updated `backend/routes/auth.js` in the refresh route handler to read the token from body before use:

- Added: `const { refreshToken } = req.body;`

## Expected Behavior After Fix
When `refreshToken` is provided in request body, the route now passes it to `refreshAccessToken(...)` correctly and returns a structured refresh response (or a proper handled auth failure), instead of crashing with `ReferenceError`.

## Affected Endpoint
- `POST /api/auth/refresh`

## Verification Notes
- Static verification completed: modified file shows no editor-reported errors.
- Runtime tests are pending local dependency install (`backend/node_modules/jest` missing in this environment).
