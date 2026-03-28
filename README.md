# 🍽️ Recett.ai

Application web pour extraire et gérer vos recettes avec l'IA **Mistral**.

---

## 🚀 Mise en ligne sur GitHub Pages

### 1. Créez un dépôt GitHub
- github.com → **New repository** → nommez-le `recettai` → Public → **Create**

### 2. Uploadez les fichiers en respectant cette arborescence
```
recettai/
├── index.html
├── README.md
├── style.css
└── app.js
```
Sur GitHub : cliquez **uploading an existing file** → glissez tous les fichiers → **Commit changes**

### 3. Activez GitHub Pages
- **Settings** → **Pages** → Source : *Deploy from a branch* → branche `main`, dossier `/` → **Save**

Votre app est disponible sur :
[Recett.ia](https://florencelc.github.io/Recettia/)


---

## 🔑 Clé API Mistral

1. Créez un compte sur [console.mistral.ai](https://console.mistral.ai)
2. Allez dans **API Keys** → **Create new key**
3. Dans l'app, cliquez ⚙️ **Paramètres** → collez votre clé → **Enregistrer**

> Votre clé est stockée uniquement dans votre navigateur (localStorage).

---

## ✨ Fonctionnalités

- Analyse depuis lien vidéo, page web ou texte collé
- Fiche recette entièrement modifiable
- Conversion automatique des portions
- Sauvegarde locale (localStorage)
- Classification automatique : Viande / Poisson / Dessert / Cocktail / Entrée
- Liste de courses consolidée par catégories
- Planning hebdomadaire (Midi & Soir)
- Export PDF
- Import / Export JSON
