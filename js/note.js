/* note.js - note.html logic (API-backed, commit-sparend + edit mode + search jump)
   - Speichert beim Zurück-Klick (wenn Änderungen vorhanden)
   - Zusätzlich alle 20 Sek, aber nur falls dirty
   - Success-Flash 600ms, Shake bei Fehler
   - Edit-Mode: Label/Titel/Farbe editierbar
   - Volltextsuche: wenn q/hit vorhanden, Treffer-Navigation
*/

(function () {
  const params = new URLSearchParams(location.search);
  const profileName = params.get("profile");
  const noteId = params.get("id");
  const searchQ = String(params.get("q") || "").trim();
  const searchHitGlobal = parseInt(params.get("hit") || "0", 10);

  const btnBack = document.getElementById("btnBack");
  const btnDelete = document.getElementById("btnDelete");

  const labelTitle = document.getElementById("noteLabelTitle");
  const meta = document.getElementById("noteMeta");

  const titleInput = document.getElementById("noteTitle");
  const colorInput = document.getElementById("noteColor");
  const textArea = document.getElementById("noteText");
  const editorShell = document.getElementById("editorShell");
  const saveState = document.getElementById("saveState");

  // Edit UI (neu)
  const btnEdit = document.getElementById("btnEdit");
  const labelInput = document.getElementById("noteLabel");
  const editHint = document.getElementById("editHint");

  // Suche UI (neu, optional)
  const searchNav = document.getElementById("searchNav");
  const searchNavText = document.getElementById("searchNavText");
  const btnPrevMatch = document.getElementById("btnPrevMatch");
  const btnNextMatch = document.getElementById("btnNextMatch");
  const btnPrevNote = document.getElementById("btnPrevNote");
  const btnNextNote = document.getElementById("btnNextNote");

  let notesDoc = null;
  let note = null;

  let dirty = false;
  let saving = false;
  let intervalId = null;

  // Suche innerhalb dieser Notiz
  let localMatches = []; // indices in content
  let localCursor = -1;
  let globalHitIndex = isFinite(searchHitGlobal) ? searchHitGlobal : 0;

  init().catch((e) => {
    alert(String(e.message || e));
    bounceApp();
  });

  async function init() {
    if (!profileName || !noteId) return bounceApp();
    if (!Store.isUnlocked(profileName)) return bounceApp();

    notesDoc = await Store.loadNotes(profileName, true);
    note = notesDoc.notes.find(n => n.id === noteId);
    if (!note) return bounceApp();

    renderNote();
    bindUI();

    // alle 20 Sekunden speichern, aber nur falls dirty
    intervalId = setInterval(() => {
      if (!dirty) return;
      doSave("Auto-Save").catch(() => {});
    }, 20000);

    // Wenn wir aus der Suche kommen, Navigation aktivieren
    if (searchQ) {
      setupSearchNav(searchQ);
      // Auf den passenden Treffer springen
      jumpToGlobalHit(globalHitIndex);
    }
  }

  function bindUI() {
    const markDirty = () => {
      dirty = true;
      if (!saving) saveState.textContent = "Ungespeichert";
    };

    // Änderungen markieren
    titleInput.addEventListener("input", markDirty);
    colorInput.addEventListener("input", () => {
      markDirty();
      applyTint(colorInput.value);
    });
    textArea.addEventListener("input", markDirty);
    if (labelInput) labelInput.addEventListener("input", markDirty);

    // Edit Mode Toggle
    if (btnEdit) {
      btnEdit.addEventListener("click", () => {
        const nowEditing = titleInput.disabled; // wenn disabled, dann jetzt aktivieren
        setEditMode(nowEditing);
      });
    }

    // Zurück: zuerst speichern (falls dirty), dann navigieren
    btnBack.addEventListener("click", async () => {
      try {
        if (dirty) await doSave("Speichern");
      } finally {
        cleanup();
        bounceApp();
      }
    });

    // Löschen
    btnDelete.addEventListener("click", async () => {
      const ok = confirm("Notiz wirklich löschen?");
      if (!ok) return;

      try {
        saving = true;
        setSavingState("Löscht...", false);

        notesDoc = await Store.loadNotes(profileName, true);
        notesDoc.notes = notesDoc.notes.filter(n => n.id !== noteId);

        await Store.saveNotes(profileName, notesDoc);

        dirty = false;
        setSavingState("Gelöscht", true);
      } catch (e) {
        setSavingState("Löschen fehlgeschlagen", false);
        shakeEditor();
        alert(String(e.message || e));
        return;
      } finally {
        saving = false;
      }

      cleanup();
      bounceApp();
    });

    // Best effort Save bei Tab hidden
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "hidden") return;
      if (!dirty || saving) return;
      doSave("Speichern").catch(() => {});
    });
  }

  function setEditMode(on) {
    // on=true -> editierbar
    if (labelInput) labelInput.disabled = !on;
    titleInput.disabled = !on;
    colorInput.disabled = !on;

    if (editHint) {
      editHint.classList.toggle("hidden", !on);
    }

    // Wenn Edit ausgeschaltet wird, nicht automatisch speichern.
    // Speichern passiert via Zurück oder Auto 20s.
    if (!on) {
      // Optional: Label-Titel oben aktualisieren
      updateHeaderTitle();
    }
  }

  async function doSave(reason) {
    if (saving) return;
    saving = true;

    try {
      setSavingState(reason ? `${reason}...` : "Speichert...", false);

      notesDoc = await Store.loadNotes(profileName, true);
      const idx = notesDoc.notes.findIndex(n => n.id === noteId);
      if (idx === -1) {
        setSavingState("Notiz nicht gefunden", false);
        return;
      }

      const updated = {
        ...notesDoc.notes[idx],
        label: normaliseLabel(labelInput ? labelInput.value : notesDoc.notes[idx].label),
        title: titleInput.value.trim() || "Ohne Titel",
        color: colorInput.value,
        content: textArea.value,
        updatedAt: Store.nowIso()
      };

      notesDoc.notes[idx] = updated;

      const serverDoc = await Store.saveNotes(profileName, notesDoc);
      notesDoc = serverDoc;
      note = serverDoc.notes.find(n => n.id === noteId) || updated;

      dirty = false;
      updateHeaderTitle();
      meta.textContent = "Letztes Update: " + new Date(note.updatedAt || note.createdAt).toLocaleString();

      setSavingState("Gespeichert", true);
      flashSuccess();
    } catch (e) {
      setSavingState("Speichern fehlgeschlagen", false);
      shakeEditor();
      throw e;
    } finally {
      saving = false;
    }
  }

  function renderNote() {
    if (labelInput) labelInput.value = note.label || "";
    titleInput.value = note.title || "";
    colorInput.value = note.color || "#2a74ff";
    textArea.value = note.content || "";

    updateHeaderTitle();
    meta.textContent = "Letztes Update: " + new Date(note.updatedAt || note.createdAt).toLocaleString();
    applyTint(note.color);

    // Start: nicht editierbar, nur über Stift
    setEditMode(false);

    ensureTrailingEmptyLine();
    setTimeout(() => {
      textArea.focus();
      const end = textArea.value.length;
      textArea.setSelectionRange(end, end);

      dirty = false;
      saving = false;
      setSavingState("Bereit", true);
    }, 60);
  }

  function updateHeaderTitle() {
    const lbl = normaliseLabel(labelInput ? labelInput.value : note.label);
    const ttl = titleInput.value.trim() || "Notiz";
    labelTitle.textContent = `${lbl || "?"} – ${ttl}`;
  }

  function normaliseLabel(v) {
    const s = String(v || "").trim().toUpperCase();
    // max 3 Zeichen, A-Z/0-9 erlaubt
    const cleaned = s.replace(/[^A-Z0-9]/g, "").slice(0, 3);
    return cleaned;
  }

  function ensureTrailingEmptyLine() {
    let v = textArea.value || "";
    if (!v.endsWith("\n")) v += "\n";
    if (!v.endsWith("\n\n")) v += "\n";
    textArea.value = v;
  }

  function applyTint(hex) {
    const rgba = hexToRgba(hex, 0.22);
    editorShell.style.background =
      `linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.06)), radial-gradient(800px 420px at 20% 0%, ${rgba}, transparent 60%)`;
  }

  function bounceApp() {
    const url = new URL("app.html", window.location.href);
    if (profileName) url.searchParams.set("profile", profileName);
    window.location.href = url.toString();
  }

  function cleanup() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function flashSuccess() {
    editorShell.classList.add("success-flash");
    setTimeout(() => editorShell.classList.remove("success-flash"), 600);
  }

  function shakeEditor() {
    editorShell.classList.add("shake");
    setTimeout(() => editorShell.classList.remove("shake"), 380);
  }

  function setSavingState(text, ok) {
    saveState.textContent = text;
    saveState.classList.toggle("ok", !!ok);
    saveState.classList.toggle("bad", !ok && (text.includes("fehlgeschlagen") || text.includes("Löschen")));
  }

  function hexToRgba(hex, a) {
    const h = String(hex || "").replace("#", "");
    if (h.length !== 6) return `rgba(42,116,255,${a})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // --------------------------------
  // Suche in der Notiz (Wort/Notiz)
  // --------------------------------

  function setupSearchNav(q) {
    if (!searchNav || !searchNavText || !btnPrevMatch || !btnNextMatch || !btnPrevNote || !btnNextNote) return;

    searchNav.classList.remove("hidden");

    const needle = q.toLowerCase();
    localMatches = findAll(textArea.value.toLowerCase(), needle);
    localCursor = localMatches.length ? 0 : -1;

    updateSearchNavText();

    btnPrevMatch.addEventListener("click", () => stepLocalMatch(-1));
    btnNextMatch.addEventListener("click", () => stepLocalMatch(+1));
    btnPrevNote.addEventListener("click", () => stepGlobalNote(-1));
    btnNextNote.addEventListener("click", () => stepGlobalNote(+1));
  }

  function updateSearchNavText() {
    if (!searchNavText) return;
    const m = localMatches.length;
    const c = localCursor >= 0 ? localCursor + 1 : 0;
    searchNavText.textContent = `${c}/${m}`;
  }

  function findAll(hay, needle) {
    const out = [];
    if (!needle) return out;
    let idx = 0;
    while (idx >= 0) {
      idx = hay.indexOf(needle, idx);
      if (idx === -1) break;
      out.push(idx);
      idx += Math.max(1, needle.length);
    }
    return out;
  }

  function stepLocalMatch(dir) {
    if (!searchQ) return;
    const needle = searchQ.toLowerCase();
    localMatches = findAll(textArea.value.toLowerCase(), needle);

    if (!localMatches.length) {
      localCursor = -1;
      updateSearchNavText();
      return;
    }

    localCursor = (localCursor + dir + localMatches.length) % localMatches.length;
    updateSearchNavText();
    selectMatchAt(localMatches[localCursor], needle.length);
  }

  function selectMatchAt(index, len) {
    try {
      textArea.focus();
      textArea.setSelectionRange(index, index + len);

      // grobes Scrollen: Zeilen vor dem Treffer zählen
      const before = textArea.value.slice(0, index);
      const lines = before.split("\n").length;
      const lineHeight = 20; // passt gut genug fürs Scroll-Feeling
      textArea.scrollTop = Math.max(0, (lines - 3) * lineHeight);
    } catch {
      // ignore
    }
  }

  function jumpToGlobalHit(globalIndex) {
    if (!searchQ) return;

    // globalIndex ist ein Cursor aus app.js. Wir müssen den dazugehörigen Treffer dieser Notiz finden.
    // Wir approximieren: lokaler Cursor = erster Treffer, und dann kann der User weiter navigieren.
    const needle = searchQ.toLowerCase();
    localMatches = findAll(textArea.value.toLowerCase(), needle);

    if (!localMatches.length) {
      localCursor = -1;
      updateSearchNavText();
      return;
    }

    // Start: erster Treffer
    localCursor = 0;
    updateSearchNavText();
    selectMatchAt(localMatches[0], needle.length);
  }

  async function stepGlobalNote(dir) {
    if (!searchQ) return;

    // Wir machen das wie app.js: wir suchen global die nächste Notiz mit Treffer und springen mit q/hit weiter.
    const q = searchQ.trim();
    notesDoc = await Store.loadNotes(profileName, true);
    const hits = buildGlobalHits(notesDoc.notes, q);
    if (!hits.length) return;

    // cursor anhand URL-Param "hit" bestimmen
    let cur = isFinite(globalHitIndex) ? globalHitIndex : 0;
    cur = clamp(cur, 0, hits.length - 1);

    const current = hits[cur];
    if (!current) return;

    let i = cur;
    for (let step = 0; step < hits.length; step++) {
      i = (i + dir + hits.length) % hits.length;
      if (hits[i].noteId !== current.noteId) {
        // springen
        const url = new URL("note.html", window.location.href);
        url.searchParams.set("profile", profileName);
        url.searchParams.set("id", hits[i].noteId);
        url.searchParams.set("q", q);
        url.searchParams.set("hit", String(i));
        window.location.href = url.toString();
        return;
      }
    }
  }

  function buildGlobalHits(notes, q) {
    const needle = q.toLowerCase();
    const out = [];
    for (const n of notes) {
      const title = String(n.title || "").toLowerCase();
      const content = String(n.content || "").toLowerCase();
      const label = String(n.label || "").toLowerCase();

      pushAll(out, n, title, needle);
      pushAll(out, n, content, needle);
      pushAll(out, n, label, needle);
    }
    return out;

    function pushAll(arr, noteObj, text, ndl) {
      if (!text.includes(ndl)) return;
      let idx = 0;
      while (idx >= 0) {
        idx = text.indexOf(ndl, idx);
        if (idx === -1) break;
        arr.push({ noteId: noteObj.id });
        idx += Math.max(1, ndl.length);
      }
    }
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

})();
