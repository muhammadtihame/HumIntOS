# HumIntOS Frontend

Realtime React dashboard for the HumIntOS cognitive-state backend.

## Run Locally

```bash
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:8000` by default. Override it with:

```bash
VITE_HUMINTOS_API_URL=http://localhost:8000
VITE_HUMINTOS_WS_URL=ws://localhost:8000
```

Backend integration points used by the UI:

- `GET /health`
- `GET /state/current`
- `POST /emotion/analyze`
- `POST /emotion/text`
- `POST /behavior/update`
- `POST /assistant/respond`
- `POST /demo/{focus|stress|overload|normalize}`
- `WS /ws/realtime`
- `WS /ws/hume/evi`
