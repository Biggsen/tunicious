# Production Security Review Specification

## **Status**: 🔴 CRITICAL - Action Required Before Production

This document outlines security vulnerabilities discovered during a comprehensive security review of the AudioFoodie application. **All critical and high-priority issues must be addressed before production deployment.**

---

## **Executive Summary**

A comprehensive security review was conducted on the AudioFoodie application. While the application has good foundational security practices (secrets management, CSRF protection, Firestore rules), **several critical vulnerabilities were identified** that must be addressed before production:

- **5 Critical Issues** - Must fix immediately
- **4 High Priority Issues** - Should fix before production
- **4 Medium Priority Issues** - Recommended fixes
- **Multiple Good Practices** - Already implemented

**Estimated Time to Fix Critical Issues**: 2-3 days  
**Estimated Time to Fix High Priority Issues**: 1-2 days  
**Total Estimated Time**: 3-5 days

---

## **Critical Issues** 🔴

### **1. Firebase Functions Lack Authentication**

**Severity**: Critical  
**Risk**: Unauthorized access, API abuse, quota exhaustion, cost overruns

**Current State**:
- All Firebase Functions (`spotifyTokenExchange`, `spotifyRefreshToken`, `spotifyApiProxy`, `lastfmApiProxy`) are publicly accessible
- No authentication or authorization checks
- Anyone can call these endpoints without being a user

**Impact**:
- Attackers can exhaust API quotas
- Unauthorized users can access Spotify/Last.fm APIs through your backend
- Potential cost overruns from abuse
- No audit trail of legitimate vs. malicious requests

**Recommended Fix**:
```javascript
// Add Firebase Auth verification
const {onRequest} = require("firebase-functions/v2/https");
const {getAuth} = require("firebase-admin/auth");

exports.spotifyApiProxy = onRequest({
  cors: true,
  secrets: [spotifyClientId, spotifyClientSecret],
}, async (req, res) => {
  // Verify authentication token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({error: "Unauthorized"});
    return;
  }
  
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    // Continue with request using decodedToken.uid
  } catch (error) {
    res.status(401).json({error: "Invalid token"});
    return;
  }
  
  // ... rest of function
});
```

**Alternative**: Use Firebase Functions callable functions which automatically handle auth:
```javascript
const {onCall} = require("firebase-functions/v2/https");
exports.spotifyApiProxy = onCall(async (request) => {
  // request.auth is automatically populated
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  // ... rest of function
});
```

**Files to Modify**:
- `functions/src/spotify.js`
- `functions/src/lastfm.js`
- `src/composables/useBackendApi.js` (add auth headers)

---

### **2. CORS Configuration Allows All Origins**

**Severity**: Critical  
**Risk**: CSRF attacks, unauthorized API access from malicious sites

**Current State**:
- All functions use `cors: true` which allows requests from any origin
- No origin whitelist validation

**Impact**:
- Malicious websites can make requests to your API
- CSRF attacks possible
- No protection against unauthorized domains

**Recommended Fix**:
```javascript
const allowedOrigins = [
  'https://audiofoodie-d5b2c.web.app',
  'https://audiofoodie-d5b2c.firebaseapp.com',
  'http://localhost:5173', // Development only
];

exports.spotifyApiProxy = onRequest({
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  },
  secrets: [spotifyClientId, spotifyClientSecret],
}, async (req, res) => {
  // ... function code
});
```

**Files to Modify**:
- `functions/src/spotify.js`
- `functions/src/lastfm.js`
- `functions/index.js` (health check)

---

### **3. Spotify API Proxy Endpoint Validation Too Weak**

**Severity**: Critical  
**Risk**: SSRF attacks, unauthorized API access, quota abuse

**Current State**:
```javascript
// Only checks if endpoint starts with "/"
if (!endpoint.startsWith("/")) {
  res.status(400).json({error: "Invalid endpoint format"});
  return;
}
```

**Impact**:
- Attackers can call any Spotify API endpoint
- Potential SSRF if endpoint validation is bypassed
- No control over which endpoints are accessible
- Quota exhaustion from unauthorized endpoints

**Recommended Fix**:
```javascript
// Whitelist allowed endpoints
const ALLOWED_ENDPOINTS = [
  '/me',
  '/me/playlists',
  '/playlists/{playlistId}',
  '/playlists/{playlistId}/tracks',
  '/albums/{id}',
  '/artists/{id}',
  '/search',
  // Add all endpoints your app actually uses
];

function isEndpointAllowed(endpoint) {
  // Check exact matches
  if (ALLOWED_ENDPOINTS.includes(endpoint)) {
    return true;
  }
  
  // Check pattern matches (e.g., /playlists/{id})
  return ALLOWED_ENDPOINTS.some(allowed => {
    const pattern = allowed.replace(/\{[^}]+\}/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(endpoint);
  });
}

// In function:
if (!isEndpointAllowed(endpoint)) {
  res.status(403).json({error: "Endpoint not allowed"});
  return;
}
```

**Files to Modify**:
- `functions/src/spotify.js` (apiProxy function)

---

### **4. Last.fm API Key Exposed in Frontend**

**Severity**: Critical  
**Risk**: API key theft, quota abuse, unauthorized access

**Current State**:
```javascript
// src/constants.js
export const LastFmClient = {
  API_KEY: import.meta.env.PROD 
    ? import.meta.env.VITE_LASTFM_API_KEY_PROD
    : import.meta.env.VITE_LASTFM_API_KEY_DEV,
};
```

**Impact**:
- API key visible in browser DevTools
- Anyone can extract and use your API key
- Quota exhaustion from unauthorized use
- Potential cost implications

**Recommended Fix**:
- Move ALL Last.fm API calls to backend functions
- Remove `VITE_LASTFM_API_KEY_*` from frontend environment variables
- Update `useLastFmApi.js` to use backend proxy for all methods

**Files to Modify**:
- `src/constants.js` (remove LastFmClient.API_KEY)
- `src/composables/useLastFmApi.js` (use backend for all calls)
- `functions/src/lastfm.js` (ensure all methods are supported)

---

### **5. Firestore Rules Allow Broad Read Access**

**Severity**: Critical  
**Risk**: Data leakage, privacy violations

**Current State**:
```javascript
// playlists collection
allow read: if isAuthenticated(); // Any authenticated user can read all playlists

// albums collection  
allow read: if isAuthenticated(); // Any authenticated user can read all albums
```

**Impact**:
- Users can access other users' playlists
- Users can see other users' album data
- Privacy violations
- Potential data scraping

**Recommended Fix**:
```javascript
// Playlists collection
match /playlists/{playlistId} {
  allow read: if isAuthenticated() && (
    resource.data.userId == request.auth.uid || 
    isAdmin()
  );
  allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
  allow update, delete: if isAuthenticated() && resource.data.userId == request.auth.uid;
}

// Albums collection
match /albums/{albumId} {
  // Only allow reading if user has entries in this album
  allow read: if isAuthenticated() && (
    resource.data.userEntries[request.auth.uid] != null ||
    isAdmin()
  );
  allow write: if isAuthenticated() && 
    request.resource.data.userEntries[request.auth.uid] != null;
}
```

**Files to Modify**:
- `firestore.rules`

---

## **High Priority Issues** 🟠

### **6. No Rate Limiting on Firebase Functions**

**Severity**: High  
**Risk**: DDoS attacks, quota exhaustion, cost overruns

**Current State**:
- No rate limiting implemented
- Functions can be called unlimited times
- No per-IP or per-user limits

**Impact**:
- Attackers can overwhelm your functions
- API quota exhaustion
- Unexpected cost spikes
- Service degradation for legitimate users

**Recommended Fix**:
Implement rate limiting using Firestore to track requests:

```javascript
const rateLimit = async (req, identifier, limit, windowMs) => {
  const now = Date.now();
  const windowStart = now - windowMs;
  const key = `ratelimit:${identifier}`;
  
  const docRef = admin.firestore().doc(key);
  const doc = await docRef.get();
  
  if (!doc.exists) {
    await docRef.set({
      count: 1,
      resetAt: now + windowMs
    });
    return { allowed: true, remaining: limit - 1 };
  }
  
  const data = doc.data();
  if (data.resetAt < now) {
    // Window expired, reset
    await docRef.set({
      count: 1,
      resetAt: now + windowMs
    });
    return { allowed: true, remaining: limit - 1 };
  }
  
  if (data.count >= limit) {
    return { 
      allowed: false, 
      remaining: 0,
      resetAt: data.resetAt 
    };
  }
  
  await docRef.update({
    count: admin.firestore.FieldValue.increment(1)
  });
  
  return { 
    allowed: true, 
    remaining: limit - data.count - 1 
  };
};

// In function:
const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0];
const rateLimitResult = await rateLimit(req, ip, 100, 3600000); // 100/hour

if (!rateLimitResult.allowed) {
  res.status(429).json({
    error: "Rate limit exceeded",
    retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)
  });
  return;
}
```

**Recommended Limits**:
- Token exchange: 10 requests/hour per IP
- Token refresh: 100 requests/hour per user
- API proxy: 1000 requests/hour per user
- Last.fm proxy: 500 requests/hour per user

**Files to Modify**:
- `functions/src/spotify.js`
- `functions/src/lastfm.js`
- Create `functions/src/middleware/rateLimit.js`

---

### **7. Admin Checks Only Client-Side**

**Severity**: High  
**Risk**: Privilege escalation, unauthorized admin access

**Current State**:
- Admin status checked only in frontend (`useAdmin.js`)
- No server-side verification
- Firestore rules check admin status, but functions don't

**Impact**:
- Client-side checks can be bypassed
- Malicious users could attempt privilege escalation
- No server-side enforcement

**Recommended Fix**:
- Firestore rules already check admin status (good)
- Add admin verification in Firebase Functions if needed
- Ensure all admin operations go through Firestore rules

**Files to Review**:
- `src/composables/useAdmin.js` (client-side only - acceptable if Firestore rules enforce)
- Verify all admin operations are protected by Firestore rules

---

### **8. Development Environment Detection Spoofable**

**Severity**: High  
**Risk**: Dev credentials used in production, security misconfiguration

**Current State**:
```javascript
function isDevelopmentRequest(req) {
  const origin = req.headers.origin || req.headers.referer || "";
  return origin.includes("localhost") || origin.includes("127.0.0.1");
}
```

**Impact**:
- Origin header can be spoofed
- Dev credentials could be used in production
- Security misconfiguration

**Recommended Fix**:
```javascript
// Use environment variable instead
const isDevelopment = process.env.FUNCTIONS_EMULATOR === 'true' || 
                     process.env.NODE_ENV === 'development';

// Or use separate function deployments for dev/prod
const isDev = process.env.GCLOUD_PROJECT?.includes('dev');
```

**Files to Modify**:
- `functions/src/lastfm.js` (isDevelopmentRequest function)

---

### **9. Album Mappings Allow Deletion by Any Authenticated User**

**Severity**: High  
**Risk**: Data corruption, unauthorized deletions

**Current State**:
```javascript
match /albumMappings/{mappingId} {
  allow delete: if isAuthenticated(); // Any user can delete
}
```

**Impact**:
- Users can delete critical data mappings
- Data corruption
- Service disruption

**Recommended Fix**:
```javascript
match /albumMappings/{mappingId} {
  allow read: if isAuthenticated();
  allow create, update: if isAuthenticated() 
    && request.resource.data.keys().hasAll(['alternateId', 'primaryId', 'createdAt', 'updatedAt'])
    && request.resource.data.alternateId is string
    && request.resource.data.primaryId is string;
  allow delete: if isAdmin(); // Only admins can delete
}
```

**Files to Modify**:
- `firestore.rules`

---

## **Medium Priority Issues** 🟡

### **10. No Input Sanitization**

**Severity**: Medium  
**Risk**: Injection attacks, data corruption

**Current State**:
- User inputs stored without validation/sanitization
- No type checking
- No length limits

**Recommended Fix**:
- Add input validation middleware
- Sanitize all user inputs
- Validate data types and formats
- Set maximum length limits

**Files to Modify**:
- Create `functions/src/middleware/validate.js`
- Add validation to all functions

---

### **11. No Request Size Limits**

**Severity**: Medium  
**Risk**: DoS attacks via large payloads

**Current State**:
- No limits on request body size
- Functions accept unlimited payloads

**Recommended Fix**:
```javascript
const MAX_REQUEST_SIZE = 1024 * 1024; // 1MB

exports.spotifyApiProxy = onRequest({
  cors: true,
  maxInstances: 10,
  // Add request size validation in function
}, async (req, res) => {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > MAX_REQUEST_SIZE) {
    res.status(413).json({error: "Request too large"});
    return;
  }
  // ... rest of function
});
```

**Files to Modify**:
- `functions/src/spotify.js`
- `functions/src/lastfm.js`

---

### **12. Error Messages May Leak Information**

**Severity**: Medium  
**Risk**: Information disclosure

**Current State**:
- Some error messages expose internal details
- Stack traces may be exposed in development

**Recommended Fix**:
- Use generic error messages in production
- Log detailed errors server-side only
- Don't expose stack traces to clients

**Files to Review**:
- All error handling in `functions/src/`

---

### **13. Service Account File Referenced in Scripts**

**Severity**: Low-Medium  
**Risk**: Accidental commit of sensitive file

**Current State**:
- `dbscripts/` reference `service-account.json`
- File is in `.gitignore` (good)
- But scripts assume it exists

**Recommended Fix**:
- Document that service account file is required for scripts
- Add checks in scripts to verify file exists
- Consider using environment variables instead

**Files to Review**:
- `dbscripts/migrate-pipelineRole.js`
- `dbscripts/backfill-artistNameLower.js`

---

## **Good Security Practices** ✅

The following security practices are already well-implemented:

1. ✅ **Secrets Management**: Secrets stored in Firebase Functions using `defineSecret()`
2. ✅ **CSRF Protection**: State parameter implemented for Spotify OAuth
3. ✅ **Password Reset Security**: Doesn't reveal if email exists
4. ✅ **No XSS Vulnerabilities**: No `innerHTML` or `v-html` usage found
5. ✅ **Router Guards**: Authentication enforced at route level
6. ✅ **Firestore Rules Structure**: Generally well-structured with owner checks
7. ✅ **No Hardcoded Secrets**: No secrets found in codebase

---

## **Implementation Plan**

### **Phase 1: Critical Fixes (Days 1-2)** 🔴

**Priority**: Must complete before production

1. **Add Authentication to Firebase Functions** (4-6 hours)
   - Implement Firebase Auth verification in all functions
   - Update frontend to send auth tokens
   - Test authentication flow

2. **Restrict CORS** (1-2 hours)
   - Whitelist specific origins
   - Update all function CORS configs
   - Test from allowed/disallowed origins

3. **Move Last.fm API to Backend** (2-3 hours)
   - Update `useLastFmApi.js` to use backend for all calls
   - Remove API key from frontend
   - Test all Last.fm functionality

4. **Tighten Firestore Rules** (2-3 hours)
   - Restrict playlist/album reads to owners
   - Restrict album mapping deletions to admins
   - Test with different user roles

5. **Strengthen Spotify API Proxy Validation** (2-3 hours)
   - Create endpoint whitelist
   - Implement pattern matching
   - Test with various endpoints

**Total Time**: ~12-17 hours (1.5-2 days)

---

### **Phase 2: High Priority Fixes (Days 3-4)** 🟠

**Priority**: Should complete before production

6. **Implement Rate Limiting** (4-6 hours)
   - Create rate limit middleware
   - Add to all functions
   - Configure appropriate limits
   - Test rate limiting behavior

7. **Fix Development Environment Detection** (1 hour)
   - Use environment variables
   - Remove origin-based detection
   - Test in dev/prod environments

8. **Verify Admin Checks** (1-2 hours)
   - Audit all admin operations
   - Ensure Firestore rules protect all admin actions
   - Add server-side checks if needed

**Total Time**: ~6-9 hours (1 day)

---

### **Phase 3: Medium Priority Fixes (Optional)** 🟡

**Priority**: Recommended but not blocking

9. **Add Input Validation** (3-4 hours)
10. **Add Request Size Limits** (1-2 hours)
11. **Improve Error Messages** (2-3 hours)
12. **Document Service Account Usage** (1 hour)

**Total Time**: ~7-10 hours (1 day)

---

## **Testing Checklist**

After implementing fixes, verify:

- [ ] All Firebase Functions require authentication
- [ ] CORS only allows whitelisted origins
- [ ] Last.fm API key not exposed in frontend bundle
- [ ] Firestore rules prevent unauthorized reads
- [ ] Spotify API proxy only allows whitelisted endpoints
- [ ] Rate limiting works correctly
- [ ] Development/production environment detection works
- [ ] Admin operations properly protected
- [ ] All existing functionality still works
- [ ] Error messages don't leak sensitive information

---

## **Deployment Checklist**

Before deploying to production:

- [ ] All critical issues fixed
- [ ] All high-priority issues fixed (recommended)
- [ ] Security testing completed
- [ ] Rate limits configured appropriately
- [ ] CORS origins whitelisted
- [ ] Environment variables properly set
- [ ] Firestore rules deployed and tested
- [ ] Monitoring/alerting configured
- [ ] Rollback plan documented

---

## **Monitoring Recommendations**

After deployment, monitor:

1. **Function Invocations**
   - Track unusual spikes
   - Monitor for abuse patterns
   - Set up alerts for high error rates

2. **API Quota Usage**
   - Monitor Spotify API usage
   - Monitor Last.fm API usage
   - Set up alerts for quota thresholds

3. **Authentication Failures**
   - Track 401 errors
   - Monitor for brute force attempts
   - Alert on suspicious patterns

4. **Rate Limit Hits**
   - Track 429 responses
   - Identify abusive users/IPs
   - Adjust limits if needed

---

## **Additional Resources**

- [Firebase Functions Authentication](https://firebase.google.com/docs/functions/http-events#handle_authentication)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Firebase Security Best Practices](https://firebase.google.com/docs/rules/best-practices)

---

## **Summary**

**Critical Issues**: 5 (Must fix)  
**High Priority Issues**: 4 (Should fix)  
**Medium Priority Issues**: 4 (Recommended)

**Estimated Total Time**: 3-5 days

**Recommendation**: Address all critical and high-priority issues before production deployment. Medium-priority issues can be addressed post-launch but should be planned for the near term.

---

**Created**: 2025-01-XX  
**Status**: 🔴 Critical - Action Required  
**Priority**: Must Complete Before Production  
**Last Updated**: 2025-01-XX

