# PaaS POC Frontend

Minimal React (Vite) UI for a FastAPI backend that turns a git repo into a
running Lambda function. It covers the full flow: request approval for a
commit → have an admin approve/reject it (with an automated SonarCloud
quality gate) → build the image and push it to ECR → deploy it either as a
scheduled cron job or behind an API Gateway HTTP endpoint.

Talks to your FastAPI backend at `http://localhost:8000` (hardcoded in
`src/api.js` — change `BASE_URL` there if your backend runs elsewhere).

## Prerequisites

- Node.js (you already have this, from setting up the CDK CLI)
- Your FastAPI backend running locally on port 8000

## Run it

```bash
cd paas-frontend
npm install
npm run dev
```

Vite will print a local URL, typically `http://localhost:5173`. Open that in
your browser.

Other scripts:

```bash
npm run build    # production build, output in dist/
npm run preview  # serve the production build locally
```

## IMPORTANT: enable CORS on the backend first

Browsers block cross-origin requests by default. Since the frontend
(`localhost:5173`) and backend (`localhost:8000`) are different origins,
you need to add CORS middleware to your FastAPI app or every request from
this UI will fail with a CORS error in the browser console.

Add this to `main.py` in your backend, right after `app = FastAPI(...)`:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Restart uvicorn after adding this.

## Architecture

Plain Vite + React, no state management library, no build-time routing
config beyond `react-router-dom`. Two pages, both rendered client-side:

```
src/
├── main.jsx        # entry point — mounts <App /> inside <BrowserRouter>
├── App.jsx          # "/" — the main console (3 tabs) + tab/subtab state
├── AdminPage.jsx     # "/admin" — approval review queue
├── api.js            # all backend calls (fetch wrappers), BASE_URL lives here
├── App.css            # all styling (cards, tabs, badges, forms)
└── index.css          # global/base styles
```

- **Routing**: `react-router-dom` with two routes — `/` (`Console`) and
  `/admin` (`AdminPage`). No nested routes, no route params.
- **State**: local `useState`/`useEffect` only, scoped per-component. Nothing
  is persisted across a page reload — refreshing the browser resets all
  forms and results.
- **Data fetching**: every network call goes through the thin wrapper
  functions in `src/api.js` (`postJson` / `getJson`), which throw an `Error`
  with the backend's `detail` message on non-2xx responses. Components call
  these and store the result/error in local state, then render it with the
  shared `ResultBox` component (`App.jsx`) as pretty-printed JSON (green) or
  the error message (red).
- **No auth**: the admin queue at `/admin` has no login — anyone with the
  URL can approve/reject. This is a POC; add auth before using this for
  anything real.

## Pages & components

### Console (`/`) — `App.jsx`

Three main tabs (`MAIN_TABS`), switched with local `activeTab` state (no
routing, just conditional `tab-hidden` class):

1. **Request Approval** (`RequestApprovalCard`)
   - Fields: Repo URL, Branch (with a "Load Branches" button that calls
     `GET /repo/branches` and auto-picks `main`/`master`/first branch),
     Commit (populated via `GET /repo/commits` once a branch is chosen —
     defaults to "Latest on branch (HEAD)"), **Sonar project name**,
     Requested by (optional), Notes for the reviewer (optional).
   - Submits to `POST /approvals` (`createApprovalRequest`). The backend
     kicks off a SonarCloud scan in the background; if the response comes
     back with `sonar_scan_status: "running"`, the UI shows a hint pointing
     to the Admin Review Queue to check back in a minute or two.
2. **Build & Push** (`BuildCard`)
   - Same Repo URL / Branch / Commit pattern as above, plus **Image name**
     and an optional **Subdir** (for repos where the Dockerfile isn't at
     the repo root).
   - Submits to `POST /build` (`buildImage`). On success, the returned
     `image_uri` is lifted up via the `onImageUri` callback and auto-fills
     the Image URI field in both deploy cards below (still editable).
3. **Deploy Resources** (`CronCard` / `ApiCard`), with a subtab switch
   (`DEPLOY_SUB_TABS`: Cron Job / API Gateway):
   - **Cron Job**: Function name, Image URI (pre-filled from the Build tab),
     Schedule expression (EventBridge rate/cron syntax, e.g.
     `rate(5 minutes)` or `cron(0 12 * * ? *)`), Memory (MB), Timeout (sec),
     and a dynamic **environment variables** editor (`EnvVarsEditor` — add/
     remove KEY=value rows, blank keys are dropped on submit). Submits to
     `POST /deploy/cron` (`deployCron`). This can take 1–3 minutes (CDK
     deploy under the hood) — the button shows "Deploying (can take a
     minute)..." and is disabled while in flight.
   - **API Gateway**: same fields minus the schedule expression. Submits to
     `POST /deploy/api` (`deployApi`), same slow-deploy UX.

Every card shows the raw JSON response (green) or error detail (red)
underneath its form after submitting, via `ResultBox`.

### Admin Review Queue (`/admin`) — `AdminPage.jsx`

- Three status filter tabs — Pending / Approved / Rejected — plus a manual
  **↻ Refresh** button. Switching tabs or clicking Refresh calls
  `GET /approvals?status=<filter>` (`listApprovals`). There is no
  auto-polling — refresh is manual only.
- Each request renders as a card (`RequestCard`) showing: Sonar project
  (function) name, a **quality gate badge** (`QualityGateBadge` —
  "Scanning...", "Scan failed", "No scan", "Quality Gate: Passed/Failed", or
  the raw gate status), repo URL, branch, commit SHA, requester, notes,
  requested-at timestamp, and — once available — a link to the SonarCloud
  dashboard for that scan.
  - **Pending** requests show a form (Decided by, optional decision notes)
    and **Approve** / **Reject** buttons, which call
    `POST /approvals/{id}/decision` (`decideApproval`) and then reload the
    list.
  - **Approved/Rejected** requests instead show a decision banner with who
    decided, when, and any notes.

## Backend API surface used by this UI (`src/api.js`)

| Function | Method & path | Purpose |
| --- | --- | --- |
| `fetchBranches(repo_url)` | `GET /repo/branches` | List branches for a repo URL |
| `fetchCommits(repo_url, branch)` | `GET /repo/commits` | List commits on a branch |
| `createApprovalRequest({...})` | `POST /approvals` | Submit a commit for review (kicks off Sonar scan) |
| `listApprovals(status)` | `GET /approvals?status=` | List approval requests, optionally filtered by status |
| `decideApproval(requestId, {...})` | `POST /approvals/{id}/decision` | Approve or reject a pending request |
| `buildImage({...})` | `POST /build` | Build the Docker image from a repo/branch/commit and push to ECR |
| `deployCron({...})` | `POST /deploy/cron` | Deploy the image as a Lambda on an EventBridge schedule |
| `deployApi({...})` | `POST /deploy/api` | Deploy the image as a Lambda behind an API Gateway HTTP API |

All calls assume `BASE_URL = "http://localhost:8000"` (see `src/api.js`).
Errors from any endpoint are expected as JSON with a `detail` field, which
is what gets shown in the red error box.

## Tech stack

- [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/) (`@vitejs/plugin-react`)
- [react-router-dom v6](https://reactrouter.com/) for the two routes
- Plain CSS (`App.css` / `index.css`) — no CSS framework or CSS-in-JS
- No test suite, no TypeScript, no linting config beyond Vite defaults

## Known limitations (it's a POC)

- No auth on `/admin` — anyone with the URL can approve/reject deploys.
- No persistence — all form state and results are lost on page reload.
- `BASE_URL` is hardcoded (not an env var) — edit `src/api.js` to point at
  a different backend.
- No auto-refresh anywhere — the admin queue must be refreshed manually
  after triggering a Sonar scan or making a decision elsewhere.
- No pagination on the approvals list.
