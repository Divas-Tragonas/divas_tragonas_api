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

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `production`, or `test` |
| `PORT` | no | `3000` | HTTP port the app binds to |
| `MONGO_URL` | **yes** | — | Full MongoDB connection string |
| `LOG_LEVEL` | no | `info` | `fatal/error/warn/info/debug/trace/silent` |
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
│   │   │   └── health/         # GET /health, GET /health/ready
│   │   ├── plugins/            # cors, helmet
│   │   ├── lib/                # shared utilities
│   │   └── types/              # shared TS types
│   ├── tests/
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
