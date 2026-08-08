# divas-tragonas-api

Fastify + TypeScript + MongoDB API. Deployed via Docker to a home server.

## Local dev

```bash
# 1. Install deps (generates pnpm-lock.yaml on first run)
cd app && pnpm install

# 2. Copy and edit env
cp .env.example .env   # run from repo root

# 3. Start (tsx watches for changes)
pnpm dev
```

The server starts at `http://localhost:3000`.  
You'll need a local MongoDB instance — either `mongod` or `docker run -d -p 27017:27017 mongo:7`.

## Deploy to server

```bash
# On your Mac (first time only — make executable)
chmod +x deploy.sh

# On the server, via SSH
ssh user@mini
cd /path/to/repo
bash deploy.sh
```

`deploy.sh` does: `git pull` → `docker compose build api` → `docker compose up -d --force-recreate api` → prune old images → tail logs.

**First deploy:**
```bash
cp .env.example .env   # then fill in real values
docker compose up -d   # starts both api and db
```

## Public HTTPS exposure (Tailscale Funnel)

The frontend on Vercel (`https://rpg-map-viewer.vercel.app`) is served over HTTPS, so it
can only connect to the API via HTTPS/WSS. Tailscale Funnel terminates TLS on the server
and proxies to port 3000.

**This is live.** The API is currently exposed at:

```
https://macmini.tailc27b56.ts.net
```

Use it from the frontend as:

- REST base: `https://macmini.tailc27b56.ts.net`
- Sync WebSocket: `wss://macmini.tailc27b56.ts.net/sync?role=<dm|client>&key=<SYNC_KEY>`

CORS is `origin: '*'`, so the Vercel origin is accepted without extra config.

### How it was set up (reproduce on the server)

```bash
# 1. Set the shared key in .env, then redeploy so the container picks it up
#    (generate a fresh one with: openssl rand -hex 16)
echo 'SYNC_KEY=<your-key>' >> .env
bash deploy.sh

# 2. Enable Funnel on port 3000 (needs root; persists across reboots).
#    Run once to avoid sudo next time: sudo tailscale set --operator=$USER
sudo tailscale funnel --bg 3000

# 3. Find the public URL
tailscale funnel status
```

If Funnel isn't enabled for the tailnet yet, step 2 prints a link to the admin
console — open it and approve the `funnel` node attribute (one click), then re-run.

To turn public exposure back off: `sudo tailscale funnel --bg off`.

The `SYNC_KEY` value itself lives in `.env` on the server (not committed). Clients that
connect to `/sync` with a missing or wrong key are closed with code `4401`. If `SYNC_KEY`
is empty or unset, `/sync` stays open (LAN-only usage) — but note that once a key is set,
**every** client (including LAN/iPad DM clients) must send `?key=`.

## API: saved game sessions (`/sessions`)

Every `/sessions` route requires the back-office admin token:
`Authorization: Bearer <token>` from `POST /auth/login` (`{ "password": "<ADMIN_PASSWORD>" }`).
A missing or invalid token returns `401`.

| Method | Path | Body | Success |
|---|---|---|---|
| `GET` | `/sessions` | — | `200` — list of `{ id, name, createdAt, updatedAt, sizeBytes }`, newest first, **without** `data` |
| `GET` | `/sessions/:id` | — | `200` — the full session, `data` included |
| `POST` | `/sessions` | `{ name, data }` | `201` — the created session |
| `PUT` | `/sessions/:id` | `{ name?, data? }` | `200` — the updated session (at least one field required) |
| `DELETE` | `/sessions/:id` | — | `204` — no content |

Errors: `400` invalid body, `401` missing/invalid token, `404` unknown id,
`413` payload over `MAX_UPLOAD_BYTES`.

`data` is an **opaque JSON blob** — the whole serialized game state. The API never
validates or inspects its contents, so the frontend can change its shape freely;
it only checks that `data` is an object. `sizeBytes` is the byte length of the
serialized `data`, computed at write time so listing stays cheap.

Because saved state carries base64 images (and even video) and routinely runs to
tens of MB, `data` is **not stored inline** in the Mongo document — it lives in
GridFS, which is what lets a single session exceed Mongo's 16MB BSON document
limit. The document keeps only `name`, `sizeBytes` and an internal file pointer.
The `POST`/`PUT` body limit is raised to `MAX_UPLOAD_BYTES` (80MB by default);
anything larger is rejected with `413`.

CORS allows `GET, POST, PUT, DELETE, OPTIONS` from any origin, so the Vercel
frontend can call these directly.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `production`, or `test` |
| `PORT` | no | `3000` | HTTP port the app binds to |
| `MONGO_URL` | **yes** | — | Full MongoDB connection string |
| `LOG_LEVEL` | no | `info` | `fatal/error/warn/info/debug/trace/silent` |
| `MAX_UPLOAD_BYTES` | no | `83886080` (80MB) | Max body size for saving a game session (`POST`/`PUT /sessions`) |
| `SYNC_KEY` | no | — | Shared key for `/sync` (`?key=`). Empty = open access |
| `MONGO_USER` | docker-compose only | — | Used to construct `MONGO_URL` in compose |
| `MONGO_PASSWORD` | docker-compose only | — | Used to construct `MONGO_URL` in compose |
| `MONGO_DB` | docker-compose only | — | Used to construct `MONGO_URL` in compose |

The app validates all required vars at startup and exits with an error if any are missing or invalid.

## Project structure

```
.
├── .github/workflows/ci.yml    # lint + test on PRs
├── app/
│   ├── src/
│   │   ├── server.ts           # Fastify bootstrap, graceful shutdown
│   │   ├── config/
│   │   │   ├── env.ts          # zod-validated env
│   │   │   └── db.ts           # mongoose connection + retry
│   │   ├── modules/
│   │   │   ├── health/         # GET /health, GET /health/ready
│   │   │   ├── auth/           # POST /auth/login -> admin JWT
│   │   │   ├── enemies/        # CRUD /enemies
│   │   │   ├── sessions/       # CRUD /sessions (saved games, blob in GridFS)
│   │   │   └── sync/           # WebSocket /sync (DM <-> clients relay)
│   │   ├── plugins/            # cors, helmet, jwt
│   │   ├── lib/                # shared utilities
│   │   └── types/              # shared TS types
│   ├── tests/                  # vitest; *.integration.test.ts needs a real Mongo
│   │   └── health.test.ts
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml
├── deploy.sh
└── .env.example
```

## Adding a new module

1. Create `app/src/modules/<name>/` with three files:
   - `<name>.schema.ts` — Zod types for request/response
   - `<name>.service.ts` — business logic
   - `<name>.routes.ts` — Fastify plugin exporting a `FastifyPluginAsync`

2. Register the routes in `app/src/server.ts`:
   ```ts
   import { myRoutes } from './modules/my-module/my-module.routes';
   // inside buildApp():
   app.register(myRoutes, { prefix: '/api/v1' });
   ```

3. Add a test in `app/tests/<name>.test.ts` following the health test pattern.
