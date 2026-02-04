/* note.js - note.html logic */

(function () {
  const params = new URLSearchParams(location.search);
  const profileName = params.get("profile");
  const noteId = params.get("id");

  const btnBack = document.getElementById("btnBack");
  const btnDelete = document.getElementById("btnDelete");

  const labelTitle = document.getElementById("noteLabelTitle");
  const meta = document.getElementById("noteMeta");

  const titleInput = document.getElementById("noteTitle");
  const colorInput = document.getElementById("noteColor");
  const textArea = document.getElementById("noteText");
  const editorShell = document.getElementById("editorShell");
  const saveState = document.getElementById("saveState");

  if (!profileName || !noteId) return bounceApp();
  if (!Store.isUnlocked(profileName)) return bounceApp();

  let notesDoc = Store.getNotes(profileName);
  let note = notesDoc.notes.find(n => n.id === noteId);
  if (!note) return bounceApp();

  renderNote();

  btnBack.addEventListener("click", () => bounceApp());

  btnDelete.addEventListener("click", () => {
    const ok = confirm("Notiz wirklich löschen?");
    if (!ok) return;

    notesDoc = Store.getNotes(profileName);
    notesDoc.notes = notesDoc.notes.filter(n => n.id !== noteId);
    Store.saveNotes(profileName, notesDoc);
    bounceApp();
  });

  let saveTimer = null;
  const scheduleSave = () => {
    saveState.textContent = "Speichert...";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      notesDoc = Store.getNotes(profileName);
      const idx = notesDoc.notes.findIndex(n => n.id === noteId);
      if (idx === -1) return;

      const updated = {
        ...notesDoc.notes[idx],
        title: titleInput.value.trim() || "Ohne Titel",
        color: colorInput.value,
        content: textArea.value,
        updatedAt: Store.nowIso()
      };

      notesDoc.notes[idx] = updated;
      Store.saveNotes(profileName, notesDoc);
      note = updated;

      saveState.textContent = "Gespeichert";
      meta.textContent = "Letztes Update: " + new Date(updated.updatedAt).toLocaleString();
      applyTint(updated.color);
    }, 220);
  };

  titleInput.addEventListener("input", scheduleSave);
  colorInput.addEventListener("input", scheduleSave);
  textArea.addEventListener("input", scheduleSave);

  function renderNote() {
    labelTitle.textContent = `${note.label} – ${note.title || "Notiz"}`;
    titleInput.value = note.title || "";
    colorInput.value = note.color || "#2a74ff";
    textArea.value = note.content || "";

    meta.textContent = "Letztes Update: " + new Date(note.updatedAt || note.createdAt).toLocaleString();
    applyTint(note.color);

    // Requirement: beim Öffnen direkt in neuer leerer Zeile beginnen
    // -> wir sorgen dafür, dass am Ende eine leere Zeile existiert und setzen den Cursor ans Ende
    ensureTrailingEmptyLine();
    setTimeout(() => {
      textArea.focus();
      const end = textArea.value.length;
      textArea.setSelectionRange(end, end);
    }, 60);
  }

  function ensureTrailingEmptyLine() {
    let v = textArea.value || "";
    if (!v.endsWith("\n")) v += "\n";
    // zweite leere Zeile, damit wirklich "neu" wirkt
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

  function hexToRgba(hex, a) {
    const h = String(hex || "").replace("#", "");
    if (h.length !== 6) return `rgba(42,116,255,${a})`;
    const r = parseInt(h.slice(0,2), 16);
    const g = parseInt(h.slice(2,4), 16);
    const b = parseInt(h.slice(4,6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
})();
