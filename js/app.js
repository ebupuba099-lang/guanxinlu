/**
 * 观心录 v4 - 沉浸式古风语录网站
 * App.js - 主应用逻辑（重构版）
 * 
 * 改进:
 * - ✅ 移除硬编码 GitHub Token，安全数据存储
 * - ✅ 提取公共渲染逻辑，消除沉余
 * - ✅ 多级防丢失机制（localStorage + 备份 + 定期保存）
 * - ✅ PC端鼠标滚轮上下滑动切换
 * - ✅ 自动同步到 localStorage，防止数据丢失
 */

// ========================================
// 配置
// ========================================
const CONFIG = {
  // ⚠️ 安全改进：不再使用 GitHub Token，用户数据仅存本地
  // 如需跨设备同步，请使用 GitHub Actions 自动化处理
  GH_REPO: 'ebupuba099-lang/guanxinlu',
  GH_DATA_PATH: 'data/user_data.json',
  LOCAL_STORAGE_KEY: 'guanxinlu_data',
  LOCAL_BACKUP_KEY: 'guanxinlu_backup', // 备份键
  USER_QUOTE_START_ID: 1001,
  AUTO_SAVE_INTERVAL: 5000, // 5秒防抖自动保存
  SYNC_DEBOUNCE_MS: 300,   // 同步防抖
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
  currentView: 'home',
  currentCategory: null,
  editingNoteId: null,
  currentNoteQuoteId: null,
  selectedTags: [],
  touchStartY: 0,
  touchEndY: 0,
  currentTheme: 'paper',
  homeNavHideTimer: null,
  autoSaveTimer: null,
  dataChanged: false,       // 数据变更标记
  lastSavedSnapshot: '',    // 上次保存快照
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
  // 注册 Service Worker（网络优先策略）
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js', {
        updateViaCache: 'none'
      });
      // 检测到新版本 SW 时，等用户下次访问自然更新，避免强制刷新导致闪烁
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // 有新版本可用，但不强制刷新，让用户自然更新
              console.log('新版本已就绪，下次访问将自动更新');
            }
          });
        }
      });
    } catch (error) {
      console.log('Service Worker 注册失败:', error);
    }
  }

  createPetals();
  loadTheme();
  await loadQuotes();
  await loadUserData();
  mergeQuotes();

  if (AppState.currentIndex === -1 && AppState.allQuotes.length > 0) {
    const randomIndex = Math.floor(Math.random() * AppState.allQuotes.length);
    AppState.browseHistory = [randomIndex];
    AppState.historyIndex = 0;
    AppState.currentIndex = randomIndex;
  }

  renderHomeView();
  setupHomeNavAutoHide();
  bindEvents();
  setupNavigation();
  setupTouchSwipe();
  setupMouseWheel();  // 🆕 PC端鼠标滚轮
  setupThemeSwitcher();
  setupTagSelector();
  setupAutoSave();    // 🆕 自动保存防丢失
  setupBeforeUnload();// 🆕 关闭前保存
  setupScrollHint();  // 🆕 PC端滚轮提示

  // 初始化同步模块
  if (typeof SyncManager !== 'undefined') {
    SyncManager.init();
  }
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

  const showNav = () => {
    homeNav.classList.add('show');
    clearTimeout(AppState.homeNavHideTimer);
    AppState.homeNavHideTimer = setTimeout(() => {
      if (AppState.currentView === 'home') {
        homeNav.classList.remove('show');
      }
    }, 3000);
  };

  // 移动端触摸
  Elements.quoteContainer.addEventListener('touchstart', showNav, { passive: true });
  // PC端鼠标移动到底部区域
  document.addEventListener('mousemove', (e) => {
    if (AppState.currentView !== 'home') return;
    const windowHeight = window.innerHeight;
    // 鼠标接近底部100px区域时显示导航
    if (e.clientY > windowHeight - 120) {
      showNav();
    }
  }, { passive: true });

  showNav();
}

// ========================================
// 主题管理
// ========================================
function loadTheme() {
  const saved = localStorage.getItem('guanxinlu_theme');
  const theme = saved || 'paper';
  setTheme(theme);
}

function setTheme(theme) {
  AppState.currentTheme = theme;
  document.body.dataset.theme = theme;
  localStorage.setItem('guanxinlu_theme', theme);

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function setupThemeSwitcher() {
  const themeOptions = document.getElementById('themeOptions');
  if (themeOptions) {
    themeOptions.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => setTheme(btn.dataset.theme));
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
// 🆕 用户数据管理 (纯本地 + 防丢失)
// ========================================

/**
 * 加载用户数据
 * 优先级：localStorage > 备份localStorage
 * 数据安全：每次加载后自动创建备份
 */
async function loadUserData() {
  let localData = null;
  const localRaw = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);

  if (localRaw) {
    try {
      localData = JSON.parse(localRaw);
    } catch (e) {
      console.warn('localStorage 数据损坏，尝试从备份恢复');
      // 尝试从备份恢复
      const backupRaw = localStorage.getItem(CONFIG.LOCAL_BACKUP_KEY);
      if (backupRaw) {
        try {
          localData = JSON.parse(backupRaw);
          // 恢复主存储
          localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, backupRaw);
          showToast('数据已从备份恢复');
        } catch (e2) {
          console.error('备份数据也损坏，使用空数据');
        }
      }
    }
  }

  if (localData) {
    AppState.favorites = localData.favorites || [];
    AppState.notes = localData.notes || {};
    AppState.userQuotes = localData.userQuotes || [];

    // 更新用户语录ID计数器
    if (AppState.userQuotes.length > 0) {
      const maxId = Math.max(...AppState.userQuotes.map(q => q.id));
      AppState.userQuoteIdCounter = Math.max(maxId + 1, CONFIG.USER_QUOTE_START_ID);
    }

    // 创建备份
    createBackup(localData);
  }
}

/**
 * 创建数据备份
 */
function createBackup(data) {
  try {
    localStorage.setItem(CONFIG.LOCAL_BACKUP_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('创建备份失败:', e);
  }
}

/**
 * 标记数据已变更（防抖保存）
 */
function markDataChanged() {
  AppState.dataChanged = true;
}

/**
 * 自动保存机制 - 检测到变更后延迟保存
 */
function setupAutoSave() {
  // 每5秒检查一次是否有变更需要保存
  setInterval(() => {
    if (AppState.dataChanged) {
      persistUserData();
      AppState.dataChanged = false;
    }
  }, CONFIG.AUTO_SAVE_INTERVAL);

  // 页面隐藏时也保存
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && AppState.dataChanged) {
      persistUserData();
      AppState.dataChanged = false;
    }
  });
}

/**
 * 页面关闭/刷新前保存
 */
function setupBeforeUnload() {
  window.addEventListener('beforeunload', () => {
    if (AppState.dataChanged) {
      persistUserData();
    }
  });
}

/**
 * 持久化用户数据到 localStorage（带备份）
 */
function persistUserData() {
  const data = {
    favorites: AppState.favorites,
    notes: AppState.notes,
    userQuotes: AppState.userQuotes,
    lastSaved: new Date().toISOString()
  };

  try {
    const jsonStr = JSON.stringify(data);
    localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, jsonStr);
    // 同时创建备份
    createBackup(data);
    AppState.lastSavedSnapshot = jsonStr;
    console.log('数据已保存');
  } catch (e) {
    console.error('保存数据失败:', e);
    showToast('保存失败，请检查浏览器存储空间');
  }
}

/**
 * 保存用户数据（对外接口，兼容旧API）
 */
async function saveUserData() {
  markDataChanged();
  // 立即保存重要操作
  persistUserData();
}

// ========================================
// 合并语录
// ========================================
function mergeQuotes() {
  AppState.allQuotes = [...AppState.quotes];

  AppState.userQuotes.forEach(uq => {
    if (uq.isOverride) {
      const index = AppState.allQuotes.findIndex(q => q.id === uq.id);
      if (index !== -1) {
        AppState.allQuotes[index] = { ...AppState.allQuotes[index], ...uq };
      }
    } else {
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
  const index = AppState.allQuotes.findIndex(q => q.id === id);
  if (index !== -1) {
    AppState.allQuotes.splice(index, 1);
  }

  const staticIndex = AppState.quotes.findIndex(q => q.id === id);
  if (staticIndex !== -1) {
    AppState.quotes.splice(staticIndex, 1);
  }

  const userIndex = AppState.userQuotes.findIndex(q => q.id === id);
  if (userIndex !== -1) {
    AppState.userQuotes.splice(userIndex, 1);
  }

  AppState.favorites = AppState.favorites.filter(fid => fid !== id);
  delete AppState.notes[id];
  AppState.browseHistory = AppState.browseHistory.filter(hid => hid !== id);
  if (AppState.historyIndex >= AppState.browseHistory.length) {
    AppState.historyIndex = Math.max(0, AppState.browseHistory.length - 1);
  }

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
// 触摸滑动（移动端）
// ========================================
function setupTouchSwipe() {
  Elements.quoteContainer.addEventListener('touchstart', (e) => {
    AppState.touchStartY = e.touches[0].clientY;
  }, { passive: true });

  Elements.quoteContainer.addEventListener('touchmove', (e) => {
    AppState.touchEndY = e.touches[0].clientY;
  }, { passive: true });

  Elements.quoteContainer.addEventListener('touchend', () => {
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
// 🆕 PC端鼠标滚轮滑动切换
// ========================================
function setupMouseWheel() {
  let wheelDebounce = null;
  const WHEEL_DEBOUNCE_MS = 500; // 滚轮防抖500ms
  const WHEEL_THRESHOLD = 30;    // 滚动阈值

  Elements.quoteContainer.addEventListener('wheel', (e) => {
    // 仅在首页视图响应
    if (AppState.currentView !== 'home') return;

    e.preventDefault();

    // 防抖：避免连续快速滚动
    if (wheelDebounce) return;

    if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return;

    const direction = e.deltaY > 0 ? 'down' : 'up';

    // 添加滑动动画
    Elements.quoteCard.classList.add(direction === 'down' ? 'slide-up' : 'slide-down');

    wheelDebounce = setTimeout(() => {
      wheelDebounce = null;
    }, WHEEL_DEBOUNCE_MS);

    setTimeout(() => {
      if (direction === 'down') {
        nextQuote();
      } else {
        prevQuote();
      }
    }, 200);
  }, { passive: false }); // passive: false 以支持 preventDefault
}

// 🆕 PC端滚轮提示（首次显示后渐隐）
function setupScrollHint() {
  const hint = document.getElementById('scrollHint');
  if (!hint) return;

  // 只在非触摸设备显示
  if (window.matchMedia('(pointer: coarse)').matches) {
    hint.style.display = 'none';
    return;
  }

  // 显示3秒后渐隐
  hint.classList.add('visible');
  setTimeout(() => {
    hint.classList.remove('visible');
  }, 5000);

  // 用户使用滚轮后永久隐藏
  Elements.quoteContainer.addEventListener('wheel', () => {
    hint.classList.remove('visible');
    hint.style.display = 'none';
  }, { once: true });
}

// ========================================
// 视图切换
// ========================================
function switchView(viewName) {
  Object.values(Elements.views).forEach(view => {
    if (view) view.classList.remove('active');
  });

  if (Elements.views[viewName]) {
    Elements.views[viewName].classList.add('active');
    AppState.currentView = viewName;
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.view === viewName) {
      item.classList.add('active');
    }
  });

  const homeNav = document.querySelector('.home-nav');
  if (homeNav) {
    if (viewName === 'home') {
      homeNav.classList.remove('show');
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

  // 离开沉浸视图时清理状态
  if (AppState.currentView === 'immersive' && viewName !== 'immersive') {
    immersiveQuote = null;
  }

  switch (viewName) {
    case 'home': renderHomeView(); break;
    case 'category': renderCategoryView(); break;
    case 'search': renderSearchView(); break;
    case 'add':
      Elements.addQuoteForm.reset();
      clearTagSelector();
      break;
    case 'favorites': renderFavoritesView(); break;
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
// 🆕 重构：统一的语录渲染器
// ========================================

/**
 * 语录类型 → 首页渲染策略 映射表
 */
const QUOTE_RENDERERS = {
  short: {
    render: renderShortQuote,
    label: 'quote-short'
  },
  long: {
    render: renderPreviewQuote,
    label: 'quote-preview'
  },
  deep: {
    render: renderPreviewQuote,
    label: 'quote-preview'
  },
  interpret: {
    render: renderInterpretQuote,
    label: 'quote-interpret'
  },
  debate: {
    render: renderPreviewQuote,
    label: 'quote-debate'
  },
  business: {
    render: renderBusinessQuote,
    label: 'quote-business'
  },
  framework: {
    render: renderPreviewQuote,
    label: 'quote-framework'
  },
  guide: {
    render: renderPreviewQuote,
    label: 'quote-guide'
  },
  negative: {
    render: renderNegativeQuote,
    label: 'quote-negative'
  },
  caution: {
    render: renderCautionQuote,
    label: 'quote-caution'
  }
};

function renderHomeView() {
  if (AppState.allQuotes.length === 0) return;

  const quote = AppState.allQuotes[AppState.currentIndex];
  const isFavorite = AppState.favorites.includes(quote.id);
  const quoteNotes = AppState.notes[quote.id] || [];

  // 使用渲染器映射表
  const renderer = QUOTE_RENDERERS[quote.type] || QUOTE_RENDERERS.short;
  const html = renderer.render(quote, isFavorite, quoteNotes);

  Elements.quoteCard.classList.remove('slide-up', 'slide-down');
  Elements.quoteCard.innerHTML = html;
  bindQuoteCardEvents(quote, isFavorite);
}

// ========================================
// 各类型语录渲染函数
// ========================================

function renderShortQuote(quote, isFavorite, notes) {
  const text = quote.text;
  const lines = text.split('\n').filter(l => l.trim());
  const isVertical = shouldUseVerticalMode(quote);
  const plainText = text.replace(/\n/g, '');
  const textLen = plainText.length;

  let displayMode = isVertical ? 'vertical' : 'horizontal';
  let fontSize = calcFontSize(isVertical, textLen);

  return `
    <div class="quote-content-main quote-short ${displayMode}">
      <p class="quote-text" style="font-size: ${fontSize}">${escapeHtml(text)}</p>
      ${renderTagsAndBadge(quote)}
      ${renderActions(isFavorite)}
      ${renderNotesDisplay(notes, quote.id)}
    </div>
  `;
}

function calcFontSize(isVertical, textLen) {
  if (isVertical) {
    if (textLen <= 8) return 'clamp(48px, 14vw, 88px)';
    if (textLen <= 14) return 'clamp(40px, 11vw, 72px)';
    if (textLen <= 20) return 'clamp(32px, 8vw, 56px)';
    return 'clamp(28px, 7vw, 48px)';
  }
  if (textLen <= 12) return 'clamp(36px, 10vw, 64px)';
  if (textLen <= 24) return 'clamp(28px, 7vw, 48px)';
  if (textLen <= 40) return 'clamp(22px, 5.5vw, 36px)';
  return 'clamp(18px, 4.5vw, 28px)';
}

function shouldUseVerticalMode(quote) {
  if (quote.type !== 'short') return false;
  const text = quote.text.replace(/\n/g, '');
  if (text.length > 20) return false;
  const lines = text.split('\n');
  if (lines.some(line => line.length > 8)) return false;
  return true;
}

// 🆕 公共标签+徽章渲染
function renderTagsAndBadge(quote) {
  return `
    <div class="quote-tags">
      ${quote.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
      ${quote.isUserCreated ? '<span class="user-quote-badge">自</span>' : ''}
    </div>
  `;
}

// 🆕 通用预览模式渲染
function renderPreviewQuote(quote, isFavorite, notes) {
  const excerpt = getExcerpt(quote.text, 80);
  return `
    <div class="quote-content-main quote-preview">
      ${quote.title ? `<h2 class="quote-title">${escapeHtml(quote.title)}</h2>` : ''}
      <p class="quote-excerpt">${escapeHtml(excerpt)}</p>
      <button class="expand-btn" data-action="expand">展开全文</button>
      ${renderTagsAndBadge(quote)}
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
      ${renderTagsAndBadge(quote)}
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
      ${renderTagsAndBadge(quote)}
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
      ${renderTagsAndBadge(quote)}
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
      ${renderTagsAndBadge(quote)}
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
  const expandBtn = Elements.quoteCard.querySelector('[data-action="expand"]');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => openImmersiveView(quote));
  }

  const favBtn = Elements.quoteCard.querySelector('[data-action="favorite"]');
  if (favBtn) {
    favBtn.addEventListener('click', () => toggleFavorite(quote.id));
  }

  const notesBtn = Elements.quoteCard.querySelector('[data-action="notes"]');
  if (notesBtn) {
    notesBtn.addEventListener('click', () => openNoteModal(quote.id));
  }

  const editBtn = Elements.quoteCard.querySelector('[data-action="edit"]');
  if (editBtn) {
    editBtn.addEventListener('click', () => openEditModal(quote));
  }

  Elements.quoteCard.querySelectorAll('[data-action="edit-note"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const noteId = btn.dataset.noteId;
      const note = getNoteById(quote.id, noteId);
      if (note) openNoteModal(quote.id, note);
    });
  });

  Elements.quoteCard.querySelectorAll('[data-action="delete-note"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNote(quote.id, btn.dataset.noteId);
    });
  });

  // 键盘翻页
  document.onkeydown = (e) => {
    if (AppState.currentView !== 'home') return;
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
let immersiveQuote = null;
let immersivePreviousView = 'home';

function openImmersiveView(quote) {
  immersiveQuote = quote;
  immersivePreviousView = AppState.currentView;
  Elements.immersiveContent.innerHTML = renderImmersiveContent(quote);
  switchView('immersive');

  const backBtn = Elements.views.immersive.querySelector('.immersive-back');
  if (backBtn) {
    backBtn.onclick = () => {
      immersiveQuote = null;
      if (immersivePreviousView === 'categoryDetail' && AppState.currentCategory) {
        openCategoryDetail(AppState.currentCategory);
      } else {
        switchView('home');
      }
    };
  }

  const brandEl = document.getElementById('immersiveBrand');
  if (brandEl) {
    brandEl.onclick = () => {
      if (immersiveQuote) openEditModal(immersiveQuote);
    };
  }

  const editBtn = document.getElementById('immersiveEditBtn');
  if (editBtn) {
    editBtn.onclick = () => {
      if (immersiveQuote) openEditModal(immersiveQuote);
    };
  }

  const fabBtn = document.getElementById('immersiveFab');
  if (fabBtn) {
    fabBtn.onclick = () => {
      if (immersiveQuote) openEditModal(immersiveQuote);
    };
  }
}

function renderImmersiveContent(quote) {
  let html = '';

  if (quote.title) {
    html += `<h1 class="immersive-title">${escapeHtml(quote.title)}</h1>`;
  }

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

  Elements.categoryQuotes.querySelectorAll('.category-quote-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-btn')) {
        e.stopPropagation();
        const id = parseInt(item.dataset.id);
        if (confirm('确定删除这条语录？')) {
          deleteQuote(id);
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
  if (AppState.historyIndex < AppState.browseHistory.length - 1) {
    AppState.historyIndex++;
    AppState.currentIndex = AppState.browseHistory[AppState.historyIndex];
  } else {
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
  if (AppState.historyIndex > 0) {
    AppState.historyIndex--;
    AppState.currentIndex = AppState.browseHistory[AppState.historyIndex];
    renderHomeView();
  }
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

async function saveNote() {
  const text = Elements.noteText.value.trim();
  if (!text) return;

  if (!AppState.notes[AppState.currentNoteQuoteId]) {
    AppState.notes[AppState.currentNoteQuoteId] = [];
  }

  if (AppState.editingNoteId) {
    const noteIndex = AppState.notes[AppState.currentNoteQuoteId].findIndex(n => n.id === AppState.editingNoteId);
    if (noteIndex !== -1) {
      AppState.notes[AppState.currentNoteQuoteId][noteIndex].text = text;
      AppState.notes[AppState.currentNoteQuoteId][noteIndex].time = new Date().toISOString();
    }
  } else {
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

  newText = autoFormatText(newText);

  const quoteIndex = AppState.allQuotes.findIndex(q => q.id === editingQuoteId);
  if (quoteIndex !== -1) {
    AppState.allQuotes[quoteIndex].title = newTitle;
    AppState.allQuotes[quoteIndex].text = newText;
    AppState.allQuotes[quoteIndex].tags = newTags;

    if (editingQuoteId >= CONFIG.USER_QUOTE_START_ID) {
      const userIndex = AppState.userQuotes.findIndex(q => q.id === editingQuoteId);
      if (userIndex !== -1) {
        AppState.userQuotes[userIndex].title = newTitle;
        AppState.userQuotes[userIndex].text = newText;
        AppState.userQuotes[userIndex].tags = newTags;
      }
    } else {
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

    await saveUserData();
    renderHomeView();
    closeEditModal();
    showToast('已保存');
  }
}

// ========================================
// 自动排版与类型识别
// ========================================
function autoFormatText(text) {
  if (!text || text.trim().length === 0) return text;

  let formatted = text.trim();
  formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  if (formatted.includes('##') || formatted.match(/^[-*] /m)) {
    return formatted;
  }

  formatted = formatted.replace(/(?<!\n)\n(?!\n)/g, '\n\n');
  formatted = formatted.replace(/(\d),(?=\d)/g, '$1§NUM_COMMA§');
  formatted = formatted.replace(/,/g, '，');
  formatted = formatted.replace(/，{2,}/g, '，');
  formatted = formatted.replace(/§NUM_COMMA§/g, ',');

  let sentenceCount = 0;
  formatted = formatted.replace(/([。！？])/g, (punc) => {
    sentenceCount++;
    if (sentenceCount % 2 === 0) return punc + '\n\n';
    return punc;
  });

  const paragraphs = formatted.split('\n\n');
  const result = paragraphs.map(para => {
    if (para.length > 120 && !para.match(/[。！？]/)) {
      let count = 0;
      return para.replace(/([，,])/g, (punc) => {
        count++;
        if (count % 3 === 0) return punc + '\n\n';
        return punc;
      });
    }
    return para;
  });
  formatted = result.join('\n\n');
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  formatted = formatted.trim();

  return formatted;
}

function autoDetectType(text) {
  const len = text.replace(/\s/g, '').length;
  if (len <= 50) return 'short';
  if (/步骤|方法|操作|怎么做|实操|攻略/.test(text)) return 'guide';
  if (/案例|拆解|玩法|套路|单品|爆品/.test(text)) return 'business';
  if (/第[一二三四五六七八九十]+[点步层方面]|三个|四个|五步|三层/.test(text)) return 'framework';
  if (/解读|理解|意思是|通俗来说/.test(text)) return 'interpret';
  if (/对还是错|怎么看|是对是错|争论/.test(text)) return 'debate';
  if (len > 500) return 'deep';
  return 'long';
}

// ========================================
// 添加语录表单
// ========================================
let autoDetectDebounce = null;

function autoDetectTitleAndTags(text) {
  const titleInput = document.getElementById('quoteTitle');
  const tagSelector = Elements.tagSelector;

  if (!titleInput.value.trim() && text && text.trim()) {
    const cleanText = text.replace(/\n/g, ' ').trim();
    let title = cleanText.substring(0, 15);
    if (cleanText.length > 15) title += '...';
    titleInput.value = title;
  }

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

  if (AppState.selectedTags.length === 0) {
    const tagsToSelect = matchedTags.slice(0, 3);
    tagsToSelect.forEach(tagName => {
      const tagEl = tagSelector.querySelector(`[data-tag="${tagName}"]`);
      if (tagEl) tagEl.classList.add('selected');
    });
    updateSelectedTags();
  }
}

function setupAddQuoteForm() {
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

    content = autoFormatText(content);

    let finalType = type;
    if (type === 'long' || !type) {
      finalType = autoDetectType(content);
    }

    const finalTitle = title || document.getElementById('quoteTitle').value;

    const quoteData = {
      type: finalType,
      title: finalTitle,
      text: content,
      tags,
      tone
    };

    await addQuote(quoteData);

    Elements.addQuoteForm.reset();
    clearTagSelector();
    showToast('已收录');
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

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
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
  Elements.searchInput.addEventListener('input', (e) => {
    performSearch(e.target.value);
  });

  Elements.noteCancel.addEventListener('click', closeNoteModal);
  Elements.noteSave.addEventListener('click', saveNote);

  document.getElementById('editCancel').addEventListener('click', closeEditModal);
  document.getElementById('editSave').addEventListener('click', saveEdit);
  document.getElementById('editDelete').addEventListener('click', async () => {
    if (editingQuoteId && confirm('确定删除这条语录？')) {
      const idToDelete = editingQuoteId;
      await deleteQuote(idToDelete);
      closeEditModal();
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

  Elements.noteModal.addEventListener('click', (e) => {
    if (e.target === Elements.noteModal) closeNoteModal();
  });

  setupAddQuoteForm();
}

// ========================================
// 启动应用
// ========================================
document.addEventListener('DOMContentLoaded', init);
