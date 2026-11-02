# MCP Leone Consulting

## Stato

**Architettura proposta; MCP non implementato.** Questi documenti definiscono perimetro e contratti candidati. Non attestano che un server, un connettore ChatGPT o un collegamento a MissionControl sia già attivo.

## Scopo

Consentire a ChatGPT Desktop di consultare e analizzare i contenuti pubblici di Leone Consulting tramite strumenti MCP espliciti e limitati. Il MCP è un’interfaccia editoriale: non è il backend commerciale del sito e non sostituisce il flusso umano di revisione e pubblicazione.

## Documenti

- [Architettura](architecture.md): componenti, trasporti, MissionControl, flussi e fasi.
- [Tool v1](tools-v1.md): strumenti read-only proposti e contratti di risposta.
- [Confini di sicurezza](security-boundaries.md): dati inclusi/esclusi e controlli richiesti.

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
| Tool read-only iniziali | Proposti |
| Trasporto verso ChatGPT Desktop | Da verificare sul plugin/client effettivo |
| Integrazione con MissionControl | Separata nella prima versione; adapter ristretto da valutare |
| Hosting del processo MCP | Da decidere dopo la prova del trasporto |
| Database | Non necessario per la prima versione |

## Fonti tecniche

- [OpenAI — Developer mode e app MCP](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt): disponibilità, collegamento a server remoti e uso di tunnel per server locali/privati. Verificare piano e modalità Desktop al momento dell’attivazione.
- [OpenAI — Plugin in ChatGPT](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt): app MCP locali all’interno di plugin Desktop, dove supportate.
- [MCP — Trasporti](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports): stdio e Streamable HTTP.

