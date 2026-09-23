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
2. `npm run build` deve passare — SEMPRE su clone pulito (/tmp + npm ci): il build nel repo di sviluppo può mascherare errori `astro check` per cache
3. Commit + push → deploy Vercel automatico
4. Registra aggiornamento nel diario MissionControl (project `leoneconsulting.dev`)

### Localizzazione (hard)
- Campi testuali localizzati `{it, en}`; `items` skills e `name` progetti accettano stringa semplice SOLO se identica in entrambe le lingue (tecnici/brand)
- Mai parole italiane nei campi/varianti EN (incluse skill items): verificare con grep prima del push
- PDF generati dallo stesso JSON: la pulizia EN vale per pagina web E PDF

### Categorie da tenere aggiornate
- `stats` (anni esperienza, progetti consegnati)
- `skills` (nuove tecnologie effettivamente usate nei progetti)
- `experience.highlights` (nuovi risultati misurabili)
- `projects` (nuovi progetti pubblici o case study pubblicati)
- `languages`: SOLO su indicazione esplicita di Mario
- `education`: NON USATO (rimosso su richiesta Mario 22/09 — non riaggiungerlo)

### PDF e DOCX
- Endpoint SSR PDF: `/cv.pdf` (italiano) e `/en/cv.pdf` (inglese) — `src/pages/cv.pdf.ts`, `src/pages/en/cv.pdf.ts`
- Endpoint SSR DOCX: `/cv.docx` e `/en/cv.docx` — `src/pages/cv.docx.ts`, `src/pages/en/cv.docx.ts` (aggiunti 23/09, dipendenza `docx` approvata da Mario)
- Generatori: `src/lib/cv-pdf.ts` (jsPDF) e `src/lib/cv-docx.ts` (docx) — entrambi leggono lo stesso `company/cv.json`
- Nessuna azione aggiuntiva per rigenerare: gli endpoint leggono il JSON a runtime (cache 60s)

## Portfolio — sync automatico (task ricorrente agente)

Fonte dati: `company/case-studies/*.json` (it = `<slug>.json`, en = `<slug>.en.json`).
Le pagine caricano via glob (`src/lib/case-studies.ts`): **aggiungere un case study = creare i due JSON**, nessuna modifica ai .astro.

### Fonti per nuovi case study
1. MissionControl: `list_projects` (repo attivi, ultimo push, linguaggio) + diario progetti
2. Repo GitHub leoneconsultingch pubblici significativi (non fork, attività negli ultimi 12 mesi)

### Regole (hard)
- Nuovi case study SEMPRE `published: false` (bozza): visibili solo dopo review di Mario
- Schema: copiare `company/case-studies/template.json` (stessi campi, it+en completi)
- MAI inventare metriche, risultati o testimonial: usare `[DA COMPLETARE]` dove il dato manca
- Progetti privati solo come descrizione generica pubblica-safe (come nel CV)
- Non modificare i .astro (il glob carica da solo), non toccare `order` dei case study esistenti
- Aggiornare un case study esistente SOLO per dati di fatto verificati (nuove metriche), mai lo stile

### Case study lex-rag — metriche pendenti (da 23/09)
Pubblicato con `metrics: []` e impatto "in rilevazione durante il pilot" (progetto in corso).
Quando arrivano dati reali verificati, reinserire le tre metriche originali in entrambe le lingue:
tempo ricerca documentale, copertura corpus indicizzato, percentuale citazioni validate.

## Aree vietate — Tier 1 (chiedere prima)
| File | Motivo |
|---|---|
| `vercel.json`, `netlify.toml`, `api/` | configurazione deploy — rompere = sito giù |
| `src/i18n/` oltre a nuove chiavi | traduzioni usate da tutte le pagine |

## Anti-pattern critici
- Non aggiungere dipendenze npm senza approvazione
- Non toccare `dist/` o `.vercel/` (output build)
- Testimonial e metriche case study: dati marketing, modificarli solo su richiesta esplicita
