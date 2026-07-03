const BASE_URL = "http://localhost:8000";

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = data?.detail || res.statusText || "Request failed";
    throw new Error(detail);
  }

  return data;
}

async function getJson(path, params) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE_URL}${path}?${query}`);

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = data?.detail || res.statusText || "Request failed";
    throw new Error(detail);
  }

  return data;
}

export function fetchBranches(repo_url) {
  return getJson("/repo/branches", { repo_url });
}

export function fetchCommits(repo_url, branch) {
  return getJson("/repo/commits", { repo_url, branch });
}

export function buildImage({ repo_url, branch, commit, function_name, subdir }) {
  return postJson("/build", {
    repo_url,
    branch,
    commit: commit || null,
    function_name,
    subdir: subdir || null,
  });
}

export function deployCron({ function_name, image_uri, schedule_expression, memory_size, timeout_seconds }) {
  return postJson("/deploy/cron", {
    function_name,
    image_uri,
    schedule_expression,
    memory_size: Number(memory_size),
    timeout_seconds: Number(timeout_seconds),
  });
}

export function deployApi({ function_name, image_uri, memory_size, timeout_seconds }) {
  return postJson("/deploy/api", {
    function_name,
    image_uri,
    memory_size: Number(memory_size),
    timeout_seconds: Number(timeout_seconds),
  });
}