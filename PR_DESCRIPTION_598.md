# PR: Fix validation errors in check-email and register routes to return 400 instead of 500

## Summary
This PR fixes the check-email and register routes in `auth.js` to return proper 400 Bad Request responses for validation errors instead of generic 500 Internal Server Error responses.

## Root Cause
The routes were using `next(new AppError(...))` for validation errors, but the global error handler was not properly handling `AppError` instances, causing them to be converted to 500 errors instead of using the specified status code.

## Changes
Updated `backend/routes/auth.js`:

### check-email route
- **Before**: `return next(new AppError(400, "Invalid email format", errors.array()));`
- **After**: Direct response with `res.status(400).json({ success: false, message: "Invalid email format", errors: errors.array() })`

### register route validation errors
- **Express-validator errors**: Changed from `next(new AppError(...))` to direct 400 response
- **Missing required fields**: Changed from `next(new AppError(...))` to direct 400 response  
- **Existing user check**: Changed from `next(new AppError(409, ...))` to direct 409 response
- **Common password check**: Changed from `next(new AppError(...))` to direct 400 response
- **Password strength validation**: Changed from `next(new AppError(...))` to direct 400 response

## Behavior Before
- `POST /api/auth/check-email` with invalid email → 500 error
- `POST /api/auth/register` with validation failures → 500 error
- Clients received generic "Internal Server Error" instead of actionable validation feedback

## Behavior After
- `POST /api/auth/check-email` with invalid email → 400 with validation error details
- `POST /api/auth/register` with validation failures → 400/409 with specific error messages
- Proper error responses with structured JSON containing `success: false`, `message`, and `errors` array
- Consistent with other routes in the codebase that return validation errors directly

## Security Considerations
- Validation errors now provide appropriate feedback without exposing internal error details
- Prevents information leakage that could occur with 500 errors
- Maintains consistent API response format across all endpoints

## Verification
- Static verification: Node.js syntax check passed
- Error response format matches other routes in the codebase
- Validation logic unchanged, only error handling method updated

## Related Issue
- Closes #598