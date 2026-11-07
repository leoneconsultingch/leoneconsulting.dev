# Confini di sicurezza — MCP Leone

**Direzione:** MissionControl può invocare il MCP Leone; il MCP Leone non accede a MissionControl.
**Sorgente:** case study pubblici già marcati `published: true`.

## Dati esposti

| Classe | Esempi | MCP v1 |
|---|---|---|
| Portfolio pubblico | Titolo, settore, descrizione, soluzione, risultati, stack e ruolo | Lettura tramite proiezione nominata |
| Editoriale non pubblico | Bozze, note, revisioni | Escluso |
| Dati commerciali/personali | Clienti, budget, prezzi, pagamenti, account | Escluso |
| Controllo e segreti | Token, chiavi, deploy, VCS, configurazione privata | Escluso |

La proiezione omette campi opzionali e non serializza direttamente il JSON
sorgente. Il server legge da una directory fissa; slug, lingua e dimensione sono
validati prima di ogni accesso. I file symlink e sorgenti oltre il limite sono
rifiutati.

## Direzione MissionControl → Leone

- MissionControl avvia `mcp/manifest.json` come processo stdio e mantiene identità, policy e audit.
- La policy MissionControl resta deny-by-default e abilita per ChatGPT soltanto `site_info`, `portfolio_list` e `portfolio_get`.
- Il connettore ChatGPT deve esporre tool Leone nominati; nessun proxy generico `call_child_tool` viene dato a ChatGPT.
- Nessuna credenziale operatore o variabile segreta viene passata al child.
- L’assenza di policy, sorgente o child produce errore; nessun fallback a contenuto privato.

## Direzione Leone → MissionControl

Non implementata e vietata: nessun client, endpoint, tool, token, URL o richiesta
verso MissionControl è presente nel server Leone.

## Contenuti e protocollo

I testi pubblici possono contenere istruzioni ostili o prompt injection. Sono
restituiti come dati e non attivano altri tool. Il trasporto è stdio: stdout è
riservato al protocollo; errori interni non includono stack trace o path.

Gli strumenti dichiarano `readOnlyHint: true`, `destructiveHint: false` e
`openWorldHint: false`. Queste annotazioni non sostituiscono validazione e
allowlist server-side.

## Gate d’integrazione

1. Discovery dei soli tre tool dal processo MissionControl.
2. Policy operativa verificata per l’identità `chatgpt`.
3. Chiamate IT/EN riuscite attraverso il connettore MissionControl.
4. Negativi per bozze, slug traversal, chiavi extra, symlink e output fuori limite.
5. Conferma che nessun flusso inverso o tool di scrittura è raggiungibile.
