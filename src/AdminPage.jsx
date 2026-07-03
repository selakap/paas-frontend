import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { decideApproval, listApprovals } from "./api.js";

function QualityGateBadge({ scanStatus, status }) {
  if (scanStatus === "running") return <span className="qg-badge qg-scanning">Scanning...</span>;
  if (scanStatus === "failed") return <span className="qg-badge qg-unknown">Scan failed</span>;
  if (!status) return <span className="qg-badge qg-unknown">No scan</span>;
  if (status === "OK") return <span className="qg-badge qg-ok">Quality Gate: Passed</span>;
  if (status === "ERROR") return <span className="qg-badge qg-error">Quality Gate: Failed</span>;
  return <span className="qg-badge qg-unknown">Quality Gate: {status}</span>;
}

function RequestCard({ request, onDecided }) {
  const [notes, setNotes] = useState("");
  const [decidedBy, setDecidedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const decide = async (status) => {
    setBusy(true);
    setError(null);
    try {
      await decideApproval(request.id, { status, decided_by: decidedBy, notes });
      onDecided();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="approval-card">
      <div className="approval-header">
        <span className="approval-fn">{request.function_name}</span>
        <QualityGateBadge scanStatus={request.sonar_scan_status} status={request.sonar_quality_gate} />
      </div>

      <dl className="approval-meta">
        <dt>Repo</dt>
        <dd>{request.repo_url}</dd>
        <dt>Branch</dt>
        <dd>{request.branch}</dd>
        <dt>Commit</dt>
        <dd className="mono">{request.commit_sha}</dd>
        <dt>Requested by</dt>
        <dd>{request.requested_by || "—"}</dd>
        <dt>Notes</dt>
        <dd>{request.notes || "—"}</dd>
        <dt>Requested at</dt>
        <dd>{new Date(request.created_at).toLocaleString()}</dd>
        {request.sonar_dashboard_url && (
          <>
            <dt>Sonar</dt>
            <dd>
              <a href={request.sonar_dashboard_url} target="_blank" rel="noreferrer">
                View on SonarCloud →
              </a>
            </dd>
          </>
        )}
      </dl>

      {request.status === "pending" ? (
        <>
          <div className="row">
            <label>
              Decided by
              <input value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)} placeholder="your name" />
            </label>
          </div>
          <label>
            Decision notes (optional)
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="reason, conditions, etc." />
          </label>
          {error && <p className="field-error">{error}</p>}
          <div className="approval-actions">
            <button type="button" className="approve-btn" disabled={busy} onClick={() => decide("approved")}>
              Approve
            </button>
            <button type="button" className="reject-btn" disabled={busy} onClick={() => decide("rejected")}>
              Reject
            </button>
          </div>
        </>
      ) : (
        <div className={`decision-banner ${request.status}`}>
          {request.status === "approved" ? "Approved" : "Rejected"}
          {request.decided_by ? ` by ${request.decided_by}` : ""}
          {request.decided_at ? ` on ${new Date(request.decided_at).toLocaleString()}` : ""}
          {request.decision_notes ? ` — ${request.decision_notes}` : ""}
        </div>
      )}
    </div>
  );
}

const STATUS_FILTERS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

export default function AdminPage() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listApprovals(statusFilter);
      setRequests(data.approvals || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    const stillScanning = requests.some((r) => r.sonar_scan_status === "running");
    if (!stillScanning) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests]);

  return (
    <div className="app">
      <header>
        <h1>Admin Review Queue</h1>
        <p>
          Reviewing deploy approval requests. <Link to="/">← Back to console</Link>
        </p>
      </header>

      <div className="tabs">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            className={`tab ${statusFilter === f.id ? "active" : ""}`}
            onClick={() => setStatusFilter(f.id)}
            type="button"
          >
            {f.label}
          </button>
        ))}
        <button className="tab" onClick={load} type="button">
          ↻ Refresh
        </button>
      </div>

      {loading && <p className="hint">Loading...</p>}
      {error && <pre className="box error">{error}</pre>}

      {!loading && requests.length === 0 && <p className="hint">No {statusFilter} requests.</p>}

      <div className="approval-list">
        {requests.map((r) => (
          <RequestCard key={r.id} request={r} onDecided={load} />
        ))}
      </div>
    </div>
  );
}