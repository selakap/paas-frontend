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

export function createApprovalRequest({ repo_url, branch, commit, function_name, requested_by, notes }) {
  return postJson("/approvals", {
    repo_url,
    branch,
    commit: commit || null,
    function_name,
    requested_by: requested_by || null,
    notes: notes || null,
  });
}

export async function listApprovals(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`${BASE_URL}/approvals${query}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.detail || res.statusText || "Request failed");
  }
  return data;
}

export function decideApproval(requestId, { status, decided_by, notes }) {
  return postJson(`/approvals/${requestId}/decision`, {
    status,
    decided_by: decided_by || null,
    notes: notes || null,
  });
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

export function deployCron({ function_name, image_uri, schedule_expression, memory_size, timeout_seconds, environment }) {
  return postJson("/deploy/cron", {
    function_name,
    image_uri,
    schedule_expression,
    memory_size: Number(memory_size),
    timeout_seconds: Number(timeout_seconds),
    environment: environment || {},
  });
}

export function deployApi({ function_name, image_uri, memory_size, timeout_seconds, environment }) {
  return postJson("/deploy/api", {
    function_name,
    image_uri,
    memory_size: Number(memory_size),
    timeout_seconds: Number(timeout_seconds),
    environment: environment || {},
  });
}
