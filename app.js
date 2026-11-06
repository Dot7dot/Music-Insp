/* Music Insp — 靈感碎片收集簿
 * 純前端：資料全部存在瀏覽器的 IndexedDB 裡。
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- utils
  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $('#app');

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2));

  const fmtSize = (n) => {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
    return (n / 1024 ** i).toFixed(i ? 1 : 0) + ' ' + u[i];
  };

  const fmtDur = (sec) => {
    if (sec == null || !isFinite(sec)) return '';
    sec = Math.round(sec);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const fmtDate = (t) => {
    const d = new Date(t);
    const now = new Date();
    const pad = (x) => String(x).padStart(2, '0');
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
    const y = d.getFullYear() === now.getFullYear() ? '' : `${d.getFullYear()}/`;
    return `${y}${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  };

  let toastTimer;
  const toast = (msg, ms = 2400) => {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  };

  const ICONS = {
    folder: '<svg viewBox="0 0 24 24"><path d="M10 4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/></svg>',
    audio: '<svg viewBox="0 0 24 24"><path d="M3 10h2v4H3zm4-3h2v10H7zm4-4h2v18h-2zm4 5h2v8h-2zm4 3h2v2h-2z"/></svg>',
    image: '<svg viewBox="0 0 24 24"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5z"/></svg>',
    video: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 7V3.5L19.5 9z"/></svg>',
    upload: '<svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5zm7-16l-6 6h4v6h4v-6h4z"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5zm14-11h-4V3H9v6H5l7 7z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>',
    zip: '<svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm-2 6h-2v2h2v2h-2v2h-2v-2h2v-2h-2v-2h2v-2h-2V8h2v2h2z"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M4 5h16v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h7v2H4zm14.3-3.7l1.4 1.4-4.6 4.6H13.7v-1.4z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><path d="M7.4 8.6L12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>',
  };

  // ---------------------------------------------------------------- IndexedDB
  const DB_NAME = 'music-insp';
  const DB_VERSION = 1;
  let dbPromise;

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('folders')) {
            db.createObjectStore('folders', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('fragments')) {
            const s = db.createObjectStore('fragments', { keyPath: 'id' });
            s.createIndex('folderId', 'folderId');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  const reqP = (r) => new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const txDone = (t) => new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('transaction aborted'));
  });

  async function os(name, mode = 'readonly') {
    const db = await openDB();
    return db.transaction(name, mode).objectStore(name);
  }

  const DB = {
    async folders() {
      const list = await reqP((await os('folders')).getAll());
      return list.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async folder(id) { return reqP((await os('folders')).get(id)); },
    async putFolder(f) { return reqP((await os('folders', 'readwrite')).put(f)); },
    async fragments(folderId) {
      const idx = (await os('fragments')).index('folderId');
      const list = await reqP(idx.getAll(IDBKeyRange.only(folderId)));
      return list.sort((a, b) => a.createdAt - b.createdAt);
    },
    async putFragment(fr) { return reqP((await os('fragments', 'readwrite')).put(fr)); },
    async deleteFragment(id) { return reqP((await os('fragments', 'readwrite')).delete(id)); },
    async deleteFolder(id) {
      const db = await openDB();
      const t = db.transaction(['folders', 'fragments'], 'readwrite');
      t.objectStore('folders').delete(id);
      const frags = t.objectStore('fragments');
      const cur = frags.index('folderId').openKeyCursor(IDBKeyRange.only(id));
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) { frags.delete(c.primaryKey); c.continue(); }
      };
      return txDone(t);
    },
    async stats() {
      // 每個資料夾的碎片數量與種類（不讀取 blob 內容）
      const db = await openDB();
      const t = db.transaction('fragments');
      const out = {};
      const cur = t.objectStore('fragments').openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return;
        const v = c.value;
        const s = (out[v.folderId] ||= { count: 0, size: 0, kinds: {} });
        s.count++;
        s.size += v.size || 0;
        s.kinds[v.kind] = (s.kinds[v.kind] || 0) + 1;
        c.continue();
      };
      await txDone(t);
      return out;
    },
  };

  async function touchFolder(id) {
    const f = await DB.folder(id);
    if (f) { f.updatedAt = Date.now(); await DB.putFolder(f); }
  }

  let persistAsked = false;
  function askPersist() {
    if (persistAsked) return;
    persistAsked = true;
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  }

  async function updateStorageInfo() {
    const el = $('#storage-info');
    if (!navigator.storage || !navigator.storage.estimate) return;
    try {
      const { usage, quota } = await navigator.storage.estimate();
      el.textContent = `已使用 ${fmtSize(usage)}${quota ? ' / ' + fmtSize(quota) : ''}`;
    } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- file kinds
  const MIME_EXT = {
    'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3',
    'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac', 'audio/flac': 'flac',
    'audio/x-m4a': 'm4a', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/svg+xml': 'svg', 'text/plain': 'txt', 'application/pdf': 'pdf',
  };

  function kindOf(mime, name = '') {
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (/\.(wav|mp3|m4a|aac|flac|ogg|aif|aiff|caf|opus)$/i.test(name)) return 'audio';
    return 'file';
  }

  function extOf(fr) {
    const m = /\.([a-z0-9]{1,8})$/i.exec(fr.origName || '');
    if (m) return m[1].toLowerCase();
    const base = (fr.mime || '').split(';')[0].trim();
    return MIME_EXT[base] || 'bin';
  }

  const stripExt = (n) => n.replace(/\.[a-z0-9]{1,8}$/i, '');

  const KIND_LABEL = { text: '文字', audio: '音訊', image: '圖片', video: '影片', file: '檔案' };

  // 文字碎片匯出 / 下載用：UTF-8 BOM + CRLF，Windows 記事本也不會亂碼
  const textBlob = (str) => new Blob(['\ufeff' + String(str || '').replace(/\r?\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' });
  const charCount = (str) => [...String(str || '').replace(/\s/g, '')].length;
  const byteLen = (str) => new Blob([str || '']).size;

  // ---------------------------------------------------------------- router
  let cleanup = [];
  function runCleanup() {
    const jobs = cleanup.map((fn) => { try { return fn(); } catch { return null; } });
    cleanup = [];
    return Promise.all(jobs).catch(() => {});
  }

  async function route() {
    if (recorder.active) {
      // 離開頁面前先把錄音存起來
      await recorder.stop();
    }
    await runCleanup();
    const m = /^#\/song\/([^/]+)/.exec(location.hash);
    try {
      if (m) await renderFolder(decodeURIComponent(m[1]));
      else await renderHome();
    } catch (err) {
      console.error(err);
      app.innerHTML = `<div class="empty"><strong>發生錯誤</strong>${esc(err.message || err)}</div>`;
    }
    updateStorageInfo();
  }
  window.addEventListener('hashchange', route);

  // ---------------------------------------------------------------- home
  async function renderHome() {
    document.title = 'Music Insp';
    const [folders, stats] = await Promise.all([DB.folders(), DB.stats()]);

    const cards = folders.map((f) => {
      const s = stats[f.id] || { count: 0, size: 0, kinds: {} };
      const chips = Object.entries(s.kinds)
        .map(([k, n]) => `<span class="chip">${KIND_LABEL[k] || k} ${n}</span>`).join('');
      return `
        <a class="folder-card" href="#/song/${encodeURIComponent(f.id)}">
          <span class="folder-icon">${ICONS.folder}</span>
          <h3>${esc(f.name)}</h3>
          <div class="meta">
            <span>${s.count} 個碎片</span>
            <span>${fmtSize(s.size)}</span>
            <span>更新於 ${fmtDate(f.updatedAt)}</span>
          </div>
          ${chips ? `<div class="chips">${chips}</div>` : ''}
        </a>`;
    }).join('');

    app.innerHTML = `
      <section class="hero">
        <h1>我的歌曲</h1>
        <p>每首歌一個資料夾，把錄音、文字、圖片、檔案這些靈感碎片先丟進來，之後一鍵匯出 ZIP 帶進編曲軟體。</p>
      </section>
      <form class="new-song" id="new-song" autocomplete="off">
        <label class="sr-only" for="song-name">歌曲名稱</label>
        <input id="song-name" name="name" placeholder="新歌曲名稱，例如：夏夜的海" maxlength="80" required>
        <button class="btn btn-primary" type="submit">${ICONS.plus}新增歌曲</button>
      </form>
      ${folders.length ? `<div class="folder-grid">${cards}</div>` : `
        <div class="empty">
          <strong>還沒有任何歌曲資料夾</strong>
          在上方輸入歌曲名稱，建立第一個靈感資料夾吧。
        </div>`}
    `;

    $('#new-song').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      const now = Date.now();
      const folder = { id: uid(), name, notes: '', createdAt: now, updatedAt: now };
      await DB.putFolder(folder);
      askPersist();
      location.hash = `#/song/${encodeURIComponent(folder.id)}`;
    });
  }

  // ---------------------------------------------------------------- folder
  let current = null; // { folder, fragments }

  async function renderFolder(id) {
    const folder = await DB.folder(id);
    if (!folder) {
      app.innerHTML = `<a class="back" href="#/">← 所有歌曲</a>
        <div class="empty" style="margin-top:16px"><strong>找不到這個資料夾</strong>它可能已經被刪除了。</div>`;
      return;
    }
    // 舊版的「資料夾備註」搬進靈感碎片，變成一則文字碎片
    if (folder.notes && folder.notes.trim()) {
      const text = folder.notes;
      await DB.putFragment({
        id: uid(), folderId: id, name: '備註', kind: 'text', mime: 'text/plain',
        text, size: byteLen(text), createdAt: folder.createdAt || Date.now(), updatedAt: Date.now(),
      });
      folder.notes = '';
      await DB.putFolder(folder);
    }
    const fragments = await DB.fragments(id);
    current = { folder, fragments };
    expanded.clear();
    document.title = `${folder.name} · Music Insp`;

    const wavPref = readPref('wav', '1') === '1';

    app.innerHTML = `<div class="folder-view">
      <a class="back" href="#/">← 所有歌曲</a>
      <div class="folder-head">
        <div class="title-wrap">
          <label class="sr-only" for="title">歌曲名稱</label>
          <input id="title" class="title-input" value="${esc(folder.name)}" maxlength="80">
        </div>
        <div class="head-actions">
          <label class="wav-toggle" title="把瀏覽器錄下的音訊（webm / m4a）在匯出時轉成 WAV，編曲軟體比較好讀">
            <input type="checkbox" id="wav" ${wavPref ? 'checked' : ''}> 錄音轉 WAV
          </label>
          <button class="btn btn-primary" id="export">${ICONS.zip}匯出 ZIP</button>
          <button class="btn btn-danger btn-icon" id="del-folder" title="刪除資料夾" aria-label="刪除資料夾">${ICONS.trash}</button>
        </div>
      </div>

      <section class="panel">
        <h2>靈感碎片 <span class="count" id="frag-count"></span></h2>
        <div class="add-bar">
          <button class="btn btn-rec" id="rec-btn">${ICONS.mic}錄音</button>
          <button class="btn" id="text-btn">${ICONS.text}寫文字</button>
          <button class="btn" id="upload-btn">${ICONS.upload}上傳檔案</button>
          <input type="file" id="file-input" multiple hidden>
        </div>
        <div id="recorder-slot"></div>
        <div class="dropzone" id="dropzone">也可以把檔案直接拖曳到這裡（錄音、圖片、PDF、任何檔案都行）</div>
        <ul class="frag-list" id="frag-list"></ul>
      </section>
    </div>`;

    renderFragments();
    bindFolderEvents();
  }

  const urls = new Set();
  function objURL(blob) {
    const u = URL.createObjectURL(blob);
    urls.add(u);
    return u;
  }
  function revokeAll() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.clear();
  }

  const expanded = new Set(); // 目前展開中的文字碎片 id

  function renderFragments() {
    revokeAll();
    const list = $('#frag-list');
    const { fragments } = current;
    $('#frag-count').textContent = fragments.length ? `${fragments.length} 個` : '';

    if (!fragments.length) {
      list.innerHTML = `<li class="empty">還沒有碎片。按「錄音」馬上錄一段、「寫文字」記下歌詞或旋律想法，或上傳檔案。</li>`;
      return;
    }
    list.innerHTML = fragments.map(fragHTML).join('');
    afterRender(list);
  }

  function rerenderFrag(id) {
    const fr = current.fragments.find((x) => x.id === id);
    const li = $(`.frag[data-id="${CSS.escape(id)}"]`);
    if (!fr || !li) return null;
    li.outerHTML = fragHTML(fr);
    const fresh = $(`.frag[data-id="${CSS.escape(id)}"]`);
    afterRender(fresh);
    return fresh;
  }

  // 依內容調整：文字預覽是否被截斷、展開時輸入框自動長高
  function afterRender(root) {
    root.querySelectorAll('.peek-text').forEach((el) => {
      el.closest('.frag').classList.toggle('clamped', el.scrollHeight > el.clientHeight + 2);
    });
    root.querySelectorAll('.text-body').forEach(autosize);
  }

  function autosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 2 + 'px';
  }

  function textMeta(fr) {
    const n = charCount(fr.text);
    const lines = String(fr.text || '').split('\n').filter((l) => l.trim()).length;
    return [
      '文字',
      n ? `${n} 字` : '空白',
      lines > 1 ? `${lines} 行` : '',
      `更新於 ${fmtDate(fr.updatedAt || fr.createdAt)}`,
    ].filter(Boolean).join(' · ');
  }

  function fragHTML(fr) {
    const nameInput = `<input class="frag-name" value="${esc(fr.name)}" maxlength="120" aria-label="碎片名稱">`;
    const delBtn = `<button class="btn btn-ghost btn-icon btn-danger" data-act="delete" title="刪除" aria-label="刪除">${ICONS.trash}</button>`;

    if (fr.kind === 'text') {
      const open = expanded.has(fr.id);
      const body = open
        ? `<textarea class="text-body" placeholder="寫下歌詞、旋律、和弦進行、編曲想法……" aria-label="${esc(fr.name)} 內容">${esc(fr.text || '')}</textarea>
           <div class="text-foot">
             <span class="save-state" data-save></span>
             <button class="btn btn-ghost btn-sm" data-act="collapse">${ICONS.chevron}收合</button>
           </div>`
        : `<div class="text-peek${fr.text ? '' : ' is-empty'}" role="button" tabindex="0" data-act="expand" aria-label="展開「${esc(fr.name)}」"><div class="peek-text">${fr.text ? esc(fr.text) : '還沒有內容，點一下開始寫'}</div></div>
           <button class="peek-more" data-act="expand" tabindex="-1">展開全文 ${ICONS.chevron}</button>`;
      return `
        <li class="frag frag-text${open ? ' open' : ''}" data-id="${esc(fr.id)}">
          <span class="frag-icon">${ICONS.text}</span>
          ${nameInput}
          <div class="frag-actions">
            <button class="btn btn-ghost btn-icon toggle" data-act="${open ? 'collapse' : 'expand'}" title="${open ? '收合' : '展開'}" aria-label="${open ? '收合' : '展開'}" aria-expanded="${open}">${ICONS.chevron}</button>
            <button class="btn btn-ghost btn-icon" data-act="download-text" title="下載 .txt" aria-label="下載文字檔">${ICONS.download}</button>
            ${delBtn}
          </div>
          <div class="frag-meta" data-meta>${esc(textMeta(fr))}</div>
          <div class="frag-preview">${body}</div>
        </li>`;
    }

    const url = objURL(fr.blob);
    const meta = [
      KIND_LABEL[fr.kind] || '檔案',
      extOf(fr).toUpperCase(),
      fmtSize(fr.size),
      fr.duration ? fmtDur(fr.duration) : '',
      fmtDate(fr.createdAt),
    ].filter(Boolean).join(' · ');

    let icon = ICONS[fr.kind] || ICONS.file;
    let preview = '';
    if (fr.kind === 'audio') {
      preview = `<audio controls preload="metadata" src="${url}"></audio>`;
    } else if (fr.kind === 'video') {
      preview = `<video controls preload="metadata" playsinline src="${url}"></video>`;
    } else if (fr.kind === 'image') {
      icon = `<img src="${url}" alt="">`;
      preview = `<img src="${url}" alt="${esc(fr.name)}" data-zoom>`;
    }

    return `
      <li class="frag" data-id="${esc(fr.id)}">
        <span class="frag-icon">${icon}</span>
        ${nameInput}
        <div class="frag-actions">
          <a class="btn btn-ghost btn-icon" href="${url}" download="${esc(fileNameFor(fr))}" title="下載" aria-label="下載">${ICONS.download}</a>
          ${delBtn}
        </div>
        <div class="frag-meta">${esc(meta)}</div>
        ${preview ? `<div class="frag-preview">${preview}</div>` : ''}
      </li>`;
  }

  // ---- 文字碎片：自動儲存
  const textTimers = new Map();
  function scheduleTextSave(fr, li) {
    clearTimeout(textTimers.get(fr.id));
    const state = li?.querySelector('[data-save]');
    if (state) state.textContent = '編輯中…';
    textTimers.set(fr.id, setTimeout(() => saveText(fr), 600));
  }
  async function saveText(fr) {
    clearTimeout(textTimers.get(fr.id));
    if (!textTimers.has(fr.id)) return;
    textTimers.delete(fr.id);
    fr.size = byteLen(fr.text);
    await DB.putFragment(fr);
    await touchFolder(fr.folderId);
    const li = $(`.frag[data-id="${CSS.escape(fr.id)}"]`);
    const state = li?.querySelector('[data-save]');
    if (state) state.textContent = '已儲存';
    const meta = li?.querySelector('[data-meta]');
    if (meta) meta.textContent = textMeta(fr);
  }
  function flushTextSaves() {
    if (!current) return Promise.resolve();
    const pending = [...textTimers.keys()]
      .map((id) => current.fragments.find((x) => x.id === id))
      .filter(Boolean);
    return Promise.all(pending.map(saveText));
  }

  function expandText(id, { focus = 'end' } = {}) {
    expanded.add(id);
    const li = rerenderFrag(id);
    if (!li) return;
    if (focus === 'name') {
      const n = li.querySelector('.frag-name');
      n.focus();
      n.select();
    } else if (focus) {
      const ta = li.querySelector('.text-body');
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function collapseText(id) {
    const fr = current.fragments.find((x) => x.id === id);
    if (fr) await saveText(fr);
    expanded.delete(id);
    const before = $(`.frag[data-id="${CSS.escape(id)}"]`);
    // 只有焦點原本就在這張卡片裡時才把焦點留在原處，避免搶走其他輸入框的焦點
    const hadFocus = !!before && before.contains(document.activeElement);
    const li = rerenderFrag(id);
    if (hadFocus) li?.querySelector('.text-peek')?.focus({ preventScroll: true });
  }

  let addingText = false;
  async function addText() {
    if (addingText) return;
    addingText = true;
    try { await createText(); } finally { addingText = false; }
  }
  async function createText() {
    const { folder } = current;
    const n = current.fragments.filter((f) => f.kind === 'text').length + 1;
    const now = Date.now();
    const fr = {
      id: uid(), folderId: folder.id, name: `文字 ${n}`, kind: 'text', mime: 'text/plain',
      text: '', size: 0, createdAt: now, updatedAt: now,
    };
    await DB.putFragment(fr);
    await touchFolder(folder.id);
    askPersist();
    current.fragments.push(fr);
    expanded.add(fr.id);
    renderFragments();
    expandText(fr.id, { focus: 'name' });
    toast('先幫它取個名字，按 Enter 開始寫內容');
  }

  const sanitize = (s) => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim() || '未命名';

  function fileNameFor(fr, ext = extOf(fr)) {
    return `${sanitize(fr.name)}.${ext}`;
  }

  function bindFolderEvents() {
    const { folder } = current;

    // 標題
    const title = $('#title');
    const saveTitle = async () => {
      const v = title.value.trim();
      if (!v) { title.value = folder.name; return; }
      if (v === folder.name) return;
      folder.name = v;
      folder.updatedAt = Date.now();
      await DB.putFolder(folder);
      document.title = `${folder.name} · Music Insp`;
      toast('已更新歌曲名稱');
    };
    title.addEventListener('change', saveTitle);
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') title.blur(); });

    // 匯出 & 刪除
    $('#wav').addEventListener('change', (e) => writePref('wav', e.target.checked ? '1' : '0'));
    $('#export').addEventListener('click', (e) => exportZip(e.currentTarget));
    $('#del-folder').addEventListener('click', async () => {
      const n = current.fragments.length;
      if (!confirm(`確定要刪除「${folder.name}」嗎？${n ? `裡面的 ${n} 個碎片也會一起刪除，` : ''}這個動作無法復原。`)) return;
      await DB.deleteFolder(folder.id);
      toast('已刪除資料夾');
      location.hash = '#/';
    });

    // 上傳
    const input = $('#file-input');
    $('#upload-btn').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      await addFiles([...input.files]);
      input.value = '';
    });

    // 拖曳
    const dz = $('#dropzone');
    const panel = dz.closest('.panel');
    let depth = 0;
    panel.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; dz.classList.add('over'); });
    panel.addEventListener('dragover', (e) => e.preventDefault());
    panel.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; dz.classList.remove('over'); } });
    panel.addEventListener('drop', async (e) => {
      e.preventDefault();
      depth = 0;
      dz.classList.remove('over');
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length) await addFiles(files);
    });

    // 錄音 / 文字
    $('#rec-btn').addEventListener('click', () => recorder.start());
    $('#text-btn').addEventListener('click', addText);

    // 碎片列表：重新命名 / 刪除 / 放大圖片
    const list = $('#frag-list');
    list.addEventListener('change', async (e) => {
      if (!e.target.classList.contains('frag-name')) return;
      const li = e.target.closest('.frag');
      const fr = current.fragments.find((x) => x.id === li.dataset.id);
      const v = e.target.value.trim();
      if (!fr) return;
      if (!v) { e.target.value = fr.name; return; }
      fr.name = v;
      if (fr.kind === 'text') fr.updatedAt = Date.now();
      await DB.putFragment(fr);
      await touchFolder(folder.id);
      const a = li.querySelector('a[download]');
      if (a) a.download = fileNameFor(fr);
      toast('已重新命名');
    });
    list.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('frag-name')) {
        e.preventDefault();
        const ta = e.target.closest('.frag').querySelector('.text-body');
        if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } else e.target.blur();
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.text-peek')) {
        e.preventDefault();
        expandText(e.target.closest('.frag').dataset.id);
        return;
      }
      if (e.key === 'Escape' && e.target.matches('.text-body')) {
        collapseText(e.target.closest('.frag').dataset.id);
      }
    });
    list.addEventListener('input', (e) => {
      if (!e.target.matches('.text-body')) return;
      const li = e.target.closest('.frag');
      const fr = current.fragments.find((x) => x.id === li.dataset.id);
      if (!fr) return;
      fr.text = e.target.value;
      fr.updatedAt = Date.now();
      autosize(e.target);
      scheduleTextSave(fr, li);
    });
    list.addEventListener('click', async (e) => {
      const zoom = e.target.closest('[data-zoom]');
      if (zoom) { openLightbox(zoom.src); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      const id = e.target.closest('.frag')?.dataset.id;
      if (act === 'expand') { expandText(id); return; }
      if (act === 'collapse') { collapseText(id); return; }
      if (act === 'download-text') {
        const fr = current.fragments.find((x) => x.id === id);
        if (fr) downloadBlob(textBlob(fr.text), fileNameFor(fr, 'txt'));
        return;
      }
      const del = e.target.closest('[data-act="delete"]');
      if (!del) return;
      const li = del.closest('.frag');
      const fr = current.fragments.find((x) => x.id === li.dataset.id);
      if (!fr || !confirm(`刪除「${fr.name}」？`)) return;
      clearTimeout(textTimers.get(fr.id));
      textTimers.delete(fr.id);
      expanded.delete(fr.id);
      await DB.deleteFragment(fr.id);
      await touchFolder(folder.id);
      current.fragments = current.fragments.filter((x) => x.id !== fr.id);
      renderFragments();
      updateStorageInfo();
      toast('已刪除');
    });

    cleanup.push(revokeAll, flushTextSaves);
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  }

  async function addFiles(files) {
    if (!files.length) return;
    const { folder } = current;
    let base = Date.now();
    for (const file of files) {
      const mime = file.type || 'application/octet-stream';
      const fr = {
        id: uid(),
        folderId: folder.id,
        name: stripExt(file.name) || '未命名',
        origName: file.name,
        mime,
        kind: kindOf(mime, file.name),
        size: file.size,
        blob: file,
        createdAt: base++,
      };
      try {
        await DB.putFragment(fr);
        current.fragments.push(fr);
      } catch (err) {
        console.error(err);
        toast(`「${file.name}」儲存失敗：${err.message || err}`, 4000);
      }
    }
    await touchFolder(folder.id);
    askPersist();
    renderFragments();
    updateStorageInfo();
    toast(`已加入 ${files.length} 個檔案`);
  }

  function openLightbox(src) {
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.innerHTML = `<img src="${src}" alt="">`;
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    box.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
  }

  // ---------------------------------------------------------------- recorder
  const recorder = {
    active: false,
    async start() {
      if (this.active) return;
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        toast('這個瀏覽器不支援錄音，請改用上傳檔案。', 4000);
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (err) {
        console.error(err);
        toast('無法使用麥克風，請確認已允許麥克風權限。', 4000);
        return;
      }

      const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
      const mimeType = types.find((t) => MediaRecorder.isTypeSupported?.(t));
      const mr = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 192000 } : undefined);
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

      this.active = true;
      this.folderId = current.folder.id;
      this.stream = stream;
      this.mr = mr;
      this.chunks = chunks;
      this.cancelled = false;
      this.startedAt = performance.now();
      mr.start(1000);
      $('#rec-btn').disabled = true;
      this.renderUI();
      this.startMeter(stream);
    },

    renderUI() {
      const slot = $('#recorder-slot');
      if (!slot) return;
      slot.innerHTML = `
        <div class="recorder" role="region" aria-label="錄音中">
          <span class="rec-dot" aria-hidden="true"></span>
          <span class="rec-time" id="rec-time">0:00</span>
          <span class="rec-meter" aria-hidden="true"><span id="rec-level"></span></span>
          <span class="rec-actions">
            <button class="btn btn-ghost" id="rec-cancel">取消</button>
            <button class="btn btn-rec" id="rec-stop">${ICONS.stop}停止並儲存</button>
          </span>
        </div>`;
      $('#rec-stop').addEventListener('click', () => this.stop());
      $('#rec-cancel').addEventListener('click', () => { this.cancelled = true; this.stop(); });
      this.timer = setInterval(() => {
        const el = $('#rec-time');
        if (el) el.textContent = fmtDur((performance.now() - this.startedAt) / 1000);
      }, 250);
    },

    startMeter(stream) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          if (!this.active) return;
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
          const el = $('#rec-level');
          if (el) el.style.width = Math.min(100, (peak / 128) * 140) + '%';
          this.raf = requestAnimationFrame(tick);
        };
        this.meterCtx = ctx;
        tick();
      } catch { /* meter is optional */ }
    },

    stop() {
      if (!this.active) return Promise.resolve();
      const { mr, stream, chunks, folderId } = this;
      const duration = (performance.now() - this.startedAt) / 1000;
      return new Promise((resolve) => {
        mr.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          clearInterval(this.timer);
          cancelAnimationFrame(this.raf);
          this.meterCtx?.close().catch(() => {});
          this.active = false;
          const slot = $('#recorder-slot');
          if (slot) slot.innerHTML = '';
          const btn = $('#rec-btn');
          if (btn) btn.disabled = false;

          if (this.cancelled || !chunks.length) {
            if (this.cancelled) toast('已取消錄音');
            resolve();
            return;
          }
          const mime = mr.mimeType || chunks[0].type || 'audio/webm';
          const blob = new Blob(chunks, { type: mime });
          const existing = await DB.fragments(folderId);
          const n = existing.filter((f) => f.recorded).length + 1;
          const fr = {
            id: uid(),
            folderId,
            name: `錄音 ${n}`,
            origName: '',
            mime,
            kind: 'audio',
            size: blob.size,
            blob,
            duration,
            recorded: true,
            createdAt: Date.now(),
          };
          await DB.putFragment(fr);
          await touchFolder(folderId);
          askPersist();
          if (current && current.folder.id === folderId && $('#frag-list')) {
            current.fragments.push(fr);
            renderFragments();
            const input = $(`.frag[data-id="${CSS.escape(fr.id)}"] .frag-name`);
            if (input) { input.focus(); input.select(); }
            toast('錄音已儲存，可以直接替它命名');
          } else {
            toast('錄音已儲存');
          }
          updateStorageInfo();
          resolve();
        };
        try { mr.stop(); } catch { mr.onstop(); }
      });
    },
  };

  // ---------------------------------------------------------------- export
  async function toWav(blob) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    try {
      const ab = await blob.arrayBuffer();
      const audio = await new Promise((res, rej) => {
        const p = ctx.decodeAudioData(ab, res, rej);
        if (p && p.then) p.then(res, rej);
      });
      return encodeWav(audio);
    } finally {
      ctx.close?.().catch(() => {});
    }
  }

  function encodeWav(audio) {
    const ch = audio.numberOfChannels;
    const rate = audio.sampleRate;
    const len = audio.length;
    const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF');
    data.setUint32(4, 36 + len * ch * 2, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    data.setUint32(16, 16, true);
    data.setUint16(20, 1, true);
    data.setUint16(22, ch, true);
    data.setUint32(24, rate, true);
    data.setUint32(28, rate * ch * 2, true);
    data.setUint16(32, ch * 2, true);
    data.setUint16(34, 16, true);
    str(36, 'data');
    data.setUint32(40, len * ch * 2, true);
    const chans = [];
    for (let c = 0; c < ch; c++) chans.push(audio.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < ch; c++) {
        const s = Math.max(-1, Math.min(1, chans[c][i]));
        data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        o += 2;
      }
    }
    return new Blob([data], { type: 'audio/wav' });
  }

  async function exportZip(btn) {
    if (typeof JSZip === 'undefined') { toast('ZIP 元件載入失敗，請重新整理頁面。', 4000); return; }
    // 先把還沒存的文字 / 名稱寫進去
    document.activeElement?.blur?.();
    await flushTextSaves();
    const folder = await DB.folder(current.folder.id);
    const fragments = await DB.fragments(folder.id);
    const wav = $('#wav')?.checked;

    const label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = '打包中…';
    try {
      const zip = new JSZip();
      const root = zip.folder(sanitize(folder.name));
      const used = new Set();
      const unique = (name) => {
        let n = name;
        let i = 2;
        const dot = name.lastIndexOf('.');
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        while (used.has(n.toLowerCase())) n = `${stem} (${i++})${ext}`;
        used.add(n.toLowerCase());
        return n;
      };
      let converted = 0;
      for (const fr of fragments) {
        if (fr.kind === 'text') {
          root.file(unique(fileNameFor(fr, 'txt')), textBlob(fr.text), { date: new Date(fr.updatedAt || fr.createdAt) });
          continue;
        }
        let blob = fr.blob;
        let ext = extOf(fr);
        if (wav && fr.recorded && ext !== 'wav') {
          try {
            blob = await toWav(fr.blob);
            ext = 'wav';
            converted++;
          } catch (err) {
            console.warn('WAV 轉換失敗，改用原始格式', err);
          }
        }
        root.file(unique(fileNameFor(fr, ext)), blob, { date: new Date(fr.createdAt) });
      }

      // 舊版資料夾備註（尚未搬移的）也一起帶走
      if (folder.notes && folder.notes.trim()) root.file(unique('備註.txt'), textBlob(folder.notes));

      const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      downloadBlob(out, `${sanitize(folder.name)}.zip`);
      toast(`已匯出 ${fragments.length} 個碎片${converted ? `（${converted} 段錄音轉為 WAV）` : ''}`);
    } catch (err) {
      console.error(err);
      toast('匯出失敗：' + (err.message || err), 4000);
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  }

  // ---------------------------------------------------------------- prefs
  function readPref(k, d) {
    try { return localStorage.getItem('music-insp:' + k) ?? d; } catch { return d; }
  }
  function writePref(k, v) {
    try { localStorage.setItem('music-insp:' + k, v); } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- boot
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushTextSaves();
  });
  window.addEventListener('pagehide', () => { flushTextSaves(); });
  window.addEventListener('beforeunload', (e) => {
    if (recorder.active) { e.preventDefault(); e.returnValue = ''; }
  });

  if (!('indexedDB' in window)) {
    app.innerHTML = '<div class="empty"><strong>這個瀏覽器不支援 IndexedDB</strong>無法儲存資料，請改用最新版的 Chrome、Safari、Edge 或 Firefox。</div>';
  } else {
    route();
  }
})();
