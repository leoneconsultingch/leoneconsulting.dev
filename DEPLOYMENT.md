# Guida al Deployment

Questo progetto è attualmente deployato su **Vercel**.

## Deployment Attivo

### ✅ Vercel (Produzione)

**URL di Produzione:**
- Main: https://leoneconsulting.dev
- Vercel: https://leoneconsulting-dev.vercel.app

**Deployment Automatico:**
- Ogni push su `main` triggera un deployment automatico su Vercel
- Preview deployments per ogni PR

**Setup Iniziale (già configurato):**
1. Progetto linkato: `leoneconsulting-dev`
2. Dominio custom aggiunto: `leoneconsulting.dev`
3. Build command: `npm run build`
4. Output directory: `dist`

## Configurazione DNS su OVH

**IMPORTANTE:** Per far funzionare il dominio `leoneconsulting.dev`, configura questi record DNS su OVH:

### Record Obbligatori

#### Opzione 1: Record A (Root Domain)
```
Tipo: A
Nome: @ (oppure lascia vuoto)
Valore: 76.76.21.22
TTL: 300
```

#### Opzione 2: Record A Alternativo (Ridondanza)
```
Tipo: A
Nome: @ (oppure lascia vuoto)
Valore: 66.33.60.129
TTL: 300
```

#### Record CNAME per WWW (Opzionale)
```
Tipo: CNAME
Nome: www
Valore: cname.vercel-dns-017.com
TTL: 300
```

### Verifica DNS
Dopo la configurazione, attendi 5-10 minuti e verifica:
```bash
dig +short leoneconsulting.dev
# Dovrebbe restituire: 76.76.21.22 o 66.33.60.129
```

### Alternative: Nameserver Vercel (Più Automatico)
Se preferisci, puoi cambiare i nameserver su OVH:
```
ns1.vercel-dns.com
ns2.vercel-dns.com
```
Questo permette a Vercel di gestire automaticamente tutti i record DNS.

## Domini Principali
- **leoneconsulting.dev** → Sito principale
- **portfolio.leoneconsulting.dev** → Portfolio (da configurare separatamente)

## Altre Opzioni di Deployment (Non Attive)

### Netlify (Supportato)
Le configurazioni sono già presenti in `netlify.toml` se vuoi usare Netlify.

### ~~GitHub Pages~~ (Disabilitato)
Il workflow GitHub Pages è stato disabilitato per evitare conflitti.
File: `.github/workflows/deploy.yml.disabled`

2. Il redirect automatico è già configurato nel sito

## Variabili d'Ambiente

I quattro form usano funzioni Vercel e richiedono queste variabili nello scope
Production (e separatamente in Preview, se si vogliono provare i form):

- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_TO`: obbligatorie.
- `SMTP_FROM`: facoltativa, usa `SMTP_USER` se assente.
- `SMTP_PORT`: default 587 con STARTTLS obbligatorio; 465 usa TLS immediato.

Non inserire valori o credenziali nel repository. Le modifiche alle variabili
Vercel richiedono un nuovo deploy per diventare effettive.

### Migrazione antiabuso senza Redis — rilascio subordinato al WAF

La patch sostituisce Upstash con il rate-limit del firewall Vercel. Non ci sono
contatori in memoria, database da tenere attivi o nuove dipendenze runtime.
**Non pubblicare la rimozione Redis finché la regola WAF non è attiva e verificata.**

Configurazioni reviewabili:

- `security/form-rate-limit.observe.json`: conta e registra, senza bloccare.
- `security/form-rate-limit.enforce.json`: esempio API per `429` oltre la quota.
  Nella dashboard attuale l’azione `Deny` sul blocco Rate Limit restituisce
  invece `403`; i moduli gestiscono entrambi gli status senza cancellare i dati.

La regola corrisponde a `POST` e percorso che inizia con `/api/`, senza filtri
sul dominio: copre i quattro form, gli alias del progetto e futuri endpoint
POST sotto lo stesso prefisso. Quota condivisa: 5 richieste per 600 secondi per
IP **per regione**, finestra fissa. Anche richieste invalide o invii falliti
consumano quota. Utenti dietro NAT condividono il limite. Non è un tetto globale
agli invii e non arresta da sola bot distribuiti su molti IP.

I limiti precedenti (3/minuto, 3/ora o 5/ora per endpoint) non sono equivalenti
alla nuova quota condivisa. Hobby supporta una sola regola rate-limit e una
finestra massima di 10 minuti: verificare il piano e le regole già occupate prima di
applicare la configurazione. Non sovrascrivere altre regole o attivare piani a
pagamento implicitamente.

Procedura, dal progetto corretto nella dashboard Vercel:

1. Firewall → Configure: verificare regole, bypass e bozze già presenti. Creare
   la regola in osservazione con i valori sopra. Review Changes → Publish è
   un'azione dell'operatore. Leggere gli eventi e verificare che corrispondano
   solo ai POST API previsti.
2. Provare il blocco su un deployment Preview. Con una sola regola disponibile,
   modificare la stessa aggiungendo `Environment = Preview` e azione `429`:
   durante questa fase la produzione mantiene il controllo Redis vigente,
   non la nuova patch. Non dichiarare che resta in osservazione WAF se la
   condizione esclude Production. Verificare condizioni ed eventi del WAF.
3. Dopo la review, rimuovere il filtro Preview dalla stessa regola, attivare il
   rate-limit in Production e verificare il readback della regola. Usare
   payload vuoti o il campo anti-bot, senza email reali.
   Una risposta `429` da sola non prova l'azione del WAF: richiedere un evento
   firewall attribuito alla regola e al deployment corretti.
4. Testare percorsi canonici, query, slash finale, slash duplicati, maiuscole e
   percent-encoding; ripetere per tutti e quattro gli endpoint e gli alias.
   Un percorso alternativo deve essere contato dal WAF oppure rifiutato dal
   backend (`404`), senza raggiungere SMTP. Il guardiano locale accetta solo
   il percorso canonico del proprio handler, con slash finale opzionale.
5. Solo ora pubblicare la patch senza Redis e provare un invio legittimo con
   destinatario concordato. Confermare ricezione, non solo HTTP 200.
6. Conservare temporaneamente le vecchie variabili Upstash per il rollback;
   rimuoverle separatamente dalla console, senza copiarle in log o documenti.

L'accesso API al firewall ha restituito `404 Seawall Config not found` per
lettura, inserimento e inizializzazione: non è stata creata una bozza remota né
certificata una regola attiva. Se ricorre, verificare dalla dashboard progetto,
abilitazione e accesso; non considerare i JSON locali come protezione attiva.

Il WAF protegge l'accesso prima delle funzioni. Il guardiano applicativo applica
schema per endpoint, limiti stringhe e body JSON (64 KiB), consenso, mailbox
singola, controllo Origin quando presente e honeypot opzionale `website`.
Origin/honeypot non autenticano il mittente e non sostituiscono il WAF. Il limite
post-parsing limita il lavoro applicativo, non l'allocazione del parser Vercel.
I form inviano JSON; un WAF `429` o `403`, anche non JSON, mantiene i dati e mostra
l'attesa di 10 minuti. Il campo honeypot è opzionale per compatibilità; il
consenso privacy dei contatti viene ora verificato server-side e inviato dalla
nuova pagina. Una pagina contatti vecchia in cache deve essere ricaricata.

Per tutti e quattro i form, l'accettazione SMTP della richiesta operativa
al solo destinatario configurato in `SMTP_TO` determina il successo. Pre-call
e audit non inviano ricevute automatiche all'indirizzo indicato dal chiamante:
la conferma compare nel browser, mentre il follow-up resta manuale.
Questo impedisce l'invio di messaggi personalizzati a caselle non verificate.
Credenziali, PII e dettagli del provider non vengono loggati.

Verifica periodica: eventi WAF, errori SMTP e prova di consegna concordata.
Nessun job keepalive o invio automatico a terzi è stato configurato. Per
rollback usare una versione con un limiter funzionante oppure sospendere gli
invii; non disabilitare il WAF lasciando aperti gli endpoint.

Riferimenti: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting

## Build Locale

Per testare la build di produzione localmente:

```bash
npm run build
npm run preview
```

## Troubleshooting

### Build Fallisce

1. Verifica di avere Node.js >= 22.23.4 (requisito Astro 7.4.4).
   Il runtime Vercel verificato per questo progetto è Node.js 24.
2. Cancella `node_modules` e reinstalla:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### Immagini non Caricate

Metti tutte le immagini statiche nella cartella `public/`

### Errori TypeScript

Installa le dipendenze opzionali:
```bash
npm install -D @astrojs/check typescript
```

## Performance

Il sito è ottimizzato per:
- ✅ Lighthouse Score > 95
- ✅ First Contentful Paint < 1s
- ✅ Mobile responsive
- ✅ SEO optimized

## Prossimi Passi

1. Verifica periodicamente consegna SMTP e disponibilità Upstash
2. Aggiungi Google Analytics o Plausible
3. Configura il sottodominio portfolio
4. Verifica il flusso prenotazioni dopo modifiche SMTP o al rate-limit

Verifica operativa 30/10/2026: dopo la pubblicazione manuale dell’azione
Deny, sei POST vuoti consecutivi a `/api/contact` hanno restituito cinque
`503` dal vecchio limiter Redis e poi un `403 Forbidden` della piattaforma.
Il blocco a soglia è stato osservato; il connettore firewall resta in errore
404 e non consente il readback della configurazione. Nessuna email inviata.
