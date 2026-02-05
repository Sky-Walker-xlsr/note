function safeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

function nowIso() {
  return new Date().toISOString();
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

/**
 * Vercel kann req.body bereits liefern (geparst).
 * Falls nicht vorhanden, lesen wir den Stream.
 */
async function readBody(req) {
  // 1) Wenn Vercel / Middleware bereits geparst hat
  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      try { return JSON.parse(req.body); } catch { return {}; }
    }
    if (req.body && typeof req.body === "object") {
      return req.body;
    }
    return {};
  }

  // 2) Fallback: Stream lesen
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

module.exports = {
  safeName,
  nowIso,
  json,
  readBody
};
