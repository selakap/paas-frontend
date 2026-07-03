import { useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { buildImage, deployCron, deployApi, fetchBranches, fetchCommits, createApprovalRequest } from "./api.js";
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
        Submit a specific commit for review. An admin must approve it (see the{" "}
        <Link to="/admin">Admin Review Queue</Link>) before it can be built.
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
          Function name
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
          Subdir (optional)
          <input
            placeholder="leave blank if Dockerfile is at repo root"
            value={form.subdir}
            onChange={update("subdir")}
          />
        </label>
        <button type="submit" disabled={loading}>
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
      <h2>2. Deploy as Cron Job</h2>
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
      <h2>3. Deploy behind API Gateway</h2>
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

const MAIN_TABS = [
  { id: "approval", label: "1. Request Approval" },
  { id: "build", label: "2. Build & Push" },
  { id: "deploy", label: "3. Deploy Resources" },
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
        <p>
          Talks to your local FastAPI backend at http://localhost:8000 · <Link to="/admin">Admin Review Queue →</Link>
        </p>
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
