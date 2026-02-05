const { listDir, getContent } = require("./_lib/github");
const { json, safeName } = require("./_lib/utils");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return json(res, 405, { error: "Nur GET erlaubt." });
    }

    const dir = "data/profiles";
    const listing = await listDir(dir);

    if (!listing.exists) {
      return json(res, 200, { profiles: [] });
    }

    // Nur *.json Dateien
    const files = listing.items
      .filter((x) => x.type === "file" && String(x.name || "").endsWith(".json"))
      .map((x) => `${dir}/${x.name}`);

    const profiles = [];
    for (const fp of files) {
      const c = await getContent(fp);
      if (!c.exists) continue;

      let p = null;
      try { p = JSON.parse(c.content); } catch { p = null; }
      if (!p) continue;

      const name = safeName(p.name || fp.split("/").pop().replace(".json", ""));
      profiles.push({
        name,
        displayName: p.displayName || p.name || name,
        createdAt: p.createdAt || null,
        updatedAt: p.updatedAt || null
      });
    }

    // Sort: neueste zuerst, sonst alphabetisch
    profiles.sort((a, b) => {
      const au = a.updatedAt || "";
      const bu = b.updatedAt || "";
      if (au && bu && au !== bu) return bu.localeCompare(au);
      return (a.displayName || a.name).localeCompare(b.displayName || b.name);
    });

    return json(res, 200, { profiles });
  } catch (e) {
    return json(res, 500, { error: "Fehler beim Laden der Profile.", details: String(e.message || e) });
  }
};
