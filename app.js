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

const GIST_FILENAME = 'recettai.json';

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
  let ctx = type === 'video'  ? "Lien vidéo de recette : " + input + "\nDéduis la plateforme et génère une recette plausible."
          : type === 'web'    ? "Lien page web de recette : " + input + "\nGénère la recette correspondante."
          :                     "Texte de recette :\n\n" + input;
  const src = type !== 'text' ? '"' + input + '"' : 'null';
  return ctx + '\n\nRetourne UNIQUEMENT ce JSON (sans markdown ni backticks) :\n{"title":"Titre","category":"Viande","servings":4,"source":' + src + ',"ingredients":[{"qty":"200g","name":"pâtes"}],"steps":["Étape 1."]}\n\nRègles : category = Viande|Poisson|Dessert|Cocktail|Entrée uniquement. Ne jamais inventer.';
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
  let input = currentTab === 'video' ? document.getElementById('video-url').value.trim()
            : currentTab === 'web'   ? document.getElementById('web-url').value.trim()
            :                         document.getElementById('recipe-text').value.trim();
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
    baseIngredients = JSON.parse(JSON.stringify(recipe.ingredients || []));
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
  renderIngredients('result-ingredients', recipe.ingredients || []);
  renderSteps('result-steps', recipe.steps || []);
}

function catClass(cat) {
  return ({ Viande:'cat-viande', Poisson:'cat-poisson', Dessert:'cat-dessert', Cocktail:'cat-cocktail', 'Entrée':'cat-entree' })[cat] || 'cat-entree';
}

// Photos supprimées — source URL à la place

// ═══════════════════════════════════════════════════════════════
//  INGREDIENTS / STEPS
// ═══════════════════════════════════════════════════════════════
function renderIngredients(listId, ings) {
  const list = document.getElementById(listId);
  list.innerHTML = '';
  ings.forEach(ing => appendIngRow(list, typeof ing === 'object' ? (ing.qty||'') : '', typeof ing === 'object' ? (ing.name||ing) : ing));
}
function appendIngRow(list, qty, name) {
  const li = document.createElement('li');
  li.className = 'ingredient-item';
  li.innerHTML = '<input class="editable-field" style="width:70px;flex:none" placeholder="Qté" value="' + esc(qty) + '"><input class="editable-field" placeholder="Ingrédient" value="' + esc(name) + '"><button class="delete-item-btn" onclick="this.closest(\'li\').remove()">✕</button>';
  list.appendChild(li);
}
function addIngredient(listId) {
  appendIngRow(document.getElementById(listId), '', '');
  document.getElementById(listId).lastChild.querySelectorAll('input')[1].focus();
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
//  COLLECT RECIPE
// ═══════════════════════════════════════════════════════════════
function collectRecipe() {
  const title    = document.getElementById('result-title').value.trim();
  const servings = parseInt(document.getElementById('result-servings').value) || 4;
  const srcInput = document.getElementById('result-source-input');
  const source   = srcInput ? srcInput.value.trim() : '';
  const category = document.getElementById('result-cat-badge').textContent.trim();
  const photo    = '';  // photos supprimées
  const ingredients = [];
  document.querySelectorAll('#result-ingredients .ingredient-item').forEach(li => {
    const ins = li.querySelectorAll('input');
    const qty = ins[0] ? ins[0].value.trim() : '';
    const name = ins[1] ? ins[1].value.trim() : '';
    if (name) ingredients.push({ qty, name });
  });
  const steps = [];
  document.querySelectorAll('#result-steps .step-item').forEach(li => {
    const t = li.querySelector('textarea');
    if (t && t.value.trim()) steps.push(t.value.trim());
  });
  return {
    id: editingId || Date.now(), title, category, servings, source, photo,
    ingredients, steps,
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
  const list = currentFilter === 'all' ? recipes : recipes.filter(r => r.category === currentFilter);
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🍳</div><h3>Aucune recette ici</h3><p>Analysez votre première recette pour commencer !</p></div>';
    return;
  }
  grid.innerHTML = list.map(r =>
    '<div class="recipe-thumb" onclick="openRecipe(' + r.id + ')">' +
    '<div class="thumb-photo"><span>' + (CAT_EMOJIS[r.category]||'🍽️') + '</span></div>' +
    '<div class="thumb-body"><div class="thumb-category">' + (CAT_ICONS[r.category]||'🍽️') + ' ' + esc(r.category) + '</div>' +
    '<div class="thumb-title">' + esc(r.title) + '</div>' +
    '<div class="thumb-meta"><span>👥 ' + r.servings + ' pers.</span><span>📋 ' + (r.ingredients||[]).length + ' ingr.</span></div></div>' +
    '<div class="thumb-actions" onclick="event.stopPropagation()">' +
    '<button class="thumb-btn" onclick="editRecipe(' + r.id + ')">✏️ Modifier</button>' +
    '<button class="thumb-btn" onclick="exportSinglePDF(' + r.id + ')">📄 PDF</button>' +
    '<button class="thumb-btn danger" onclick="deleteRecipe(' + r.id + ')">🗑️</button></div></div>'
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
  const ings  = (r.ingredients||[]).map(i => '<li class="ingredient-item"><span style="color:var(--gold);font-size:.6rem;flex-shrink:0">●</span><span style="font-size:.9rem">' + esc(i.qty) + ' ' + esc(i.name) + '</span></li>').join('');
  const steps = (r.steps||[]).map((s,i) => '<li class="step-item"><span class="step-num">' + (i+1) + '</span><span style="font-size:.9rem;line-height:1.5">' + esc(s) + '</span></li>').join('');
  return '<div style="background:var(--ink);padding:1.5rem;border-radius:var(--radius-sm);color:white;margin:-1.5rem -1.5rem 1.5rem">' +
    '<span class="recipe-category-badge ' + catClass(r.category) + '" style="margin-bottom:.5rem">' + esc(r.category) + '</span>' +
    '<h2 style="font-family:\'Playfair Display\',serif;font-size:1.6rem;margin-bottom:.3rem">' + esc(r.title) + '</h2>' +
    '<div style="font-size:.85rem;opacity:.7">👥 ' + r.servings + ' personnes</div></div>' +
    (r.source ? '<div style="margin-bottom:1rem"><a href="' + esc(r.source) + '" target="_blank" rel="noopener" style="font-size:.82rem;color:var(--terracotta);word-break:break-all">🔗 ' + esc(r.source) + '</a></div>' : '') +
    '<div style="margin-bottom:1.5rem"><div class="section-title">Ingrédients</div><ul class="ingredient-list">' + ings + '</ul></div>' +
    '<div><div class="section-title">Étapes</div><ol class="step-list">' + steps + '</ol></div>' +

    '<div style="margin-top:1.5rem;display:flex;gap:.75rem;flex-wrap:wrap"><button class="btn-primary" onclick="exportSinglePDF(' + r.id + ')">📄 PDF</button><button class="btn-secondary" onclick="editRecipe(' + r.id + ');closeModal(\'view-modal\')">✏️ Modifier</button></div>';
}

function editRecipe(id) {
  const r = recipes.find(x => x.id == id);
  if (!r) return;
  editingId = id;
  baseServings    = r.base_servings || r.servings;
  baseIngredients = JSON.parse(JSON.stringify(r.base_ingredients || r.ingredients));
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
function generateShoppingList() {
  const selected = recipes.filter(r => shoppingSelected.has(r.id));
  if (!selected.length) { toast('Sélectionnez au moins une recette.', 'error'); return; }
  const agg = {};
  selected.forEach(r => (r.ingredients||[]).forEach(ing => {
    const key = ing.name.toLowerCase().trim();
    if (!agg[key]) agg[key] = { name: ing.name, qtys: [] };
    if (ing.qty) agg[key].qtys.push(ing.qty);
  }));
  const cats = {};
  Object.values(agg).forEach(item => {
    let found = 'Épicerie';
    const low = item.name.toLowerCase();
    for (const [cat, kws] of Object.entries(SHOPPING_CATS)) { if (kws.some(k => low.includes(k))) { found = cat; break; } }
    if (!cats[found]) cats[found] = [];
    cats[found].push(item);
  });
  document.getElementById('shopping-list-result').innerHTML = Object.entries(cats).map(([cat, items]) =>
    '<div class="shopping-cat-section"><div class="shopping-cat-title">' + cat + '</div>' +
    items.map(item => '<div class="shopping-item"><input type="checkbox" onchange="this.closest(\'.shopping-item\').classList.toggle(\'checked\',this.checked)"><label>' + (item.qtys.length ? item.qtys.join(' + ') + ' ' : '') + esc(item.name) + '</label></div>').join('') + '</div>'
  ).join('');
  toast('✅ Liste générée !', 'success');
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
    return r ? '<div class="planner-recipe-chip"><span class="chip-title">' + esc(r.title) + '</span><button class="chip-remove" onclick="removePlannerChip(\'' + day + '\',\'' + meal + '\',' + id + ')">✕</button></div>' : '';
  }).join('');
}
function openPlannerModal(day, meal) {
  plannerTarget = { day, meal };
  document.getElementById('planner-modal-title').textContent = day + ' · ' + meal;
  const list = document.getElementById('planner-recipe-list');
  list.innerHTML = recipes.length
    ? recipes.map(r => '<div class="recipe-select-item" onclick="addToPlanner(' + r.id + ')"><span>' + (CAT_ICONS[r.category]||'🍽️') + '</span><div><div style="font-size:.9rem;font-weight:500">' + esc(r.title) + '</div><div style="font-size:.78rem;color:var(--muted)">' + esc(r.category) + '</div></div></div>').join('')
    : '<div style="padding:1rem;color:var(--muted);font-size:.9rem">Aucune recette enregistrée</div>';
  document.getElementById('planner-modal').classList.add('show');
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
  const ings  = (r.ingredients||[]).map(i => '<li>• ' + esc(i.qty) + ' ' + esc(i.name) + '</li>').join('');
  const steps = (r.steps||[]).map((s,i) => '<div style="display:flex;gap:10px;margin-bottom:8px"><span style="min-width:24px;height:24px;background:#C4541A;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;flex-shrink:0">' + (i+1) + '</span><span>' + esc(s) + '</span></div>').join('');
  win.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>' + esc(r.title) + '</title><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet"><style>body{font-family:\'DM Sans\',sans-serif;max-width:800px;margin:0 auto;padding:2rem;color:#1A1208}h1{font-family:\'Playfair Display\',serif;font-size:2rem;margin-bottom:.4rem}h2{font-family:\'Playfair Display\',serif;font-size:1.2rem;margin:1.4rem 0 .7rem;border-bottom:2px solid #F0D080;padding-bottom:.3rem}.meta{color:#8C7B68;font-size:.9rem;margin-bottom:1rem}ul{list-style:none;padding:0}li{padding:4px 0;font-size:.92rem}.cat{display:inline-block;padding:3px 10px;border-radius:99px;font-size:.75rem;font-weight:700;background:#C4541A;color:white;margin-bottom:.7rem}a{color:#C4541A;word-break:break-all}@media print{body{padding:1rem}}</style></head><body><span class="cat">' + esc(r.category) + '</span><h1>' + esc(r.title) + '</h1><div class="meta">👥 ' + r.servings + ' personnes' + (r.source ? ' · <a href="' + esc(r.source) + '">' + esc(r.source) + '</a>' : '') + '</div><h2>Ingrédients</h2><ul>' + ings + '</ul><h2>Étapes</h2>' + steps + '</body></html>');
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
