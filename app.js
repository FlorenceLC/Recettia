'use strict';

// ═══════════════════════════════════════════════════════════════
//  RECETT.AI — app.js
//  Stockage : IndexedDB (illimité) + compression auto des photos
//  Migration : récupère automatiquement les recettes du localStorage
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

const SHOPPING_CATS = {
  'Fruits & Légumes': ['tomate','carotte','oignon','ail','pomme','citron','salade',
    'courgette','poivron','champignon','épinard','brocoli','haricot','pois','radis',
    'concombre','betterave','navet','poireau','céleri','pomme de terre','patate',
    'aubergine','artichaut','asperge','fenouil','potiron','courge','banane','fraise',
    'framboise','mangue','ananas','poire','pêche','abricot','cerise','raisin','kiwi',
    'échalote','persil','coriandre','basilic','thym','romarin','menthe','gingembre'],
  'Viandes': ['poulet','boeuf','porc','agneau','veau','canard','dinde','saucisse',
    'jambon','lard','bacon','escalope','côte','filet','steak','viande hachée','merguez'],
  'Poissons & Fruits de mer': ['saumon','thon','cabillaud','crevette','moule','sole',
    'bar','dorade','sardine','anchois','langoustine','homard','seiche','calmar','lieu'],
  'Produits frais': ['lait','beurre','crème','oeuf','yaourt','fromage','mozzarella',
    'parmesan','gruyère','ricotta','mascarpone','crème fraîche','lardons'],
  'Épicerie': [],
};

const PHOTO_MAX_PX  = 1200;
const PHOTO_QUALITY = 0.78;

// ─── STATE ───────────────────────────────────────────────────
let recipes          = [];
let plannerData      = {};
let shoppingSelected = new Set();
let currentTab       = 'video';
let currentFilter    = 'all';
let baseServings     = 4;
let baseIngredients  = [];
let plannerTarget    = null;
let editingId        = null;
let loadingTimer     = null;
let db               = null;

// ═══════════════════════════════════════════════════════════════
//  INDEXEDDB
// ═══════════════════════════════════════════════════════════════
const DB_NAME    = 'recettai_db';
const DB_VERSION = 1;
const STORE      = 'recipes';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbGetAll() {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbPut(recipe) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(recipe);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

function dbClear() {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// Migration depuis localStorage
async function migrateFromLocalStorage() {
  const raw = localStorage.getItem('recettai_recipes');
  if (!raw) return;
  try {
    const old = JSON.parse(raw);
    if (!Array.isArray(old) || old.length === 0) return;
    const existing    = await dbGetAll();
    const existingIds = new Set(existing.map(r => r.id));
    let migrated = 0;
    for (const r of old) {
      if (!existingIds.has(r.id)) { await dbPut(r); migrated++; }
    }
    if (migrated > 0) {
      toast(`✅ ${migrated} recette(s) migrée(s) vers la nouvelle base de données !`, 'success');
    }
    localStorage.removeItem('recettai_recipes');
  } catch (err) {
    console.warn('[recettai] Échec migration:', err);
  }
}

async function persistRecipe(recipe) {
  await dbPut(recipe);
  const idx = recipes.findIndex(r => r.id === recipe.id);
  if (idx >= 0) recipes[idx] = recipe;
  else recipes.push(recipe);
}

async function removeRecipeFromDB(id) {
  await dbDelete(id);
  recipes = recipes.filter(r => r.id !== id);
}

function savePlanner() {
  localStorage.setItem('recettai_planner', JSON.stringify(plannerData));
}

// ═══════════════════════════════════════════════════════════════
//  IMAGE COMPRESSION
// ═══════════════════════════════════════════════════════════════
function compressImage(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > PHOTO_MAX_PX || height > PHOTO_MAX_PX) {
        if (width >= height) { height = Math.round(height * PHOTO_MAX_PX / width); width = PHOTO_MAX_PX; }
        else                 { width  = Math.round(width  * PHOTO_MAX_PX / height); height = PHOTO_MAX_PX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  try {
    db          = await openDB();
    await migrateFromLocalStorage();
    recipes     = await dbGetAll();
    plannerData = JSON.parse(localStorage.getItem('recettai_planner') || '{}');
    updateBadge();
    loadApiKeyStatus();
  } catch (err) {
    console.error('[recettai] Erreur init DB:', err);
    toast('Erreur d\'initialisation de la base de données.', 'error');
  }
});

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
//  API KEY
// ═══════════════════════════════════════════════════════════════
function getApiKey() { return localStorage.getItem('recettai_apikey') || ''; }

function saveApiKey() {
  const val = document.getElementById('api-key-input').value.trim();
  if (!val) { toast('Veuillez saisir une clé API.', 'error'); return; }
  localStorage.setItem('recettai_apikey', val);
  setApiStatus('✅ Clé enregistrée avec succès.', true);
  toast('Clé API enregistrée !', 'success');
}

function loadApiKeyStatus() {
  const key = getApiKey();
  if (key) {
    document.getElementById('api-key-input').value = key;
    setApiStatus('✅ Clé API configurée.', true);
  }
}

function setApiStatus(msg, ok) {
  const el = document.getElementById('api-key-status');
  el.textContent = msg;
  el.className = 'api-key-status ' + (ok ? 'ok' : 'err');
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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: 'mistral-large-latest',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'Tu es un expert en extraction de recettes culinaires. Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans explication, sans backticks.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || err?.error?.message || 'Erreur HTTP ' + res.status);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

function buildPrompt(type, input) {
  let ctx = '';
  if (type === 'video')     ctx = "L'utilisateur a fourni ce lien de vidéo de recette : " + input + "\nAnalyse l'URL pour déduire la plateforme et génère une recette plausible.";
  else if (type === 'web')  ctx = "L'utilisateur a fourni ce lien de page web de recette : " + input + "\nAnalyse l'URL et génère la recette correspondante.";
  else                      ctx = "L'utilisateur a collé ce texte de recette :\n\n" + input;

  const sourceVal = type !== 'text' ? '"' + input + '"' : 'null';

  return ctx + '\n\nRetourne UNIQUEMENT cet objet JSON (sans markdown, sans backticks, sans texte autour) :\n\n{\n  "title": "Titre de la recette",\n  "category": "Viande",\n  "servings": 4,\n  "source": ' + sourceVal + ',\n  "ingredients": [\n    {"qty": "200g", "name": "pâtes"},\n    {"qty": "2", "name": "tomates"}\n  ],\n  "steps": [\n    "Première étape.",\n    "Deuxième étape."\n  ]\n}\n\nRègles absolues :\n- category doit être exactement l\'un de : Viande, Poisson, Dessert, Cocktail, Entrée\n- N\'invente jamais d\'informations absentes du contenu fourni\n- Conserve les quantités telles qu\'elles sont mentionnées';
}

function parseJSON(text) {
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(clean); } catch {}
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  ANALYZE
// ═══════════════════════════════════════════════════════════════
async function analyzeRecipe() {
  const apiKey = getApiKey();
  if (!apiKey) {
    toast("⚙️ Configurez d'abord votre clé API Mistral dans les Paramètres.", 'error');
    showPage('settings');
    return;
  }

  let input = '';
  if (currentTab === 'video')    input = document.getElementById('video-url').value.trim();
  else if (currentTab === 'web') input = document.getElementById('web-url').value.trim();
  else                           input = document.getElementById('recipe-text').value.trim();

  if (!input) { toast('Veuillez saisir un contenu à analyser.', 'error'); return; }

  showLoading();
  document.getElementById('analyze-btn').disabled = true;
  document.getElementById('recipe-result').classList.remove('show');

  try {
    const raw    = await callMistral(buildPrompt(currentTab, input));
    const recipe = parseJSON(raw);
    if (!recipe || !recipe.title) throw new Error('Réponse JSON invalide');

    editingId       = null;
    baseServings    = recipe.servings || 4;
    baseIngredients = JSON.parse(JSON.stringify(recipe.ingredients || []));

    renderResultCard(recipe);
    document.getElementById('recipe-result').classList.add('show');
    document.getElementById('recipe-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('✅ Recette analysée avec succès !', 'success');

  } catch (err) {
    console.error('[Mistral]', err);
    if (err.message === 'NO_KEY') {
      toast('⚙️ Clé API manquante — allez dans Paramètres.', 'error');
      showPage('settings');
    } else if (/401|unauthorized|invalid api/i.test(err.message)) {
      toast('❌ Clé API refusée. Vérifiez-la dans Paramètres.', 'error');
      setApiStatus('❌ Clé refusée par Mistral — vérifiez-la.', false);
      showPage('settings');
    } else {
      toast('❌ Erreur : ' + err.message, 'error');
    }
  } finally {
    hideLoading();
    document.getElementById('analyze-btn').disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  RENDER RESULT CARD
// ═══════════════════════════════════════════════════════════════
function renderResultCard(recipe) {
  document.getElementById('result-title').value = recipe.title || '';

  const cat   = recipe.category || 'Entrée';
  const badge = document.getElementById('result-cat-badge');
  badge.textContent = cat;
  badge.className   = 'recipe-category-badge ' + catClass(cat);

  document.getElementById('result-servings').value = recipe.servings || 4;

  const srcWrap = document.getElementById('result-source-wrap');
  const srcLink = document.getElementById('result-source');
  if (recipe.source) { srcLink.href = recipe.source; srcWrap.style.display = 'flex'; }
  else               { srcWrap.style.display = 'none'; }

  resetPhotoZone('result-photo-zone');
  renderIngredients('result-ingredients', recipe.ingredients || []);
  renderSteps('result-steps', recipe.steps || []);
}

function catClass(cat) {
  const m = { Viande:'cat-viande', Poisson:'cat-poisson', Dessert:'cat-dessert', Cocktail:'cat-cocktail', 'Entrée':'cat-entree' };
  return m[cat] || 'cat-entree';
}

// ═══════════════════════════════════════════════════════════════
//  PHOTO
// ═══════════════════════════════════════════════════════════════
function triggerPhoto(inputId) { document.getElementById(inputId).click(); }

function handlePhoto(input, zoneId) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    const compressed = await compressImage(e.target.result);
    const zone = document.getElementById(zoneId);
    zone.dataset.photo = compressed;
    let img = zone.querySelector('img');
    if (!img) { img = document.createElement('img'); zone.prepend(img); }
    img.src = compressed;
    const icon = zone.querySelector('.photo-icon');
    const hint = zone.querySelector('.photo-hint');
    if (icon) icon.style.display = 'none';
    if (hint) hint.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function resetPhotoZone(zoneId) {
  const zone = document.getElementById(zoneId);
  zone.dataset.photo = '';
  const img  = zone.querySelector('img');
  const icon = zone.querySelector('.photo-icon');
  const hint = zone.querySelector('.photo-hint');
  if (img)  img.remove();
  if (icon) icon.style.display = '';
  if (hint) hint.style.display = '';
}

// ═══════════════════════════════════════════════════════════════
//  INGREDIENTS
// ═══════════════════════════════════════════════════════════════
function renderIngredients(listId, ingredients) {
  const list = document.getElementById(listId);
  list.innerHTML = '';
  ingredients.forEach(ing => {
    const qty  = typeof ing === 'object' ? (ing.qty  || '') : '';
    const name = typeof ing === 'object' ? (ing.name || ing) : ing;
    appendIngRow(list, qty, name);
  });
}

function appendIngRow(list, qty, name) {
  const li = document.createElement('li');
  li.className = 'ingredient-item';
  li.innerHTML =
    '<input class="editable-field" style="width:70px;flex:none" placeholder="Qté" value="' + esc(qty) + '">' +
    '<input class="editable-field" placeholder="Ingrédient" value="' + esc(name) + '">' +
    '<button class="delete-item-btn" onclick="this.closest(\'li\').remove()" title="Supprimer">✕</button>';
  list.appendChild(li);
}

function addIngredient(listId) {
  appendIngRow(document.getElementById(listId), '', '');
  document.getElementById(listId).lastChild.querySelectorAll('input')[1].focus();
}

// ═══════════════════════════════════════════════════════════════
//  STEPS
// ═══════════════════════════════════════════════════════════════
function renderSteps(listId, steps) {
  const list = document.getElementById(listId);
  list.innerHTML = '';
  steps.forEach((s, i) => appendStepRow(list, s, i + 1));
}

function appendStepRow(list, text, num) {
  const li = document.createElement('li');
  li.className = 'step-item';
  li.innerHTML =
    '<span class="step-num">' + num + '</span>' +
    '<textarea class="step-textarea" rows="2" oninput="autoResize(this)">' + esc(text) + '</textarea>' +
    '<button class="delete-item-btn" onclick="this.closest(\'li\').remove();renumber(this.closest(\'ol\'))" title="Supprimer">✕</button>';
  list.appendChild(li);
  setTimeout(() => autoResize(li.querySelector('textarea')), 10);
}

function addStep(listId) {
  const list = document.getElementById(listId);
  appendStepRow(list, '', list.querySelectorAll('li').length + 1);
  list.lastChild.querySelector('textarea').focus();
}

function renumber(list) {
  list.querySelectorAll('.step-num').forEach((el, i) => el.textContent = i + 1);
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ═══════════════════════════════════════════════════════════════
//  SERVINGS RECALC
// ═══════════════════════════════════════════════════════════════
function recalcServings() {
  const newVal = parseInt(document.getElementById('result-servings').value) || baseServings;
  if (!baseServings) return;
  const ratio = newVal / baseServings;
  document.querySelectorAll('#result-ingredients .ingredient-item').forEach((item, i) => {
    const base = baseIngredients[i];
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
//  COLLECT RECIPE FROM UI
// ═══════════════════════════════════════════════════════════════
function collectRecipe() {
  const title    = document.getElementById('result-title').value.trim();
  const servings = parseInt(document.getElementById('result-servings').value) || 4;
  const srcEl    = document.getElementById('result-source');
  const source   = (srcEl.href && !srcEl.href.endsWith('#')) ? srcEl.href : '';
  const category = document.getElementById('result-cat-badge').textContent.trim();
  const photo    = document.getElementById('result-photo-zone').dataset.photo || '';

  const ingredients = [];
  document.querySelectorAll('#result-ingredients .ingredient-item').forEach(li => {
    const inputs = li.querySelectorAll('input');
    const qty  = inputs[0] ? inputs[0].value.trim() : '';
    const name = inputs[1] ? inputs[1].value.trim() : '';
    if (name) ingredients.push({ qty, name });
  });

  const steps = [];
  document.querySelectorAll('#result-steps .step-item').forEach(li => {
    const t = li.querySelector('textarea');
    if (t && t.value.trim()) steps.push(t.value.trim());
  });

  return {
    id:             editingId || Date.now(),
    title, category, servings, source, photo,
    ingredients, steps,
    baseServings:    servings,
    baseIngredients: JSON.parse(JSON.stringify(ingredients)),
    createdAt:       new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
//  SAVE
// ═══════════════════════════════════════════════════════════════
async function saveRecipe() {
  const recipe = collectRecipe();
  if (!recipe.title) { toast('Veuillez saisir un titre.', 'error'); return; }

  try {
    await persistRecipe(recipe);
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
    toast('❌ Erreur lors de la sauvegarde : ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
//  RENDER RECIPES PAGE
// ═══════════════════════════════════════════════════════════════
function renderRecipes() {
  const grid     = document.getElementById('recipes-grid');
  const filtered = currentFilter === 'all' ? recipes : recipes.filter(r => r.category === currentFilter);

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🍳</div><h3>Aucune recette ici</h3><p>Analysez votre première recette pour commencer !</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(r =>
    '<div class="recipe-thumb" onclick="openRecipe(' + r.id + ')">' +
      '<div class="thumb-photo">' +
        (r.photo ? '<img src="' + r.photo + '" alt="' + esc(r.title) + '">' : '<span>' + (CAT_EMOJIS[r.category] || '🍽️') + '</span>') +
      '</div>' +
      '<div class="thumb-body">' +
        '<div class="thumb-category">' + (CAT_ICONS[r.category] || '🍽️') + ' ' + esc(r.category) + '</div>' +
        '<div class="thumb-title">' + esc(r.title) + '</div>' +
        '<div class="thumb-meta"><span>👥 ' + r.servings + ' pers.</span><span>📋 ' + r.ingredients.length + ' ingr.</span></div>' +
      '</div>' +
      '<div class="thumb-actions" onclick="event.stopPropagation()">' +
        '<button class="thumb-btn" onclick="editRecipe(' + r.id + ')">✏️ Modifier</button>' +
        '<button class="thumb-btn" onclick="exportSinglePDF(' + r.id + ')">📄 PDF</button>' +
        '<button class="thumb-btn danger" onclick="deleteRecipe(' + r.id + ')">🗑️</button>' +
      '</div>' +
    '</div>'
  ).join('');
}

function filterRecipes(cat, btn) {
  currentFilter = cat;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderRecipes();
}

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
  const ings  = (r.ingredients || []).map(i =>
    '<li class="ingredient-item"><span style="color:var(--gold);font-size:.6rem;flex-shrink:0">●</span><span style="font-size:.9rem">' + esc(i.qty) + ' ' + esc(i.name) + '</span></li>'
  ).join('');
  const steps = (r.steps || []).map((s, i) =>
    '<li class="step-item"><span class="step-num">' + (i+1) + '</span><span style="font-size:.9rem;line-height:1.5">' + esc(s) + '</span></li>'
  ).join('');

  return '<div style="background:var(--ink);padding:1.5rem;border-radius:var(--radius-sm);color:white;margin:-1.5rem -1.5rem 1.5rem">' +
    '<span class="recipe-category-badge ' + catClass(r.category) + '" style="margin-bottom:.5rem">' + esc(r.category) + '</span>' +
    '<h2 style="font-family:\'Playfair Display\',serif;font-size:1.6rem;margin-bottom:.3rem">' + esc(r.title) + '</h2>' +
    '<div style="font-size:.85rem;opacity:.7">👥 ' + r.servings + ' personnes</div></div>' +
    (r.photo ? '<img src="' + r.photo + '" alt="' + esc(r.title) + '" style="width:100%;height:220px;object-fit:cover;border-radius:var(--radius-sm);margin-bottom:1.5rem">' : '') +
    '<div style="margin-bottom:1.5rem"><div class="section-title">Ingrédients</div><ul class="ingredient-list">' + ings + '</ul></div>' +
    '<div><div class="section-title">Étapes</div><ol class="step-list">' + steps + '</ol></div>' +
    (r.source ? '<div style="margin-top:1rem;font-size:.82rem"><a href="' + esc(r.source) + '" target="_blank" rel="noopener" class="source-link">🔗 Recette originale</a></div>' : '') +
    '<div style="margin-top:1.5rem;display:flex;gap:.75rem;flex-wrap:wrap">' +
      '<button class="btn-primary" onclick="exportSinglePDF(' + r.id + ')">📄 PDF</button>' +
      '<button class="btn-secondary" onclick="editRecipe(' + r.id + ');closeModal(\'view-modal\')">✏️ Modifier</button>' +
    '</div>';
}

function editRecipe(id) {
  const r = recipes.find(x => x.id == id);
  if (!r) return;
  editingId       = id;
  baseServings    = r.baseServings || r.servings;
  baseIngredients = JSON.parse(JSON.stringify(r.baseIngredients || r.ingredients));
  showPage('home');
  renderResultCard(r);
  if (r.photo) {
    const zone = document.getElementById('result-photo-zone');
    zone.dataset.photo = r.photo;
    let img = zone.querySelector('img');
    if (!img) { img = document.createElement('img'); zone.prepend(img); }
    img.src = r.photo;
    const icon = zone.querySelector('.photo-icon');
    const hint = zone.querySelector('.photo-hint');
    if (icon) icon.style.display = 'none';
    if (hint) hint.style.display = 'none';
  }
  document.getElementById('recipe-result').classList.add('show');
  document.getElementById('recipe-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteRecipe(id) {
  if (!confirm('Supprimer cette recette ?')) return;
  try {
    await removeRecipeFromDB(id);
    updateBadge();
    renderRecipes();
    toast('Recette supprimée.', '');
  } catch (err) {
    toast('Erreur lors de la suppression.', 'error');
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
  if (!recipes.length) {
    list.innerHTML = '<div style="padding:1.5rem;color:var(--muted);font-size:.9rem;text-align:center">Aucune recette enregistrée</div>';
    return;
  }
  list.innerHTML = recipes.map(r =>
    '<div class="selector-item" onclick="toggleShopping(' + r.id + ',this)">' +
      '<input type="checkbox" ' + (shoppingSelected.has(r.id) ? 'checked' : '') + ' onclick="event.stopPropagation()">' +
      '<div><div class="selector-item-title">' + esc(r.title) + '</div>' +
      '<div class="selector-item-cat">' + r.category + ' · ' + r.servings + ' pers.</div></div>' +
    '</div>'
  ).join('');
}

function toggleShopping(id, el) {
  const cb = el.querySelector('input');
  if (shoppingSelected.has(id)) { shoppingSelected.delete(id); cb.checked = false; }
  else                           { shoppingSelected.add(id);    cb.checked = true;  }
}

function generateShoppingList() {
  const selected = recipes.filter(r => shoppingSelected.has(r.id));
  if (!selected.length) { toast('Sélectionnez au moins une recette.', 'error'); return; }

  const agg = {};
  selected.forEach(r => {
    (r.ingredients || []).forEach(ing => {
      const key = ing.name.toLowerCase().trim();
      if (!agg[key]) agg[key] = { name: ing.name, qtys: [] };
      if (ing.qty) agg[key].qtys.push(ing.qty);
    });
  });

  const cats = {};
  Object.values(agg).forEach(item => {
    let found = 'Épicerie';
    const low = item.name.toLowerCase();
    for (const [cat, kws] of Object.entries(SHOPPING_CATS)) {
      if (kws.some(k => low.includes(k))) { found = cat; break; }
    }
    if (!cats[found]) cats[found] = [];
    cats[found].push(item);
  });

  document.getElementById('shopping-list-result').innerHTML = Object.entries(cats).map(([cat, items]) =>
    '<div class="shopping-cat-section"><div class="shopping-cat-title">' + cat + '</div>' +
    items.map(item =>
      '<div class="shopping-item"><input type="checkbox" onchange="this.closest(\'.shopping-item\').classList.toggle(\'checked\',this.checked)">' +
      '<label>' + (item.qtys.length ? item.qtys.join(' + ') + ' ' : '') + esc(item.name) + '</label></div>'
    ).join('') + '</div>'
  ).join('');

  toast('✅ Liste générée !', 'success');
}

// ═══════════════════════════════════════════════════════════════
//  PLANNER
// ═══════════════════════════════════════════════════════════════
function renderPlanner() {
  document.getElementById('planner-grid').innerHTML = DAYS.map((day, di) =>
    '<div class="planner-day">' +
      '<div class="planner-day-header ' + (di >= 5 ? 'weekend' : '') + '">' + day + '</div>' +
      MEALS.map(meal =>
        '<div class="planner-slot">' +
          '<div class="planner-slot-label">' + meal + '</div>' +
          getPlannerChips(day, meal) +
          '<button class="planner-add-btn" onclick="openPlannerModal(\'' + day + '\',\'' + meal + '\')">+ Ajouter</button>' +
        '</div>'
      ).join('') +
    '</div>'
  ).join('');
}

function getPlannerChips(day, meal) {
  const ids = plannerData[day + '_' + meal] || [];
  return ids.map(id => {
    const r = recipes.find(x => x.id == id);
    if (!r) return '';
    return '<div class="planner-recipe-chip">' +
      '<span class="chip-title">' + esc(r.title) + '</span>' +
      '<button class="chip-remove" onclick="removePlannerChip(\'' + day + '\',\'' + meal + '\',' + id + ')">✕</button>' +
    '</div>';
  }).join('');
}

function openPlannerModal(day, meal) {
  plannerTarget = { day, meal };
  document.getElementById('planner-modal-title').textContent = day + ' · ' + meal;
  const list = document.getElementById('planner-recipe-list');
  list.innerHTML = recipes.length
    ? recipes.map(r =>
        '<div class="recipe-select-item" onclick="addToPlanner(' + r.id + ')">' +
          '<span>' + (CAT_ICONS[r.category] || '🍽️') + '</span>' +
          '<div><div style="font-size:.9rem;font-weight:500">' + esc(r.title) + '</div>' +
          '<div style="font-size:.78rem;color:var(--muted)">' + esc(r.category) + '</div></div>' +
        '</div>'
      ).join('')
    : '<div style="padding:1rem;color:var(--muted);font-size:.9rem">Aucune recette enregistrée</div>';
  document.getElementById('planner-modal').classList.add('show');
}

function addToPlanner(id) {
  if (!plannerTarget) return;
  const key = plannerTarget.day + '_' + plannerTarget.meal;
  if (!plannerData[key]) plannerData[key] = [];
  if (!plannerData[key].includes(id)) plannerData[key].push(id);
  savePlanner();
  closeModal('planner-modal');
  renderPlanner();
}

function removePlannerChip(day, meal, id) {
  const key = day + '_' + meal;
  plannerData[key] = (plannerData[key] || []).filter(x => x != id);
  savePlanner();
  renderPlanner();
}

function clearPlanner() {
  if (!confirm('Effacer tout le planning ?')) return;
  plannerData = {};
  savePlanner();
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
function exportCurrentPDF() {
  const r = collectRecipe();
  if (!r.title) { toast('Aucune recette à exporter.', 'error'); return; }
  printRecipe(r);
}

function exportSinglePDF(id) {
  const r = recipes.find(x => x.id == id);
  if (r) printRecipe(r);
}

function printRecipe(r) {
  const win   = window.open('', '_blank');
  const ings  = (r.ingredients || []).map(i => '<li>• ' + esc(i.qty) + ' ' + esc(i.name) + '</li>').join('');
  const steps = (r.steps || []).map((s, i) =>
    '<div style="display:flex;gap:10px;margin-bottom:8px">' +
      '<span style="min-width:24px;height:24px;background:#C4541A;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;flex-shrink:0">' + (i+1) + '</span>' +
      '<span>' + esc(s) + '</span>' +
    '</div>'
  ).join('');

  win.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>' + esc(r.title) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">' +
    '<style>body{font-family:\'DM Sans\',sans-serif;max-width:800px;margin:0 auto;padding:2rem;color:#1A1208}h1{font-family:\'Playfair Display\',serif;font-size:2rem;margin-bottom:.4rem}h2{font-family:\'Playfair Display\',serif;font-size:1.2rem;margin:1.4rem 0 .7rem;border-bottom:2px solid #F0D080;padding-bottom:.3rem}.meta{color:#8C7B68;font-size:.9rem;margin-bottom:1rem}ul{list-style:none;padding:0}li{padding:4px 0;font-size:.92rem}img{max-width:300px;border-radius:8px;margin:1rem 0;display:block}.cat{display:inline-block;padding:3px 10px;border-radius:99px;font-size:.75rem;font-weight:700;background:#C4541A;color:white;margin-bottom:.7rem}a{color:#C4541A}@media print{body{padding:1rem}}</style>' +
    '</head><body>' +
    '<span class="cat">' + esc(r.category) + '</span>' +
    '<h1>' + esc(r.title) + '</h1>' +
    '<div class="meta">👥 ' + r.servings + ' personnes' + (r.source ? ' · <a href="' + esc(r.source) + '">Recette originale</a>' : '') + '</div>' +
    (r.photo ? '<img src="' + r.photo + '" alt="' + esc(r.title) + '">' : '') +
    '<h2>Ingrédients</h2><ul>' + ings + '</ul>' +
    '<h2>Étapes</h2>' + steps +
    '</body></html>');
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

// ═══════════════════════════════════════════════════════════════
//  IMPORT / EXPORT / CLEAR
// ═══════════════════════════════════════════════════════════════
async function exportJSON() {
  const blob = new Blob([JSON.stringify(recipes, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
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
      const existingIds = new Set(recipes.map(r => r.id));
      let count = 0;
      for (const r of data) {
        if (!existingIds.has(r.id)) {
          await dbPut(r);
          recipes.push(r);
          count++;
        }
      }
      updateBadge();
      toast('✅ ' + count + ' recette(s) importée(s).', 'success');
      input.value = '';
    } catch (err) {
      console.error('[importJSON]', err);
      toast('Fichier invalide ou erreur d\'import.', 'error');
    }
  };
  reader.readAsText(file);
}

async function clearAll() {
  if (!confirm('Supprimer TOUTES les recettes et données ? Cette action est irréversible.')) return;
  try {
    await dbClear();
    recipes     = [];
    plannerData = {};
    localStorage.removeItem('recettai_planner');
    updateBadge();
    toast('Toutes les données supprimées.', '');
  } catch (err) {
    toast('Erreur lors de la suppression.', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════════════════
function esc(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
