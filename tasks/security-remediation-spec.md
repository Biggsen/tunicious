# Security Remediation & Backend Implementation Specification

## **Current Security Issues**
- Spotify Client Secret exposed in production bundle: `5623d4711fbd4469a51b2f8158d403cf`
- Last.fm API Secret exposed in production bundle: `ea96c5450dbf4a52f81577156883dba8`
- Direct API calls from frontend with sensitive credentials
- Missing CSRF protection (no state parameter)

## **Proposed Solution: Firebase Functions Backend**

### **Architecture Overview**
```
Frontend (Vue.js) → Firebase Functions → Spotify/Last.fm APIs
```

### **Implementation Plan**

#### **Phase 1: Backend Infrastructure Setup**
1. **Firebase Functions Initialization**
   - Add Firebase Functions to existing repo
   - Configure TypeScript/JavaScript environment
   - Set up local development environment
   - Configure deployment pipeline

2. **Environment Variables Management**
   - Move sensitive secrets to Firebase Functions environment
   - Remove `VITE_` prefix from sensitive variables
   - Set up secure environment variable storage

#### **Phase 2: Secure API Endpoints**

**Endpoint 1: Spotify Token Exchange**
```
POST /api/spotify/token-exchange
Body: { code: string, redirectUri: string }
Response: { accessToken: string, refreshToken: string, expiresIn: number }
```

**Endpoint 2: Spotify Token Refresh**
```
POST /api/spotify/refresh-token
Body: { refreshToken: string }
Response: { accessToken: string, expiresIn: number }
```

**Endpoint 3: Spotify API Proxy**
```
POST /api/spotify/proxy
Body: { endpoint: string, method: string, data?: any }
Response: Spotify API response
```

**Endpoint 4: Last.fm API Proxy**
```
POST /api/lastfm/proxy
Body: { method: string, params: object }
Response: Last.fm API response
```

#### **Phase 3: Frontend Refactoring**

1. **Remove Direct API Calls**
   - Replace direct Spotify API calls with backend proxy calls
   - Remove client secret usage from frontend
   - Update token management to use backend endpoints

2. **Enhanced Security**
   - Add state parameter for CSRF protection
   - Implement proper error handling
   - Add request validation

#### **Phase 4: Security Hardening**

1. **Secrets Management**
   - Regenerate all exposed API secrets
   - Implement secret rotation strategy
   - Add monitoring for secret exposure

2. **Authentication Flow Security**
   - Add PKCE (Proof Key for Code Exchange) for additional security
   - Implement proper session management
   - Add rate limiting

### **File Structure Changes**

```
src/
├── functions/                    # NEW: Firebase Functions
│   ├── src/
│   │   ├── index.ts
│   │   ├── spotify.ts
│   │   ├── lastfm.ts
│   │   └── utils/
│   ├── package.json
│   └── tsconfig.json
├── composables/
│   ├── useSpotifyApi.js         # MODIFY: Remove client secret usage
│   ├── useUserSpotifyApi.js     # MODIFY: Use backend endpoints
│   └── useBackendApi.js         # NEW: Backend API client
└── constants.js                 # MODIFY: Remove sensitive variables
```

### **Security Improvements**

1. **Client Secret Protection**
   - Secrets only exist in Firebase Functions environment
   - No exposure in client-side code
   - Secure environment variable management

2. **CSRF Protection**
   - State parameter validation
   - Request origin verification
   - Session-based security

3. **API Security**
   - Request validation and sanitization
   - Rate limiting and abuse prevention
   - Proper error handling without information leakage

### **Migration Strategy**

1. **Parallel Implementation**
   - Build backend endpoints alongside existing frontend
   - Maintain backward compatibility during transition
   - Gradual migration of API calls

2. **Testing Strategy**
   - Unit tests for all backend endpoints
   - Integration tests for authentication flow
   - Security testing for secret exposure

3. **Deployment Plan**
   - Deploy Firebase Functions first
   - Update frontend to use new endpoints
   - Regenerate and update API secrets
   - Monitor for any issues

### **Estimated Timeline**
- **Phase 1**: 2-3 days (Backend setup)
- **Phase 2**: 3-4 days (API endpoints)
- **Phase 3**: 2-3 days (Frontend refactoring)
- **Phase 4**: 1-2 days (Security hardening)
- **Total**: 8-12 days

### **Risk Mitigation**
- Keep existing functionality working during migration
- Implement comprehensive logging and monitoring
- Have rollback plan ready
- Test thoroughly in staging environment

### **Next Steps**
1. Review and approve this specification
2. Begin Phase 1: Firebase Functions setup
3. Set up development environment
4. Implement secure token exchange endpoint

---

**Created**: $(date)
**Status**: Draft - Pending Review
**Priority**: Critical Security Issue
