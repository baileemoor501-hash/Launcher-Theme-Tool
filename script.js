// 主题预览图生成工具 - 重构版
// 纯 HTML、CSS 和 JavaScript 实现

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
  snapThreshold: 24,
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
  gridItems: createDefaultGridItems(),
  wallpaper: null,
  settings: { ...DEFAULT_SETTINGS },
  selectedFile: null,
  expandedFolders: new Set(),
};

// 创建默认网格项
function createDefaultGridItems() {
  const items = [];

  // 添加时间widget
  items.push({
    id: 'widget-time',
    type: 'widget',
    name: '时间Widget',
    gridPosition: { row: 1, col: 0 },
    size: { width: 4, height: 1 },
  });

  // 添加dock图标
  for (let col = 0; col < GRID_CONFIG.cols; col++) {
    items.push({
      id: `dock-icon-${col}`,
      type: 'icon',
      name: `Dock图标${col + 1}`,
      gridPosition: { row: GRID_CONFIG.rows, col },
      size: { width: 1, height: 1 },
    });
  }

  return items;
}

// 状态更新函数
function setFiles(files) {
  console.log('Setting files:', files);
  state.files = files;
  console.log('State files after setting:', state.files);
  renderFileTree();
}

function setWallpaper(url) {
  state.wallpaper = url;
  const wallpaperElement = document.getElementById('wallpaper');
  if (wallpaperElement) {
    if (url) {
      wallpaperElement.src = url;
      wallpaperElement.style.display = 'block';
    } else {
      wallpaperElement.style.display = 'none';
    }
  }
}

function addGridItem(item) {
  state.gridItems.push(item);
  renderGridItems();
  renderDockItems();
}

function updateGridItem(id, position) {
  state.gridItems = state.gridItems.map(item =>
    item.id === id ? { ...item, gridPosition: position } : item
  );
  renderGridItems();
  renderDockItems();
}

function removeGridItem(id) {
  state.gridItems = state.gridItems.filter(item => item.id !== id);
  renderGridItems();
  renderDockItems();
}

function setSettings(newSettings) {
  state.settings = { ...state.settings, ...newSettings };
  updateSettingsUI();
  renderGridItems();
  renderDockItems();
  if ('showGrid' in newSettings) {
    renderGridOverlay();
  }
}

function setSelectedFile(id) {
  state.selectedFile = id;
  renderFileTree();
}

function resetGrid() {
  state.gridItems = createDefaultGridItems();
  renderGridItems();
  renderDockItems();
}

// 模块: DOM 操作
function renderFileTree() {
  const fileTreeElement = document.getElementById('file-tree');
  if (!fileTreeElement) {
    console.log('File tree element not found');
    return;
  }

  console.log('Rendering file tree with files:', state.files);

  if (state.files.length === 0) {
    fileTreeElement.innerHTML = `
      <div class="empty-state">
        <p>请导入主题资源文件夹</p>
        <p class="hint">支持包含图标和壁纸的完整文件夹</p>
      </div>
    `;
    return;
  }

  // 使用文档片段提高性能
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

  console.log('File tree rendered successfully');
}

function renderTreeNode(node, level) {
  const isFolder = node.type === 'folder';
  const isSelected = state.selectedFile === node.id;
  const hasChildren = isFolder && node.children && node.children.length > 0;
  const isExpanded = state.expandedFolders.has(node.id);

  return `
    <div>
      <div
        class="tree-node ${isSelected ? 'selected' : ''}"
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
          <span class="tree-toggle">
            ${isExpanded ? '▼' : '▶'}
          </span>
        ` : `
          <span class="tree-toggle-placeholder"></span>
        `}
      </div>
      ${hasChildren && isExpanded ? `
        <div class="tree-children">
          ${node.children.map(child => renderTreeNode(child, level + 1)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderGridOverlay() {
  const gridOverlayElement = document.getElementById('grid-overlay');
  if (!gridOverlayElement) return;

  if (!state.settings.showGrid) {
    gridOverlayElement.innerHTML = '';
    return;
  }

  // 使用文档片段提高性能
  const fragment = document.createDocumentFragment();
  Array.from({ length: GRID_CONFIG.rows }).forEach((_, row) => {
    const rowElement = document.createElement('div');
    rowElement.className = 'grid-row';

    Array.from({ length: GRID_CONFIG.cols }).forEach((_, col) => {
      const cellElement = document.createElement('div');
      cellElement.className = 'grid-cell';
      rowElement.appendChild(cellElement);
    });

    fragment.appendChild(rowElement);
  });

  gridOverlayElement.innerHTML = '';
  gridOverlayElement.appendChild(fragment);
}

function renderGridItems() {
  const gridItemsElement = document.getElementById('grid-items');
  if (!gridItemsElement) return;

  // 使用文档片段提高性能
  const fragment = document.createDocumentFragment();
  state.gridItems
    .filter(item => item.gridPosition.row < GRID_CONFIG.rows)
    .forEach(item => {
      const itemElement = document.createElement('div');
      itemElement.innerHTML = renderGridItem(item);
      fragment.appendChild(itemElement.firstChild);
    });

  gridItemsElement.innerHTML = '';
  gridItemsElement.appendChild(fragment);
}

function renderDockItems() {
  const dockElement = document.getElementById('dock');
  if (!dockElement) return;
}

function renderGridItem(item) {
  if (item.type === 'widget') {
    return `
      <div
        class="grid-item widget"
        style="
          grid-column: ${item.gridPosition.col + 1} / span ${item.size.width};
          grid-row: ${item.gridPosition.row + 1} / span ${item.size.height};
        "
      >
        <div class="widget-content">
          <div class="time-display" style="color: ${state.settings.textColor}">
            ${new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })}
          </div>
          <div class="date-display" style="color: ${state.settings.textColor}">
            ${new Date().toLocaleDateString('zh-CN', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })}
          </div>
        </div>
      </div>
    `;
  } else {
    return `
      <div
        class="grid-item icon"
        style="
          grid-column: ${item.gridPosition.col + 1} / span ${item.size.width};
          grid-row: ${item.gridPosition.row + 1} / span ${item.size.height};
        "
      >
        ${item.url ? `
          <img 
            src="${item.url}" 
            alt="${item.name}"
            style="width: ${state.settings.iconSize}px; height: ${state.settings.iconSize}px"
          />
        ` : `
          <div 
            class="icon-placeholder"
            style="width: ${state.settings.iconSize}px; height: ${state.settings.iconSize}px"
          />
        `}
        <span class="icon-label" style="color: ${state.settings.textColor}">
          ${item.name.replace(/\.[^/.]+$/, '')}
        </span>
      </div>
    `;
  }
}

function renderDockItem(item) {
  return `
    <div class="dock-icon">
      ${item.url ? `
        <img 
          src="${item.url}" 
          alt="${item.name}"
          style="width: ${state.settings.iconSize}px; height: ${state.settings.iconSize}px"
        />
      ` : `
        <div 
          class="icon-placeholder"
          style="width: ${state.settings.iconSize}px; height: ${state.settings.iconSize}px"
        />
      `}
    </div>
  `;
}

function updateSettingsUI() {
  document.getElementById('text-color').value = state.settings.textColor;
  document.getElementById('text-color-value').textContent = state.settings.textColor;
  document.getElementById('icon-size').value = state.settings.iconSize;
  document.getElementById('icon-size-value').textContent = `${state.settings.iconSize}px`;
  document.getElementById('show-grid').checked = state.settings.showGrid;
  document.getElementById('snap-threshold').value = state.settings.snapThreshold;
  document.getElementById('snap-threshold-value').textContent = `${state.settings.snapThreshold}px`;
}

// 模块: 事件处理
function handleTreeNodeClick(e) {
  const node = e.currentTarget;
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

  setSelectedFile(id);
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
  const data = e.dataTransfer.getData('text/plain');
  if (!data) return;

  try {
    const item = JSON.parse(data);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const col = Math.floor(x / (rect.width / GRID_CONFIG.cols));
    const row = Math.floor(y / (rect.height / (GRID_CONFIG.rows + 1)));

    const clampedCol = Math.max(0, Math.min(col, GRID_CONFIG.cols - 1));
    const clampedRow = Math.max(0, Math.min(row, GRID_CONFIG.rows));

    addGridItem({
      id: `icon-${Date.now()}`,
      type: 'icon',
      name: item.name,
      url: item.url,
      gridPosition: { row: clampedRow, col: clampedCol },
      size: { width: 1, height: 1 },
    });
  } catch (err) {
    console.error('Failed to parse drag data:', err);
  }
}

function handleFileChange(e) {
  const fileList = e.target.files;
  console.log('File change event:', fileList);
  if (!fileList || fileList.length === 0) return;

  console.log('Number of files:', fileList.length);
  parseFiles(fileList).then(parsedFiles => {
    console.log('Parsed files received:', parsedFiles);
    setFiles(parsedFiles);
    const wallpaperUrl = findWallpaper(parsedFiles);
    if (wallpaperUrl) {
      setWallpaper(wallpaperUrl);
    }

    // 自动填充图标到网格
    const iconFiles = collectIconFiles(parsedFiles);
    console.log('Collected icon files:', iconFiles);
    autoFillIcons(iconFiles);
  }).catch(error => {
    console.error('Error parsing files:', error);
  });
}

function handleSettingsChange() {
  setSettings({
    textColor: document.getElementById('text-color').value,
    iconSize: parseInt(document.getElementById('icon-size').value),
    showGrid: document.getElementById('show-grid').checked,
    snapThreshold: parseInt(document.getElementById('snap-threshold').value),
  });
}

function handleExport() {
  const phoneFrame = document.getElementById('phone-frame');
  if (!phoneFrame) return;

  try {
    captureWorkspace(phoneFrame).then(previewBlob => {
      const allFiles = [];
      collectFiles(state.files, allFiles);
      exportTheme(previewBlob, allFiles);
    });
  } catch (err) {
    console.error('Export failed:', err);
    alert('导出失败，请重试');
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

// 收集所有图标文件（按子文件顺序）
function collectIconFiles(nodes) {
  const iconFiles = [];

  function traverse(node) {
    if (node.type === 'file' && isImageFile(node.name) && !isExcludedFile(node.name) && node.url) {
      iconFiles.push(node);
      console.log('Added icon file:', node.name, node.url);
    }
    if (node.type === 'folder' && node.children) {
      // 按名称排序子节点
      node.children.sort((a, b) => a.name.localeCompare(b.name));
      node.children.forEach(child => traverse(child));
    }
  }

  nodes.forEach(node => traverse(node));
  console.log('Total icon files collected:', iconFiles.length);
  return iconFiles;
}

// 检查是否为排除的文件
function isExcludedFile(filename) {
  const lowerName = filename.toLowerCase();
  return lowerName.includes('wallpaper') || lowerName.includes('iconback') || lowerName.includes('iconmask');
}

// 处理图标名称
function processIconName(filename) {
  // 移除文件扩展名
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  // 按_分割，取最后一个单词
  const parts = nameWithoutExt.split('_');
  const lastWord = parts[parts.length - 1];
  // 首字母大写
  return lastWord.charAt(0).toUpperCase() + lastWord.slice(1);
}

// 自动填充图标到网格
function autoFillIcons(iconFiles) {
  // 清空现有的图标（保留widget和dock）
  state.gridItems = state.gridItems.filter(item =>
    item.type === 'widget' || item.gridPosition.row >= GRID_CONFIG.rows
  );

  // 计算可用的网格位置
  let row = 2; // 从第二行开始，widget在第1行
  let col = 0;

  iconFiles.forEach((iconFile, index) => {
    // 跳过dock区域
    if (row >= GRID_CONFIG.rows) return;

    const processedName = processIconName(iconFile.name);

    addGridItem({
      id: `icon-${Date.now()}-${index}`,
      type: 'icon',
      name: processedName,
      url: iconFile.url,
      gridPosition: { row, col },
      size: { width: 1, height: 1 },
    });

    // 移动到下一个位置
    col++;
    if (col >= GRID_CONFIG.cols) {
      col = 0;
      row++;
    }
  });
}

function parseFiles(fileList) {
  return new Promise((resolve) => {
    const root = [];

    // 构建文件树
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const path = file.webkitRelativePath || file.name;
      const parts = path.split('/').filter(Boolean);

      if (parts.length === 0) continue;

      let currentLevel = root;

      for (let j = 0; j < parts.length; j++) {
        const part = parts[j];
        const isFile = j === parts.length - 1;

        // 查找当前级别的节点
        let node = currentLevel.find(n => n.name === part);
        if (!node) {
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

    // 按名称排序
    const sortNodes = (nodes) => {
      nodes.sort((a, b) => {
        // 文件夹排在前面
        if (a.type === 'folder' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'folder') return 1;
        // 按名称排序
        return a.name.localeCompare(b.name);
      });
      // 递归排序子文件夹
      nodes.forEach(node => {
        if (node.type === 'folder' && node.children) {
          sortNodes(node.children);
        }
      });
    };

    sortNodes(root);

    // 默认展开顶层文件夹
    root.forEach(node => {
      if (node.type === 'folder') {
        state.expandedFolders.add(node.id);
      }
    });

    console.log('Parsed files:', root);
    resolve(root);
  });
}

function isImageFile(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext || '');
}

function isWallpaper(filename) {
  const name = filename.toLowerCase().split('.')[0];
  return name === 'wallpaper';
}

function findWallpaper(nodes) {
  for (const node of nodes) {
    if (node.type === 'file' && isWallpaper(node.name) && node.url) {
      return node.url;
    }
    if (node.type === 'folder' && node.children) {
      const found = findWallpaper(node.children);
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

function captureWorkspace(element) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const rect = element.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(element, 0, 0, rect.width, rect.height);

    canvas.toBlob(resolve, 'image/png');
  });
}

function exportTheme(previewBlob, files) {
  // 创建预览图下载链接
  const previewUrl = URL.createObjectURL(previewBlob);
  const previewLink = document.createElement('a');
  previewLink.href = previewUrl;
  previewLink.download = 'theme-preview.png';
  previewLink.click();
  URL.revokeObjectURL(previewUrl);

  // 这里简化处理，实际项目中可能需要使用 ZIP 库打包文件
  alert('主题导出成功！预览图已下载。');
}

// 模块: 初始化
function init() {
  // 渲染初始状态
  renderGridOverlay();
  renderGridItems();
  renderDockItems();
  updateSettingsUI();

  // 添加事件监听器
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('file-input').addEventListener('change', handleFileChange);

  document.getElementById('grid-container').addEventListener('dragover', handleDragOver);
  document.getElementById('grid-container').addEventListener('drop', handleDrop);

  document.getElementById('text-color').addEventListener('change', handleSettingsChange);
  document.getElementById('icon-size').addEventListener('input', handleSettingsChange);
  document.getElementById('show-grid').addEventListener('change', handleSettingsChange);
  document.getElementById('snap-threshold').addEventListener('input', handleSettingsChange);

  document.getElementById('export-btn').addEventListener('click', handleExport);

  // 更新时间
  function updateTime() {
    document.getElementById('current-time').textContent = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  updateTime();
  setInterval(updateTime, 60000);
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', init);
