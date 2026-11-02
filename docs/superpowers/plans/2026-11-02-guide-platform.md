# Guide e predisposizione piattaforma — progetto e piano

**Obiettivo autorizzato:** fase 1 completa; per le fasi 2–5 solo contratti, configurazione disattivata e architettura. Nessuna transazione, account esterno, dipendenza nuova, migrazione, modifica deploy, commit o push.

**Architettura:** riuso Astro SSR/Vercel, Tailwind, Layout/Header/Footer, JSON bilingui e pattern delle route blog. Guide FREE pubblicate prerenderizzate; JSON pubblico premium limitato ai metadati. Il futuro corpo premium resterà in un archivio privato, con rendering SSR dopo verifica dei diritti. Le feature flag controllano disponibilità, mai autorizzazione.

**Spec:** requisiti di Mario del 02/11/2026, fasi 1–5. Questo documento conserva progetto, piano, modello dati e roadmap.

## Piano eseguibile

- [x] Catalogo: test negativi su pubblicazione, lingua, date, slug, brand e corpo premium (`node --test tests/guides.test.mjs`); implementare `validateGuide` e `publicGuides` in `src/lib/guides.ts`, loader in `src/lib/guide-content.ts` e prima guida bilingue in `company/guides/`.
- [x] Interfaccia: `src/components/GuidePage.astro`, indici e dettagli `src/pages/guide/` e `src/pages/en/guide/`. Test del rendering prodotto dalla build in `tests/guides-rendering.test.mjs`; indice, sommario, prerequisiti, passi, data, CTA consulenza, stato vuoto; nessun HTML arbitrario dai JSON. Aggiungere Guide a Header/Footer; il selettore lingue e SEO esistenti gestiscono già percorsi simmetrici.
- [x] Predisposizione: `src/lib/platform.ts` contiene solo contratti e validazione di configurazione; `company/platform.json` contiene piani, prezzi non definiti e cataloghi vuoti. Test: impossibile abilitare canali non implementati con una flag. Nessuna route pricing/account/admin/checkout finta.
- [x] Verifica: suite esistente e nuova; build da copia pulita con `npm ci` e `npm run build`; test HTML sulla build, controlli esposizione draft/premium e contenuti ostili; review indipendente. Conservare risultati qui e nel diario MissionControl.

## Aggiornamento editoriale

Creare `company/guides/<slug>.json` seguendo la prima guida; titolo, descrizione, categoria, prerequisiti, risultati, paragrafi e passi devono essere completi in IT/EN. Per una nuova bozza usare `published: false` e `publishedAt: null`. Dopo revisione impostare data di pubblicazione e aggiornamento valide; una pubblicazione futura non produce pagine fino a una build eseguita da quella data in poi. Nome file uguale allo slug; sezioni con ID univoci, senza HTML eseguibile o URL di download. I riferimenti commerciali rimangono vuoti in fase 1. Il corpo di una guida PRO/BUSINESS deve rimanere assente dal catalogo pubblico. Qualsiasi metadato pubblico deve essere privo di informazioni riservate.

`features.guides: false` disabilita i link nel menu e la generazione dei dettagli nella build successiva; gli indici mostrano lo stato vuoto con noindex. Non è un meccanismo di revoca dei contenuti già pubblicati o presenti in cache. I link CTA portano alla consulenza esistente, senza introdurre registrazioni o offerte commerciali.

## Servizi rilevati

Ispezione di package.json, src/, api/, configurazione Astro/Vercel: Astro **7.4.4** dichiarato (AGENTS.md indica ancora 5), adapter Vercel, Tailwind, jsPDF/docx, Nodemailer. Nessun provider auth, database, storage privato, billing o analytics operativo. Gli endpoint in `api/` sono form/email e non vengono modificati. Il banner consensi esiste, ma le sue funzioni analytics sono placeholder: non equivale a consenso valido per advertising/referral né a sistema di raccolta statistiche.

Scelta: continuare con JSON per la fase editoriale. Un DB e un servizio auth sarebbero prematuri in fase 1. Prima della fase 3 inventariare servizi autorizzati effettivamente disponibili e costi; scegliere con Mario DB transazionale e identity provider. Nessun riutilizzo implicito di utenti o dati da altri progetti.

## Confini e modello dati proposto (nessuna migrazione applicata)

Ogni tabella commerciale ha `brand_id` obbligatorio. PK e FK composite `(brand_id,id)`; query, job, cache, storage e audit sempre con brand derivato dal server. Un utente ordinario non sceglie il brand tramite payload. Leone Consulting e TutoringOnVideo avranno configurazioni, utenti, consensi, cookie/sessioni, cataloghi e conti provider separati; riuso del solo codice. Un eventuale SSO richiederà una decisione distinta.

| Entità | Campi principali e vincoli |
| --- | --- |
| brands | id, nome, dominio verificato, configurazione, namespace provider/storage |
| users / sessions | brand_id, id, identity_subject univoco nel brand, email verificata, stato; sessioni opache con scadenza/revoca, cookie Secure/HttpOnly/SameSite |
| role_assignments | brand_id, user_id, ruolo customer/affiliate/admin; nessun ruolo autoassegnabile; modifiche con audit |
| guides / guide_revisions | brand_id, slug univoco, IT/EN, stato, tier, revisione; corpo premium privato; solo metadati innocui nel catalogo pubblico |
| plans / prices | FREE/PRO/BUSINESS per brand; prezzi immutabili versionati in unità minori, valuta, intervallo monthly/annual o one_off, provider_price_id; nessun prezzo nel componente |
| products / product_versions | titolo/descrizione IT/EN, tipo (n8n/workflow AI/Python/PDF/Docker/kit/tool), stato draft/active/retired, price_id, guide_id opzionale, piani ammessi espliciti; versioni con checksum e chiave storage privata, nessun URL pubblico |
| subscriptions | brand_id, user_id, plan_id, provider_customer_id/subscription_id univoci, stato provider, periodo valido, cancellazione a fine periodo, prossimo piano; stato separato dai diritti |
| orders / order_items | acquirente, stato, valuta/totali interi, riferimenti pagamento; item con ID stabile e unique (brand_id,order_id,id); snapshot immutabile di prodotto/versione/prezzo/tasse; storico acquisti |
| entitlements | user_id, risorsa, origine order/subscription, valid_from/until, revoked_at; controllo server per ogni lettura/download |
| payment_events / outbox | brand_id, provider_account, sandbox/live, event_id univoco, stato received/processed/failed, retry e processed_at; commit atomico con ordine/diritti/commissioni e outbox |
| refunds / disputes | ordine, riferimento provider univoco, importo, stato, effetti su diritti e ledger; rimborsi parziali espliciti |
| external_programs / affiliate_links | programma attivo, disclosure IT/EN, link ID stabile, destinazione HTTPS con host consentito; associazioni guide/articoli tramite ID, mai URL duplicati nei contenuti |
| affiliate_partners | user_id, stato applied/approved/rejected/suspended, codice univoco per brand, approvato da/a; nessun accesso admin implicito |
| referral_policies / referrals | regola versionata, finestra configurabile, modello attribuzione, commissione bps o quota fissa, base netta definita e limite rinnovi; referral con partner/campagna/scadenza e prova consenso dove richiesto |
| conversions / commission_ledger | ordine/item e partner, snapshot regola, importi/valuta, stati pending/approved/paid/rejected, hold_until; unicità conversione+regola+voce fatturata, ledger append-only e reversals per rimborsi/chargeback |
| manual_payouts / payout_items | riferimento contabile, data, operatore, importo/valuta, commissioni incluse univocamente, audit; v1 senza bonifici o payout automatici |
| daily_click_counts | brand_id, giorno, link_id/campagna, contatore; nessun IP, user agent o identificatore utente persistito; conteggi aggregati non dimostrano utenti unici o conversioni |
| consents / audit_events | versione informativa, finalità, consenso/revoca e scadenza; audit append-only con attore, azione, risorsa e campi minimizzati, senza segreti |

## Moduli e contratti

`platform.ts` definisce il linguaggio comune e porte per Identity, Entitlements, Billing, Downloads e AffiliateReporting. Non contiene adapter finti, sessioni simulate o permessi basati su campi del browser. Catalogo di piani configurabile: FREE pubblico, PRO e BUSINESS non offerti; prezzi null significano **non configurati**, mai gratuiti. Prodotti e programmi affiliati vuoti.

`Guide.access` è una classificazione editoriale, non una gerarchia di permessi: BUSINESS non eredita implicitamente PRO. In fase 3 il piano concederà una lista esplicita di risorse tramite entitlement. In fase 1 gli array di riferimenti commerciali devono essere vuoti; in fase 2 saranno validati contro il catalogo reale e attivo dello stesso brand.

Futuri moduli separati: Editorial (guide/revisioni), Identity (sessione/RBAC), Catalog (piani/prodotti/prezzi), Billing (provider e webhook), Entitlements (accessi), Delivery (download privati), ExternalAffiliates (resolver/disclosure), Referrals (attribuzione/ledger), Admin (comandi autorizzati/audit), Reporting (aggregazioni). Ogni adapter riceve esplicitamente il contesto brand. Nessun DB JSON locale per ordini o commissioni: Vercel richiede persistenza esterna e transazioni.

## Roadmap e criteri di completamento

### Fase 1 — questa patch

Guide IT/EN, struttura dati validata, pagina indice e dettaglio, integrazione menu/footer, prima guida originale gratuita. Metadata premium consentiti senza corpo e senza route pubblica. Tutte le funzioni commerciali disabilitate, senza CTA che suggeriscano acquisti disponibili. Nessuna raccolta dati aggiuntiva.

### Fase 2 — catalogo e affiliazioni esterne

Popolare soltanto prodotti reali approvati e programmi commerciali verificati. Implementare schede prodotto/versioni e associazioni guida; accesso per piano come lista esplicita, acquisti singoli separati dagli abbonamenti. Il resolver centralizzato controlla programma attivo, HTTPS e host consentiti; nessun redirect a destinazione passata dal visitatore. Box e link includono disclosure vicina e `rel="sponsored noopener noreferrer"`. Disattivare programma elimina il link commerciale. Ads e conteggio clic restano separati e disattivabili; attivazione dopo revisione privacy e configurazione retention. Test su link inattivi, URL ostili e nessun tracking senza condizione approvata.

### Fase 3 — identity, DB e Stripe sandbox

Prima decisione su provider disponibili/costi e informative. Implementare registrazione, verifica email, recupero account, sessioni revocabili, rate limit/CSRF, dashboard e storico. PostgreSQL è un candidato per transazioni/FK/ledger, non una dipendenza scelta o installata. RBAC e entitlement server-side; deny by default per utente anonimo, altro brand, permessi assenti e servizio indisponibile.

Stripe Billing è compatibile con lo stack SSR come **candidato**. Usare Checkout ospitato per mensile/annuale e acquisti singoli, Customer Portal per modifiche/cancellazione e fatture. Upgrade/downgrade con regole di prorata e decorrenza decise prima; rinnovi falliti, periodi di grazia e revoca documentati. Prezzi configurati lato server e risolti da ID, senza accettare importi dal client. Mai salvare carte. `/pricing` esisterà solo con offerte reali approvate; nessuna conversione di `null` in zero.

Webhook: firma su raw body mediante SDK ufficiale, timestamp/tolleranza, binding a account/brand/ambiente dal server, rifiuto `livemode` in sandbox. Dedup atomico e transazione; eventi fuori ordine riconciliati col provider, gestione retry e concorrenza. Un redirect di successo non concede accesso. Chiavi solo server; nessun account/provider creato in questa patch.

**Blocco concreto:** `vercel.json` applica cache pubblica globale e CSP limitata a self. Prima di qualsiasi area privata servono eccezioni cache private/no-store e revisione CSP/checkout, con autorizzazione Tier 1. Non distribuire auth o download finché i test su cache/CDN non passano. Bucket privato, file esclusi da public/dist, link firmati brevi emessi dopo autorizzazione; per revoca immediata usare proxy autenticato anziché una URL ancora valida.

Test sandbox necessari: success/failure, rinnovo, mensile/annuale, cambio piano, cancellazione immediata/fine periodo, eventi duplicati/concorrenza/fuori ordine/firma errata, scadenza diritti, acquisti e download altrui, isolamento brand, cache/CDN. La sandbox reale non è ancora integrata né testata.

### Fase 4 — referral interno

Domanda affiliato, approvazione manuale amministrativa, codice unico e link brand-scoped. Finestra e modello attribuzione configurabili con versione; specificare primo/ultimo click e rinnovi ammessi. Non impostare cookie referral prima delle condizioni di consenso approvate. Dashboard mostra clic/conversioni/commissioni del solo partner autenticato. Bloccare auto-referral tramite identità verificata e collegamenti al cliente pagante; segnali aggiuntivi solo se minimizzati e approvati, review manuale per abusi. Non usare IP come unica identità.

Commissioni pending → approved dopo hold; approved → paid solo con registrazione payout manuale autorizzata; pending/approved → rejected per invalidità. Rimborsi/cancellazioni/chargeback generano rettifiche proporzionali e revoca delle quote non maturate; per già pagate registrare debito/reversal, senza riscrivere lo storico. Test per duplicati, rimborsi parziali, cambio regola, rinnovi, concorrenza e self-referral. CSV contabile con importi/valuta/regola/riferimenti, autorizzazione e neutralizzazione celle che iniziano con =,+,-,@.

### Fase 5 — admin e metriche

Dashboard server-side con ruolo admin verificato per ogni query/mutazione, MFA/reautenticazione per operazioni sensibili; nessuna elevazione self-service. Gestione guide, prodotti, piani, permessi, programmi e partner; tutte le operazioni sensibili con audit e CSRF. Fatturato, rimborsi, netto, abbonamenti e conversioni da ledger, definizioni documentate, aggregazioni per brand/currency; non sommare valute diverse senza conversione documentata. Admin/affiliate/customer hanno test di matrice ruoli e isolamento dati.

## Privacy e pubblicazione

Prima di introdurre utenti, pagamenti, advertising o referral: revisione applicabilità normativa svizzera/GDPR con consulente, titolare/responsabili e trasferimenti, finalità/basi giuridiche, informative e termini commerciali/download/licenze/recesso. Definire retention per ciascun dato, cancellazione/anonymizzazione e obblighi contabili, processi di accesso/revoca e consenso separato da acquisto. Questa architettura non certifica conformità legale. Nessun periodo di conservazione inventato o nuovo trattamento attivato.

## Fonti tecniche primarie consultate il 02/11/2026

- [Stripe Billing, Checkout ospitato](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=checkout&ui=stripe-hosted)
- [Stripe: webhook, firme, duplicati e ordine degli eventi](https://docs.stripe.com/webhooks)
- [Stripe: sandboxes isolate](https://docs.stripe.com/sandboxes)
- [Stripe: Customer Portal](https://docs.stripe.com/customer-management)

## Evidenze di verifica

Verifiche del 02/11/2026 sul ramo `feat/guide`:

- Copia pulita in `/tmp/leone-guide-check-ip0lsx49`, senza node_modules/cache/output del repository di sviluppo, credenziali o `.claude/`; `npm ci --no-audit --no-fund` completato. Nessuna modifica a dipendenze/lockfile.
- `npm run build` completato sia con fixture ostili isolate sia con i soli contenuti reali: `astro check` **96 file, 0 errori, 0 warning, 0 hint**. Warning separato dell’adapter: Node locale 26, runtime Vercel 24. Non è stato qualificato un runtime production né eseguito deploy.
- Suite completa sulla copia pulita con `GUIDE_BUILD_DIR=<copia>/.vercel/output/static GUIDE_SECURITY_FIXTURES=1 npm test`: **69/69 passati, 0 saltati**. Il test legacy del socket Unix ha causato un’asserzione nativa Node nella sandbox; ripetizione autorizzata fuori sandbox passata integralmente, senza modificare o disabilitare il test.
- Build di sicurezza: fixture solo nella copia temporanea (bozza, PRO senza corpo, altro brand, data futura, HTML ostile). Nessuna route non pubblicabile; nessuna sentinella riservata in HTML/JS/JSON/XML pubblici; HTML del corpo e JSON-LD escapati, attributi metadata correttamente quotati. Le fixture non fanno parte della patch.
- Dopo rimozione delle fixture temporanee, ulteriore build normale passata; test del rendering IT/EN e unitari Guide passati sugli artifact finali. Nel comando ordinario i test artifact sono esplicitamente saltati se non si indica `GUIDE_BUILD_DIR`, e quello di sicurezza richiede anche le fixture.
- Browser Playwright su file della build serviti tramite intercettazione locale, senza aprire porte o contattare produzione: indice a 320/390/1024/1280/1440 px senza overflow, dettaglio mobile, menu mobile → guida e selettore lingua → stessa guida EN funzionanti. Screenshot ispezionati: `/tmp/leone-guide-desktop.png`, `/tmp/leone-guide-mobile.png`. Font remoti esclusi nella prova offline; lo stile del sito rimane quello esistente.
- Review indipendente `sol_critical` in sola lettura: finding su associazioni, item ID e configurazione corretti e ricontrollati; nessun finding critico/alto/medio residuo nello scope. Non è un audit esaustivo del sito o delle future integrazioni.
- Scan dei testi EN e `git diff --check` passati. `.claude/` preesistente preservata; API form, traduzioni condivise, credenziali, configurazione deploy e output di build nel repository rimasti invariati. Nessun commit/push/deploy.

Per riprodurre i test ordinari sugli artifact di una copia pulita:

```bash
npm ci --no-audit --no-fund
npm run build
GUIDE_BUILD_DIR="$PWD/.vercel/output/static" npm test
```

Per riprodurre anche la prova di sicurezza, eseguire **solo in una copia temporanea** questo setup prima della build, poi aggiungere `GUIDE_SECURITY_FIXTURES=1` al comando test:

```bash
node --input-type=module <<'JS'
import { readFile, writeFile } from 'node:fs/promises';
const directory = new URL('./company/guides/', `file://${process.cwd()}/`);
const original = JSON.parse(await readFile(new URL('preparare-un-automazione.json', directory), 'utf8'));
for (const [slug, changes] of [
  ['draft-security-fixture', { published: false, publishedAt: null }],
  ['premium-security-fixture', { access: 'PRO', sections: [] }],
  ['other-brand-security-fixture', { brandId: 'other-brand' }],
  ['future-security-fixture', { publishedAt: '2099-01-01', updatedAt: '2099-01-01' }],
  ['render-safety-fixture', {}],
]) {
  const guide = { ...structuredClone(original), slug, summary: { it: 'GUIDE_PRIVATE_SENTINEL', en: 'GUIDE_PRIVATE_SENTINEL' }, ...changes };
  if (slug === 'render-safety-fixture') {
    guide.title = { it: '<img src=x onerror="window.GUIDE_XSS=true">', en: '<img src=x onerror="window.GUIDE_XSS=true">' };
    guide.summary = { it: '<script>window.GUIDE_XSS=true</script>', en: '<script>window.GUIDE_XSS=true</script>' };
  }
  await writeFile(new URL(`${slug}.json`, directory), JSON.stringify(guide));
}
JS
npm run build
GUIDE_BUILD_DIR="$PWD/.vercel/output/static" GUIDE_SECURITY_FIXTURES=1 npm test
```

Nessuna funzionalità delle fasi 2–5 viene dichiarata operativa.
