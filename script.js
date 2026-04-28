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
  showText: true,
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
  wallpaper: null,
  settings: { ...DEFAULT_SETTINGS },
  selectedFile: null,
  expandedFolders: new Set(),
  folderName: null,
  importedResources: [],
};

// 状态更新函数
function setFiles(newFiles) {
  if (newFiles && newFiles.length > 0) {
    newFiles.forEach(folder => {
      state.files.unshift(folder);
    });
  }
  renderFileTree();

  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    if (state.files && state.files.length > 0) {
      exportBtn.disabled = false;
      exportBtn.style.opacity = '1';
      exportBtn.style.cursor = 'pointer';
    } else {
      exportBtn.disabled = true;
      exportBtn.style.opacity = '0.5';
      exportBtn.style.cursor = 'not-allowed';
    }
  }
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
    50,      // 第1根
    147.8,     // 第2根
    245.6,     // 第3根
    343.4,     // 第4根
    441.2,     // 第5根
    539,     // 第6根
    670      // 第7根（dock栏）
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
        ${isRootLevel && isFolder ? `
          <span class="tree-delete" data-id="${node.id}"></span>
        ` : ''}
      </div>
      ${hasChildren && isExpanded ? `
        <div class="tree-children">
          ${node.children.map(child => renderTreeNode(child, level + 1)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function updateSettingsUI() {
  document.getElementById('text-color').value = state.settings.textColor;
  document.getElementById('text-color-value').textContent = state.settings.textColor;
  document.getElementById('icon-size').value = state.settings.iconSize;
  document.getElementById('icon-size-value').textContent = `${state.settings.iconSize}px`;
  document.getElementById('show-grid').checked = state.settings.showGrid;
  document.getElementById('show-text').checked = state.settings.showText;
  document.getElementById('snap-threshold').value = state.settings.snapThreshold;
  document.getElementById('snap-threshold-value').textContent = `${state.settings.snapThreshold}px`;

  // 更新所有icon-label的文字颜色和显示状态
  document.querySelectorAll('.icon-label').forEach(label => {
    label.style.color = state.settings.textColor;
    // 检查是否是dock栏的icon-label（dock栏的始终隐藏）
    const isDockItem = label.closest('.grid-item-container[style*="top: 96.2%"]');
    // 检查是否是初始隐藏的容器中的icon-label
    const isInitiallyHidden = label.closest('.grid-item-container.initially-hidden');
    if (!isDockItem && !isInitiallyHidden) {
      label.style.visibility = state.settings.showText ? 'visible' : 'hidden';
    }
  });

  // 更新所有grid-item的大小和边框
  document.querySelectorAll('.grid-item').forEach(item => {
    if (!item.classList.contains('custom-size-4')) {
      item.style.width = `${state.settings.iconSize}px`;
      item.style.height = `${state.settings.iconSize}px`;
    }
    item.style.border = state.settings.showGrid ? '1px dashed rgba(255, 255, 255, 0.2)' : '1px dashed transparent';
  });
}

// 模块: 拖拽区域事件处理
function handleDropZoneDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'copy';
  const dropZone = document.getElementById('drop-zone-folder');
  if (dropZone) {
    dropZone.classList.add('dragover');
  }
}

function handleDropZoneDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropZone = document.getElementById('drop-zone-folder');
  if (dropZone) {
    dropZone.classList.remove('dragover');
  }
}

function handleDropZoneDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const dropZone = document.getElementById('drop-zone-folder');
  if (dropZone) {
    dropZone.classList.remove('dragover');
  }

  const items = e.dataTransfer.items;
  if (!items || items.length === 0) return;

  handleDropZoneItems(items);
}

function handleDropZoneClick() {
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.click();
  }
}

async function handleDropZoneItems(items) {
  const fileList = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        fileList.push(file);
      }
    } else if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        await readDirectoryEntry(entry, '', fileList);
      }
    }
  }

  if (fileList.length === 0) return;

  handleDroppedFiles(fileList);
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

    const wallpaperUrl = findWallpaper(parsedFiles);
    if (wallpaperUrl) {
      setWallpaper(wallpaperUrl);
    }

    const previewFiles = collectPreviewFiles(parsedFiles);
    fillCustomContainers(previewFiles);

    const iconFiles = collectIconFiles(parsedFiles);
    fillIconGrids(iconFiles);

  } catch (error) {
    console.error('Error handling dropped files:', error);
    showNotification('导入失败，请重试', 'error');
  }
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

function handleDeleteFolder(e) {
  e.stopPropagation();
  const folderId = e.currentTarget.dataset.id;
  const folderToDelete = findFileNodeById(state.files, folderId);

  state.files = state.files.filter(file => file.id !== folderId);
  state.expandedFolders.delete(folderId);

  if (folderToDelete) {
    const folderName = folderToDelete.name;
    state.importedResources = state.importedResources.filter(res =>
      !(res.type === 'folder' && res.name === folderName) &&
      !(res.type === 'zip' && res.name.replace(/\.zip$/i, '') === folderName)
    );
  }

  if (state.selectedFile === folderId) {
    state.selectedFile = null;
  }

  renderFileTree();

  if (state.files.length === 0) {
    state.importedResources = [];
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
  const data = e.dataTransfer.getData('text/plain');
  if (!data) return;

  try {
    const item = JSON.parse(data);
    const targetContainer = e.currentTarget;

    if (targetContainer.classList.contains('custom-container-4')) {
      const gridItem = targetContainer.querySelector('.grid-item');
      const iconLabel = targetContainer.querySelector('.icon-label');

      if (gridItem) {
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
      targetContainer.style.display = 'block';

      updateOverlappingIcons();
      addCustomContainerDragListeners();
    } else {
      const rect = targetContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const col = Math.floor(x / (rect.width / GRID_CONFIG.cols));
      const row = Math.floor(y / (rect.height / (GRID_CONFIG.rows + 1)));

      const clampedCol = Math.max(0, Math.min(col, GRID_CONFIG.cols - 1));
      const clampedRow = Math.max(0, Math.min(row, GRID_CONFIG.rows));

      const gridContainers = document.querySelectorAll('.grid-item-container:not(.custom-container-4)');
      const targetIndex = clampedRow * GRID_CONFIG.cols + clampedCol;

      if (targetIndex < gridContainers.length) {
        const container = gridContainers[targetIndex];
        const gridItem = container.querySelector('.grid-item');
        const iconLabel = container.querySelector('.icon-label');

        if (gridItem) {
          gridItem.style.backgroundImage = `url(${item.url})`;
          gridItem.style.backgroundSize = 'contain';
          gridItem.style.backgroundPosition = 'center';
          gridItem.style.backgroundRepeat = 'no-repeat';
          gridItem.draggable = true;
          gridItem.dataset.url = item.url;
          gridItem.dataset.name = item.name;
          addDeleteIcon(gridItem);
        }

        if (iconLabel) {
          iconLabel.textContent = getIconLabel(item.name);
        }

        addGridItemDragListeners();
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

    const wallpaperUrl = findWallpaper(parsedFiles);
    if (wallpaperUrl) {
      setWallpaper(wallpaperUrl);
    }

    const previewFiles = collectPreviewFiles(parsedFiles);
    fillCustomContainers(previewFiles);

    const iconFiles = collectIconFiles(parsedFiles);
    fillIconGrids(iconFiles);

  } catch (error) {
    console.error('Error parsing files:', error);
  }
}

function handleSettingsChange() {
  setSettings({
    textColor: document.getElementById('text-color').value,
    iconSize: parseInt(document.getElementById('icon-size').value),
    showGrid: document.getElementById('show-grid').checked,
    showText: document.getElementById('show-text').checked,
    snapThreshold: parseInt(document.getElementById('snap-threshold').value),
  });
}

async function handleExport() {
  const phoneScreen = document.querySelector('.phone-screen');
  if (!phoneScreen) {
    showNotification('导出失败：无法找到预览区域', 'error');
    return;
  }

  try {
    const previewBlob = await captureWorkspace(phoneScreen);
    const allFiles = [];
    collectFiles(state.files, allFiles);
    await exportTheme(previewBlob, allFiles);
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

      const blob = await file.async('blob');
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

    state.expandedFolders.add(folderNode.id);
    root.push(folderNode);

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

    if (filesArray.length > 0 && !state.folderName) {
      const firstFile = filesArray[0];
      const path = firstFile.webkitRelativePath || firstFile.name;
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 1) {
        state.folderName = parts[0];
      } else {
        state.folderName = 'theme';
      }
    }

    state.importedResources.push({
      type: 'folder',
      name: state.folderName || 'theme',
      files: filesArray
    });

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

    root.forEach(node => {
      if (node.type === 'folder') {
        state.expandedFolders.add(node.id);
      }
    });
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

async function uploadToOSS(blob, fileName) {
  const ossUrl = 'https://nati.oss-cn-hangzhou.aliyuncs.com/apk_logo_xct/server_resource_update/test/zhangyuan_test/theme_resources/';

  const formData = new FormData();
  formData.append('file', blob, fileName);

  try {
    const response = await fetch(ossUrl, {
      method: 'POST',
      body: formData,
      mode: 'cors'
    });

    if (response.ok) {
      return { success: true, message: '上传成功' };
    } else {
      const errorText = await response.text();
      return { success: false, message: `上传失败: ${errorText}` };
    }
  } catch (error) {
    return { success: false, message: `上传失败: ${error.message}` };
  }
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

function captureWorkspace(element) {
  return new Promise((resolve) => {
    // 确保元素存在
    if (!element) {
      console.error('Element not found for capture');
      resolve(null);
      return;
    }

    // 使用元素的原始尺寸
    const targetWidth = element.offsetWidth;
    const targetHeight = element.offsetHeight;

    // 创建canvas并设置目标尺寸
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    // 捕获元素内容
    // 首先隐藏网格覆盖层，避免捕获到参考线
    const gridOverlay = element.querySelector('.grid-overlay');
    const gridOverlayVisible = gridOverlay ? gridOverlay.style.display : '';
    if (gridOverlay) {
      gridOverlay.style.display = 'none';
    }

    // 临时移除grid-item的边框
    const gridItems = element.querySelectorAll('.grid-item');
    const originalBorders = [];
    gridItems.forEach((item, index) => {
      originalBorders[index] = item.style.border;
      item.style.border = 'none';
    });

    // 使用html2canvas库来捕获内容
    if (typeof html2canvas !== 'undefined') {
      html2canvas(element, {
        width: targetWidth,
        height: targetHeight,
        scale: 1, // 使用1倍缩放，因为我们已经设置了目标分辨率
        useCORS: true, // 允许跨域图片
        logging: false,
        backgroundColor: null // 去除白色背景，使用透明背景
      }).then(canvas => {
        // 恢复网格覆盖层
        if (gridOverlay) {
          gridOverlay.style.display = gridOverlayVisible;
        }
        // 恢复grid-item的边框
        gridItems.forEach((item, index) => {
          item.style.border = originalBorders[index];
        });
        canvas.toBlob(resolve, 'image/png');
      }).catch(err => {
        console.error('html2canvas error:', err);
        // 恢复网格覆盖层
        if (gridOverlay) {
          gridOverlay.style.display = gridOverlayVisible;
        }
        // 恢复grid-item的边框
        gridItems.forEach((item, index) => {
          item.style.border = originalBorders[index];
        });
        resolve(null);
      });
    } else {
      // 降级方案：使用DOMSnapshot
      try {
        // 捕获元素的HTML
        const html = element.outerHTML;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        tempDiv.style.width = `${targetWidth}px`;
        tempDiv.style.height = `${targetHeight}px`;
        tempDiv.style.backgroundColor = 'transparent'; // 确保背景透明

        document.body.appendChild(tempDiv);

        // 等待元素渲染
        setTimeout(() => {
          // 清空canvas，确保背景透明
          ctx.clearRect(0, 0, targetWidth, targetHeight);
          // 绘制到canvas
          ctx.drawImage(tempDiv, 0, 0, targetWidth, targetHeight);
          document.body.removeChild(tempDiv);

          // 恢复网格覆盖层
          if (gridOverlay) {
            gridOverlay.style.display = gridOverlayVisible;
          }
          // 恢复grid-item的边框
          gridItems.forEach((item, index) => {
            item.style.border = originalBorders[index];
          });

          canvas.toBlob(resolve, 'image/png');
        }, 100);
      } catch (err) {
        console.error('Capture error:', err);
        // 恢复网格覆盖层
        if (gridOverlay) {
          gridOverlay.style.display = gridOverlayVisible;
        }
        // 恢复grid-item的边框
        gridItems.forEach((item, index) => {
          item.style.border = originalBorders[index];
        });
        resolve(null);
      }
    }
  });
}

function getIconLabel(filename) {
  // 提取文件名（不含扩展名）
  const nameWithoutExt = filename.split('.')[0];
  // 分割成单词
  const words = nameWithoutExt.split(/[_\-]/);
  // 获取最后一个单词
  const lastWord = words[words.length - 1];
  // 首字母大写
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

function fillCustomContainers(previewFiles) {
  const customContainers = document.querySelectorAll('.grid-item-container.custom-container-4:not(.initially-hidden)');

  customContainers.forEach((container, index) => {
    if (index < previewFiles.length) {
      const file = previewFiles[index];
      const gridItem = container.querySelector('.grid-item');
      const iconLabel = container.querySelector('.icon-label');

      if (gridItem) {
        gridItem.style.backgroundImage = `url(${file.url})`;
        gridItem.style.backgroundSize = 'cover';
        gridItem.style.backgroundPosition = 'center';
        gridItem.style.backgroundRepeat = 'no-repeat';
        gridItem.dataset.url = file.url;
        gridItem.dataset.name = file.name;
        gridItem.draggable = true;
        gridItem.dataset.isPreview = 'true';
      }

      if (iconLabel) {
        iconLabel.textContent = getIconLabel(file.name);
      }

      container.classList.remove('hidden');
    } else {
      const styleTop = container.style.top;
      if (styleTop !== '17.1%') {
        container.classList.add('hidden');
      }
    }
  });

  updateOverlappingIcons();
  addCustomContainerDragListeners();
}

function updateOverlappingIcons() {
  const visibleCustomContainers = document.querySelectorAll('.grid-item-container.custom-container-4:not(.hidden)');
  const normalContainers = document.querySelectorAll('.grid-item-container:not(.custom-container-4)');

  normalContainers.forEach(container => {
    container.classList.remove('overlapped');
  });

  visibleCustomContainers.forEach(customContainer => {
    const customRect = customContainer.getBoundingClientRect();

    normalContainers.forEach(normalContainer => {
      const normalRect = normalContainer.getBoundingClientRect();
      const styleTop = normalContainer.style.top;
      const isDockItem = styleTop && styleTop.includes('96');
      const isFixedItem = styleTop === '64.9%' || styleTop === '79.2%';

      if (!isDockItem && !isFixedItem && isOverlapping(customRect, normalRect)) {
        normalContainer.classList.add('overlapped');
      }
    });
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

const ALLOWED_POSITIONS = [
  { top: '3%', left: '8%' },
  { top: '17.1%', left: '8%' },
  { top: '31.1%', left: '8%' },
  { top: '45.4%', left: '8%' },
  { top: '59.6%', left: '8%' },
];

function addCustomContainerDragListeners() {
  document.querySelectorAll('.grid-item.custom-size-4').forEach(gridItem => {
    gridItem.draggable = true;
    gridItem.addEventListener('dragstart', handleCustomContainerDragStart);
    gridItem.addEventListener('dragend', handleCustomContainerDragEnd);
  });

  document.querySelectorAll('.grid-item-container.custom-container-4').forEach(container => {
    container.addEventListener('dragover', handleCustomContainerDragOver);
    container.addEventListener('drop', handleCustomContainerDrop);
  });
}

function handleCustomContainerDragEnd(e) {
  const gridItem = e.currentTarget;
  gridItem.style.opacity = '1';

  const containers = document.querySelectorAll('.grid-item-container.custom-container-4');

  containers.forEach(customContainer => {
    const item = customContainer.querySelector('.grid-item');
    if (!item || !item.style.backgroundImage || item.style.backgroundImage === 'none') {
      customContainer.classList.add('hidden');
      customContainer.style.display = 'none';
    } else {
      customContainer.classList.remove('hidden');
      customContainer.style.display = 'block';
    }
  });
}

function handleCustomContainerDragStart(e) {
  const gridItem = e.currentTarget;
  const container = gridItem.parentElement;

  e.dataTransfer.setData('text/plain', JSON.stringify({
    containerIndex: Array.from(document.querySelectorAll('.grid-item-container.custom-container-4')).indexOf(container),
    url: gridItem.dataset.url,
    name: gridItem.dataset.name
  }));

  gridItem.style.opacity = '0.5';
}

function handleCustomContainerDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleCustomContainerDrop(e) {
  e.preventDefault();

  const data = e.dataTransfer.getData('text/plain');
  if (!data) return;

  try {
    const sourceData = JSON.parse(data);
    const sourceIndex = sourceData.containerIndex;
    const sourceUrl = sourceData.url;
    const sourceName = sourceData.name;

    const containers = Array.from(document.querySelectorAll('.grid-item-container.custom-container-4'));
    const targetContainer = e.currentTarget;
    const targetIndex = containers.indexOf(targetContainer);

    if (sourceIndex === targetIndex) {
      containers[sourceIndex].querySelector('.grid-item').style.opacity = '1';
      return;
    }

    const sourceContainer = containers[sourceIndex];
    const sourceGridItem = sourceContainer.querySelector('.grid-item');
    const sourceIconLabel = sourceContainer.querySelector('.icon-label');

    const targetGridItem = targetContainer.querySelector('.grid-item');
    const targetIconLabel = targetContainer.querySelector('.icon-label');

    const targetUrl = targetGridItem.dataset.url;
    const targetName = targetGridItem.dataset.name;

    if (targetUrl) {
      sourceGridItem.style.backgroundImage = `url(${targetUrl})`;
      sourceGridItem.style.backgroundSize = 'cover';
      sourceGridItem.style.backgroundPosition = 'center';
      sourceGridItem.style.backgroundRepeat = 'no-repeat';
      sourceGridItem.dataset.url = targetUrl;
      sourceGridItem.dataset.name = targetName;
      sourceGridItem.draggable = true;
      sourceGridItem.dataset.isPreview = 'true';

      if (sourceIconLabel) {
        sourceIconLabel.textContent = getIconLabel(targetName);
      }

      sourceContainer.classList.remove('hidden');
      sourceContainer.style.display = 'block';
    } else {
      sourceGridItem.style.backgroundImage = '';
      sourceGridItem.dataset.url = '';
      sourceGridItem.dataset.name = '';
      sourceGridItem.draggable = false;
      sourceGridItem.dataset.isPreview = '';

      if (sourceIconLabel) {
        sourceIconLabel.textContent = '';
      }

      sourceContainer.classList.add('hidden');
      sourceContainer.style.display = 'none';
    }

    targetGridItem.style.backgroundImage = `url(${sourceUrl})`;
    targetGridItem.style.backgroundSize = 'cover';
    targetGridItem.style.backgroundPosition = 'center';
    targetGridItem.style.backgroundRepeat = 'no-repeat';
    targetGridItem.dataset.url = sourceUrl;
    targetGridItem.dataset.name = sourceName;
    targetGridItem.draggable = true;
    targetGridItem.dataset.isPreview = 'true';

    if (targetIconLabel) {
      targetIconLabel.textContent = getIconLabel(sourceName);
    }

    targetContainer.classList.remove('hidden');
    targetContainer.style.display = 'block';

    containers.forEach(container => {
      const gridItem = container.querySelector('.grid-item');
      if (gridItem) {
        gridItem.style.opacity = '1';
      }
    });

    updateOverlappingIcons();

  } catch (err) {
    console.error('Failed to handle custom container drop:', err);
  }
}

function fillIconGrids(imageFiles) {
  const gridContainers = document.querySelectorAll('.grid-item-container:not(.custom-container-4):not(.initially-hidden):not([style*="grid-column"]):not([style*="display: none"])');

  let fileIndex = 0;

  // 为所有网格容器添加索引
  gridContainers.forEach((container, index) => {
    container.dataset.index = index.toString();
  });

  // 填充网格
  gridContainers.forEach(container => {
    if (fileIndex < imageFiles.length) {
      const file = imageFiles[fileIndex];
      const gridItem = container.querySelector('.grid-item');
      const iconLabel = container.querySelector('.icon-label');

      if (gridItem) {
        gridItem.style.backgroundImage = `url(${file.url})`;
        gridItem.style.backgroundSize = 'contain';
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

      fileIndex++;
    }
  });

  // 为所有网格项添加拖拽事件监听器
  addGridItemDragListeners();
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
    // 清除图标的背景和数据
    gridItem.style.backgroundImage = '';
    gridItem.dataset.url = '';
    gridItem.dataset.name = '';
    gridItem.draggable = false;

    // 清除标签文本
    const iconLabel = gridItem.nextElementSibling;
    if (iconLabel && iconLabel.classList.contains('icon-label')) {
      iconLabel.textContent = '';
    }

    // 移除删除图标
    deleteIcon.remove();
  });

  gridItem.appendChild(deleteIcon);
}

function addGridItemDragListeners() {
  // 为所有grid-item添加dragstart事件
  document.querySelectorAll('.grid-item').forEach(item => {
    if (item.draggable) {
      item.addEventListener('dragstart', handleGridItemDragStart);
    }
  });

  // 为所有grid-item-container添加dragover和drop事件
  document.querySelectorAll('.grid-item-container').forEach(container => {
    container.addEventListener('dragover', handleGridItemDragOver);
    container.addEventListener('drop', handleGridItemDrop);
  });
}

function handleGridItemDragStart(e) {
  const item = e.currentTarget;
  // 存储拖拽元素的引用
  e.dataTransfer.setData('text/plain', JSON.stringify({
    url: item.dataset.url,
    name: item.dataset.name
  }));
  // 存储拖拽元素的容器
  e.dataTransfer.setData('text/html', item.parentElement.dataset.index);
  // 添加拖拽时的视觉反馈
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

    // 检查是否是同一个容器
    if (targetContainer.dataset.index === sourceIndex) {
      // 恢复拖拽元素的透明度
      document.querySelectorAll('.grid-item').forEach(gridItem => {
        gridItem.style.opacity = '1';
      });
      return;
    }

    // 不允许将预览图标（custom-size-4）拖拽到普通容器
    const sourceGridItem = document.querySelector(`.grid-item[data-url="${item.url}"]`);
    if (sourceGridItem && sourceGridItem.classList.contains('custom-size-4') && !targetContainer.classList.contains('custom-container-4')) {
      // 恢复拖拽元素的透明度
      document.querySelectorAll('.grid-item').forEach(gridItem => {
        gridItem.style.opacity = '1';
      });
      return;
    }

    // 不允许将普通图标拖拽到 custom-container-4（preview区域）
    // 但允许从文件树拖入（sourceIndex为空表示从文件树拖入）
    if (targetContainer.classList.contains('custom-container-4') && sourceIndex) {
      // 恢复拖拽元素的透明度
      document.querySelectorAll('.grid-item').forEach(gridItem => {
        gridItem.style.opacity = '1';
      });
      return;
    }

    // 保存目标位置的原始内容
    const originalUrl = targetGridItem.dataset.url;
    const originalName = targetGridItem.dataset.name;

    // 将拖拽的图标内容移动到目标位置
    targetGridItem.style.backgroundImage = `url(${item.url})`;
    targetGridItem.style.backgroundSize = 'contain';
    targetGridItem.style.backgroundPosition = 'center';
    targetGridItem.style.backgroundRepeat = 'no-repeat';
    targetGridItem.dataset.url = item.url;
    targetGridItem.dataset.name = item.name;
    targetGridItem.draggable = true;

    if (targetIconLabel) {
      targetIconLabel.textContent = getIconLabel(item.name);
    }

    // 为目标位置添加删除图标
    addDeleteIcon(targetGridItem);

    // 找到源容器并更新其内容
    if (sourceIndex) {
      const sourceContainer = document.querySelector(`.grid-item-container[data-index="${sourceIndex}"]`);
      if (sourceContainer) {
        const sourceGridItem = sourceContainer.querySelector('.grid-item');
        const sourceIconLabel = sourceContainer.querySelector('.icon-label');

        if (sourceGridItem) {
          if (originalUrl) {
            sourceGridItem.style.backgroundImage = `url(${originalUrl})`;
            sourceGridItem.dataset.url = originalUrl;
            sourceGridItem.dataset.name = originalName;
            sourceGridItem.draggable = true;
            // 为源位置添加删除图标
            addDeleteIcon(sourceGridItem);
          } else {
            sourceGridItem.style.backgroundImage = '';
            sourceGridItem.dataset.url = '';
            sourceGridItem.dataset.name = '';
            sourceGridItem.draggable = false;
            // 移除源位置的删除图标
            const sourceDeleteIcon = sourceGridItem.querySelector('.delete-icon');
            if (sourceDeleteIcon) {
              sourceDeleteIcon.remove();
            }
          }
        }

        if (sourceIconLabel) {
          if (originalName) {
            sourceIconLabel.textContent = getIconLabel(originalName);
          } else {
            sourceIconLabel.textContent = '';
          }
        }
      }
    }

    // 恢复所有元素的透明度
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

async function exportTheme(previewBlob, files) {
  if (!previewBlob) {
    console.error('No preview blob to export');
    showNotification('导出失败：无法获取预览图', 'error');
    return;
  }

  try {
    const zip = new JSZip();

    zip.file('theme_preview.png', previewBlob);

    for (const resource of state.importedResources) {
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
    }

    if (state.importedResources.length === 0) {
      const allFiles = collectAllFilesForExport(state.files);
      allFiles.forEach(item => {
        zip.file(item.path, item.file);
      });
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });

    const zipFileName = state.folderName ? `${state.folderName}.zip` : 'theme-resources.zip';

    const uploadResult = await uploadToOSS(zipBlob, zipFileName);

    if (uploadResult.success) {
      showNotification('保存成功！主题资源已自动上传到服务器');
    } else {
      showNotification('自动上传失败，已为您下载本地文件', 'error');
      downloadZip(zipBlob, zipFileName);
    }
  } catch (error) {
    console.error('Export failed:', error);
    showNotification('导出失败，已为您下载本地文件', 'error');
    const zip = new JSZip();
    zip.file('theme_preview.png', previewBlob);

    for (const resource of state.importedResources) {
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
    }

    if (state.importedResources.length === 0) {
      const allFiles = collectAllFilesForExport(state.files);
      allFiles.forEach(item => {
        zip.file(item.path, item.file);
      });
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipFileName = state.folderName ? `${state.folderName}.zip` : 'theme-resources.zip';
    downloadZip(zipBlob, zipFileName);
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

// 模块: 初始化
function init() {
  // 渲染初始状态
  updateSettingsUI();
  // renderGridOverlay();

  // 初始禁用导出按钮
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.style.opacity = '0.5';
    exportBtn.style.cursor = 'not-allowed';
  }

  // 为grid-container添加拖放事件监听器（从文件树拖入）
  const gridContainer = document.getElementById('grid-container');
  if (gridContainer) {
    gridContainer.addEventListener('dragover', handleDragOver);
    gridContainer.addEventListener('drop', handleDrop);
  }

  // 为拖拽区域添加事件监听器
  const dropZone = document.getElementById('drop-zone-folder');
  if (dropZone) {
    dropZone.addEventListener('dragover', handleDropZoneDragOver);
    dropZone.addEventListener('dragleave', handleDropZoneDragLeave);
    dropZone.addEventListener('drop', handleDropZoneDrop);
    dropZone.addEventListener('click', handleDropZoneClick);
  }

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('import-zip-btn').addEventListener('click', () => {
    document.getElementById('zip-input').click();
  });

  document.getElementById('file-input').addEventListener('change', async (e) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    try {
      const parsedFiles = await parseFiles(fileList);
      setFiles(parsedFiles);

      const wallpaperUrl = findWallpaper(parsedFiles);
      if (wallpaperUrl) {
        setWallpaper(wallpaperUrl);
      }

      const previewFiles = collectPreviewFiles(parsedFiles);
      fillCustomContainers(previewFiles);

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

      const wallpaperUrl = findWallpaper(parsedFiles);
      if (wallpaperUrl) {
        setWallpaper(wallpaperUrl);
      }

      const previewFiles = collectPreviewFiles(parsedFiles);
      fillCustomContainers(previewFiles);

      const iconFiles = collectIconFiles(parsedFiles);
      fillIconGrids(iconFiles);

    } catch (error) {
      console.error('Error parsing zip file:', error);
    }

    e.target.value = '';
  });

  document.getElementById('text-color').addEventListener('input', handleSettingsChange);
  document.getElementById('icon-size').addEventListener('input', handleSettingsChange);
  document.getElementById('show-grid').addEventListener('change', handleSettingsChange);
  document.getElementById('show-text').addEventListener('change', handleSettingsChange);
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
