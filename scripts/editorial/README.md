# Blog AI e agente editoriale MissionControl

Il sito carica i JSON bilingui in `company/blog/`. Le pagine articolo IT/EN vengono
generate solo per contenuti approvati, pubblicati e con data non futura. La review
è legata al contenuto tramite SHA-256: una modifica successiva invalida la review.
Le bozze non hanno URL pubblici e non entrano nella sitemap. Gli indici vuoti sono
`noindex`.

## Consegna ChatGPT → MissionControl → bozza (import manuale)

`chatgpt-handoff.md` contiene il prompt da usare nella chat della rassegna.
La consegna usa il plugin `missioncontrol2` e il diario del solo progetto
`leoneconsulting.dev`. Non acquisisce la cronologia della chat. Il diario è una
inbox di prova: il tool esistente non autentica l'autore del report come task
ChatGPT, e il campo `producer` è una dichiarazione, non una prova di provenienza.

Dal processo locale Codex, Node >=24:

```bash
node scripts/editorial/inbox.mjs inspect <entry-id> --allow-pilot
EDITORIAL_STATE_DIR=/tmp/leone-editorial-inbox node scripts/editorial/inbox.mjs import <entry-id> --allow-pilot
```

`inspect` valida solo il report. `import` legge MissionControl via REST locale
(il comando standalone non ospita un client MCP), recupera le fonti HTTPS dagli
origin già dichiarati in `sources.json` e da `help.openai.com`, poi usa il launcher
Codex gestito. Le affermazioni del report non diventano evidenze. Una fonte non
recuperabile, incluso HTTP 403, viene esclusa; senza fonti il run fallisce prima
dell'inferenza. Il fetch conferma il testo recuperato, non la verità di ogni sua
affermazione: la verifica semantica rimane responsabilità della review.

Artefatti privati in `<state>/inbox/<hash-reportId>/`: report, evidenze, bozza,
anteprima e ricevuta con hash. La stessa consegna riusa i risultati senza altra
inferenza; un contenuto cambiato richiede un nuovo `reportId`. Gli URL già usati
da altri import completati nella stessa directory di stato vengono esclusi;
questa deduplicazione non comprende il flusso RSS settimanale o le modifiche a una
pagina già vista. Per rivalutarla serve un percorso di revisione esplicito.
Il lock è condiviso con il runner RSS quando usano la stessa directory di stato.

L'import conserva `published=false` e `approval=null`, senza scrivere contenuti
nel sito. Le date di pubblicazione dichiarate nel report rimangono nel report
privato; nella bozza sono `null` finché non verificate. Il sito e l'anteprima
mostrano “Non indicata” / “Not specified”, senza inventare date. La data della
verifica deriva dal recupero effettivo, non dal report.

Questo comando **non installa timer** e non attiva sincronizzazioni Desktop/cloud.
La snapshot del runner settimanale già attiva non viene aggiornata. Il prossimo
collaudo deve partire dalla chat reale e produrre un ID restituito dal plugin.
Approvazione, import nel sito, build e deploy restano passaggi distinti.

## Flusso settimanale

1. Il runner raccoglie gli ultimi sette giorni dai feed ufficiali in `sources.json`
   (OpenAI, Google AI, Hugging Face). Il registro è estendibile, non una copertura
   completa del mondo AI.
2. Salva rassegna ed evidenze in una directory privata fuori dal sito. Date della
   fonte e della verifica rimangono distinte; la data evento resta nulla quando
   non è verificabile.
3. **Codex**, tramite il launcher già gestito da MissionControl e il login esistente
   dell'account agente, prepara al massimo una bozza IT/EN per run. Default:
   `gpt-6.1-terra`, effort `medium`. Nessuna credenziale viene copiata nel runner.
4. Codex riceve le sole evidenze pubbliche via stdin. Esecuzione effimera, config
   personale esclusa, sandbox in lettura sola, shell, computer use, immagini,
   plugin, multi-agente e ricerca skill disabilitati. Il modello non pubblica.
   Eventi di azione inattesi fanno terminare il run.
5. Il runner verifica schema e riferimenti: gli URL citati devono appartenere alle
   evidenze recuperate. Forza `published=false`, `publishedAt=null`, `approval=null`.
6. MissionControl riceve titolo e riferimento al run nel diario. Mario legge le
   fonti e l'anteprima, corregge e approva. Solo dopo: import del JSON, build e
   workflow Git autorizzato. Il runner non committa, pusha o esegue deploy.

La prima bozza `computer-use-pilot.json` è stata preparata su fonti ufficiali del
26 ottobre 2026, verificate il 31 ottobre. È materiale da revisionare.

## Verifica senza inferenza

Node >=24 con TypeScript nativo. Nessuna nuova dipendenza.

```bash
EDITORIAL_STATE_DIR=/tmp/leone-editorial-check node scripts/editorial/run.mjs collect
npm test
npm run build
```

`collect` salva solo la rassegna: nessuna chiamata AI o scrittura al diario.
Fetch HTTPS limitato agli origin dichiarati, massimo tre redirect, 1 MB per risposta
e 15 secondi per richiesta. Deduplicazione URL e storico delle fonti già utilizzate.
La correttezza semantica resta oggetto della review umana.

## Attivazione Codex

Eseguire dall'account dedicato Codex già configurato da MissionControl, con login
esistente e user manager attivo:

```bash
node scripts/editorial/activate.mjs --check --backend codex
node scripts/editorial/activate.mjs --backend codex
```

Il controllo verifica launcher canonico, identità e login senza esporre credenziali.
L'attivazione installa una snapshot runtime immutabile fuori dal sito in
`~/.local/share/leone-editorial/releases/<digest>/`, le due unit e un drop-in con
backend e modello. Dopo verifica systemd avvia una rassegna reale. **Il timer viene
abilitato soltanto dopo il successo della prova.** La ricevuta con modello,
revisione e prossima scadenza è in `~/.local/state/leone-editorial/activation.json`.

Lunedì 09:00 Europe/Rome, jitter massimo 15 minuti, recupero run mancati. Il servizio mantiene `NoNewPrivileges`. Per Codex si usa la sandbox nativa in
lettura sola: i namespace filesystem delle unit utente rimappano il proprietario
root del registro e fanno rifiutare il launcher canonico. Il profilo Codex evita
quei namespace senza alterare il registro o i suoi controlli. Il controller scrive
lo stato privato e il client gestisce autenticazione/cache nel proprio account;
il modello ha strumenti disabilitati e sandbox in lettura sola.
Per la persistenza dopo logout/riavvio, il user manager deve avere lingering attivo.

Una generazione Codex per run, al massimo sei articoli, timeout di generazione
240 secondi e output complessivo limitato a 1 MB; servizio limitato a otto minuti.
Il consumo usa la disponibilità del login Codex: non è un tetto di spesa in valuta.
Un lock impedisce sovrapposizioni. Dopo una terminazione forzata, verificare che il
processo sia fermo prima di rimuovere manualmente `run.lock`.

Per aggiornare una snapshot generata in precedenza, con servizio e timer fermi:

```bash
node scripts/editorial/activate.mjs --upgrade --backend codex
```

Le configurazioni personalizzate non vengono sovrascritte. Le sostituzioni di
configurazioni riconosciute conservano un backup in `activation-backups/`.

Controllo e arresto della ricorrenza nello stesso account:

```bash
systemctl --user list-timers mc-ai-editorial.timer
journalctl --user -u mc-ai-editorial.service -n 30 --no-pager
systemctl --user disable --now mc-ai-editorial.timer
```

## Revisione e import esplicito

```bash
node scripts/editorial/run.mjs preview /percorso/candidato.json /tmp/revisione-blog.html
```

Anteprima HTML locale bilingue, senza script né risorse esterne. Dopo aver letto
il testo e verificato le fonti, acquisire il claim VCS del ramo e importare:

```bash
node scripts/editorial/run.mjs approve /percorso/candidato-revisionato.json /percorso/repo 'Mario Leone'
```

L'import registra data, revisore e hash; rifiuta articoli già pubblicati e file
destinazione con contenuto diverso. Per la bozza esempio già nel repo, usare lo
stesso file come candidato. Build, commit e push rimangono azioni separate.

## Backend gateway precedente

Il backend precedente resta disponibile solo su richiesta esplicita:

```bash
node scripts/editorial/activate.mjs --backend gateway --model '<modello abilitato>'
```

Richiede un account autorizzato al socket e una route cloud unica con credenziale
disponibile. Il default locale Ollama non è instradato dal gateway cloud. HTTP 429
viene riportato senza esporre il corpo del provider: i metadati non distinguono
rate limit e quota. Nessun fallback automatico a provider alternativi.

La generazione non-Codex è configurata con `EDITORIAL_BACKEND=gateway`,
`MISSIONCONTROL_GATEWAY_SOCKET` e `EDITORIAL_MODEL` nel drop-in locale. Non abilitare
contemporaneamente timer editoriali di account diversi.
