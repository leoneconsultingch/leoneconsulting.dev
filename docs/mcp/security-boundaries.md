# Confini di sicurezza — MCP Leone

**Stato:** requisiti architetturali proposti; non è un audit del server, che non è ancora implementato.

## Classi di dati

| Classe | Esempi | MCP v1 |
|---|---|---|
| Pubblico approvato | Guide FREE pubblicate, pagine del sito, metadati SEO visibili | Lettura allowlisted |
| Editoriale non pubblico | Bozze, note, revisioni, fonti non pubblicate | Escluso |
| Premium | Corpo guide PRO/BUSINESS, download protetti e permessi | Escluso |
| Commerciale/finanziario | Prezzi, checkout, ordini, pagamenti, abbonamenti, commissioni, ricavi | Escluso in modo permanente dal MCP Leone |
| Dati cliente | Identità, email, sessioni, acquisti e storico | Escluso in modo permanente dal MCP Leone |
| Segreti e controllo | Token, chiavi, variabili d’ambiente, deploy e credenziali VCS | Escluso |

## Controlli richiesti

### Trasporto e identità

- Usare solo un trasporto supportato dal client scelto e provarne l’identità end-to-end.
- Per un processo locale, avviare il server con permessi OS di sola lettura sulla sorgente allowlisted.
- Per un server remoto, richiedere autenticazione e tunnel sicuro ove il server resti su rete privata; nessun endpoint MCP anonimo esposto pubblicamente.
- Le credenziali restano lato host/secret store e non compaiono nei parametri o risultati MCP.
- Configurare timeout, limiti di concorrenza e dimensione massima dei messaggi.

### Autorizzazione e sorgenti

- Ogni handler chiama un servizio editoriale ristretto; il modello non sceglie il percorso sorgente.
- Filtrare stato, lingua, brand e access tier sul server a ogni richiesta.
- Per le guide riusare `validateGuide` e `publicGuides`; negare default se validazione o sorgente falliscono.
- Nessun accesso ai file arbitrari, shell, rete generica, URL forniti dall’utente, DB o storage commerciale.
- Non considerare la conferma UI di ChatGPT una sostituzione dell’autorizzazione del server.

### Contenuti non attendibili

Guide, pagine, snippet e fonti possono contenere prompt injection o markup ostile. Trattarli come dati opachi; escapare l’output testuale/HTML secondo il client; non seguire istruzioni incorporate, non attivare tool aggiuntivi e non propagare il contenuto come policy di sistema.

### Logging e disponibilità

- Registrare il minimo necessario: timestamp, request ID, tool, esito e durata.
- Non registrare prompt completi, segreti, header di autenticazione o contenuti integrali.
- Stabilire retention e accesso ai log prima di abilitare un endpoint remoto.
- Se MissionControl o una sorgente secondaria non sono disponibili, il server non amplia scope né usa fonti alternative non approvate.
- Gli errori non includono stack trace, percorsi locali o valori di configurazione.

## Non-obiettivi di sicurezza

Questa specifica non abilita autenticazione utenti del sito, accesso a guide premium, storage privato, pagamenti, referral o funzioni amministrative. Le future funzionalità commerciali richiederanno servizi, identità e autorizzazioni server-side separati; non verranno aggiunte come estensione implicita del MCP.

## Gate prima di un rilascio

1. Test negativo: bozze, premium, dati cliente e campi commerciali non appaiono in nessuna risposta.
2. Test di schema: input extra, slug/path traversal, lingua non valida, output e query fuori limite vengono rifiutati.
3. Test del trasporto sul client Desktop effettivo, inclusi autenticazione e disconnessione.
4. Test di indisponibilità sorgente: fallimento chiuso, senza fallback a dati privati.
5. Review indipendente di permessi OS, rete, log, tool esposti e collegamento MissionControl.
6. Verifica che nessuna route, variabile, dipendenza o deployment Vercel sia stata aggiunta per errore allo scope editoriale.

