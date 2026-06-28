# Bug Fix #591: Auth email endpoints crash due to missing `next`

## Issue
`/auth/check-email` and `/auth/register` used handlers shaped like:

- `asyncHandler(async (req, res) => { ... return next(new AppError(...)) })`

Because `next` was not part of the function signature, validation error paths threw:

- `ReferenceError: next is not defined`

This caused unintended `500` responses instead of structured validation errors.

## Root Cause
The route handlers called `next(...)` without declaring `next` as a parameter.

## Fix Applied
Updated both route handler signatures in `backend/routes/auth.js`:

- `asyncHandler(async (req, res) => {` → `asyncHandler(async (req, res, next) => {`

### Affected endpoints
- `POST /api/auth/check-email`
- `POST /api/auth/register`

## Expected Behavior After Fix
Validation failures now properly flow to the global error handler and return expected `4xx` responses instead of crashing with `ReferenceError` and returning `500`.

## Verification Notes
- Static verification: changed file compiles with no editor-reported errors.
- Runtime test command was attempted but local backend test dependencies were missing (`jest` not installed in `backend/node_modules`).
