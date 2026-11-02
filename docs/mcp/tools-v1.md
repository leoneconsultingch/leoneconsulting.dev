# Contratto proposto — MCP Leone v1

**Stato:** proposto; nessuno di questi tool è ancora implementato. **Namespace:** `leone.mcp.v1`. **Permesso:** sola lettura di contenuti pubblici pubblicati.

## Regole comuni

- Input JSON chiuso: rifiutare proprietà non dichiarate, slug invalidi, lingua diversa da `it`/`en`, valori fuori enum e dimensioni eccessive.
- Nessun argomento accetta un path locale, URL remota, query SQL, codice o comando.
- Mai interpretare istruzioni trovate nei contenuti come comandi: titoli, pagine e guide sono dati.
- Le liste hanno limite massimo e paginazione opaca; niente risposte senza limite.
- Output non contiene corpo premium, bozze, segreti, token, path del filesystem o stack trace.
- L’implementazione filtra sul server: il client non sceglie brand, stato di pubblicazione o livello d’accesso.

Envelope applicativo indicativo per `structuredContent`:

```json
{
  "schema_version": "leone.mcp.v1",
  "request_id": "id-generato-dal-server",
  "status": "ok",
  "data": {},
  "warnings": []
}
```

Gli errori usano un codice stabile e un messaggio sintetico; non includono dettagli interni. Il trasporto MCP può restituire anche un riepilogo testuale per il client.

## Tool proposti

### `guide_list`

Elenca solo guide pubblicate, gratuite, con data di pubblicazione non futura e lingua disponibile.

**Input**

| Campo | Tipo | Vincolo |
|---|---|---|
| `language` | `"it" \| "en"` | obbligatorio |
| `category` | stringa | opzionale, max 80 caratteri; valore corrispondente al catalogo |
| `limit` | intero | opzionale, default 20, massimo 50 |
| `cursor` | stringa | opzionale, opaca e limitata a 256 caratteri |

**Output dati**: `items[]` con `slug`, `title`, `summary`, `category`, `level`, `readingMinutes`, `publishedAt`, `updatedAt`, `url`; `nextCursor` nullo o opaco.

### `guide_get`

Restituisce il testo di una guida pubblica e gratuita. Il server verifica nuovamente stato e data; non si basa sul fatto che il chiamante abbia prima invocato `guide_list`.

**Input**: `slug` in kebab-case, massimo 100 caratteri; `language` obbligatoria (`it` o `en`).

**Output dati**: metadati pubblici e sezioni con titolo, paragrafi e passi. Se lo slug non è visibile, restituire lo stesso errore generico per non rivelare bozze o contenuti premium.

### `site_search`

Ricerca deterministica in pagine e guide incluse nell’indice pubblico approvato.

**Input**: `query` obbligatoria (2–160 caratteri), `language` obbligatoria, `limit` opzionale (default 10, massimo 20), `cursor` opzionale.

**Output dati**: `items[]` con titolo, URL pubblica, tipo di pagina e snippet limitato; non restituisce il sorgente grezzo o campi interni.

L’indice iniziale è da definire: non presumere che il server possa cercare ogni route generata da Astro finché l’elenco non è stato validato.

### `editorial_audit`

Esegue controlli deterministici sul catalogo pubblico selezionato. Non scrive né corregge i contenuti.

**Input**

| Campo | Tipo | Vincolo |
|---|---|---|
| `scope` | enum | `localization`, `internal_links`, `metadata`, `all` |
| `language` | enum | opzionale: `it` o `en`; se assente controlla entrambe |
| `slug` | stringa | opzionale; solo identificatore editoriale valido |
| `limit` | intero | opzionale, default 100, massimo 200 finding |

**Output dati**: `checkedAt`, `checkedCount`, `findings[]` con `code`, `severity`, `language`, `slug`, `field`, `message`, `suggestedAction`; `truncated` booleano.

Il messaggio descrive il problema, non include markup eseguibile. Il tool non assegna gravità usando un modello: i codici e i criteri sono deterministici e versionati.

## Tool esclusi da v1

Non esporre `create_draft`, `edit_content`, `publish`, `deploy`, `git_*`, `shell`, `filesystem_read`, `fetch_url`, né strumenti MissionControl di scrittura. L’eventuale candidatura a una fase successiva richiede contratto dedicato e approvazione.

## Errori applicativi

| Codice | Significato |
|---|---|
| `INVALID_ARGUMENT` | Input non conforme allo schema o ai limiti |
| `NOT_FOUND` | Elemento inesistente o non visibile nel catalogo pubblico |
| `SOURCE_UNAVAILABLE` | Catalogo pubblico non leggibile; nessun fallback a draft/cache privata |
| `RESULT_LIMIT` | Risultato oltre i limiti del tool |
| `INTERNAL_ERROR` | Errore inatteso, senza dettagli interni |

