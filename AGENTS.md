# leoneconsulting.dev — AGENTS.md

Global agent policy: `/mnt/nvme/Progetti/archlinux-admin/agents/agent-framework.md`

## Stack
- Astro 5 (SSR, adapter Vercel) + Tailwind CSS
- Contenuti: JSON in `company/` (case studies, CV)
- Deploy: push su `main` → Vercel (automatico)
- Sito bilingue it/en: pagine `src/pages/` + `src/pages/en/`, label in `src/i18n/translations.ts`

## Comandi essenziali
```bash
npm run build     # build completa (verifica)
npm run dev       # dev server locale (default :4321)
```

## CV — contratto aggiornamento (task ricorrente agente)

Fonte dati: `company/cv.json` (unico file, bilingue: campi `{it, en}`).
Pagine: `src/pages/cv.astro` + `src/pages/en/cv.astro` (leggono il JSON, non editarle per contenuti).
Tipo: `src/types/cv.ts`.

### Fonti per aggiornamenti
1. MissionControl (http://127.0.0.1:18000): progetti (`list_projects`), diario MissionControl, nuovi case study in `company/case-studies/`
2. Repo GitHub leoneconsultingch: nuovi repo pubblici significativi, contributi open source
3. Richieste dirette di Mario

### Vincoli — PUBBLICO-SAFE (hard)
- Mai dettagli infrastruttura privata: hostname, IP, porte, percorsi, utenze mc-*, token, PAT, topologia Tailnet
- Progetti privati (MissionControl, MultiAgentDocker, archlinux-admin) solo come descrizioni generiche:
  MissionControl → "control plane self-hosted per agenti AI" / MultiAgentDocker → vedi case study `multiagenthft`
- Niente dati personali oltre a quelli già pubblici sul sito (email/telefono aziendali)
- Niente clienti reali, cifre contrattuali, o dettagli NDA

### Procedura
1. Aggiorna SOLO `company/cv.json` (bump `updated`, mantieni versione schema)
2. `npm run build` deve passare
3. Commit + push → deploy Vercel automatico
4. Registra aggiornamento nel diario MissionControl (project `leoneconsulting.dev`)

### Categorie da tenere aggiornate
- `stats` (anni esperienza, progetti consegnati)
- `skills` (nuove tecnologie effettivamente usate nei progetti)
- `experience.highlights` (nuovi risultati misurabili)
- `projects` (nuovi progetti pubblici o case study pubblicati)
- `languages`: SOLO su indicazione esplicita di Mario
- `education`: NON USATO (rimosso su richiesta Mario 22/09 — non riaggiungerlo)

### PDF
- Endpoint SSR: `/cv.pdf` (italiano) e `/en/cv.pdf` (inglese) — `src/pages/cv.pdf.ts`, `src/pages/en/cv.pdf.ts`
- Generatore: `src/lib/cv-pdf.ts` (jsPDF, layout A4, stesso `company/cv.json`)
- Nessuna azione aggiuntiva per rigenerare i PDF: endpoint legge il JSON a runtime

## Aree vietate — Tier 1 (chiedere prima)
| File | Motivo |
|---|---|
| `vercel.json`, `netlify.toml`, `api/` | configurazione deploy — rompere = sito giù |
| `src/i18n/` oltre a nuove chiavi | traduzioni usate da tutte le pagine |

## Anti-pattern critici
- Non aggiungere dipendenze npm senza approvazione
- Non toccare `dist/` o `.vercel/` (output build)
- Testimonial e metriche case study: dati marketing, modificarli solo su richiesta esplicita
