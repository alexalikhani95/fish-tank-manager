# Phone check — ticket 04

Status: passed 2026-11-14 on the User's iPhone, over the Cloudflare quick tunnel (ADR-0012) instead of mkcert. Filled in by the User; desktop Chromium results do not count here.

Setup and commands: [lld.md → Phone access](../../../docs/design/lld.md#phone-access-trusted-local-https). Tick a box only after seeing it on the phone. Write what happened, especially for anything that did not work.

| Field                         | Value                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| Date                          | 2026-11-14                                                                          |
| Phone model and iOS version   | iPhone, model and iOS version not recorded                                          |
| Browser                       | Chrome for iOS (Add to Home Screen via the iOS share sheet)                         |
| URL opened                    | `https://betty-thumbnail-fourth-elderly.trycloudflare.com` (`npm run phone:tunnel`) |
| Branch / commit served by Mac | `feature/phone-tunnel` at `fbbc176` plus uncommitted tunnel changes                 |

## Checklist

- [x] **Trusted HTTPS.** The URL opens in Safari with no certificate warning and nothing tapped through. Notes: Real Cloudflare certificate, no warning; no CA installed on the phone.
- [x] **Sign in.** Sign in (or create the first User on an empty database) in Safari. Notes: Created the first User on an empty database.
- [x] **Install.** Share → Add to Home Screen puts the fish icon on the Home Screen. Notes: Fish icon added from Chrome's share sheet.
- [x] **Standalone.** Opening it from the Home Screen shows no Safari address bar or toolbar. Notes: Opened with no address bar or browser buttons.
- [x] **Sign in in the installed app.** If the installed app shows sign-in, sign in there (iOS can keep its storage separate from Safari). Notes: Worked.
- [x] **Saved WaterChange.** Add or open a Tank, log a water change, see it in the Tank's log and as "Last water change" on the dashboard. Notes: Logged; shown in the Tank's log and as last water change on the dashboard.
- [x] **Reopen.** Close the app from the app switcher, reopen from the Home Screen: still signed in, the WaterChange is still there. Notes: Still signed in, WaterChange still there.
- [x] **Offline shell.** With the app open, turn on Airplane Mode (Wi-Fi off). The "You're offline" banner appears; the data already on screen stays. Notes: Banner shown, data on screen kept.
- [x] **No offline write.** Open the water change form while offline: Save is disabled, typed values stay, turning Airplane Mode off does not save anything by itself. Notes: Save disabled offline; nothing saved after Airplane Mode was turned off.
- [x] **Offline cold start.** Close the app, stay offline, reopen it: the app opens and says it is unable to connect, with Try again — not the sign-in form, not a Safari error page. Notes: Unable to connect with Try again.

## Result

Overall: passed

Problems found: API bound to `::1` (`HOST=localhost`) while the preview proxy targets `127.0.0.1`, so `/api` failed until `HOST=127.0.0.1` (fixed in `app/.env.example`). Worktree `app/.env` lacked `JWT_SECRET`.
