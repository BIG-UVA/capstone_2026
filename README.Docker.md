# Docker Deployment

FastAPI application serving both the REST API and the static frontend from a single image.

- **Port:** 8000
- **Health check:** `GET /health`
- **Database:** external PostgreSQL, not included in the image

## Environment variables

| Variable | Required | Format |
|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://USER:PASSWORD@HOST:5432/capstone_db` |

No fallback — if unset, the app fails on startup rather than attempting a default connection.

## Database

**Must be restored before the app is useful.** An empty database starts fine and passes the health check, but every page renders empty.

```bash
pg_restore -U postgres -d capstone_db capstone_db.dump
```

## Build and run

```bash
docker compose up --build
```

`compose.yaml` has a placeholder `DATABASE_URL`. For local runs, create `compose.override.yaml` (gitignored) with real values:

```yaml
services:
  app:
    environment:
      - DATABASE_URL=postgresql://postgres:PASSWORD@host.docker.internal:5432/capstone_db
```

Or without Compose:

```bash
docker build -t capstone-api .
docker run -p 8000:8000 -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/capstone_db" capstone-api
```

## Verifying a deployment

1. `GET /health` → `{"ok": true}` — app started and reached the database
2. `GET /api` → list of dataset IDs — database has data
3. `GET /` → dashboard loads

If `/health` fails, it's the database connection. If `/health` passes but `/api` returns an empty list, the dump was never restored.

## Routes

| Path | Purpose |
|---|---|
| `/` | Dashboard (static frontend) |
| `/health` | Health check — use for liveness and readiness probes |
| `/api` | API root |
| `/docs` | OpenAPI docs |
| `/datasets/`, `/de_results/`, `/genes/`, `/expression/`, `/pathways/`, `/consensus/` | Data endpoints |

## Notes

- `DATABASE_URL` should be injected as a Secret, never baked into the image.
- Stateless — any number of replicas can run against the same database.
- Tag images by version (`v1`, `v2`), not `latest`.