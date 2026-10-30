# Pre-Call Form - Qualificazione Lead

## Obiettivo
Qualificare i lead PRIMA della call per:
- Ridurre call non qualificate (tire-kickers, fuori budget, fuori scope)
- Preparare la call con contesto (più efficiente)
- Filtrare fit prodotto/servizio

## Domande (max 5)

### 1. Qual è il tuo obiettivo principale?
**Tipo:** Select (single choice)  
**Required:** Yes

Opzioni:
- [ ] Validare fattibilità di un'idea o progetto tech/AI (Audit)
- [ ] Creare un prototipo o MVP funzionante (MVP Sprint)
- [ ] Automatizzare report e centralizzare dati (Data Pipeline)
- [ ] Migliorare/scalare sistema esistente
- [ ] Altro (specifica nel campo note)

### 2. Descrivi brevemente la tua situazione attuale
**Tipo:** Textarea (max 300 caratteri)  
**Required:** Yes  
**Placeholder:** "Es: Abbiamo dati in 3 sistemi diversi (ERP, CRM, Excel) e facciamo report manuali. Vorremmo automatizzare." o "Vogliamo validare un'idea AI per classificare documenti ma non sappiamo se è fattibile."

### 3. Hai già dati o sistemi tecnici esistenti?
**Tipo:** Select (single choice)  
**Required:** Yes

Opzioni:
- [ ] No, partiamo da zero
- [ ] Sì, ma sono disorganizzati o incompleti
- [ ] Sì, abbiamo dati e sistemi ma manca integrazione
- [ ] Sì, abbiamo già infrastruttura avanzata

### 4. Qual è la tua timeline ideale?
**Tipo:** Select (single choice)  
**Required:** Yes

Opzioni:
- [ ] Urgente (entro 1 mese)
- [ ] Breve termine (1-3 mesi)
- [ ] Medio termine (3-6 mesi)
- [ ] Lungo termine (6+ mesi), sto solo esplorando

### 5. Hai un budget allocato per questo progetto?
**Tipo:** Select (single choice)  
**Required:** No (opzionale)

Opzioni:
- [ ] < €3.000
- [ ] €3.000 - €10.000
- [ ] €10.000 - €30.000
- [ ] €30.000+
- [ ] Non ancora definito

**Note:** Campo opzionale ma aiuta a proporre il pacchetto giusto.

---

## Post-Submit Flow

Il sito conferma la ricezione nel browser e invia la richiesta soltanto al
destinatario aziendale configurato. Le email descritte negli scenari e nel
template seguente sono follow-up manuali, dopo la valutazione della richiesta;
non sono invii automatici a indirizzi non verificati.

### Scenario A: Good Fit
- **Trigger:** Obiettivo chiaro + Timeline ragionevole + Budget in range
- **Action:** Redirect a pagina booking con slot disponibili
- **Email:** Conferma + preparazione call (cosa portare, aspettative)

### Scenario B: Needs Audit First  
- **Trigger:** Obiettivo vago o budget non chiaro
- **Action:** Redirect a pagina "Inizia con Audit Asincrono"
- **Email:** Suggerimento di fare audit prima per stimare meglio

### Scenario C: Out of Scope
- **Trigger:** Richiesta fuori dai pacchetti (es: manutenzione continuativa, team augmentation)
- **Action:** Redirect a pagina contatti generica
- **Email:** Ringraziamento + suggerimento di risorse alternative

---

## Email dopo Submit (Template)

**Subject:** Grazie per l'interesse - Prossimi passi

**Body:**
```
Ciao [Nome],

Grazie per aver compilato il form. Ho ricevuto le tue informazioni:
- Obiettivo: [Obiettivo scelto]
- Timeline: [Timeline]

[IF Good Fit:]
Sembra che [Nome Pacchetto] sia perfetto per te. 
Ecco il link per prenotare una call di 30 minuti (gratuita):
[Link Booking]

Prima della call, ti chiedo di preparare:
- Brief di 1-2 pagine (obiettivo, contesto, vincoli)
- Sample dati o screenshot (se applicabile)

[IF Needs Audit:]
Dalla tua descrizione, ti consiglio di iniziare con un Tech/AI Audit.
In 5 giorni avrai un piano chiaro, stime realistiche e una roadmap.
Scopri di più: [Link Audit]

[IF Out of Scope:]
Dal tuo messaggio, sembra che il tuo progetto richieda un approccio diverso 
dai pacchetti standard. Ti consiglio di [suggerimento specifico] oppure 
contattami direttamente a mario@leoneconsulting.dev.

A presto,
Mario Leone
```

---

## Metriche di Successo

- **Completion rate:** > 60% (se < 60%, form troppo lungo)
- **Good fit rate:** > 40% dei submit diventano call
- **Time to complete:** < 2 minuti

## Implementazione Tecnica

### MVP (Fase 1)
- Form HTML con Astro + Tailwind
- POST a endpoint `/api/pre-call.ts`
- Invio email via Nodemailer (già nel progetto)
- Redirect condizionale basato su risposte

### Future (Fase 2)
- Integrazione con CRM (Notion, Airtable, HubSpot)
- Lead scoring automatico
- A/B test su domande e copy
