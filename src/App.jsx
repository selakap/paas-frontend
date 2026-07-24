import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import {
  buildImage,
  deployCron,
  deployApi,
  fetchBranches,
  fetchCommits,
  createApprovalRequest,
  findApprovalForCommit,
} from "./api.js";
import AdminPage from "./AdminPage.jsx";

function ResultBox({ result, error }) {
  if (error) {
    return <pre className="box error">{error}</pre>;
  }
  if (result) {
    return <pre className="box success">{JSON.stringify(result, null, 2)}</pre>;
  }
  return null;
}

function ApprovalGateBadge({ checking, approval }) {
  if (checking) return <span className="qg-badge qg-scanning">Checking approval...</span>;
  if (!approval) {
    return <span className="qg-badge qg-error">Not approved — submit for approval first</span>;
  }
  if (approval.status === "approved") {
    return <span className="qg-badge qg-ok">Approved{approval.decided_by ? ` by ${approval.decided_by}` : ""}</span>;
  }
  if (approval.status === "pending") {
    return <span className="qg-badge qg-error">Not approved — pending review</span>;
  }
  return <span className="qg-badge qg-error">Not approved — rejected</span>;
}

function EnvVarsEditor({ rows, onChange }) {
  const updateRow = (index, field) => (e) => {
    const next = rows.slice();
    next[index] = { ...next[index], [field]: e.target.value };
    onChange(next);
  };

  const addRow = () => onChange([...rows, { key: "", value: "" }]);

  const removeRow = (index) => () => {
    const next = rows.slice();
    next.splice(index, 1);
    onChange(next.length ? next : [{ key: "", value: "" }]);
  };

  return (
    <div className="env-editor">
      <span className="env-label">Environment variables</span>
      {rows.map((row, i) => (
        <div className="env-row" key={i}>
          <input
            placeholder="KEY"
            value={row.key}
            onChange={updateRow(i, "key")}
          />
          <input
            placeholder="value"
            value={row.value}
            onChange={updateRow(i, "value")}
          />
          <button type="button" className="env-remove" onClick={removeRow(i)} aria-label="Remove variable">
            ×
          </button>
        </div>
      ))}
      <button type="button" className="env-add" onClick={addRow}>
        + Add variable
      </button>
    </div>
  );
}

function envRowsToObject(rows) {
  const obj = {};
  for (const { key, value } of rows) {
    if (key.trim()) obj[key.trim()] = value;
  }
  return obj;
}

function RequestApprovalCard() {
  const [form, setForm] = useState({
    repo_url: "",
    branch: "main",
    commit: "",
    function_name: "",
    requested_by: "",
    notes: "",
  });
  const [branches, setBranches] = useState([]);
  const [commits, setCommits] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [branchError, setBranchError] = useState(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const loadBranches = async () => {
    if (!form.repo_url) return;
    setLoadingBranches(true);
    setBranchError(null);
    setBranches([]);
    setCommits([]);
    try {
      const data = await fetchBranches(form.repo_url);
      setBranches(data.branches || []);
      const defaultBranch =
        data.branches.find((b) => b === "main") ||
        data.branches.find((b) => b === "master") ||
        data.branches[0] ||
        "";
      setForm((f) => ({ ...f, branch: defaultBranch, commit: "" }));
      if (defaultBranch) await loadCommits(form.repo_url, defaultBranch);
    } catch (err) {
      setBranchError(err.message);
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadCommits = async (repoUrl, branch) => {
    setLoadingCommits(true);
    setCommits([]);
    try {
      const data = await fetchCommits(repoUrl, branch);
      setCommits(data.commits || []);
    } catch (err) {
      setBranchError(err.message);
    } finally {
      setLoadingCommits(false);
    }
  };

  const onBranchChange = async (e) => {
    const branch = e.target.value;
    setForm((f) => ({ ...f, branch, commit: "" }));
    if (branch) await loadCommits(form.repo_url, branch);
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const data = await createApprovalRequest(form);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card">
      <h2>Request Deploy Approval</h2>
      <p className="card-subtitle">
        Submit a specific commit for review. An admin must approve it before it can be built.
      </p>
      <form onSubmit={submit}>
        <label>
          Repo URL
          <div className="inline-field">
            <input
              required
              placeholder="https://github.com/org/repo.git"
              value={form.repo_url}
              onChange={update("repo_url")}
            />
            <button type="button" onClick={loadBranches} disabled={!form.repo_url || loadingBranches}>
              {loadingBranches ? "Loading..." : "Load Branches"}
            </button>
          </div>
        </label>

        {branchError && <p className="field-error">{branchError}</p>}

        <label>
          Branch
          {branches.length > 0 ? (
            <select value={form.branch} onChange={onBranchChange}>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          ) : (
            <input value={form.branch} onChange={update("branch")} placeholder="main" />
          )}
        </label>

        <label>
          Commit {loadingCommits && <span className="hint">(loading...)</span>}
          <select value={form.commit} onChange={update("commit")} disabled={commits.length === 0}>
            <option value="">Latest on branch (HEAD)</option>
            {commits.map((c) => (
              <option key={c.sha} value={c.sha}>
                {c.short_sha} — {c.message.slice(0, 60)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Sonar project name
          <input
            required
            placeholder="my-fn"
            value={form.function_name}
            onChange={update("function_name")}
          />
        </label>
        <label>
          Requested by (optional)
          <input placeholder="your name" value={form.requested_by} onChange={update("requested_by")} />
        </label>
        <label>
          Notes for the reviewer (optional)
          <input placeholder="what this is for, anything to know" value={form.notes} onChange={update("notes")} />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Submit for Approval"}
        </button>
      </form>
      <ResultBox result={result} error={error} />
      {result && result.sonar_scan_status === "running" && (
        <p className="hint">
          Sonar scan is running in the background — check the <Link to="/admin">Admin Review Queue</Link> in a
          minute or two to see the result.
        </p>
      )}
    </section>
  );
}

function BuildCard({ onImageUri }) {
  const [form, setForm] = useState({
    repo_url: "",
    branch: "main",
    commit: "",
    function_name: "",
    subdir: "",
  });
  const [branches, setBranches] = useState([]);
  const [commits, setCommits] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [branchError, setBranchError] = useState(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [approval, setApproval] = useState(null);
  const [checkingApproval, setCheckingApproval] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const loadBranches = async () => {
    if (!form.repo_url) return;
    setLoadingBranches(true);
    setBranchError(null);
    setBranches([]);
    setCommits([]);
    try {
      const data = await fetchBranches(form.repo_url);
      setBranches(data.branches || []);
      const defaultBranch =
        data.branches.find((b) => b === "main") ||
        data.branches.find((b) => b === "master") ||
        data.branches[0] ||
        "";
      setForm((f) => ({ ...f, branch: defaultBranch, commit: "" }));
      if (defaultBranch) await loadCommits(form.repo_url, defaultBranch);
    } catch (err) {
      setBranchError(err.message);
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadCommits = async (repoUrl, branch) => {
    setLoadingCommits(true);
    setCommits([]);
    try {
      const data = await fetchCommits(repoUrl, branch);
      setCommits(data.commits || []);
    } catch (err) {
      setBranchError(err.message);
    } finally {
      setLoadingCommits(false);
    }
  };

  const onBranchChange = async (e) => {
    const branch = e.target.value;
    setForm((f) => ({ ...f, branch, commit: "" }));
    if (branch) await loadCommits(form.repo_url, branch);
  };

  // Commits are listed newest-first, so the first entry is the branch HEAD —
  // used to resolve the effective commit when the user leaves it on "Latest".
  const effectiveCommit = form.commit || (commits[0] && commits[0].sha) || "";

  useEffect(() => {
    let cancelled = false;
    if (!form.repo_url || !effectiveCommit) {
      setApproval(null);
      return undefined;
    }
    setCheckingApproval(true);
    findApprovalForCommit(form.repo_url, effectiveCommit)
      .then((record) => {
        if (!cancelled) setApproval(record);
      })
      .catch(() => {
        if (!cancelled) setApproval(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingApproval(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.repo_url, effectiveCommit]);

  const isApproved = approval && approval.status === "approved";

  const submit = async (e) => {
    e.preventDefault();
    if (!isApproved) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const data = await buildImage(form);
      setResult(data);
      if (data.image_uri) onImageUri(data.image_uri);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card">
      <h2>1. Build &amp; Push to ECR</h2>
      <form onSubmit={submit}>
        <label>
          Repo URL
          <div className="inline-field">
            <input
              required
              placeholder="https://github.com/org/repo.git"
              value={form.repo_url}
              onChange={update("repo_url")}
            />
            <button type="button" onClick={loadBranches} disabled={!form.repo_url || loadingBranches}>
              {loadingBranches ? "Loading..." : "Load Branches"}
            </button>
          </div>
        </label>

        {branchError && <p className="field-error">{branchError}</p>}

        <label>
          Branch
          {branches.length > 0 ? (
            <select value={form.branch} onChange={onBranchChange}>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          ) : (
            <input value={form.branch} onChange={update("branch")} placeholder="main" />
          )}
        </label>

        <label>
          Commit {loadingCommits && <span className="hint">(loading...)</span>}
          <select
            value={form.commit}
            onChange={update("commit")}
            disabled={commits.length === 0}
          >
            <option value="">Latest on branch (HEAD)</option>
            {commits.map((c) => (
              <option key={c.sha} value={c.sha}>
                {c.short_sha} — {c.message.slice(0, 60)}
              </option>
            ))}
          </select>
        </label>

        {form.repo_url && effectiveCommit && (
          <div className="approval-gate">
            <ApprovalGateBadge checking={checkingApproval} approval={approval} />
            {!checkingApproval && !isApproved && (
              <span className="hint">
                Use the "Request Approval" tab to submit this commit for review, then wait for an admin to
                approve it before building.
              </span>
            )}
          </div>
        )}

        <label>
          Image name
          <input
            required
            placeholder="my-fn"
            value={form.function_name}
            onChange={update("function_name")}
          />
        </label>
        <label>
          Subdir (optional)
          <input
            placeholder="leave blank if Dockerfile is at repo root"
            value={form.subdir}
            onChange={update("subdir")}
          />
        </label>
        <button type="submit" disabled={loading || checkingApproval || !isApproved}>
          {loading ? "Building..." : "Build & Push"}
        </button>
      </form>
      <ResultBox result={result} error={error} />
    </section>
  );
}

function CronCard({ imageUri }) {
  const [form, setForm] = useState({
    function_name: "",
    image_uri: "",
    schedule_expression: "rate(5 minutes)",
    memory_size: 512,
    timeout_seconds: 60,
  });
  const [envRows, setEnvRows] = useState([{ key: "", value: "" }]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const data = await deployCron({
        ...form,
        image_uri: form.image_uri || imageUri,
        environment: envRowsToObject(envRows),
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card">
      <h2>Deploy as Cron Job</h2>
      <form onSubmit={submit}>
        <label>
          Function name
          <input
            required
            placeholder="my-fn"
            value={form.function_name}
            onChange={update("function_name")}
          />
        </label>
        <label>
          Image URI
          <input
            required
            placeholder="<account>.dkr.ecr.<region>.amazonaws.com/repo:tag"
            value={form.image_uri || imageUri}
            onChange={update("image_uri")}
          />
        </label>
        <label>
          Schedule expression
          <input
            required
            placeholder="rate(5 minutes) or cron(0 12 * * ? *)"
            value={form.schedule_expression}
            onChange={update("schedule_expression")}
          />
        </label>
        <div className="row">
          <label>
            Memory (MB)
            <input type="number" value={form.memory_size} onChange={update("memory_size")} />
          </label>
          <label>
            Timeout (sec)
            <input type="number" value={form.timeout_seconds} onChange={update("timeout_seconds")} />
          </label>
        </div>
        <EnvVarsEditor rows={envRows} onChange={setEnvRows} />
        <button type="submit" disabled={loading}>
          {loading ? "Deploying (can take a minute)..." : "Deploy Cron"}
        </button>
      </form>
      <ResultBox result={result} error={error} />
    </section>
  );
}

function ApiCard({ imageUri }) {
  const [form, setForm] = useState({
    function_name: "",
    image_uri: "",
    memory_size: 512,
    timeout_seconds: 30,
  });
  const [envRows, setEnvRows] = useState([{ key: "", value: "" }]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const data = await deployApi({
        ...form,
        image_uri: form.image_uri || imageUri,
        environment: envRowsToObject(envRows),
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card">
      <h2>Deploy behind API Gateway</h2>
      <form onSubmit={submit}>
        <label>
          Function name
          <input
            required
            placeholder="my-fn"
            value={form.function_name}
            onChange={update("function_name")}
          />
        </label>
        <label>
          Image URI
          <input
            required
            placeholder="<account>.dkr.ecr.<region>.amazonaws.com/repo:tag"
            value={form.image_uri || imageUri}
            onChange={update("image_uri")}
          />
        </label>
        <div className="row">
          <label>
            Memory (MB)
            <input type="number" value={form.memory_size} onChange={update("memory_size")} />
          </label>
          <label>
            Timeout (sec)
            <input type="number" value={form.timeout_seconds} onChange={update("timeout_seconds")} />
          </label>
        </div>
        <EnvVarsEditor rows={envRows} onChange={setEnvRows} />
        <button type="submit" disabled={loading}>
          {loading ? "Deploying (can take a minute)..." : "Deploy API"}
        </button>
      </form>
      <ResultBox result={result} error={error} />
    </section>
  );
}

function HistoryStatusBadge({ status }) {
  if (status === "success" || status === "approved") {
    return <span className="qg-badge qg-ok">{status === "approved" ? "Approved" : "Success"}</span>;
  }
  if (status === "failed" || status === "rejected") {
    return <span className="qg-badge qg-error">{status === "rejected" ? "Rejected" : "Failed"}</span>;
  }
  return <span className="qg-badge qg-unknown">{status}</span>;
}

// Mock data — the backend doesn't persist build/deploy events yet, only
// approvals. This is placeholder content until that history endpoint exists.
const MOCK_HISTORY = [
  {
    id: 1,
    action: "Deploy (API Gateway)",
    function_name: "orders-webhook",
    repo_url: "https://github.com/acme/orders-service.git",
    branch: "main",
    commit_sha: "a1b2c3d",
    status: "success",
    performed_by: "J. Alvarez",
    timestamp: "2026-07-22T14:32:00",
  },
  {
    id: 2,
    action: "Build & Push",
    function_name: "orders-webhook",
    repo_url: "https://github.com/acme/orders-service.git",
    branch: "main",
    commit_sha: "a1b2c3d",
    status: "success",
    performed_by: "J. Alvarez",
    timestamp: "2026-07-22T14:20:00",
  },
  {
    id: 3,
    action: "Request Approval",
    function_name: "invoice-sync",
    repo_url: "https://github.com/acme/invoice-sync.git",
    branch: "release/2.3",
    commit_sha: "9f8e7d6",
    status: "approved",
    performed_by: "R. Kim",
    timestamp: "2026-07-21T09:05:00",
  },
  {
    id: 4,
    action: "Deploy (Cron Job)",
    function_name: "nightly-cleanup",
    repo_url: "https://github.com/acme/ops-jobs.git",
    branch: "main",
    commit_sha: "44cba21",
    status: "failed",
    performed_by: "R. Kim",
    timestamp: "2026-07-20T23:10:00",
  },
  {
    id: 5,
    action: "Request Approval",
    function_name: "invoice-sync",
    repo_url: "https://github.com/acme/invoice-sync.git",
    branch: "release/2.3",
    commit_sha: "77ac1e2",
    status: "rejected",
    performed_by: "R. Kim",
    timestamp: "2026-07-19T16:47:00",
  },
  {
    id: 6,
    action: "Build & Push",
    function_name: "payments-gateway",
    repo_url: "https://github.com/acme/payments.git",
    branch: "main",
    commit_sha: "b0aa931",
    status: "success",
    performed_by: "M. Singh",
    timestamp: "2026-07-18T11:02:00",
  },
];

function HistoryCard({ entry }) {
  return (
    <div className="approval-card">
      <div className="approval-header">
        <span className="approval-fn">{entry.function_name}</span>
        <HistoryStatusBadge status={entry.status} />
      </div>
      <dl className="approval-meta">
        <dt>Action</dt>
        <dd>{entry.action}</dd>
        <dt>Repo</dt>
        <dd>{entry.repo_url}</dd>
        <dt>Branch</dt>
        <dd>{entry.branch}</dd>
        <dt>Commit</dt>
        <dd className="mono">{entry.commit_sha}</dd>
        <dt>By</dt>
        <dd>{entry.performed_by}</dd>
        <dt>When</dt>
        <dd>{new Date(entry.timestamp).toLocaleString()}</dd>
      </dl>
    </div>
  );
}

function HistoryTab() {
  return (
    <section className="card">
      <h2>Your Activity History</h2>
      <p className="card-subtitle">
        A read-only log of your own approval requests, builds, and deploys.
      </p>
      <div className="approval-list">
        {MOCK_HISTORY.map((entry) => (
          <HistoryCard key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}

const MAIN_TABS = [
  { id: "approval", label: "Request Approval" },
  { id: "build", label: "Build & Push" },
  { id: "deploy", label: "Deploy Resources" },
  { id: "history", label: "History" },
];

const DEPLOY_SUB_TABS = [
  { id: "cron", label: "Cron Job" },
  { id: "api", label: "API Gateway" },
];

function Console() {
  const [imageUri, setImageUri] = useState("");
  const [activeTab, setActiveTab] = useState("approval");
  const [deploySubTab, setDeploySubTab] = useState("cron");

  return (
    <div className="app">
      <header>
        <h1>PaaS POC Console</h1>
      </header>

      <div className="tabs">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main>
        <div className={activeTab === "approval" ? "" : "tab-hidden"}>
          <RequestApprovalCard />
        </div>

        <div className={activeTab === "build" ? "" : "tab-hidden"}>
          <BuildCard onImageUri={setImageUri} />
        </div>

        <div className={activeTab === "deploy" ? "" : "tab-hidden"}>
          <div className="subtabs">
            {DEPLOY_SUB_TABS.map((tab) => (
              <button
                key={tab.id}
                className={`subtab ${deploySubTab === tab.id ? "active" : ""}`}
                onClick={() => setDeploySubTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className={deploySubTab === "cron" ? "" : "tab-hidden"}>
            <CronCard imageUri={imageUri} />
          </div>
          <div className={deploySubTab === "api" ? "" : "tab-hidden"}>
            <ApiCard imageUri={imageUri} />
          </div>
        </div>

        <div className={activeTab === "history" ? "" : "tab-hidden"}>
          <HistoryTab />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Console />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}
