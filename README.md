# GymLog — clean rebuild (v3 foundation)

Mobile-first PWA training journal built with React, TypeScript, and Vite.

## Included in this foundation
- Separate tabs for Home, Workout, Programs, History, GymQuest, and Profile.
- Exercise library and custom exercises.
- Program templates kept separate from the active workout.
- Active workout autosaved locally, collapsible exercise cards, empty weight/reps fields, set completion toggles.
- History deletion and clear-history flow; XP and stats are derived from remaining workouts.
- Empty workouts cannot be completed for XP.
- JSON export/import with basic schema validation.
- iPhone viewport/safe-area handling and installable web-app metadata.
- Firebase configuration scaffold, not active cloud sync yet.

## Run locally
Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## GitHub Pages
1. Copy the contents of this folder into the repository root (keep a backup/branch of the old version first).
2. In repository Settings → Pages, set Source to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys the site.
4. The Vite `base` is set to `/GymLog_V2.0/` for the existing repository URL.

## Firebase (not enabled in this foundation)
Copy `.env.example` to `.env.local` and fill the Firebase web-app settings. The current build only detects whether configuration exists; Firestore sync and durable sign-in still need to be implemented and tested before relying on cloud recovery.

## Important limitations before real use
- No real Firebase sync or Google account linking is enabled yet.
- No automated tests have been run in this environment.
- LocalStorage is not a substitute for cloud backup; export JSON before testing.
- Import replaces current state after confirmation.
- XP is derived from completed workout records, but historical XP values are stored per workout. If XP rules change later, a migration/recalculation policy will be needed.
