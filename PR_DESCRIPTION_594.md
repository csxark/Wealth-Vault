# PR: Fix undefined `refreshToken` variable in refresh endpoint

## Summary
This PR fixes a runtime error in the refresh token endpoint where `refreshToken` was referenced before definition.

`POST /api/auth/refresh` validated the input field but did not extract it from `req.body`, causing `ReferenceError: refreshToken is not defined` and unintended `500` responses.

## Root Cause
In `backend/routes/auth.js`, the refresh route called:

- `refreshAccessToken(refreshToken, ipAddress)`

without first assigning `refreshToken` from the request.

## Changes
Updated refresh handler in `backend/routes/auth.js`:

- Added `const { refreshToken } = req.body;`
- Kept existing validation and response flow unchanged.

## Behavior Before
- Request to `POST /api/auth/refresh` could fail with `ReferenceError: refreshToken is not defined`
- Client received generic `500`

## Behavior After
- `refreshToken` is correctly read from request body
- Endpoint now executes refresh flow normally and returns structured response/errors instead of crashing

## Verification
- Static verification: no editor-reported errors in modified file.
- Runtime test execution pending local dependency install (`backend/node_modules/jest` missing).

## Related Issue
- Closes #594
