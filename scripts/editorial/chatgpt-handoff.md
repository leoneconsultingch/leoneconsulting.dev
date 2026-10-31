# Consegna manuale della rassegna a MissionControl

Incollare nella chat della rassegna con il plugin `missioncontrol2` disponibile:

```text
Consegna questa rassegna al progetto leoneconsulting.dev tramite missioncontrol2.
Invia solo contenuti destinati al pubblico, senza cronologia privata, dati
personali o dettagli infrastrutturali. Non pubblicare e non modificare task.

Se diary_add_entry non è disponibile o fallisce, fermati e segnala il limite.
Non dichiarare riuscita una chiamata che non hai eseguito.

Prepara un JSON:
- schemaVersion: 1
- reportId: identificativo univoco, massimo 120 caratteri, solo lettere, cifre,
  punti, trattini e underscore; inizia con una lettera o cifra
- mode: "pilot"
- producer: "chatgpt-report-via-missioncontrol2"
- date: data reale della rassegna, formato YYYY-MM-DD
- title, summary, editorialAngle: testo pubblico; separa spunti e fatti
- publicationAuthorized: false
- sources: da 1 a 6 fonti, ognuna con id (minuscolo, cifre, trattini), url HTTPS
  originale, title, publisher, publishedAt (data verificata o null), checkedAt
  (data dell'effettiva verifica o null), facts (lista dei fatti con attribuzione)

Origin attualmente ammessi: https://openai.com, https://help.openai.com,
https://blog.google, https://huggingface.co. Non sostituire una fonte con una
fonte diversa per superare il controllo. Segnala eventuali fonti escluse.
Non usare oggi come data di pubblicazione o verifica senza averlo accertato.

Chiama diary_add_entry del plugin missioncontrol2 con:
project: "leoneconsulting.dev"
title: "[PILOT editoriale] Rassegna ChatGPT"
tags: ["editorial-inbox-pilot", "review-required"]
content: il JSON serializzato.

Restituisci l'ID ricevuto e il reportId. Se disponibile, usa diary_list_entries
per rileggere la voce e verificare che coincida. Se la stessa rassegna è già
stata consegnata, riusa la voce e l'ID: non crearne un'altra. Per una correzione
usa un nuovo reportId e descrivi la revisione nel summary.

Questa consegna è manuale. Non affermare che un task programmato possa usare il
plugin o che sia già attiva la sincronizzazione quotidiana. Il destinatario
preparerà soltanto una bozza da revisionare.
```
