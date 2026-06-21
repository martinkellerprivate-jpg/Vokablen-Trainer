# Supabase einrichten (Phase 3) — Klick-Anleitung für Martin

Diese Schritte machst **du** im Supabase-Dashboard. Bis sie erledigt sind, läuft die
App völlig normal **lokal** weiter (kein Login, kein Sync) — du kannst also in Ruhe
einrichten. Danach testen wir das Sync-Gate gemeinsam.

## 1. Projekt anlegen
1. Auf <https://supabase.com> einloggen → **New project**.
2. Name z. B. `vokabeltrainer`, Datenbank-Passwort vergeben (notieren), Region nahe DE
   (z. B. *Central EU / Frankfurt*).
3. Warten, bis das Projekt fertig provisioniert ist (~1–2 Min).

## 2. Schema ausführen
1. Linke Leiste → **SQL Editor** → **New query**.
2. Den **kompletten Inhalt der Datei `schema.sql`** (liegt im Projekt-Root) hineinkopieren.
3. **Run** klicken. Erwartung: „Success. No rows returned."
   (Legt Tabelle `user_documents`, Row-Level-Security-Policy und den `updated_at`-Trigger an.)

## 3. E-Mail-Auth aktivieren
1. Linke Leiste → **Authentication** → **Sign In / Providers** (bzw. **Providers**).
2. **Email** muss aktiviert sein (Standard).
3. **Für die Testphase:** **„Confirm email" ausschalten**
   (Authentication → Providers → Email → *Confirm email* aus). Dann kann man sich
   sofort nach der Registrierung anmelden. **Vor dem Go-Live wieder einschalten.**

## 4. Test-Account anlegen
Zwei Wege — einer reicht:
- **Im Dashboard:** Authentication → **Users** → **Add user** → E-Mail + Passwort.
- **Oder direkt in der App:** nach Schritt 5 oben rechts **„Anmelden" → „Registrieren"**.

## 5. Schlüssel in die App eintragen
1. Linke Leiste → **Project Settings** → **API**.
2. Kopiere **Project URL** und **anon public** Key.
3. Im Projekt-Root die Datei `.env.example` nach **`.env.local`** kopieren und ausfüllen:
   ```
   VITE_SUPABASE_URL=https://DEINPROJEKT.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ... (anon public key)
   ```
4. Dev-Server **neu starten** (`npm run dev`), damit Vite die neuen Variablen lädt.
   `.env.local` ist über `.gitignore` ausgeschlossen — landet nicht im Repo.

> Hinweis: Der **anon public** Key ist für den Client gedacht und unkritisch — die
> Daten sind durch Row-Level-Security geschützt (jeder sieht nur seine eigenen Zeilen).
> Nimm **nicht** den `service_role`-Key.

## 6. Gate-Test (machen wir gemeinsam)
- Oben rechts erscheint jetzt ein **„Anmelden"**-Button → einloggen.
- Erststart: deine lokalen Wörter wandern hoch (Sync-Punkt wird grün = „Synchronisiert").
- Zweiter Browser / privates Fenster → einloggen → dieselben Daten erscheinen.
- Eine Änderung auf Gerät A → auf Gerät B Tab wechseln/neu fokussieren → Änderung ist da.
- Offline (DevTools → Network → Offline) etwas ändern → wieder online → wird nachgeholt.
- Ohne `.env.local` / ausgeloggt / offline bleibt alles voll nutzbar.

Wenn etwas klemmt: sag mir die Fehlermeldung aus der Browser-Konsole, dann schaue ich nach.
