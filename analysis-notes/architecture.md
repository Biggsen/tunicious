# Architecture Overview

This is a Vue 3 music discovery application with Firebase backend, integrating Spotify and Last.fm APIs. The frontend uses Vite for bundling and Tailwind for styling. Firebase Functions handle API proxying to protect secrets, with Firestore for data persistence and Firebase Auth for user management.

Key directories:
- `src/composables/` - Vue composition API logic
- `src/views/` - Page components  
- `functions/src/` - Firebase Cloud Functions
- `src/utils/` - Shared utilities
