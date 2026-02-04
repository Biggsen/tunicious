# Firebase Project Separation Specification

## **Status**: 📋 Ready to implement

## **Current State**
- Single Firebase project (`audiofoodie-d5b2c`) used for both development and production
- Environment detection in Firebase Functions (`isDevelopmentEnvironment()` + four separate Last.fm secrets) to choose dev vs prod credentials
- Risk of dev data or misconfiguration affecting production

## **Goal**
Separate development and production into distinct Firebase projects. Which project the app talks to is decided by **Vite mode** and the **env file** it loads—same env var names everywhere, no `_DEV`/`_PROD` branching in code. Dev uses the dev project (and optionally emulators); prod uses the prod project. CI deploys only production.

## **Benefits**
- **Data isolation**: Dev and prod data fully separated
- **Security**: No accidental production changes from dev
- **Simplicity**: One config shape; mode + env file choose values
- **Local dev**: Emulators optional for Firestore, Auth, Functions
- **CI**: Single pipeline—prod only; dev stays local + emulators

---

## **Strategy Summary**

| Item | Approach |
|------|----------|
| **Config choice** | Same env var names in every environment. Vite mode + which `.env.*` file loads decides dev vs prod (no `_DEV`/`_PROD` in code). |
| **Env files** | `.env.development` (dev project + emulators), `.env.production` (prod)—both gitignored. Committed: `env.production.example` only. |
| **Scripts** | `dev` → Vite development mode → dev project (and emulators if `VITE_FIREBASE_EMULATORS=1`). `dev:prod` → run app against prod locally. `emulators` → start Firestore, Auth, Functions emulators for dev project. |
| **firebase.js** | Single config from `import.meta.env`. Connect to emulators when `VITE_FIREBASE_EMULATORS` is set. Optional prod warning by `projectId`. |
| **CI/CD** | **Option 1**: Only production deploys. Push to `main` → build with prod env → deploy to prod Firebase. No automated dev deploy; dev is local + emulators. |
| **Functions** | One set of secret names per deployment (`LASTFM_API_KEY`, `LASTFM_API_SECRET`, etc.). Dev project secrets = dev values; prod project secrets = prod values. Remove `isDevelopmentEnvironment()` and four separate Last.fm secrets. |

---

## **Implementation Plan**

### **Phase 1: Create development Firebase project**

1. **Create new Firebase project**
   - Project ID: e.g. `demo-tunicious` or `audiofoodie-dev`
   - Enable Firestore, Authentication, Functions
   - Hosting optional (for a hosted dev URL if you ever want one)

2. **Deploy Firestore rules and indexes to dev**
   - `firebase use dev`
   - `firebase deploy --only firestore:rules`
   - `firebase deploy --only firestore:indexes` (or ensure `firestore.indexes.json` is deployed)

3. **Auth authorized domains (dev project)**
   - In Firebase Console → Authentication → Settings → Authorized domains, add:
     - `localhost` (for local dev)
     - Dev hosting domain if you use it (e.g. `demo-tunicious.web.app`)

4. **Firebase CLI and `.firebaserc`**
   - Add project aliases so `firebase use dev` and `firebase use prod` work.
   - Example `.firebaserc`:
   ```json
   {
     "projects": {
       "default": "audiofoodie-d5b2c",
       "dev": "demo-tunicious",
       "prod": "audiofoodie-d5b2c"
     }
   }
   ```
   - Replace `demo-tunicious` / `audiofoodie-d5b2c` with your actual project IDs.

5. **Third-party redirect URIs**
   - **Spotify**: In Spotify Developer Dashboard, ensure redirect URIs include `http://localhost:5173/spotify-callback` (and dev hosting URL if used). Prod URL already configured.
   - **Last.fm**: Same idea for callback URL for localhost (and dev hosting if used).

---

### **Phase 2: Env files and .gitignore**

1. **.gitignore**
   - Ensure `.env.*` is ignored so real keys are never committed (e.g. `.env`, `.env.development`, `.env.production`). Prefer a single line: `.env*` or list `.env`, `.env.development`, `.env.production`.

2. **.env.development** (local only, do not commit)
   - Same keys as below; values point to the **dev** Firebase project.
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` — use dev project values.
   - `VITE_FIREBASE_EMULATORS=1` — so the app connects to emulators when you run `npm run dev`.
   - `VITE_SPOTIFY_CLIENT_ID` — same as prod or dev Spotify app, as you prefer.
   - For Node/CLI or emulator-bound tooling (e.g. db scripts): `GCLOUD_PROJECT=<dev-project-id>`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` (optional; useful when running scripts against emulators).

3. **.env.production** (local only, do not commit)
   - Same variable names as above; values point to the **prod** Firebase project.
   - `VITE_FIREBASE_EMULATORS=0`
   - Optional: `VITE_DEV_MODE=production` for extra “I’m on prod” warnings in the app.

4. **env.production.example** (committed)
   - Same keys as `.env.production`, with placeholder values and a short comment: “Copy to `.env.production` and fill in; required for production builds and CI.”

---

### **Phase 3: npm scripts (Vite + cross-env on Windows)**

- Add `cross-env` as a devDependency so env vars in scripts work on Windows.
- **dev** — `vite` (no `--mode`) → Vite uses `development` → loads `.env.development` → dev project; with `VITE_FIREBASE_EMULATORS=1`, app connects to emulators.
- **dev:prod** — `cross-env VITE_FIREBASE_EMULATORS=0 vite --port 5173 --mode production` → loads `.env.production` → prod project, no emulators. Use when you want to run the app locally against prod.
- **dev:prod:confirm** (optional) — Same as `dev:prod` but with `VITE_CONFIRM_PROD=true` if you add confirmation dialogs for dangerous ops.
- **emulators** — `firebase emulators:start --only firestore,auth,functions --project <dev-project-id>` (replace with your dev project ID or use an npm script that sets it).

Use `cross-env` for any env vars in scripts (e.g. `cross-env VITE_FIREBASE_EMULATORS=0 vite ...`).

---

### **Phase 4: Frontend Firebase init (`src/firebase.js`)**

- **Single config** from env: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` (and optionally `measurementId`) from `import.meta.env.VITE_FIREBASE_*`. No branching on different variable names.
- **Emulator hook-up** when `VITE_FIREBASE_EMULATORS` is `'1'` or `'true'` (and you’re in a browser):
  - Firestore: `connectFirestoreEmulator(db, hostname, 8080)`
  - Auth: `connectAuthEmulator(auth, 'http://${hostname}:9099', { disableWarnings: true })`
  - Functions (if used): `connectFunctionsEmulator(functions, hostname, 5001)`
  Use `window.location.hostname` so the same build works from other devices on the network.
- **Optional prod warning**: If `projectId === '<prod-project-id>'` and not using emulators, `console.warn` that production DB is active. Optionally branch on `VITE_DEV_MODE === 'production'` for a “dev:prod” message.

No branching on `_DEV`/`_PROD` variable names; only on `VITE_FIREBASE_EMULATORS` and, if you want, `projectId` for the warning.

---

### **Phase 5: Firebase Functions (single secrets per project)**

- **Current state**: `functions/src/lastfm.js` uses `isDevelopmentEnvironment(req)` and four secrets (`LASTFM_API_KEY_DEV`, `LASTFM_API_SECRET_DEV`, `LASTFM_API_KEY_PROD`, `LASTFM_API_SECRET_PROD`) to choose credentials.
- **Target state**:
  - **One set of secret names** in code: e.g. `LASTFM_API_KEY`, `LASTFM_API_SECRET` (and same pattern for Spotify if applicable).
  - **Dev project**: In Firebase Console (or CLI), set secrets `LASTFM_API_KEY` and `LASTFM_API_SECRET` to your dev Last.fm credentials.
  - **Prod project**: Set the same secret names to your prod Last.fm credentials.
  - **Code changes**:
    - Remove `isDevelopmentEnvironment()` and any origin/localhost workaround.
    - Use only `defineSecret("LASTFM_API_KEY")` and `defineSecret("LASTFM_API_SECRET")` (no DEV/PROD variants).
    - Same pattern for any other env-dependent secrets (e.g. Spotify).
  - **Local**: Run Functions in the emulator against the dev project; emulator uses dev project config. No need for “which env” logic in code.
  - **Deploy**: `firebase use dev` then `firebase deploy --only functions` for dev; `firebase use prod` then `firebase deploy --only functions` for prod. Each project gets its own deployed functions with its own secret values.

---

### **Phase 6: CI/CD (prod only)**

- **Single workflow**: e.g. on push to `main`, run `vite build` with **production** env (set `VITE_FIREBASE_*` and other `VITE_*` in CI from GitHub Secrets, or provide a `.env.production` in the build environment; do not commit real values).
- Deploy built app to **prod** Firebase project (Hosting, and Functions if built from same repo).
- **No automated deploy to the dev project**; dev is local + emulators. If you later want a hosted dev/staging URL, add a second workflow (e.g. on `develop`) that builds with dev env and deploys to the dev Firebase project, and update this spec then.

---

### **Phase 7: Optional — legacy user data migration**

- **App code** already uses the flat user shape (`lastFmSessionKey`, `lastFmAuthenticated`). `LastFmCallbackView` and `useUserData` do not use nested `lastFmSessionKeys: { dev, prod }` or `lastFmAuthenticated: { dev, prod }`.
- **If** production Firestore still has user documents with the old nested shape, run a **one-time migration** (e.g. script or Cloud Function) to flatten them:
  - For each user doc that has `lastFmSessionKeys`, set `lastFmSessionKey` to the value you want to keep (e.g. `lastFmSessionKeys.prod` or `lastFmSessionKeys.dev` depending on which project you’re migrating), then remove `lastFmSessionKeys`.
  - Same for `lastFmAuthenticated` if stored as an object.
- **If** you’re unsure, you can add a small script that checks for the presence of `lastFmSessionKeys` (or nested `lastFmAuthenticated`) in the `users` collection and then run the migration only if needed. The spec does not require migration if you confirm all user docs are already flat.

---

## **File changes summary**

### **Files to modify**
- `.gitignore` — add `.env*` or ensure `.env.development` and `.env.production` are ignored.
- `src/firebase.js` — add emulator connection when `VITE_FIREBASE_EMULATORS` is set; optional prod warning by `projectId`.
- `package.json` — add scripts: `dev` (unchanged or explicit), `dev:prod`, optional `dev:prod:confirm`, `emulators`; add `cross-env` as devDependency.
- `functions/src/lastfm.js` — remove `isDevelopmentEnvironment()`, use single `LASTFM_API_KEY` and `LASTFM_API_SECRET`; remove `LASTFM_API_KEY_DEV/PROD` and `LASTFM_API_SECRET_DEV/PROD`.
- `functions/src/spotify.js` (if it has similar env branching) — same idea: one secret set per project.
- `.firebaserc` — add `dev` and `prod` aliases.
- `.github/workflows/firebase-hosting-merge.yml` — ensure production build uses prod `VITE_FIREBASE_*` from secrets; single deploy to prod project.

### **Files to create**
- `env.production.example` — same keys as `.env.production`, placeholders and one-line note (copy to `.env.production`, fill in, required for prod builds).

### **Files to delete**
- None required. (`src/utils/env.js` does not exist in the repo; no action.)

---

## **Environment variables (reference)**

Same names in dev and prod; values differ. Last.fm is backend-proxied; frontend does not need `VITE_LASTFM_*`.

| Variable | Development | Production |
|----------|-------------|------------|
| `VITE_FIREBASE_API_KEY` | Dev project value | Prod project value |
| `VITE_FIREBASE_AUTH_DOMAIN` | Dev | Prod |
| `VITE_FIREBASE_PROJECT_ID` | Dev project ID | Prod project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Dev | Prod |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Dev | Prod |
| `VITE_FIREBASE_APP_ID` | Dev | Prod |
| `VITE_FIREBASE_EMULATORS` | `1` | `0` |
| `VITE_SPOTIFY_CLIENT_ID` | Same or dev app | Same or prod app |

---

## **Firebase Functions secrets (per project)**

- **Dev project**: `LASTFM_API_KEY`, `LASTFM_API_SECRET` (and Spotify secrets if used) set to dev credentials.
- **Prod project**: Same secret names, prod credentials.

---

## **Deployment commands**

- **Prod (CI or manual)**  
  Build with production env, then e.g.:  
  `firebase use prod` → `firebase deploy --only hosting` (and `--only functions` if applicable).

- **Dev (manual, optional)**  
  `firebase use dev` → `firebase deploy --only functions` (and hosting if you want a hosted dev URL).

---

## **Quick checklist**

- [ ] Create dev Firebase project; enable Firestore, Auth, Functions (and optionally Hosting).
- [ ] Deploy Firestore rules and indexes to dev project.
- [ ] Add Auth authorized domains for dev (localhost, and dev hosting if used).
- [ ] Add `.env*` (or equivalent) to `.gitignore`.
- [ ] Create `.env.development` (dev project + `VITE_FIREBASE_EMULATORS=1`) and `.env.production` (prod, emulators off)—local only.
- [ ] Create `env.production.example` with same keys and placeholders; commit.
- [ ] Add npm scripts: `dev`, `dev:prod` (cross-env + `--mode production` + `VITE_FIREBASE_EMULATORS=0`), `emulators` (firebase emulators for dev project); add `cross-env` as devDependency.
- [ ] Update `src/firebase.js`: single config from env; connect emulators when `VITE_FIREBASE_EMULATORS` is set; optional prod warning by `projectId`.
- [ ] Update `.firebaserc` with `dev` and `prod` aliases.
- [ ] Add Spotify (and Last.fm) redirect URIs for localhost (and dev hosting if used).
- [ ] Simplify Functions: single secret names per project; remove `isDevelopmentEnvironment()` and four Last.fm secrets; set dev/prod secret values in each project.
- [ ] CI: run `vite build` with prod env; deploy to prod project only.
- [ ] (Optional) If prod has legacy nested user data, run one-time migration to flatten.
- [ ] Test dev (local + emulators) and prod (build + deploy).

---

## **Rollback**

- Keep both projects active during transition.
- You can switch back to a single project by reverting env and `firebase.js` changes and redeploying Functions with the previous secret layout (document the previous state if needed).

---

## **Notes**

- Replicating the vz-price-guide pattern: same env names, Vite mode + .env, emulators for dev, prod-only CI. Only project IDs and optional pieces (e.g. confirm dialogs, measurementId) need to be tailored.
- Users will need to re-authenticate Last.fm (and Spotify if you point dev at a different app) in the dev environment after separation.
- Production data remains in the prod project; no change to prod data by this spec except optional migration of user docs if they still have nested shape.
