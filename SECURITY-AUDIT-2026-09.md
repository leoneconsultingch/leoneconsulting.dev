# Security Audit — leoneconsulting.dev

**Aperto:** 2026-09-22 · **Stato:** IN CORSO · **Owner:** Mario Leone · **Esecutore:** agenti mc-*

Audit pubblico-safe: nessun dettaglio di infrastruttura interna in questo documento.

## Scope

- Sito pubblico (SSR Astro su Vercel): header, CSP, endpoint, form
- Dipendenze npm (Dependabot)
- Configurazione deploy (vercel.json)
- Nuovi endpoint SSR (cv.pdf) e token di monitoraggio

## Findings — verifica iniziale 22/09/2026

### OK (verificato in produzione)

| Item | Esito |
|---|---|
| HSTS | `max-age=31536000; includeSubDomains; preload` |
| X-Frame-Options | `DENY` + CSP `frame-ancestors 'none'` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | camera/mic/geo/interest-cocoort disattivati |
| CSP | presente, `default-src 'self'`, `base-uri 'self'`, `form-action 'self'`, upgrade-insecure-requests |
| API path | `noindex, nofollow` + `no-store` (vercel.json) |
| Dependabot | attivo — 35 alert risolti con PR #33 (d2b9fce) |

### Aperti (da valutare/trattare)

| # | Rischio | Note | Priorità |
|---|---|---|---|
| A1 | CSP `script-src 'unsafe-inline'` | script inline di Astro (LanguagePicker, mobile menu). Migliorabile con hash/nonce | media |
| A2 | Endpoint SSR `/cv.pdf`, `/en/cv.pdf` senza rate-limit | generazione PDF on-demand: costo compute abuso | media |
| A3 | Form (booking/contatto) | verificare anti-spam e rate-limit effettivi lato server | alta |
| A4 | Directory `api/` | inventariare le funzioni serverless esposte e i loro permessi | alta |
| A5 | Dipendenza nuova `jspdf@4.2.1` | monitorare CVE via Dependabot | bassa |
| A6 | Token Vercel per MissionControl | creare read-only, file `~/.config/missioncontrol/vercel.env` 600 (runbook deploy/vercel README repo MissionControl) | — |

## Metodi

- `curl -I` su produzione (header response)
- Review `vercel.json` (headers/redirect)
- GitHub API: commit status, Dependabot history

## Changelog

- 2026-09-22: apertura audit, verifica iniziale header + dependabot (mc-opencode)
