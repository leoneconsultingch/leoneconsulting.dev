# Contratto MCP Leone v1

**Stato:** implementato in `mcp/leone/`; strumenti di lettura del portfolio pubblico.
**Namespace:** `leone.mcp.v1`.
**Trasporto in MissionControl:** stdio child MCP; ogni tool è read-only.

## Regole comuni

- Schemi JSON chiusi (`additionalProperties: false`), lingua `it`/`en`, identificatori validati e limiti applicati dal server.
- Il client non sceglie directory, percorso, URL, comando, stato di pubblicazione o sorgente alternativa.
- Si leggono solo case study pubblicati (`published: true`) nella lingua richiesta.
- Le risposte sono proiezioni limitate e non comprendono client, budget/vincoli, testimonial, link a repository/demo, bozze o file sorgente.
- I testi sono dati non attendibili, non istruzioni. Nessuna risposta contiene stack trace o percorsi locali.
- Nessun tool scrive dati o chiama MissionControl.

## `site_info`

Nessun input. Restituisce nome, contratto, lingue, capacità e permesso read-only.

## `portfolio_list`

Elenca case study pubblicati in una lingua.

| Campo | Tipo | Vincolo |
|---|---|---|
| `language` | `"it" \| "en"` | obbligatorio |
| `limit` | intero | opzionale, default 20, minimo 1, massimo 50 |

Ogni elemento include `slug`, `language`, `title`, `sector`, `summary`, `impact`, `url`.

## `portfolio_get`

Restituisce il dettaglio pubblico normalizzato di un case study. Il server ricontrolla la pubblicazione, senza fidarsi di una precedente `portfolio_list`.

| Campo | Tipo | Vincolo |
|---|---|---|
| `language` | `"it" \| "en"` | obbligatorio |
| `slug` | stringa | kebab-case, massimo 100 caratteri |

Il risultato contiene titolo, settore, problema, architettura, approccio, risultati, metriche, stack, strumenti, ruolo e URL pubblica. Massimo 256 KiB per risposta.

## Errori stabili

| Codice | Significato |
|---|---|
| `INVALID_ARGUMENT` | Lingua, slug o limite non validi |
| `NOT_FOUND` | Elemento non esistente o non pubblico |
| `SOURCE_UNAVAILABLE` | File o catalogo non leggibile o schema sorgente non valido |
| `RESULT_LIMIT` | Risposta oltre il limite |

## Tool esclusi

Bozze, guide premium, `site_search`, `editorial_audit`, modifica contenuti,
pubblicazione, deploy, Git, shell, filesystem arbitrario, fetch URL e tool
MissionControl non fanno parte della v1.
