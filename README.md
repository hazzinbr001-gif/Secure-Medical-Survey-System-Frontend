# Community Health Survey — Frontend v3.1
HazzinBR © 2026  
Multi-Institution · M-Pesa Payments · Offline-first PWA

## Files

```
frontend/
├── index.html              ← Main app (open this in browser / host on GitHub Pages)
├── health_survey.html      ← Standalone single-record report viewer
├── survey-sync.js          ← Supabase sync engine
├── survey-auth.js          ← Login, registration, institution routing
├── survey-core.js          ← Survey form logic
├── survey-reports.js       ← PDF report generation
├── survey-admin.js         ← Admin dashboard (institution-filtered)
├── survey-payment.js       ← M-Pesa payment + institution picker  ← NEW
├── survey-styles.css       ← All styles
├── manifest.json           ← PWA manifest
├── sw.js                   ← Service worker (offline support)
├── version.json            ← Version bump triggers cache clear on all devices
├── icon-192.png
└── icon-512.png
```

## Quick Deploy (GitHub Pages)

1. Push all files to a GitHub repo
2. Settings → Pages → Source: main branch / root
3. Your app is live at `https://yourusername.github.io/yourrepo/`

## What's New in v3.1

| Feature | Details |
|---------|---------|
| **Multi-institution** | Each institution has isolated data — admins only see their own |
| **M-Pesa registration** | Enumerators pay Ksh 100, Institution admins pay Ksh 200 |
| **Institution picker** | Users select their institution from a dropdown at registration |
| **Dynamic branding** | Institution name replaces hardcoded "Great Lakes · Nyamache" everywhere |
| **Institutions tab** | Super admin sees all institutions + payment totals |
| **Google Sign-In** | Already wired — set `GOOGLE_CLIENT_ID` in survey-auth.js |

## Configuration

Open `survey-payment.js` and update:
```js
const MPESA_TILL_NUMBER = 'YOUR_POCHI_TILL';  // your till number
const DARAJA_VERIFY_EDGE = 'https://YOUR_PROJECT.supabase.co/functions/v1/mpesa-verify';
```

Open `survey-auth.js` and update when ready:
```js
const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
```

## Super Admin Access

Enter `ADMIN72` as the admission number — no payment required.
Super admin sees all institutions' data and the Institutions tab.

## Sandbox Mode

Any 10-character code (e.g. `TESTCODE01`) is accepted for M-Pesa during testing.
