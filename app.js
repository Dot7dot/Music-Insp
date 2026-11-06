/* Music Insp — 灵感碎片收集簿
 * 纯前端：资料全部存在浏览器的 IndexedDB 里。
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
      // 每个资料夹的碎片数量与种类（不读取 blob 内容）
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

  const KIND_LABEL = { audio: '音讯', image: '图片', video: '影片', file: '档案' };

  // ---------------------------------------------------------------- router
  let cleanup = [];
  function runCleanup() {
    cleanup.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    cleanup = [];
  }

  async function route() {
    if (recorder.active) {
      // 离开页面前先把录音存起来
      await recorder.stop();
    }
    runCleanup();
    const m = /^#\/song\/([^/]+)/.exec(location.hash);
    try {
      if (m) await renderFolder(decodeURIComponent(m[1]));
      else await renderHome();
    } catch (err) {
      console.error(err);
      app.innerHTML = `<div class="empty"><strong>发生错误</strong>${esc(err.message || err)}</div>`;
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
            <span>${s.count} 个碎片</span>
            <span>${fmtSize(s.size)}</span>
            <span>更新于 ${fmtDate(f.updatedAt)}</span>
          </div>
          ${chips ? `<div class="chips">${chips}</div>` : ''}
        </a>`;
    }).join('');

    app.innerHTML = `
      <section class="hero">
        <h1>我的歌曲</h1>
        <p>每首歌一个资料夹，把录音、图片、档案这些灵感碎片先丢进来，之后一键汇出 ZIP 带进编曲软体。</p>
      </section>
      <form class="new-song" id="new-song" autocomplete="off">
        <label class="sr-only" for="song-name">歌曲名称</label>
        <input id="song-name" name="name" placeholder="新歌曲名称，例如：夏夜的海" maxlength="80" required>
        <button class="btn btn-primary" type="submit">${ICONS.plus}新增歌曲</button>
      </form>
      ${folders.length ? `<div class="folder-grid">${cards}</div>` : `
        <div class="empty">
          <strong>还没有任何歌曲资料夹</strong>
          在上方输入歌曲名称，建立第一个灵感资料夹吧。
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
        <div class="empty" style="margin-top:16px"><strong>找不到这个资料夹</strong>它可能已经被删除了。</div>`;
      return;
    }
    const fragments = await DB.fragments(id);
    current = { folder, fragments };
    document.title = `${folder.name} · Music Insp`;

    const wavPref = readPref('wav', '1') === '1';

    app.innerHTML = `
      <a class="back" href="#/">← 所有歌曲</a>
      <div class="folder-head">
        <div class="title-wrap">
          <label class="sr-only" for="title">歌曲名称</label>
          <input id="title" class="title-input" value="${esc(folder.name)}" maxlength="80">
        </div>
        <div class="head-actions">
          <label class="wav-toggle" title="把浏览器录下的音讯（webm / m4a）在汇出时转成 WAV，编曲软体比较好读">
            <input type="checkbox" id="wav" ${wavPref ? 'checked' : ''}> 录音转 WAV
          </label>
          <button class="btn btn-primary" id="export">${ICONS.zip}汇出 ZIP</button>
          <button class="btn btn-danger btn-icon" id="del-folder" title="删除资料夹" aria-label="删除资料夹">${ICONS.trash}</button>
        </div>
      </div>

      <div class="layout">
        <section class="panel">
          <h2>灵感碎片 <span class="count" id="frag-count"></span></h2>
          <div class="add-bar">
            <button class="btn btn-rec" id="rec-btn">${ICONS.mic}录音</button>
            <button class="btn" id="upload-btn">${ICONS.upload}上传档案</button>
            <input type="file" id="file-input" multiple hidden>
          </div>
          <div id="recorder-slot"></div>
          <div class="dropzone" id="dropzone">也可以把档案直接拖曳到这里（录音、图片、PDF、任何档案都行）</div>
          <ul class="frag-list" id="frag-list"></ul>
        </section>

        <section class="panel sticky">
          <h2>备注 <span class="save-state" id="save-state"></span></h2>
          <label class="sr-only" for="notes">备注</label>
          <textarea id="notes" class="notes" placeholder="歌词、和弦进行、编曲想法、BPM、调性……想到什么就记下来。">${esc(folder.notes || '')}</textarea>
          <p class="notes-hint">自动储存。汇出 ZIP 时会一起打包成「备注.txt」。</p>
        </section>
      </div>
    `;

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

  function renderFragments() {
    revokeAll();
    const list = $('#frag-list');
    const { fragments } = current;
    $('#frag-count').textContent = fragments.length ? `${fragments.length} 个` : '';

    if (!fragments.length) {
      list.innerHTML = `<li class="empty">还没有碎片。按「录音」马上录一段，或上传档案。</li>`;
      return;
    }

    list.innerHTML = fragments.map((fr) => {
      const url = objURL(fr.blob);
      const meta = [
        KIND_LABEL[fr.kind] || '档案',
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
          <input class="frag-name" value="${esc(fr.name)}" maxlength="120" aria-label="碎片名称">
          <div class="frag-actions">
            <a class="btn btn-ghost btn-icon" href="${url}" download="${esc(fileNameFor(fr))}" title="下载" aria-label="下载">${ICONS.download}</a>
            <button class="btn btn-ghost btn-icon btn-danger" data-act="delete" title="删除" aria-label="删除">${ICONS.trash}</button>
          </div>
          <div class="frag-meta">${esc(meta)}</div>
          ${preview ? `<div class="frag-preview">${preview}</div>` : ''}
        </li>`;
    }).join('');
  }

  const sanitize = (s) => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim() || '未命名';

  function fileNameFor(fr, ext = extOf(fr)) {
    return `${sanitize(fr.name)}.${ext}`;
  }

  function bindFolderEvents() {
    const { folder } = current;

    // 标题
    const title = $('#title');
    const saveTitle = async () => {
      const v = title.value.trim();
      if (!v) { title.value = folder.name; return; }
      if (v === folder.name) return;
      folder.name = v;
      folder.updatedAt = Date.now();
      await DB.putFolder(folder);
      document.title = `${folder.name} · Music Insp`;
      toast('已更新歌曲名称');
    };
    title.addEventListener('change', saveTitle);
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') title.blur(); });

    // 备注（自动储存）
    const notes = $('#notes');
    const state = $('#save-state');
    let t;
    const saveNotes = async () => {
      clearTimeout(t);
      if (folder.notes === notes.value) return;
      folder.notes = notes.value;
      folder.updatedAt = Date.now();
      await DB.putFolder(folder);
      state.textContent = '已储存';
    };
    notes.addEventListener('input', () => {
      state.textContent = '编辑中…';
      clearTimeout(t);
      t = setTimeout(saveNotes, 600);
    });
    notes.addEventListener('blur', saveNotes);
    cleanup.push(() => { saveNotes(); });

    // 汇出 & 删除
    $('#wav').addEventListener('change', (e) => writePref('wav', e.target.checked ? '1' : '0'));
    $('#export').addEventListener('click', (e) => exportZip(e.currentTarget));
    $('#del-folder').addEventListener('click', async () => {
      const n = current.fragments.length;
      if (!confirm(`确定要删除「${folder.name}」吗？${n ? `里面的 ${n} 个碎片和备注也会一起删除，` : ''}这个动作无法复原。`)) return;
      await DB.deleteFolder(folder.id);
      toast('已删除资料夹');
      location.hash = '#/';
    });

    // 上传
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

    // 录音
    $('#rec-btn').addEventListener('click', () => recorder.start());

    // 碎片列表：重新命名 / 删除 / 放大图片
    const list = $('#frag-list');
    list.addEventListener('change', async (e) => {
      if (!e.target.classList.contains('frag-name')) return;
      const li = e.target.closest('.frag');
      const fr = current.fragments.find((x) => x.id === li.dataset.id);
      const v = e.target.value.trim();
      if (!fr) return;
      if (!v) { e.target.value = fr.name; return; }
      fr.name = v;
      await DB.putFragment(fr);
      await touchFolder(folder.id);
      const a = li.querySelector('a[download]');
      if (a) a.download = fileNameFor(fr);
      toast('已重新命名');
    });
    list.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('frag-name')) e.target.blur();
    });
    list.addEventListener('click', async (e) => {
      const zoom = e.target.closest('[data-zoom]');
      if (zoom) { openLightbox(zoom.src); return; }
      const del = e.target.closest('[data-act="delete"]');
      if (!del) return;
      const li = del.closest('.frag');
      const fr = current.fragments.find((x) => x.id === li.dataset.id);
      if (!fr || !confirm(`删除「${fr.name}」？`)) return;
      await DB.deleteFragment(fr.id);
      await touchFolder(folder.id);
      current.fragments = current.fragments.filter((x) => x.id !== fr.id);
      renderFragments();
      updateStorageInfo();
      toast('已删除');
    });

    cleanup.push(revokeAll);
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
        toast(`「${file.name}」储存失败：${err.message || err}`, 4000);
      }
    }
    await touchFolder(folder.id);
    askPersist();
    renderFragments();
    updateStorageInfo();
    toast(`已加入 ${files.length} 个档案`);
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
        toast('这个浏览器不支援录音，请改用上传档案。', 4000);
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (err) {
        console.error(err);
        toast('无法使用麦克风，请确认已允许麦克风权限。', 4000);
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
        <div class="recorder" role="region" aria-label="录音中">
          <span class="rec-dot" aria-hidden="true"></span>
          <span class="rec-time" id="rec-time">0:00</span>
          <span class="rec-meter" aria-hidden="true"><span id="rec-level"></span></span>
          <span class="rec-actions">
            <button class="btn btn-ghost" id="rec-cancel">取消</button>
            <button class="btn btn-rec" id="rec-stop">${ICONS.stop}停止并储存</button>
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
            if (this.cancelled) toast('已取消录音');
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
            name: `录音 ${n}`,
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
            toast('录音已储存，可以直接替它命名');
          } else {
            toast('录音已储存');
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
    if (typeof JSZip === 'undefined') { toast('ZIP 元件载入失败，请重新整理页面。', 4000); return; }
    // 先把还没存的备注 / 名称写进去
    document.activeElement?.blur?.();
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
      used.add('备注.txt');

      let converted = 0;
      for (const fr of fragments) {
        let blob = fr.blob;
        let ext = extOf(fr);
        if (wav && fr.recorded && ext !== 'wav') {
          try {
            blob = await toWav(fr.blob);
            ext = 'wav';
            converted++;
          } catch (err) {
            console.warn('WAV 转换失败，改用原始格式', err);
          }
        }
        root.file(unique(fileNameFor(fr, ext)), blob, { date: new Date(fr.createdAt) });
      }

      const list = fragments.map((fr, i) => `${i + 1}. ${fr.name}（${KIND_LABEL[fr.kind] || '档案'}${fr.duration ? '，' + fmtDur(fr.duration) : ''}，${new Date(fr.createdAt).toLocaleString()}）`).join('\n');
      const noteText = [
        `# ${folder.name}`,
        `汇出时间：${new Date().toLocaleString()}`,
        '',
        '## 备注',
        folder.notes || '（无）',
        '',
        `## 灵感碎片（${fragments.length}）`,
        list || '（无）',
        '',
      ].join('\n');
      root.file('备注.txt', '﻿' + noteText.replace(/\n/g, '\r\n'));

      const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(out);
      a.download = `${sanitize(folder.name)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      toast(`已汇出 ${fragments.length} 个碎片${converted ? `（${converted} 段录音转为 WAV）` : ''}`);
    } catch (err) {
      console.error(err);
      toast('汇出失败：' + (err.message || err), 4000);
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
  window.addEventListener('beforeunload', (e) => {
    if (recorder.active) { e.preventDefault(); e.returnValue = ''; }
  });

  if (!('indexedDB' in window)) {
    app.innerHTML = '<div class="empty"><strong>这个浏览器不支援 IndexedDB</strong>无法储存资料，请改用最新版的 Chrome、Safari、Edge 或 Firefox。</div>';
  } else {
    route();
  }
})();
