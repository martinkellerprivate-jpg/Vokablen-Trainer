# Deploy auf GitHub Pages (Phase 8) — Klick-Anleitung für Martin

Die App ist als PWA gebaut (installierbar, offline). Hosting: GitHub Pages,
Build automatisch per GitHub Actions. Diese Schritte machst **du**.

## ⚠️ Wichtig: Repo-Name muss zum `base`-Pfad passen
In `vite.config.ts` steht `const base = "/vokabeltrainer/";`. Der Teil zwischen
den Schrägstrichen **muss exakt dem Repo-Namen entsprechen**.
- Repo heißt `vokabeltrainer` → nichts ändern.
- Anderer Name → sag mir den Namen, ich passe `base` an (sonst lädt nichts).

## 1. Leeres GitHub-Repo anlegen
- Neues Repo, **ohne** README/.gitignore/Lizenz (leer).
- Name: **`vokabeltrainer`** (Empfehlung; sonst siehe oben).

## 2. Secrets hinterlegen
Repo → **Settings → Secrets and variables → Actions → New repository secret**, zweimal:
- `VITE_SUPABASE_URL` = deine Supabase Project URL
- `VITE_SUPABASE_ANON_KEY` = der `sb_publishable_…` Key
(Beide sind client-seitig unkritisch; RLS schützt die Daten.)

## 3. Pages-Quelle auf „GitHub Actions"
Repo → **Settings → Pages → Build and deployment → Source: „GitHub Actions"**.

## 4. Code pushen (mit PAT)
- **Personal Access Token** erstellen mit Scopes **`repo`** + **`workflow`**
  (GitHub → Settings → Developer settings → Personal access tokens).
- Im Projektordner:
  ```
  git init
  git add -A
  git commit -m "Lilly-Anne's Vokabeltrainer"
  git branch -M main
  git remote add origin https://github.com/<dein-user>/vokabeltrainer.git
  git push -u origin main      # Benutzername = GitHub-User, Passwort = der PAT
  ```
- Der Push löst die Action aus (Tab **Actions**). Nach grünem Lauf steht die URL
  unter **Settings → Pages**: `https://<dein-user>.github.io/vokabeltrainer/`.

## 5. Gate-Test (machen wir gemeinsam, auf der Live-URL)
- Seite öffnen → installierbar (Browser bietet „Installieren" an).
- **Installierte** App starten → öffnet auf `…/vokabeltrainer/` (nicht Root).
- Offline schalten (Flugmodus / DevTools→Network→Offline) → App lädt und ist
  nutzbar (Üben/Wortliste/Statistik/Settings); Sync zeigt „offline".
- Login/Sync/Teilen funktionieren online wie gehabt.

## Nicht nötig
Kein `404.html` — die App nutzt Hash-Routing (`#share=…`) und sonst In-App-State,
keine server-seitigen Pfade.

## Go-Live-Checkliste (vor echtem öffentlichem Launch, nicht für den Test)
- Supabase **„Confirm email" wieder einschalten**.
- Datenschutz-**Realtext** statt Platzhalter.
- **RLS** auf `user_documents` + `shared_lists` final prüfen (anon-Key ist öffentlich).
- Starter-Wortlisten-CR einspielen.
