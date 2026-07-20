// API配置
const API_CONFIG = {
  baseUrl: 'https://launcher-theme-tool.appser.top',
  endpoints: {
    listThemes: '/api/bundles?type=theme',
    createTheme: '/api/bundles',
    getTheme: '/api/bundles/{themeId}',
    uploadFile: '/api/bundles/{themeId}/files',
    confirmUpload: '/api/bundles/{themeId}/confirm',
    deleteTheme: '/api/bundles/{themeId}',
  }
};

async function parseResponse(response) {
  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.message || `HTTP error! status: ${response.status}`);
  }

  return data;
}

function buildUrl(endpoint, params = {}) {
  let url = API_CONFIG.baseUrl + endpoint;
  Object.keys(params).forEach(key => {
    url = url.replace(`{${key}}`, params[key]);
  });
  return url;
}

async function apiRequest(url, options = {}) {
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const mergedOptions = { ...defaultOptions, ...options };

  if (mergedOptions.body && typeof mergedOptions.body !== 'string') {
    mergedOptions.body = JSON.stringify(mergedOptions.body);
  }

  try {
    const response = await fetch(url, mergedOptions);
    return await parseResponse(response);
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

async function apiUploadFile(url, file, filename) {
  let uploadFile = file;
  if (isImageFile(filename) && (!file.type || file.type === 'application/octet-stream')) {
    const mimeType = getImageMimeType(filename);
    if (mimeType) {
      const arrayBuffer = await file.arrayBuffer();
      uploadFile = new Blob([arrayBuffer], { type: mimeType });
    }
  }

  const formData = new FormData();
  formData.append('file', uploadFile, filename);

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    return await parseResponse(response);
  } catch (error) {
    console.error('File upload failed:', error);
    throw error;
  }
}

async function createTheme(name, type = 'theme') {
  const url = buildUrl(API_CONFIG.endpoints.createTheme);
  return apiRequest(url, {
    method: 'POST',
    body: { name, type },
  });
}

async function listThemes() {
  const url = buildUrl(API_CONFIG.endpoints.listThemes);
  return apiRequest(url, { method: 'GET' });
}

async function getTheme(themeId) {
  const url = buildUrl(API_CONFIG.endpoints.getTheme, { themeId });
  return apiRequest(url, { method: 'GET' });
}

async function uploadThemeFile(themeId, file, filename) {
  const baseUrl = buildUrl(API_CONFIG.endpoints.uploadFile, { themeId });
  const url = `${baseUrl}?filename=${encodeURIComponent(filename)}`;
  return apiUploadFile(url, file, filename);
}

async function confirmThemeUpload(themeId) {
  const url = buildUrl(API_CONFIG.endpoints.confirmUpload, { themeId });
  return apiRequest(url, { method: 'POST' });
}

async function deleteTheme(themeId) {
  const url = buildUrl(API_CONFIG.endpoints.deleteTheme, { themeId });
  return apiRequest(url, { method: 'DELETE' });
}

// 模块: 文件夹同步 API
function collectFilesFromNode(node, files, parentPath = '', isRoot = true) {
  if (node.type === 'file' && node.file) {
    const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    files.push({
      name: fullPath,
      file: node.file,
    });
  } else if (node.type === 'folder' && node.children) {
    const newPath = isRoot ? '' : (parentPath ? `${parentPath}/${node.name}` : node.name);
    node.children.forEach(child => collectFilesFromNode(child, files, newPath, false));
  }
}

function cleanFileKey(key) {
  let cleanKey = key;
  console.log('cleanFileKey - input:', key);

  if (cleanKey.startsWith('themes/')) {
    cleanKey = cleanKey.split('/').slice(2).join('/');
  } else if (cleanKey.startsWith('/api/') || cleanKey.startsWith('api/')) {
    const parts = cleanKey.split('/');
    const fileIndex = parts.indexOf('files');
    if (fileIndex !== -1 && fileIndex + 1 < parts.length) {
      cleanKey = parts.slice(fileIndex + 1).join('/');
    }
  }

  return cleanKey;
}

function buildFileUrl(fileInfo, fileName, themeId) {
  const fileUrl = fileInfo.url || fileInfo.publicUrl || fileInfo.URL || fileInfo.public_url || '';

  if (fileUrl) {
    if (fileUrl.startsWith('http')) {
      return fileUrl;
    }

    let normalizedUrl = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
    if (normalizedUrl.startsWith('/api/') && API_CONFIG.baseUrl.endsWith('/api')) {
      normalizedUrl = normalizedUrl.substring(4);
    }
    return `${API_CONFIG.baseUrl}${normalizedUrl}`;
  }

  const storedFileName = fileInfo.name || fileName;
  return `${API_CONFIG.baseUrl}/api/bundles/${themeId}/files/${encodeURIComponent(storedFileName)}`;
}

function buildR2Url(r2Prefix, cleanKey) {
  if (!r2Prefix) {
    return '';
  }

  const prefix = r2Prefix.replace(/^\/|\/$/g, '').replace(/,$/, '');
  const encodedPath = cleanKey.split('/').map(encodeURIComponent).join('/');
  return `${API_CONFIG.baseUrl}/${prefix}/${encodedPath}`;
}

/**
 * 将文件夹节点保存到服务器
 * @param {Object} folderNode - 文件夹节点对象
 * @returns {Promise<Object>} 保存结果 { success: boolean, themeId?: string, folderNode?: Object, error?: Error }
 */
async function saveFolderToAPI(folderNode) {
  if (!folderNode || folderNode.type !== 'folder') {
    throw new Error('Invalid folder node');
  }

  try {
    const createResult = await createTheme(folderNode.name, 'theme');
    const themeId = createResult.id;
    folderNode.apiId = themeId;
    if (createResult.name) {
      folderNode.name = createResult.name;
    }

    const filesToUpload = [];
    collectFilesFromNode(folderNode, filesToUpload);
    console.log('Files to upload:', filesToUpload.map(f => f.name));

    if (filesToUpload.length === 0) {
      showNotification('没有找到可上传的文件', 'warning');
      return { success: false, error: new Error('No files to upload') };
    }

    for (const fileItem of filesToUpload) {
      console.log('Uploading:', fileItem.name, '- type:', fileItem.file.type, '- size:', fileItem.file.size);
      const uploadResult = await uploadThemeFile(themeId, fileItem.file, fileItem.name);
      console.log('Uploaded:', fileItem.name, '- result:', JSON.stringify(uploadResult));
    }

    await confirmThemeUpload(themeId);

    const loadResult = await loadThemeFilesFromAPI(themeId);
    console.log('Load theme result:', JSON.stringify(loadResult));
    if (loadResult.success && loadResult.folderNode) {
      const index = state.foldersRoot.children.findIndex(f => f.id === folderNode.id);
      if (index !== -1) {
        state.foldersRoot.children[index] = loadResult.folderNode;
      }
      folderNode = loadResult.folderNode;

      let imageInfo = '';
      loadResult.folderNode.children.forEach((file, idx) => {
        const fileType = file.name.split('.').pop().toUpperCase();
        imageInfo += `${idx + 1}. ${file.name} (${fileType}) - ${file.url}\n`;
      });

      if (imageInfo) {
        console.log('图片访问链接:\n', imageInfo);
        showNotification(`文件夹 "${folderNode.name}" 已保存到服务器\n图片链接已输出到控制台`, 'success');
      } else {
        showNotification(`文件夹 "${folderNode.name}" 已保存到服务器`, 'success');
      }
    } else {
      showNotification(`文件夹 "${folderNode.name}" 已保存到服务器`, 'success');
    }

    return { success: true, themeId, folderNode };
  } catch (error) {
    console.error('Failed to save folder to API:', error);
    showNotification(`保存失败: ${error.message}`, 'error');
    return { success: false, error };
  }
}

/**
 * 从服务器加载主题列表
 * @returns {Promise<Object>} 加载结果 { success: boolean, themes?: Array, error?: Error }
 */
async function loadThemesFromAPI() {
  try {
    const result = await listThemes();
    const themes = result.data || [];

    const folderNodes = themes.map(theme => ({
      id: `api-folder-${theme.id}`,
      apiId: theme.id,
      name: theme.name,
      type: 'folder',
      children: [],
      r2Prefix: theme.r2Prefix,
      itemCount: theme.itemCount,
      createdAt: theme.createdAt,
    }));

    return { success: true, themes: folderNodes };
  } catch (error) {
    console.error('Failed to load themes from API:', error);
    return { success: false, error };
  }
}

/**
 * 从服务器加载主题的文件列表
 * @param {string} themeId - 主题 ID
 * @returns {Promise<Object>} 加载结果 { success: boolean, folderNode?: Object, error?: Error }
 */
async function loadThemeFilesFromAPI(themeId) {
  try {
    const result = await getTheme(themeId);

    const folderNode = {
      id: `api-folder-${themeId}`,
      apiId: themeId,
      name: result.name,
      type: 'folder',
      children: [],
      r2Prefix: result.r2Prefix,
      itemCount: result.itemCount,
      createdAt: result.createdAt,
    };

    if (result.files && result.files.length > 0) {
      for (let i = 0; i < result.files.length; i++) {
        let fileInfo = result.files[i];

        if (typeof fileInfo === 'string') {
          try {
            fileInfo = JSON.parse(fileInfo);
            result.files[i] = fileInfo;
          } catch (e) {
            console.error('Failed to parse fileInfo string:', fileInfo);
            continue;
          }
        }

        const key = fileInfo.key || fileInfo.filename || fileInfo.path || fileInfo.name;
        if (!key) {
          continue;
        }

        const cleanKey = cleanFileKey(key);
        const fileName = cleanKey.split('/').pop();
        const finalUrl = buildFileUrl(fileInfo, fileName, themeId, result.r2Prefix);
        const r2Url = buildR2Url(result.r2Prefix, cleanKey);

        console.log('File info from server:', JSON.stringify(fileInfo));

        const fileNode = {
          id: `api-file-${key}`,
          name: fileName,
          type: 'file',
          url: finalUrl,
          r2Url: r2Url,
          key: key,
          originalUrl: finalUrl,
          _rawFileInfo: fileInfo,
        };
        folderNode.children.push(fileNode);
      }
    }

    console.log('Loaded theme files count:', folderNode.children.length);
    return { success: true, folderNode };
  } catch (error) {
    console.error('Failed to load theme files from API:', error);
    return { success: false, error };
  }
}

/**
 * 启动时从服务器加载主题列表并更新 UI
 */
async function loadThemesFromAPIOnStartup() {
  try {
    const result = await loadThemesFromAPI();
    if (result.success && result.themes && result.themes.length > 0) {
      ensureRootFolders();
      result.themes.forEach(theme => {
        state.foldersRoot.children.push(theme);
      });
      state.files = [];
      if (state.foldersRoot && state.foldersRoot.children.length > 0) {
        state.files.push(state.foldersRoot);
      }
      if (state.zipsRoot && state.zipsRoot.children.length > 0) {
        state.files.push(state.zipsRoot);
      }
      renderFileTree();
      showNotification(`已从服务器加载 ${result.themes.length} 个主题`, 'success');
    }
  } catch (error) {
    console.warn('Failed to load themes from API on startup:', error);
  }
}

// 模块: 常量定义
const GRID_CONFIG = {
  rows: 6,
  cols: 4,
  cellWidth: 80,
  cellHeight: 100,
  dockRows: 1,
};

const DEFAULT_SETTINGS = {
  textColor: '#FFFFFF',
  iconSize: 56,
  showGrid: true,
  showText: true,
  gridColor: '#FFFFFF',
};

const ICON_NAME_MAP = {
  'phone': '电话',
  'contacts': '联系人',
  'messages': '信息',
  'camera': '相机',
  'photos': '相册',
  'settings': '设置',
  'clock': '时钟',
  'calendar': '日历',
  'weather': '天气',
  'calculator': '计算器',
  'notes': '备忘录',
  'music': '音乐',
  'video': '视频',
  'browser': '浏览器',
  'mail': '邮件',
  'maps': '地图',
  'appstore': '应用商店',
  'wallet': '钱包',
  'health': '健康',
  'files': '文件',
  'gallery': '图库',
  'recorder': '录音机',
  'compass': '指南针',
  'flashlight': '手电筒',
  'alarm': '闹钟',
  'timer': '计时器',
  'stopwatch': '秒表',
  'worldclock': '世界时钟',
  'downloads': '下载',
  'themes': '主题',
  'security': '安全中心',
  'cleaner': '清理',
  'backup': '备份',
  'feedback': '反馈',
  'about': '关于',
};

// 模块: 状态管理
let state = {
  files: [],
  wallpaper: null,
  settings: { ...DEFAULT_SETTINGS },
  selectedFile: null,
  expandedFolders: new Set(),
  folderName: null,
  importedResources: [],
  currentFolderName: null,
  lastImportedFolderName: null,
  foldersRoot: null,
  zipsRoot: null,
};

function ensureRootFolders() {
  if (!state.foldersRoot) {
    state.foldersRoot = {
      id: 'root-folders',
      name: '文件夹',
      type: 'folder',
      children: [],
    };
  }
  if (!state.zipsRoot) {
    state.zipsRoot = {
      id: 'root-zips',
      name: 'zip包',
      type: 'folder',
      children: [],
    };
  }
}

function addFileToRoot(file, isZip = false) {
  ensureRootFolders();

  const targetRoot = isZip ? state.zipsRoot : state.foldersRoot;
  const exists = targetRoot.children.some(f => f.id === file.id || f.name === file.name);

  if (!exists) {
    targetRoot.children.push(file);
    targetRoot.children.sort((a, b) => {
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }
}

// 状态更新函数
function setFiles(newFiles) {
  if (newFiles && newFiles.length > 0) {
    newFiles.forEach(file => {
      const isZip = file._isZip || file.name.toLowerCase().endsWith('.zip');
      addFileToRoot(file, isZip);
    });
  }

  state.files = [];
  if (state.foldersRoot && state.foldersRoot.children.length > 0) {
    state.files.push(state.foldersRoot);
  }
  if (state.zipsRoot && state.zipsRoot.children.length > 0) {
    state.files.push(state.zipsRoot);
  }

  renderFileTree();

  updateExportButtonState();
}

function setWallpaper(url) {
  state.wallpaper = url;
  const wallpaperElement = document.getElementById('wallpaper');
  if (wallpaperElement) {
    if (url) {
      wallpaperElement.src = url;
      wallpaperElement.style.display = 'block';
      wallpaperElement.onload = () => {
        determineWallpaperColorAndSetTextColor();
      };
    } else {
      wallpaperElement.style.display = 'none';
    }
  }
  updateExportButtonState();
}

function updateExportButtonState() {
  const exportBtn = document.getElementById('export-btn');
  if (!exportBtn) return;

  const hasWallpaper = state.wallpaper && state.wallpaper !== '';

  const hasIcons = document.querySelectorAll('.grid-item-container.has-content').length > 0;

  if (hasWallpaper && hasIcons) {
    exportBtn.disabled = false;
    exportBtn.style.opacity = '1';
    exportBtn.style.cursor = 'pointer';
  } else {
    exportBtn.disabled = true;
    exportBtn.style.opacity = '0.5';
    exportBtn.style.cursor = 'not-allowed';
  }
}

function determineWallpaperColorAndSetTextColor() {
  const wallpaperElement = document.getElementById('wallpaper');
  if (!wallpaperElement || !wallpaperElement.src) {
    return;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = 100;
  canvas.height = 100;

  ctx.drawImage(wallpaperElement, 0, 0, 100, 100);

  const imageData = ctx.getImageData(0, 0, 100, 100);
  const data = imageData.data;

  let totalBrightness = 0;
  const sampleStep = 5;

  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    totalBrightness += brightness;
  }

  const avgBrightness = totalBrightness / (100 * 100 / sampleStep);

  const isDark = avgBrightness < 128;
  const textColor = isDark ? '#FFFFFF' : '#000000';

  updateTextColorBasedOnWallpaper(textColor);
}

function updateTextColorBasedOnWallpaper(textColor) {
  state.settings.textColor = textColor;

  const isDarkWallpaper = textColor === '#FFFFFF';
  const gridColor = isDarkWallpaper ? '#FFFFFF' : '#000000';
  state.settings.gridColor = gridColor;

  document.querySelectorAll('.icon-label').forEach(label => {
    label.style.color = textColor;
  });

  document.querySelectorAll('.weather-widget').forEach(widget => {
    widget.style.color = textColor;
  });

  const statusBar = document.querySelector('.status-bar');
  if (statusBar) {
    statusBar.style.color = textColor;

    const statusBarSvgs = statusBar.querySelectorAll('svg');
    statusBarSvgs.forEach(svg => {
      const rects = svg.querySelectorAll('rect');
      rects.forEach(rect => {
        rect.setAttribute('fill', textColor);
      });
    });
  }

  const textColorInput = document.querySelector('#text-color');
  if (textColorInput) {
    textColorInput.value = textColor;
  }
  const textColorValue = document.querySelector('#text-color-value');
  if (textColorValue) {
    textColorValue.value = textColor;
  }

  const gridColorInput = document.querySelector('#grid-color');
  if (gridColorInput) {
    gridColorInput.value = gridColor;
  }
  const gridColorValue = document.querySelector('#grid-color-value');
  if (gridColorValue) {
    gridColorValue.value = gridColor;
  }

  updateSettingsUI();
}

function setSettings(newSettings) {
  state.settings = { ...state.settings, ...newSettings };
  updateSettingsUI();
  if ('showGrid' in newSettings) {
    // renderGridOverlay();
  }
}

function setSelectedFile(id) {
  state.selectedFile = id;
  renderFileTree();
}

// 模块: DOM 操作
function renderFileTree() {
  const fileTreeElement = document.getElementById('file-tree');
  if (!fileTreeElement) {
    return;
  }

  if (state.files.length === 0) {
    fileTreeElement.innerHTML = `
      <div class="empty-state">
        <p>支持导入包含图标和壁纸的文件夹、</p>
        <p>widget的zip包</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  state.files.forEach(node => {
    const nodeElement = document.createElement('div');
    nodeElement.innerHTML = renderTreeNode(node, 0);
    while (nodeElement.firstChild) {
      fragment.appendChild(nodeElement.firstChild);
    }
  });

  fileTreeElement.innerHTML = '';
  fileTreeElement.appendChild(fragment);

  // 添加事件监听器
  fileTreeElement.querySelectorAll('.tree-node').forEach(node => {
    node.addEventListener('click', handleTreeNodeClick);
    if (node.dataset.draggable === 'true') {
      node.addEventListener('dragstart', handleDragStart);
    }
  });

  // 添加收起/展开图标事件监听器
  fileTreeElement.querySelectorAll('.tree-toggle').forEach(toggle => {
    toggle.addEventListener('click', handleTreeToggleClick);
  });

  // 添加删除图标事件监听器
  fileTreeElement.querySelectorAll('.tree-delete').forEach(deleteIcon => {
    deleteIcon.addEventListener('click', handleDeleteFolder);
  });
}

// 屏幕网格参考线渲染
function renderGridOverlay() {
  const gridContainer = document.getElementById('grid-container');
  if (!gridContainer) return;

  // 移除现有的网格覆盖层
  const existingGrid = gridContainer.querySelector('.grid-overlay');
  if (existingGrid) {
    existingGrid.remove();
  }

  if (!state.settings.showGrid) return;

  // 创建网格覆盖层
  const gridOverlay = document.createElement('div');
  gridOverlay.className = 'grid-overlay';
  gridOverlay.style.position = 'absolute';
  gridOverlay.style.top = '0';
  gridOverlay.style.left = '0';
  gridOverlay.style.width = '100%';
  gridOverlay.style.height = '100%';
  gridOverlay.style.pointerEvents = 'none';
  gridOverlay.style.zIndex = '100';
  gridOverlay.style.padding = 'calc(var(--phone-width) * 0.067)';

  // 获取phone-screen元素
  const phoneScreen = document.querySelector('.phone-screen');
  if (!phoneScreen) return;

  const containerWidth = gridContainer.clientWidth;
  const containerHeight = gridContainer.clientHeight;
  const padding = parseFloat(getComputedStyle(gridContainer).paddingLeft);

  // 计算四条竖线的位置（居中分布，间距76px）
  const lineCount = 4;
  const spacing = 76;
  const totalLineWidth = (lineCount - 1) * spacing;
  const startX = padding + (containerWidth - 2 * padding - totalLineWidth) / 2;

  // 创建四条竖线
  for (let i = 0; i < lineCount; i++) {
    const line = document.createElement('div');
    line.style.position = 'absolute';
    line.style.left = `${startX + i * spacing}px`;
    line.style.top = '0';
    line.style.width = '1px';
    line.style.height = '100%';
    line.style.backgroundColor = '#ff0000';
    line.style.opacity = '0.7';
    gridOverlay.appendChild(line);
  }

  // 创建7根横线
  const linePositions = [
    80,      // 第1根
    180,     // 第2根
    280,     // 第3根
    380,     // 第4根
    480,     // 第5根
    580,     // 第6根
    710      // 第7根（dock栏）
  ];

  for (let i = 0; i < linePositions.length; i++) {
    const line = document.createElement('div');
    line.style.position = 'absolute';
    line.style.left = '0';
    line.style.top = `${linePositions[i]}px`;
    line.style.width = '100%';
    line.style.height = '1px';
    line.style.backgroundColor = '#ff0000';
    line.style.opacity = '0.7';
    gridOverlay.appendChild(line);
  }

  gridContainer.appendChild(gridOverlay);
}

function renderTreeNode(node, level) {
  const isFolder = node.type === 'folder';
  const isSelected = state.selectedFile === node.id;
  const hasChildren = isFolder && node.children && node.children.length > 0;
  const isExpanded = state.expandedFolders.has(node.id);
  const isRootLevel = level === 0;



  if (hasChildren && isExpanded) {
    const childFolders = node.children.filter(child => child.type === 'folder');
    const childFiles = node.children.filter(child => child.type === 'file');

    return `
      <div>
        <div
          class="tree-node ${isSelected ? 'selected' : ''} ${isRootLevel ? 'root-node' : ''}"
          data-id="${node.id}"
          data-type="${node.type}"
          data-draggable="${!isFolder && !!node.url}"
          ${!isFolder && !!node.url ? 'draggable="true"' : ''}
        >
          <div class="tree-node-content">
            <span class="tree-icon">
              ${isFolder ? '📁' : '📄'}
            </span>
            <span class="tree-name">${node.name}</span>
          </div>
          ${node.url ? `
            <span class="tree-preview">
              <img src="${node.url}" alt="${node.name}" />
            </span>
          ` : ''}
          ${hasChildren ? `
            <span class="tree-toggle ${isExpanded ? 'expanded' : ''}"></span>
          ` : `
            <span class="tree-toggle-placeholder"></span>
          `}
          ${isFolder && node.id !== 'root-folders' && node.id !== 'root-zips' ? `
            <span class="tree-delete" data-id="${node.id}"></span>
          ` : ''}
        </div>
        <div class="tree-children">
          ${childFolders.map(child => renderTreeNode(child, level + 1)).join('')}
          ${childFiles.length > 0 ? `
            <div class="tree-children-scroll">
              ${childFiles.map(child => renderTreeNode(child, level + 1)).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  return `
    <div>
      <div
        class="tree-node ${isSelected ? 'selected' : ''} ${isRootLevel ? 'root-node' : ''}"
        data-id="${node.id}"
        data-type="${node.type}"
        data-draggable="${!isFolder && !!node.url}"
        ${!isFolder && !!node.url ? 'draggable="true"' : ''}
      >
        <div class="tree-node-content">
          <span class="tree-icon">
            ${isFolder ? '📁' : '📄'}
          </span>
          <span class="tree-name">${node.name}</span>
        </div>
        ${node.url ? `
          <span class="tree-preview">
            <img src="${node.url}" alt="${node.name}" />
          </span>
        ` : ''}
        ${hasChildren ? `
          <span class="tree-toggle ${isExpanded ? 'expanded' : ''}"></span>
        ` : `
          <span class="tree-toggle-placeholder"></span>
        `}
        ${isFolder && node.id !== 'root-folders' && node.id !== 'root-zips' ? `
          <span class="tree-delete" data-id="${node.id}"></span>
        ` : ''}
      </div>
      ${hasChildren && isExpanded ? `
        <div class="tree-children">
          <div class="tree-children-scroll">
            ${node.children.map(child => renderTreeNode(child, level + 1)).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function updateSettingsUI() {
  document.getElementById('text-color').value = state.settings.textColor;
  document.getElementById('text-color-value').value = state.settings.textColor;
  document.getElementById('icon-size').value = state.settings.iconSize;
  document.getElementById('icon-size-value').textContent = `${state.settings.iconSize}px`;
  document.getElementById('show-grid').checked = state.settings.showGrid;
  document.getElementById('show-text').checked = state.settings.showText;
  document.getElementById('grid-color').value = state.settings.gridColor;
  document.getElementById('grid-color-value').value = state.settings.gridColor;

  const gridColorWithOpacity = hexToRgba(state.settings.gridColor, 0.2);

  // 更新所有icon-label的文字颜色和显示状态
  document.querySelectorAll('.icon-label').forEach(label => {
    // 检查是否是dock栏的icon-label（dock栏的始终隐藏）
    const isDockItem = label.closest('.grid-item-container.dock-container');
    // 检查是否是初始隐藏的容器中的icon-label
    const isInitiallyHidden = label.closest('.grid-item-container.initially-hidden');
    if (!isDockItem && !isInitiallyHidden) {
      label.style.color = state.settings.showText ? state.settings.textColor : 'transparent';
      label.style.visibility = state.settings.showText ? 'visible' : 'hidden';
    }
  });

  // 更新所有grid-item的大小和边框
  document.querySelectorAll('.grid-item').forEach(item => {
    if (!item.classList.contains('custom-size-4') && !item.classList.contains('custom-size-2')) {
      item.style.width = `${state.settings.iconSize}px`;
      item.style.height = `${state.settings.iconSize}px`;
      item.style.border = state.settings.showGrid ? `1px dashed ${gridColorWithOpacity}` : '1px dashed transparent';

      // 重新添加删除图标（如果容器有内容或曾经被删除过）
      const container = item.parentElement;
      if (container.classList.contains('has-content') || container.classList.contains('deleted')) {
        addDeleteIcon(item);
      }
    } else {
      const container = item.parentElement;
      const hasContent = container.classList.contains('has-content');
      item.style.border = hasContent ? `1px dashed ${gridColorWithOpacity}` : 'none';

      // 重新添加删除图标（如果容器有内容或曾经被删除过）
      if (hasContent || container.classList.contains('deleted')) {
        addDeleteIcon(item);
      }
    }
  });
}

function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// 模块: 拖拽区域事件处理
function handleDropZoneDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'copy';
  e.currentTarget.classList.add('dragover');
}

function handleDropZoneDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('dragover');
}

function handleDropZoneDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  e.currentTarget.classList.remove('dragover');

  const items = e.dataTransfer.items;
  if (!items || items.length === 0) return;

  const isZipDropZone = e.currentTarget.id === 'drop-zone-zip';
  handleDropZoneItems(items, isZipDropZone);
}

function handleDropZoneClick(e) {
  const dropZone = e.currentTarget;
  if (dropZone.id === 'drop-zone-zip') {
    const zipInput = document.getElementById('zip-input');
    if (zipInput) {
      zipInput.click();
    }
  } else {
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.click();
    }
  }
}

async function handleDropZoneItems(items, isZipDropZone = false) {
  const allParsedFiles = [];
  const promises = [];
  const directoryEntries = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        if (entry.isDirectory) {
          directoryEntries.push(entry);
        } else if (entry.isFile) {
          const filePromise = new Promise((resolve) => {
            entry.file(async (file) => {
              if (file.name.toLowerCase().endsWith('.zip')) {
                const parsedFiles = await parseZipFile(file);
                parsedFiles.forEach(f => f._isZip = true);
                allParsedFiles.push(...parsedFiles);
              } else if (!isZipDropZone) {
                const parsedFiles = await parseFiles([file]);
                parsedFiles.forEach(f => f._isZip = false);
                allParsedFiles.push(...parsedFiles);
              }
              resolve();
            }, () => resolve());
          });
          promises.push(filePromise);
        }
      }
    } else if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          const parsedFiles = await parseZipFile(file);
          parsedFiles.forEach(f => f._isZip = true);
          allParsedFiles.push(...parsedFiles);
        } else if (!isZipDropZone) {
          const parsedFiles = await parseFiles([file]);
          parsedFiles.forEach(f => f._isZip = false);
          allParsedFiles.push(...parsedFiles);
        }
      }
    }
  }

  for (const entry of directoryEntries) {
    const parsedFiles = await parseDirectoryEntry(entry);
    parsedFiles.forEach(f => f._isZip = false);
    allParsedFiles.push(...parsedFiles);
  }

  await Promise.all(promises);

  if (allParsedFiles.length === 0) {
    if (isZipDropZone) {
      showNotification('请拖放 zip 文件', 'error');
    } else {
      showNotification('请拖放文件夹或图片文件', 'error');
    }
    return;
  }

  allParsedFiles.sort((a, b) => {
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  state.expandedFolders.clear();
  let lastFolder = null;
  if (allParsedFiles.length > 0) {
    lastFolder = allParsedFiles[allParsedFiles.length - 1];
    state.expandedFolders.add(lastFolder.id);
    state.currentFolderName = lastFolder.name;
    setSelectedFile(lastFolder.id);
  }

  setFiles(allParsedFiles);

  if (lastFolder) {
    const wallpaperInfo = findWallpaper([lastFolder]);
    if (wallpaperInfo && wallpaperInfo.url) {
      setWallpaper(wallpaperInfo.url);
    }

    const previewFiles = await collectPreviewFilesWithDimensions([lastFolder]);
    await fillCustomContainers(previewFiles);

    const iconFiles = collectIconFiles([lastFolder]);
    fillIconGrids(iconFiles);
  }
}

async function parseDirectoryEntry(entry) {
  const root = [];
  const folderFiles = [];

  const folderNode = {
    id: `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: entry.name,
    type: 'folder',
    children: [],
  };

  await new Promise((resolve) => {
    const dirReader = entry.createReader();

    const readAllEntries = () => {
      dirReader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve();
          return;
        }
        const promises = entries.map((subEntry) =>
          readDirectoryEntryToNode(subEntry, folderNode, folderFiles)
        );
        Promise.all(promises).then(readAllEntries);
      }, () => resolve());
    };

    readAllEntries();
  });

  const sortNodes = (nodes) => {
    nodes.sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(node => {
      if (node.type === 'folder' && node.children) {
        sortNodes(node.children);
      }
    });
  };

  if (folderNode.children) {
    sortNodes(folderNode.children);
  }

  if (!state.folderName) {
    state.folderName = entry.name;
  }

  state.lastImportedFolderName = entry.name;

  state.importedResources.push({
    type: 'folder',
    name: entry.name,
    files: folderFiles
  });

  state.expandedFolders.clear();
  state.expandedFolders.add(folderNode.id);
  state.currentFolderName = entry.name;
  setSelectedFile(folderNode.id);

  root.push(folderNode);
  return root;
}

async function readDirectoryEntryToNode(entry, parentNode, folderFiles = []) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => {
        const fileName = entry.name;

        if (isExcludedFile(fileName) && !isWallpaper(fileName)) {
          resolve();
          return;
        }

        if (!isImageFile(fileName)) {
          resolve();
          return;
        }

        const fileNode = {
          id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: fileName,
          type: 'file',
          url: URL.createObjectURL(file),
          file: file,
        };

        if (parentNode.children) {
          parentNode.children.push(fileNode);
        }

        folderFiles.push(file);

        resolve();
      }, () => resolve());
    } else if (entry.isDirectory) {
      const folderNode = {
        id: `folder-${Date.now()}`,
        name: entry.name,
        type: 'folder',
        children: [],
      };

      if (parentNode.children) {
        parentNode.children.push(folderNode);
      }

      const dirReader = entry.createReader();

      const readAllEntries = () => {
        dirReader.readEntries((entries) => {
          if (entries.length === 0) {
            resolve();
            return;
          }
          const promises = entries.map((subEntry) =>
            readDirectoryEntryToNode(subEntry, folderNode, folderFiles)
          );
          Promise.all(promises).then(readAllEntries);
        }, () => resolve());
      };

      readAllEntries();
    } else {
      resolve();
    }
  });
}

async function handleDroppedZipFile(zipFile) {
  try {
    const parsedFiles = await parseZipFile(zipFile);
    setFiles(parsedFiles);

    const wallpaperInfo = findWallpaper(parsedFiles);
    if (wallpaperInfo && wallpaperInfo.url) {
      setWallpaper(wallpaperInfo.url);
    }

    const previewFiles = await collectPreviewFilesWithDimensions(parsedFiles);
    await fillCustomContainers(previewFiles);

    const iconFiles = collectIconFiles(parsedFiles);
    fillIconGrids(iconFiles);

  } catch (error) {
    console.error('Error handling zip file:', error);
    showNotification('导入失败，请重试', 'error');
  }
}

async function readDirectoryEntry(entry, parentPath, fileList) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => {
        const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        Object.defineProperty(file, 'webkitRelativePath', {
          value: relativePath,
          writable: false,
          enumerable: true,
          configurable: true
        });
        fileList.push(file);
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const newPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

      const readAllEntries = () => {
        dirReader.readEntries((entries) => {
          if (entries.length === 0) {
            resolve();
            return;
          }
          const promises = entries.map((subEntry) =>
            readDirectoryEntry(subEntry, newPath, fileList)
          );
          Promise.all(promises).then(readAllEntries);
        }, () => resolve());
      };

      readAllEntries();
    } else {
      resolve();
    }
  });
}

async function handleDroppedFiles(files) {
  try {
    const fileList = Array.from(files);
    const firstFile = fileList[0];
    const fileName = firstFile.name.toLowerCase();

    let parsedFiles;
    if (fileName.endsWith('.zip')) {
      parsedFiles = await parseZipFile(firstFile);
    } else {
      parsedFiles = await parseFiles(fileList);
    }

    setFiles(parsedFiles);

    const wallpaperInfo = findWallpaper(parsedFiles);
    if (wallpaperInfo && wallpaperInfo.url) {
      setWallpaper(wallpaperInfo.url);
    }

    const previewFiles = await collectPreviewFilesWithDimensions(parsedFiles);
    await fillCustomContainers(previewFiles);

    const iconFiles = collectIconFiles(parsedFiles);
    fillIconGrids(iconFiles);

  } catch (error) {
    console.error('Error handling dropped files:', error);
    showNotification('导入失败，请重试', 'error');
  }
}

// 模块: 事件处理
async function handleTreeNodeClick(e) {
  const node = e.currentTarget;
  const id = node.dataset.id;
  const type = node.dataset.type;

  setSelectedFile(id);

  if (type === 'folder') {
    let folderNode = findFileNodeById(state.files, id);

    if (id === 'root-folders' || id === 'root-zips') {
      state.expandedFolders.clear();
      state.expandedFolders.add(id);
      renderFileTree();
      return;
    }

    if (folderNode) {
      if (folderNode.apiId && !folderNode.children.length) {
        const result = await loadThemeFilesFromAPI(folderNode.apiId);

        if (result.success) {
          const index = state.foldersRoot.children.findIndex(f => f.id === folderNode.id);
          if (index !== -1) {
            state.foldersRoot.children[index] = result.folderNode;
            folderNode = result.folderNode;
          }
        } else {
          console.error('Failed to load theme files from API:', result.error);
        }
      }

      state.expandedFolders.clear();

      if (state.foldersRoot && state.foldersRoot.children.some(f => f.id === id)) {
        state.expandedFolders.add('root-folders');
      } else if (state.zipsRoot && state.zipsRoot.children.some(f => f.id === id)) {
        state.expandedFolders.add('root-zips');
      }

      state.expandedFolders.add(id);

      state.currentFolderName = folderNode.name;

      const allFileNodes = [];
      function collectFileNodes(node) {
        if (node.type === 'file') {
          allFileNodes.push(node);
        }
        if (node.children) {
          node.children.forEach(collectFileNodes);
        }
      }
      collectFileNodes(folderNode);

      const fetchPromises = allFileNodes.map(async (fileNode) => {
        if (fileNode.type === 'file' && isImageFile(fileNode.name)) {
          const apiUrl = fileNode.url;
          const r2Url = fileNode.r2Url;

          if (!apiUrl && !r2Url) {
            return;
          }

          let result = null;

          if (r2Url) {
            result = await fetchImageWithCors(r2Url);
            if (result) {
              fileNode.file = result.blob;
              fileNode.url = result.blobUrl;
              console.log('Using R2 URL for image:', fileNode.name);
              return;
            }
            console.warn('R2 URL failed, trying API URL:', fileNode.name);
          }

          if (apiUrl) {
            result = await fetchImageWithCors(apiUrl);
            if (result) {
              fileNode.file = result.blob;
              fileNode.url = result.blobUrl;
              console.log('Using API URL for image:', fileNode.name);
            } else {
              console.error('Both R2 URL and API URL failed for:', fileNode.name);
              showNotification(`图片 "${fileNode.name}" 加载失败，请检查服务器配置`, 'error');
            }
          }
        }
      });

      await Promise.all(fetchPromises);

      const fetchedCount = allFileNodes.filter(n => n.type === 'file' && isImageFile(n.name) && n.file).length;
      console.log('Theme loaded:', folderNode.name, 'files:', allFileNodes.length, 'fetched:', fetchedCount);

      renderFileTree();

      const wallpaperInfo = findWallpaper(allFileNodes);
      if (wallpaperInfo && wallpaperInfo.url) {
        setWallpaper(wallpaperInfo.url);
      }

      const previewFiles = await collectPreviewFilesWithDimensions(allFileNodes);
      fillCustomContainers(previewFiles);

      const iconFiles = collectIconFiles(allFileNodes);
      fillIconGrids(iconFiles);
    }
  }
}

function handleTreeToggleClick(e) {
  e.stopPropagation();
  const toggle = e.currentTarget;
  const node = toggle.closest('.tree-node');
  if (!node) return;

  const id = node.dataset.id;
  const type = node.dataset.type;

  if (type === 'folder') {
    if (state.expandedFolders.has(id)) {
      state.expandedFolders.delete(id);
    } else {
      state.expandedFolders.add(id);
    }
    renderFileTree();
  }
}

async function handleDeleteFolder(e) {
  e.stopPropagation();
  const folderId = e.currentTarget.dataset.id;

  let folderToDelete = null;
  let rootType = null;
  let rootIndex = -1;

  if (state.foldersRoot && state.foldersRoot.children) {
    const index = state.foldersRoot.children.findIndex(f => f.id === folderId);
    if (index !== -1) {
      folderToDelete = state.foldersRoot.children[index];
      rootType = 'folders';
      rootIndex = index;
    }
  }

  if (!folderToDelete && state.zipsRoot && state.zipsRoot.children) {
    const index = state.zipsRoot.children.findIndex(f => f.id === folderId);
    if (index !== -1) {
      folderToDelete = state.zipsRoot.children[index];
      rootType = 'zips';
      rootIndex = index;
    }
  }

  if (!folderToDelete) {
    return;
  }

  if (folderToDelete.apiId) {
    try {
      await deleteTheme(folderToDelete.apiId);
    } catch (error) {
      console.error('Failed to delete from API:', error);
      showNotification('删除失败：无法连接服务器', 'error');
      return;
    }
  }

  if (rootType === 'folders' && state.foldersRoot && state.foldersRoot.children) {
    state.foldersRoot.children.splice(rootIndex, 1);
  } else if (rootType === 'zips' && state.zipsRoot && state.zipsRoot.children) {
    state.zipsRoot.children.splice(rootIndex, 1);
  }

  state.expandedFolders.delete(folderId);

  const folderName = folderToDelete.name;
  state.importedResources = state.importedResources.filter(res =>
    !(res.type === 'folder' && res.name === folderName) &&
    !(res.type === 'zip' && res.name.replace(/\.zip$/i, '') === folderName)
  );

  if (state.selectedFile === folderId) {
    state.selectedFile = null;
  }

  state.files = [];
  if (state.foldersRoot && state.foldersRoot.children.length > 0) {
    state.files.push(state.foldersRoot);
  }
  if (state.zipsRoot && state.zipsRoot.children.length > 0) {
    state.files.push(state.zipsRoot);
  }

  renderFileTree();

  const hasNoContent = (!state.foldersRoot || state.foldersRoot.children.length === 0) &&
    (!state.zipsRoot || state.zipsRoot.children.length === 0);

  if (hasNoContent) {
    state.importedResources = [];
    state.foldersRoot = null;
    state.zipsRoot = null;
    state.wallpaper = null;

    document.querySelectorAll('.grid-item').forEach(gridItem => {
      gridItem.style.backgroundImage = '';
      gridItem.dataset.url = '';
      gridItem.dataset.name = '';
      gridItem.draggable = false;

      const deleteIcon = gridItem.querySelector('.delete-icon');
      if (deleteIcon) {
        deleteIcon.remove();
      }
    });

    document.querySelectorAll('.icon-label').forEach(label => {
      label.textContent = 'Messages';
    });

    const wallpaperElement = document.getElementById('wallpaper');
    if (wallpaperElement) {
      wallpaperElement.style.display = 'none';
      wallpaperElement.src = '';
    }

    showNotification('已清除所有导入的内容', 'success');
  } else {
    showNotification('文件夹已删除', 'success');
  }
}

function handleDragStart(e) {
  const node = e.currentTarget;
  const id = node.dataset.id;
  const fileNode = findFileNodeById(state.files, id);
  if (fileNode && fileNode.url) {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      id: fileNode.id,
      name: fileNode.name,
      url: fileNode.url,
    }));
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const data = e.dataTransfer.getData('text/plain');
  if (!data) return;

  try {
    const item = JSON.parse(data);
    const targetContainer = e.currentTarget;

    const isTargetContainer4 = targetContainer.classList.contains('custom-container-4');
    const isTargetContainer2 = targetContainer.classList.contains('custom-container-2');

    if (item.isFromCustomContainer) {
      if (!isTargetContainer4 && !isTargetContainer2) {
        return;
      }
      const itemIsFrom4 = item.containerType === 'custom-container-4';
      if ((itemIsFrom4 && isTargetContainer2) || (!itemIsFrom4 && isTargetContainer4)) {
        return;
      }
    } else {
      if (isTargetContainer4 && !isTargetContainer2) {
        return;
      }
      if (isTargetContainer2 && !isTargetContainer4) {
        return;
      }
    }

    if (isTargetContainer4 || isTargetContainer2) {
      const gridItem = targetContainer.querySelector('.grid-item');
      const iconLabel = targetContainer.querySelector('.icon-label');

      if (gridItem) {
        if (gridItem.classList.contains('weather-widget')) {
          gridItem.innerHTML = '';
          gridItem.classList.remove('weather-widget');
          gridItem.style.background = '';
          gridItem.style.border = 'none';
          gridItem.style.flexDirection = '';
          gridItem.style.alignItems = '';
          gridItem.style.justifyContent = '';
          gridItem.style.color = '';
          gridItem.style.fontFamily = '';
          gridItem.style.padding = '';
        }
        gridItem.style.backgroundImage = `url(${item.url})`;
        gridItem.style.backgroundSize = 'cover';
        gridItem.style.backgroundPosition = 'center';
        gridItem.style.backgroundRepeat = 'no-repeat';
        gridItem.dataset.url = item.url;
        gridItem.dataset.name = item.name;
        gridItem.draggable = true;
        gridItem.dataset.isPreview = 'true';
      }

      if (iconLabel) {
        iconLabel.textContent = getIconLabel(item.name);
      }

      targetContainer.classList.remove('hidden');
      targetContainer.classList.add('has-content');
      targetContainer.classList.remove('deleted');
      targetContainer.style.display = 'block';
      if (gridItem) {
        gridItem.style.border = '1px dashed rgba(255, 255, 255, 0.2)';
      }

      updateOverlappingIcons();
      addCustomContainerDragListeners();
      updateExportButtonState();
    } else {
      const rect = targetContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const col = Math.floor(x / (rect.width / GRID_CONFIG.cols));
      const row = Math.floor(y / (rect.height / (GRID_CONFIG.rows + 1)));

      const clampedCol = Math.max(0, Math.min(col, GRID_CONFIG.cols - 1));
      const clampedRow = Math.max(0, Math.min(row, GRID_CONFIG.rows));

      const gridContainers = document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2)');
      const targetIndex = clampedRow * GRID_CONFIG.cols + clampedCol;

      if (targetIndex < gridContainers.length) {
        const container = gridContainers[targetIndex];
        const gridItem = container.querySelector('.grid-item');
        const iconLabel = container.querySelector('.icon-label');

        if (gridItem) {
          gridItem.style.backgroundImage = `url(${item.url})`;
          gridItem.style.backgroundSize = 'cover';
          gridItem.style.backgroundPosition = 'center';
          gridItem.style.backgroundRepeat = 'no-repeat';
          gridItem.draggable = true;
          gridItem.dataset.url = item.url;
          gridItem.dataset.name = item.name;
          addDeleteIcon(gridItem);
        }

        if (iconLabel) {
          iconLabel.textContent = getIconLabel(item.name);
          iconLabel.style.display = '';
          iconLabel.style.visibility = '';
        }

        container.classList.add('has-content');
        container.classList.remove('deleted');

        addGridItemDragListeners();
        updateExportButtonState();
      }
    }
  } catch (err) {
    console.error('Failed to parse drag data:', err);
  }
}

async function handleFileChange(e) {
  const fileList = e.target.files;
  if (!fileList || fileList.length === 0) return;

  try {
    const files = fileList[0];
    const fileName = files.name.toLowerCase();

    let parsedFiles;
    if (fileName.endsWith('.zip')) {
      parsedFiles = await parseZipFile(files);
    } else {
      parsedFiles = await parseFiles(fileList);
    }

    setFiles(parsedFiles);

    const wallpaperInfo = findWallpaper(parsedFiles);
    if (wallpaperInfo && wallpaperInfo.url) {
      setWallpaper(wallpaperInfo.url);
    }

    const previewFiles = await collectPreviewFilesWithDimensions(parsedFiles);
    await fillCustomContainers(previewFiles);

    const iconFiles = collectIconFiles(parsedFiles);
    fillIconGrids(iconFiles);

  } catch (error) {
    console.error('Error parsing files:', error);
  }
}

function validateHexColor(value) {
  if (!value) return null;
  const normalizedValue = value.trim().toUpperCase();
  const validHex = /^#[0-9A-F]{6}$|^#[0-9A-F]{3}$/;

  if (validHex.test(normalizedValue)) {
    if (normalizedValue.length === 4) {
      const r = normalizedValue[1];
      const g = normalizedValue[2];
      const b = normalizedValue[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return normalizedValue;
  }
  return null;
}

function handleSettingsChange() {
  setSettings({
    textColor: document.getElementById('text-color').value.toUpperCase(),
    iconSize: parseInt(document.getElementById('icon-size').value),
    showGrid: document.getElementById('show-grid').checked,
    showText: document.getElementById('show-text').checked,
    gridColor: document.getElementById('grid-color').value.toUpperCase(),
  });
}

async function handleExport() {
  const phoneScreen = document.querySelector('.phone-screen');
  if (!phoneScreen) {
    showNotification('导出失败：无法找到预览区域', 'error');
    return;
  }

  try {
    const formatSelect = document.getElementById('export-format');
    const selectedFormat = formatSelect ? formatSelect.value : 'jpg';

    const resolutionSelect = document.getElementById('export-resolution');
    const selectedResolution = resolutionSelect ? resolutionSelect.value : '1080x2340';
    const [width, height] = selectedResolution.split('x').map(Number);

    const mimeType = `image/${selectedFormat}`;
    const previewBlob = await captureWorkspace(phoneScreen, 'image/jpeg', width, height);

    const allFiles = [];
    collectFiles(state.files, allFiles);
    await exportTheme(previewBlob, allFiles, selectedFormat);
  } catch (err) {
    console.error('Export failed:', err);
    showNotification('导出失败，请重试', 'error');
  }
}

// 模块: 工具函数
function findFileNodeById(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.type === 'folder' && node.children) {
      const found = findFileNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function isExcludedFile(filename) {
  const lowerName = filename.toLowerCase();
  return lowerName.includes('iconback') || lowerName.includes('iconmask');
}

function isPreviewFile(filename) {
  const lowerName = filename.toLowerCase();
  return lowerName.includes('preview');
}

async function parseZipFile(zipFile) {
  const root = [];
  const zip = new JSZip();

  try {
    const content = await zip.loadAsync(zipFile);
    const folderName = zipFile.name.replace(/\.zip$/i, '');
    if (!state.folderName) {
      state.folderName = folderName;
    }
    state.importedResources.push({
      type: 'zip',
      name: zipFile.name,
      file: zipFile
    });

    const folderNode = {
      id: `folder-${Date.now()}`,
      name: folderName,
      type: 'folder',
      children: [],
    };

    for (const [path, file] of Object.entries(content.files)) {
      if (file.dir) continue;

      const parts = path.split('/').filter(Boolean);
      if (parts.length === 0) continue;

      const fileName = parts[parts.length - 1];

      if (isExcludedFile(fileName) && !isWallpaper(fileName)) {
        continue;
      }

      if (!isImageFile(fileName)) {
        continue;
      }

      let blob = await file.async('blob');
      const mimeType = getImageMimeType(fileName);
      if (mimeType && (!blob.type || blob.type === 'application/octet-stream')) {
        const arrayBuffer = await blob.arrayBuffer();
        blob = new Blob([arrayBuffer], { type: mimeType });
      }
      const url = URL.createObjectURL(blob);

      const fileNode = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: fileName,
        type: 'file',
        url: url,
        file: blob,
      };

      folderNode.children.push(fileNode);
    }

    folderNode.children.sort((a, b) => {
      const aIsPreview = isPreviewFile(a.name) ? 0 : 1;
      const bIsPreview = isPreviewFile(b.name) ? 0 : 1;
      if (aIsPreview !== bIsPreview) return aIsPreview - bIsPreview;
      return a.name.localeCompare(b.name);
    });

    state.expandedFolders.clear();
    state.expandedFolders.add(folderNode.id);
    root.push(folderNode);

    state.lastImportedFolderName = folderName;
    state.currentFolderName = folderName;
    setSelectedFile(folderNode.id);

    return root;
  } catch (error) {
    console.error('Error parsing zip file:', error);
    return root;
  }
}

function parseFiles(fileList) {
  return new Promise((resolve) => {
    const root = [];
    const filesArray = Array.from(fileList);

    const folderGroups = {};
    filesArray.forEach(file => {
      const path = file.webkitRelativePath || file.name;
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 0) {
        const folderName = parts.length > 1 ? parts[0] : 'theme';
        if (!folderGroups[folderName]) {
          folderGroups[folderName] = [];
        }
        folderGroups[folderName].push(file);
      }
    });

    const folderNames = Object.keys(folderGroups);
    folderNames.forEach(folderName => {
      state.importedResources.push({
        type: 'folder',
        name: folderName,
        files: folderGroups[folderName]
      });
    });

    if (!state.folderName && folderNames.length > 0) {
      state.folderName = folderNames[0];
    }

    if (folderNames.length > 0) {
      state.lastImportedFolderName = folderNames[folderNames.length - 1];
    }

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const path = file.webkitRelativePath || file.name;
      const parts = path.split('/').filter(Boolean);

      if (parts.length === 0) continue;

      let currentLevel = root;

      for (let j = 0; j < parts.length; j++) {
        const part = parts[j];
        const isFile = j === parts.length - 1;

        let node = currentLevel.find(n => n.name === part);
        if (!node) {
          if (isFile && isExcludedFile(part) && !isWallpaper(part)) {
            continue;
          }

          node = {
            id: `file-${Date.now()}-${i}-${j}`,
            name: part,
            type: isFile ? 'file' : 'folder',
            children: isFile ? undefined : [],
            file: isFile ? file : undefined,
          };

          if (isFile && isImageFile(part)) {
            node.url = URL.createObjectURL(file);
          }

          currentLevel.push(node);
        }

        if (!isFile) {
          if (!node.children) {
            node.children = [];
          }
          currentLevel = node.children;
        }
      }
    }

    const sortNodes = (nodes) => {
      nodes.sort((a, b) => {
        if (a.type === 'folder' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
      });
      nodes.forEach(node => {
        if (node.type === 'folder' && node.children) {
          sortNodes(node.children);
        }
      });
    };

    sortNodes(root);

    state.expandedFolders.clear();
    const lastFolder = root.filter(node => node.type === 'folder').pop();
    if (lastFolder) {
      state.expandedFolders.add(lastFolder.id);
      state.currentFolderName = lastFolder.name;
      setSelectedFile(lastFolder.id);
    }

    resolve(root);
  });
}

function isImageFile(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext || '');
}

function getImageMimeType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'gif': 'image/gif',
  };
  return mimeTypes[ext] || '';
}

function getImageDimensions(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = url;
  });
}

function isWallpaper(filename) {
  const name = filename.toLowerCase().split('.')[0];
  return name === 'wallpaper';
}

function findWallpaper(nodes, folderName = '') {
  for (const node of nodes) {
    const currentFolder = node.type === 'folder' ? node.name : folderName;
    if (node.type === 'file' && isWallpaper(node.name) && node.url) {
      return { url: node.url, folderName: currentFolder };
    }
    if (node.type === 'folder' && node.children) {
      const found = findWallpaper(node.children, currentFolder);
      if (found) return found;
    }
  }
  return null;
}

function collectFiles(nodes, allFiles) {
  for (const node of nodes) {
    if (node.file) {
      allFiles.push(node.file);
    }
    if (node.children) {
      collectFiles(node.children, allFiles);
    }
  }
}

function collectUsedResources() {
  const usedResources = [];
  const usedUrls = new Set();

  if (state.wallpaper) {
    usedUrls.add(state.wallpaper);
  }

  document.querySelectorAll('.grid-item').forEach(gridItem => {
    const url = gridItem.dataset.url;
    if (url) {
      usedUrls.add(url);
    }
  });

  function findFilesByUrl(nodes) {
    for (const node of nodes) {
      if (node.type === 'file' && node.url && usedUrls.has(node.url)) {
        usedResources.push({
          name: node.name,
          file: node.file,
          url: node.url
        });
      }
      if (node.type === 'folder' && node.children) {
        findFilesByUrl(node.children);
      }
    }
  }

  findFilesByUrl(state.files);

  return usedResources;
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-icon">${type === 'success' ? '✓' : '✗'}</div>
    <div class="notification-content">${message}</div>
    <div class="notification-close">×</div>
  `;

  notification.querySelector('.notification-close').addEventListener('click', () => {
    notification.remove();
  });

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

function captureWorkspace(element, mimeType = 'image/jpeg', targetWidth = 1080, targetHeight = 2340) {
  return new Promise((resolve) => {
    if (!element) {
      console.error('Element not found for capture');
      resolve(null);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    const gridOverlay = element.querySelector('.grid-overlay');
    const gridOverlayVisible = gridOverlay ? gridOverlay.style.display : '';
    if (gridOverlay) {
      gridOverlay.style.display = 'none';
    }

    const originalBorderRadius = element.style.borderRadius;
    element.style.borderRadius = '0';

    const wallpaper = element.querySelector('.wallpaper');
    const originalWallpaperStyle = {};
    if (wallpaper) {
      originalWallpaperStyle.borderRadius = wallpaper.style.borderRadius;
      wallpaper.style.borderRadius = '0';
    }

    const phoneContent = element.querySelector('.phone-content');
    const originalPhoneContentStyle = {};
    if (phoneContent) {
      originalPhoneContentStyle.display = phoneContent.style.display;
      phoneContent.style.display = 'none';
    }

    const normalContainers = element.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2)');
    const hiddenContainers = [];
    normalContainers.forEach(container => {
      const gridItem = container.querySelector('.grid-item');
      const hasContent = gridItem && gridItem.style.backgroundImage && gridItem.style.backgroundImage !== 'none';
      if (!hasContent) {
        hiddenContainers.push(container);
        container.style.display = 'none';
      }
    });

    const gridItems = element.querySelectorAll('.grid-item');
    const originalBorders = [];
    const originalItemBorderRadius = [];
    gridItems.forEach((item, index) => {
      originalBorders[index] = item.style.border;
      originalItemBorderRadius[index] = item.style.borderRadius;
      item.style.border = 'none';
      item.style.borderRadius = '0';
    });

    if (typeof html2canvas !== 'undefined') {
      const scale = targetWidth / element.offsetWidth;

      html2canvas(element, {
        width: element.offsetWidth,
        height: element.offsetHeight,
        scale: scale,
        useCORS: true,
        logging: false,
        backgroundColor: null,
        allowTaint: true
      }).then(capturedCanvas => {
        if (gridOverlay) {
          gridOverlay.style.display = gridOverlayVisible;
        }
        element.style.borderRadius = originalBorderRadius;
        if (wallpaper) {
          wallpaper.style.borderRadius = originalWallpaperStyle.borderRadius;
        }
        if (phoneContent) {
          phoneContent.style.display = originalPhoneContentStyle.display;
        }
        hiddenContainers.forEach(container => {
          container.style.display = '';
        });
        gridItems.forEach((item, index) => {
          item.style.border = originalBorders[index];
          item.style.borderRadius = originalItemBorderRadius[index];
        });
        ctx.drawImage(capturedCanvas, 0, 0, targetWidth, targetHeight);
        canvas.toBlob(resolve, 'image/jpeg', 0.6);
      }).catch(err => {
        console.error('html2canvas error:', err);
        if (gridOverlay) {
          gridOverlay.style.display = gridOverlayVisible;
        }
        element.style.borderRadius = originalBorderRadius;
        if (wallpaper) {
          wallpaper.style.borderRadius = originalWallpaperStyle.borderRadius;
        }
        if (phoneContent) {
          phoneContent.style.display = originalPhoneContentStyle.display;
        }
        hiddenContainers.forEach(container => {
          container.style.display = '';
        });
        gridItems.forEach((item, index) => {
          item.style.border = originalBorders[index];
          item.style.borderRadius = originalItemBorderRadius[index];
        });
        resolve(null);
      });
    } else {
      try {
        const html = element.outerHTML;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        tempDiv.style.width = `${targetWidth}px`;
        tempDiv.style.height = `${targetHeight}px`;
        tempDiv.style.backgroundColor = 'transparent';

        document.body.appendChild(tempDiv);

        setTimeout(() => {
          ctx.clearRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(tempDiv, 0, 0, targetWidth, targetHeight);
          document.body.removeChild(tempDiv);

          if (gridOverlay) {
            gridOverlay.style.display = gridOverlayVisible;
          }
          element.style.borderRadius = originalBorderRadius;
          if (wallpaper) {
            wallpaper.style.borderRadius = originalWallpaperStyle.borderRadius;
            wallpaper.style.width = originalWallpaperStyle.width;
            wallpaper.style.height = originalWallpaperStyle.height;
          }
          if (phoneContent) {
            phoneContent.style.borderRadius = originalPhoneContentStyle.borderRadius;
            phoneContent.style.width = originalPhoneContentStyle.width;
            phoneContent.style.height = originalPhoneContentStyle.height;
            phoneContent.style.bottom = originalPhoneContentStyle.bottom;
          }
          hiddenContainers.forEach(container => {
            container.style.display = '';
          });
          gridItems.forEach((item, index) => {
            item.style.border = originalBorders[index];
            item.style.borderRadius = originalItemBorderRadius[index];
          });

          canvas.toBlob(resolve, 'image/jpeg', 0.6);
        }, 100);
      } catch (err) {
        console.error('Capture error:', err);
        if (gridOverlay) {
          gridOverlay.style.display = gridOverlayVisible;
        }
        element.style.borderRadius = originalBorderRadius;
        if (wallpaper) {
          wallpaper.style.borderRadius = originalWallpaperStyle.borderRadius;
        }
        if (phoneContent) {
          phoneContent.style.display = originalPhoneContentStyle.display;
        }
        hiddenContainers.forEach(container => {
          container.style.display = '';
        });
        gridItems.forEach((item, index) => {
          item.style.border = originalBorders[index];
          item.style.borderRadius = originalItemBorderRadius[index];
        });
        resolve(null);
      }
    }
  });
}

function getIconLabel(filename) {
  if (!filename) {
    return '';
  }
  const nameWithoutExt = filename.split('.')[0];
  const words = nameWithoutExt.split(/[_\-]/);
  const lastWord = words[words.length - 1];
  return lastWord.charAt(0).toUpperCase() + lastWord.slice(1);
}

function collectPreviewFiles(nodes) {
  const previewFiles = [];

  function traverse(node) {
    if (node.type === 'file' && node.url && isImageFile(node.name) && isPreviewFile(node.name)) {
      previewFiles.push(node);
    }
    if (node.type === 'folder' && node.children) {
      node.children.forEach(traverse);
    }
  }

  nodes.forEach(traverse);
  return previewFiles;
}

async function collectPreviewFilesWithDimensions(nodes) {
  const previewFiles = await collectPreviewFiles(nodes);
  const filesWithDimensions = [];

  for (const file of previewFiles) {
    const dimensions = await getImageDimensions(file.url);
    if (dimensions) {
      const ratio = dimensions.width / dimensions.height;
      file.is2x1 = Math.abs(ratio - 2) < 0.1;
      file.is1x1 = Math.abs(ratio - 1) < 0.1;
      file.ratio = ratio;
      filesWithDimensions.push(file);
    }
  }

  return filesWithDimensions;
}

function collectIconFiles(nodes) {
  const iconFiles = [];

  function traverse(node) {
    if (node.type === 'file' && node.url && isImageFile(node.name) && !isWallpaper(node.name) && !isPreviewFile(node.name)) {
      iconFiles.push(node);
    }
    if (node.type === 'folder' && node.children) {
      node.children.forEach(traverse);
    }
  }

  nodes.forEach(traverse);
  return iconFiles;
}

async function fetchImageAsBlobUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type');
    const isImageType = contentType && contentType.startsWith('image/');

    let blob = await response.blob();

    if (!isImageType) {
      const filename = url.split('/').pop().split('?')[0];
      const mimeType = getImageMimeType(filename);
      if (mimeType) {
        const arrayBuffer = await blob.arrayBuffer();
        blob = new Blob([arrayBuffer], { type: mimeType });
      }
    }

    const blobUrl = URL.createObjectURL(blob);
    return blobUrl;
  } catch (error) {
    return null;
  }
}

async function prefetchImagesForDisplay(fileNodes) {
  const promises = fileNodes.map(async (fileNode) => {
    if ((fileNode.url || fileNode.r2Url) && isImageFile(fileNode.name)) {
      const bestUrl = fileNode.r2Url || fileNode.url;
      if (!bestUrl || bestUrl.trim() === '') {
        return fileNode;
      }

      let blobUrl = null;

      if (fileNode.url) {
        blobUrl = await fetchImageAsBlobUrl(fileNode.url);
      }

      if (!blobUrl && fileNode.r2Url) {
        blobUrl = await fetchImageAsBlobUrl(fileNode.r2Url);
      }

      if (blobUrl) {
        fileNode.blobUrl = blobUrl;
        fileNode.url = blobUrl;
      }
    }
    return fileNode;
  });

  await Promise.all(promises);
  return fileNodes;
}

async function testImageUrl(fileName, url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      console.log('Image loaded successfully:', fileName, '-', url);
      resolve(true);
    };
    img.onerror = (error) => {
      console.error('Image load failed:', fileName, '-', url, error.message);
      resolve(false);
    };
    img.src = url;
  });
}

async function fetchImageWithCors(url) {
  try {
    console.log('fetchImageWithCors - actual URL:', url);
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    });

    const contentType = response.headers.get('content-type');
    console.log('fetchImageWithCors - status:', response.status, 'Content-Type:', contentType);
    const isImageType = contentType && contentType.startsWith('image/');

    const blob = await response.blob();

    if (!isImageType) {
      console.error('Server returned non-image content type:', contentType, 'URL:', url);

      const textContent = await blob.text();
      if (textContent && textContent.length < 2000) {
        console.error('Response content preview:', textContent.substring(0, 500));
      }

      showNotification(`图片加载失败：服务器返回 ${contentType}，请检查服务器配置`, 'error');
      return null;
    }

    const blobUrl = URL.createObjectURL(blob);
    return { blobUrl, blob };
  } catch (error) {
    console.log('Fetch error:', error.message, 'URL:', url);
    return null;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl === 'string') {
        resolve(dataUrl);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function prefetchImagesWithFallback(fileNodes) {
  await prefetchImagesForDisplay(fileNodes);

  for (const fileNode of fileNodes) {
    if (fileNode.type === 'file' && isImageFile(fileNode.name)) {
      if (!fileNode.url || !fileNode.url.startsWith('blob:') && !fileNode.url.startsWith('http')) {
        if (fileNode.originalUrl && fileNode.originalUrl.startsWith('http')) {
          fileNode.url = fileNode.originalUrl;
        }
      }
    }
  }

  return fileNodes;
}

function resetWeatherWidget(container) {
  const weatherContainer = container || document.querySelector(
    '.grid-item-container.custom-container-4[style*="top: 21.5%"]'
  );
  if (!weatherContainer) return;

  const gridItem = weatherContainer.querySelector('.grid-item');
  if (!gridItem) return;

  // 清除原有内容（如果有）
  gridItem.innerHTML = '';

  // 重新添加 weather-widget 类并设置样式
  gridItem.classList.add('weather-widget');
  gridItem.classList.add('custom-size-4');
  gridItem.style.backgroundImage = '';
  gridItem.style.background = 'transparent';
  gridItem.style.border = '1px dashed rgba(255, 255, 255, 0.2)';
  gridItem.style.flexDirection = 'row';
  gridItem.style.alignItems = 'center';
  gridItem.style.justifyContent = 'space-between';
  gridItem.style.color = state.settings.textColor;
  gridItem.style.fontFamily =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  gridItem.style.padding = '0 10px';
  gridItem.dataset.url = '';
  gridItem.dataset.name = '';
  gridItem.draggable = true;

  // 获取当前时间与日期
  const now = new Date();
  const timeStr = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  const weekdayNames = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday',
    'Thursday', 'Friday', 'Saturday'
  ];
  const dateStr = `${monthNames[now.getMonth()]} ${now.getDate()}`;
  const weekdayStr = weekdayNames[now.getDay()];

  // 重建天气小部件 HTML
  gridItem.innerHTML = `
    <div class="weather-time" id="weather-time">${timeStr}</div>
    <div class="weather-right">
      <div class="weather-info">
        <span class="weather-condition">Sunny</span>
        <span class="weather-temp">25°C</span>
        <img class="weather-icon" src="resources/sun.png" alt="Sun" />
      </div>
      <div class="weather-date-row">
        <span class="weather-date" id="weather-date">${dateStr}</span>
        <span class="weather-weekday" id="weather-weekday">${weekdayStr}</span>
      </div>
    </div>
  `;

  // 更新标签文字
  const iconLabel = weatherContainer.querySelector('.icon-label');
  if (iconLabel) iconLabel.textContent = 'Clock';

  // 确保容器可见
  weatherContainer.classList.remove('hidden');
  weatherContainer.classList.add('has-content');
  weatherContainer.style.display = 'block';

  if (gridItem) {
    gridItem.style.border = '1px dashed rgba(255, 255, 255, 0.2)';
  }

  addDeleteIcon(gridItem);
}

async function fillCustomContainers(previewFiles) {
  const weatherContainer = document.querySelector(
    '.grid-item-container.custom-container-4[style*="top: 21.5%"]'
  );

  const otherContainers4 = document.querySelectorAll(
    '.grid-item-container.custom-container-4:not(.initially-hidden):not([style*="top: 21.5%"])'
  );

  const containers2 = document.querySelectorAll(
    '.grid-item-container.custom-container-2:not(.initially-hidden)'
  );

  document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2)').forEach(container => {
    container.style.display = '';
    container.classList.remove('overlapped');
  });

  const ratio1Files = previewFiles.filter(f => f.is1x1);
  const ratio2Files = previewFiles.filter(f => f.is2x1);
  const otherFiles = previewFiles.filter(f => !f.is1x1 && !f.is2x1);

  let ratio1Index = 0;
  let ratio2Index = 0;
  let otherIndex = 0;

  if (weatherContainer) {
    const gridItem = weatherContainer.querySelector('.grid-item');
    const hasWeatherWidget = gridItem && gridItem.classList.contains('weather-widget');

    let weatherFile = null;
    if (ratio2Index < ratio2Files.length) {
      weatherFile = ratio2Files[ratio2Index++];
    } else if (otherIndex < otherFiles.length) {
      weatherFile = otherFiles[otherIndex++];
    }

    if (weatherFile) {
      const iconLabel = weatherContainer.querySelector('.icon-label');
      if (gridItem) {
        gridItem.innerHTML = '';
        gridItem.classList.remove('weather-widget');
        gridItem.style.backgroundImage = `url(${weatherFile.url})`;
        gridItem.style.backgroundSize = 'cover';
        gridItem.style.backgroundPosition = 'center';
        gridItem.style.backgroundRepeat = 'no-repeat';
        gridItem.dataset.url = weatherFile.url;
        gridItem.dataset.name = weatherFile.name;
        gridItem.draggable = true;
        gridItem.dataset.isPreview = 'true';
        gridItem.style.border = '1px dashed rgba(255, 255, 255, 0.2)';
        addDeleteIcon(gridItem);
      }
      if (iconLabel) iconLabel.textContent = getIconLabel(weatherFile.name);
      weatherContainer.classList.remove('hidden');
      weatherContainer.classList.add('has-content');
      weatherContainer.style.display = 'block';
    } else if (hasWeatherWidget) {
      resetWeatherWidget();
    }
  }

  containers2.forEach(container => {
    const gridItem = container.querySelector('.grid-item');
    const iconLabel = container.querySelector('.icon-label');

    if (ratio1Index < ratio1Files.length) {
      const file = ratio1Files[ratio1Index++];
      if (gridItem) {
        gridItem.innerHTML = '';
        gridItem.classList.remove('weather-widget');
        gridItem.style.backgroundImage = `url(${file.url})`;
        gridItem.style.backgroundSize = 'cover';
        gridItem.style.backgroundPosition = 'center';
        gridItem.style.backgroundRepeat = 'no-repeat';
        gridItem.dataset.url = file.url;
        gridItem.dataset.name = file.name;
        gridItem.draggable = true;
        gridItem.dataset.isPreview = 'true';
        gridItem.style.border = '1px dashed rgba(255, 255, 255, 0.2)';
        addDeleteIcon(gridItem);
      }
      if (iconLabel) iconLabel.textContent = getIconLabel(file.name);
      container.classList.remove('hidden');
      container.classList.add('has-content');
      container.style.display = 'block';
    } else {
      if (gridItem) {
        gridItem.innerHTML = '';
        gridItem.classList.remove('weather-widget');
        gridItem.style.backgroundImage = 'none';
        gridItem.style.background = '';
        gridItem.dataset.url = '';
        gridItem.dataset.name = '';
        gridItem.draggable = false;
        delete gridItem.dataset.isPreview;
        gridItem.style.border = 'none';
        const delIcon = gridItem.querySelector('.delete-icon');
        if (delIcon) delIcon.remove();
      }
      if (iconLabel) iconLabel.textContent = 'Messages';
      container.classList.remove('hidden');
      container.classList.remove('has-content');
      container.style.display = 'block';
    }
  });

  otherContainers4.forEach(container => {
    const gridItem = container.querySelector('.grid-item');
    const iconLabel = container.querySelector('.icon-label');

    let file = null;
    if (ratio2Index < ratio2Files.length) {
      file = ratio2Files[ratio2Index++];
    } else if (otherIndex < otherFiles.length) {
      file = otherFiles[otherIndex++];
    }

    if (file) {
      if (gridItem) {
        gridItem.innerHTML = '';
        gridItem.classList.remove('weather-widget');
        gridItem.style.backgroundImage = `url(${file.url})`;
        gridItem.style.backgroundSize = 'cover';
        gridItem.style.backgroundPosition = 'center';
        gridItem.style.backgroundRepeat = 'no-repeat';
        gridItem.dataset.url = file.url;
        gridItem.dataset.name = file.name;
        gridItem.draggable = true;
        gridItem.dataset.isPreview = 'true';
        gridItem.style.border = '1px dashed rgba(255, 255, 255, 0.2)';
        addDeleteIcon(gridItem);
      }
      if (iconLabel) iconLabel.textContent = getIconLabel(file.name);
      container.classList.remove('hidden');
      container.classList.add('has-content');
      container.style.display = 'block';
    } else {
      // 没有更多预览文件 — 清空该容器
      if (gridItem) {
        gridItem.innerHTML = '';
        gridItem.classList.remove('weather-widget');
        gridItem.style.backgroundImage = 'none';
        gridItem.style.background = '';
        gridItem.dataset.url = '';
        gridItem.dataset.name = '';
        gridItem.draggable = false;
        delete gridItem.dataset.isPreview;
        gridItem.style.border = 'none';
        const delIcon = gridItem.querySelector('.delete-icon');
        if (delIcon) delIcon.remove();
      }
      if (iconLabel) iconLabel.textContent = 'Messages';
      container.classList.remove('hidden');
      container.classList.remove('has-content');
      container.style.display = 'block';
    }
  });

  updateOverlappingIcons();
  addCustomContainerDragListeners();
  updateExportButtonState();
}

function updateOverlappingIcons() {
  const normalContainers = document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2)');

  normalContainers.forEach(container => {
    container.classList.remove('overlapped');
  });

  document.querySelectorAll('.grid-item-container.custom-container-4, .grid-item-container.custom-container-2').forEach(customContainer => {
    const isContainer4 = customContainer.classList.contains('custom-container-4');
    const gridItem = customContainer.querySelector(isContainer4 ? '.grid-item.custom-size-4' : '.grid-item.custom-size-2');
    const hasContent = gridItem && (
      (gridItem.style.backgroundImage && gridItem.style.backgroundImage !== 'none') ||
      gridItem.classList.contains('weather-widget')
    );

    if (!hasContent) {
      return;
    }

    const customContainerTop = customContainer.style.top;
    const customContainerLeft = customContainer.style.left;

    if (isContainer4) {
      const overlappedRows = OVERLAP_MAP_4[customContainerTop] || [];
      normalContainers.forEach(normalContainer => {
        const isDockItem = normalContainer.classList.contains('dock-container');
        const styleTop = normalContainer.style.top;

        if (!isDockItem && overlappedRows.includes(styleTop)) {
          normalContainer.classList.add('overlapped');
        }
      });
    } else {
      const overlappedPositions = (OVERLAP_MAP_2[customContainerTop] && OVERLAP_MAP_2[customContainerTop][customContainerLeft]) || [];
      normalContainers.forEach(normalContainer => {
        const isDockItem = normalContainer.classList.contains('dock-container');
        const styleTop = normalContainer.style.top;
        const styleLeft = normalContainer.style.left;

        if (!isDockItem) {
          const matches = overlappedPositions.some(pos => pos.top === styleTop && pos.left === styleLeft);
          if (matches) {
            normalContainer.classList.add('overlapped');
          }
        }
      });
    }
  });
}

function isOverlapping(rect1, rect2) {
  return !(
    rect1.right < rect2.left ||
    rect1.left > rect2.right ||
    rect1.bottom < rect2.top ||
    rect1.top > rect2.bottom
  );
}

const OVERLAP_MAP_4 = {
  '8.5%': ['11.5%', '24.5%'],
  '21.5%': ['24.5%', '37.5%'],
  '34.5%': ['37.5%', '50.5%'],
  '47.5%': ['50.5%', '63.5%'],
  '60.5%': ['63.5%', '76.5%'],
};

const OVERLAP_MAP_2 = {
  '8.5%': {
    '8%': [
      { top: '11.5%', left: '16.2%' },
      { top: '11.5%', left: '38.8%' },
      { top: '24.5%', left: '16.2%' },
      { top: '24.5%', left: '38.8%' },
    ],
    '30.4%': [
      { top: '11.5%', left: '38.8%' },
      { top: '11.5%', left: '61.4%' },
      { top: '24.5%', left: '38.8%' },
      { top: '24.5%', left: '61.4%' },
    ],
    '52.8%': [
      { top: '11.5%', left: '61.4%' },
      { top: '11.5%', left: '83.9%' },
      { top: '24.5%', left: '61.4%' },
      { top: '24.5%', left: '83.9%' },
    ],
  },
  '21.5%': {
    '8%': [
      { top: '24.5%', left: '16.2%' },
      { top: '24.5%', left: '38.8%' },
      { top: '37.5%', left: '16.2%' },
      { top: '37.5%', left: '38.8%' },
    ],
    '30.4%': [
      { top: '24.5%', left: '38.8%' },
      { top: '24.5%', left: '61.4%' },
      { top: '37.5%', left: '38.8%' },
      { top: '37.5%', left: '61.4%' },
    ],
    '52.8%': [
      { top: '24.5%', left: '61.4%' },
      { top: '24.5%', left: '83.9%' },
      { top: '37.5%', left: '61.4%' },
      { top: '37.5%', left: '83.9%' },
    ],
  },
  '34.5%': {
    '8%': [
      { top: '37.5%', left: '16.2%' },
      { top: '37.5%', left: '38.8%' },
      { top: '50.5%', left: '16.2%' },
      { top: '50.5%', left: '38.8%' },
    ],
    '30.4%': [
      { top: '37.5%', left: '38.8%' },
      { top: '37.5%', left: '61.4%' },
      { top: '50.5%', left: '38.8%' },
      { top: '50.5%', left: '61.4%' },
    ],
    '52.8%': [
      { top: '37.5%', left: '61.4%' },
      { top: '37.5%', left: '83.9%' },
      { top: '50.5%', left: '61.4%' },
      { top: '50.5%', left: '83.9%' },
    ],
  },
  '47.5%': {
    '8%': [
      { top: '50.5%', left: '16.2%' },
      { top: '50.5%', left: '38.8%' },
      { top: '63.5%', left: '16.2%' },
      { top: '63.5%', left: '38.8%' },
    ],
    '30.4%': [
      { top: '50.5%', left: '38.8%' },
      { top: '50.5%', left: '61.4%' },
      { top: '63.5%', left: '38.8%' },
      { top: '63.5%', left: '61.4%' },
    ],
    '52.8%': [
      { top: '50.5%', left: '61.4%' },
      { top: '50.5%', left: '83.9%' },
      { top: '63.5%', left: '61.4%' },
      { top: '63.5%', left: '83.9%' },
    ],
  },
  '60.5%': {
    '8%': [
      { top: '63.5%', left: '16.2%' },
      { top: '63.5%', left: '38.8%' },
      { top: '76.5%', left: '16.2%' },
      { top: '76.5%', left: '38.8%' },
    ],
    '30.4%': [
      { top: '63.5%', left: '38.8%' },
      { top: '63.5%', left: '61.4%' },
      { top: '76.5%', left: '38.8%' },
      { top: '76.5%', left: '61.4%' },
    ],
    '52.8%': [
      { top: '63.5%', left: '61.4%' },
      { top: '63.5%', left: '83.9%' },
      { top: '76.5%', left: '61.4%' },
      { top: '76.5%', left: '83.9%' },
    ],
  },
};

function hideOverlappingRows(topPosition, containerType = 'custom-container-4', leftPosition = '') {
  if (containerType === 'custom-container-4') {
    const rowsToHide = OVERLAP_MAP_4[topPosition] || [];
    document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2)').forEach(container => {
      const styleTop = container.style.top;
      if (rowsToHide.includes(styleTop)) {
        container.style.display = 'none';
      }
    });
  } else {
    const positionsToHide = (OVERLAP_MAP_2[topPosition] && OVERLAP_MAP_2[topPosition][leftPosition]) || [];
    document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2)').forEach(container => {
      const styleTop = container.style.top;
      const styleLeft = container.style.left;
      const matches = positionsToHide.some(pos => pos.top === styleTop && pos.left === styleLeft);
      if (matches) {
        container.style.display = 'none';
      }
    });
  }
}

function showOverlappingRows(topPosition, containerType = 'custom-container-4', leftPosition = '') {
  if (containerType === 'custom-container-4') {
    const rowsToShow = OVERLAP_MAP_4[topPosition] || [];
    document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2)').forEach(container => {
      const styleTop = container.style.top;
      if (rowsToShow.includes(styleTop)) {
        container.style.display = '';
        container.classList.remove('overlapped');
      }
    });
  } else {
    const positionsToShow = (OVERLAP_MAP_2[topPosition] && OVERLAP_MAP_2[topPosition][leftPosition]) || [];
    document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2)').forEach(container => {
      const styleTop = container.style.top;
      const styleLeft = container.style.left;
      const matches = positionsToShow.some(pos => pos.top === styleTop && pos.left === styleLeft);
      if (matches) {
        container.style.display = '';
        container.classList.remove('overlapped');
      }
    });
  }
}

function addCustomContainerDragListeners() {
  document.querySelectorAll('.grid-item.custom-size-4, .grid-item.custom-size-2').forEach(gridItem => {
    gridItem.draggable = true;
    gridItem.removeEventListener('dragstart', handleCustomContainerDragStart);
    gridItem.removeEventListener('dragend', handleCustomContainerDragEnd);
    gridItem.addEventListener('dragstart', handleCustomContainerDragStart);
    gridItem.addEventListener('dragend', handleCustomContainerDragEnd);
  });

  document.querySelectorAll('.grid-item-container.custom-container-4').forEach(container => {
    container.removeEventListener('dragover', handleCustomContainer4DragOver);
    container.removeEventListener('drop', handleCustomContainer4Drop);
    container.addEventListener('dragover', handleCustomContainer4DragOver);
    container.addEventListener('drop', handleCustomContainer4Drop);
  });

  document.querySelectorAll('.grid-item-container.custom-container-2').forEach(container => {
    container.removeEventListener('dragover', handleCustomContainer2DragOver);
    container.removeEventListener('drop', handleCustomContainer2Drop);
    container.addEventListener('dragover', handleCustomContainer2DragOver);
    container.addEventListener('drop', handleCustomContainer2Drop);
  });
}

function handleCustomContainerDragEnd(e) {
  const gridItem = e.currentTarget;
  gridItem.style.opacity = '1';

  document.querySelectorAll('.grid-item-container.custom-container-2').forEach(container => {
    container.style.visibility = 'visible';
  });

  const containers = document.querySelectorAll('.grid-item-container.custom-container-4, .grid-item-container.custom-container-2');

  containers.forEach(customContainer => {
    const item = customContainer.querySelector('.grid-item');
    if (!item) {
      customContainer.classList.add('hidden');
      customContainer.style.display = 'none';
    } else {
      const hasBackground = item.style.backgroundImage && item.style.backgroundImage !== 'none';
      const hasWeatherWidget = item.classList.contains('weather-widget');
      const hasContent = hasBackground || hasWeatherWidget;

      if (hasContent) {
        customContainer.classList.remove('hidden');
        customContainer.classList.add('has-content');
        customContainer.style.display = 'block';
        item.style.border = '1px dashed rgba(255, 255, 255, 0.2)';
      } else {
        customContainer.classList.remove('hidden');
        customContainer.classList.remove('has-content');
        customContainer.style.display = 'block';
        item.style.border = 'none';
      }
    }
  });
}

function handleCustomContainerDragStart(e) {
  const gridItem = e.currentTarget;
  const container = gridItem.parentElement;
  const isWeatherWidget = gridItem.classList.contains('weather-widget');
  const hasContent = gridItem.style.backgroundImage && gridItem.style.backgroundImage !== 'none';
  const sourceTop = container.style.top;
  const sourceLeft = container.style.left;
  const containerType = container.classList.contains('custom-container-4') ? 'custom-container-4' : 'custom-container-2';

  const dragData = {
    containerTop: sourceTop,
    containerLeft: sourceLeft,
    url: hasContent ? gridItem.dataset.url : null,
    name: hasContent ? gridItem.dataset.name : null,
    isWeatherWidget: isWeatherWidget,
    isFromCustomContainer: true,
    containerType: containerType
  };

  e.dataTransfer.setData('text/plain', JSON.stringify(dragData));

  gridItem.style.opacity = '0.5';

  if (containerType === 'custom-container-4') {
    document.querySelectorAll('.grid-item-container.custom-container-2').forEach(container => {
      container.style.visibility = 'hidden';
    });
  }
}

function handleCustomContainerDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleCustomContainerDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const data = e.dataTransfer.getData('text/plain');
  if (!data) return;

  try {
    const sourceData = JSON.parse(data);
    const sourceTop = sourceData.containerTop;
    const sourceLeft = sourceData.containerLeft;
    const sourceUrl = sourceData.url;
    const sourceName = sourceData.name;
    const isSourceWeatherWidget = sourceData.isWeatherWidget;
    const containers = Array.from(document.querySelectorAll('.grid-item-container.custom-container-4, .grid-item-container.custom-container-2'));
    const targetContainer = e.currentTarget;
    const sourceContainer = containers.find(container =>
      container.style.top === sourceTop && container.style.left === sourceLeft
    );

    if (!sourceContainer) {
      containers.forEach(container => {
        const gridItem = container.querySelector('.grid-item');
        if (gridItem) {
          gridItem.style.opacity = '1';
        }
      });
      return;
    }

    if (sourceContainer === targetContainer) {
      const gridItem = sourceContainer.querySelector('.grid-item');
      if (gridItem) {
        gridItem.style.opacity = '1';
      }
      return;
    }

    const sourceIsContainer4 = sourceContainer.classList.contains('custom-container-4');
    const targetIsContainer4 = targetContainer.classList.contains('custom-container-4');

    if (sourceIsContainer4 !== targetIsContainer4) {
      containers.forEach(container => {
        const gridItem = container.querySelector('.grid-item');
        if (gridItem) {
          gridItem.style.opacity = '1';
        }
      });
      return;
    }

    const sourceGridItem = sourceContainer.querySelector('.grid-item');
    const sourceIconLabel = sourceContainer.querySelector('.icon-label');

    const targetGridItem = targetContainer.querySelector('.grid-item');
    const targetIconLabel = targetContainer.querySelector('.icon-label');

    // 清空源容器
    sourceGridItem.innerHTML = '';
    sourceGridItem.classList.remove('weather-widget');
    sourceGridItem.style.background = '';
    sourceGridItem.style.border = 'none';
    sourceGridItem.style.flexDirection = '';
    sourceGridItem.style.alignItems = '';
    sourceGridItem.style.justifyContent = '';
    sourceGridItem.style.color = '';
    sourceGridItem.style.fontFamily = '';
    sourceGridItem.style.padding = '';
    sourceGridItem.style.backgroundImage = '';
    sourceGridItem.dataset.url = '';
    sourceGridItem.dataset.name = '';
    sourceGridItem.draggable = false;
    delete sourceGridItem.dataset.isPreview;

    // 移除源容器的删除图标
    const sourceDelIcon = sourceGridItem.querySelector('.delete-icon');
    if (sourceDelIcon) sourceDelIcon.remove();

    // 源容器的标签恢复为Messages
    if (sourceIconLabel) {
      sourceIconLabel.textContent = 'Messages';
    }

    sourceContainer.classList.remove('hidden');
    sourceContainer.classList.remove('has-content');
    sourceContainer.style.display = 'block';
    sourceGridItem.style.border = 'none';

    // 清空目标容器
    targetGridItem.innerHTML = '';
    targetGridItem.classList.remove('weather-widget');
    targetGridItem.style.background = '';
    targetGridItem.style.border = 'none';
    targetGridItem.style.flexDirection = '';
    targetGridItem.style.alignItems = '';
    targetGridItem.style.justifyContent = '';
    targetGridItem.style.color = '';
    targetGridItem.style.fontFamily = '';
    targetGridItem.style.padding = '';
    targetGridItem.style.backgroundImage = '';
    targetGridItem.dataset.url = '';
    targetGridItem.dataset.name = '';
    targetGridItem.draggable = false;
    delete targetGridItem.dataset.isPreview;

    // 移除目标容器的删除图标
    const targetDelIcon = targetGridItem.querySelector('.delete-icon');
    if (targetDelIcon) targetDelIcon.remove();

    if (isSourceWeatherWidget) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const weekdayNames = ['Sun', 'Mon', 'Tues', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dateStr = `${monthNames[now.getMonth()]} ${now.getDate()}`;
      const weekdayStr = weekdayNames[now.getDay()];

      targetGridItem.innerHTML = `
        <div class="weather-time" id="weather-time">${timeStr}</div>
        <div class="weather-right">
          <div class="weather-info">
            <span class="weather-condition">Sunny</span>
            <span class="weather-temp">25°C</span>
            <img class="weather-icon" src="resources/sun.png" alt="Sun" />
          </div>
          <div class="weather-date-row">
            <span class="weather-date" id="weather-date">${dateStr}</span>
            <span class="weather-weekday" id="weather-weekday">${weekdayStr}</span>
          </div>
        </div>
      `;
      targetGridItem.classList.add('weather-widget');
      targetGridItem.style.background = 'transparent';
      targetGridItem.style.border = '1px dashed rgba(255, 255, 255, 0.2)';
      targetGridItem.style.flexDirection = 'row';
      targetGridItem.style.alignItems = 'center';
      targetGridItem.style.justifyContent = 'space-between';
      targetGridItem.style.color = state.settings.textColor;
      targetGridItem.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      targetGridItem.style.padding = '0 10px';
      targetGridItem.style.backgroundImage = '';
      targetGridItem.dataset.url = '';
      targetGridItem.dataset.name = '';
      targetGridItem.draggable = true;
    } else {
      targetGridItem.style.backgroundImage = `url(${sourceUrl})`;
      targetGridItem.style.backgroundSize = 'cover';
      targetGridItem.style.backgroundPosition = 'center';
      targetGridItem.style.backgroundRepeat = 'no-repeat';
      targetGridItem.dataset.url = sourceUrl;
      targetGridItem.dataset.name = sourceName;
      targetGridItem.draggable = true;
      targetGridItem.dataset.isPreview = 'true';
      targetGridItem.style.border = '1px dashed rgba(255, 255, 255, 0.2)';
      addDeleteIcon(targetGridItem);
    }

    if (targetIconLabel) {
      targetIconLabel.textContent = isSourceWeatherWidget ? 'Clock' : getIconLabel(sourceName);
    }

    targetContainer.classList.remove('hidden');
    targetContainer.classList.add('has-content');
    targetContainer.style.display = 'block';

    containers.forEach(container => {
      const gridItem = container.querySelector('.grid-item');
      if (gridItem) {
        gridItem.style.opacity = '1';
      }
    });

    const targetTop = targetContainer.style.top;
    const targetLeft = targetContainer.style.left;

    showOverlappingRows(sourceTop, sourceIsContainer4 ? 'custom-container-4' : 'custom-container-2', sourceLeft);
    hideOverlappingRows(targetTop, targetIsContainer4 ? 'custom-container-4' : 'custom-container-2', targetLeft);

    updateOverlappingIcons();
    addCustomContainerDragListeners();

  } catch (err) {
    console.error('Failed to handle custom container drop:', err);
  }
}

function handleCustomContainer4DragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleCustomContainer2DragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleCustomContainer4Drop(e) {
  e.preventDefault();
  e.stopPropagation();

  const data = e.dataTransfer.getData('text/plain');
  if (!data) return;

  try {
    const sourceData = JSON.parse(data);
    const sourceTop = sourceData.containerTop;
    const sourceLeft = sourceData.containerLeft;
    const sourceUrl = sourceData.url;
    const sourceName = sourceData.name;
    const isSourceWeatherWidget = sourceData.isWeatherWidget;

    const containers = Array.from(document.querySelectorAll('.grid-item-container.custom-container-4'));
    const targetContainer = e.currentTarget;

    if (!targetContainer.classList.contains('custom-container-4')) {
      containers.forEach(container => {
        const gridItem = container.querySelector('.grid-item');
        if (gridItem) {
          gridItem.style.opacity = '1';
        }
      });
      return;
    }

    const sourceContainer = containers.find(container =>
      container.style.top === sourceTop && container.style.left === sourceLeft
    );

    if (!sourceContainer) {
      containers.forEach(container => {
        const gridItem = container.querySelector('.grid-item');
        if (gridItem) {
          gridItem.style.opacity = '1';
        }
      });
      return;
    }

    if (sourceContainer === targetContainer) {
      const gridItem = sourceContainer.querySelector('.grid-item');
      if (gridItem) {
        gridItem.style.opacity = '1';
      }
      return;
    }

    const sourceGridItem = sourceContainer.querySelector('.grid-item');
    const sourceIconLabel = sourceContainer.querySelector('.icon-label');

    const targetGridItem = targetContainer.querySelector('.grid-item');
    const targetIconLabel = targetContainer.querySelector('.icon-label');

    sourceGridItem.innerHTML = '';
    sourceGridItem.classList.remove('weather-widget');
    sourceGridItem.style.background = '';
    sourceGridItem.style.border = 'none';
    sourceGridItem.style.flexDirection = '';
    sourceGridItem.style.alignItems = '';
    sourceGridItem.style.justifyContent = '';
    sourceGridItem.style.color = '';
    sourceGridItem.style.fontFamily = '';
    sourceGridItem.style.padding = '';
    sourceGridItem.style.backgroundImage = '';
    sourceGridItem.dataset.url = '';
    sourceGridItem.dataset.name = '';
    sourceGridItem.draggable = false;
    delete sourceGridItem.dataset.isPreview;

    const sourceDelIcon = sourceGridItem.querySelector('.delete-icon');
    if (sourceDelIcon) sourceDelIcon.remove();

    if (sourceIconLabel) {
      sourceIconLabel.textContent = 'Messages';
    }

    sourceContainer.classList.remove('hidden');
    sourceContainer.classList.remove('has-content');
    sourceContainer.style.display = 'block';
    sourceGridItem.style.border = 'none';

    targetGridItem.innerHTML = '';
    targetGridItem.classList.remove('weather-widget');
    targetGridItem.style.background = '';
    targetGridItem.style.border = 'none';
    targetGridItem.style.flexDirection = '';
    targetGridItem.style.alignItems = '';
    targetGridItem.style.justifyContent = '';
    targetGridItem.style.color = '';
    targetGridItem.style.fontFamily = '';
    targetGridItem.style.padding = '';
    targetGridItem.style.backgroundImage = '';
    targetGridItem.dataset.url = '';
    targetGridItem.dataset.name = '';
    targetGridItem.draggable = false;
    delete targetGridItem.dataset.isPreview;

    const targetDelIcon = targetGridItem.querySelector('.delete-icon');
    if (targetDelIcon) targetDelIcon.remove();

    if (isSourceWeatherWidget) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const weekdayNames = ['Sun', 'Mon', 'Tues', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dateStr = `${monthNames[now.getMonth()]} ${now.getDate()}`;
      const weekdayStr = weekdayNames[now.getDay()];

      targetGridItem.innerHTML = `
        <div class="weather-time" id="weather-time">${timeStr}</div>
        <div class="weather-right">
          <div class="weather-info">
            <span class="weather-condition">Sunny</span>
            <span class="weather-temp">25°C</span>
            <img class="weather-icon" src="resources/sun.png" alt="Sun" />
          </div>
          <div class="weather-date-row">
            <span class="weather-date" id="weather-date">${dateStr}</span>
            <span class="weather-weekday" id="weather-weekday">${weekdayStr}</span>
          </div>
        </div>
      `;
      targetGridItem.classList.add('weather-widget');
      targetGridItem.style.background = 'transparent';
      targetGridItem.style.border = '1px dashed rgba(255, 255, 255, 0.2)';
      targetGridItem.style.flexDirection = 'row';
      targetGridItem.style.alignItems = 'center';
      targetGridItem.style.justifyContent = 'space-between';
      targetGridItem.style.color = state.settings.textColor;
      targetGridItem.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      targetGridItem.style.padding = '0 10px';
      targetGridItem.style.backgroundImage = '';
      targetGridItem.dataset.url = '';
      targetGridItem.dataset.name = '';
      targetGridItem.draggable = true;
    } else {
      targetGridItem.style.backgroundImage = `url(${sourceUrl})`;
      targetGridItem.style.backgroundSize = 'cover';
      targetGridItem.style.backgroundPosition = 'center';
      targetGridItem.style.backgroundRepeat = 'no-repeat';
      targetGridItem.dataset.url = sourceUrl;
      targetGridItem.dataset.name = sourceName;
      targetGridItem.draggable = true;
      targetGridItem.dataset.isPreview = 'true';
      targetGridItem.style.border = '1px dashed rgba(255, 255, 255, 0.2)';
      addDeleteIcon(targetGridItem);
    }

    if (targetIconLabel) {
      targetIconLabel.textContent = isSourceWeatherWidget ? 'Clock' : getIconLabel(sourceName);
    }

    targetContainer.classList.remove('hidden');
    targetContainer.classList.add('has-content');
    targetContainer.style.display = 'block';

    containers.forEach(container => {
      const gridItem = container.querySelector('.grid-item');
      if (gridItem) {
        gridItem.style.opacity = '1';
      }
    });

    const targetTop = targetContainer.style.top;
    const sourceTopVal = sourceContainer.style.top;

    showOverlappingRows(sourceTopVal, 'custom-container-4');
    hideOverlappingRows(targetTop, 'custom-container-4');

    updateOverlappingIcons();
    addCustomContainerDragListeners();

  } catch (err) {
    console.error('Failed to handle custom container 4 drop:', err);
  }
}

function handleCustomContainer2Drop(e) {
  e.preventDefault();
  e.stopPropagation();

  const data = e.dataTransfer.getData('text/plain');
  if (!data) return;

  try {
    const sourceData = JSON.parse(data);
    const sourceTop = sourceData.containerTop;
    const sourceLeft = sourceData.containerLeft;
    const sourceUrl = sourceData.url;
    const sourceName = sourceData.name;

    const containers = Array.from(document.querySelectorAll('.grid-item-container.custom-container-2'));
    const targetContainer = e.currentTarget;

    if (!targetContainer.classList.contains('custom-container-2')) {
      containers.forEach(container => {
        const gridItem = container.querySelector('.grid-item');
        if (gridItem) {
          gridItem.style.opacity = '1';
        }
      });
      return;
    }

    const sourceContainer = containers.find(container =>
      container.style.top === sourceTop && container.style.left === sourceLeft
    );

    if (!sourceContainer) {
      containers.forEach(container => {
        const gridItem = container.querySelector('.grid-item');
        if (gridItem) {
          gridItem.style.opacity = '1';
        }
      });
      return;
    }

    if (sourceContainer === targetContainer) {
      const gridItem = sourceContainer.querySelector('.grid-item');
      if (gridItem) {
        gridItem.style.opacity = '1';
      }
      return;
    }

    const sourceGridItem = sourceContainer.querySelector('.grid-item');
    const sourceIconLabel = sourceContainer.querySelector('.icon-label');

    const targetGridItem = targetContainer.querySelector('.grid-item');
    const targetIconLabel = targetContainer.querySelector('.icon-label');

    sourceGridItem.innerHTML = '';
    sourceGridItem.classList.remove('weather-widget');
    sourceGridItem.style.background = '';
    sourceGridItem.style.border = 'none';
    sourceGridItem.style.flexDirection = '';
    sourceGridItem.style.alignItems = '';
    sourceGridItem.style.justifyContent = '';
    sourceGridItem.style.color = '';
    sourceGridItem.style.fontFamily = '';
    sourceGridItem.style.padding = '';
    sourceGridItem.style.backgroundImage = '';
    sourceGridItem.dataset.url = '';
    sourceGridItem.dataset.name = '';
    sourceGridItem.draggable = false;
    delete sourceGridItem.dataset.isPreview;

    const sourceDelIcon = sourceGridItem.querySelector('.delete-icon');
    if (sourceDelIcon) sourceDelIcon.remove();

    if (sourceIconLabel) {
      sourceIconLabel.textContent = 'Messages';
    }

    sourceContainer.classList.remove('hidden');
    sourceContainer.classList.remove('has-content');
    sourceContainer.style.display = 'block';
    sourceGridItem.style.border = 'none';

    targetGridItem.innerHTML = '';
    targetGridItem.classList.remove('weather-widget');
    targetGridItem.style.background = '';
    targetGridItem.style.border = 'none';
    targetGridItem.style.flexDirection = '';
    targetGridItem.style.alignItems = '';
    targetGridItem.style.justifyContent = '';
    targetGridItem.style.color = '';
    targetGridItem.style.fontFamily = '';
    targetGridItem.style.padding = '';
    targetGridItem.style.backgroundImage = '';
    targetGridItem.dataset.url = '';
    targetGridItem.dataset.name = '';
    targetGridItem.draggable = false;
    delete targetGridItem.dataset.isPreview;

    const targetDelIcon = targetGridItem.querySelector('.delete-icon');
    if (targetDelIcon) targetDelIcon.remove();

    targetGridItem.style.backgroundImage = `url(${sourceUrl})`;
    targetGridItem.style.backgroundSize = 'cover';
    targetGridItem.style.backgroundPosition = 'center';
    targetGridItem.style.backgroundRepeat = 'no-repeat';
    targetGridItem.dataset.url = sourceUrl;
    targetGridItem.dataset.name = sourceName;
    targetGridItem.draggable = true;
    targetGridItem.dataset.isPreview = 'true';
    targetGridItem.style.border = '1px dashed rgba(255, 255, 255, 0.2)';
    addDeleteIcon(targetGridItem);

    if (targetIconLabel) {
      targetIconLabel.textContent = getIconLabel(sourceName);
    }

    targetContainer.classList.remove('hidden');
    targetContainer.classList.add('has-content');
    targetContainer.style.display = 'block';

    containers.forEach(container => {
      const gridItem = container.querySelector('.grid-item');
      if (gridItem) {
        gridItem.style.opacity = '1';
      }
    });

    const targetTop = targetContainer.style.top;
    const targetLeft = targetContainer.style.left;
    const sourceTopVal = sourceContainer.style.top;
    const sourceLeftVal = sourceContainer.style.left;

    showOverlappingRows(sourceTopVal, 'custom-container-2', sourceLeftVal);
    hideOverlappingRows(targetTop, 'custom-container-2', targetLeft);

    updateOverlappingIcons();
    addCustomContainerDragListeners();

  } catch (err) {
    console.error('Failed to handle custom container 2 drop:', err);
  }
}

function fillIconGrids(imageFiles) {
  const allGridContainers = document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2):not(.initially-hidden)');

  allGridContainers.forEach((container, index) => {
    container.dataset.index = index.toString();
  });

  const gridContainers = document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2):not(.initially-hidden):not(.overlapped):not([style*="grid-column"]):not([style*="display: none"])');

  let fileIndex = 0;

  const skipPositions = ['11.5%', '24.5%', '37.5%', '50.5%'];

  // 填充网格
  gridContainers.forEach(container => {
    const styleTop = container.style.top;
    const isDockItem = container.classList.contains('dock-container');

    if (skipPositions.includes(styleTop) && !isDockItem) {
      return;
    }

    if (fileIndex < imageFiles.length) {
      const file = imageFiles[fileIndex];
      const gridItem = container.querySelector('.grid-item');
      const iconLabel = container.querySelector('.icon-label');

      if (gridItem) {
        gridItem.style.backgroundImage = `url(${file.url})`;
        gridItem.style.backgroundSize = 'cover';
        gridItem.style.backgroundPosition = 'center';
        gridItem.style.backgroundRepeat = 'no-repeat';
        // 添加拖拽功能
        gridItem.draggable = true;
        gridItem.dataset.url = file.url;
        gridItem.dataset.name = file.name;

        // 添加删除图标
        addDeleteIcon(gridItem);
      }

      if (iconLabel) {
        iconLabel.textContent = getIconLabel(file.name);
      }

      container.classList.add('has-content');
      fileIndex++;
    }
  });

  // 为所有网格项添加拖拽事件监听器
  addGridItemDragListeners();

  updateExportButtonState();
}

function addDeleteIcon(gridItem) {
  // 先移除已有的删除图标
  const existingDeleteIcon = gridItem.querySelector('.delete-icon');
  if (existingDeleteIcon) {
    existingDeleteIcon.remove();
  }

  // 创建删除图标元素
  const deleteIcon = document.createElement('div');
  deleteIcon.className = 'delete-icon';

  // 添加点击事件
  deleteIcon.addEventListener('click', (e) => {
    e.stopPropagation(); // 阻止事件冒泡

    const container = gridItem.parentElement;
    const isCustomContainer4 = container.classList.contains('custom-container-4');
    const isCustomContainer2 = container.classList.contains('custom-container-2');
    const containerTop = container.style.top;
    const containerLeft = container.style.left;
    const hasContent = gridItem.style.backgroundImage && gridItem.style.backgroundImage !== 'none';

    if (isCustomContainer4) {
      const isWeatherWidget = gridItem.classList.contains('weather-widget');
      const hasPreview = gridItem.dataset.isPreview === 'true' || hasContent;

      if (hasPreview && !isWeatherWidget) {
        resetWeatherWidget(container);
        showOverlappingRows(containerTop, 'custom-container-4');
        updateOverlappingIcons();
        updateExportButtonState();
      } else {
        gridItem.innerHTML = '';
        gridItem.classList.remove('weather-widget');
        gridItem.classList.remove('custom-size-4');
        gridItem.style.backgroundImage = '';
        gridItem.style.background = '';
        gridItem.style.border = 'none';
        gridItem.style.flexDirection = '';
        gridItem.style.alignItems = '';
        gridItem.style.justifyContent = '';
        gridItem.style.color = '';
        gridItem.style.fontFamily = '';
        gridItem.style.padding = '';
        gridItem.dataset.url = '';
        gridItem.dataset.name = '';
        gridItem.draggable = false;
        delete gridItem.dataset.isPreview;

        const iconLabel = container.querySelector('.icon-label');
        if (iconLabel) iconLabel.textContent = 'Messages';

        container.classList.remove('has-content');

        const delIcon = gridItem.querySelector('.delete-icon');
        if (delIcon) delIcon.remove();

        showOverlappingRows(containerTop, 'custom-container-4');
        updateOverlappingIcons();
        updateExportButtonState();
      }
    } else if (isCustomContainer2) {
      gridItem.innerHTML = '';
      gridItem.classList.remove('weather-widget');
      gridItem.style.backgroundImage = '';
      gridItem.style.background = '';
      gridItem.style.border = 'none';
      gridItem.dataset.url = '';
      gridItem.dataset.name = '';
      gridItem.draggable = false;
      delete gridItem.dataset.isPreview;

      const iconLabel = container.querySelector('.icon-label');
      if (iconLabel) iconLabel.textContent = 'Messages';

      container.classList.remove('has-content');

      const delIcon = gridItem.querySelector('.delete-icon');
      if (delIcon) delIcon.remove();

      showOverlappingRows(containerTop, 'custom-container-2', containerLeft);
      updateOverlappingIcons();
      updateExportButtonState();
    } else {
      if (hasContent) {
        gridItem.style.backgroundImage = '';
        gridItem.dataset.url = '';
        gridItem.dataset.name = '';
        gridItem.draggable = false;

        const iconLabel = container.querySelector('.icon-label');
        if (iconLabel) {
          iconLabel.textContent = 'Messages';
        }

        container.classList.remove('has-content');
        container.classList.add('deleted');

        addDeleteIcon(gridItem);
        updateExportButtonState();
      } else {
        gridItem.style.border = 'none';
        gridItem.style.backgroundImage = '';
        gridItem.dataset.url = '';
        gridItem.dataset.name = '';
        gridItem.draggable = false;

        const iconLabel = container.querySelector('.icon-label');
        if (iconLabel) {
          iconLabel.style.display = 'none';
        }

        container.classList.remove('has-content');
        container.classList.add('deleted');

        const delIcon = gridItem.querySelector('.delete-icon');
        if (delIcon) delIcon.remove();
      }
    }
  });

  gridItem.appendChild(deleteIcon);
}

function addGridItemDragListeners() {
  document.querySelectorAll('.grid-item').forEach(item => {
    item.removeEventListener('dragstart', handleGridItemDragStart);
  });

  document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2)').forEach(container => {
    container.removeEventListener('dragover', handleGridItemDragOver);
    container.removeEventListener('drop', handleGridItemDrop);
  });

  document.querySelectorAll('.grid-item').forEach(item => {
    const parentContainer = item.parentElement;
    const isFromNormalContainer = !parentContainer.classList.contains('custom-container-4') && !parentContainer.classList.contains('custom-container-2');
    if (item.draggable && isFromNormalContainer) {
      item.addEventListener('dragstart', handleGridItemDragStart);
    }
  });

  document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2)').forEach(container => {
    container.addEventListener('dragover', handleGridItemDragOver);
    container.addEventListener('drop', handleGridItemDrop);
  });
}

function handleGridItemDragStart(e) {
  const item = e.currentTarget;
  const parentContainer = item.parentElement;
  const isFromCustomContainer = parentContainer.classList.contains('custom-container-4') || parentContainer.classList.contains('custom-container-2');
  const isWeatherWidget = item.classList.contains('weather-widget');

  // 使用位置信息而不是索引来更可靠地识别容器
  const containerTop = parentContainer.style.top;
  const containerLeft = parentContainer.style.left;

  e.dataTransfer.setData('text/plain', JSON.stringify({
    url: item.dataset.url,
    name: item.dataset.name,
    isFromCustomContainer: isFromCustomContainer,
    isWeatherWidget: isWeatherWidget,
    containerTop: containerTop,
    containerLeft: containerLeft
  }));
  e.dataTransfer.setData('text/html', parentContainer.dataset.index || '');
  item.style.opacity = '0.5';
}

function handleGridItemDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleGridItemDrop(e) {
  e.preventDefault();
  const data = e.dataTransfer.getData('text/plain');
  const sourceIndex = e.dataTransfer.getData('text/html');
  if (!data) return;

  try {
    const item = JSON.parse(data);
    const targetContainer = e.currentTarget;
    const targetGridItem = targetContainer.querySelector('.grid-item');
    const targetIconLabel = targetContainer.querySelector('.icon-label');

    const isTargetContainer4 = targetContainer.classList.contains('custom-container-4');
    const isTargetContainer2 = targetContainer.classList.contains('custom-container-2');

    if (isTargetContainer4 || isTargetContainer2) {
      document.querySelectorAll('.grid-item').forEach(gridItem => {
        gridItem.style.opacity = '1';
      });
      return;
    }

    let sourceContainer = null;
    if (item.containerTop !== undefined) {
      const allContainers = document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2)');
      sourceContainer = Array.from(allContainers).find(container =>
        container.style.top === item.containerTop && container.style.left === item.containerLeft
      );
    }
    if (!sourceContainer && sourceIndex) {
      sourceContainer = document.querySelector(`.grid-item-container[data-index="${sourceIndex}"]`);
    }

    if (sourceContainer && sourceContainer === targetContainer) {
      document.querySelectorAll('.grid-item').forEach(gridItem => {
        gridItem.style.opacity = '1';
      });
      return;
    }

    if (item.isFromCustomContainer) {
      document.querySelectorAll('.grid-item').forEach(gridItem => {
        gridItem.style.opacity = '1';
      });
      return;
    }

    const originalUrl = targetGridItem.dataset.url;
    const originalName = targetGridItem.dataset.name;

    targetGridItem.style.backgroundImage = `url(${item.url})`;
    targetGridItem.style.backgroundSize = 'cover';
    targetGridItem.style.backgroundPosition = 'center';
    targetGridItem.style.backgroundRepeat = 'no-repeat';
    targetGridItem.dataset.url = item.url;
    targetGridItem.dataset.name = item.name;
    targetGridItem.draggable = true;

    if (targetIconLabel) {
      targetIconLabel.textContent = getIconLabel(item.name);
      targetIconLabel.style.display = '';
      targetIconLabel.style.visibility = '';
    }

    addDeleteIcon(targetGridItem);
    targetContainer.classList.add('has-content');
    targetContainer.classList.remove('deleted');

    if (sourceContainer) {
      const sourceGridItem = sourceContainer.querySelector('.grid-item');
      const sourceIconLabel = sourceContainer.querySelector('.icon-label');

      if (sourceGridItem) {
        if (originalUrl) {
          sourceGridItem.style.backgroundImage = `url(${originalUrl})`;
          sourceGridItem.dataset.url = originalUrl;
          sourceGridItem.dataset.name = originalName;
          sourceGridItem.draggable = true;
          addDeleteIcon(sourceGridItem);
          sourceContainer.classList.add('has-content');
        } else {
          sourceGridItem.style.backgroundImage = '';
          sourceGridItem.dataset.url = '';
          sourceGridItem.dataset.name = '';
          sourceGridItem.draggable = false;
          sourceContainer.classList.remove('has-content');
          sourceContainer.classList.add('deleted');
          addDeleteIcon(sourceGridItem);
        }
      }

      if (sourceIconLabel) {
        if (originalName) {
          sourceIconLabel.textContent = getIconLabel(originalName);
        } else {
          sourceIconLabel.textContent = 'Messages';
        }
      }
    }

    document.querySelectorAll('.grid-item').forEach(gridItem => {
      gridItem.style.opacity = '1';
    });

  } catch (err) {
    console.error('Failed to parse drag data:', err);
  }
}

function collectAllFilesForExport(nodes, parentPath = '') {
  const allFiles = [];
  for (const node of nodes) {
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    if (node.type === 'file' && node.file) {
      allFiles.push({
        path: currentPath,
        file: node.file
      });
    } else if (node.type === 'folder' && node.children) {
      allFiles.push(...collectAllFilesForExport(node.children, currentPath));
    }
  }
  return allFiles;
}

async function handleSaveToServer() {
  if (!state.currentFolderName) {
    showNotification('请先导入文件夹', 'error');
    return;
  }

  const folderNode = findFileNodeById(state.files, state.selectedFile);
  if (!folderNode || folderNode.type !== 'folder') {
    showNotification('未找到选中的文件夹', 'error');
    return;
  }

  if (folderNode.apiId) {
    showNotification('该文件夹已保存到服务器', 'success');
    return;
  }

  showNotification('正在保存到服务器...', 'success');

  await saveFolderToAPI(folderNode);
}

async function exportTheme(previewBlob, files, format = 'jpg') {
  if (!previewBlob) {
    console.error('No preview blob to export');
    showNotification('导出失败：无法获取预览图', 'error');
    return;
  }

  try {
    const zip = new JSZip();

    const folderToExport = state.currentFolderName || state.lastImportedFolderName;
    const previewFileName = folderToExport ? `${folderToExport}.${format}` : `theme_preview.${format}`;
    zip.file(previewFileName, previewBlob);

    for (const resource of state.importedResources) {
      if (resource.name === folderToExport) {
        if (resource.type === 'zip') {
          zip.file(resource.name, resource.file);
        } else if (resource.type === 'folder') {
          const folderName = resource.name;
          resource.files.forEach(file => {
            const path = file.webkitRelativePath || file.name;
            const fullPath = path.startsWith(folderName) ? path : `${folderName}/${path}`;
            zip.file(fullPath, file);
          });
        }
        break;
      }
    }

    if (state.importedResources.length === 0) {
      const allFiles = collectAllFilesForExport(state.files);
      allFiles.forEach(item => {
        zip.file(item.path, item.file);
      });
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });

    const zipFileName = folderToExport ? `${folderToExport}.zip` : 'theme-resources.zip';

    downloadZip(zipBlob, zipFileName);
  } catch (error) {
    console.error('Export failed:', error);
    showNotification('导出失败', 'error');
  }
}

function downloadZip(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// 处理从颜色图标工具导入预览图数据
async function handlePreviewImport() {
  const params = new URLSearchParams(window.location.search);
  const shouldImport = params.get('import');

  if (shouldImport === 'preview') {
    try {
      const previewDataStr = localStorage.getItem('previewImageData');
      if (!previewDataStr) {
        showNotification('没有找到预览图数据', 'warning');
        return;
      }

      const previewData = JSON.parse(previewDataStr);

      // 创建虚拟文件夹结构
      const folderNode = {
        id: `folder-preview-${previewData.timestamp}`,
        name: '预览图资源',
        type: 'folder',
        children: [],
      };

      // 添加预览图作为壁纸
      if (previewData.previewImage) {
        const wallpaperNode = {
          id: `file-wallpaper-${previewData.timestamp}`,
          name: 'wallpaper.jpg',
          type: 'file',
          url: previewData.previewImage,
        };
        folderNode.children.push(wallpaperNode);
      }

      // 添加所有图标
      if (previewData.icons && previewData.icons.length > 0) {
        previewData.icons.forEach((icon, index) => {
          const iconNode = {
            id: `file-icon-${previewData.timestamp}-${index}`,
            name: icon.name,
            type: 'file',
            url: icon.data,
          };
          folderNode.children.push(iconNode);
        });
      }

      // 设置文件状态
      state.expandedFolders.clear();
      state.expandedFolders.add(folderNode.id);
      state.currentFolderName = folderNode.name;
      setSelectedFile(folderNode.id);

      setFiles([folderNode]);

      // 设置壁纸
      if (previewData.previewImage) {
        setWallpaper(previewData.previewImage);
      }

      // 填充图标网格
      const iconFiles = collectIconFiles([folderNode]);
      fillIconGrids(iconFiles);

      // 清理 localStorage
      localStorage.removeItem('previewImageData');

      showNotification('预览图数据导入成功！', 'success');

    } catch (error) {
      console.error('Failed to import preview data:', error);
      showNotification('预览图数据导入失败', 'error');
    }
  }
}

// 模块: 初始化
async function init() {
  updateSettingsUI();
  // renderGridOverlay();

  // 检查是否需要从颜色图标工具导入预览图数据
  await handlePreviewImport();

  await loadThemesFromAPIOnStartup();

  hideOverlappingRows('21.5%');

  document.querySelectorAll('.grid-item-container.custom-container-4, .grid-item-container.custom-container-2').forEach(container => {
    const gridItem = container.querySelector('.grid-item');
    if (gridItem) {
      container.classList.remove('hidden');
      if (container.classList.contains('has-content')) {
        gridItem.style.border = '1px dashed rgba(255, 255, 255, 0.2)';
        if (gridItem.classList.contains('weather-widget')) {
          addDeleteIcon(gridItem);
        }
      } else {
        gridItem.style.border = 'none';
      }
    }
  });

  document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.custom-container-2)').forEach(container => {
    const gridItem = container.querySelector('.grid-item');
    if (gridItem) {
      addDeleteIcon(gridItem);
    }
  });

  // 更新导出按钮状态（根据工作区内容）
  updateExportButtonState();

  // 为grid-container添加拖放事件监听器（从文件树拖入）
  const gridContainer = document.getElementById('grid-container');
  if (gridContainer) {
    gridContainer.addEventListener('dragover', handleDragOver);
    gridContainer.addEventListener('drop', handleDrop);
  }

  // 为拖拽区域添加事件监听器
  const folderDropZone = document.getElementById('drop-zone-folder');
  if (folderDropZone) {
    folderDropZone.addEventListener('dragover', handleDropZoneDragOver);
    folderDropZone.addEventListener('dragleave', handleDropZoneDragLeave);
    folderDropZone.addEventListener('drop', handleDropZoneDrop);
    folderDropZone.addEventListener('click', handleDropZoneClick);
  }

  const zipDropZone = document.getElementById('drop-zone-zip');
  if (zipDropZone) {
    zipDropZone.addEventListener('dragover', handleDropZoneDragOver);
    zipDropZone.addEventListener('dragleave', handleDropZoneDragLeave);
    zipDropZone.addEventListener('drop', handleDropZoneDrop);
    zipDropZone.addEventListener('click', handleDropZoneClick);
  }

  document.getElementById('file-input').addEventListener('change', async (e) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    try {
      const parsedFiles = await parseFiles(fileList);
      setFiles(parsedFiles);

      const wallpaperInfo = findWallpaper(parsedFiles);
      if (wallpaperInfo && wallpaperInfo.url) {
        setWallpaper(wallpaperInfo.url);
      }

      const previewFiles = await collectPreviewFilesWithDimensions(parsedFiles);
      await fillCustomContainers(previewFiles);

      const iconFiles = collectIconFiles(parsedFiles);
      fillIconGrids(iconFiles);

    } catch (error) {
      console.error('Error parsing folder:', error);
    }

    e.target.value = '';
  });

  document.getElementById('zip-input').addEventListener('change', async (e) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    try {
      const zipFile = fileList[0];
      const parsedFiles = await parseZipFile(zipFile);
      setFiles(parsedFiles);

      const wallpaperInfo = findWallpaper(parsedFiles);
      if (wallpaperInfo && wallpaperInfo.url) {
        setWallpaper(wallpaperInfo.url);
      }

      const previewFiles = await collectPreviewFilesWithDimensions(parsedFiles);
      await fillCustomContainers(previewFiles);

      const iconFiles = collectIconFiles(parsedFiles);
      fillIconGrids(iconFiles);

    } catch (error) {
      console.error('Error parsing zip file:', error);
    }

    e.target.value = '';
  });

  // 文字颜色处理 - 使用 input 事件实现实时更新
  document.getElementById('text-color').addEventListener('input', function () {
    const color = this.value.toUpperCase();
    document.getElementById('text-color-value').value = color;
    handleSettingsChange();
  });
  document.getElementById('text-color-value').addEventListener('input', function () {
    const validColor = validateHexColor(this.value);
    if (validColor) {
      document.getElementById('text-color').value = validColor;
      handleSettingsChange();
    }
  });
  // 网格颜色处理 - 使用 input 事件实现实时更新
  document.getElementById('grid-color').addEventListener('input', function () {
    const color = this.value.toUpperCase();
    document.getElementById('grid-color-value').value = color;
    handleSettingsChange();
  });
  document.getElementById('grid-color-value').addEventListener('input', function () {
    const validColor = validateHexColor(this.value);
    if (validColor) {
      document.getElementById('grid-color').value = validColor;
      handleSettingsChange();
    }
  });
  // 其他设置
  document.getElementById('icon-size').addEventListener('input', handleSettingsChange);
  document.getElementById('show-grid').addEventListener('change', handleSettingsChange);
  document.getElementById('show-text').addEventListener('change', handleSettingsChange);
  document.getElementById('export-btn').addEventListener('click', handleExport);
  document.getElementById('save-to-server-btn').addEventListener('click', handleSaveToServer);

  // 更新时间
  function updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
    document.getElementById('current-time').textContent = timeStr;

    const weatherTime = document.getElementById('weather-time');
    if (weatherTime) {
      weatherTime.textContent = timeStr;
    }
  }

  // 在每分钟开始时更新时间
  function scheduleTimeUpdate() {
    const now = new Date();
    const millisecondsUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(() => {
      updateTime();
      scheduleTimeUpdate();
    }, millisecondsUntilNextMinute || 60000);
  }

  // 更新日期
  function updateDate() {
    const now = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const month = monthNames[now.getMonth()];
    const date = now.getDate();
    const weekday = weekdayNames[now.getDay()];

    const weatherDate = document.getElementById('weather-date');
    const weatherWeekday = document.getElementById('weather-weekday');

    if (weatherDate) {
      weatherDate.textContent = `${month} ${date}`;
    }
    if (weatherWeekday) {
      weatherWeekday.textContent = weekday;
    }
  }

  updateTime();
  updateDate();
  scheduleTimeUpdate();
  updateOverlappingIcons();
  addCustomContainerDragListeners();
}

function initToolPanel() {
  const toolItems = document.querySelectorAll('.tool-item');
  const widgetIframe = document.getElementById('widget-iframe');
  const previewToolContent = document.getElementById('preview-tool-content');

  const toolUrls = {
    'widget-editor': 'https://baileemoor501-hash.github.io/WidgetTool/',
    'color-icon': 'ColorIconTheme_2026_0610/index.html',
    'svg-generator': 'https://svgagent.pages.dev/',
    'svg-parallax': 'https://appser.top/web_tool_wallpaper/v1/'
  };

  function saveToolState(toolType) {
    localStorage.setItem('lastActiveTool', toolType);
  }

  function getSavedToolState() {
    return localStorage.getItem('lastActiveTool');
  }

  function switchTool(toolType) {
    toolItems.forEach(i => {
      i.classList.remove('active');
      const badge = i.querySelector('.tool-badge');
      if (badge) {
        badge.remove();
      }
    });

    const activeItem = document.querySelector(`[data-tool="${toolType}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
      const badge = document.createElement('span');
      badge.className = 'tool-badge';
      badge.textContent = '当前';
      activeItem.appendChild(badge);
    }

    if (toolType === 'preview-tool') {
      widgetIframe.style.display = 'none';
      previewToolContent.style.display = 'flex';
    } else if (toolUrls[toolType]) {
      widgetIframe.src = toolUrls[toolType];
      widgetIframe.style.display = 'block';
      previewToolContent.style.display = 'none';
    }
  }

  toolItems.forEach(item => {
    item.addEventListener('click', function () {
      const toolType = this.dataset.tool;
      saveToolState(toolType);
      switchTool(toolType);
    });
  });

  const savedTool = getSavedToolState();
  if (savedTool && (savedTool === 'preview-tool' || savedTool === 'color-icon')) {
    switchTool(savedTool);
  }
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', function () {
  init();
  initToolPanel();
});
