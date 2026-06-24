/**
 * 观心录 v4 - 跨设备同步模块
 * 
 * 方案：使用 localStorage + BroadcastChannel + GitHub Gist 实现多设备同步
 * 
 * 同步策略：
 * 1. 写入：localStorage 为主存储，每次变更立即写入
 * 2. 同设备多标签页：BroadcastChannel 实时同步
 * 3. 跨设备：用户手动导出/导入，或通过 GitHub Pages 读取共享数据
 * 4. 防丢失：双份备份（主存储 + 备份存储）
 * 
 * 如需全自动跨设备同步，用户可在设置中配置 Gist ID
 */

const SyncManager = {
  // Gist 配置（用户可选配置）
  gistId: null,      // 用户手动设置
  gistToken: null,   // ⚠️ 仅建议使用有限权限的 fine-grained token

  /**
   * 初始化同步
   */
  init() {
    this.setupBroadcastChannel();
    this.loadGistConfig();
    console.log('同步模块已初始化');
  },

  /**
   * 同设备多标签页实时同步
   */
  setupBroadcastChannel() {
    if (!('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel('guanxinlu_sync');

    // 监听其他标签页的数据变更
    channel.addEventListener('message', (event) => {
      if (event.data.type === 'data_changed') {
        console.log('检测到其他标签页数据变更，重新加载');
        // 从 localStorage 重新加载数据
        const localRaw = localStorage.getItem('guanxinlu_data');
        if (localRaw) {
          try {
            const data = JSON.parse(localRaw);
            AppState.favorites = data.favorites || [];
            AppState.notes = data.notes || {};
            AppState.userQuotes = data.userQuotes || [];
            mergeQuotes();
            if (AppState.currentView === 'home') {
              renderHomeView();
            } else if (AppState.currentView === 'favorites') {
              renderFavoritesView();
            }
            showToast('数据已同步');
          } catch (e) {
            console.error('同步数据解析失败:', e);
          }
        }
      }
    });

    // 数据变更时广播通知
    const originalSave = saveUserData;
    saveUserData = async function() {
      await originalSave();
      channel.postMessage({ type: 'data_changed', time: Date.now() });
    };
  },

  /**
   * 从 Gist 加载配置
   */
  loadGistConfig() {
    const config = localStorage.getItem('guanxinlu_gist_config');
    if (config) {
      try {
        const { gistId } = JSON.parse(config);
        this.gistId = gistId;
      } catch (e) {}
    }
  },

  /**
   * 导出数据到 Gist
   */
  async exportToGist() {
    if (!this.gistId || !this.gistToken) {
      showToast('请先配置 Gist ID');
      return;
    }

    const data = {
      favorites: AppState.favorites,
      notes: AppState.notes,
      userQuotes: AppState.userQuotes,
      exportedAt: new Date().toISOString()
    };

    try {
      const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${this.gistToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: {
            'guanxinlu_data.json': {
              content: JSON.stringify(data, null, 2)
            }
          }
        })
      });

      if (response.ok) {
        showToast('数据已同步到云端');
      } else {
        showToast('同步失败，请检查配置');
      }
    } catch (e) {
      console.error('Gist 同步失败:', e);
      showToast('网络错误，同步失败');
    }
  },

  /**
   * 从 Gist 导入数据
   */
  async importFromGist() {
    if (!this.gistId) {
      showToast('请先配置 Gist ID');
      return;
    }

    try {
      const response = await fetch(`https://api.github.com/gists/${this.gistId}`);
      if (!response.ok) {
        showToast('获取云端数据失败');
        return;
      }

      const gist = await response.json();
      const file = gist.files['guanxinlu_data.json'];
      if (!file || !file.content) {
        showToast('云端无数据');
        return;
      }

      const cloudData = JSON.parse(file.content);
      const localRaw = localStorage.getItem('guanxinlu_data');
      const localData = localRaw ? JSON.parse(localRaw) : null;

      // 比较时间戳，取最新的
      const cloudTime = new Date(cloudData.exportedAt || 0).getTime();
      const localTime = new Date(localData?.lastSaved || 0).getTime();

      if (cloudTime > localTime) {
        // 云端更新，合并数据
        const merged = this.mergeData(localData, cloudData);
        AppState.favorites = merged.favorites;
        AppState.notes = merged.notes;
        AppState.userQuotes = merged.userQuotes;
        mergeQuotes();
        await persistUserData();
        if (AppState.currentView === 'home') renderHomeView();
        showToast('已从云端同步最新数据');
      } else {
        showToast('本地数据已是最新');
      }
    } catch (e) {
      console.error('Gist 导入失败:', e);
      showToast('导入失败');
    }
  },

  /**
   * 合并数据（保留本地+云端，去重）
   */
  mergeData(local, cloud) {
    if (!local) return cloud;
    if (!cloud) return local;

    // 合并 userQuotes（按 ID 去重，取时间更新的）
    const userQuotesMap = new Map();
    [...(local.userQuotes || []), ...(cloud.userQuotes || [])].forEach(q => {
      const existing = userQuotesMap.get(q.id);
      if (!existing || new Date(q.createdAt || 0) > new Date(existing.createdAt || 0)) {
        userQuotesMap.set(q.id, q);
      }
    });

    // 合并 notes（按 quoteId 合并）
    const notes = { ...(local.notes || {}), ...(cloud.notes || {}) };

    // 合并 favorites（去重）
    const favorites = [...new Set([...(local.favorites || []), ...(cloud.favorites || [])])];

    return { favorites, notes, userQuotes: Array.from(userQuotesMap.values()) };
  },

  /**
   * 保存 Gist 配置
   */
  setGistConfig(gistId) {
    this.gistId = gistId;
    localStorage.setItem('guanxinlu_gist_config', JSON.stringify({ gistId }));
  }
};
