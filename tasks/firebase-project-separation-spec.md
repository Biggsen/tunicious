# Firebase Project Separation Specification

## **Current State**
- Single Firebase project (`audiofoodie-d5b2c`) used for both development and production
- Environment-specific data stored in nested objects (e.g., `lastFmSessionKeys: { dev: '...', prod: '...' }`)
- Environment detection logic scattered throughout the codebase
- Risk of dev data interfering with production data

## **Goal**
Separate development and production environments into distinct Firebase projects to ensure complete isolation, improve security, and follow industry best practices.

## **Benefits**
- **Complete Data Isolation**: Dev and prod data completely separated
- **Security**: No risk of accidental production data modification from dev
- **Simplicity**: Remove environment-specific logic from application code
- **Testing**: Safe testing without affecting production
- **Scalability**: Easier to manage different configurations per environment
- **Cost Control**: Separate billing and quotas per environment

## **Implementation Plan**

### **Phase 1: Create Development Firebase Project**

1. **Create New Firebase Project**
   - Project ID: `audiofoodie-dev` (or similar)
   - Enable Firestore Database
   - Enable Firebase Authentication
   - Enable Firebase Functions
   - Configure hosting (optional, for dev preview)

2. **Set Up Development Environment**
   - Create service account for dev project
   - Set up Firebase CLI configuration for dev project
   - Configure local development environment variables

3. **Migrate Development Data** (if needed)
   - Export dev-specific data from current project
   - Import to new dev project
   - Verify data integrity

### **Phase 2: Update Application Configuration**

1. **Environment-Based Firebase Configuration**
   - Update `src/firebase.js` to use environment-specific config
   - Add new environment variables:
     - `VITE_FIREBASE_API_KEY_DEV`
     - `VITE_FIREBASE_AUTH_DOMAIN_DEV`
     - `VITE_FIREBASE_PROJECT_ID_DEV`
     - `VITE_FIREBASE_STORAGE_BUCKET_DEV`
     - `VITE_FIREBASE_MESSAGING_SENDER_ID_DEV`
     - `VITE_FIREBASE_APP_ID_DEV`
   - Keep existing PROD variables

2. **Update Firebase Functions Configuration**
   - Create separate function deployments for dev and prod
   - Update `firebase.json` or use separate configs
   - Set up environment-specific secrets:
     - Dev: `LASTFM_API_KEY_DEV`, `LASTFM_API_SECRET_DEV`
     - Prod: `LASTFM_API_KEY_PROD`, `LASTFM_API_SECRET_PROD`

### **Phase 3: Remove Environment-Specific Data Structures**

1. **Simplify User Data Structure**
   - Remove nested environment objects:
     - Change `lastFmSessionKeys: { dev: '...', prod: '...' }` → `lastFmSessionKey: '...'`
     - Change `lastFmAuthenticated: { dev: true, prod: false }` → `lastFmAuthenticated: true`
   - Update `src/composables/useUserData.js`:
     - Remove `getEnvironment()` import
     - Remove computed values for `lastFmSessionKey` and `lastFmAuthenticated`
     - Return direct values from `userData`
     - Simplify `clearLastFmAuth()` function

2. **Update Last.fm Callback View**
   - Update `src/views/auth/LastFmCallbackView.vue`:
     - Remove environment detection logic
     - Store session key directly (not nested)

3. **Update All Components**
   - Remove `lastFmSessionKey` and `lastFmAuthenticated` computed values from `useUserData` usage
   - Update components to use `userData.lastFmSessionKey` and `userData.lastFmAuthenticated` directly:
     - `src/views/auth/AccountView.vue`
     - `src/components/LastFmDiagnostics.vue`
     - `src/views/playlists/PlaylistSingle.vue`

4. **Remove Environment Utility**
   - Delete `src/utils/env.js` (no longer needed)

### **Phase 4: Update Firebase Functions**

1. **Simplify Environment Detection**
   - Remove environment detection from `functions/src/lastfm.js`
   - **TODO: Remove origin-based detection workaround** - Currently `isDevelopmentEnvironment()` checks request origin for localhost as a temporary workaround. Once Firebase Functions emulator is set up and working, remove the origin check (lines checking `req.headers.origin` for localhost) and rely solely on server-side environment variables.
   - Use single set of secrets per deployment
   - Deploy dev functions with dev secrets
   - Deploy prod functions with prod secrets

2. **Update Deployment Process**
   - Create separate deployment scripts:
     - `npm run deploy:functions:dev`
     - `npm run deploy:functions:prod`
   - Or use Firebase project aliases:
     - `firebase use dev`
     - `firebase use prod`

### **Phase 5: Update CI/CD Pipeline**

1. **GitHub Actions Updates**
   - Update deployment workflows to use correct Firebase project
   - Add environment-specific secrets to GitHub Secrets
   - Configure separate deployments for dev and prod branches

2. **Environment Variable Management**
   - Document required environment variables for each project
   - Update `.env.example` files
   - Update deployment documentation

### **Phase 6: Testing & Validation**

1. **Development Environment Testing**
   - Verify dev Firebase project connection
   - Test Last.fm authentication in dev
   - Verify data isolation (dev changes don't affect prod)

2. **Production Environment Testing**
   - Verify prod Firebase project connection
   - Test Last.fm authentication in prod
   - Verify production data integrity

3. **Migration Verification**
   - Ensure no data loss during migration
   - Verify all features work in both environments
   - Test authentication flows in both environments

## **File Changes Summary**

### **Files to Modify**
- `src/firebase.js` - Environment-based config
- `src/composables/useUserData.js` - Remove environment logic
- `src/views/auth/LastFmCallbackView.vue` - Simplify session storage
- `src/views/auth/AccountView.vue` - Use direct userData properties
- `src/components/LastFmDiagnostics.vue` - Use direct userData properties
- `src/views/playlists/PlaylistSingle.vue` - Use direct userData properties
- `functions/src/lastfm.js` - Remove environment detection
- `firebase.json` - Add project configuration (or use aliases)
- `.github/workflows/*.yml` - Update deployment workflows

### **Files to Delete**
- `src/utils/env.js` - No longer needed

### **New Files to Create**
- `.env.development.example` - Dev environment variables template
- `.env.production.example` - Prod environment variables template
- `firebase.dev.json` (optional) - Dev-specific Firebase config
- `firebase.prod.json` (optional) - Prod-specific Firebase config

## **Environment Variables**

### **Development**
```bash
VITE_FIREBASE_API_KEY_DEV=
VITE_FIREBASE_AUTH_DOMAIN_DEV=
VITE_FIREBASE_PROJECT_ID_DEV=
VITE_FIREBASE_STORAGE_BUCKET_DEV=
VITE_FIREBASE_MESSAGING_SENDER_ID_DEV=
VITE_FIREBASE_APP_ID_DEV=
VITE_LASTFM_API_KEY_DEV=
VITE_SPOTIFY_CLIENT_ID=
```

### **Production**
```bash
VITE_FIREBASE_API_KEY_PROD=
VITE_FIREBASE_AUTH_DOMAIN_PROD=
VITE_FIREBASE_PROJECT_ID_PROD=
VITE_FIREBASE_STORAGE_BUCKET_PROD=
VITE_FIREBASE_MESSAGING_SENDER_ID_PROD=
VITE_FIREBASE_APP_ID_PROD=
VITE_LASTFM_API_KEY_PROD=
VITE_SPOTIFY_CLIENT_ID=
```

## **Firebase Functions Secrets**

### **Development Project**
- `LASTFM_API_KEY_DEV`
- `LASTFM_API_SECRET_DEV`
- `SPOTIFY_CLIENT_SECRET` (if needed)

### **Production Project**
- `LASTFM_API_KEY_PROD`
- `LASTFM_API_SECRET_PROD`
- `SPOTIFY_CLIENT_SECRET` (if needed)

## **Deployment Commands**

### **Development**
```bash
# Switch to dev project
firebase use dev

# Deploy functions
firebase deploy --only functions

# Deploy hosting (if applicable)
firebase deploy --only hosting
```

### **Production**
```bash
# Switch to prod project
firebase use prod

# Deploy functions
firebase deploy --only functions

# Deploy hosting
firebase deploy --only hosting
```

## **Migration Checklist**

- [ ] Create development Firebase project
- [ ] Set up Firebase CLI with project aliases
- [ ] Update environment variables in both projects
- [ ] Update `src/firebase.js` with environment-based config
- [ ] Simplify user data structure (remove nested objects)
- [ ] Update all components to use direct userData properties
- [ ] Remove `src/utils/env.js`
- [ ] Update Firebase Functions to remove environment detection
- [ ] Deploy functions to both projects
- [ ] Update CI/CD workflows
- [ ] Test development environment
- [ ] Test production environment
- [ ] Verify data isolation
- [ ] Update documentation

## **Rollback Plan**

If issues arise:
1. Keep both projects active during transition
2. Maintain ability to switch back to single project
3. Keep environment-specific data structure as fallback
4. Document rollback procedure

## **Notes**

- This is a breaking change for existing development data
- Users will need to re-authenticate Last.fm in dev environment
- Production data remains unaffected
- Consider data migration script if dev data needs to be preserved
- Update team documentation with new deployment procedures

