# 0012. Phone check over a Cloudflare quick tunnel

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

The phone needs HTTPS: the auth cookie is always `Secure`, and install and offline mode need a service worker. Ticket 04 served the built PWA over the LAN with a mkcert certificate and said to avoid a public tunnel. That route means installing mkcert, making a certificate, trusting a root CA on the phone, and remaking the certificate when the Mac's address changes. The User found it too fiddly for a check they repeat.

## Decision

We will offer `npm run phone:tunnel`: it builds the PWA, runs the preview on localhost and starts a Cloudflare quick tunnel (`cloudflared tunnel --url`), which gives a random `https://….trycloudflare.com` URL with a real certificate. Nothing is installed or trusted on the phone. The mkcert route (`npm run phone`) stays, for checks that must not leave the LAN.

## Consequences

- While the tunnel runs, the app is reachable from the internet by anyone who has the URL. The API still needs a login, and sign-up is closed once a User exists (ADR-0010). Ctrl-C ends the tunnel and the URL stops working.
- The URL changes on every run. The installed Home Screen app is tied to its URL, so each run means opening the new URL and adding the app to the Home Screen again.
- Requires `cloudflared` on the Mac (`brew install cloudflared`), with no Cloudflare account.
- Ends with Phase 2: a deployed staging URL replaces both routes.
