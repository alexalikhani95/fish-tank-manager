# Phone check — ticket 04

Status: pending — not yet run on a phone. Filled in by the User; desktop Chromium results do not count here.

Setup and commands: [lld.md → Phone access](../../../docs/design/lld.md#phone-access-trusted-local-https). Tick a box only after seeing it on the phone. Write what happened, especially for anything that did not work.

| Field                         | Value |
| ----------------------------- | ----- |
| Date                          |       |
| Phone model and iOS version   |       |
| Browser                       |       |
| URL opened                    |       |
| Branch / commit served by Mac |       |

## Checklist

- [ ] **Trusted HTTPS.** The URL opens in Safari with no certificate warning and nothing tapped through. Notes:
- [ ] **Sign in.** Sign in (or create the first User on an empty database) in Safari. Notes:
- [ ] **Install.** Share → Add to Home Screen puts the fish icon on the Home Screen. Notes:
- [ ] **Standalone.** Opening it from the Home Screen shows no Safari address bar or toolbar. Notes:
- [ ] **Sign in in the installed app.** If the installed app shows sign-in, sign in there (iOS can keep its storage separate from Safari). Notes:
- [ ] **Saved WaterChange.** Add or open a Tank, log a water change, see it in the Tank's log and as "Last water change" on the dashboard. Notes:
- [ ] **Reopen.** Close the app from the app switcher, reopen from the Home Screen: still signed in, the WaterChange is still there. Notes:
- [ ] **Offline shell.** With the app open, turn on Airplane Mode (Wi-Fi off). The "You're offline" banner appears; the data already on screen stays. Notes:
- [ ] **No offline write.** Open the water change form while offline: Save is disabled, typed values stay, turning Airplane Mode off does not save anything by itself. Notes:
- [ ] **Offline cold start.** Close the app, stay offline, reopen it: the app opens and says it is unable to connect, with Try again — not the sign-in form, not a Safari error page. Notes:

## Result

Overall: pending

Problems found:
