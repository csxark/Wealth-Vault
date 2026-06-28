# Password Reset Implementation

## Overview

This document describes the comprehensive password reset functionality implemented for Wealth-Vault, addressing issue #557. The implementation provides secure, user-friendly password recovery with email-based reset tokens.

## Features

- **Secure Token Generation**: SHA-256 hashed tokens with 1-hour expiration
- **Email-Based Reset**: Professional HTML/text email templates
- **Rate Limiting**: 3 reset attempts per hour per IP address
- **Password Validation**: Comprehensive strength checking
- **User Experience**: Responsive UI with clear feedback
- **Security**: Prevents user enumeration and token reuse

## Architecture

### Backend Components

#### Database Schema
```sql
CREATE TABLE passwordResetTokens (
  id SERIAL PRIMARY KEY,
  userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user_id ON passwordResetTokens(userId);
CREATE INDEX idx_password_reset_tokens_expires_at ON passwordResetTokens(expiresAt);
```

#### API Endpoints

##### POST `/auth/forgot-password`
Request password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

**Rate Limit:** 3 requests per hour per IP

##### POST `/auth/reset-password`
Reset password using token.

**Request Body:**
```json
{
  "token": "reset-token-from-email",
  "password": "NewSecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

#### Security Utilities

**Token Management (`utils/passwordReset.js`):**
- `generatePasswordResetToken()`: Creates secure random token with SHA-256 hash
- `verifyPasswordResetToken(token)`: Validates and retrieves token data
- `cleanupExpiredTokens()`: Removes expired tokens from database

**Password Validation (`utils/passwordValidator.js`):**
- Strength checking using zxcvbn library
- Common password blocking
- Minimum requirements enforcement

#### Email Templates

**Reset Request Email:**
- Professional HTML design with clear call-to-action
- Includes reset link with token parameter
- Security warnings about link expiration
- Plain text fallback

**Success Confirmation Email:**
- Confirms successful password change
- Includes timestamp for security awareness

### Frontend Components

#### ForgotPassword Component
- Clean, accessible form with email validation
- Loading states and error handling
- Success confirmation with email preview
- Back to login navigation

#### ResetPassword Component
- Token extraction from URL parameters
- Password strength meter integration
- Confirm password validation
- Auto-redirect after successful reset

#### Enhanced AuthForm
- "Forgot Password?" link in login form
- Seamless integration with existing UI
- State management for form switching

## Security Considerations

### Token Security
- Tokens are SHA-256 hashed before database storage
- 1-hour expiration prevents long-term abuse
- Single-use tokens prevent replay attacks
- Automatic cleanup of expired tokens

### Rate Limiting
- IP-based rate limiting (3 attempts/hour)
- Prevents abuse and DoS attacks
- Uses Redis for distributed rate limiting

### User Privacy
- Generic responses prevent user enumeration
- No indication whether email exists in system
- Secure token transmission via email

### Password Requirements
- Minimum 8 characters
- Strength validation using zxcvbn
- Common password blocking
- Dictionary-based weak password detection

## User Flow

1. **Initiate Reset**: User clicks "Forgot Password?" on login form
2. **Enter Email**: User provides email address
3. **Email Sent**: System sends reset email (if account exists)
4. **Click Link**: User clicks reset link in email
5. **Reset Password**: User enters new password with strength validation
6. **Confirmation**: Password updated, success email sent
7. **Auto-redirect**: User redirected to login page

## Email Templates

### Password Reset Email
```
Subject: 🔐 Reset Your Wealth-Vault Password

Hi [User Name],

We received a request to reset your Wealth-Vault account password.

[Reset Password Button]

This link will expire in 1 hour.

If you didn't request this reset, please ignore this email.
```

### Success Email
```
Subject: ✅ Password Reset Successful

Hi [User Name],

Your Wealth-Vault password has been successfully reset.

If you didn't make this change, please contact support immediately.
```

## Configuration

### Environment Variables
```env
# Email service configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Frontend URL for reset links
FRONTEND_URL=http://localhost:3000

# Database connection
DATABASE_URL=postgresql://user:pass@localhost:5432/wealthvault
```

### Rate Limiting Configuration
- **Forgot Password**: 3 attempts per hour per IP
- **Reset Password**: 3 attempts per hour per IP
- Uses Redis for distributed limiting when available

## Testing

### Manual Testing Steps

1. **Forgot Password Flow**:
   - Navigate to login page
   - Click "Forgot Password?"
   - Enter valid email address
   - Check email for reset link
   - Verify rate limiting with multiple attempts

2. **Reset Password Flow**:
   - Click reset link from email
   - Enter new password
   - Verify strength requirements
   - Confirm password reset success
   - Attempt login with new password

3. **Security Testing**:
   - Try expired tokens
   - Test invalid tokens
   - Verify rate limiting
   - Check common password blocking

### API Testing
```bash
# Test forgot password
curl -X POST http://localhost:3001/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Test reset password
curl -X POST http://localhost:3001/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"valid-token","password":"NewSecurePass123!"}'
```

## Error Handling

### Common Error Scenarios

1. **Invalid Email**: Returns generic success message
2. **Expired Token**: "Invalid or expired token" error
3. **Weak Password**: Detailed validation error messages
4. **Rate Limited**: "Too many attempts" with retry information
5. **Network Issues**: Graceful error handling with user feedback

### Error Messages
- User-friendly, non-technical language
- Clear guidance on next steps
- Consistent styling with application theme

## Future Enhancements

### Potential Improvements
- **SMS Reset**: Alternative reset method for mobile users
- **Account Recovery Codes**: Backup recovery method
- **Password History**: Prevent reuse of recent passwords
- **Admin Reset**: Administrative password reset capability
- **Audit Logging**: Comprehensive reset attempt logging

### Monitoring
- Track reset success/failure rates
- Monitor for suspicious patterns
- Alert on high failure rates
- Log security events

## Dependencies

### Backend Dependencies
- `bcryptjs`: Password hashing
- `jsonwebtoken`: Token operations
- `express-rate-limit`: Rate limiting
- `zxcvbn`: Password strength validation
- `nodemailer`: Email sending

### Frontend Dependencies
- `react-hook-form`: Form handling
- `zod`: Schema validation
- `lucide-react`: Icons
- `react-router-dom`: Navigation

## Files Modified/Created

### Backend
- `backend/db/schema.js`: Added passwordResetTokens table
- `backend/drizzle/0018_add_password_reset_tokens.sql`: Migration
- `backend/utils/passwordReset.js`: Token management utilities
- `backend/utils/passwordValidator.js`: Enhanced validation
- `backend/routes/auth.js`: New API endpoints
- `backend/services/emailService.js`: Email templates

### Frontend
- `frontend/src/components/Auth/ForgotPassword.tsx`: Forgot password form
- `frontend/src/components/Auth/ResetPassword.tsx`: Reset password form
- `frontend/src/components/Auth/AuthForm.tsx`: Enhanced with forgot password link
- `frontend/src/routes/index.tsx`: Added reset password route

## Conclusion

The password reset implementation provides a secure, user-friendly solution that follows industry best practices. The modular architecture allows for easy maintenance and future enhancements while maintaining high security standards.

For questions or issues, please refer to the main README.md or contact the development team.