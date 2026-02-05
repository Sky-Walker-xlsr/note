const GH_API = "https://api.github.com";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function ghHeaders() {
  const token = mustEnv("GITHUB_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "notes-app-vercel-api"
  };
}

function repoInfo() {
  return {
    owner: mustEnv("GITHUB_OWNER"),
    repo: mustEnv("GITHUB_REPO"),
    branch: process.env.GITHUB_BRANCH || "main"
  };
}

function b64encode(str) {
  return Buffer.from(str, "utf8").toString("base64");
}
function b64decode(b64) {
  return Buffer.from(b64, "base64").toString("utf8");
}

async function ghFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...ghHeaders(),
      ...(opts.headers || {})
    }
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  return { res, text, json };
}

async function getContent(filePath) {
  const { owner, repo, branch } = repoInfo();
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`;

  const { res, json } = await ghFetch(url);

  if (res.status === 404) return { exists: false };
  if (!res.ok) {
    throw new Error(`GitHub GET contents failed (${res.status}): ${JSON.stringify(json || {})}`);
  }

  const content = json?.content ? b64decode(json.content) : "";
  return {
    exists: true,
    sha: json.sha,
    content,
    raw: json
  };
}

async function putContent(filePath, contentStr, commitMessage, sha = undefined) {
  const { owner, repo, branch } = repoInfo();
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;

  const body = {
    message: commitMessage,
    content: b64encode(contentStr),
    branch
  };
  if (sha) body.sha = sha;

  const { res, json } = await ghFetch(url, {
    method: "PUT",
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`GitHub PUT contents failed (${res.status}): ${JSON.stringify(json || {})}`);
  }

  return json;
}

async function listDir(dirPath) {
  const { owner, repo, branch } = repoInfo();
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(dirPath)}?ref=${encodeURIComponent(branch)}`;

  const { res, json } = await ghFetch(url);

  if (res.status === 404) return { exists: false, items: [] };
  if (!res.ok) {
    throw new Error(`GitHub LIST dir failed (${res.status}): ${JSON.stringify(json || {})}`);
  }

  const items = Array.isArray(json) ? json : [];
  return { exists: true, items };
}

module.exports = {
  getContent,
  putContent,
  listDir
};
