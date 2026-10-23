# Game Reels API

NestJS (Fastify adapter) + Prisma/MySQL implementation of [BACKEND.md](BACKEND.md).

## Quick start

### Without Docker or MySQL

```bash
npm install
npm run dev:local               # local MySQL + migrations + seed + API on :3000
```

This runs a real MySQL 8.4 that `mysql-memory-server` downloads on the first run (a few minutes) and reuses afterwards. When `../frontend` exists, it also builds the frontend's games, seeds them, and serves them at `/cdn/games/`, so the local app can play them: start the app in `frontend/` with `EXPO_PUBLIC_API_URL` unset (see BACKEND.md §11, "Connecting the frontend app"). The database is fresh on every run (the app signs in again by itself), and Ctrl+C stops everything. No `.env` is needed: local defaults are used for anything it doesn't set. Set `LOCAL_DB_PORT` to pin the database port (default: a free port), and `LOCAL_DB_VERBOSE=1` to see MySQL logs.

### With Docker

```bash
cp .env.example .env            # then set real secrets
docker compose up -d            # mysql + redis
npm install                     # also runs `prisma generate`
npm run db:deploy               # apply migrations (use db:migrate when changing the schema)
npm run db:seed                 # the five prototype games, published at 1.0.0
npm run dev                     # http://localhost:3000, docs at /docs
```

## Endpoints

| Method | Path | Auth |
|---|---|---|
| `POST` | `/v1/players/guest` | public |
| `GET` | `/v1/games?tag=&cursor=&limit=` | bearer |
| `GET` | `/v1/games/:id` | bearer |
| `GET` | `/v1/feed?cursor=&limit=` | bearer |
| `POST` | `/v1/plays` | bearer |
| `POST` | `/v1/events` | bearer |
| `GET` | `/health`, `/health/ready` | public |

Send `X-App-Version` to hide games whose `minAppVersion` is newer than the build. If the header is missing, no version filtering is applied (handy for `/docs`). Every error has the shape `{ "error": { code, message, requestId, details? } }`.

## Layout

```
src/
  shared/          zod contracts shared with the app (zod only; can move to packages/shared)
  config/          env schema; the API refuses to boot on bad config
  common/          auth (JWT), guards, decorators, error filter, storage provider
  prisma/          PrismaService
  modules/
    players/       guest create/resume + token
    games/         catalogue + manifests
    feed/          FeedStrategy interface, ShuffledFeedStrategy, signed cursors
    plays/         score submission, ScoreValidator
    scores/        BestScore read/write (shared by games, feed, plays)
    events/        batched analytics ingestion
    health/
prisma/            schema, migrations, seed
scripts/           publish-game, set-game-version
test/              e2e (Supertest against the full app)
```

## Publishing games

```bash
npm run publish-game -- path/to/games/stack --dry-run   # size check only
npm run publish-game -- path/to/games/stack --promote   # upload + register + make current
npm run set-game-version -- stack 1.1.0                 # promote later, or roll back
```

The game directory contains `game.json` (`id, name, description, tags, controls, version, avgRoundSeconds, maxScorePerSec`, plus optional `sdkVersion` and `minAppVersion`) and `dist/` with `index.html` and `thumb.webp`. Bundles over 500 KB gzipped are rejected. Versions are immutable.

## Tests

```bash
npm test                        # unit
npm run test:e2e                # e2e; starts MySQL via Testcontainers (needs Docker)
TEST_DATABASE_URL=mysql://... npm run test:e2e   # or reuse a database (all its tables are DROPPED)
```

## Docker

```bash
docker build -t game-reels-api .                          # runtime image
docker build --target migrate -t game-reels-migrate .     # release step: prisma migrate deploy
```
