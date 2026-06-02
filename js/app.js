/**
 * LinkMemo PWA — 主应用逻辑
 */

// ====== 全局状态 ======
let state = {
  page: 'chat',             // 'chat' | 'todo' | 'links' | 'settings'
  todoFilter: 'all',        // 'all' | 'active' | 'completed'
  todoPriority: 'medium',   // 'high' | 'medium' | 'low'
  todoEditId: null,
  todoLinkedId: null,
  todoLinkedTitle: null,
  linkCategory: null,       // selected category name (null = all)
  linkSort: 'date',         // 'date' | 'title' | 'favorite'
  linkEditId: null,
  linkMode: null,           // 'ai' | 'manual' | null
  detailLinkId: null,
  clipboardURL: null,
  contextTarget: null,
  contextType: null,        // 'link' | 'todo'
  chatMessages: [],         // [{role, text, actions}]
  chatLoading: false
};

// ====== 初始化 ======
async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
  await detectClipboard();
  await loadSettings();
  await renderAll();
}

// ====== Tab 切换 ======
function switchTab(page) {
  state.page = page;
  document.querySelectorAll('#tabbar .tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`#tabbar [data-page="${page}"]`).classList.add('active');

  document.getElementById('page-chat').style.display = page === 'chat' ? '' : 'none';
  document.getElementById('page-todo').style.display = page === 'todo' ? '' : 'none';
  document.getElementById('page-links').style.display = page === 'links' ? '' : 'none';
  document.getElementById('page-settings').style.display = page === 'settings' ? '' : 'none';

  const fab = document.getElementById('fab');
  fab.style.display = (page === 'settings' || page === 'chat') ? 'none' : '';

  document.getElementById('navTitle').textContent = page === 'chat' ? '对话' : page === 'todo' ? '待办事项' : page === 'links' ? '链接收藏' : '设置';
  document.getElementById('navRightBtn').style.display = page === 'settings' ? 'none' : '';
  document.getElementById('navRightBtn').onclick = () => showSettings();

  if (page === 'chat') renderChat();
  if (page === 'todo') renderTodos();
  if (page === 'links') { renderCategoryBar(); renderLinks(); }
}

function showSettings() {
  state.page = 'settings';
  document.querySelectorAll('#tabbar .tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-todo').style.display = 'none';
  document.getElementById('page-links').style.display = 'none';
  document.getElementById('page-settings').style.display = '';
  document.getElementById('fab').style.display = 'none';
  document.getElementById('navTitle').textContent = '设置';
  document.getElementById('navRightBtn').style.display = 'none';
  renderSettings();
}

// ====== 渲染一切 ======
async function renderAll() {
  if (state.page === 'todo') renderTodos();
  else if (state.page === 'links') { renderCategoryBar(); renderLinks(); }
}

// ====== Toast ======
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.remove('show'), 2000);
}

// ====== 剪贴板检测 ======
async function detectClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
      state.clipboardURL = text;
      document.getElementById('clipboardBanner').style.display = '';
    }
  } catch {}
}

async function useClipboardURL() {
  document.getElementById('clipboardBanner').style.display = 'none';
  state.linkEditId = null;
  openAddSheet();
  document.getElementById('linkURL').value = state.clipboardURL || '';
}

function useClipboardInSheet() {
  document.getElementById('linkURL').value = state.clipboardURL || '';
  document.getElementById('linkClipboardHint').style.display = 'none';
}

// ========================================================
//  待办
// ========================================================

async function renderTodos() {
  const todos = await getAllTodos();
  const filter = state.todoFilter;
  const filtered = filter === 'all' ? todos : filter === 'active' ? todos.filter(t => !t.isCompleted) : todos.filter(t => t.isCompleted);

  // 排序：未完成的按 sortOrder 升序，完成的按创建时间倒序
  filtered.sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    if (!a.isCompleted) return (a.sortOrder || 0) - (b.sortOrder || 0);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const container = document.getElementById('todoList');
  const empty = document.getElementById('todoEmpty');

  if (filtered.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    empty.style.display = '';
  } else {
    empty.style.display = 'none';
    container.style.display = '';
    container.innerHTML = filtered.map(t => `
      <div class="list ${t.isCompleted ? 'completed' : ''}" style="margin:0;border-radius:0">
        <div class="list-item" data-id="${t.id}" oncontextmenu="return false"
             ontouchstart="startLongPress(event,'todo','${t.id}')" ontouchend="cancelLongPress()" ontouchmove="cancelLongPress()">
          <div class="todo-check ${t.isCompleted ? 'done' : ''}" onclick="event.stopPropagation();toggleTodo('${t.id}')">
            ${t.isCompleted ? '✓' : ''}
          </div>
          <div class="item-body" onclick="openEditTodo('${t.id}')">
            <div class="item-title">${escHtml(t.title)}</div>
            <div class="item-meta">
              <span class="todo-priority">${priorityIcon(t.priority)}</span>
              ${t.dueDate ? `<span class="todo-due ${isOverdue(t.dueDate, t.isCompleted) ? 'overdue' : ''}">📅 ${formatDate(t.dueDate)}</span>` : ''}
              ${t.relatedLinkTitle ? `<span>🔗 ${escHtml(t.relatedLinkTitle)}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  // 分段选择器事件
  document.getElementById('todoFilter').querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
    btn.onclick = () => { state.todoFilter = btn.dataset.filter; renderTodos(); };
  });
}

async function toggleTodo(id) {
  const todos = await getAllTodos();
  const t = todos.find(t => t.id === id);
  if (t) { t.isCompleted = !t.isCompleted; await saveTodo(t); renderTodos(); }
}

async function openAddSheet() {
  if (state.page === 'todo') openTodoForm();
  else openLinkForm();
}

// ====== 待办表单 ======
function openTodoForm(todo = null) {
  state.todoEditId = todo?.id || null;
  state.todoPriority = todo?.priority || 'medium';
  state.todoLinkedId = todo?.relatedLinkID || null;
  state.todoLinkedTitle = todo?.relatedLinkTitle || null;

  document.getElementById('todoSheetTitle').textContent = todo ? '编辑待办' : '新建待办';
  document.getElementById('todoTitle').value = todo?.title || '';
  document.getElementById('todoNotes').value = todo?.notes || '';

  if (todo?.dueDate) {
    document.getElementById('hasDueDate').checked = true;
    document.getElementById('todoDueDate').style.display = '';
    document.getElementById('todoDueDate').value = todo.dueDate.split('T')[0];
  } else {
    document.getElementById('hasDueDate').checked = false;
    document.getElementById('todoDueDate').style.display = 'none';
    document.getElementById('todoDueDate').value = '';
  }

  updatePriorityPicker();
  updateLinkedItemDisplay();
  document.getElementById('todoSheetOverlay').style.display = '';
}

async function openEditTodo(id) {
  const todos = await getAllTodos();
  const todo = todos.find(t => t.id === id);
  if (todo) openTodoForm(todo);
}

function closeTodoSheet() {
  document.getElementById('todoSheetOverlay').style.display = 'none';
}

async function saveTodoForm() {
  const title = document.getElementById('todoTitle').value.trim();
  if (!title) return toast('请输入标题');

  const todo = {
    id: state.todoEditId || generateId(),
    title,
    notes: document.getElementById('todoNotes').value,
    priority: state.todoPriority,
    dueDate: document.getElementById('hasDueDate').checked ? document.getElementById('todoDueDate').value : null,
    isCompleted: false,
    relatedLinkID: state.todoLinkedId,
    relatedLinkTitle: state.todoLinkedTitle,
    sortOrder: state.todoEditId ? undefined : Date.now(),
    createdAt: state.todoEditId ? undefined : new Date().toISOString()
  };

  if (state.todoEditId) {
    const todos = await getAllTodos();
    const existing = todos.find(t => t.id === state.todoEditId);
    if (existing) {
      Object.assign(existing, { title: todo.title, notes: todo.notes, priority: todo.priority, dueDate: todo.dueDate, relatedLinkID: todo.relatedLinkID, relatedLinkTitle: todo.relatedLinkTitle });
      await saveTodo(existing);
    }
  } else {
    await saveTodo(todo);
  }

  closeTodoSheet();
  renderTodos();
}

function selectPriority(p, el) {
  state.todoPriority = p;
  updatePriorityPicker();
}

function updatePriorityPicker() {
  document.querySelectorAll('#priorityPicker button').forEach(b => {
    b.classList.toggle('active', b.dataset.p === state.todoPriority);
  });
}

function toggleDueDate() {
  document.getElementById('todoDueDate').style.display = document.getElementById('hasDueDate').checked ? '' : 'none';
}

function updateLinkedItemDisplay() {
  const el = document.getElementById('todoLinkedItem');
  if (state.todoLinkedId) {
    el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--gray-bg);border-radius:8px;font-size:14px">
      <span>🔗 ${escHtml(state.todoLinkedTitle || '')}</span>
      <button onclick="removeLinkedItem()" style="margin-left:auto;border:none;background:none;color:var(--red);cursor:pointer">✕</button>
    </div>`;
    document.getElementById('linkPickerBtn').style.display = 'none';
  } else {
    el.innerHTML = '';
    document.getElementById('linkPickerBtn').style.display = '';
  }
}

function removeLinkedItem() {
  state.todoLinkedId = null;
  state.todoLinkedTitle = null;
  updateLinkedItemDisplay();
}

// ====== 链接选择器 ======
async function openLinkPicker() {
  const links = await getAllLinks();
  document.getElementById('linkPickerList').innerHTML = links.map(l => `
    <div style="display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid var(--separator);cursor:pointer"
         onclick="selectLinkForTodo('${l.id}','${escAttr(l.title)}')">
      <span style="font-size:20px">${l.categoryIcon || '📌'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:500;text-overflow:ellipsis;overflow:hidden;white-space:nowrap">${escHtml(l.title)}</div>
        <div style="font-size:11px;color:var(--text-secondary);text-overflow:ellipsis;overflow:hidden;white-space:nowrap">${escHtml(l.url)}</div>
      </div>
    </div>
  `).join('');
  document.getElementById('linkPickerOverlay').style.display = '';
}

function selectLinkForTodo(id, title) {
  state.todoLinkedId = id;
  state.todoLinkedTitle = title;
  updateLinkedItemDisplay();
  closeLinkPicker();
}

function closeLinkPicker() {
  document.getElementById('linkPickerOverlay').style.display = 'none';
}

// ========================================================
//  链接
// ========================================================

async function renderCategoryBar() {
  const links = await getAllLinks();
  const usedCats = new Set(links.map(l => l.categoryName));
  const allCats = CATEGORIES.filter(c => usedCats.has(c.name));

  let html = `<span class="category-chip ${!state.linkCategory ? 'active' : ''}" onclick="state.linkCategory=null;renderLinks()">全部</span>`;
  allCats.forEach(c => {
    html += `<span class="category-chip ${state.linkCategory === c.name ? 'active' : ''}" onclick="state.linkCategory='${c.name}';renderLinks()">${c.icon} ${c.name}</span>`;
  });
  document.getElementById('categoryBar').innerHTML = html;
}

async function renderLinks() {
  state.linkSort = document.getElementById('linkSort')?.value || 'date';
  const searchText = (document.getElementById('linkSearch')?.value || '').toLowerCase();

  let links = await getAllLinks();

  if (state.linkCategory) links = links.filter(l => l.categoryName === state.linkCategory);
  if (searchText) {
    links = links.filter(l =>
      (l.title || '').toLowerCase().includes(searchText) ||
      (l.summary || '').toLowerCase().includes(searchText) ||
      (l.url || '').toLowerCase().includes(searchText)
    );
  }

  switch (state.linkSort) {
    case 'title': links.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
    case 'favorite': links.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0) || new Date(b.createdAt) - new Date(a.createdAt)); break;
    default: links.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const container = document.getElementById('linkList');
  const empty = document.getElementById('linkEmpty');

  if (links.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    empty.style.display = '';
  } else {
    empty.style.display = 'none';
    container.style.display = '';
    container.innerHTML = links.map(l => `
      <div class="list" style="margin:0;border-radius:0">
        <div class="list-item" data-id="${l.id}"
             onclick="openLinkDetail('${l.id}')"
             oncontextmenu="return false"
             ontouchstart="startLongPress(event,'link','${l.id}')" ontouchend="cancelLongPress()" ontouchmove="cancelLongPress()">
          <div class="item-icon">${l.categoryIcon || '📌'}</div>
          <div class="item-body">
            <div class="item-title">${escHtml(l.title || l.url)}</div>
            ${l.summary ? `<div class="item-subtitle">${escHtml(l.summary)}</div>` : ''}
            <div class="item-meta">
              <span class="item-category">${l.categoryName || '其他'}</span>
              <span>${timeAgo(l.createdAt)}</span>
              ${l.isFavorite ? '<span class="item-fav">⭐</span>' : ''}
              ${l.aiGenerated ? '<span class="item-ai">AI</span>' : ''}
            </div>
            ${l.tags?.length ? `<div class="item-meta">${l.tags.map(t => `<span>#${escHtml(t)}</span>`).join(' ')}</div>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }
}

// ====== 链接表单 ======
function openLinkForm(link = null) {
  state.linkEditId = link?.id || null;
  state.linkMode = null;

  document.getElementById('linkSheetTitle').textContent = link ? '编辑链接' : '添加链接';
  document.getElementById('linkURL').value = link?.url || '';
  document.getElementById('linkTitle').value = link?.title || '';
  document.getElementById('linkSummary').value = link?.summary || '';
  document.getElementById('linkTags').value = (link?.tags || []).join(', ');
  state.linkCategory = link?.categoryName || null;

  document.getElementById('linkModeChoose').style.display = link ? 'none' : '';
  document.getElementById('linkAILoading').style.display = 'none';
  document.getElementById('linkFormFields').style.display = link ? '' : 'none';
  document.getElementById('linkSheetSave').style.display = link ? '' : 'none';
  document.getElementById('linkClipboardHint').style.display = (state.clipboardURL && !link) ? '' : 'none';
  document.getElementById('linkAIHint').style.display = link?.aiGenerated ? '' : 'none';

  if (link) renderLinkCategoryPicker();
  document.getElementById('linkSheetOverlay').style.display = '';
}

function closeLinkSheet() {
  document.getElementById('linkSheetOverlay').style.display = 'none';
}

async function startAIAnalysis() {
  const url = document.getElementById('linkURL').value.trim();
  if (!url) return toast('请输入链接');

  document.getElementById('linkModeChoose').style.display = 'none';
  document.getElementById('linkAILoading').style.display = '';
  state.linkMode = 'ai';

  const provider = await getActiveProvider();
  try {
    const result = await analyzeURL(url, provider);
    document.getElementById('linkAILoading').style.display = 'none';
    document.getElementById('linkTitle').value = result.title || '';
    document.getElementById('linkSummary').value = result.summary || '';
    document.getElementById('linkTags').value = (result.tags || []).join(', ');
    state.linkCategory = result.category || null;
    document.getElementById('linkAIHint').style.display = '';
    renderLinkCategoryPicker();
    document.getElementById('linkFormFields').style.display = '';
    document.getElementById('linkSheetSave').style.display = '';
    document.getElementById('linkSheetTitle').textContent = '确认结果';
  } catch (e) {
    document.getElementById('linkAILoading').style.display = 'none';
    document.getElementById('linkModeChoose').style.display = '';
    toast(e.message);
  }
}

function showManualForm() {
  const url = document.getElementById('linkURL').value.trim();
  if (!url) return toast('请输入链接');
  state.linkMode = 'manual';
  document.getElementById('linkModeChoose').style.display = 'none';
  document.getElementById('linkFormFields').style.display = '';
  document.getElementById('linkSheetSave').style.display = '';
  renderLinkCategoryPicker();
}

function renderLinkCategoryPicker() {
  document.getElementById('linkCategoryPicker').innerHTML = CATEGORIES.map(c =>
    `<span class="category-chip ${state.linkCategory === c.name ? 'active' : ''}" onclick="state.linkCategory='${c.name}';renderLinkCategoryPicker()">${c.icon} ${c.name}</span>`
  ).join('');
}

async function saveLinkForm() {
  const url = document.getElementById('linkURL').value.trim();
  const title = document.getElementById('linkTitle').value.trim();
  if (!url || !title) return toast('请填写链接和标题');

  const cat = CATEGORIES.find(c => c.name === state.linkCategory) || CATEGORIES[7];
  const tags = document.getElementById('linkTags').value.split(',').map(t => t.trim()).filter(Boolean);
  const isAI = state.linkMode === 'ai';

  if (state.linkEditId) {
    const links = await getAllLinks();
    const existing = links.find(l => l.id === state.linkEditId);
    if (existing) {
      Object.assign(existing, { url, title, summary: document.getElementById('linkSummary').value, categoryName: cat.name, categoryIcon: cat.icon, tags, aiGenerated: existing.aiGenerated });
      await saveLink(existing);
    }
  } else {
    const link = {
      id: generateId(),
      url, title,
      summary: document.getElementById('linkSummary').value,
      categoryName: cat.name,
      categoryIcon: cat.icon,
      tags,
      aiGenerated: isAI || false,
      isFavorite: false,
      createdAt: new Date().toISOString()
    };
    await saveLink(link);
  }

  closeLinkSheet();
  renderCategoryBar();
  renderLinks();
  if (state.todoLinkedId) { renderTodos(); updateLinkedItemDisplay(); }
}

async function openLinkDetail(id) {
  const link = await getLink(id);
  if (!link) return;
  state.detailLinkId = id;

  document.getElementById('linkDetailContent').innerHTML = `
    <h2 style="font-size:20px;margin-bottom:8px">${escHtml(link.title)}</h2>
    <a href="${escAttr(link.url)}" target="_blank" style="font-size:13px;color:var(--blue);word-break:break-all">${escHtml(link.url)}</a>
    <div style="margin:12px 0;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
      <span style="font-size:12px;padding:3px 10px;background:var(--blue-light);color:var(--blue);border-radius:8px">${link.categoryIcon} ${link.categoryName}</span>
      <span style="font-size:12px;color:var(--text-secondary)">${formatDate(link.createdAt)}</span>
      ${link.aiGenerated ? '<span style="font-size:11px;padding:2px 6px;background:#f3e8ff;color:var(--purple);border-radius:4px">AI 生成</span>' : ''}
    </div>
    ${link.tags?.length ? `<div style="margin-bottom:12px;display:flex;flex-wrap:wrap;gap:4px">${link.tags.map(t => `<span style="font-size:11px;padding:3px 8px;background:var(--gray-bg);border-radius:6px">#${escHtml(t)}</span>`).join('')}</div>` : ''}
    <hr style="border:none;border-top:1px solid var(--separator);margin:12px 0">
    <h4 style="margin-bottom:6px">摘要</h4>
    <p style="font-size:14px;color:var(--text-secondary);line-height:1.6">${escHtml(link.summary || '暂无摘要')}</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">
      <button class="btn-primary" onclick="openURL('${escAttr(link.url)}')">🌐 在浏览器中打开</button>
      <button class="btn-secondary" onclick="linkToTodo('${link.id}')">📋 转为待办事项</button>
      <button class="btn-secondary" onclick="shareLink('${escAttr(link.title)}','${escAttr(link.url)}')">📤 分享</button>
      <button class="btn-danger" onclick="deleteLinkFromDetail('${link.id}')">🗑 删除</button>
    </div>
  `;
  document.getElementById('detailEditBtn').onclick = () => { closeLinkDetail(); openLinkForm(link); };
  document.getElementById('linkDetailOverlay').style.display = '';
}

function closeLinkDetail() {
  document.getElementById('linkDetailOverlay').style.display = 'none';
}

async function editLinkFromDetail() {
  closeLinkDetail();
}

async function linkToTodo(id) {
  const link = await getLink(id);
  if (!link) return;
  state.todoLinkedId = link.id;
  state.todoLinkedTitle = link.title;
  closeLinkDetail();
  switchTab('todo');
  setTimeout(() => {
    openTodoForm({ title: '阅读：' + link.title, notes: link.url, priority: 'medium', relatedLinkID: link.id, relatedLinkTitle: link.title });
  }, 300);
}

async function deleteLinkFromDetail(id) {
  if (!confirm('确定要删除吗？')) return;
  await deleteLink(id);
  closeLinkDetail();
  renderCategoryBar();
  renderLinks();
  toast('已删除');
}

function openURL(url) {
  window.open(url, '_blank');
}

async function shareLink(title, url) {
  if (navigator.share) {
    try { await navigator.share({ title, url }); } catch {}
  } else {
    await navigator.clipboard.writeText(url);
    toast('链接已复制到剪贴板');
  }
}

// ========================================================
//  设置
// ========================================================

async function loadSettings() {
  const provider = await getActiveProvider();
  document.getElementById('settingProvider').value = provider;
}

async function renderSettings() {
  const provider = await getActiveProvider();
  document.getElementById('settingProvider').value = provider;

  // API Keys
  const keys = ['openai', 'claude', 'deepseek', 'qwen'];
  document.getElementById('apiKeysCard').innerHTML = keys.map(k => {
    const p = AI_PROVIDERS[k];
    return `<div class="settings-row">
      <span class="row-label">${p.name}</span>
      <input type="password" placeholder="输入 Key" value="" id="apikey_${k}" onchange="saveApiKey('${k}',this.value)">
    </div>`;
  }).join('');

  // 加载已保存的 key 到 placeholder
  for (const k of keys) {
    const key = await getSetting('api_key_' + k);
    if (key) document.getElementById('apikey_' + k).value = key;
  }

  // 自定义分类
  renderCustomCategories();
}

function onProviderChange() {
  const provider = document.getElementById('settingProvider').value;
  setSetting('ai_provider', provider);
}

async function saveApiKey(provider, value) {
  await setSetting('api_key_' + provider, value);
}

async function renderCustomCategories() {
  const custom = await getSetting('customCategories');
  const cats = custom || [];
  document.getElementById('customCatCard').innerHTML = cats.map((c, i) =>
    `<div class="settings-row"><span>${c.icon} ${c.name}</span><button onclick="deleteCustomCat(${i})" style="border:none;background:none;color:var(--red);cursor:pointer">删除</button></div>`
  ).join('') + `
    <div class="settings-row">
      <select id="newCatIcon">
        ${['💻','📺','📖','🛒','🔧','📰','🎵','📌','🎮','🏃','✈️','🍔','💡','❤️','🎓','💼'].map(i => `<option>${i}</option>`).join('')}
      </select>
      <input type="text" id="newCatName" placeholder="分类名称" style="flex:1">
      <button onclick="addCustomCat()" style="border:none;background:var(--blue);color:white;padding:6px 12px;border-radius:6px;cursor:pointer">添加</button>
    </div>`;
}

async function addCustomCat() {
  const name = document.getElementById('newCatName').value.trim();
  if (!name) return;
  const icon = document.getElementById('newCatIcon').value;
  const custom = await getSetting('customCategories') || [];
  custom.push({ name, icon });
  await setSetting('customCategories', custom);
  CATEGORIES.push({ name, icon });
  renderCustomCategories();
  renderCategoryBar();
}

async function deleteCustomCat(index) {
  const custom = await getSetting('customCategories') || [];
  const removed = custom.splice(index, 1)[0];
  await setSetting('customCategories', custom);
  const catIdx = CATEGORIES.findIndex(c => c.name === removed.name);
  if (catIdx >= 0) CATEGORIES.splice(catIdx, 1);
  renderCustomCategories();
  renderCategoryBar();
}

// ========================================================
//  导出
// ========================================================

async function exportData() {
  const data = await exportAllData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `LinkMemo_export_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('数据已导出');
}

// ========================================================
//  长按菜单
// ========================================================
let longPressTimer;

function startLongPress(e, type, id) {
  longPressTimer = setTimeout(() => showContextMenu(e, type, id), 500);
}

function cancelLongPress() {
  clearTimeout(longPressTimer);
}

function showContextMenu(e, type, id) {
  state.contextTarget = id;
  state.contextType = type;
  const menu = document.getElementById('contextMenu');
  const touch = e.touches?.[0] || e;

  let x = touch.clientX, y = touch.clientY;
  if (x > window.innerWidth - 180) x = window.innerWidth - 180;
  if (y > window.innerHeight - 180) y = window.innerHeight - 180;

  menu.style.cssText = `display:block;left:${x}px;top:${y}px`;

  if (type === 'link') {
    menu.innerHTML = `
      <button onclick="ctxShareLink()">📤 分享</button>
      <button onclick="ctxLinkToTodo()">📋 转为待办</button>
      <button onclick="ctxCopyLink()">📋 复制链接</button>
      <button onclick="ctxToggleFav()">⭐ 收藏/取消</button>
      <button class="destructive" onclick="ctxDeleteLink()">🗑 删除</button>
    `;
  } else if (type === 'todo') {
    menu.innerHTML = `
      <button onclick="ctxEditTodo()">✏️ 编辑</button>
      <button class="destructive" onclick="ctxDeleteTodo()">🗑 删除</button>
    `;
  }

  setTimeout(() => { menu.style.display = 'none'; }, 3000);
}

function hideContextMenu() { document.getElementById('contextMenu').style.display = 'none'; }
document.addEventListener('click', (e) => {
  if (!e.target.closest('#contextMenu')) hideContextMenu();
});

// 上下文菜单操作
async function ctxShareLink() { const l = await getLink(state.contextTarget); if (l) shareLink(l.title, l.url); hideContextMenu(); }
async function ctxLinkToTodo() { await linkToTodo(state.contextTarget); hideContextMenu(); }
async function ctxCopyLink() { const l = await getLink(state.contextTarget); if (l) { await navigator.clipboard.writeText(l.url); toast('链接已复制'); } hideContextMenu(); }
async function ctxToggleFav() { const l = await getLink(state.contextTarget); if (l) { l.isFavorite = !l.isFavorite; await saveLink(l); renderLinks(); } hideContextMenu(); }
async function ctxDeleteLink() { if (confirm('确定删除？')) { await deleteLink(state.contextTarget); renderCategoryBar(); renderLinks(); toast('已删除'); } hideContextMenu(); }
async function ctxEditTodo() { await openEditTodo(state.contextTarget); hideContextMenu(); }
async function ctxDeleteTodo() { if (confirm('确定删除？')) { await deleteTodo(state.contextTarget); renderTodos(); toast('已删除'); } hideContextMenu(); }

// ========================================================
//  对话 Agent
// ========================================================

async function renderChat() {
  const container = document.getElementById('chatMessages');
  if (state.chatMessages.length === 0) {
    container.innerHTML = `
      <div class="chat-welcome">
        <div class="welcome-icon">💬</div>
        <h3>你好，我是 LinkMemo 助手</h3>
        <p>你可以对我这样说：</p>
        <div class="chat-suggestions">
          <span class="chat-suggestion" onclick="quickChat(this.textContent)">保存这个链接 https://example.com 这是一篇好文章</span>
          <span class="chat-suggestion" onclick="quickChat(this.textContent)">帮我创建一个待办：明天买牛奶</span>
          <span class="chat-suggestion" onclick="quickChat(this.textContent)">我收藏了哪些技术文章？</span>
          <span class="chat-suggestion" onclick="quickChat(this.textContent)">把没完成的待办列出来</span>
        </div>
      </div>`;
  } else {
    container.innerHTML = state.chatMessages.map(m => {
      if (m.role === 'user') {
        return `<div class="chat-bubble user"><div class="bubble-text">${escHtml(m.text)}</div></div>`;
      } else if (m.role === 'assistant') {
        let actionsHtml = '';
        if (m.actions?.length) {
          actionsHtml = m.actions.map(a => `<div class="action-done">${formatAction(a)}</div>`).join('');
        }
        return `<div class="chat-bubble ai"><div class="bubble-text">${formatBubbleText(m.text)}${actionsHtml}</div></div>`;
      }
    }).join('');
    if (state.chatLoading) {
      container.innerHTML += '<div class="chat-typing" style="display:block"><div class="dot-flash"><span></span><span></span><span></span></div></div>';
    }
  }
  // 滚动到底部
  setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
}

function quickChat(text) {
  document.getElementById('chatInput').value = text;
  sendChatMessage();
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || state.chatLoading) return;

  input.value = '';
  state.chatMessages.push({ role: 'user', text, actions: [] });
  state.chatLoading = true;
  renderChat();

  try {
    const context = await buildContext();
    const messages = state.chatMessages.map(m => ({ role: m.role, content: m.text }));
    const result = await chatAgent(messages, context);

    // 执行 actions
    const actionResults = [];
    for (const action of result.actions) {
      const done = await executeAction(action);
      if (done) actionResults.push(done);
    }

    state.chatMessages.push({
      role: 'assistant',
      text: result.text || '好的，已处理！',
      actions: actionResults
    });
  } catch (e) {
    state.chatMessages.push({
      role: 'assistant',
      text: '抱歉，出了点问题：' + e.message,
      actions: []
    });
  }

  state.chatLoading = false;
  renderChat();
  // 刷新数据
  if (state.chatMessages.length > 2) {
    renderCategoryBar();
    renderTodos();
  }
}

async function buildContext() {
  const [links, todos] = await Promise.all([getAllLinks(), getAllTodos()]);
  let ctx = '';
  if (links.length) {
    ctx += '📎 已收藏的链接：\n';
    links.slice(0, 20).forEach(l => {
      ctx += `- [${l.id}] ${l.title} (${l.categoryName}) URL:${l.url}\n`;
    });
  }
  if (todos.length) {
    const active = todos.filter(t => !t.isCompleted);
    if (active.length) {
      ctx += '\n📋 进行中的待办：\n';
      active.forEach(t => {
        ctx += `- [${t.id}] ${t.title} | 优先级:${t.priority} ${t.dueDate ? '| 截止:' + t.dueDate : ''}\n`;
      });
    }
  }
  return ctx || '暂无数据';
}

async function executeAction(action) {
  const { type, data } = action;
  try {
    switch (type) {
      case 'save_link': {
        const cat = CATEGORIES.find(c => c.name === data.category) || CATEGORIES[7];
        const link = {
          id: generateId(),
          url: data.url || '',
          title: data.title || '未命名',
          summary: data.summary || '',
          categoryName: cat.name,
          categoryIcon: cat.icon,
          tags: data.tags || [],
          aiGenerated: true,
          isFavorite: false,
          createdAt: new Date().toISOString()
        };
        await saveLink(link);
        return { type, label: '已保存链接：' + link.title };
      }
      case 'create_todo': {
        const todo = {
          id: generateId(),
          title: data.title || '未命名待办',
          notes: data.notes || '',
          priority: data.priority || 'medium',
          dueDate: data.dueDate || null,
          isCompleted: false,
          sortOrder: Date.now(),
          createdAt: new Date().toISOString()
        };
        await saveTodo(todo);
        return { type, label: '已创建待办：' + todo.title };
      }
      case 'delete_link':
        await deleteLink(data.id);
        return { type, label: '已删除链接' };
      case 'delete_todo':
        await deleteTodo(data.id);
        return { type, label: '已删除待办' };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function formatAction(a) {
  return a.label || (a.type === 'save_link' ? '已保存链接' : a.type === 'create_todo' ? '已创建待办' : '已完成');
}

function formatBubbleText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--gray-bg);padding:1px 5px;border-radius:4px;font-size:13px">$1</code>');
}

// ========================================================
//  工具函数
// ========================================================
function generateId() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }
function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function formatDate(d) { if (!d) return ''; const date = new Date(d); return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }); }
function timeAgo(d) { if (!d) return ''; const diff = Date.now() - new Date(d).getTime(); const mins = Math.floor(diff / 60000); if (mins < 60) return mins <= 0 ? '刚刚' : mins + '分钟前'; const hours = Math.floor(mins / 60); if (hours < 24) return hours + '小时前'; const days = Math.floor(hours / 24); if (days < 30) return days + '天前'; return formatDate(d); }
function priorityIcon(p) { return p === 'high' ? '🔴' : p === 'low' ? '🟢' : '🟡'; }
function isOverdue(dueDate, isCompleted) { if (!dueDate || isCompleted) return false; return new Date(dueDate) < new Date(); }

// ====== 启动 ======
document.addEventListener('DOMContentLoaded', init);
