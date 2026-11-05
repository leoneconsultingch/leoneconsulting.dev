# MCP Leone Consulting

## Stato

**MCP portfolio e adapter MissionControl implementati nei working tree.** Il connettore/runtime MissionControl non è ancora stato aggiornato né provato con ChatGPT. Nessun endpoint pubblico o tunnel è attivo.

## Scopo

Consentire a MissionControl e, attraverso il suo connettore, a ChatGPT di consultare le schede portfolio pubbliche di Leone Consulting tramite strumenti MCP espliciti e limitati. MissionControl può invocare il MCP Leone; il MCP Leone non accede a MissionControl.

## Documenti

- [Piano di realizzazione](implementation-plan.md): roadmap aggiornata concordata con Mario; prima MCP, poi integrazione MissionControl e agenti blog giornaliero, guide settimanali e CV mensile. Le capacità di scrittura restano future e separate dalla v1.
- [Architettura](architecture.md): componenti, trasporti, MissionControl, flussi e fasi.
- [Tool v1](tools-v1.md): strumenti read-only implementati e contratti di risposta.
- [Confini di sicurezza](security-boundaries.md): dati inclusi/esclusi e controlli di integrazione.

## Vincoli invarianti

- Nessun accesso a pagamenti, prezzi, ordini, abbonamenti, commissioni, ricavi, clienti o permessi premium.
- La prima versione è in sola lettura e usa solo dati pubblici approvati.
- Nessun database, account commerciale, provider di pagamento o storage privato richiesto per questa versione.
- Il MCP non pubblica, non fa commit/push e non avvia deployment.
- ChatGPT propone analisi; le decisioni editoriali e la pubblicazione restano umane.

## Stato delle decisioni

| Decisione | Stato |
|---|---|
| Perimetro editoriale e commerciale escluso | Proposto |
| Tool portfolio read-only | Implementati; handshake e chiamata stdio verificati |
| Child MCP MissionControl | Manifest e adapter sorgente aggiunti; runtime non aggiornato |
| ChatGPT tramite MissionControl | Da verificare dopo aggiornamento del connettore |
| Connessione ChatGPT diretta | Non configurata; tunnel/HTTPS non necessario al flusso previsto |
| Hosting del processo MCP | Processo stdio avviato dal child MCP MissionControl |
| Database | Non necessario per la prima versione |

## Fonti tecniche

- [OpenAI — Developer mode e app MCP](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt): disponibilità, collegamento a server remoti e uso di tunnel per server locali/privati. Verificare piano e modalità Desktop al momento dell’attivazione.
- [OpenAI — Plugin in ChatGPT](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt): app MCP locali all’interno di plugin Desktop, dove supportate.
- [MCP — Trasporti](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports): stdio e Streamable HTTP.

