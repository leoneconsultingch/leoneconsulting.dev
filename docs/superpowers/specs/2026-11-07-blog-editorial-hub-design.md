# Blog: ricerca, metodi e applicazioni

Disegno approvato da Mario in chat il 7 novembre 2026: bilanciare competenza tecnica/accademica e applicativa/imprenditoriale.

- Un hub bilingue con tre sezioni di pari dignità: research (Ricerca e fondamenti), methods (Metodi e sperimentazione), applications (Applicazioni e casi).
- Argomenti disciplinari distinti dalla sezione; formato e livello espliciti.
- Ingressi alle sezioni e gruppi separati nella home, archivio completo secondario, pagine sezione linkabili.
- Conservare URL articoli e contenuti firmati; classificazione in company/blog-editorial.json, fuori dal glob company/blog/*.json e dal contentDigest.
- Post sconosciuti al catalogo: collocazione neutra nell’archivio, nessuna classificazione per parole chiave.
- Ricerca con indice, fonti e chiusura di approfondimento; metodi con percorsi tecnici; applicazioni con collegamenti ai servizi. Nessun invito commerciale uniforme.
- Research vuota finché non esistono contenuti approvati: testo breve onesto, nessun titolo o corpo di bozza reso pubblico. Transformer è ancora in bozza e non va pubblicato in questo task.
- Riutilizzare le Guide esistenti, senza duplicarle. Nessuna nuova dipendenza, modifica a i18n globale, deploy, credenziali o schema/servizio MissionControl.
- Pagine sezione su /blog/sections/{research,methods,applications,archive}/ e corrispondenti /en, identificatori uguali per conservare hreflang/switch lingua esistenti.
- Il nuovo flusso resta compatibile con Redazione: JSON articoli invariati, catalogo editoriale gestito separatamente; documentare classificazione dei futuri articoli.
- Tutte le sezioni restano trasversali: AI, matematica, fisica, software, dati, economia sono argomenti possibili, non nuovi blog separati.
- Non committare, pubblicare o cambiare il workspace originale: il risultato va nel worktree gestito dopo verifiche.
