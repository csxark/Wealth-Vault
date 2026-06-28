# Two-Factor Authentication (MFA) Implementation

## Overview

This document describes the implementation of Two-Factor Authentication (MFA) using Time-based One-Time Passwords (TOTP) for the Wealth-Vault application. The implementation provides enhanced security by requiring users to provide a second form of authentication beyond their password.

## Features

- **TOTP-based Authentication**: Uses industry-standard Time-based One-Time Passwords
- **QR Code Generation**: Easy setup with authenticator apps (Google Authenticator, Authy, Microsoft Authenticator, etc.)
- **Recovery Codes**: 10 backup codes for account recovery
- **Secure Storage**: Encrypted storage of sensitive MFA data
- **User Management**: Full enable/disable and recovery code management

## Architecture

### Backend Components

#### Database Schema
The `users` table includes the following MFA-related fields:
- `mfa_enabled` (boolean): Whether MFA is enabled for the user
- `mfa_secret` (text): Base32 encoded TOTP secret
- `mfa_recovery_codes` (jsonb): Array of hashed recovery codes

#### API Endpoints

All MFA endpoints are available under `/auth/mfa/`:

- `POST /auth/mfa/setup`: Generate MFA secret and QR code
- `POST /auth/mfa/verify`: Enable MFA after verification
- `POST /auth/mfa/disable`: Disable MFA (requires password confirmation)
- `GET /auth/mfa/recovery-codes`: Get current recovery codes
- `POST /auth/mfa/regenerate-recovery-codes`: Generate new recovery codes
- `GET /auth/mfa/status`: Get MFA status and recovery code count

#### Utilities (`utils/mfa.js`)

Core MFA functionality:
- `generateMFASecret()`: Creates TOTP secret and otpauth URL
- `generateQRCode()`: Generates QR code for authenticator apps
- `verifyTOTP()`: Validates TOTP tokens
- `generateRecoveryCodes()`: Creates backup recovery codes
- `verifyRecoveryCode()`: Validates recovery codes
- `encryptMFAData()` / `decryptMFAData()`: Secure data encryption

### Frontend Components

#### Authentication Flow
- Modified login form to handle MFA tokens when required
- Updated `useAuth` hook to support MFA during authentication
- Seamless integration with existing login process

#### MFA Management UI (`MFASection.tsx`)
Located in the user profile page, provides:
- MFA status display
- Setup wizard with QR code
- Recovery code management
- Enable/disable controls

#### API Integration (`services/api.ts`)
MFA-specific API functions:
- `setupMFA()`: Initiate MFA setup
- `verifyMFA()`: Complete MFA setup
- `disableMFA()`: Disable MFA
- `getRecoveryCodes()`: Retrieve recovery codes
- `regenerateRecoveryCodes()`: Generate new codes
- `getMFAStatus()`: Check MFA status

## Security Considerations

### Data Protection
- MFA secrets are encrypted before database storage
- Recovery codes are hashed using SHA-256
- All sensitive operations require password confirmation

### Token Validation
- TOTP tokens must be 6 digits
- 2-minute time window for token validation (±1 minute)
- Recovery codes are single-use and marked as used after consumption

### Rate Limiting
- Login attempts are rate-limited to prevent brute force attacks
- MFA verification attempts should be similarly protected

## User Experience

### Setup Process
1. User clicks "Enable MFA" in profile settings
2. System generates TOTP secret and QR code
3. User scans QR code with authenticator app
4. User enters verification code to complete setup
5. System generates and displays recovery codes

### Login Process
1. User enters email and password
2. If MFA is enabled, system responds with `mfaRequired: true`
3. Login form displays MFA token input field
4. User enters 6-digit code from authenticator app
5. System validates token and completes authentication

### Recovery Process
1. User can use recovery codes if authenticator is unavailable
2. Each recovery code can only be used once
3. Users can regenerate codes (invalidates existing ones)

## Dependencies

### Backend
- `speakeasy`: TOTP generation and verification
- `qrcode`: QR code generation
- `crypto`: Node.js built-in for encryption and hashing

### Frontend
- React hooks for state management
- Tailwind CSS for styling
- Existing authentication context

## Configuration

### Environment Variables
No additional environment variables are required for basic MFA functionality. The implementation uses existing database and encryption configurations.

### Database Migration
The MFA fields are included in migration `0004_add_mfa_security.sql`:
```sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
ADD COLUMN IF NOT EXISTS mfa_recovery_codes JSONB DEFAULT '[]'::jsonb;
```

## Testing

### Manual Testing Checklist
- [ ] Enable MFA setup process
- [ ] QR code generation and scanning
- [ ] TOTP token verification
- [ ] Login with MFA enabled
- [ ] Recovery code usage
- [ ] Recovery code regeneration
- [ ] MFA disable functionality
- [ ] Invalid token handling
- [ ] Rate limiting verification

### Security Testing
- [ ] MFA secret encryption verification
- [ ] Recovery code hashing validation
- [ ] Database field access controls
- [ ] API endpoint authorization
- [ ] Token expiration handling

## Troubleshooting

### Common Issues

**QR Code Not Scanning**
- Ensure authenticator app supports TOTP
- Try manual secret entry
- Check device camera permissions

**Invalid Tokens**
- Verify device time synchronization
- Check if secret was properly saved
- Try regenerating QR code

**Recovery Codes Not Working**
- Ensure codes are entered exactly as shown
- Check for leading/trailing spaces
- Verify codes haven't been used before

### Debug Information
Enable verbose logging in development:
```javascript
console.log('MFA Debug:', { secret, token, isValid });
```

## Future Enhancements

### Potential Improvements
- SMS-based MFA as alternative
- Hardware security key support (WebAuthn)
- MFA policy management for organizations
- Audit logging for MFA events
- Push notification MFA
- Backup phone number verification

### Compliance Considerations
- GDPR compliance for user data
- SOX compliance for financial applications
- Industry-specific security requirements

## Support

For technical support or questions about the MFA implementation:
1. Check this documentation first
2. Review the code comments in relevant files
3. Test in development environment
4. Contact the development team for assistance

## Version History

- **v1.0.0**: Initial MFA implementation with TOTP and recovery codes
- Core functionality: QR code setup, token verification, recovery codes
- Frontend integration in user profile
- Backend API endpoints and utilities</content>
<parameter name="filePath">c:\Users\Gupta\Downloads\Wealth-Vault\MFA_README.md