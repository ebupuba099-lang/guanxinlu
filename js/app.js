/**
 * 观心录 v3 - 沉浸式古风语录网站
 * App.js - 主应用逻辑
 */

// ========================================
// 配置
// ========================================
const CONFIG = {
  GH_TOKEN: ['ghp_Rzdf','y8BD199F42m4a3','ths61XZU5f5n0EEduF'].join(''),
  GH_REPO: 'ebupuba099-lang/guanxinlu',
  GH_DATA_PATH: 'data/user_data.json',
  LOCAL_STORAGE_KEY: 'guanxinlu_data',
  USER_QUOTE_START_ID: 1001
};

// ========================================
// 应用状态
// ========================================
const AppState = {
  quotes: [],
  allQuotes: [],
  currentIndex: -1,
  browseHistory: [],
  historyIndex: -1,
  favorites: [],
  notes: {},
  userQuotes: [],
  userQuoteIdCounter: CONFIG.USER_QUOTE_START_ID,
  dataSha: null,
  currentView: 'home',
  currentCategory: null,
  editingNoteId: null,
  currentNoteQuoteId: null,
  selectedTags: [],
  touchStartY: 0,
  touchEndY: 0,
  currentTheme: 'paper',
  homeNavHideTimer: null
};

// ========================================
// DOM 元素
// ========================================
const Elements = {
  views: {
    home: document.getElementById('viewHome'),
    category: document.getElementById('viewCategory'),
    search: document.getElementById('viewSearch'),
    add: document.getElementById('viewAdd'),
    favorites: document.getElementById('viewFavorites'),
    immersive: document.getElementById('viewImmersive'),
    categoryDetail: document.getElementById('viewCategoryDetail')
  },
  quoteCard: document.getElementById('quoteCard'),
  quoteContainer: document.getElementById('quoteContainer'),
  bottomNav: document.getElementById('bottomNav'),
  categoryList: document.getElementById('categoryList'),
  searchInput: document.getElementById('searchInput'),
  searchResults: document.getElementById('searchResults'),
  favoritesList: document.getElementById('favoritesList'),
  immersiveContent: document.getElementById('immersiveContent'),
  categoryTitle: document.getElementById('categoryTitle'),
  categoryQuotes: document.getElementById('categoryQuotes'),
  noteModal: document.getElementById('noteModal'),
  noteText: document.getElementById('noteText'),
  noteCancel: document.getElementById('noteCancel'),
  noteSave: document.getElementById('noteSave'),
  petals: document.getElementById('petals'),
  themeOptions: document.getElementById('themeOptions'),
  toast: document.getElementById('toast'),
  addQuoteForm: document.getElementById('addQuoteForm'),
  tagSelector: document.getElementById('tagSelector')
};

// ========================================
// 初始化
// ========================================
async function init() {
  // 先注销旧的 Service Worker，强制清除缓存
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      await reg.unregister();
    }
    // 清除所有缓存
    if ('caches' in window) {
      const names = await caches.keys();
      for (const name of names) {
        await caches.delete(name);
      }
    }
  }
  
  // 注册 Service Worker（每次打开自动检查更新）
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js', {
        updateViaCache: 'none'
      });
      console.log('Service Worker 注册成功');
      
      // 检查是否有新版本
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            // 新版本已激活，自动刷新
            window.location.reload();
          }
        });
      });
      
      // 主动触发更新检查
      registration.update();
    } catch (error) {
      console.log('Service Worker 注册失败:', error);
    }
  }

  // 创建花瓣
  createPetals();
  
  // 加载主题
  loadTheme();
  
  // 加载数据
  await loadQuotes();
  await loadUserData();
  
  // 合并静态数据和用户数据
  mergeQuotes();
  
  // 随机起始位置（仅在 currentIndex 为 -1 时）
  if (AppState.currentIndex === -1 && AppState.allQuotes.length > 0) {
    const randomIndex = Math.floor(Math.random() * AppState.allQuotes.length);
    AppState.browseHistory = [randomIndex];
    AppState.historyIndex = 0;
    AppState.currentIndex = randomIndex;
  }
  
  // 渲染当前视图
  renderHomeView();
  
  // 设置首页底部导航自动淡出
  setupHomeNavAutoHide();
  
  // 绑定事件
  bindEvents();
  
  // 设置导航
  setupNavigation();
  
  // 设置触摸滑动
  setupTouchSwipe();
  
  // 设置主题切换（绑定到"我的"页面的 themeOptions）
  setupThemeSwitcher();
  
  // 设置标签选择
  setupTagSelector();
}

// ========================================
// 花瓣动画
// ========================================
function createPetals() {
  for (let i = 0; i < 3; i++) {
    const petal = document.createElement('div');
    petal.className = 'petal';
    Elements.petals.appendChild(petal);
  }
}

// ========================================
// 首页底部导航自动淡出
// ========================================
function setupHomeNavAutoHide() {
  const homeNav = document.querySelector('.home-nav');
  if (!homeNav) return;
  
  // 显示导航
  const showNav = () => {
    homeNav.classList.add('show');
    clearTimeout(AppState.homeNavHideTimer);
    AppState.homeNavHideTimer = setTimeout(() => {
      if (AppState.currentView === 'home') {
        homeNav.classList.remove('show');
      }
    }, 3000);
  };
  
  // 触摸屏幕时显示导航
  Elements.quoteContainer.addEventListener('touchstart', showNav, { passive: true });
  
  // 初始淡出
  showNav();
}

// ========================================
// 主题管理
// ========================================
function loadTheme() {
  // 强制宣纸模式，清除旧主题缓存
  localStorage.removeItem('guanxinlu_theme');
  setTheme('paper');
}

function setTheme(theme) {
  AppState.currentTheme = theme;
  document.body.dataset.theme = theme;
  localStorage.setItem('guanxinlu_theme', theme);
  
  // 更新所有主题按钮状态
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function setupThemeSwitcher() {
  // 绑定"我的"页面中的 themeOptions
  const themeOptions = document.getElementById('themeOptions');
  if (themeOptions) {
    themeOptions.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setTheme(btn.dataset.theme);
      });
    });
  }
}

// ========================================
// Toast 提示
// ========================================
function showToast(message) {
  Elements.toast.textContent = message;
  Elements.toast.classList.add('show');
  setTimeout(() => {
    Elements.toast.classList.remove('show');
  }, 2000);
}

// ========================================
// 加载语录数据
// ========================================
async function loadQuotes() {
  try {
    const response = await fetch('./data/quotes.json');
    const data = await response.json();
    AppState.quotes = data.quotes;
  } catch (error) {
    console.error('加载语录失败:', error);
    AppState.quotes = [];
  }
}

// ========================================
// 用户数据管理 (GitHub + localStorage)
// ========================================
async function loadUserData() {
  // 优先尝试从GitHub加载
  try {
    const response = await fetch(`https://api.github.com/repos/${CONFIG.GH_REPO}/contents/${CONFIG.GH_DATA_PATH}`, {
      headers: {
        'Authorization': `token ${CONFIG.GH_TOKEN}`,
        'Accept': 'application/vnd.github.v3.raw'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      AppState.favorites = data.favorites || [];
      AppState.notes = data.notes || {};
      AppState.userQuotes = data.userQuotes || [];
      AppState.dataSha = null; // 将在saveUserData时获取最新sha
      
      // 更新用户语录ID计数器
      if (AppState.userQuotes.length > 0) {
        const maxId = Math.max(...AppState.userQuotes.map(q => q.id));
        AppState.userQuoteIdCounter = Math.max(maxId + 1, CONFIG.USER_QUOTE_START_ID);
      }
      return;
    }
  } catch (error) {
    console.log('GitHub数据加载失败，使用本地存储');
  }
  
  // 降级到localStorage
  const localData = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);
  if (localData) {
    const data = JSON.parse(localData);
    AppState.favorites = data.favorites || [];
    AppState.notes = data.notes || {};
    AppState.userQuotes = data.userQuotes || [];
  }
}

async function saveUserData() {
  const data = {
    favorites: AppState.favorites,
    notes: AppState.notes,
    userQuotes: AppState.userQuotes
  };
  
  // 保存到GitHub
  try {
    // 先获取当前文件的SHA
    const shaResp = await fetch(`https://api.github.com/repos/${CONFIG.GH_REPO}/contents/${CONFIG.GH_DATA_PATH}`, {
      headers: {
        'Authorization': `token ${CONFIG.GH_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (shaResp.ok) {
      const shaData = await shaResp.json();
      const sha = shaData.sha;
      
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
      await fetch(`https://api.github.com/repos/${CONFIG.GH_REPO}/contents/${CONFIG.GH_DATA_PATH}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${CONFIG.GH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'auto: update user data',
          content: content,
          sha: sha
        })
      });
    }
  } catch (error) {
    console.log('GitHub保存失败:', error);
  }
  
  // 同时保存到localStorage
  localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, JSON.stringify(data));
}

// ========================================
// 合并语录
// ========================================
function mergeQuotes() {
  AppState.allQuotes = [...AppState.quotes];
  
  // 应用用户数据：覆盖记录优先
  AppState.userQuotes.forEach(uq => {
    if (uq.isOverride) {
      // 覆盖静态语录
      const index = AppState.allQuotes.findIndex(q => q.id === uq.id);
      if (index !== -1) {
        AppState.allQuotes[index] = { ...AppState.allQuotes[index], ...uq };
      }
    } else {
      // 新增的用户语录
      AppState.allQuotes.push(uq);
    }
  });
}

// ========================================
// 添加语录
// ========================================
async function addQuote(quoteData) {
  const newQuote = {
    id: AppState.userQuoteIdCounter++,
    ...quoteData,
    createdAt: new Date().toISOString(),
    isUserCreated: true
  };
  
  AppState.userQuotes.push(newQuote);
  mergeQuotes();
  
  await saveUserData();
  
  return newQuote;
}

// ========================================
// 删除语录
// ========================================
async function deleteQuote(id) {
  // 从 allQuotes 中移除
  const index = AppState.allQuotes.findIndex(q => q.id === id);
  if (index !== -1) {
    AppState.allQuotes.splice(index, 1);
  }
  
  // 从 quotes（静态数据）中移除
  const staticIndex = AppState.quotes.findIndex(q => q.id === id);
  if (staticIndex !== -1) {
    AppState.quotes.splice(staticIndex, 1);
  }
  
  // 从 userQuotes 中移除（如果是用户创建的或覆盖的）
  const userIndex = AppState.userQuotes.findIndex(q => q.id === id);
  if (userIndex !== -1) {
    AppState.userQuotes.splice(userIndex, 1);
  }
  
  // 从收藏中移除
  AppState.favorites = AppState.favorites.filter(fid => fid !== id);
  
  // 从心得中移除
  delete AppState.notes[id];
  
  // 从浏览历史中移除
  AppState.browseHistory = AppState.browseHistory.filter(hid => hid !== id);
  if (AppState.historyIndex >= AppState.browseHistory.length) {
    AppState.historyIndex = Math.max(0, AppState.browseHistory.length - 1);
  }
  
  // 保存并重新渲染
  await saveUserData();
  
  showToast('已删除');
}

// ========================================
// 标签选择
// ========================================
function setupTagSelector() {
  Elements.tagSelector.querySelectorAll('.tag-option').forEach(tag => {
    tag.addEventListener('click', () => {
      tag.classList.toggle('selected');
      updateSelectedTags();
    });
  });
}

function updateSelectedTags() {
  AppState.selectedTags = [];
  Elements.tagSelector.querySelectorAll('.tag-option.selected').forEach(tag => {
    AppState.selectedTags.push(tag.dataset.tag);
  });
}

function clearTagSelector() {
  AppState.selectedTags = [];
  Elements.tagSelector.querySelectorAll('.tag-option').forEach(tag => {
    tag.classList.remove('selected');
  });
}

// ========================================
// 触摸滑动
// ========================================
function setupTouchSwipe() {
  Elements.quoteContainer.addEventListener('touchstart', (e) => {
    AppState.touchStartY = e.touches[0].clientY;
  }, { passive: true });
  
  Elements.quoteContainer.addEventListener('touchmove', (e) => {
    AppState.touchEndY = e.touches[0].clientY;
  }, { passive: true });
  
  Elements.quoteContainer.addEventListener('touchend', () => {
    // 如果当前不在首页，不触发滑动翻页（确保沉浸视图内不会翻页）
    if (AppState.currentView !== 'home') return;
    handleSwipe();
  });
}

function handleSwipe() {
  const swipeThreshold = 50;
  const diff = AppState.touchStartY - AppState.touchEndY;
  
  if (Math.abs(diff) < swipeThreshold) return;
  
  Elements.quoteCard.classList.add(diff > 0 ? 'slide-up' : 'slide-down');
  
  setTimeout(() => {
    if (diff > 0) {
      nextQuote();
    } else {
      prevQuote();
    }
  }, 200);
}

// ========================================
// 视图切换
// ========================================
function switchView(viewName) {
  // 隐藏所有视图
  Object.values(Elements.views).forEach(view => {
    if (view) view.classList.remove('active');
  });
  
  // 显示目标视图
  if (Elements.views[viewName]) {
    Elements.views[viewName].classList.add('active');
    AppState.currentView = viewName;
  }
  
  // 更新底部导航
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.view === viewName) {
      item.classList.add('active');
    }
  });
  
  // 处理首页底部导航
  const homeNav = document.querySelector('.home-nav');
  if (homeNav) {
    if (viewName === 'home') {
      homeNav.classList.remove('show');
      // 3秒后淡出
      clearTimeout(AppState.homeNavHideTimer);
      AppState.homeNavHideTimer = setTimeout(() => {
        if (AppState.currentView === 'home') {
          homeNav.classList.remove('show');
        }
      }, 3000);
    } else {
      homeNav.classList.add('show');
      homeNav.style.opacity = '';
    }
  }
  
  // 根据视图渲染内容
  switch (viewName) {
    case 'home':
      renderHomeView();
      break;
    case 'category':
      renderCategoryView();
      break;
    case 'search':
      renderSearchView();
      break;
    case 'add':
      // 重置表单
      Elements.addQuoteForm.reset();
      clearTagSelector();
      break;
    case 'favorites':
      renderFavoritesView();
      break;
  }
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(item.dataset.view);
    });
  });
  
  document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });
}

// ========================================
// 首页视图
// ========================================
function renderHomeView() {
  if (AppState.allQuotes.length === 0) return;
  
  const quote = AppState.allQuotes[AppState.currentIndex];
  const isFavorite = AppState.favorites.includes(quote.id);
  const quoteNotes = AppState.notes[quote.id] || [];
  
  let html = '';
  
  // 根据类型渲染不同的展示模式
  switch (quote.type) {
    case 'short':
      html = renderShortQuote(quote, isFavorite, quoteNotes);
      break;
    case 'long':
    case 'deep':
      html = renderPreviewQuote(quote, isFavorite, quoteNotes);
      break;
    case 'interpret':
      html = renderInterpretQuote(quote, isFavorite, quoteNotes);
      break;
    case 'debate':
      html = renderDebateQuote(quote, isFavorite, quoteNotes);
      break;
    case 'business':
      html = renderBusinessQuote(quote, isFavorite, quoteNotes);
      break;
    case 'framework':
      html = renderFrameworkQuote(quote, isFavorite, quoteNotes);
      break;
    case 'guide':
      html = renderGuideQuote(quote, isFavorite, quoteNotes);
      break;
    case 'negative':
      html = renderNegativeQuote(quote, isFavorite, quoteNotes);
      break;
    case 'caution':
      html = renderCautionQuote(quote, isFavorite, quoteNotes);
      break;
    default:
      html = renderShortQuote(quote, isFavorite, quoteNotes);
  }
  
  // 重置动画状态
  Elements.quoteCard.classList.remove('slide-up', 'slide-down');
  Elements.quoteCard.innerHTML = html;
  
  // 绑定事件
  bindQuoteCardEvents(quote, isFavorite);
}

// 短句渲染 - 竖排或横排
function renderShortQuote(quote, isFavorite, notes) {
  const text = quote.text;
  const lines = text.split('\n').filter(l => l.trim());
  const isVertical = shouldUseVerticalMode(quote);
  const plainText = text.replace(/\n/g, '');
  const textLen = plainText.length;
  
  let displayMode = isVertical ? 'vertical' : 'horizontal';
  
  // 根据文字长度动态计算字体大小
  let fontSize = '';
  if (isVertical) {
    if (textLen <= 8) fontSize = 'clamp(48px, 14vw, 88px)';
    else if (textLen <= 14) fontSize = 'clamp(40px, 11vw, 72px)';
    else if (textLen <= 20) fontSize = 'clamp(32px, 8vw, 56px)';
    else fontSize = 'clamp(28px, 7vw, 48px)';
  } else {
    if (textLen <= 12) fontSize = 'clamp(36px, 10vw, 64px)';
    else if (textLen <= 24) fontSize = 'clamp(28px, 7vw, 48px)';
    else if (textLen <= 40) fontSize = 'clamp(22px, 5.5vw, 36px)';
    else fontSize = 'clamp(18px, 4.5vw, 28px)';
  }
  
  return `
    <div class="quote-content-main quote-short ${displayMode}">
      <p class="quote-text" style="font-size: ${fontSize}">${escapeHtml(text)}</p>
      <div class="quote-tags">
        ${quote.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        ${quote.isUserCreated ? '<span class="user-quote-badge">自</span>' : ''}
      </div>
      ${renderActions(isFavorite)}
      ${renderNotesDisplay(notes, quote.id)}
    </div>
  `;
}

// 判断是否使用竖排模式
function shouldUseVerticalMode(quote) {
  if (quote.type !== 'short') return false;
  
  const text = quote.text.replace(/\n/g, '');
  if (text.length > 20) return false;
  
  const lines = text.split('\n');
  if (lines.some(line => line.length > 8)) return false;
  
  return true;
}

function renderPreviewQuote(quote, isFavorite, notes) {
  const excerpt = getExcerpt(quote.text, 80);
  return `
    <div class="quote-content-main quote-preview">
      ${quote.title ? `<h2 class="quote-title">${escapeHtml(quote.title)}</h2>` : ''}
      <p class="quote-excerpt">${escapeHtml(excerpt)}</p>
      <button class="expand-btn" data-action="expand">展开全文</button>
      <div class="quote-tags">
        ${quote.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        ${quote.isUserCreated ? '<span class="user-quote-badge">自</span>' : ''}
      </div>
      ${renderActions(isFavorite)}
      ${renderNotesDisplay(notes, quote.id)}
    </div>
  `;
}

function renderInterpretQuote(quote, isFavorite, notes) {
  const parts = parseInterpretContent(quote.text);
  return `
    <div class="quote-content-main quote-interpret">
      ${quote.title ? `<p class="quote-text">${escapeHtml(quote.title)}</p>` : ''}
      ${parts.interpretation ? `<div class="quote-interpretation">${escapeHtml(parts.interpretation)}</div>` : ''}
      <button class="expand-btn" data-action="expand">展开全文</button>
      <div class="quote-tags">
        ${quote.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        ${quote.isUserCreated ? '<span class="user-quote-badge">自</span>' : ''}
      </div>
      ${renderActions(isFavorite)}
      ${renderNotesDisplay(notes, quote.id)}
    </div>
  `;
}

function renderDebateQuote(quote, isFavorite, notes) {
  return `
    <div class="quote-content-main quote-debate">
      ${quote.title ? `<p class="quote-text">${escapeHtml(quote.title)}</p>` : ''}
      <button class="expand-btn" data-action="expand">展开全文</button>
      <div class="quote-tags">
        ${quote.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        ${quote.isUserCreated ? '<span class="user-quote-badge">自</span>' : ''}
      </div>
      ${renderActions(isFavorite)}
      ${renderNotesDisplay(notes, quote.id)}
    </div>
  `;
}

function renderBusinessQuote(quote, isFavorite, notes) {
  return `
    <div class="quote-content-main quote-business">
      ${quote.title ? `<h2 class="quote-title">${escapeHtml(quote.title)}</h2>` : ''}
      <div class="quote-content">${highlightBusiness(quote.text)}</div>
      <button class="expand-btn" data-action="expand">展开全文</button>
      <div class="quote-tags">
        ${quote.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        ${quote.isUserCreated ? '<span class="user-quote-badge">自</span>' : ''}
      </div>
      ${renderActions(isFavorite)}
      ${renderNotesDisplay(notes, quote.id)}
    </div>
  `;
}

function renderFrameworkQuote(quote, isFavorite, notes) {
  return `
    <div class="quote-content-main quote-framework">
      ${quote.title ? `<p class="quote-text">${escapeHtml(quote.title)}</p>` : ''}
      <button class="expand-btn" data-action="expand">展开全文</button>
      <div class="quote-tags">
        ${quote.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        ${quote.isUserCreated ? '<span class="user-quote-badge">自</span>' : ''}
      </div>
      ${renderActions(isFavorite)}
      ${renderNotesDisplay(notes, quote.id)}
    </div>
  `;
}

function renderGuideQuote(quote, isFavorite, notes) {
  return `
    <div class="quote-content-main quote-guide">
      ${quote.title ? `<h2 class="quote-title">${escapeHtml(quote.title)}</h2>` : ''}
      <button class="expand-btn" data-action="expand">展开全文</button>
      <div class="quote-tags">
        ${quote.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        ${quote.isUserCreated ? '<span class="user-quote-badge">自</span>' : ''}
      </div>
      ${renderActions(isFavorite)}
      ${renderNotesDisplay(notes, quote.id)}
    </div>
  `;
}

function renderNegativeQuote(quote, isFavorite, notes) {
  return `
    <div class="quote-content-main quote-negative">
      ${quote.title ? `<h2 class="quote-title">${escapeHtml(quote.title)}</h2>` : ''}
      <button class="expand-btn" data-action="expand">查看内容</button>
      <div class="quote-tags">
        ${quote.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        ${quote.isUserCreated ? '<span class="user-quote-badge">自</span>' : ''}
      </div>
      ${renderActions(isFavorite)}
      ${renderNotesDisplay(notes, quote.id)}
    </div>
  `;
}

function renderCautionQuote(quote, isFavorite, notes) {
  return `
    <div class="quote-content-main quote-caution">
      ${quote.title ? `<h2 class="quote-title">${escapeHtml(quote.title)}</h2>` : ''}
      <button class="expand-btn" data-action="expand">展开全文</button>
      <div class="quote-tags">
        ${quote.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        ${quote.isUserCreated ? '<span class="user-quote-badge">自</span>' : ''}
      </div>
      ${renderActions(isFavorite)}
      ${renderNotesDisplay(notes, quote.id)}
    </div>
  `;
}

function renderActions(isFavorite) {
  return `
    <div class="quote-actions">
      <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-action="favorite" title="收藏">
        <svg viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </button>
      <button class="notes-btn" data-action="notes">写心得</button>
      <button class="edit-btn" data-action="edit">编辑</button>
    </div>
  `;
}

function renderNotesDisplay(notes, quoteId) {
  if (!notes || notes.length === 0) return '';
  
  return `
    <div class="notes-display">
      ${notes.map(note => `
        <div class="note-item" data-note-id="${note.id}">
          <div class="note-text">${escapeHtml(note.text)}</div>
          <div class="note-time">${formatTime(note.time)}</div>
          <div class="note-actions">
            <span class="note-action" data-action="edit-note" data-note-id="${note.id}">编辑</span>
            <span class="note-action" data-action="delete-note" data-note-id="${note.id}">删除</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ========================================
// 语录卡片事件绑定
// ========================================
function bindQuoteCardEvents(quote, isFavorite) {
  // 展开全文
  const expandBtn = Elements.quoteCard.querySelector('[data-action="expand"]');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      openImmersiveView(quote);
    });
  }
  
  // 收藏按钮
  const favBtn = Elements.quoteCard.querySelector('[data-action="favorite"]');
  if (favBtn) {
    favBtn.addEventListener('click', () => {
      toggleFavorite(quote.id);
    });
  }
  
  // 写心得按钮
  const notesBtn = Elements.quoteCard.querySelector('[data-action="notes"]');
  if (notesBtn) {
    notesBtn.addEventListener('click', () => {
      openNoteModal(quote.id);
    });
  }
  
  // 编辑按钮
  const editBtn = Elements.quoteCard.querySelector('[data-action="edit"]');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      openEditModal(quote);
    });
  }
  
  // 编辑/删除心得
  Elements.quoteCard.querySelectorAll('[data-action="edit-note"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const noteId = btn.dataset.noteId;
      const note = getNoteById(quote.id, noteId);
      if (note) {
        openNoteModal(quote.id, note);
      }
    });
  });
  
  Elements.quoteCard.querySelectorAll('[data-action="delete-note"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const noteId = btn.dataset.noteId;
      deleteNote(quote.id, noteId);
    });
  });
  
  // 键盘翻页
  document.onkeydown = (e) => {
    if (AppState.currentView !== 'home') return;
    
    // 上滑/swipe up/键盘下键/右键 -> 随机下一条
    // 下滑/swipe down/键盘上键/左键 -> 回到上一条
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      nextQuote();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      prevQuote();
    }
  };
}

// ========================================
// 沉浸阅读视图
// ========================================
let immersiveQuote = null; // 保存当前沉浸视图的语录
let immersivePreviousView = 'home'; // 记住沉浸视图的来源页面

function openImmersiveView(quote) {
  immersiveQuote = quote; // 保存当前语录引用
  // 记住从哪个视图进来的，返回时回去
  immersivePreviousView = AppState.currentView;
  Elements.immersiveContent.innerHTML = renderImmersiveContent(quote);
  switchView('immersive');
  
  // 绑定返回按钮
  const backBtn = Elements.views.immersive.querySelector('.immersive-back');
  if (backBtn) {
    backBtn.onclick = () => {
      immersiveQuote = null;
      // 如果从分类详情进来，返回分类详情
      if (immersivePreviousView === 'categoryDetail' && AppState.currentCategory) {
        openCategoryDetail(AppState.currentCategory);
      } else {
        switchView('home');
      }
    };
  }
  
  // 点击"观心录"标题编辑
  const brandEl = document.getElementById('immersiveBrand');
  if (brandEl) {
    brandEl.onclick = () => {
      if (immersiveQuote) {
        openEditModal(immersiveQuote);
      }
    };
  }
  
  // 右上角"编"字按钮编辑
  const editBtn = document.getElementById('immersiveEditBtn');
  if (editBtn) {
    editBtn.onclick = () => {
      if (immersiveQuote) {
        openEditModal(immersiveQuote);
      }
    };
  }
  
  // 底部浮动"编"字按钮编辑
  const fabBtn = document.getElementById('immersiveFab');
  if (fabBtn) {
    fabBtn.onclick = () => {
      if (immersiveQuote) {
        openEditModal(immersiveQuote);
      }
    };
  }
}

function renderImmersiveContent(quote) {
  let html = '';
  
  if (quote.title) {
    html += `<h1 class="immersive-title">${escapeHtml(quote.title)}</h1>`;
  }
  
  // 根据类型渲染不同内容
  switch (quote.type) {
    case 'negative':
      html += `<div class="immersive-warning">知此套路，不为所惑</div>`;
      html += `<div class="immersive-text">${parseMarkdown(quote.text)}</div>`;
      break;
    case 'caution':
      html += `<div class="immersive-caution">内容需专业验证，请谨慎参考</div>`;
      html += `<div class="immersive-text">${parseMarkdown(quote.text)}</div>`;
      break;
    default:
      html += `<div class="immersive-text">${parseMarkdown(quote.text)}</div>`;
  }
  
  // 添加标签
  html += `<div class="quote-tags" style="margin-top: 40px; text-align: center;">`;
  html += quote.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
  if (quote.isUserCreated) {
    html += '<span class="user-quote-badge">自</span>';
  }
  html += `</div>`;
  
  return html;
}

// ========================================
// 分类视图
// ========================================
function renderCategoryView() {
  const categories = getAllCategories();
  
  let html = '';
  categories.forEach(cat => {
    const count = getCategoryCount(cat);
    html += `
      <div class="category-item" data-category="${cat}">
        <span class="category-name">${cat}</span>
        <span class="category-count">${count}条</span>
      </div>
    `;
  });
  
  Elements.categoryList.innerHTML = html || '<p class="empty-hint">暂无分类</p>';
  
  // 绑定点击事件
  Elements.categoryList.querySelectorAll('.category-item').forEach(item => {
    item.addEventListener('click', () => {
      openCategoryDetail(item.dataset.category);
    });
  });
}

function getAllCategories() {
  const cats = new Set();
  AppState.allQuotes.forEach(quote => {
    if (quote.tags) {
      quote.tags.forEach(tag => cats.add(tag));
    }
  });
  return Array.from(cats).sort();
}

function getCategoryCount(category) {
  return AppState.allQuotes.filter(q => q.tags && q.tags.includes(category)).length;
}

function openCategoryDetail(category) {
  AppState.currentCategory = category;
  Elements.categoryTitle.textContent = category;
  
  const quotes = AppState.allQuotes.filter(q => q.tags && q.tags.includes(category));
  
  let html = '';
  quotes.forEach(quote => {
    const textPreview = quote.text.split('\n')[0].substring(0, 60) + (quote.text.length > 60 ? '...' : '');
    html += `
      <div class="category-quote-item" data-id="${quote.id}">
        <div class="category-quote-main">
          <p class="quote-preview-text">${escapeHtml(textPreview)}</p>
          <div class="quote-meta">
            <span class="type-badge">${getTypeName(quote.type)}</span>
            ${AppState.favorites.includes(quote.id) ? '<span class="type-badge">已收藏</span>' : ''}
            ${quote.isUserCreated ? '<span class="type-badge">自</span>' : ''}
          </div>
        </div>
      </div>
    `;
  });
  
  Elements.categoryQuotes.innerHTML = html;
  
  // 绑定点击事件
  Elements.categoryQuotes.querySelectorAll('.category-quote-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // 如果点击的是删除按钮，不跳转
      if (e.target.classList.contains('delete-btn')) {
        e.stopPropagation();
        const id = parseInt(item.dataset.id);
        if (confirm('确定删除这条语录？')) {
          deleteQuote(id);
          // 重新渲染分类详情
          openCategoryDetail(AppState.currentCategory);
        }
        return;
      }
      const id = parseInt(item.dataset.id);
      const quote = AppState.allQuotes.find(q => q.id === id);
      if (quote) {
        openImmersiveView(quote);
      }
    });
  });
  
  switchView('categoryDetail');
}

// ========================================
// 搜索视图
// ========================================
function renderSearchView() {
  Elements.searchResults.innerHTML = '<p class="search-hint">输入关键词搜索</p>';
  Elements.searchInput.value = '';
}

function performSearch(query) {
  if (!query.trim()) {
    Elements.searchResults.innerHTML = '<p class="search-hint">输入关键词搜索</p>';
    return;
  }
  
  const results = AppState.allQuotes.filter(q => {
    const textMatch = q.text.toLowerCase().includes(query.toLowerCase());
    const titleMatch = q.title && q.title.toLowerCase().includes(query.toLowerCase());
    const tagMatch = q.tags && q.tags.some(t => t.toLowerCase().includes(query.toLowerCase()));
    return textMatch || titleMatch || tagMatch;
  });
  
  if (results.length === 0) {
    Elements.searchResults.innerHTML = '<p class="search-hint">未找到相关语录</p>';
    return;
  }
  
  let html = '';
  results.forEach(quote => {
    const textPreview = quote.text.split('\n')[0].substring(0, 60) + (quote.text.length > 60 ? '...' : '');
    html += `
      <div class="search-result-item" data-id="${quote.id}">
        <p class="result-text">${escapeHtml(textPreview)}</p>
        <div class="result-tags">
          ${quote.tags.map(tag => `<span class="result-tag">${tag}</span>`).join('')}
        </div>
      </div>
    `;
  });
  
  Elements.searchResults.innerHTML = html;
  
  // 绑定点击事件
  Elements.searchResults.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.id);
      const index = AppState.allQuotes.findIndex(q => q.id === id);
      if (index !== -1) {
        AppState.currentIndex = index;
        switchView('home');
      }
    });
  });
}

// ========================================
// 收藏视图
// ========================================
function renderFavoritesView() {
  if (AppState.favorites.length === 0) {
    Elements.favoritesList.innerHTML = '<p class="empty-hint">暂无收藏</p>';
    return;
  }
  
  const favorites = AppState.favorites.map(id => AppState.allQuotes.find(q => q.id === id)).filter(Boolean);
  
  let html = '';
  favorites.forEach(quote => {
    const textPreview = quote.text.split('\n')[0].substring(0, 60) + (quote.text.length > 60 ? '...' : '');
    html += `
      <div class="favorite-item" data-id="${quote.id}">
        <p class="item-text">${escapeHtml(textPreview)}</p>
        <div class="item-tags">
          ${quote.tags.map(tag => `<span class="item-tag">${tag}</span>`).join('')}
        </div>
      </div>
    `;
  });
  
  Elements.favoritesList.innerHTML = html;
  
  // 绑定点击事件
  Elements.favoritesList.querySelectorAll('.favorite-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.id);
      const index = AppState.allQuotes.findIndex(q => q.id === id);
      if (index !== -1) {
        AppState.currentIndex = index;
        switchView('home');
      }
    });
  });
}

// ========================================
// 翻页逻辑
// ========================================
function nextQuote() {
  // 向上滑 -> 随机新语录
  // 如果历史记录后面还有，前进
  if (AppState.historyIndex < AppState.browseHistory.length - 1) {
    AppState.historyIndex++;
    AppState.currentIndex = AppState.browseHistory[AppState.historyIndex];
  } else {
    // 随机选一条新的（避免重复当前）
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * AppState.allQuotes.length);
    } while (newIndex === AppState.currentIndex && AppState.allQuotes.length > 1);
    AppState.browseHistory.push(newIndex);
    AppState.historyIndex = AppState.browseHistory.length - 1;
    AppState.currentIndex = newIndex;
  }
  renderHomeView();
}

function prevQuote() {
  // 向下滑 -> 回到上一条
  if (AppState.historyIndex > 0) {
    AppState.historyIndex--;
    AppState.currentIndex = AppState.browseHistory[AppState.historyIndex];
    renderHomeView();
  }
  // 如果已经是第一条，不做任何事（静默忽略）
}

// ========================================
// 收藏功能
// ========================================
async function toggleFavorite(id) {
  const index = AppState.favorites.indexOf(id);
  if (index === -1) {
    AppState.favorites.push(id);
  } else {
    AppState.favorites.splice(index, 1);
  }
  
  await saveUserData();
  renderHomeView();
}

// ========================================
// 心得功能
// ========================================
function openNoteModal(quoteId, existingNote = null) {
  AppState.editingNoteId = existingNote ? existingNote.id : null;
  AppState.currentNoteQuoteId = quoteId;
  
  Elements.noteText.value = existingNote ? existingNote.text : '';
  Elements.noteModal.classList.add('active');
  Elements.noteText.focus();
}

function closeNoteModal() {
  Elements.noteModal.classList.remove('active');
  Elements.noteText.value = '';
  AppState.editingNoteId = null;
  AppState.currentNoteQuoteId = null;
}

// ========================================
// 编辑语录模态框
// ========================================
let editingQuoteId = null;

function openEditModal(quote) {
  editingQuoteId = quote.id;
  document.getElementById('editTitle').value = quote.title || '';
  document.getElementById('editText').value = quote.text || '';
  document.getElementById('editTags').value = (quote.tags || []).join('，');
  document.getElementById('editModal').classList.add('show');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('show');
  editingQuoteId = null;
}

async function saveEdit() {
  if (!editingQuoteId) return;
  
  const newTitle = document.getElementById('editTitle').value.trim();
  let newText = document.getElementById('editText').value.trim();
  const newTags = document.getElementById('editTags').value.split(/[，,]/).map(t => t.trim()).filter(t => t);
  
  if (!newText) {
    showToast('内容不能为空');
    return;
  }
  
  // 自动排版（如果用户修改了内容）
  newText = autoFormatText(newText);
  
  // 找到语录并更新
  const quoteIndex = AppState.allQuotes.findIndex(q => q.id === editingQuoteId);
  if (quoteIndex !== -1) {
    AppState.allQuotes[quoteIndex].title = newTitle;
    AppState.allQuotes[quoteIndex].text = newText;
    AppState.allQuotes[quoteIndex].tags = newTags;
    
    // 如果是用户创建的语录（id >= 1001），直接更新 userQuotes
    if (editingQuoteId >= CONFIG.USER_QUOTE_START_ID) {
      const userIndex = AppState.userQuotes.findIndex(q => q.id === editingQuoteId);
      if (userIndex !== -1) {
        AppState.userQuotes[userIndex].title = newTitle;
        AppState.userQuotes[userIndex].text = newText;
        AppState.userQuotes[userIndex].tags = newTags;
      }
    } else {
      // 静态语录的修改通过 isOverride 覆盖记录来保存
      const existingOverride = AppState.userQuotes.findIndex(q => q.id === editingQuoteId && q.isOverride);
      if (existingOverride !== -1) {
        AppState.userQuotes[existingOverride].title = newTitle;
        AppState.userQuotes[existingOverride].text = newText;
        AppState.userQuotes[existingOverride].tags = newTags;
      } else {
        AppState.userQuotes.push({
          id: editingQuoteId,
          title: newTitle,
          text: newText,
          tags: newTags,
          isOverride: true
        });
      }
    }
    
    // 保存用户数据（GitHub同步）
    await saveUserData();
    
    // 重新渲染
    renderHomeView();
    closeEditModal();
    showToast('已保存');
  }
}

async function saveNote() {
  const text = Elements.noteText.value.trim();
  if (!text) return;
  
  if (!AppState.notes[AppState.currentNoteQuoteId]) {
    AppState.notes[AppState.currentNoteQuoteId] = [];
  }
  
  if (AppState.editingNoteId) {
    // 编辑现有心得
    const noteIndex = AppState.notes[AppState.currentNoteQuoteId].findIndex(n => n.id === AppState.editingNoteId);
    if (noteIndex !== -1) {
      AppState.notes[AppState.currentNoteQuoteId][noteIndex].text = text;
      AppState.notes[AppState.currentNoteQuoteId][noteIndex].time = new Date().toISOString();
    }
  } else {
    // 新增心得
    const newNote = {
      id: 'n' + Date.now(),
      text: text,
      time: new Date().toISOString()
    };
    AppState.notes[AppState.currentNoteQuoteId].push(newNote);
  }
  
  await saveUserData();
  closeNoteModal();
  renderHomeView();
}

function getNoteById(quoteId, noteId) {
  const notes = AppState.notes[quoteId] || [];
  return notes.find(n => n.id === noteId);
}

async function deleteNote(quoteId, noteId) {
  if (!AppState.notes[quoteId]) return;
  
  const noteIndex = AppState.notes[quoteId].findIndex(n => n.id === noteId);
  if (noteIndex !== -1) {
    AppState.notes[quoteId].splice(noteIndex, 1);
    await saveUserData();
    renderHomeView();
  }
}

// ========================================
// 自动排版与类型识别
// ========================================

/**
 * 自动排版文本
 * - 统一换行符
 * - 自动分段
 * - 添加 Markdown 格式
 */
function autoFormatText(text) {
  if (!text || text.trim().length === 0) return text;
  
  let formatted = text.trim();
  
  // 1. 统一换行符
  formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // 2. 去掉多余空行
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  
  // 3. 如果已经有 Markdown 格式，不做额外处理
  if (formatted.includes('##') || formatted.match(/^[-*] /m)) {
    return formatted;
  }
  
  // 4. 单换行升级为段落分隔（保留用户的换行意图）
  formatted = formatted.replace(/(?<!\n)\n(?!\n)/g, '\n\n');
  
  // 5. 保护数字中的逗号
  formatted = formatted.replace(/(\d),(?=\d)/g, '$1§NUM_COMMA§');
  formatted = formatted.replace(/,/g, '，');
  formatted = formatted.replace(/，{2,}/g, '，');
  formatted = formatted.replace(/§NUM_COMMA§/g, ',');
  
  // 6. 在句号/问号/感叹号后分段（每2句一段）
  let sentenceCount = 0;
  formatted = formatted.replace(/([。！？])/g, (punc) => {
    sentenceCount++;
    if (sentenceCount % 2 === 0) {
      return punc + '\n\n';
    }
    return punc;
  });
  
  // 7. 超长段落（超过120字无句号的），在逗号后每3个分段
  const paragraphs = formatted.split('\n\n');
  const result = paragraphs.map(para => {
    if (para.length > 120 && !para.match(/[。！？]/)) {
      let count = 0;
      return para.replace(/([，,])/g, (punc) => {
        count++;
        if (count % 3 === 0) {
          return punc + '\n\n';
        }
        return punc;
      });
    }
    return para;
  });
  formatted = result.join('\n\n');
  
  // 最终清理
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  formatted = formatted.trim();
  
  return formatted;
}

/**
 * 自动识别内容类型
 */
function autoDetectType(text) {
  const len = text.replace(/\s/g, '').length;
  
  // 短句：50字以内
  if (len <= 50) return 'short';
  
  // 含"步骤/方法/操作/怎么做"→ guide
  if (/步骤|方法|操作|怎么做|实操|攻略/.test(text)) return 'guide';
  
  // 含"案例/拆解/玩法/套路"→ business
  if (/案例|拆解|玩法|套路|单品|爆品/.test(text)) return 'business';
  
  // 含"第一/第二/三个/四步/层"→ framework
  if (/第[一二三四五六七八九十]+[点步层方面]|三个|四个|五步|三层/.test(text)) return 'framework';
  
  // 含"解读/理解/意思"→ interpret
  if (/解读|理解|意思是|通俗来说/.test(text)) return 'interpret';
  
  // 含"对还是错/怎么看/争论"→ debate
  if (/对还是错|怎么看|是对是错|争论/.test(text)) return 'debate';
  
  // 超过500字 → deep
  if (len > 500) return 'deep';
  
  // 默认 long
  return 'long';
}

// ========================================
// 添加语录表单
// ========================================

// 自动识别标题和标签
let autoDetectDebounce = null;

function autoDetectTitleAndTags(text) {
  const titleInput = document.getElementById('quoteTitle');
  const tagSelector = Elements.tagSelector;
  
  // 自动标题：取前15字（如果用户没有手动填写）
  if (!titleInput.value.trim() && text && text.trim()) {
    const cleanText = text.replace(/\n/g, ' ').trim();
    let title = cleanText.substring(0, 15);
    if (cleanText.length > 15) title += '...';
    titleInput.value = title;
  }
  
  // 自动标签匹配
  const tagKeywords = {
    '商业': ['赚钱', '钱', '利润', '收入', '商业', '创业', '生意', '老板', '客户'],
    '电商': ['买', '卖', '电商', '投放', '流量', '平台'],
    '金融': ['投资', '股票', '基金', '贷款', '房贷', '金融', '通胀', '银行', '杠杆'],
    '制度': ['制度', '权利', '政策', '法律', '规则', '公平'],
    '认知': ['思维', '认知', '开窍', '觉悟', '思考', '理解', '视角'],
    '修心': ['心', '道', '善', '修', '悟', '禅', '静', '谦虚', '敬畏'],
    '行事': ['做', '行', '干', '动', '实践', '行动', '方法', '执行'],
    '处世': ['人', '处世', '社交', '关系', '面子', '人情'],
    '破局': ['破', '局', '逆袭', '翻身', '绝境', '突破'],
    '谋略': ['谋', '计', '策', '兵', '战略', '战术'],
    '命理': ['命', '运', '风水', '八字', '卦', '易经'],
    '警醒': ['警', '醒', '负面', '灰色', '警示', '危险'],
    '管理': ['管理', '团队', '领导', '干部', '员工'],
    '健康': ['健康', '养生', '药', '方', '补'],
    '法律': ['法律', '诉讼', '裁判', '判决'],
  };
  
  const matchedTags = [];
  for (const [tag, keywords] of Object.entries(tagKeywords)) {
    if (keywords.some(kw => text.includes(kw))) {
      matchedTags.push(tag);
    }
  }
  
  // 自动勾选匹配的标签（最多3个，且只在用户没有手动选择时）
  if (AppState.selectedTags.length === 0) {
    const tagsToSelect = matchedTags.slice(0, 3);
    tagsToSelect.forEach(tagName => {
      const tagEl = tagSelector.querySelector(`[data-tag="${tagName}"]`);
      if (tagEl) {
        tagEl.classList.add('selected');
      }
    });
    updateSelectedTags();
  }
}

function setupAddQuoteForm() {
  // textarea 输入时自动识别（debounce 300ms）
  const contentTextarea = document.getElementById('quoteContent');
  if (contentTextarea) {
    contentTextarea.addEventListener('input', (e) => {
      clearTimeout(autoDetectDebounce);
      autoDetectDebounce = setTimeout(() => {
        autoDetectTitleAndTags(e.target.value);
      }, 300);
    });
  }
  
  Elements.addQuoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    let content = document.getElementById('quoteContent').value.trim();
    const title = document.getElementById('quoteTitle').value.trim();
    const type = document.getElementById('quoteType').value;
    const tone = document.querySelector('input[name="tone"]:checked').value;
    const tags = AppState.selectedTags;
    
    if (!content) {
      showToast('请输入内容');
      return;
    }
    
    // 自动排版
    content = autoFormatText(content);
    
    // 自动识别类型（如果用户没手动选且选择了默认选项）
    let finalType = type;
    if (type === 'long' || !type) {
      finalType = autoDetectType(content);
    }
    
    // 如果用户没有填写标题，使用自动识别的标题
    const finalTitle = title || document.getElementById('quoteTitle').value;
    
    const quoteData = {
      type: finalType,
      title: finalTitle,
      text: content,
      tags,
      tone
    };
    
    await addQuote(quoteData);
    
    // 重置表单
    Elements.addQuoteForm.reset();
    clearTagSelector();
    
    // 显示成功提示
    showToast('已收录');
    
    // 跳转到首页
    switchView('home');
  });
}

// ========================================
// 工具函数
// ========================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getExcerpt(text, maxLength) {
  const plainText = text.replace(/\n/g, ' ').replace(/#+\s/g, '');
  if (plainText.length <= maxLength) return plainText;
  return plainText.substring(0, maxLength) + '...';
}

function parseInterpretContent(text) {
  const parts = text.split('\n\n');
  return {
    original: parts[0] || text,
    interpretation: parts.slice(1).join('\n\n')
  };
}

function highlightBusiness(text) {
  return text.replace(/\*\*(.*?)\*\*/g, '<span class="highlight">$1</span>');
}

function parseMarkdown(text) {
  let html = escapeHtml(text);
  
  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // 加粗
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // 列表
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // 段落
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '');
  
  return html;
}

function getTypeName(type) {
  const names = {
    short: '短句',
    interpret: '解读',
    long: '长文',
    debate: '思辨',
    business: '商业',
    framework: '认知框架',
    deep: '深度',
    guide: '实操',
    negative: '负面',
    caution: '需验证'
  };
  return names[type] || type;
}

function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ========================================
// 事件绑定
// ========================================
function bindEvents() {
  // 搜索输入
  Elements.searchInput.addEventListener('input', (e) => {
    performSearch(e.target.value);
  });
  
  // 心得弹窗
  Elements.noteCancel.addEventListener('click', closeNoteModal);
  Elements.noteSave.addEventListener('click', saveNote);
  
  // 编辑模态框
  document.getElementById('editCancel').addEventListener('click', closeEditModal);
  document.getElementById('editSave').addEventListener('click', saveEdit);
  document.getElementById('editDelete').addEventListener('click', async () => {
    if (editingQuoteId && confirm('确定删除这条语录？')) {
      const idToDelete = editingQuoteId;
      await deleteQuote(idToDelete);
      closeEditModal();
      // 如果在分类详情页，需要重新渲染
      if (AppState.currentCategory) {
        openCategoryDetail(AppState.currentCategory);
      } else {
        renderHomeView();
      }
    }
  });
  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditModal();
  });
  
  // 点击弹窗外部关闭
  Elements.noteModal.addEventListener('click', (e) => {
    if (e.target === Elements.noteModal) {
      closeNoteModal();
    }
  });
  
  // 添加语录表单
  setupAddQuoteForm();
}

// ========================================
// 启动应用
// ========================================
document.addEventListener('DOMContentLoaded', init);
