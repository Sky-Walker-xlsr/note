/* profiles.js - index.html logic */

(function () {
  const elGrid = document.getElementById("profileGrid");
  const elEmpty = document.getElementById("emptyHint");

  const pinDialog = document.getElementById("pinDialog");
  const pinForName = document.getElementById("pinForName");
  const pinInput = document.getElementById("pinInput");
  const rememberPin = document.getElementById("rememberPin");
  const pinError = document.getElementById("pinError");

  const createDialog = document.getElementById("createProfileDialog");
  const newProfileName = document.getElementById("newProfileName");
  const newProfilePin = document.getElementById("newProfilePin");
  const createError = document.getElementById("createError");

  const btnAdd = document.getElementById("fabAddProfile");
  const btnPinOk = document.getElementById("pinOk");
  const btnPinCancel = document.getElementById("pinCancel");
  const btnCreateOk = document.getElementById("createOk");
  const btnCreateCancel = document.getElementById("createCancel");

  const btnImportProfile = document.getElementById("btnImportProfile");
  const btnExportAll = document.getElementById("btnExportAll");

  let selectedProfile = null;

  ensureDemoBootstrap();
  render();

  btnAdd.addEventListener("click", () => {
    createError.classList.add("hidden");
    newProfileName.value = "";
    newProfilePin.value = "";
    createDialog.showModal();
    setTimeout(() => newProfileName.focus(), 50);
  });

  btnCreateCancel.addEventListener("click", () => createDialog.close());

  btnCreateOk.addEventListener("click", () => {
    const rawName = newProfileName.value;
    const rawPin = newProfilePin.value;

    const name = Store.safeName(rawName);
    if (!name) return showCreateError("Profilname ist leer oder ungültig.");
    if (!rawPin || rawPin.trim().length < 3) return showCreateError("PIN muss mindestens 3 Zeichen haben.");
    if (Store.getProfile(name)) return showCreateError("Profil existiert bereits.");

    const profile = {
      name,
      displayName: rawName.trim(),
      pinHash: Store.fnv1a(rawPin.trim()),
      createdAt: Store.nowIso(),
      updatedAt: Store.nowIso()
    };

    Store.saveProfile(profile);
    Store.saveNotes(name, { profile: name, updatedAt: Store.nowIso(), notes: [] });

    createDialog.close();
    render();
  });

  function showCreateError(msg) {
    createError.textContent = msg;
    createError.classList.remove("hidden");
  }

  btnPinCancel.addEventListener("click", () => pinDialog.close());

  btnPinOk.addEventListener("click", () => {
    if (!selectedProfile) return;
    const prof = Store.getProfile(selectedProfile);
    if (!prof) return;

    const entered = String(pinInput.value || "").trim();
    const hash = Store.fnv1a(entered);

    if (hash !== prof.pinHash) {
      pinError.classList.remove("hidden");
      return;
    }

    pinError.classList.add("hidden");
    Store.setUnlocked(selectedProfile, rememberPin.checked, 21);
    pinDialog.close();
    goApp(selectedProfile);
  });

  btnImportProfile.addEventListener("click", async () => {
    const input = makeFileInput();
    input.click();
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const obj = await Store.readFileAsJson(f);
        if (!obj || !obj.name || !obj.pinHash) return alert("Ungültige Profil-JSON.");
        const name = Store.safeName(obj.name);
        const profile = {
          name,
          displayName: obj.displayName || obj.name,
          pinHash: obj.pinHash,
          createdAt: obj.createdAt || Store.nowIso(),
          updatedAt: Store.nowIso()
        };
        Store.saveProfile(profile);
        if (!Store.getNotes(name)) {
          Store.saveNotes(name, { profile: name, updatedAt: Store.nowIso(), notes: [] });
        }
        render();
      } catch {
        alert("Import fehlgeschlagen.");
      }
    };
  });

  btnExportAll.addEventListener("click", () => {
    const idx = Store.getProfilesIndex();
    const bundle = {
      exportedAt: Store.nowIso(),
      profiles: idx.map(n => Store.getProfile(n)).filter(Boolean),
      notes: idx.map(n => Store.getNotes(n)).filter(Boolean)
    };
    Store.downloadJson("all_profiles_and_notes.json", bundle);
  });

  function render() {
    elGrid.innerHTML = "";
    const names = Store.getProfilesIndex();
    elEmpty.classList.toggle("hidden", names.length !== 0);

    names.forEach((name) => {
      const p = Store.getProfile(name);
      if (!p) return;

      const card = document.createElement("div");
      card.className = "profile-card glass";

      const h = document.createElement("h3");
      h.className = "pname";
      h.textContent = p.displayName || p.name;

      const meta = document.createElement("p");
      meta.className = "pmeta";
      meta.textContent = "Tippen zum Öffnen";

      card.appendChild(h);
      card.appendChild(meta);

      if (Store.isUnlocked(name)) {
        const badge = document.createElement("div");
        badge.className = "badge";
        badge.textContent = "cached";
        card.appendChild(badge);
      }

      card.addEventListener("click", () => onSelectProfile(name));
      elGrid.appendChild(card);
    });
  }

  function onSelectProfile(name) {
    selectedProfile = name;

    if (Store.isUnlocked(name)) {
      goApp(name);
      return;
    }

    const prof = Store.getProfile(name);
    pinForName.textContent = prof?.displayName || name;
    pinInput.value = "";
    rememberPin.checked = true;
    pinError.classList.add("hidden");
    pinDialog.showModal();
    setTimeout(() => pinInput.focus(), 50);
  }

  function goApp(profileName) {
    const url = new URL("app.html", window.location.href);
    url.searchParams.set("profile", profileName);
    window.location.href = url.toString();
  }

  function makeFileInput() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => setTimeout(() => input.remove(), 0));
    return input;
  }

  function ensureDemoBootstrap() {
    // If empty, create a demo profile + note as starter
    if (Store.getProfilesIndex().length > 0) return;

    const demo = {
      name: "demo",
      displayName: "Demo",
      pinHash: Store.fnv1a("1234"),
      createdAt: Store.nowIso(),
      updatedAt: Store.nowIso()
    };
    Store.saveProfile(demo);

    const notesDoc = {
      profile: "demo",
      updatedAt: Store.nowIso(),
      notes: [
        {
          id: cryptoId(),
          label: "A",
          title: "Willkommen",
          color: "#2a74ff",
          content: "Das ist eine Demo-Notiz.\n\nTippe drauf und schreib weiter.",
          createdAt: Store.nowIso(),
          updatedAt: Store.nowIso()
        }
      ]
    };
    Store.saveNotes("demo", notesDoc);
  }

  function cryptoId() {
    // fallback if crypto not available
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }
})();
