# Core Authentication Pages Specification

## **Status**: 🚧 In Progress (Phase 1 Complete ✅)

## Overview

This document specifies the core authentication pages required for AudioFoodie's user authentication system. These pages provide the foundation for user account management and secure access to the application.

## Current State

### Existing Pages
- ✅ **Login** (`/login`) - Basic email/password login implemented
- ✅ **Account View** (`/account`) - Basic account details and profile management
- ✅ **Spotify Callback** (`/spotify-callback`) - OAuth callback handler
- ✅ **Last.fm Callback** (`/lastfm-callback`) - OAuth callback handler

### Missing Pages
- ✅ **Signup/Registration** (`/signup`) - User registration
- ❌ **Password Reset** (`/forgot-password`, `/reset-password`) - Password recovery
- ✅ **Email Verification** (`/verify-email`) - Email verification flow

## Authentication Flow

```
┌─────────────┐
│   Signup    │ ──► Create Account ──► Email Verification
└─────────────┘
      │
      ▼
┌─────────────┐
│    Login    │ ──► Authenticated ──► Dashboard
└─────────────┘
      │
      ├──► Forgot Password ──► Reset Password
      │
      └──► Verify Email (if not verified)
```

## Page Specifications

### 1. Signup/Registration Page (`/signup`)

**Route**: `/signup`  
**Component**: `SignupView.vue`  
**Location**: `src/views/auth/SignupView.vue`

#### Purpose
Allow new users to create an account with email and password.

#### Features
- Email and password registration
- Password strength validation
- Email format validation
- Automatic email verification send
- Redirect to email verification page after signup
- Link to login page for existing users
- Error handling and user feedback

#### Form Fields
- **Email** (required)
  - Type: email
  - Validation: Valid email format, not already registered
  - Error messages: "Invalid email address", "Email already registered"
  
- **Password** (required)
  - Type: password
  - Validation: Minimum 6 characters (Firebase requirement)
  - Error messages: "Password must be at least 6 characters"
  
- **Confirm Password** (required)
  - Type: password
  - Validation: Must match password
  - Error messages: "Passwords do not match"

#### User Flow
1. User enters email, password, and confirm password
2. Form validates input
3. On submit, create Firebase Auth account
4. Send email verification automatically
5. Create user document in Firestore `users` collection
6. Redirect to `/verify-email` with success message
7. Show error if registration fails

#### UI Requirements
- Clean, simple form layout matching existing LoginView style
- Password strength indicator (optional enhancement)
- Show/hide password toggle
- Loading state during submission
- Success/error message display
- Link to `/login` for existing users

#### Technical Implementation
- Use Firebase `createUserWithEmailAndPassword`
- Use `sendEmailVerification` after account creation
- Create user document in Firestore with:
  - `email`: User's email
  - `displayName`: Initially null (can be set later)
  - `lastFmUserName`: Initially null
  - `createdAt`: Server timestamp
  - `updatedAt`: Server timestamp
  - `emailVerified`: false (from Firebase Auth)
- Handle Firebase Auth errors appropriately

#### Error Handling
- `auth/email-already-in-use`: Show "Email already registered" with link to login
- `auth/invalid-email`: Show "Invalid email address"
- `auth/weak-password`: Show "Password must be at least 6 characters"
- `auth/network-request-failed`: Show "Network error. Please check your connection."
- Generic errors: Show user-friendly message

---

### 2. Login Page (`/login`)

**Route**: `/login`  
**Component**: `LoginView.vue`  
**Status**: ✅ Already implemented  
**Location**: `src/views/auth/LoginView.vue`

#### Current Implementation
- Basic email/password login
- Form validation
- Error handling
- Redirect to home or specified redirect path
- Auto-redirect if already logged in

#### Enhancements Needed
- Link to `/signup` for new users
- Link to `/forgot-password` for password recovery
- Remember me functionality (optional)
- Better error message display

---

### 3. Password Reset Flow

#### 3a. Forgot Password Page (`/forgot-password`)

**Route**: `/forgot-password`  
**Component**: `ForgotPasswordView.vue`  
**Location**: `src/views/auth/ForgotPasswordView.vue`

#### Purpose
Allow users to request a password reset email.

#### Features
- Email input for password reset request
- Send password reset email via Firebase
- Success message after email sent
- Link back to login
- Link to signup for new users

#### Form Fields
- **Email** (required)
  - Type: email
  - Validation: Valid email format
  - Error messages: "Invalid email address", "No account found with this email"

#### User Flow
1. User enters email address
2. Form validates email format
3. On submit, send password reset email via Firebase
4. Show success message (regardless of whether email exists - security best practice)
5. Display instructions to check email
6. Provide link back to login

#### UI Requirements
- Simple, focused form
- Clear instructions
- Success message with email check reminder
- Link to login page
- Link to signup page

#### Technical Implementation
- Use Firebase `sendPasswordResetEmail`
- Always show success message (don't reveal if email exists)
- Handle errors gracefully

#### Error Handling
- `auth/invalid-email`: Show "Invalid email address"
- `auth/user-not-found`: Show generic success message (don't reveal user doesn't exist)
- `auth/network-request-failed`: Show "Network error. Please check your connection."
- Generic errors: Show user-friendly message

---

#### 3b. Reset Password Page (`/reset-password`)

**Route**: `/reset-password`  
**Component**: `ResetPasswordView.vue`  
**Location**: `src/views/auth/ResetPasswordView.vue`

#### Purpose
Allow users to set a new password using the reset token from email.

#### Features
- New password input
- Confirm password input
- Password strength validation
- Token validation from URL query parameter
- Success message and redirect to login

#### Form Fields
- **New Password** (required)
  - Type: password
  - Validation: Minimum 6 characters
  - Error messages: "Password must be at least 6 characters"
  
- **Confirm Password** (required)
  - Type: password
  - Validation: Must match new password
  - Error messages: "Passwords do not match"

#### URL Parameters
- `oobCode`: Firebase action code from email link
- `mode`: Should be "resetPassword"

#### User Flow
1. User clicks link in password reset email
2. Firebase redirects to `/reset-password?oobCode=...&mode=resetPassword`
3. Component validates token and extracts action code
4. User enters new password and confirmation
5. Form validates passwords match
6. On submit, confirm password reset with Firebase
7. Show success message
8. Redirect to login page after 3 seconds

#### UI Requirements
- Password reset form
- Token validation status display
- Loading state during reset
- Success message
- Auto-redirect to login
- Error handling for invalid/expired tokens

#### Technical Implementation
- Use Firebase `confirmPasswordReset(actionCode, newPassword)`
- Validate action code from URL
- Handle expired/invalid tokens
- Show appropriate error messages

#### Error Handling
- `auth/expired-action-code`: Show "Reset link has expired. Please request a new one."
- `auth/invalid-action-code`: Show "Invalid reset link. Please request a new one."
- `auth/weak-password`: Show "Password must be at least 6 characters"
- `auth/network-request-failed`: Show "Network error. Please check your connection."
- Generic errors: Show user-friendly message

---

### 4. Email Verification Page (`/verify-email`)

**Route**: `/verify-email`  
**Component**: `VerifyEmailView.vue`  
**Location**: `src/views/auth/VerifyEmailView.vue`

#### Purpose
Handle email verification status and allow users to resend verification emails.

#### Features
- Display current verification status
- Resend verification email button
- Auto-check verification status after email sent
- Success/error message display
- Link to continue to app (if verified)
- Link to login (if not logged in)

#### User Flow
1. User lands on page (from signup or direct navigation)
2. Check current email verification status
3. If verified: Show success message and link to continue
4. If not verified: Show instructions and resend button
5. On resend: Send verification email and show success message
6. Provide option to check status again
7. Auto-redirect to home if verified

#### UI Requirements
- Clear verification status indicator
- Instructions for checking email
- Resend verification email button
- Success message after resend
- Link to continue to app
- Link to login if not authenticated

#### Technical Implementation
- Use Firebase `sendEmailVerification` to resend
- Check `user.emailVerified` status
- Listen for auth state changes to detect verification
- Poll verification status after resend (optional enhancement)

#### Error Handling
- `auth/too-many-requests`: Show "Too many requests. Please wait before requesting another email."
- `auth/network-request-failed`: Show "Network error. Please check your connection."
- Generic errors: Show user-friendly message

#### Auto-Verification Detection
- Optionally poll or listen for email verification completion
- Auto-redirect when verification detected
- Show success message when verified

---

## Implementation Requirements

### Database Changes
- No new collections required
- User documents in `users` collection will be created during signup
- Existing user document structure is sufficient

### Code Changes

#### New Components
1. `src/views/auth/SignupView.vue` - Registration page
2. `src/views/auth/ForgotPasswordView.vue` - Password reset request
3. `src/views/auth/ResetPasswordView.vue` - Password reset confirmation
4. `src/views/auth/VerifyEmailView.vue` - Email verification

#### Updated Components
1. `src/views/auth/LoginView.vue` - Add links to signup and forgot password

#### New Composables (if needed)
- `usePasswordReset.js` - Password reset logic
- `useEmailVerification.js` - Email verification logic

#### Router Updates
- Add routes for new pages
- Add route guards for authenticated/unauthenticated states
- Handle redirects appropriately

### Firebase Configuration
- Ensure email verification is enabled in Firebase Console
- Configure password reset email template (optional customization)
- Configure email verification email template (optional customization)

### UI/UX Requirements
- Consistent styling with existing auth pages
- Use TailwindCSS utility classes
- Follow existing design patterns from LoginView
- Responsive design for mobile and desktop
- Loading states for all async operations
- Clear error messages
- Success confirmations

## Validation Rules

### Email Validation
- Must be valid email format
- Checked client-side and server-side
- Firebase handles duplicate email validation

### Password Validation
- Minimum 6 characters (Firebase requirement)
- Client-side validation before submission
- Server-side validation by Firebase

### Password Reset Token
- Must be valid Firebase action code
- Must not be expired
- Validated before allowing password reset

### Email Verification
- Must be authenticated user
- Can only verify own email
- Token-based verification via Firebase

## Security Considerations

### Password Reset
- Always show success message (don't reveal if email exists)
- Tokens expire after set time (Firebase default: 1 hour)
- Tokens are single-use
- Secure token handling in URL

### Email Verification
- Rate limiting on resend requests
- Secure verification links
- Auto-expiration of verification links

### General
- All forms use HTTPS
- No sensitive data in URL parameters (except Firebase action codes)
- Proper error handling without information leakage
- CSRF protection via Firebase

## Testing Strategy

### Unit Tests
1. Form validation logic
2. Password strength validation
3. Email format validation
4. Error message generation

### Integration Tests
1. Signup flow end-to-end
2. Password reset flow end-to-end
3. Email verification flow end-to-end
4. Error handling scenarios

### Manual Testing Checklist
- [ ] Signup with valid email/password
- [ ] Signup with invalid email
- [ ] Signup with weak password
- [ ] Signup with duplicate email
- [ ] Password reset request
- [ ] Password reset with valid token
- [ ] Password reset with expired token
- [ ] Email verification resend
- [ ] Email verification completion
- [ ] Navigation between auth pages
- [ ] Redirect handling after auth actions

## Implementation Phases

### Phase 1: Signup Page ✅ COMPLETE
**Priority**: High  
**Estimated Time**: 2-3 hours  
**Status**: ✅ Completed

**Tasks**:
1. ✅ Create `SignupView.vue` component
2. ✅ Implement form with email, password, confirm password
3. ✅ Add form validation
4. ✅ Integrate Firebase `createUserWithEmailAndPassword`
5. ✅ Create user document in Firestore
6. ✅ Send email verification
7. ✅ Add route to router
8. ✅ Update LoginView with link to signup
9. ✅ Test signup flow

**Additional Implementation Notes**:
- Users are redirected to `/account` after signup to complete their profile
- Profile creation form shows when `displayName` is null
- Last.fm Username is now required (not optional)
- Email verification page (`VerifyEmailView.vue`) created as part of Phase 1

### Phase 2: Password Reset Flow
**Priority**: High  
**Estimated Time**: 3-4 hours

**Tasks**:
1. Create `ForgotPasswordView.vue` component
2. Implement password reset request form
3. Integrate Firebase `sendPasswordResetEmail`
4. Create `ResetPasswordView.vue` component
5. Implement password reset confirmation
6. Integrate Firebase `confirmPasswordReset`
7. Add routes to router
8. Update LoginView with link to forgot password
9. Test password reset flow

### Phase 3: Email Verification Page
**Priority**: Medium  
**Estimated Time**: 2-3 hours

**Tasks**:
1. Create `VerifyEmailView.vue` component
2. Implement verification status check
3. Add resend verification email functionality
4. Integrate Firebase `sendEmailVerification`
5. Add auto-verification detection (optional)
6. Add route to router
7. Update signup flow to redirect to verify-email
8. Test email verification flow

### Phase 4: Enhancements and Polish
**Priority**: Low  
**Estimated Time**: 1-2 hours

**Tasks**:
1. Add password strength indicator to signup
2. Add "remember me" to login (optional)
3. Improve error messages
4. Add loading animations
5. Improve mobile responsiveness
6. Add accessibility improvements
7. Update documentation

## Rollback Plan

If issues arise during implementation:
1. Keep existing LoginView functional
2. New pages can be disabled via route guards if needed
3. Firebase Auth handles all authentication, so rollback is straightforward
4. Test each phase independently before moving to next

## Future Enhancements

- Social login (Google, Facebook, etc.)
- Two-factor authentication
- Password strength meter with requirements
- Account recovery options
- Remember me functionality
- Session management
- Email change functionality
- Username/password change in account settings

## Notes

- All authentication is handled by Firebase Auth
- No custom authentication logic required
- Email templates can be customized in Firebase Console
- Terms & Conditions acceptance deferred (as requested)
- All pages should follow existing design patterns
- Use existing composables (`useAuth`, `useForm`) where possible
- Maintain consistency with existing code style

