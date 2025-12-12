# Production Deployment to tunicious.com Specification

## Status: 📋 Planning

## Overview

This document outlines the complete process for deploying Tunicious to production at the custom domain `tunicious.com`. The application is currently deployed to Firebase Hosting at `audiofoodie-d5b2c.web.app` and needs to be configured for the custom domain while maintaining all existing functionality.

## Goals

1. Configure `tunicious.com` as the primary production domain
2. Update all code references to use the new domain
3. Configure third-party services (Spotify, Firebase Auth) for the new domain
4. Ensure CORS and security settings allow the new domain
5. Maintain backward compatibility with existing Firebase domain
6. Verify all integrations work correctly with the new domain

## Current State

**Current Production Domain**: `audiofoodie-d5b2c.web.app`  
**Target Production Domain**: `tunicious.com`  
**Firebase Project**: `audiofoodie-d5b2c`  
**Hosting Platform**: Firebase Hosting  
**Deployment Method**: GitHub Actions (automatic on push to `main`)

**Current Configuration**:
- Spotify OAuth redirect: `https://audiofoodie-d5b2c.web.app/spotify-callback`
- CORS allowed origins: `audiofoodie-d5b2c.web.app`, `audiofoodie-d5b2c.firebaseapp.com`, `localhost:5173`
- Firebase Auth authorized domains: Default Firebase domains

## Implementation Plan

### Phase 1: Domain Configuration

#### 1.1 Firebase Hosting Custom Domain Setup

**Steps**:
1. Navigate to Firebase Console → Hosting → Add custom domain
2. Enter `tunicious.com` as the domain
3. Follow Firebase's verification process:
   - Add TXT record to DNS for domain verification
   - Wait for verification (usually minutes to hours)
   - Firebase will provide A/AAAA records
4. Add A/AAAA records to DNS at domain registrar
5. Optionally add `www.tunicious.com` if desired
6. Wait for SSL certificate provisioning (automatic, usually 24-48 hours)

**Expected Outcome**: Domain verified and SSL certificate issued

**Files Modified**: None (Firebase Console configuration)

---

#### 1.2 DNS Configuration

**At Domain Registrar** (where tunicious.com is registered):

1. Add TXT record for Firebase verification (provided by Firebase)
2. After verification, add A/AAAA records (provided by Firebase)
3. If using www subdomain, configure accordingly

**Expected Outcome**: DNS records properly configured and propagated

---

### Phase 2: Code Updates

#### 2.1 Update CORS Configuration

**File**: `functions/src/cors.js`

**Current State**:
```javascript
const allowedOrigins = [
  "https://audiofoodie-d5b2c.web.app",
  "https://audiofoodie-d5b2c.firebaseapp.com",
  "http://localhost:5173", // Development only
];
```

**Required Change**: Add new production domains to allowed origins

**Updated Code**:
```javascript
const allowedOrigins = [
  "https://audiofoodie-d5b2c.web.app",
  "https://audiofoodie-d5b2c.firebaseapp.com",
  "https://tunicious.com",
  "https://www.tunicious.com", // If using www
  "http://localhost:5173", // Development only
];
```

**Impact**: Firebase Functions will accept requests from the new domain

**Testing**: Verify API calls from new domain work correctly

---

#### 2.2 Update Spotify OAuth Redirect URI

**File**: `src/constants.js`

**Current State**:
```javascript
REDIRECT_URI: import.meta.env.PROD 
  ? 'https://audiofoodie-d5b2c.web.app/spotify-callback'
  : 'http://localhost:5173/spotify-callback',
```

**Required Change**: Update production redirect URI to new domain

**Updated Code**:
```javascript
REDIRECT_URI: import.meta.env.PROD 
  ? 'https://tunicious.com/spotify-callback'
  : 'http://localhost:5173/spotify-callback',
```

**Impact**: Spotify OAuth will redirect to the new domain after authentication

**Testing**: Verify Spotify OAuth flow completes successfully

---

#### 2.3 Update Spotify App Settings

**Location**: Spotify Developer Dashboard

**Steps**:
1. Navigate to Spotify Developer Dashboard → Your App → Settings
2. Under "Redirect URIs", add:
   - `https://tunicious.com/spotify-callback`
   - `https://www.tunicious.com/spotify-callback` (if using www)
3. Keep existing redirect URIs for backward compatibility during transition
4. Save changes

**Expected Outcome**: Spotify accepts OAuth redirects from new domain

**Testing**: Verify Spotify authentication works with new domain

---

### Phase 3: Firebase Configuration

#### 3.1 Update Firebase Auth Authorized Domains

**Location**: Firebase Console → Authentication → Settings → Authorized domains

**Steps**:
1. Navigate to Firebase Console → Authentication → Settings
2. Scroll to "Authorized domains" section
3. Click "Add domain"
4. Add:
   - `tunicious.com`
   - `www.tunicious.com` (if using www)
5. Save changes

**Expected Outcome**: Firebase Auth accepts authentication requests from new domain

**Testing**: Verify user authentication works from new domain

---

#### 3.2 Verify Firebase Project Settings

**Checklist**:
- [ ] Billing enabled (if required for custom domains)
- [ ] Firestore indexes deployed (`firestore.indexes.json`)
- [ ] Firestore security rules deployed (`firestore.rules`)
- [ ] Firebase Functions deployed and working
- [ ] Project ID: `audiofoodie-d5b2c` (no changes needed)

**Expected Outcome**: All Firebase services properly configured

---

### Phase 4: Environment Variables

#### 4.1 Verify GitHub Secrets

**Location**: GitHub Repository → Settings → Secrets and variables → Actions

**Required Secrets** (should already be configured):
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_SPOTIFY_CLIENT_ID`
- `VITE_LASTFM_API_KEY_PROD`
- `FIREBASE_SERVICE_ACCOUNT_AUDIOFOODIE_D5B2C`

**Action**: Verify all secrets exist and are correct

**Expected Outcome**: All environment variables available for deployment

---

### Phase 5: Deployment

#### 5.1 Automatic Deployment via GitHub Actions

**Current Setup**: Already configured in `.github/workflows/firebase-hosting-merge.yml`

**Process**:
1. Commit code changes (CORS, redirect URI)
2. Push to `main` branch
3. GitHub Actions automatically:
   - Builds the application
   - Deploys to Firebase Hosting
   - Uses custom domain automatically (if configured in Firebase)

**Expected Outcome**: Application deployed to tunicious.com

**Testing**: Verify deployment completes successfully

---

#### 5.2 Manual Deployment (if needed)

**Command**:
```bash
npm run build
firebase deploy --only hosting
```

**Expected Outcome**: Application deployed to Firebase Hosting

---

### Phase 6: Testing Checklist

#### 6.1 Domain and SSL

- [ ] Domain resolves correctly (`tunicious.com` loads)
- [ ] SSL certificate is active (HTTPS works)
- [ ] www subdomain works (if configured)
- [ ] No SSL warnings in browser

---

#### 6.2 Authentication

- [ ] User can sign up with email/password
- [ ] User can sign in with email/password
- [ ] User can sign in with Google (if enabled)
- [ ] Firebase Auth redirects work correctly
- [ ] Session persists across page reloads

---

#### 6.3 Spotify Integration

- [ ] Spotify OAuth flow initiates correctly
- [ ] Spotify OAuth redirects to new domain
- [ ] Spotify token exchange completes successfully
- [ ] Spotify API calls work (playlists, tracks, etc.)
- [ ] Spotify player integration works
- [ ] Playlist creation/editing works

---

#### 6.4 Last.fm Integration

- [ ] Last.fm OAuth flow works
- [ ] Last.fm API calls succeed
- [ ] Scrobbling works correctly
- [ ] Last.fm stats display correctly

---

#### 6.5 API and CORS

- [ ] Firebase Functions accept requests from new domain
- [ ] No CORS errors in browser console
- [ ] All API endpoints work correctly
- [ ] Rate limiting works as expected

---

#### 6.6 Core Functionality

- [ ] Playlists load correctly
- [ ] Albums display correctly
- [ ] Album movements work
- [ ] Playlist updates work
- [ ] Search functionality works
- [ ] Onboarding flow works

---

#### 6.7 Performance

- [ ] Page load times acceptable
- [ ] No excessive API calls
- [ ] Caching works correctly
- [ ] Images load correctly

---

### Phase 7: Post-Deployment

#### 7.1 Monitor and Verify

**Monitoring Checklist**:
- [ ] Check Firebase Hosting analytics
- [ ] Monitor Firebase Functions logs for errors
- [ ] Check for CORS errors in browser console
- [ ] Verify authentication success rates
- [ ] Monitor API usage and quotas

---

#### 7.2 Update Documentation

**Files to Update**:
- [ ] README.md (update production URL)
- [ ] Any documentation referencing old domain
- [ ] Environment variable documentation

---

#### 7.3 Optional: Redirect Old Domain

**Option 1**: Keep both domains active (recommended during transition)

**Option 2**: Add redirect rule in `firebase.json`:
```json
{
  "hosting": {
    "redirects": [
      {
        "source": "https://audiofoodie-d5b2c.web.app/**",
        "destination": "https://tunicious.com/:splat",
        "type": 301
      }
    ]
  }
}
```

**Decision**: Determine if redirect is needed based on user base

---

## Files to Modify

### Code Changes

1. **`functions/src/cors.js`**
   - Add `tunicious.com` and `www.tunicious.com` to `allowedOrigins` array

2. **`src/constants.js`**
   - Update `SpotifyAuth.REDIRECT_URI` production value to `https://tunicious.com/spotify-callback`

### Configuration Changes (External)

1. **Firebase Console**
   - Add custom domain `tunicious.com`
   - Add authorized domains in Firebase Auth

2. **Spotify Developer Dashboard**
   - Add redirect URIs for new domain

3. **DNS Provider**
   - Add TXT record for verification
   - Add A/AAAA records for hosting

---

## Rollback Plan

If issues occur after deployment:

1. **Immediate Rollback**: Old domain (`audiofoodie-d5b2c.web.app`) should still work
2. **Code Rollback**: Revert commits if needed
3. **Domain Rollback**: Remove custom domain from Firebase (old domain remains active)
4. **Service Rollback**: Revert Spotify redirect URI changes

---

## Timeline Estimate

- **Domain Setup**: 1-2 hours (mostly waiting for DNS/SSL)
- **Code Changes**: 30 minutes
- **Configuration Changes**: 30 minutes
- **Testing**: 2-3 hours
- **Total**: 4-6 hours (spread over 1-2 days due to DNS/SSL propagation)

---

## Success Criteria

✅ Domain `tunicious.com` is live and accessible  
✅ SSL certificate is active  
✅ All authentication flows work  
✅ All third-party integrations (Spotify, Last.fm) work  
✅ No CORS errors  
✅ All core functionality works  
✅ Performance is acceptable  
✅ No security issues introduced  

---

## Notes

- Keep old Firebase domain active during transition for safety
- DNS propagation can take up to 48 hours (usually much faster)
- SSL certificate provisioning is automatic but can take 24-48 hours
- Test thoroughly before announcing new domain
- Monitor logs closely for first few days after deployment

---

## Related Documentation

- Firebase Hosting Custom Domains: https://firebase.google.com/docs/hosting/custom-domain
- Spotify App Settings: https://developer.spotify.com/dashboard
- Firebase Auth Authorized Domains: https://firebase.google.com/docs/auth/web/domain-verification

---

## Status Tracking

- [ ] Phase 1: Domain Configuration
- [ ] Phase 2: Code Updates
- [ ] Phase 3: Firebase Configuration
- [ ] Phase 4: Environment Variables Verification
- [ ] Phase 5: Deployment
- [ ] Phase 6: Testing
- [ ] Phase 7: Post-Deployment

