# Bug Fix #592: Upload profile picture route throws `ValidationError` (Not Defined)

## Issue
The `POST /api/auth/upload-profile-picture` route threw:

- `new ValidationError('No file uploaded')`

when `req.file` was missing, but `ValidationError` was not imported in `backend/routes/auth.js`.

This caused:

- `ReferenceError: ValidationError is not defined`
- unintended `500` responses instead of a structured validation error.

## Root Cause
`ValidationError` was referenced in the route handler without being imported.

## Fix Applied
Updated imports in `backend/routes/auth.js`:

- `import { asyncHandler } from "../middleware/errorHandler.js";`
- changed to:
- `import { asyncHandler, ValidationError } from "../middleware/errorHandler.js";`

## Expected Behavior After Fix
When no file is attached (or wrong field name is used), the route now throws a valid `ValidationError` instance and error middleware returns a proper validation response instead of a generic `500` from `ReferenceError`.

## Affected Endpoint
- `POST /api/auth/upload-profile-picture`

## Verification Notes
- Static verification completed: modified file has no editor-reported errors.
- Runtime tests were not re-run here due to missing local Jest dependency in `backend/node_modules`.
