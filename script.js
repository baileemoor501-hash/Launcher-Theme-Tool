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
  wallpaper: null,
  settings: { ...DEFAULT_SETTINGS },
  selectedFile: null,
  expandedFolders: new Set(),
  folderName: null,
};

// 状态更新函数
function setFiles(files) {
  state.files = files;
  renderFileTree();

  // 根据是否有文件来启用或禁用导出按钮
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    if (files && files.length > 0) {
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

  // 计算四条竖线的位置（居中分布，间距72px）
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
  // 第一根在72px位置，然后每72px一根，第6根和第7根之间距离134px
  const linePositions = [
    48,      // 第1根
    138,     // 第2根
    238,     // 第3根
    338,     // 第4根
    438,     // 第5根
    538,     // 第6根
    668      // 第7根（dock栏）
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

function updateSettingsUI() {
  document.getElementById('text-color').value = state.settings.textColor;
  document.getElementById('text-color-value').textContent = state.settings.textColor;
  document.getElementById('icon-size').value = state.settings.iconSize;
  document.getElementById('icon-size-value').textContent = `${state.settings.iconSize}px`;
  document.getElementById('show-grid').checked = state.settings.showGrid;
  document.getElementById('snap-threshold').value = state.settings.snapThreshold;
  document.getElementById('snap-threshold-value').textContent = `${state.settings.snapThreshold}px`;

  // 更新所有icon-label的文字颜色
  document.querySelectorAll('.icon-label').forEach(label => {
    label.style.color = state.settings.textColor;
  });

  // 更新所有grid-item的大小（排除特殊的grid-item）
  document.querySelectorAll('.grid-item').forEach(item => {
    // 排除第52-55行的特殊grid-item（具有width: 100%和height: 168px内联样式的）
    if (!item.style.width || item.style.width !== '100%') {
      item.style.width = `${state.settings.iconSize}px`;
      item.style.height = `${state.settings.iconSize}px`;
    }
  });
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
  if (!fileList || fileList.length === 0) return;

  parseFiles(fileList).then(parsedFiles => {
    setFiles(parsedFiles);
    const wallpaperUrl = findWallpaper(parsedFiles);
    if (wallpaperUrl) {
      setWallpaper(wallpaperUrl);
    }

    // 填充图标网格
    const imageFiles = collectImageFiles(parsedFiles);
    fillIconGrids(imageFiles);

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
  const phoneScreen = document.querySelector('.phone-screen');
  if (!phoneScreen) return;

  try {
    captureWorkspace(phoneScreen).then(previewBlob => {
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

// 检查是否为排除的文件
function isExcludedFile(filename) {
  const lowerName = filename.toLowerCase();
  return lowerName.includes('wallpaper') || lowerName.includes('iconback') || lowerName.includes('iconmask');
}

function parseFiles(fileList) {
  return new Promise((resolve) => {
    const root = [];

    // 提取文件夹名（从第一个文件的路径中）
    if (fileList.length > 0) {
      const firstFile = fileList[0];
      const path = firstFile.webkitRelativePath || firstFile.name;
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 1) {
        // 如果有相对路径，则第一个部分是文件夹名
        state.folderName = parts[0];
      } else {
        // 如果没有相对路径，则使用文件名作为默认
        state.folderName = 'theme';
      }
    }

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
          // 检查是否为排除的文件（wallpaper 不排除，用于设置壁纸）
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

function collectImageFiles(nodes) {
  const imageFiles = [];

  function traverse(node) {
    if (node.type === 'file' && node.url && isImageFile(node.name) && !isWallpaper(node.name)) {
      imageFiles.push(node);
    }
    if (node.type === 'folder' && node.children) {
      node.children.forEach(traverse);
    }
  }

  nodes.forEach(traverse);
  return imageFiles;
}

function fillIconGrids(imageFiles) {
  // 获取所有没有额外样式的 grid-item-container
  const gridContainers = document.querySelectorAll('.grid-item-container:not([style*="grid-column"]):not([style*="display: none"])');

  let fileIndex = 0;

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
      }

      if (iconLabel) {
        iconLabel.textContent = getIconLabel(file.name);
      }

      fileIndex++;
    }
  });
}

function exportTheme(previewBlob, files) {
  if (!previewBlob) {
    console.error('No preview blob to export');
    return;
  }

  // 创建预览图下载链接
  const previewUrl = URL.createObjectURL(previewBlob);
  const previewLink = document.createElement('a');
  previewLink.href = previewUrl;

  // 使用文件夹名作为导出文件名
  const fileName = state.folderName ? `${state.folderName}.png` : 'theme-preview.png';
  previewLink.download = fileName;

  previewLink.click();
  URL.revokeObjectURL(previewUrl);

  // 移除提示弹窗
  // 这里简化处理，实际项目中可能需要使用 ZIP 库打包文件
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

  // 添加事件监听器
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('file-input').addEventListener('change', handleFileChange);

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
