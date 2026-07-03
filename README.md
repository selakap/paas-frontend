# PaaS POC Frontend

Minimal React (Vite) UI for the 3 backend operations:
1. Build & push to ECR
2. Deploy as a cron job (Lambda + EventBridge)
3. Deploy behind API Gateway (Lambda + HTTP API)

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

## How it works

- **Build card**: submits repo URL/branch/function name to `/build`. On
  success, the returned `image_uri` auto-fills into the Cron and API cards
  below (you can still overwrite it manually).
- **Cron card**: submits to `/deploy/cron`. This can take 1-3 minutes (CDK
  deploy) — the button shows a "Deploying..." state and is disabled while
  the request is in flight.
- **API card**: submits to `/deploy/api`, same behavior.
- Every card shows the raw JSON response (green) or error detail (red)
  underneath its form after submitting.

This is a deliberately minimal POC UI — no routing, no state management
library, no auth, no persistence across page reloads.
