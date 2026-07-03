import { useState } from "react";
import { buildImage, deployCron, deployApi } from "./api.js";

function ResultBox({ result, error }) {
  if (error) {
    return <pre className="box error">{error}</pre>;
  }
  if (result) {
    return <pre className="box success">{JSON.stringify(result, null, 2)}</pre>;
  }
  return null;
}

function BuildCard({ onImageUri }) {
  const [form, setForm] = useState({
    repo_url: "",
    branch: "main",
    function_name: "",
    subdir: "",
  });
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
          <input
            required
            placeholder="https://github.com/org/repo.git"
            value={form.repo_url}
            onChange={update("repo_url")}
          />
        </label>
        <label>
          Branch
          <input value={form.branch} onChange={update("branch")} />
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
      const data = await deployCron(form);
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
      const data = await deployApi(form);
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
        <button type="submit" disabled={loading}>
          {loading ? "Deploying (can take a minute)..." : "Deploy API"}
        </button>
      </form>
      <ResultBox result={result} error={error} />
    </section>
  );
}

export default function App() {
  const [imageUri, setImageUri] = useState("");

  return (
    <div className="app">
      <header>
        <h1>PaaS POC Console</h1>
        <p>Talks to your local FastAPI backend at http://localhost:8000</p>
      </header>
      <main>
        <BuildCard onImageUri={setImageUri} />
        <CronCard imageUri={imageUri} />
        <ApiCard imageUri={imageUri} />
      </main>
    </div>
  );
}
