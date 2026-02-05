/* app.js - app.html logic (API-backed notes) */

(function () {
  const params = new URLSearchParams(location.search);
  const profileName = params.get("profile");

  const elTitle = document.getElementById("profileTitle");
  const elSub = document.getElementById("profileSub");
  const grid = document.getElementById("notesGrid");
  const empty = document.getElementById("emptyNotes");

  const btnLogout = document.getElementById("btnLogout");
  const btnExportNotes = document.getElementById("btnExportNotes");
  const btnImportNotes = document.getElementById("btnImportNotes");

  const fab = document.getElementById("fabAddNote");
  const dlg = document.getElementById("createNoteDialog");
  const newTitle = document.getElementById("newNoteTitle");
  const newColor = document.getElementById("newNoteColor");
  const btnOk = document.getElementById("noteOk");
  const btnCancel = document.getElementById("noteCancel");
  const err = document.getElementById("noteCreateError");

  const filePicker = document.getElementById("filePicker");

  // --- Suche UI (neu) ---
  const searchInput = document.getElementById("searchInput");
  const searchBar = document.getElementById("searchBar");
  const searchCount = document.getElementById("searchCount");
  const btnPrevHit = document.getElementById("btnPrevHit");
  const btnNextHit = document.getElementById("btnNextHit");
  const btnPrevNote = document.getElementById("btnPrevNote");
  const btnNextNote = document.getElementById("btnNextNote");
  const btnClearSearch = document.getElementById("btnClearSearch");

  let notesDoc = null;

  // Such-State
  let hits = []; // { noteId, noteTitle, noteLabel, inField, index, preview }
  let hitCursor = -1;
  let lastQuery = "";

  init().catch((e) => {
    alert(String(e.message || e));
    bounceHome();
  });

  async function init() {
    if (!profileName) return bounceHome();
    if (!Store.isUnlocked(profileName)) return bounceHome();

    const profile = await Store.getProfile(profileName, true);
    if (!profile) return bounceHome();

    elTitle.textContent = profile.displayName || profile.name;
    elSub.textContent = "Notizen";

    notesDoc = await Store.loadNotes(profileName, true);
    render();

    bindUI();

    // initial Search UI
    if (searchBar) searchBar.classList.add("hidden");
    if (searchCount) searchCount.textContent = "";
  }

  function bindUI() {
    btnLogout.addEventListener("click", () => {
      Store.clearUnlocked(profileName);
      bounceHome();
    });

    btnExportNotes.addEventListener("click", async () => {
      const doc = await Store.loadNotes(profileName, true);
      Store.downloadJson(`${profileName}_notes.json`, doc);
    });

    btnImportNotes.addEventListener("click", () => {
      filePicker.value = "";
      filePicker.click();
    });

    filePicker.addEventListener("change", async () => {
      const f = filePicker.files?.[0];
      if (!f) return;

      try {
        const obj = await Store.readFileAsJson(f);
        if (!obj || !obj.profile || !Array.isArray(obj.notes)) {
          alert("Ungültige Notes-JSON.");
          return;
        }
        if (Store.safeName(obj.profile) !== Store.safeName(profileName)) {
          alert("Diese Datei gehört nicht zu diesem Profil.");
          return;
        }

        obj.profile = Store.safeName(profileName);
        obj.updatedAt = Store.nowIso();

        const saved = await Store.saveNotes(profileName, obj);
        notesDoc = saved;
        render();
        applySearch(lastQuery); // Suche bleibt, falls aktiv
      } catch (e) {
        alert(String(e.message || e));
      }
    });

    fab.addEventListener("click", () => {
      err.classList.add("hidden");
      newTitle.value = "";
      newColor.value = "#2a74ff";
      dlg.showModal();
      setTimeout(() => newTitle.focus(), 50);
    });

    btnCancel.addEventListener("click", () => dlg.close());

    btnOk.addEventListener("click", async () => {
      const title = String(newTitle.value || "").trim();
      if (!title) return showErr("Name fehlt.");

      const color = String(newColor.value || "#2a74ff");

      notesDoc = await Store.loadNotes(profileName, true);
      const nextLabel = computeNextLabel(notesDoc.notes.map(n => n.label));

      const note = {
        id: cryptoId(),
        label: nextLabel,
        title,
        color,
        content: "",
        createdAt: Store.nowIso(),
        updatedAt: Store.nowIso()
      };

      notesDoc.notes.push(note);

      try {
        const saved = await Store.saveNotes(profileName, notesDoc);
        notesDoc = saved;
        dlg.close();
        render();
        applySearch(lastQuery); // Suche aktualisieren
        openNote(note.id);
      } catch (e) {
        showErr(String(e.message || e));
      }
    });

    // --- Volltextsuche (neu) ---
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        applySearch(String(searchInput.value || ""));
      });

      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          // Enter springt zum nächsten Treffer
          if (hits.length) {
            gotoHit((hitCursor + 1) % hits.length);
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          clearSearch();
        }
      });
    }

    if (btnPrevHit) btnPrevHit.addEventListener("click", () => stepHit(-1));
    if (btnNextHit) btnNextHit.addEventListener("click", () => stepHit(+1));
    if (btnPrevNote) btnPrevNote.addEventListener("click", () => stepNote(-1));
    if (btnNextNote) btnNextNote.addEventListener("click", () => stepNote(+1));
    if (btnClearSearch) btnClearSearch.addEventListener("click", clearSearch);
  }

  function showErr(msg) {
    err.textContent = msg;
    err.classList.remove("hidden");
  }

  function render() {
    const notes = notesDoc?.notes || [];
    grid.innerHTML = "";
    empty.classList.toggle("hidden", notes.length !== 0);

    notes
      .slice()
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .forEach((n) => grid.appendChild(tile(n)));
  }

  function tile(note) {
    const t = document.createElement("div");
    t.className = "note-tile";
    t.style.background =
      `linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.05)), radial-gradient(700px 420px at 15% 10%, ${hexToRgba(note.color, 0.45)}, transparent 60%)`;

    const letter = document.createElement("div");
    letter.className = "note-letter";
    letter.textContent = note.label || "?";
    letter.style.background = `linear-gradient(180deg, ${hexToRgba(note.color, 0.35)}, rgba(0,0,0,.18))`;

    const title = document.createElement("div");
    title.className = "note-title";
    title.textContent = note.title || "Ohne Titel";

    const sub = document.createElement("div");
    sub.className = "note-sub";
    sub.textContent = "Tippen zum Öffnen";

    const tint = document.createElement("div");
    tint.className = "tint";

    t.appendChild(letter);
    t.appendChild(title);
    t.appendChild(sub);
    t.appendChild(tint);

    t.addEventListener("click", () => openNote(note.id));
    return t;
  }

  function openNote(noteId, q = "", hitIndex = 0) {
    const url = new URL("note.html", window.location.href);
    url.searchParams.set("profile", profileName);
    url.searchParams.set("id", noteId);

    if (q) {
      url.searchParams.set("q", q);
      url.searchParams.set("hit", String(hitIndex));
    }

    window.location.href = url.toString();
  }

  function bounceHome() {
    window.location.href = new URL("index.html", window.location.href).toString();
  }

  function cryptoId() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function computeNextLabel(existingLabels) {
    const set = new Set((existingLabels || []).filter(Boolean));
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    for (let len = 1; len <= 3; len++) {
      const max = Math.pow(letters.length, len);
      for (let i = 0; i < max; i++) {
        const label = toBase26(i, len, letters);
        if (!set.has(label)) return label;
      }
    }
    return "ZZZ";
  }

  function toBase26(n, len, alphabet) {
    let s = "";
    for (let i = 0; i < len; i++) {
      s = alphabet[n % 26] + s;
      n = Math.floor(n / 26);
    }
    return s;
  }

  function hexToRgba(hex, a) {
    const h = String(hex || "").replace("#", "");
    if (h.length !== 6) return `rgba(42,116,255,${a})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ----------------------------
  // Volltextsuche Funktionen
  // ----------------------------

  function applySearch(queryRaw) {
    const q = String(queryRaw || "").trim();
    lastQuery = q;

    if (!searchBar || !searchCount || !btnPrevHit || !btnNextHit || !btnPrevNote || !btnNextNote || !btnClearSearch) {
      // Falls du Snippets noch nicht eingefügt hast: einfach ignorieren
      return;
    }

    if (!q) {
      hits = [];
      hitCursor = -1;
      searchBar.classList.add("hidden");
      searchCount.textContent = "";
      render(); // zurück zu normal
      return;
    }

    // Treffer bauen
    hits = buildHits(q);
    hitCursor = hits.length ? 0 : -1;

    searchBar.classList.remove("hidden");
    updateSearchUI();

    // Optional: Grid auf Notizen mit Treffern einschränken
    const hitNoteIds = new Set(hits.map(h => h.noteId));
    const filtered = (notesDoc?.notes || []).filter(n => hitNoteIds.has(n.id));
    grid.innerHTML = "";
    empty.classList.toggle("hidden", filtered.length !== 0);

    filtered
      .slice()
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .forEach((n) => grid.appendChild(tileWithSearchPreview(n, q)));
  }

  function clearSearch() {
    if (searchInput) searchInput.value = "";
    applySearch("");
  }

  function buildHits(q) {
    const out = [];
    const notes = notesDoc?.notes || [];
    const needle = q.toLowerCase();

    for (const n of notes) {
      const title = String(n.title || "");
      const content = String(n.content || "");
      const label = String(n.label || "");

      // title hits
      pushAll(out, n, "title", title, needle, q);

      // content hits
      pushAll(out, n, "content", content, needle, q);

      // label hits (meist 1)
      pushAll(out, n, "label", label, needle, q);
    }

    return out;
  }

  function pushAll(out, note, field, text, needle, originalQ) {
    const hay = String(text || "");
    const low = hay.toLowerCase();
    if (!hay || !low.includes(needle)) return;

    let idx = 0;
    while (idx >= 0) {
      idx = low.indexOf(needle, idx);
      if (idx === -1) break;

      out.push({
        noteId: note.id,
        noteTitle: note.title || "Ohne Titel",
        noteLabel: note.label || "?",
        inField: field,
        index: idx,
        preview: makePreview(hay, idx, originalQ.length)
      });

      idx = idx + Math.max(1, needle.length);
    }
  }

  function makePreview(text, hitIndex, hitLen) {
    const start = Math.max(0, hitIndex - 24);
    const end = Math.min(text.length, hitIndex + hitLen + 24);
    const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
    return snippet;
  }

  function updateSearchUI() {
    const total = hits.length;
    const cur = hitCursor >= 0 ? hitCursor + 1 : 0;
    searchCount.textContent = total ? `${cur}/${total}` : `0/0`;

    const disabled = total === 0;
    btnPrevHit.disabled = disabled;
    btnNextHit.disabled = disabled;
    btnPrevNote.disabled = disabled;
    btnNextNote.disabled = disabled;
  }

  function stepHit(dir) {
    if (!hits.length) return;
    const next = (hitCursor + dir + hits.length) % hits.length;
    gotoHit(next);
  }

  function stepNote(dir) {
    if (!hits.length) return;

    const current = hits[hitCursor];
    if (!current) return;

    // nächster Treffer, der in einer anderen Notiz liegt
    let i = hitCursor;
    for (let step = 0; step < hits.length; step++) {
      i = (i + dir + hits.length) % hits.length;
      if (hits[i].noteId !== current.noteId) {
        gotoHit(i);
        return;
      }
    }

    // fallback: normaler Trefferwechsel
    gotoHit((hitCursor + dir + hits.length) % hits.length);
  }

  function gotoHit(index) {
    if (!hits.length) return;
    hitCursor = clamp(index, 0, hits.length - 1);
    updateSearchUI();

    const h = hits[hitCursor];
    if (!h) return;

    // In die Notiz springen, mit Suchparametern
    openNote(h.noteId, lastQuery, hitCursor);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function tileWithSearchPreview(note, q) {
    const t = tile(note);

    // Preview anzeigen, wenn wir Treffer für diese Note haben
    const noteHits = hits.filter(h => h.noteId === note.id);
    if (!noteHits.length) return t;

    const p = document.createElement("div");
    p.className = "note-search-preview";
    p.textContent = noteHits[0].preview || "";

    t.appendChild(p);

    // Klick soll direkt zum ersten Treffer dieser Note springen
    t.addEventListener("click", () => {
      const firstIndex = hits.findIndex(h => h.noteId === note.id);
      if (firstIndex >= 0) {
        gotoHit(firstIndex);
      } else {
        openNote(note.id);
      }
    });

    return t;
  }

})();
