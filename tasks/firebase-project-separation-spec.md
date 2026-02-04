# Firebase Local Dev (Emulator-Only) Specification

## **Status**: 📋 Ready to implement

## **Current State**
- Single Firebase project (`audiofoodie-d5b2c`) used for both development and production
- Environment detection in Firebase Functions (`isDevelopmentEnvironment()` + four separate Last.fm secrets) to choose dev vs prod credentials
- Risk of dev data or misconfiguration affecting production when running locally

## **Goal**
Use **one** Firebase project (production). Local development runs **entirely against emulators** (Firestore, Auth, Functions). Which backend the app talks to is decided by **Vite mode** and the **env file**—same env var names everywhere, no `_DEV`/`_PROD` branching in code. Dev = emulators + optional seed script; prod = real project. CI deploys only production.

## **Benefits**
- **Data isolation**: Local dev never touches production; emulators are fully local
- **Simplicity**: One project, one config shape; mode + env file choose emulators vs prod
- **Local dev**: Emulators for Firestore, Auth, Functions; seed script to populate local DB
- **CI**: Single pipeline—prod only; no second Firebase project to maintain

---

## **Strategy Summary**

| Item | Approach |
|------|----------|
| **Config choice** | Same env var names in every environment. Vite mode + which `.env.*` file loads decides dev vs prod (no `_DEV`/`_PROD` in code). |
| **Env files** | `.env.development` — same Firebase project config as prod + `VITE_FIREBASE_EMULATORS=1`. `.env.production` — prod config + `VITE_FIREBASE_EMULATORS=0`. Both gitignored. Committed: `env.production.example` only. |
| **Scripts** | `dev` → Vite development mode → loads `.env.development` → app connects to emulators. `dev:prod` → run app locally against real prod (use with care). `emulators` → start Firestore, Auth, Functions emulators (uses default project; all data local). |
| **firebase.js** | Single config from `import.meta.env`. Connect to emulators when `VITE_FIREBASE_EMULATORS` is set. Optional prod warning when not using emulators. |
| **CI/CD** | Only production deploys. Push to `main` → build with prod env → deploy to prod Firebase. |
| **Functions** | One set of secret names in code (`LASTFM_API_KEY`, `LASTFM_API_SECRET`, etc.). Prod project holds prod secrets. When running Functions in the emulator locally, provide credentials via env or Firebase CLI; no second project. |

---

## **Implementation Plan**

### **Phase 1: Env files and .gitignore**

1. **.gitignore**
   - Ensure `.env*` is ignored (e.g. `.env`, `.env.development`, `.env.production`).

2. **.env.development** (local only, do not commit)
   - Same keys as production; values point to the **same** Firebase project (prod project ID).
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` — use prod project values (app will connect to emulators, not live project).
   - `VITE_FIREBASE_EMULATORS=1` — so the app connects to emulators when you run `npm run dev`.
   - `VITE_SPOTIFY_CLIENT_ID` — same as prod (or a separate dev app if you prefer).
   - For seed scripts or db scripts running against emulators: set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and optionally `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` when running those scripts.

3. **.env.production** (local only, do not commit)
   - Same variable names; values point to the prod Firebase project.
   - `VITE_FIREBASE_EMULATORS=0`
   - Used for production builds and when running `dev:prod` locally.

4. **env.production.example** (committed)
   - Same keys as `.env.production`, with placeholder values and a short comment: "Copy to `.env.production` and fill in; required for production builds and CI."

---

### **Phase 2: npm scripts (Vite + cross-env on Windows)**

- Add `cross-env` as a devDependency so env vars in scripts work on Windows.
- **dev** — `vite` → Vite uses `development` → loads `.env.development` → with `VITE_FIREBASE_EMULATORS=1`, app connects to emulators.
- **dev:prod** — `cross-env VITE_FIREBASE_EMULATORS=0 vite --port 5173 --mode production` → loads `.env.production` → app talks to real prod. Use only when you intentionally want to run locally against prod.
- **emulators** — `firebase emulators:start --only firestore,auth,functions` (no `--project`; uses default project from `.firebaserc`. Emulators run locally and do not touch live data.)

Use `cross-env` for any env vars in scripts.

---

### **Phase 3: Frontend Firebase init (`src/firebase.js`)**

- **Single config** from env: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` from `import.meta.env.VITE_FIREBASE_*`. No branching on different variable names.
- **Emulator hook-up** when `VITE_FIREBASE_EMULATORS` is `'1'` or `'true'` (and in a browser):
  - Firestore: `connectFirestoreEmulator(db, hostname, 8080)`
  - Auth: `connectAuthEmulator(auth, 'http://${hostname}:9099', { disableWarnings: true })`
  - Functions: `connectFunctionsEmulator(functions, hostname, 5001)`
  Use `window.location.hostname` so the same build works from other devices on the network.
- **Backend API URL**: When using emulators, the app must call the Functions emulator (e.g. `http://${hostname}:5001/${projectId}/us-central1`). Derive this in the composable that builds the backend base URL from `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_EMULATORS`.
- **Optional prod warning**: If not using emulators and `projectId` is the prod project ID, `console.warn` that production is active.

No branching on `_DEV`/`_PROD` variable names; only on `VITE_FIREBASE_EMULATORS` and, if desired, `projectId` for the warning.

---

### **Phase 4: Firebase Functions (single secrets)**

- **Current state**: `functions/src/lastfm.js` uses `isDevelopmentEnvironment(req)` and four secrets (`LASTFM_API_KEY_DEV`, `LASTFM_API_SECRET_DEV`, `LASTFM_API_KEY_PROD`, `LASTFM_API_SECRET_PROD`) to choose credentials.
- **Target state**:
  - **One set of secret names** in code: `LASTFM_API_KEY`, `LASTFM_API_SECRET` (and same pattern for Spotify if applicable).
  - **Prod project**: In Firebase Console (or CLI), set secrets `LASTFM_API_KEY` and `LASTFM_API_SECRET` to prod Last.fm credentials.
  - **Code changes**:
    - Remove `isDevelopmentEnvironment()` and any origin/localhost workaround.
    - Use only `defineSecret("LASTFM_API_KEY")` and `defineSecret("LASTFM_API_SECRET")` (no DEV/PROD variants).
  - **Local emulator**: When you run `firebase emulators:start --only functions`, the emulator uses the same code. Provide Last.fm (and Spotify) credentials via a `.env` file in `functions/` or via `firebase functions:secrets:set` for the project; the emulator can read from env. No "which env" logic in code—only one project, one set of secrets when deployed.

---

### **Phase 5: CI/CD (prod only)**

- **Single workflow**: On push to `main`, run `vite build` with **production** env (inject `VITE_FIREBASE_*` and `VITE_SPOTIFY_CLIENT_ID` from GitHub Secrets into `.env.production`; do not commit real values).
- Deploy built app to the **prod** Firebase project (Hosting, and Functions if built from same repo).
- No automated deploy to a dev project; dev is local + emulators only.

---

### **Phase 6: Local dev workflow and seed script**

- **Start emulators**: `npm run emulators` (Firestore, Auth, Functions).
- **Seed the local DB**: Run your seed script with emulator env vars set so it talks to local Firestore (e.g. `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`). Optionally add an npm script that sets these and runs the seed.
- **Run the app**: `npm run dev` (loads `.env.development` with `VITE_FIREBASE_EMULATORS=1`; app connects to emulators and local Functions).

**Third-party redirect URIs** (for Auth + Spotify/Last.fm callbacks when testing locally):
- **Spotify**: Ensure redirect URIs include `http://localhost:5173/spotify-callback` (or your dev port).
- **Last.fm**: Ensure callback URL includes localhost as needed.
- **Firebase Auth**: In Firebase Console → Authentication → Settings → Authorized domains, ensure `localhost` is listed.

---

### **Phase 7: Optional — legacy user data migration**

- **App code** already uses the flat user shape (`lastFmSessionKey`, `lastFmAuthenticated`).
- **If** production Firestore still has user documents with the old nested shape (`lastFmSessionKeys`, etc.), run a **one-time migration** to flatten them. The spec does not require this if you confirm all user docs are already flat.

---

## **File changes summary**

### **Files to modify**
- `.gitignore` — ensure `.env*` (or `.env.development`, `.env.production`) are ignored.
- `src/firebase.js` — single config from env; connect to emulators when `VITE_FIREBASE_EMULATORS` is set; optional prod warning by `projectId`.
- `src/composables/useBackendApi.js` (or equivalent) — backend base URL derived from `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_EMULATORS` so that when emulators are on, requests go to the Functions emulator.
- `package.json` — add scripts: `dev`, `dev:prod`, `emulators` (no `--project`; uses default); add `cross-env` as devDependency.
- `functions/src/lastfm.js` — remove `isDevelopmentEnvironment()`, use single `LASTFM_API_KEY` and `LASTFM_API_SECRET`; remove all `*_DEV`/`*_PROD` secrets.
- `functions/src/spotify.js` — if it has similar env branching, use one secret set only.
- `.firebaserc` — keep `default` (and optionally `prod`) pointing at the single prod project. No `dev` alias required for emulator-only.
- `.github/workflows/firebase-hosting-merge.yml` — production build uses prod `VITE_FIREBASE_*` from secrets; single deploy to prod project.

### **Files to create**
- `env.production.example` — same keys as `.env.production`, placeholders and one-line note (copy to `.env.production`, fill in, required for prod builds).

### **Files to delete**
- None required.

---

## **Environment variables (reference)**

Same names in dev and prod; in dev, same project values with `VITE_FIREBASE_EMULATORS=1` so the app uses emulators.

| Variable | Development (local) | Production |
|----------|----------------------|------------|
| `VITE_FIREBASE_API_KEY` | Prod project value | Prod project value |
| `VITE_FIREBASE_AUTH_DOMAIN` | Prod | Prod |
| `VITE_FIREBASE_PROJECT_ID` | Prod project ID | Prod project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Prod | Prod |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Prod | Prod |
| `VITE_FIREBASE_APP_ID` | Prod | Prod |
| `VITE_FIREBASE_EMULATORS` | `1` | `0` |
| `VITE_SPOTIFY_CLIENT_ID` | Same as prod (or dev app) | Prod |

---

## **Firebase Functions secrets**

- **Prod project only**: `LASTFM_API_KEY`, `LASTFM_API_SECRET` (and Spotify secrets if used) set to prod credentials.
- **Local emulator**: Provide same secret names via `functions/.env` or Firebase CLI so the emulator can call Last.fm/Spotify when you test locally.

---

## **Deployment commands**

- **Prod (CI or manual)**  
  Build with production env, then:  
  `firebase use prod` (or leave default) → `firebase deploy --only hosting` (and `--only functions` if applicable).

- **Dev**  
  No deploy. Run `npm run emulators`, then optionally seed, then `npm run dev`.

---

## **Quick checklist**

- [ ] Ensure `.env*` is in `.gitignore`.
- [ ] Create `.env.development` (same project as prod + `VITE_FIREBASE_EMULATORS=1`) and `.env.production` (prod, emulators off)—local only.
- [ ] Create `env.production.example` with same keys and placeholders; commit.
- [ ] Add npm scripts: `dev`, `dev:prod` (cross-env + `--mode production` + `VITE_FIREBASE_EMULATORS=0`), `emulators` (no `--project`); add `cross-env` as devDependency.
- [ ] Update `src/firebase.js`: single config from env; connect emulators when `VITE_FIREBASE_EMULATORS` is set; optional prod warning.
- [ ] Update backend API base URL logic so it points to Functions emulator when `VITE_FIREBASE_EMULATORS=1`.
- [ ] Ensure `.firebaserc` default (and optionally `prod`) points at prod project; no dev project alias required.
- [ ] Add Spotify and Last.fm redirect URIs for localhost; ensure Firebase Auth authorized domains include `localhost`.
- [ ] Simplify Functions: single secret names; remove `isDevelopmentEnvironment()` and four Last.fm secrets; set prod secret values in prod project.
- [ ] CI: run `vite build` with prod env; deploy to prod project only.
- [ ] (Optional) If prod has legacy nested user data, run one-time migration to flatten.
- [ ] Test local dev: start emulators → seed (if used) → `npm run dev`. Test prod: build + deploy.

---

## **Rollback**

- Revert env, `firebase.js`, `useBackendApi`, and Functions changes. Redeploy Functions with the previous secret layout if you had reverted to `*_DEV`/`*_PROD` names.

---

## **Notes**

- Aligns with vz-price-guide: same env names, Vite mode + .env, emulators for dev, prod-only CI. One project; dev is fully local.
- Production data is never touched by local dev when using emulators.
- Seed script: set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` (and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` if the seed uses Auth) when running the seed so it populates the emulator, not prod.
