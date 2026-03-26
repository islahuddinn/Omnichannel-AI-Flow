# Forgot Password with OTP - Implementation Guide

## Overview

A complete, secure, and professional forgot password flow with 6-digit OTP verification that:
- Validates user email exists in database
- Generates unique 6-digit OTP
- Sends OTP via email with professional template
- Validates OTP (with brute force protection)
- Resets password securely
- Redirects to login page upon completion

## Flow Diagram

```
User clicks "Forgot Password"
         ↓
    Enter Email
         ↓
   API: POST /api/auth/forgot-password
         ↓
   Check email in database
         ↓
   Generate 6-digit OTP
         ↓
   Save OTP (expires in 1 hour)
         ↓
   Send OTP via Email
         ↓
User receives email with OTP
         ↓
    Enter 6-digit OTP
         ↓
   API: POST /api/auth/verify-otp
         ↓
   Validate OTP
         ↓
   Store verified status
         ↓
    Enter New Password
         ↓
   API: POST /api/auth/reset-password
         ↓
   Verify OTP again
         ↓
   Hash & Update password
         ↓
   Mark OTP as used
         ↓
   Send success email
         ↓
   Redirect to /auth/login
```

## Files Created/Modified

### 1. Database Schema
**File**: `src/models/schemas/OTP.js`
- Stores OTP with email, type, expiration
- Auto-deletes after 1 hour
- Prevents reuse with `isUsed` flag
- Tracks verification attempts

### 2. Services
**File**: `src/services/auth/OTPService.js`
- `generateOTP()`: Creates 6-digit random OTP
- `checkEmailExists()`: Validates email in database
- `createOTP()`: Saves OTP with 1-hour expiration
- `verifyOTP()`: Validates OTP with brute force protection
- `getUserByEmail()`: Retrieves user for password reset

**File**: `src/services/email/EmailService.js`
- Email transporter with SMTP configuration
- Professional HTML email template
- `sendOTPEmail()`: Sends OTP to user
- `sendPasswordResetSuccessEmail()`: Confirmation email

### 3. API Routes
**File**: `src/app/api/auth/forgot-password/route.js`
- Accepts email address
- Checks if user exists (secure - doesn't reveal existence)
- Generates and saves OTP
- Sends email with OTP
- Returns success message

**File**: `src/app/api/auth/verify-otp/route.js`
- Accepts email and OTP
- Validates OTP format
- Checks expiration
- Enforces 3-attempt limit
- Returns verification status

**File**: `src/app/api/auth/reset-password/route.js`
- Accepts email, OTP, and new password
- Validates password strength (min 8 chars)
- Verifies OTP one final time
- Hashes password with bcrypt
- Updates user password
- Marks OTP as used
- Sends confirmation email
- Clears session data

### 4. Frontend Pages
**File**: `src/app/auth/forgot-password/page.js`
- Beautiful UI with gradient design
- Email input with validation
- Loading states
- Success/error messages
- Redirects to OTP verification

**File**: `src/app/auth/verify-otp/page.js`
- 6-input OTP form
- Auto-focus between inputs
- Paste support for full OTP
- Backspace navigation
- Real-time validation
- Request new code option

**File**: `src/app/auth/reset-password/page.js`
- New password input
- Confirm password input
- Show/hide password toggle
- Password strength validation
- Password match validation
- Success confirmation
- Auto-redirect to login

## Features

### Security Features
✅ **Email Verification**: Checks if email exists before sending OTP
✅ **OTP Expiration**: OTP expires after 1 hour
✅ **OTP Reuse Prevention**: Once used, OTP can't be reused
✅ **Brute Force Protection**: Max 3 verification attempts
✅ **Password Hashing**: bcrypt with salt (10 rounds)
✅ **Secure Session Storage**: Email and verification status
✅ **No Enumeration**: Doesn't reveal if email exists
✅ **Professional Email**: HTML email with branding

### User Experience
✅ **Beautiful UI**: Gradient design with animations
✅ **Mobile Responsive**: Works on all devices
✅ **Real-time Validation**: Immediate feedback
✅ **Auto-focus**: Smooth input navigation
✅ **Loading States**: Clear progress indicators
✅ **Error Handling**: Clear error messages
✅ **Success Feedback**: Toast notifications
✅ **Auto-redirect**: Smooth flow between pages

## API Endpoints

### 1. POST /api/auth/forgot-password
Request:
```json
{
  "email": "user@example.com"
}
```

Response (200):
```json
{
  "success": true,
  "message": "If an account with that email exists, a verification code has been sent"
}
```

### 2. POST /api/auth/verify-otp
Request:
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

Response (200):
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "email": "user@example.com",
    "verified": true
  }
}
```

### 3. POST /api/auth/reset-password
Request:
```json
{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "newSecurePassword123"
}
```

Response (200):
```json
{
  "success": true,
  "message": "Password reset successfully. You can now login with your new password."
}
```

## Email Configuration

Add to `.env.local`:

```env
# SMTP Configuration (for sending emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

**Note**: For Gmail, use App Password (not regular password).

### Setting up Gmail App Password
1. Go to Google Account → Security
2. Enable 2-Step Verification
3. Generate App Password
4. Use it as `SMTP_PASSWORD`

## Usage

### Step 1: Navigate to Forgot Password
```
http://localhost:3000/auth/forgot-password
```

Or click "Forgot password?" link on login page.

### Step 2: Enter Email
User enters their email address.

### Step 3: Receive OTP
User receives email with 6-digit code (valid for 1 hour).

### Step 4: Verify OTP
User enters OTP on verification page.

### Step 5: Reset Password
User enters and confirms new password.

### Step 6: Login
User is redirected to login page to sign in with new password.

## Security Considerations

1. **Rate Limiting**: Implement rate limiting on endpoints
2. **IP Tracking**: Track failed attempts per IP
3. **Email Validation**: Validate email format before processing
4. **OTP Generation**: Cryptographically secure random generation
5. **Password Strength**: Enforce strong password requirements
6. **Session Management**: Clear session on completion or expiry
7. **HTTPS**: Always use HTTPS in production
8. **CORS**: Configure CORS for allowed origins

## Testing

### Test Forgot Password Flow
```bash
# 1. Start application
npm run dev

# 2. Navigate to forgot password
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# 3. Check email for OTP (check console log)
# 4. Verify OTP
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"123456"}'

# 5. Reset password
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"123456","newPassword":"newpass123"}'
```

### Test Cases
1. ✅ Email doesn't exist (should not reveal existence)
2. ✅ Valid email sends OTP
3. ✅ OTP expires after 1 hour
4. ✅ Invalid OTP fails
5. ✅ Used OTP cannot be reused
6. ✅ Max 3 attempts before lockout
7. ✅ Password too short fails
8. ✅ Password mismatch fails
9. ✅ Successful reset redirects to login

## Troubleshooting

### Issue: OTP not received
- Check SMTP configuration in `.env.local`
- Check spam folder
- Verify email service logs
- Check console for OTP (development)

### Issue: OTP expired
- OTP expires after 1 hour
- Request a new OTP
- Check server time is correct

### Issue: Email service error
- Verify SMTP credentials
- Check firewall/network settings
- Use test email service (Mailtrap) for development

### Issue: Password not updating
- Check database connection
- Verify user exists
- Check password hash function
- Review server logs

## Future Enhancements

1. **SMS OTP**: Add SMS as alternative to email
2. **2FA Integration**: Two-factor authentication
3. **Account Lock**: Temporarily lock account after N failed attempts
4. **Security Questions**: Alternative reset method
5. **Biometric Auth**: Fingerprint/face recognition
6. **Password History**: Prevent reuse of previous passwords
7. **Password Expiry**: Force password change after N days

## Support

For issues or questions:
1. Check console logs
2. Review server logs
3. Verify environment variables
4. Test email service separately
5. Contact development team

---

**Created**: 2024
**Version**: 1.0.0
**Status**: Production Ready ✅

