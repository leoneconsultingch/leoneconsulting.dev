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
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: obbligatorie per il
  rate-limit distribuito di tutti i form, incluse le prenotazioni.

Non inserire valori o credenziali nel repository. Le modifiche alle variabili
Vercel richiedono un nuovo deploy per diventare effettive.

Se Upstash è assente, non risolve il DNS o non risponde entro due secondi,
le API restituiscono `503` con `Retry-After: 60` senza tentare l'invio SMTP.
Il superamento della quota restituisce invece `429`. Non rimuovere le variabili
Upstash per aggirare un guasto: verificare che il database sia attivo e che
l'endpoint configurato sia quello corrente. I log applicativi riportano la
fase e l'endpoint senza includere credenziali o contenuto dei messaggi.

I form inviano JSON (`Content-Type: application/json`). Il form audit, in
entrambe le lingue, richiede nome, email, progetto, obiettivo, un URL HTTP(S)
dei materiali e accettazione delle condizioni.

Per pre-call e audit, l'accettazione SMTP della richiesta operativa determina
il successo. Se la successiva email di conferma fallisce, l'API mantiene il
successo e registra un avviso, così il visitatore non viene invitato a duplicare
una richiesta già ricevuta.

## Build Locale

Per testare la build di produzione localmente:

```bash
npm run build
npm run preview
```

## Troubleshooting

### Build Fallisce

1. Verifica di avere Node.js >= 18
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
