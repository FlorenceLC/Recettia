'use strict';

// ═══════════════════════════════════════════════════════════════
//  RECETT.AI — app.js
//  Base de données : GitHub Gist (JSON, tous appareils, gratuit)
//  Photos         : supprimées — champ source (lien vidéo/site) à la place
//  Fallback       : cache local si Gist hors ligne
// ═══════════════════════════════════════════════════════════════

// ─── CONSTANTS ───────────────────────────────────────────────
const DAYS  = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const MEALS = ['Midi','Soir'];

const CAT_ICONS  = { Viande:'🥩', Poisson:'🐟', Dessert:'🍰', Cocktail:'🍹', 'Entrée':'🥗' };
const CAT_EMOJIS = { Viande:'🥩', Poisson:'🐠', Dessert:'🍰', Cocktail:'🍹', 'Entrée':'🥗' };

const LOADING_STEPS = [
  'Récupération du contenu…',
  'Analyse des ingrédients…',
  'Reconstruction de la recette…',
  'Classification automatique…',
  'Finalisation de la fiche…',
];

// Ordre important : les catégories les plus spécifiques sont vérifiées en premier
// pour éviter les faux positifs (ex: "blanc de poulet" ne doit pas matcher "blanc" ailleurs)
const SHOPPING_CATS_ORDERED = [
  ['Épices & Condiments', ['poivre','paprika','curcuma','cumin','curry','cannelle',
    'muscade','piment','cayenne','herbes de provence','origan','sauce soja',
    'vinaigre','moutarde','ketchup','mayonnaise','huile d\'olive','huile de tournesol',
    'huile de sésame','sel','bouillon','cube de bouillon','sauce worcestershire',
    'sirop d\'érable','miel','vanille','levure','bicarbonate','fécule','maïzena',
    'safran','gingembre en poudre','ail en poudre','oignon en poudre','five spice',
    'sumac','za\'atar','harissa','tabasco','sauce nuoc-mâm','nuoc mam','sauce huître',
    'sauce poisson','sauce hoisin','mirin','vinaigre de riz','sauce teriyaki']],

  ['Viandes & Charcuterie', ['poulet','boeuf','bœuf','porc','agneau','veau','canard',
    'dinde','saucisse','saucisson','jambon','lard','bacon','escalope','côte de',
    'côtelette','filet de poulet','filet de boeuf','filet mignon','steak','viande hachée',
    'haché','merguez','chorizo','poitrine','travers','rôti','gigot','entrecôte',
    'bavette','onglet','rumsteck','paleron','jarret','andouille','lardons','pancetta',
    'prosciutto','salami','mortadelle','rillettes','pâté','foie gras','boudin',
    'magret','cuisse de poulet','aile de poulet','blanc de poulet','escalope de poulet',
    'escalope de veau','escalope de dinde','tartare de boeuf','carpaccio de boeuf']],

  ['Poissons & Fruits de mer', ['saumon','thon','cabillaud','crevette','moule','sole',
    'bar','dorade','sardine','anchois','langoustine','homard','seiche','calmar','lieu',
    'truite','maquereau','colin','merlu','lotte','raie','rouget','églefin','tilapia',
    'crabe','huître','coquille saint-jacques','noix de saint-jacques','poulpe',
    'gambas','surimi','tarama','poisson blanc','filet de poisson','filet de saumon',
    'pavé de saumon','pavé de thon']],

  ['Produits laitiers & Œufs', ['lait','beurre','crème','crème fraîche','crème liquide',
    'œuf','oeuf','yaourt','fromage','mozzarella','parmesan','gruyère','ricotta',
    'mascarpone','comté','emmental','feta','chèvre','camembert','brie','cheddar',
    'fromage blanc','fromage râpé','crème épaisse','crème entière','lait de coco',
    'lait concentré','babeurre','skyr','petit-suisse','burrata','halloumi','raclette',
    'fromage à raclette','crème pâtissière']],

  ['Fruits & Légumes', ['tomate','carotte','oignon','ail','pomme','citron','salade',
    'courgette','poivron','champignon','épinard','brocoli','haricot vert','haricot',
    'pois','radis','concombre','betterave','navet','poireau','céleri','pomme de terre',
    'patate','aubergine','artichaut','asperge','fenouil','potiron','courge','butternut',
    'banane','fraise','framboise','mangue','ananas','poire','pêche','abricot','cerise',
    'raisin','kiwi','échalote','persil frais','coriandre fraîche','basilic frais',
    'thym frais','romarin frais','menthe fraîche','gingembre frais','citron vert',
    'orange','pamplemousse','melon','pastèque','myrtille','mûre','cassis','rhubarbe',
    'chou','chou-fleur','chou rouge','chou frisé','kale','roquette','mâche','cresson',
    'endive','laitue','scarole','batavia','maïs doux','petit pois','fève','salsifis',
    'topinambour','panais','rutabaga','igname','manioc','avocat','piment frais',
    'piment fort','herbes fraîches','ciboulette','aneth','estragon','sauge fraîche',
    'laurier frais']],

  ['Épicerie sucrée & sèche', ['farine','sucre','chocolat','riz','pâtes','spaghetti',
    'nouilles','quinoa','semoule','lentille','pois chiche','flocon d\'avoine','avoine',
    'cacao','pépites de chocolat','levure chimique','poudre à lever','amande',
    'noix','noisette','pistache','graine','sésame','pignon de pin','raisin sec',
    'pruneau','datte','figue sèche','biscuit','céréales','pain','pain de mie',
    'tortilla','wrap','vermicelle','boulgour','couscous','tapioca','gélatine',
    'agar-agar','conserve','tomate pelée','coulis de tomate','concentré de tomate',
    'sauce tomate','bouillon cube','huile végétale','vinaigre balsamique']],
];

// Compat : ancien format gardé pour ne rien casser ailleurs si réutilisé
const SHOPPING_CATS = {};
SHOPPING_CATS_ORDERED.forEach(([cat, kws]) => SHOPPING_CATS[cat] = kws);

const GIST_FILENAME = 'recettai.json';

// ─── STATE ───────────────────────────────────────────────────
let recipes          = [];
let plannerData      = {};
let shoppingSelected = new Set();
let currentTab       = 'web';
let currentFilter    = 'all';
let currentTagFilter = '';
let searchQuery      = '';
let baseServings     = 4;
let baseIngredients  = [];
let plannerTarget    = null;
let editingId        = null;
let loadingTimer     = null;
let gistReady        = false;

// ═══════════════════════════════════════════════════════════════
//  GITHUB GIST — CONFIG
// ═══════════════════════════════════════════════════════════════
function getGistId()    { return localStorage.getItem('recettai_gist_id')    || ''; }
function getGistToken() { return localStorage.getItem('recettai_gist_token') || ''; }

function saveGistConfig() {
  const id    = document.getElementById('gist-id-input').value.trim();
  const token = document.getElementById('gist-token-input').value.trim();
  if (!id || !token) { toast('Remplissez l\'ID du Gist et le token GitHub.', 'error'); return; }
  localStorage.setItem('recettai_gist_id', id);
  localStorage.setItem('recettai_gist_token', token);
  setGistStatus('⏳ Test de connexion…', '');
  toast('Configuration enregistrée, connexion en cours…', '');
  // Relancer l'init
  initGist();
}

function toggleGistVis() {
  const inp = document.getElementById('gist-token-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function setGistStatus(msg, cls) {
  const el = document.getElementById('gist-status');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'api-key-status ' + cls;
}

// ═══════════════════════════════════════════════════════════════
//  GITHUB GIST — API
// ═══════════════════════════════════════════════════════════════
async function gistGet() {
  const res = await fetch('https://api.github.com/gists/' + getGistId(), {
    headers: {
      'Authorization': 'Bearer ' + getGistToken(),
      'Accept':        'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error('GitHub ' + res.status + ' — vérifiez l\'ID du Gist et le token.');
  const data  = await res.json();
  const file  = data.files[GIST_FILENAME];
  if (!file)  throw new Error('Fichier "' + GIST_FILENAME + '" introuvable dans ce Gist.');
  return JSON.parse(file.content || '[]');
}

async function gistSave(recipes) {
  const res = await fetch('https://api.github.com/gists/' + getGistId(), {
    method:  'PATCH',
    headers: {
      'Authorization':        'Bearer ' + getGistToken(),
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/json',
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(recipes, null, 2) },
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('Sauvegarde échouée : ' + (err.message || res.status));
  }
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  plannerData   = JSON.parse(localStorage.getItem('recettai_planner') || '{}');
  loadApiKeyStatus();
  // Pré-remplir les champs Gist si déjà configurés
  const gistIdEl    = document.getElementById('gist-id-input');
  const gistTokenEl = document.getElementById('gist-token-input');
  if (gistIdEl    && getGistId())    gistIdEl.value    = getGistId();
  if (gistTokenEl && getGistToken()) gistTokenEl.value = getGistToken();

  initGist();
});

async function initGist() {
  const id    = getGistId();
  const token = getGistToken();

  if (!id || !token) {
    gistReady = false;
    setGistStatus('⚠️ Non configuré — suivez les instructions ci-dessus.', 'err');
    showBanner('⚙️ Configurez GitHub Gist dans les Paramètres pour sauvegarder vos recettes.', 'warn');
    updateBadge();
    return;
  }

  try {
    showBanner('⏳ Chargement de vos recettes…', 'info');
    recipes   = await gistGet();
    gistReady = true;
    updateBadge();
    setGistStatus('✅ Connecté — vos recettes sont synchronisées sur tous vos appareils.', 'ok');
    showBanner('☁️ ' + recipes.length + ' recette(s) chargée(s) depuis GitHub Gist.', 'ok', 3500);
  } catch (err) {
    console.error('[gist init]', err);
    gistReady = false;
    setGistStatus('❌ ' + err.message, 'err');
    showBanner('❌ ' + err.message, 'err');
    // Fallback : cache local
    const cached = localStorage.getItem('recettai_cache');
    if (cached) {
      recipes = JSON.parse(cached);
      updateBadge();
      toast('⚠️ Mode hors ligne — affichage du cache local (' + recipes.length + ' recettes).', '');
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  SAVE TO GIST  (toutes les recettes d'un coup)
// ═══════════════════════════════════════════════════════════════
async function persistToGist() {
  if (!gistReady) return;
  await gistSave(recipes);
  // Mettre à jour le cache local
  localStorage.setItem('recettai_cache', JSON.stringify(recipes));
}

// ═══════════════════════════════════════════════════════════════
//  BANNER
// ═══════════════════════════════════════════════════════════════
function showBanner(msg, type, duration) {
  const el = document.getElementById('sync-banner');
  if (!el) return;
  const colors = { ok:'#6B8F71', err:'#C0392B', warn:'#C4541A', info:'#2B6CB0' };
  el.style.background = colors[type] || colors.info;
  el.style.color      = 'white';
  el.style.display    = 'block';
  el.style.opacity    = '1';
  el.textContent      = msg;
  if (duration) setTimeout(() => { el.style.opacity = '0'; setTimeout(() => { el.style.display = 'none'; }, 500); }, duration);
}

// ═══════════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════════
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('nav-' + page).classList.add('active');
  if (page === 'recipes')  renderRecipes();
  if (page === 'shopping') renderShoppingSelector();
  if (page === 'planner')  renderPlanner();
  if (page === 'pizza')    renderPizzaMenu();
}

function switchTab(tab, btn) {
  currentTab = tab;
  document.querySelectorAll('.input-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.input-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  btn.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════════════
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function showLoading() {
  document.getElementById('loading').classList.add('show');
  let i = 0;
  document.getElementById('loading-step').textContent = LOADING_STEPS[0];
  loadingTimer = setInterval(() => {
    i = (i + 1) % LOADING_STEPS.length;
    document.getElementById('loading-step').textContent = LOADING_STEPS[i];
  }, 1800);
}

function hideLoading() {
  clearInterval(loadingTimer);
  document.getElementById('loading').classList.remove('show');
}

function updateBadge() {
  document.getElementById('recipe-count').textContent = recipes.length;
}

// ═══════════════════════════════════════════════════════════════
//  API KEY (Mistral)
// ═══════════════════════════════════════════════════════════════
function getApiKey() { return localStorage.getItem('recettai_apikey') || ''; }

function saveApiKey() {
  const val = document.getElementById('api-key-input').value.trim();
  if (!val) { toast('Veuillez saisir une clé API.', 'error'); return; }
  localStorage.setItem('recettai_apikey', val);
  setApiStatus('✅ Clé Mistral enregistrée.', true);
  toast('Clé API enregistrée !', 'success');
}

function loadApiKeyStatus() {
  const key = getApiKey();
  if (key) {
    const el = document.getElementById('api-key-input');
    if (el) el.value = key;
    setApiStatus('✅ Clé API configurée.', true);
  }
}

function setApiStatus(msg, ok) {
  const el = document.getElementById('api-key-status');
  if (el) { el.textContent = msg; el.className = 'api-key-status ' + (ok ? 'ok' : 'err'); }
}

function toggleKeyVis() {
  const inp = document.getElementById('api-key-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ═══════════════════════════════════════════════════════════════
//  MISTRAL API
// ═══════════════════════════════════════════════════════════════
async function callMistral(prompt) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('NO_KEY');
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: 'mistral-large-latest', temperature: 0.2,
      messages: [
        { role: 'system', content: 'Tu es un expert en extraction de recettes culinaires. Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans explication, sans backticks.' },
        { role: 'user',   content: prompt },
      ],
    }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.message || 'HTTP ' + res.status); }
  return (await res.json()).choices[0].message.content;
}

function buildPrompt(type, input) {
  let ctx = type === 'web' ? "Lien page web de recette : " + input + "\nGénère la recette correspondante."
          :                       "Texte de recette :\n\n" + input;
  const src = type !== 'text' ? '"' + input + '"' : 'null';
  return ctx + `

Retourne UNIQUEMENT ce JSON (sans markdown ni backticks) :
{
  "title": "Titre",
  "category": "Viande",
  "servings": 4,
  "source": ${src},
  "ingredient_sections": [
    {"label": "Pour la sauce", "ingredients": [{"qty":"2 càs","name":"sauce soja"}]},
    {"label": "Pour la garniture", "ingredients": [{"qty":"200g","name":"pâtes"}]}
  ],
  "steps": ["Étape 1."],
  "tags": ["asiatique","rapide","hiver"],
  "nutrition": {"kcal": 450, "proteines": 25, "glucides": 50, "lipides": 15}
}

Règles :
- category = Viande|Poisson|Dessert|Cocktail|Entrée uniquement
- ingredient_sections : si la recette a plusieurs groupes d'ingrédients (ex: "Pour la marinade", "Pour la sauce", "Pour les boulettes"), crée une section par groupe avec un "label" descriptif. Si tous les ingrédients sont au même niveau, utilise une seule section avec "label": "Ingrédients".
- Le champ "ingredients" de la recette (liste plate) NE doit PAS être présent — utiliser uniquement "ingredient_sections".
- Quantités : toujours écrire "càs" (jamais "cuillère à soupe", "c. à soupe", "c.à.s", "cs") et "càc" (jamais "cuillère à café", "c. à café", "c.à.c", "cc").
- tags : tableau de 2 à 5 tags pertinents parmi ces catégories :
  * Cuisine : français, italien, asiatique, méditerranéen, américain, mexicain, indien, japonais, thaï, libanais
  * Saison : printemps, été, automne, hiver
  * Occasion : rapide, festif, comfort food, barbecue, apéro, brunch, batch cooking
  * Régime : végétarien, sans gluten, léger
- nutrition : estimation par personne (pour 1 part, pas pour toute la recette) à partir des ingrédients et quantités :
  * kcal = calories totales estimées
  * proteines, glucides, lipides = grammes estimés
  Donne ta meilleure estimation raisonnable, même approximative — ne mets jamais null.
  Ne jamais inventer d'informations absentes du contenu fourni pour le reste de la recette.`;
}

function parseJSON(text) {
  const c = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(c); } catch {}
  const m = c.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  ANALYZE
// ═══════════════════════════════════════════════════════════════
async function analyzeRecipe() {
  if (!getApiKey()) { toast("⚙️ Configurez votre clé Mistral dans les Paramètres.", 'error'); showPage('settings'); return; }
  let input = currentTab === 'web' ? document.getElementById('web-url').value.trim()
            :                        document.getElementById('recipe-text').value.trim();
  if (!input) { toast('Veuillez saisir un contenu à analyser.', 'error'); return; }

  showLoading();
  document.getElementById('analyze-btn').disabled = true;
  document.getElementById('recipe-result').classList.remove('show');

  try {
    const raw    = await callMistral(buildPrompt(currentTab, input));
    const recipe = parseJSON(raw);
    if (!recipe || !recipe.title) throw new Error('Réponse invalide');
    editingId = null;
    baseServings    = recipe.servings || 4;
    baseIngredients = JSON.parse(JSON.stringify(flatIngredients(recipe)));
    renderResultCard(recipe);
    document.getElementById('recipe-result').classList.add('show');
    document.getElementById('recipe-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('✅ Recette analysée !', 'success');
  } catch (err) {
    console.error('[Mistral]', err);
    if (err.message === 'NO_KEY') { toast('⚙️ Clé API manquante.', 'error'); showPage('settings'); }
    else if (/401|unauthorized/i.test(err.message)) { toast('❌ Clé Mistral refusée.', 'error'); showPage('settings'); }
    else toast('❌ ' + err.message, 'error');
  } finally {
    hideLoading();
    document.getElementById('analyze-btn').disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  RENDER RESULT CARD
// ═══════════════════════════════════════════════════════════════
let currentValidated = false;
let currentNutrition = null;

function renderResultCard(recipe) {
  document.getElementById('result-title').value = recipe.title || '';
  const cat = recipe.category || 'Entrée';
  const badge = document.getElementById('result-cat-badge');
  badge.textContent = cat;
  badge.className   = 'recipe-category-badge ' + catClass(cat);
  document.getElementById('result-servings').value = recipe.servings || 4;
  // Champ source
  const srcInput = document.getElementById('result-source-input');
  if (srcInput) srcInput.value = recipe.source || '';
  // Champ image
  const imgInput = document.getElementById('result-image-input');
  if (imgInput) {
    imgInput.value = recipe.photo || '';
    previewImage(recipe.photo || '');
  }
  // Validation
  currentValidated = !!recipe.validated;
  updateValidateBtn();
  // Nutrition
  currentNutrition = recipe.nutrition || null;
  renderNutrition(currentNutrition);
  // Tags
  renderTagsEditor(recipe.tags || []);
  // Support ingredient_sections (nouveau format) ou ingredients (ancien format)
  const sections = recipe.ingredient_sections && recipe.ingredient_sections.length
    ? recipe.ingredient_sections
    : [{ label: 'Ingrédients', ingredients: recipe.ingredients || [] }];
  renderIngredientSections('result-ingredients', sections);
  renderSteps('result-steps', recipe.steps || []);
}

function toggleValidation() {
  currentValidated = !currentValidated;
  updateValidateBtn();
}

function updateValidateBtn() {
  const btn = document.getElementById('validate-btn');
  if (!btn) return;
  if (currentValidated) {
    btn.textContent = '✅';
    btn.classList.add('validated');
  } else {
    btn.textContent = '⚪';
    btn.classList.remove('validated');
  }
}

function renderNutrition(nutrition) {
  const section = document.getElementById('nutrition-section');
  const values  = document.getElementById('nutrition-values');
  if (!section || !values) return;
  if (!nutrition) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  values.innerHTML = `
    <div class="nutrition-chip"><span class="nv">${nutrition.kcal ?? '—'}</span><span class="nl">kcal</span></div>
    <div class="nutrition-chip"><span class="nv">${nutrition.proteines ?? '—'}g</span><span class="nl">Protéines</span></div>
    <div class="nutrition-chip"><span class="nv">${nutrition.glucides ?? '—'}g</span><span class="nl">Glucides</span></div>
    <div class="nutrition-chip"><span class="nv">${nutrition.lipides ?? '—'}g</span><span class="nl">Lipides</span></div>
  `;
}

function catClass(cat) {
  return ({ Viande:'cat-viande', Poisson:'cat-poisson', Dessert:'cat-dessert', Cocktail:'cat-cocktail', 'Entrée':'cat-entree' })[cat] || 'cat-entree';
}

// Aperçu de l'image en temps réel
function previewImage(url) {
  const wrap = document.getElementById('image-preview-wrap');
  const img  = document.getElementById('image-preview');
  if (!wrap || !img) return;
  if (url && url.startsWith('http')) {
    img.src = url;
    img.onerror = () => { wrap.style.display = 'none'; };
    img.onload  = () => { wrap.style.display = 'block'; };
  } else {
    wrap.style.display = 'none';
  }
}

// Photos supprimées — source URL à la place

// ═══════════════════════════════════════════════════════════════
//  INGREDIENTS / STEPS
// ═══════════════════════════════════════════════════════════════
// ─── INGREDIENT SECTIONS ────────────────────────────────────────
// Un "ingredient_sections" = [{label, ingredients:[{qty,name}]}]
// Rendu : pour chaque section, un titre + une liste d'items

function renderIngredientSections(containerId, sections) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  (sections || []).forEach((sec, si) => {
    // Titre de section
    const header = document.createElement('div');
    header.className = 'ing-section-header';
    header.innerHTML =
      '<input class="editable-field ing-section-label" data-si="' + si + '" placeholder="Nom de la préparation (ex: Pour la sauce)" value="' + esc(sec.label||'') + '">' +
      '<button class="delete-item-btn" title="Supprimer cette section" onclick="this.closest(\'.ing-section\').remove()">✕</button>';
    // Liste d'ingrédients
    const ul = document.createElement('ul');
    ul.className = 'ingredient-list ing-section-list';
    (sec.ingredients || []).forEach(ing => appendIngRow(ul, ing.qty||'', ing.name||''));
    // Bouton ajouter
    const addBtn = document.createElement('button');
    addBtn.className = 'add-item-btn';
    addBtn.textContent = '+ Ingrédient';
    addBtn.onclick = () => { appendIngRow(ul, '', ''); ul.lastChild.querySelectorAll('input')[1].focus(); };
    // Wrapper
    const wrap = document.createElement('div');
    wrap.className = 'ing-section';
    wrap.appendChild(header);
    wrap.appendChild(ul);
    wrap.appendChild(addBtn);
    container.appendChild(wrap);
  });
}

function addIngredientSection(containerId) {
  const container = document.getElementById(containerId);
  const si = container.querySelectorAll('.ing-section').length;
  const header = document.createElement('div');
  header.className = 'ing-section-header';
  header.innerHTML =
    '<input class="editable-field ing-section-label" data-si="' + si + '" placeholder="Nom de la préparation (ex: Pour la sauce)" value="">' +
    '<button class="delete-item-btn" title="Supprimer cette section" onclick="this.closest(\'.ing-section\').remove()">✕</button>';
  const ul = document.createElement('ul');
  ul.className = 'ingredient-list ing-section-list';
  const addBtn = document.createElement('button');
  addBtn.className = 'add-item-btn';
  addBtn.textContent = '+ Ingrédient';
  addBtn.onclick = () => { appendIngRow(ul, '', ''); ul.lastChild.querySelectorAll('input')[1].focus(); };
  const wrap = document.createElement('div');
  wrap.className = 'ing-section';
  wrap.appendChild(header);
  wrap.appendChild(ul);
  wrap.appendChild(addBtn);
  container.appendChild(wrap);
  header.querySelector('input').focus();
}

// Compat : ancienne API plate → convertie en section unique
function renderIngredients(listId, ings) {
  renderIngredientSections(listId, [{ label: 'Ingrédients', ingredients: ings.map(i => typeof i === 'object' ? i : { qty: '', name: i }) }]);
}

function appendIngRow(list, qty, name) {
  const li = document.createElement('li');
  li.className = 'ingredient-item';
  li.innerHTML = '<input class="editable-field" style="width:70px;flex:none" placeholder="Qté" value="' + esc(qty) + '"><input class="editable-field" placeholder="Ingrédient" value="' + esc(name) + '"><button class="delete-item-btn" onclick="this.closest(\'li\').remove()">✕</button>';
  list.appendChild(li);
}

function addIngredient(containerId) {
  // Ajouter dans la dernière section existante, ou créer une section
  const container = document.getElementById(containerId);
  let lastList = container.querySelector('.ing-section:last-child .ing-section-list');
  if (!lastList) { addIngredientSection(containerId); lastList = container.querySelector('.ing-section:last-child .ing-section-list'); }
  appendIngRow(lastList, '', '');
  lastList.lastChild.querySelectorAll('input')[1].focus();
}

// Collecte toutes les sections depuis le DOM
function collectIngredientSections(containerId) {
  const container = document.getElementById(containerId);
  const sections = [];
  container.querySelectorAll('.ing-section').forEach(sec => {
    const label = (sec.querySelector('.ing-section-label')?.value || '').trim() || 'Ingrédients';
    const ingredients = [];
    sec.querySelectorAll('.ingredient-item').forEach(li => {
      const ins = li.querySelectorAll('input');
      const qty = ins[0] ? ins[0].value.trim() : '';
      const name = ins[1] ? ins[1].value.trim() : '';
      if (name) ingredients.push({ qty, name });
    });
    if (ingredients.length) sections.push({ label, ingredients });
  });
  return sections;
}

// Liste plate de tous les ingrédients (pour la liste de courses)
function flatIngredients(recipe) {
  if (recipe.ingredient_sections && recipe.ingredient_sections.length) {
    return recipe.ingredient_sections.flatMap(s => s.ingredients || []);
  }
  return recipe.ingredients || [];
}

function renderSteps(listId, steps) {
  const list = document.getElementById(listId);
  list.innerHTML = '';
  steps.forEach((s, i) => appendStepRow(list, s, i + 1));
}
function appendStepRow(list, text, num) {
  const li = document.createElement('li');
  li.className = 'step-item';
  li.innerHTML = '<span class="step-num">' + num + '</span><textarea class="step-textarea" rows="2" oninput="autoResize(this)">' + esc(text) + '</textarea><button class="delete-item-btn" onclick="this.closest(\'li\').remove();renumber(this.closest(\'ol\'))">✕</button>';
  list.appendChild(li);
  setTimeout(() => autoResize(li.querySelector('textarea')), 10);
}
function addStep(listId) {
  const list = document.getElementById(listId);
  appendStepRow(list, '', list.querySelectorAll('li').length + 1);
  list.lastChild.querySelector('textarea').focus();
}
function renumber(list) { list.querySelectorAll('.step-num').forEach((el, i) => el.textContent = i + 1); }
function autoResize(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

// ═══════════════════════════════════════════════════════════════
//  SERVINGS RECALC
// ═══════════════════════════════════════════════════════════════
function recalcServings() {
  const newVal = parseInt(document.getElementById('result-servings').value) || baseServings;
  if (!baseServings) return;
  const ratio = newVal / baseServings;
  // Flat list of base ingredients (from all sections)
  const allBase = baseIngredients; // kept as flat array for ratio calc
  document.querySelectorAll('#result-ingredients .ingredient-item').forEach((item, i) => {
    const base = allBase[i];
    if (!base) return;
    const inp = item.querySelectorAll('input')[0];
    if (inp) inp.value = scaleQty(base.qty || '', ratio);
  });
}
function scaleQty(qty, ratio) {
  if (!qty) return qty;
  return qty.replace(/[\d.,]+/g, m => {
    const n = parseFloat(m.replace(',', '.'));
    if (isNaN(n)) return m;
    const r = n * ratio;
    return r % 1 === 0 ? String(r) : String(Math.round(r * 10) / 10);
  });
}

// ═══════════════════════════════════════════════════════════════
//  TAGS
// ═══════════════════════════════════════════════════════════════
function renderTagsEditor(tags) {
  const container = document.getElementById('result-tags-container');
  if (!container) return;
  container.innerHTML = '';
  (tags || []).forEach(tag => container.appendChild(createTagChip(tag, true)));
}

function createTagChip(tag, editable) {
  const chip = document.createElement('span');
  const slug = tag.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-');
  chip.className = 'tag-chip tag-' + slug;
  chip.dataset.tag = tag;
  chip.innerHTML = esc(tag) + (editable
    ? '<button class="tag-remove" onclick="removeTag(this)" title="Supprimer">✕</button>'
    : '');
  return chip;
}

function removeTag(btn) {
  btn.closest('.tag-chip').remove();
}

function addTagManual() {
  const tag = prompt('Nom du tag :');
  if (!tag || !tag.trim()) return;
  const container = document.getElementById('result-tags-container');
  if (!container) return;
  // Check not duplicate
  const existing = Array.from(container.querySelectorAll('.tag-chip')).map(c => c.dataset.tag.toLowerCase());
  if (existing.includes(tag.trim().toLowerCase())) { alert('Ce tag existe déjà.'); return; }
  container.appendChild(createTagChip(tag.trim(), true));
}

function collectTags() {
  const container = document.getElementById('result-tags-container');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.tag-chip')).map(c => c.dataset.tag);
}

// ═══════════════════════════════════════════════════════════════
//  SEARCH & FILTERS
// ═══════════════════════════════════════════════════════════════
function applyFilters() {
  searchQuery = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.style.display = searchQuery ? 'block' : 'none';
  renderRecipes();
}

function clearSearch() {
  const inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  searchQuery = '';
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  renderRecipes();
}

function setCatFilter(cat, btn) {
  currentFilter = cat;
  document.querySelectorAll('#cat-filters .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderRecipes();
}

function setTagFilter(tag, btn) {
  if (currentTagFilter === tag) {
    // Toggle off
    currentTagFilter = '';
    document.querySelectorAll('#tag-filters .filter-btn').forEach(b => b.classList.remove('tag-active'));
  } else {
    currentTagFilter = tag;
    document.querySelectorAll('#tag-filters .filter-btn').forEach(b => b.classList.remove('tag-active'));
    btn.classList.add('tag-active');
  }
  renderRecipes();
}

function renderTagFilterBar() {
  // Collect all unique tags from all recipes
  const tagCounts = {};
  recipes.forEach(r => (r.tags || []).forEach(t => {
    tagCounts[t] = (tagCounts[t] || 0) + 1;
  }));
  const tags = Object.entries(tagCounts).sort((a,b) => b[1]-a[1]).map(e => e[0]);

  const section = document.getElementById('tag-filter-section');
  const bar     = document.getElementById('tag-filters');
  if (!section || !bar) return;

  if (!tags.length) { section.style.display = 'none'; return; }
  section.style.display = 'flex';

  bar.innerHTML = tags.map(tag => {
    const slug    = tag.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-');
    const active  = currentTagFilter === tag ? ' tag-active' : '';
    return '<button class="filter-btn' + active + '" onclick="setTagFilter(\'' + esc(tag) + '\',this)">' + esc(tag) + ' <span style="opacity:.6;font-size:.7rem">(' + tagCounts[tag] + ')</span></button>';
  }).join('');
}

function getFilteredRecipes() {
  return recipes.filter(r => {
    // Category filter
    if (currentFilter !== 'all' && r.category !== currentFilter) return false;
    // Tag filter
    if (currentTagFilter && !(r.tags || []).includes(currentTagFilter)) return false;
    // Search
    if (searchQuery) {
      const haystack = [
        r.title,
        r.category,
        ...(r.tags || []),
        ...(r.ingredients || []).map(i => i.name),
      ].join(' ').toLowerCase();
      // Support multi-word search
      const words = searchQuery.split(/\s+/);
      if (!words.every(w => haystack.includes(w))) return false;
    }
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════
//  COLLECT RECIPE
// ═══════════════════════════════════════════════════════════════
function collectRecipe() {
  const title    = document.getElementById('result-title').value.trim();
  const servings = parseInt(document.getElementById('result-servings').value) || 4;
  const srcInput = document.getElementById('result-source-input');
  const source   = srcInput ? srcInput.value.trim() : '';
  const category = document.getElementById('result-cat-badge').textContent.trim();
  const imgInput = document.getElementById('result-image-input');
  const photo    = imgInput ? imgInput.value.trim() : '';
  const ingredient_sections = collectIngredientSections('result-ingredients');
  // Compat : garder un champ "ingredients" plat pour la recherche et la liste de courses
  const ingredients = ingredient_sections.flatMap(s => s.ingredients);
  const steps = [];
  document.querySelectorAll('#result-steps .step-item').forEach(li => {
    const t = li.querySelector('textarea');
    if (t && t.value.trim()) steps.push(t.value.trim());
  });
  const tags = collectTags();
  return {
    id: editingId || Date.now(), title, category, servings, source, photo,
    ingredient_sections, ingredients, steps, tags,
    validated: currentValidated,
    nutrition: currentNutrition,
    base_servings: servings,
    base_ingredients: JSON.parse(JSON.stringify(ingredients)),
    created_at: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
//  SAVE
// ═══════════════════════════════════════════════════════════════
async function saveRecipe() {
  if (!gistReady) {
    toast('⚠️ GitHub Gist non configuré. Allez dans Paramètres.', 'error');
    showPage('settings');
    return;
  }
  const recipe = collectRecipe();
  if (!recipe.title) { toast('Veuillez saisir un titre.', 'error'); return; }

  try {
    const idx = recipes.findIndex(r => r.id === recipe.id);
    if (idx >= 0) recipes[idx] = recipe;
    else recipes.push(recipe);

    await persistToGist();
    updateBadge();

    if (editingId) {
      editingId = null;
      toast('✅ Recette mise à jour !', 'success');
      showPage('recipes');
    } else {
      toast('✅ Recette enregistrée !', 'success');
    }
  } catch (err) {
    console.error('[saveRecipe]', err);
    // Rollback en mémoire
    recipes = recipes.filter(r => r.id !== recipe.id);
    toast('❌ Erreur sauvegarde : ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
//  RENDER RECIPES
// ═══════════════════════════════════════════════════════════════
function renderRecipes() {
  const grid = document.getElementById('recipes-grid');
  renderTagFilterBar();

  const list = getFilteredRecipes();
  const total = recipes.length;
  const label = document.getElementById('recipes-count-label');
  if (label) label.textContent = list.length < total
    ? '(' + list.length + ' / ' + total + ')'
    : '(' + total + ')';

  if (!list.length) {
    grid.innerHTML = (recipes.length
      ? '<div class="empty-state"><div class="empty-icon">🔍</div><h3>Aucun résultat</h3><p>Essayez d\'autres mots-clés ou tags.</p></div>'
      : '<div class="empty-state"><div class="empty-icon">🍳</div><h3>Aucune recette ici</h3><p>Analysez votre première recette pour commencer !</p></div>');
    return;
  }
  grid.innerHTML = list.map(r =>
    '<div class="recipe-thumb" onclick="openRecipe(' + r.id + ')">' +
    '<div class="thumb-photo">' +
      (r.photo
        ? '<img src="' + esc(r.photo) + '" alt="' + esc(r.title) + '" onerror="this.style.display=\'none\'">' 
        : '<span>' + (CAT_EMOJIS[r.category]||'🍽️') + '</span>') +
    '</div>' +
    '<div class="thumb-body"><div class="thumb-category">' + (CAT_ICONS[r.category]||'🍽️') + ' ' + esc(r.category) + '</div>' +
    '<div class="thumb-title">' + esc(r.title) + (r.validated ? ' ✅' : '') + '</div>' +
    '<div class="thumb-meta"><span>👥 ' + r.servings + ' pers.</span><span>📋 ' + (r.ingredients||[]).length + ' ingr.</span></div>' +
    ((r.tags||[]).length ? '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">' + (r.tags||[]).slice(0,3).map(t => '<span style="font-size:.68rem;padding:2px 7px;background:var(--cream);border:1px solid var(--stone);border-radius:99px;color:var(--muted)">' + esc(t) + '</span>').join('') + '</div>' : '') +
    '</div>' +
    '<div class="thumb-actions" onclick="event.stopPropagation()">' +
    '<button class="thumb-btn" onclick="editRecipe(' + r.id + ')">✏️ Modifier</button>' +
    '<button class="thumb-btn" onclick="exportSinglePDF(' + r.id + ')">📄 PDF</button>' +
    '<button class="thumb-btn danger" onclick="deleteRecipe(' + r.id + ')">🗑️</button></div></div>'
  ).join('');
}

// filterRecipes replaced by setCatFilter

// ═══════════════════════════════════════════════════════════════
//  OPEN / EDIT / DELETE
// ═══════════════════════════════════════════════════════════════
function openRecipe(id) {
  const r = recipes.find(x => x.id == id);
  if (!r) return;
  document.getElementById('view-modal-body').innerHTML = buildViewHTML(r);
  document.getElementById('view-modal').classList.add('show');
}

function buildViewHTML(r) {
  const ingSections = r.ingredient_sections && r.ingredient_sections.length
    ? r.ingredient_sections
    : [{ label: 'Ingrédients', ingredients: r.ingredients || [] }];
  const ings = ingSections.map(sec =>
    (ingSections.length > 1 ? '<li style="list-style:none;font-weight:700;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--terracotta);padding:8px 0 4px;border-top:1px solid var(--stone);margin-top:4px">' + esc(sec.label) + '</li>' : '') +
    (sec.ingredients || []).map(i => '<li class="ingredient-item"><span style="color:var(--gold);font-size:.6rem;flex-shrink:0">●</span><span style="font-size:.9rem">' + esc(i.qty) + ' ' + esc(i.name) + '</span></li>').join('')
  ).join('');
  const steps = (r.steps||[]).map((s,i) => '<li class="step-item"><span class="step-num">' + (i+1) + '</span><span style="font-size:.9rem;line-height:1.5">' + esc(s) + '</span></li>').join('');
  return '<div style="background:var(--ink);padding:1.5rem;border-radius:var(--radius-sm);color:white;margin:-1.5rem -1.5rem 1.5rem">' +
    '<span class="recipe-category-badge ' + catClass(r.category) + '" style="margin-bottom:.5rem">' + esc(r.category) + '</span>' +
    '<h2 style="font-family:\'Playfair Display\',serif;font-size:1.6rem;margin-bottom:.3rem">' + esc(r.title) + (r.validated ? ' ✅' : '') + '</h2>' +
    '<div style="font-size:.85rem;opacity:.7">👥 ' + r.servings + ' personnes</div></div>' +
    (r.photo ? '<img src="' + esc(r.photo) + '" alt="' + esc(r.title) + '" onerror="this.style.display=\'none\'" style="width:100%;height:240px;object-fit:cover;border-radius:var(--radius-sm);margin-bottom:1.5rem">' : '') +
    (r.source ? '<div style="margin-bottom:1rem"><a href="' + esc(r.source) + '" target="_blank" rel="noopener" style="font-size:.82rem;color:var(--terracotta);word-break:break-all">🔗 ' + esc(r.source) + '</a></div>' : '') +
    (r.nutrition ? '<div style="display:flex;gap:1.5rem;margin-bottom:1.25rem;padding:.75rem 1rem;background:var(--cream);border-radius:var(--radius-sm)">' +
      '<div class="nutrition-chip"><span class="nv">' + (r.nutrition.kcal ?? '—') + '</span><span class="nl">kcal</span></div>' +
      '<div class="nutrition-chip"><span class="nv">' + (r.nutrition.proteines ?? '—') + 'g</span><span class="nl">Protéines</span></div>' +
      '<div class="nutrition-chip"><span class="nv">' + (r.nutrition.glucides ?? '—') + 'g</span><span class="nl">Glucides</span></div>' +
      '<div class="nutrition-chip"><span class="nv">' + (r.nutrition.lipides ?? '—') + 'g</span><span class="nl">Lipides</span></div>' +
    '</div>' : '') +
    ((r.tags||[]).length ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:1.25rem">' + (r.tags||[]).map(t => '<span class="tag-chip">' + esc(t) + '</span>').join('') + '</div>' : '') +
    '<div style="margin-bottom:1.5rem"><div class="section-title">Ingrédients</div><ul class="ingredient-list">' + ings + '</ul></div>' +
    '<div><div class="section-title">Étapes</div><ol class="step-list">' + steps + '</ol></div>' +

    '<div style="margin-top:1.5rem;display:flex;gap:.75rem;flex-wrap:wrap"><button class="btn-primary" onclick="exportSinglePDF(' + r.id + ')">📄 PDF</button><button class="btn-secondary" onclick="editRecipe(' + r.id + ');closeModal(\'view-modal\')">✏️ Modifier</button></div>';
}

function editRecipe(id) {
  const r = recipes.find(x => x.id == id);
  if (!r) return;
  editingId = id;
  baseServings    = r.base_servings || r.servings;
  baseIngredients = JSON.parse(JSON.stringify(r.base_ingredients || flatIngredients(r)));
  showPage('home');
  renderResultCard(r);
  document.getElementById('recipe-result').classList.add('show');
  document.getElementById('recipe-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteRecipe(id) {
  if (!confirm('Supprimer cette recette ?')) return;
  const prev = [...recipes];
  recipes = recipes.filter(r => r.id != id);
  try {
    await persistToGist();
    updateBadge();
    renderRecipes();
    toast('Recette supprimée.', '');
  } catch (err) {
    recipes = prev; // rollback
    toast('Erreur suppression : ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
//  MODALS
// ═══════════════════════════════════════════════════════════════
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function bgClose(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }

// ═══════════════════════════════════════════════════════════════
//  SHOPPING LIST
// ═══════════════════════════════════════════════════════════════
function renderShoppingSelector() {
  const list = document.getElementById('shopping-recipe-list');
  if (!recipes.length) { list.innerHTML = '<div style="padding:1.5rem;color:var(--muted);font-size:.9rem;text-align:center">Aucune recette enregistrée</div>'; return; }
  list.innerHTML = recipes.map(r =>
    '<div class="selector-item" onclick="toggleShopping(' + r.id + ',this)">' +
    '<input type="checkbox" ' + (shoppingSelected.has(r.id) ? 'checked' : '') + ' onclick="event.stopPropagation()">' +
    '<div><div class="selector-item-title">' + esc(r.title) + '</div><div class="selector-item-cat">' + r.category + ' · ' + r.servings + ' pers.</div></div></div>'
  ).join('');
}
function toggleShopping(id, el) {
  const cb = el.querySelector('input');
  if (shoppingSelected.has(id)) { shoppingSelected.delete(id); cb.checked = false; }
  else { shoppingSelected.add(id); cb.checked = true; }
}
// Parse une quantité textuelle en {valeur numérique, unité, reste}
// Exemples : "200g" -> {value:200, unit:'g'}, "2" -> {value:2, unit:''}, "1 cuillère à soupe" -> {value:1, unit:'cuillère à soupe'}
function parseQty(qty) {
  if (!qty) return { value: null, unit: '', raw: '' };
  const str = qty.trim();
  const m = str.match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return { value: null, unit: '', raw: str };
  const value = parseFloat(m[1].replace(',', '.'));
  const unit  = m[2].trim().toLowerCase();
  if (isNaN(value)) return { value: null, unit: '', raw: str };
  return { value, unit, raw: str };
}

function formatQty(value, unit) {
  const v = value % 1 === 0 ? value : Math.round(value * 10) / 10;
  return unit ? v + (unit.match(/^[a-zA-Zàâéèêîïôû%]/) ? ' ' : '') + unit : String(v);
}

function categorizeIngredient(name) {
  const low = name.toLowerCase();
  for (const [cat, kws] of SHOPPING_CATS_ORDERED) {
    if (kws.some(k => low.includes(k))) return cat;
  }
  return 'Épicerie sucrée & sèche';
}

let lastShoppingList = null; // gardé en mémoire pour le bouton copier

async function generateShoppingList() {
  const selected = recipes.filter(r => shoppingSelected.has(r.id));
  if (!selected.length) { toast('Sélectionnez au moins une recette.', 'error'); return; }

  // Construire la liste brute de tous les ingrédients (avec source recette)
  const rawLines = [];
  selected.forEach(r => {
    flatIngredients(r).forEach(ing => {
      if (ing.name) rawLines.push((ing.qty ? ing.qty + ' ' : '') + ing.name);
    });
  });

  const resultEl = document.getElementById('shopping-list-result');
  resultEl.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">✨ Optimisation par l\'IA en cours…</div>';

  // Si pas de clé Mistral, fallback mode local
  if (!getApiKey()) {
    toast('⚙️ Clé Mistral manquante — génération locale.', '');
    generateShoppingListLocal(selected);
    return;
  }

  const shoppingPrompt = `Tu es un expert en organisation de listes de courses.

Ta mission est de corriger, dédupliquer et réorganiser la liste de courses que je vais te fournir.

Respecte impérativement les règles suivantes :

1. Classement des ingrédients

Chaque ingrédient doit être placé dans la bonne catégorie, même si la recette l'a classé au mauvais endroit.

Utilise uniquement ces catégories :

- 🥩 Viandes & Charcuterie
- 🐟 Poissons & Fruits de mer
- 🥛 Produits laitiers & Œufs
- 🥦 Fruits & Légumes
- 🌾 Épicerie sèche
- 🧂 Épices, Herbes & Condiments
- 🥫 Conserves
- 🧊 Surgelés
- 🥤 Boissons
- 🍞 Boulangerie (si nécessaire)
- 📦 Autres (uniquement si aucune autre catégorie ne convient)

Exemples :
- ail → Fruits & Légumes
- échalote → Fruits & Légumes
- oignon → Fruits & Légumes
- gingembre frais → Fruits & Légumes
- gingembre en poudre → Épices, Herbes & Condiments
- persil, coriandre, basilic, ciboulette, aneth → Épices, Herbes & Condiments
- huile d'olive → Épices, Herbes & Condiments
- sauce soja → Épices, Herbes & Condiments
- moutarde → Épices, Herbes & Condiments
- miel → Épices, Herbes & Condiments
- chapelure → Épicerie sèche
- farine → Épicerie sèche

Ne conserve jamais un ingrédient dans une mauvaise catégorie.

2. Fusion des doublons

Fusionne automatiquement tous les ingrédients identiques, même lorsqu'ils sont écrits différemment.
Additionne les quantités lorsqu'elles utilisent la même unité. Si plusieurs unités sont présentes (g, ml, càs, càc...), les conserver lorsqu'elles ne sont pas convertibles facilement.

3. Ignorer les précisions de recette

Supprime les mentions comme : pour la sauce, pour les boulettes, pour la marinade, pour la décoration, pour servir, facultatif, recommandé, au choix, pour l'accompagnement.

4. Normalisation

Uniformise les noms :
- gousse d'ail → ail
- ail haché → ail
- persil frais → persil
- coriandre fraîche → coriandre
- huile d'olive extra vierge → huile d'olive
- sauce soja salée → sauce soja
- sauce soja sucrée → sauce soja

Conserve uniquement le nom le plus simple.

5. Addition des quantités

Additionne toutes les quantités identiques.
Exemples : 2 œufs + 4 œufs = 6 œufs, 100g beurre + 30g beurre = 130g beurre
Si les unités sont incompatibles (g et cuillères), ne fais pas de conversion approximative et conserve les deux valeurs.

6. Tri

Dans chaque catégorie : classer les ingrédients par ordre alphabétique ; ne jamais afficher deux fois le même ingrédient.

7. Format de sortie STRICT

Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks, sans explication.
Format :
[
  {
    "cat": "🥩 Viandes & Charcuterie",
    "items": [
      {"qty": "500g", "name": "boeuf haché"},
      {"qty": "", "name": "lardons"}
    ]
  },
  ...
]
N'inclure que les catégories qui ont au moins un ingrédient.

Voici la liste d'ingrédients à traiter :
${rawLines.join('\n')}`;

  try {
    const raw = await callMistral(shoppingPrompt);
    const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(clean);

    lastShoppingList = parsed.map(sec => ({
      cat: sec.cat,
      items: (sec.items || []).map(i => ({ name: i.name, qtyDisplay: i.qty || '' })),
    }));

    resultEl.innerHTML = lastShoppingList.map(({ cat, items }) =>
      '<div class="shopping-cat-section"><div class="shopping-cat-title">' + esc(cat) + '</div>' +
      items.map(item => '<div class="shopping-item"><input type="checkbox" onchange="this.closest(\'.shopping-item\').classList.toggle(\'checked\',this.checked)"><label>' + (item.qtyDisplay ? esc(item.qtyDisplay) + ' ' : '') + esc(item.name) + '</label></div>').join('') + '</div>'
    ).join('');

    toast('✅ Liste optimisée par l\'IA !', 'success');
  } catch (err) {
    console.error('[shopping AI]', err);
    toast('⚠️ Erreur IA, génération locale utilisée.', '');
    generateShoppingListLocal(selected);
  }
}

// Fallback local (si pas de clé ou erreur Mistral)
function generateShoppingListLocal(selected) {
  const agg = {};
  selected.forEach(r => flatIngredients(r).forEach(ing => {
    const key = ing.name.toLowerCase().trim();
    if (!agg[key]) agg[key] = { name: ing.name, byUnit: {}, noUnitQtys: [] };
    const parsed = parseQty(ing.qty);
    if (parsed.value !== null) {
      const unitKey = parsed.unit || '_unitless';
      agg[key].byUnit[unitKey] = (agg[key].byUnit[unitKey] || 0) + parsed.value;
    } else if (ing.qty) {
      agg[key].noUnitQtys.push(ing.qty);
    }
  }));
  const merged = Object.values(agg).map(item => {
    const parts = [];
    Object.entries(item.byUnit).forEach(([unit, total]) => parts.push(formatQty(total, unit === '_unitless' ? '' : unit)));
    parts.push(...item.noUnitQtys);
    return { name: item.name, qtyDisplay: parts.join(' + ') };
  });
  const cats = {};
  merged.forEach(item => {
    const cat = categorizeIngredient(item.name);
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(item);
  });
  const catOrder = ['Viandes & Charcuterie', 'Poissons & Fruits de mer', 'Fruits & Légumes',
                     'Produits laitiers & Œufs', 'Épices & Condiments', 'Épicerie sucrée & sèche'];
  lastShoppingList = catOrder
    .filter(c => cats[c] && cats[c].length)
    .map(c => ({ cat: c, items: cats[c].sort((a,b) => a.name.localeCompare(b.name)) }));
  document.getElementById('shopping-list-result').innerHTML = lastShoppingList.map(({cat, items}) =>
    '<div class="shopping-cat-section"><div class="shopping-cat-title">' + cat + '</div>' +
    items.map(item => '<div class="shopping-item"><input type="checkbox" onchange="this.closest(\'.shopping-item\').classList.toggle(\'checked\',this.checked)"><label>' + (item.qtyDisplay ? esc(item.qtyDisplay) + ' ' : '') + esc(item.name) + '</label></div>').join('') + '</div>'
  ).join('');
  toast('✅ Liste générée !', 'success');
}

// Copie la liste de courses formatée (texte structuré, compatible OneNote/Notes/etc.)
async function copyShoppingList() {
  if (!lastShoppingList || !lastShoppingList.length) {
    toast('Générez d\'abord une liste de courses.', 'error');
    return;
  }
  let text = '🛒 LISTE DE COURSES\n';
  text += '═'.repeat(30) + '\n\n';
  lastShoppingList.forEach(({ cat, items }) => {
    text += (cat || '').toUpperCase() + '\n';
    items.forEach(item => {
      text += '☐ ' + (item.qtyDisplay ? item.qtyDisplay + ' ' : '') + item.name + '\n';
    });
    text += '\n';
  });

  try {
    await navigator.clipboard.writeText(text.trim());
    toast('📋 Liste copiée ! Collez-la dans OneNote, Notes…', 'success');
  } catch (err) {
    // Fallback pour navigateurs/contextes sans clipboard API
    const textarea = document.createElement('textarea');
    textarea.value = text.trim();
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      toast('📋 Liste copiée !', 'success');
    } catch {
      toast('❌ Impossible de copier automatiquement.', 'error');
    }
    textarea.remove();
  }
}

// Partage natif si disponible (mobile), sinon copie
async function shareShoppingList() {
  if (!lastShoppingList || !lastShoppingList.length) {
    toast('Générez d\'abord une liste de courses.', 'error');
    return;
  }
  let text = '🛒 Liste de courses\n\n';
  lastShoppingList.forEach(({ cat, items }) => {
    text += cat.toUpperCase() + '\n';
    items.forEach(item => { text += '• ' + (item.qtyDisplay ? item.qtyDisplay + ' ' : '') + item.name + '\n'; });
    text += '\n';
  });

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Liste de courses', text: text.trim() });
    } catch (err) {
      if (err.name !== 'AbortError') copyShoppingList();
    }
  } else {
    copyShoppingList();
  }
}

// ═══════════════════════════════════════════════════════════════
//  PLANNER
// ═══════════════════════════════════════════════════════════════
function renderPlanner() {
  document.getElementById('planner-grid').innerHTML = DAYS.map((day, di) =>
    '<div class="planner-day"><div class="planner-day-header ' + (di>=5?'weekend':'') + '">' + day + '</div>' +
    MEALS.map(meal => '<div class="planner-slot"><div class="planner-slot-label">' + meal + '</div>' + getPlannerChips(day, meal) + '<button class="planner-add-btn" onclick="openPlannerModal(\'' + day + '\',\'' + meal + '\')">+ Ajouter</button></div>').join('') + '</div>'
  ).join('');
}
function getPlannerChips(day, meal) {
  return (plannerData[day+'_'+meal]||[]).map(id => {
    const r = recipes.find(x => x.id==id);
    return r ? '<div class="planner-recipe-chip" onclick="openRecipe(' + id + ')" style="cursor:pointer" title="Voir la recette"><span class="chip-title">' + esc(r.title) + '</span><button class="chip-remove" onclick="event.stopPropagation();removePlannerChip(\'' + day + '\',\'' + meal + '\',' + id + ')">✕</button></div>' : '';
  }).join('');
}

let plannerCatFilter = 'all';

function setPlannerCatFilter(cat, btn) {
  plannerCatFilter = cat;
  document.querySelectorAll('#planner-cat-filters .planner-cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPlannerRecipeList();
}

function openPlannerModal(day, meal) {
  plannerTarget = { day, meal };
  document.getElementById('planner-modal-title').textContent = day + ' · ' + meal;
  // reset search/filter each time modal opens
  const searchInput = document.getElementById('planner-search-input');
  if (searchInput) searchInput.value = '';
  plannerCatFilter = 'all';
  document.querySelectorAll('#planner-cat-filters .planner-cat-btn').forEach(b => b.classList.remove('active'));
  const allBtn = document.querySelector('#planner-cat-filters .planner-cat-btn');
  if (allBtn) allBtn.classList.add('active');
  renderPlannerRecipeList();
  document.getElementById('planner-modal').classList.add('show');
}

function renderPlannerRecipeList() {
  const list  = document.getElementById('planner-recipe-list');
  if (!list) return;
  const query = (document.getElementById('planner-search-input')?.value || '').toLowerCase().trim();

  let filtered = recipes;
  if (plannerCatFilter !== 'all') filtered = filtered.filter(r => r.category === plannerCatFilter);
  if (query) {
    const words = query.split(/\s+/);
    filtered = filtered.filter(r => {
      const haystack = [r.title, r.category, ...(r.tags||[]), ...(r.ingredients||[]).map(i=>i.name)].join(' ').toLowerCase();
      return words.every(w => haystack.includes(w));
    });
  }

  list.innerHTML = filtered.length
    ? filtered.map(r => '<div class="recipe-select-item" onclick="addToPlanner(' + r.id + ')"><span>' + (CAT_ICONS[r.category]||'🍽️') + '</span><div><div style="font-size:.9rem;font-weight:500">' + esc(r.title) + (r.validated ? ' ✅' : '') + '</div><div style="font-size:.78rem;color:var(--muted)">' + esc(r.category) + '</div></div></div>').join('')
    : '<div style="padding:1rem;color:var(--muted);font-size:.9rem;text-align:center">Aucune recette trouvée</div>';
}

function addToPlanner(id) {
  if (!plannerTarget) return;
  const key = plannerTarget.day + '_' + plannerTarget.meal;
  if (!plannerData[key]) plannerData[key] = [];
  if (!plannerData[key].includes(id)) plannerData[key].push(id);
  localStorage.setItem('recettai_planner', JSON.stringify(plannerData));
  closeModal('planner-modal');
  renderPlanner();
}
function removePlannerChip(day, meal, id) {
  const key = day + '_' + meal;
  plannerData[key] = (plannerData[key]||[]).filter(x => x!=id);
  localStorage.setItem('recettai_planner', JSON.stringify(plannerData));
  renderPlanner();
}
function clearPlanner() {
  if (!confirm('Effacer tout le planning ?')) return;
  plannerData = {};
  localStorage.setItem('recettai_planner', JSON.stringify(plannerData));
  renderPlanner();
}
function plannerToShopping() {
  const ids = new Set(Object.values(plannerData).flat());
  if (!ids.size) { toast('Aucune recette dans le planning.', 'error'); return; }
  shoppingSelected = ids;
  showPage('shopping');
  renderShoppingSelector();
  generateShoppingList();
}

// ═══════════════════════════════════════════════════════════════
//  EXPORT PDF
// ═══════════════════════════════════════════════════════════════
function exportCurrentPDF() { const r = collectRecipe(); if (!r.title) { toast('Aucune recette à exporter.', 'error'); return; } printRecipe(r); }
function exportSinglePDF(id) { const r = recipes.find(x => x.id==id); if (r) printRecipe(r); }
function printRecipe(r) {
  const win  = window.open('', '_blank');
  const pdfSections = r.ingredient_sections && r.ingredient_sections.length
    ? r.ingredient_sections
    : [{ label: null, ingredients: r.ingredients || [] }];
  const ings = pdfSections.map(sec =>
    (pdfSections.length > 1 && sec.label ? '<li style="list-style:none;font-weight:700;font-size:.82rem;text-transform:uppercase;letter-spacing:.05em;color:#C4541A;padding:8px 0 2px;margin-top:6px">' + esc(sec.label) + '</li>' : '') +
    (sec.ingredients || []).map(i => '<li>• ' + esc(i.qty) + ' ' + esc(i.name) + '</li>').join('')
  ).join('');
  const steps = (r.steps||[]).map((s,i) => '<div style="display:flex;gap:10px;margin-bottom:8px"><span style="min-width:24px;height:24px;background:#C4541A;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;flex-shrink:0">' + (i+1) + '</span><span>' + esc(s) + '</span></div>').join('');
  const nutritionHtml = r.nutrition ? '<div style="display:flex;gap:1.5rem;margin:1rem 0;padding:.75rem 1rem;background:#FAF7F2;border-radius:8px"><div><strong>' + (r.nutrition.kcal??'—') + '</strong> kcal</div><div><strong>' + (r.nutrition.proteines??'—') + 'g</strong> Protéines</div><div><strong>' + (r.nutrition.glucides??'—') + 'g</strong> Glucides</div><div><strong>' + (r.nutrition.lipides??'—') + 'g</strong> Lipides</div></div>' : '';
  win.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>' + esc(r.title) + '</title><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet"><style>body{font-family:\'DM Sans\',sans-serif;max-width:800px;margin:0 auto;padding:2rem;color:#1A1208}h1{font-family:\'Playfair Display\',serif;font-size:2rem;margin-bottom:.4rem}h2{font-family:\'Playfair Display\',serif;font-size:1.2rem;margin:1.4rem 0 .7rem;border-bottom:2px solid #F0D080;padding-bottom:.3rem}.meta{color:#8C7B68;font-size:.9rem;margin-bottom:1rem}ul{list-style:none;padding:0}li{padding:4px 0;font-size:.92rem}.cat{display:inline-block;padding:3px 10px;border-radius:99px;font-size:.75rem;font-weight:700;background:#C4541A;color:white;margin-bottom:.7rem}a{color:#C4541A;word-break:break-all}@media print{body{padding:1rem}}</style></head><body><span class="cat">' + esc(r.category) + '</span><h1>' + esc(r.title) + (r.validated ? ' ✅' : '') + '</h1><div class="meta">👥 ' + r.servings + ' personnes' + (r.source ? ' · <a href="' + esc(r.source) + '">' + esc(r.source) + '</a>' : '') + '</div>' + (r.photo ? '<img src="' + esc(r.photo) + '" style="max-width:300px;border-radius:8px;margin:1rem 0;display:block">' : '') + nutritionHtml + '<h2>Ingrédients</h2><ul>' + ings + '</ul><h2>Étapes</h2>' + steps + '</body></html>');
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

// ═══════════════════════════════════════════════════════════════
//  IMPORT / EXPORT / CLEAR
// ═══════════════════════════════════════════════════════════════
async function exportJSON() {
  const blob = new Blob([JSON.stringify(recipes, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'recettai-recettes.json';
  a.click();
  toast('📦 Export téléchargé.', 'success');
}
async function importJSON(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Format invalide');
      const existing = new Set(recipes.map(r => r.id));
      let count = 0;
      data.forEach(r => { if (!existing.has(r.id)) { recipes.push(r); count++; } });
      await persistToGist();
      updateBadge();
      toast('✅ ' + count + ' recette(s) importée(s).', 'success');
      input.value = '';
    } catch (err) { toast('Erreur : ' + err.message, 'error'); }
  };
  reader.readAsText(file);
}
async function clearAll() {
  if (!confirm('Supprimer TOUTES les recettes ? Action irréversible.')) return;
  const prev = [...recipes];
  recipes = [];
  try {
    await persistToGist();
    plannerData = {};
    localStorage.removeItem('recettai_planner');
    localStorage.removeItem('recettai_cache');
    updateBadge();
    toast('Toutes les données supprimées.', '');
  } catch (err) { recipes = prev; toast('Erreur : ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════════════════
function esc(str) {
  if (!str && str !== 0) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ═══════════════════════════════════════════════════════════════
//  MENU PIZZAS
// ═══════════════════════════════════════════════════════════════

// Détecte si une recette est une pizza
function isPizza(r) {
  const haystack = [r.title || '', ...(r.tags || []), r.category || ''].join(' ').toLowerCase();
  const ingrNames = flatIngredients(r).map(i => (i.name || '').toLowerCase()).join(' ');
  const pizzaKws = ['pizza', 'pizzas', 'napolitaine', 'margherita', 'quattro', 'calzone', 'focaccia pizza'];
  return pizzaKws.some(kw => haystack.includes(kw) || ingrNames.includes(kw));
}

// Extrait la liste de garniture (sans les bases : pâte, farine, eau, levure, sel, huile d'olive)
function getPizzaToppings(r) {
  const baseIngredients = ['farine','eau','levure','sel','huile d\'olive','huile','sucre','semoule',
    'pâte à pizza','pâte pizza','pâton','boulette de pâte','pâte brisée'];
  return flatIngredients(r)
    .map(i => (i.name || '').trim())
    .filter(name => {
      const low = name.toLowerCase();
      return name && !baseIngredients.some(b => low.includes(b));
    });
}

function renderPizzaMenu() {
  const pizzas = recipes.filter(isPizza);
  const grid   = document.getElementById('pizza-menu-grid');
  const empty  = document.getElementById('pizza-menu-empty');

  if (!pizzas.length) {
    grid.style.display  = 'none';
    empty.style.display = 'flex';
    return;
  }
  grid.style.display  = '';
  empty.style.display = 'none';

  grid.innerHTML = pizzas.map(r => {
    const toppings = getPizzaToppings(r);
    const kcal     = r.nutrition?.kcal     ?? null;
    const prot     = r.nutrition?.proteines ?? null;
    // Estimation pour la pizza entière (servings parts)
    const totalKcal = kcal && r.servings ? Math.round(kcal * r.servings) : kcal;
    const totalProt = prot && r.servings ? Math.round(prot * r.servings) : prot;

    return `<div class="pizza-card">
      ${r.photo ? `<div class="pizza-card-photo"><img src="${esc(r.photo)}" alt="${esc(r.title)}" onerror="this.closest('.pizza-card-photo').style.display='none'"></div>` : `<div class="pizza-card-photo pizza-card-nophoto"><span>🍕</span></div>`}
      <div class="pizza-card-body">
        <div class="pizza-card-name">${esc(r.title)}</div>
        <div class="pizza-card-stats">
          ${totalKcal !== null ? `<span class="pizza-stat">🔥 ${totalKcal} kcal</span>` : ''}
          ${totalProt !== null ? `<span class="pizza-stat">💪 ${totalProt}g protéines</span>` : ''}
        </div>
        <div class="pizza-card-toppings">
          ${toppings.map(t => `<span class="pizza-topping">${esc(t)}</span>`).join(', ')}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── Texte formaté pour partage ────────────────────────────────
function buildPizzaMenuText() {
  const pizzas = recipes.filter(isPizza);
  if (!pizzas.length) return null;

  let text = '🍕 CARTE DES PIZZAS MAISON\n';
  text += '━'.repeat(30) + '\n\n';

  pizzas.forEach(r => {
    const toppings  = getPizzaToppings(r);
    const kcal      = r.nutrition?.kcal      ?? null;
    const prot      = r.nutrition?.proteines ?? null;
    const totalKcal = kcal && r.servings ? Math.round(kcal * r.servings) : kcal;
    const totalProt = prot && r.servings ? Math.round(prot * r.servings) : prot;

    text += `🍕 ${r.title.toUpperCase()}\n`;
    const stats = [];
    if (totalKcal) stats.push(`${totalKcal} kcal`);
    if (totalProt) stats.push(`${totalProt}g protéines`);
    if (stats.length) text += `   ${stats.join(' · ')}\n`;
    if (toppings.length) text += `   ${toppings.join(', ')}\n`;
    text += '\n';
  });

  text += '━'.repeat(30) + '\n';
  text += 'Quelle pizza tu choisis ? 😊';
  return text;
}

async function copyPizzaMenu() {
  const text = buildPizzaMenuText();
  if (!text) { toast('Aucune pizza à copier.', 'error'); return; }
  try {
    await navigator.clipboard.writeText(text);
    toast('📋 Carte copiée ! Collez-la dans votre messagerie.', 'success');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('📋 Carte copiée !', 'success'); } catch { toast('❌ Impossible de copier.', 'error'); }
    ta.remove();
  }
}

async function sharePizzaMenu() {
  const text = buildPizzaMenuText();
  if (!text) { toast('Aucune pizza à partager.', 'error'); return; }
  if (navigator.share) {
    try { await navigator.share({ title: '🍕 Carte des Pizzas', text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  copyPizzaMenu();
}
