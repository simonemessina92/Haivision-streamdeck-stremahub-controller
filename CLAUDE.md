# CLAUDE.md

Plugin Stream Deck (SDK v2, Node.js 24) per controllare una Haivision StreamHub da Stream Deck XL o Stream Deck Mobile con layout 32 tasti (8 x 4). Il progetto prima era seguito da Codex: questo file riassume le regole che seguiva.

## Lingua

- Con Simone (owner) si parla in **italiano**.
- Interfaccia del plugin, README, QUICK START e RELEASE_NOTES restano in **inglese**.

## Struttura

- `src/` — sorgente unico del plugin. Ogni modulo viene copiato così com'è in `org.streamhub.controller.sdPlugin/bin/` da `build.js`.
  - `plugin.js` entry point; `engine.js` logica del pannello; `layout.js` posizioni dei 32 tasti; `render.js` grafica SVG dei tasti.
  - `client.js` API REST StreamHub; `native-previews.js` connessione nativa (anteprime, scritture native); `rcp.js` modello camera Mojo Pro.
  - Funzioni: `outputs.js`, `bulk.js`, `multiview.js`, `camera-control.js`, `channel-details.js`, `hub-details.js`, `licenses.js`, `remote-access.js`, `connection-session.js`, `clipboard.js`, `diagnostics.js`, `assets.js`, `hold.js`, `demo.js`, `rest-extra.js`.
  - `inspector.html` property inspector (configurazione accesso StreamHub). `images/` icone.
- `build.js` — genera `org.streamhub.controller.sdPlugin/` (manifest, bin, immagini, profilo XL) e `dist/StreamHub XL.streamDeckProfile`. **Contiene la versione del manifest** (`Version:'X.Y.Z.N'`). Se aggiungi un modulo in `src/`, aggiungilo alla lista di copia in `build.js`.
- `package-release.js` — rinomina l'installer e copia il QUICK START in `dist/`.
- `tests/` — test `node:test`. Usano i moduli **compilati** in `org.streamhub.controller.sdPlugin/bin/`: fare sempre `npm run build` prima di `npm test`.
- `docs/QUICK START.txt`, `README.md`, `README.txt`, `RELEASE_NOTES.md` — documentazione pubblica.
- `.github/workflows/build-release.yml` — CI su Windows.
- Ignorati (non committare): `node_modules/`, `dist/`, `org.streamhub.controller.sdPlugin/`, `backups/`, `diagnostics/`, `.env*`.

## Comandi

```bash
npm ci            # dipendenze (solo @elgato/cli)
npm run build     # genera org.streamhub.controller.sdPlugin/
npm test          # 207 test al momento della migrazione (v0.18.1)
npm run validate  # validazione Elgato
npm run pack      # crea dist/haivision-streamdeck-streamhub-plugin.streamDeckPlugin
```

Prima di ogni push: `npm run build && npm test && npm run validate`. Ogni modifica funzionale deve avere test.

## Versioni

- Golden: `package.json` = `X.Y.Z`, manifest in `build.js` = `X.Y.Z.N` (es. 0.18.1 / 0.18.1.1).
- Sviluppo: `package.json` = `X.Y.Z-dev.N`, manifest = `X.Y.Z.N` (il manifest Stream Deck accetta solo numeri). Ogni build DEV consegnata a Simone incrementa N, così sa quale versione sta provando.
- Aggiornare `package.json`, `package-lock.json` (campo version) e `build.js` insieme.

## Flusso di lavoro (develop → golden → main)

- `develop` = DEV. Claude sviluppa e fa push su `develop` in autonomia.
- La CI su `develop` costruisce il plugin e carica l'artifact `streamhub-xl` (installer `.streamDeckPlugin`, profilo, ZIP). Simone lo scarica dalla pagina Actions e lo prova sul suo Stream Deck (Windows).
- Quando Simone dice **"golden"**: togliere `-dev.N`, aggiornare README (link al nuovo ZIP), QUICK START se serve e `RELEASE_NOTES.md`, poi portare su `main`.
- **Attenzione:** un push su `main` con una versione nuova in `package.json` **pubblica automaticamente una release GitHub** (tag `vX.Y.Z`, con `RELEASE_NOTES.md` come testo). Mai portare su `main` senza l'OK "golden" di Simone. Le modifiche solo di documentazione su `main` vanno con `[skip ci]` nel messaggio di commit.
- Non toccare mai una release esistente: la CI la preserva se il tag esiste già.

## Regole del progetto (ereditate da Codex)

- Layout fisso 32 tasti 8 x 4 (XL e Mobile Pro). Non cambiare posizioni o colori di tasti esistenti se non richiesto: Simone verifica tutto sull'hardware.
- Mostrare solo controlli supportati dalla StreamHub e dai dispositivi collegati (capabilities reali, nessun valore inventato; dati non disponibili vanno indicati come tali).
- Scritture sulla StreamHub: leggere lo stato fresco prima di scrivere, controllare identità/sessione, confermare con una rilettura. Non toccare campi non correlati (profili, power, ordine output, ecc.).
- Mai mettere credenziali nei profili, nei log, nei pacchetti o nel repo. Le stringhe mostrate a schermo vengono sanificate (userinfo e query degli URL).
- Non pubblicare `backups/`, `diagnostics/`, contenuti interni di `dist/` o accessi salvati.
- L'estensione Chrome originale (repo `Haivision-streamhub-controller`) è un progetto separato: non va modificata da qui.
- Hub360 non è validato.
