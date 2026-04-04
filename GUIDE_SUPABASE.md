# 🗄️ Guide de configuration Supabase pour Recett.ai

Supabase est une base de données gratuite en ligne.
Vos recettes seront accessibles sur **tous vos appareils**.

---

## Étape 1 — Créer un compte Supabase (gratuit)

1. Allez sur **https://supabase.com**
2. Cliquez sur **Start your project**
3. Connectez-vous avec votre compte GitHub (ou email)
4. Cliquez sur **New project**
5. Remplissez :
   - **Name** : `recettai`
   - **Database Password** : choisissez un mot de passe (notez-le)
   - **Region** : choisissez le plus proche (ex: West EU)
6. Cliquez sur **Create new project** — attendez ~1 minute

---

## Étape 2 — Créer la table "recipes"

1. Dans votre projet Supabase, cliquez sur **SQL Editor** (icône terminal à gauche)
2. Cliquez sur **New query**
3. Copiez-collez exactement ce code SQL et cliquez sur **Run** :

```sql
-- Création de la table des recettes
CREATE TABLE recipes (
  id          BIGINT PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT,
  servings    INTEGER DEFAULT 4,
  source      TEXT,
  photo       TEXT,
  ingredients JSONB DEFAULT '[]',
  steps       JSONB DEFAULT '[]',
  base_servings    INTEGER,
  base_ingredients JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Autoriser la lecture/écriture publique (pas d'authentification requise)
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accès public lecture"
  ON recipes FOR SELECT USING (true);

CREATE POLICY "Accès public insertion"
  ON recipes FOR INSERT WITH CHECK (true);

CREATE POLICY "Accès public mise à jour"
  ON recipes FOR UPDATE USING (true);

CREATE POLICY "Accès public suppression"
  ON recipes FOR DELETE USING (true);
```

4. Vous devez voir **"Success. No rows returned"** → c'est bon ✅

---

## Étape 3 — Créer le bucket de stockage pour les photos

1. Dans le menu gauche, cliquez sur **Storage** (icône nuage)
2. Cliquez sur **New bucket**
3. Nom : `photos`
4. Cochez **Public bucket** ✅
5. Cliquez sur **Save**
6. Cliquez sur votre bucket `photos` → onglet **Policies**
7. Cliquez sur **New policy** → **For full customization**
8. Remplissez :
   - Policy name : `public_access`
   - Allowed operation : cochez **SELECT, INSERT, UPDATE, DELETE**
   - Target roles : `anon`
   - USING expression : `true`
9. Cliquez sur **Review** puis **Save policy**

---

## Étape 4 — Récupérer vos clés API

1. Dans le menu gauche, cliquez sur ⚙️ **Project Settings**
2. Cliquez sur **API**
3. Notez ces deux valeurs :
   - **Project URL** → c'est votre `SUPABASE_URL`
   - **anon public** (dans "Project API keys") → c'est votre `SUPABASE_ANON`

---

## Étape 5 — Mettre vos clés dans app.js

Ouvrez le fichier `js/app.js` et remplacez les deux lignes en haut du fichier :

```javascript
const SUPABASE_URL  = 'VOTRE_SUPABASE_URL';      // ← collez votre Project URL ici
const SUPABASE_ANON = 'VOTRE_SUPABASE_ANON_KEY'; // ← collez votre anon key ici
```

Exemple :
```javascript
const SUPABASE_URL  = 'https://abcdefghij.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## Étape 6 — Uploader sur GitHub

Remplacez le fichier `js/app.js` dans votre dépôt GitHub par le nouveau.
GitHub Pages se mettra à jour automatiquement en ~1 minute.

---

## ✅ Vérification

Ouvrez votre application → vous devez voir :
**"☁️ Connecté à la base de données — vos recettes sont synchronisées."**

Si vous voyez une erreur, vérifiez que vous avez bien :
- Exécuté le SQL à l'étape 2
- Copié les bonnes clés à l'étape 5

---

## 🔒 Sécurité

La clé `anon` est **publique par nature** — elle est faite pour être utilisée dans le navigateur.
Elle donne accès uniquement à votre table `recipes` selon les règles que vous avez définies.
Ne partagez jamais votre **service_role** key (l'autre clé dans Supabase Settings).

