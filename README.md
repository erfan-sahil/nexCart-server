# NexCart Backend

REST API for the NexCart multi-vendor e-commerce platform. It powers the customer storefront, admin dashboard, and vendor dashboard frontends.

## Stack

- **Runtime:** Node.js 20+
- **Framework:** Express 5 + TypeScript
- **Database:** MongoDB 7 (replica set)
- **Cache / rate limiting:** Redis 7 (optional; falls back to in-memory when disabled)
- **Auth:** JWT access tokens + HTTP-only refresh cookie; Google OAuth
- **Payments:** SSLCommerz (sandbox supported)
- **Media:** Local filesystem or Cloudinary

## Prerequisites

- Node.js **≥ 20**
- MongoDB and Redis (see [Docker](#docker) or use your own instances)
- Copy env template: `cp .env.example .env`

## Quick start (local)

### 1. Infrastructure

Start MongoDB and Redis:

```bash
docker compose up -d mongodb redis
```

Wait until both services are healthy (`docker compose ps`).

### 2. API

```bash
npm install
npm run dev
```

The API listens on **http://localhost:4000** (see `PORT` in `.env`).

- Root: `GET /` — API info
- Liveness: `GET /api/health`
- Readiness: `GET /api/health/ready` (checks DB and Redis when required)

### 3. Seed data (optional)

```bash
npm run seed:admin      # platform admin user (see seed script output)
npm run seed:all        # categories, stores, products, site content + migrations
```

Individual seeds: `seed:categories`, `seed:stores`, `seed:products`, `seed:site`.

## Scripts

| Script                            | Description                           |
| --------------------------------- | ------------------------------------- |
| `npm run dev`                     | Dev server with nodemon               |
| `npm run build`                   | Compile TypeScript to `dist/`         |
| `npm start`                       | Run compiled `dist/server.js`         |
| `npm run typecheck`               | TypeScript without emit               |
| `npm run lint` / `lint:fix`       | ESLint                                |
| `npm run format` / `format:check` | Prettier                              |
| `npm run check`                   | lint + format + typecheck             |
| `npm run seed:*`                  | Database seeding (see `package.json`) |
| `npm run migrate:*`               | One-off migrations                    |

## Environment

Key variables (full list in `.env.example`):

| Variable                      | Purpose                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| `PORT`                        | API port (default `4000`)                                         |
| `MONGODB_URI`                 | Mongo connection string                                           |
| `REDIS_URL` / `REDIS_ENABLED` | Cache and distributed rate limits                                 |
| `JWT_*`                       | Access/refresh secrets and TTLs                                   |
| `CORS_ORIGIN`                 | Comma-separated allowed origins (storefront + dashboards)         |
| `PUBLIC_API_URL`              | Public base URL for links and uploads                             |
| `CLIENT_APP_URL`              | Customer app URL (OAuth redirects, emails)                        |
| `GOOGLE_*`                    | Google OAuth client and callback                                  |
| `IMAGE_STORAGE_DRIVER`        | `local` or `cloudinary`                                           |
| `SSLCOMMERZ_*`                | Payment gateway; `SSLCOMMERZ_MOCK=true` for local without gateway |

Default CORS includes:

- `http://localhost:3000` — customer app
- `http://localhost:5174` — admin
- `http://localhost:5175` — vendor

## Docker

**Dependencies only** (typical local dev):

```bash
docker compose up -d mongodb redis
```

**Full stack** (API + MongoDB + Redis):

```bash
docker compose up -d
```

`docker-compose.override.yml` mounts `src/` and runs `npm run dev` in the API container for live reload.

Uploaded files are persisted in `./uploads` when using local image storage.

## API surface (overview)

All JSON routes are under **`/api`**. Major areas:

| Area                       | Path prefix                                                                   | Consumers           |
| -------------------------- | ----------------------------------------------------------------------------- | ------------------- |
| Health                     | `/api/health`                                                                 | Ops                 |
| Auth & users               | `/api/auth`, `/api/users`                                                     | All apps            |
| Catalog                    | `/api/categories`, `/api/catalog`, `/api/products`, `/api/attributes`         | Storefront, vendor  |
| Stores & vendor onboarding | `/api/stores`, `/api/vendor-applications`, `/api/admin/stores`                | All                 |
| Cart & orders              | `/api/orders`                                                                 | Storefront          |
| Vendor / admin orders      | `/api/vendor/orders`, `/api/admin/vendor-orders`, `/api/admin/orders`         | Vendor, admin       |
| Fulfillment & returns      | `/api/vendor/fulfillments`, `/api/admin/fulfillments`, `*/returns`            | Vendor, admin       |
| Wallet & withdrawals       | `/api/vendor/wallet`, `/api/admin/commission`, `*/withdrawals`                | Vendor, admin       |
| Marketing                  | `/api/coupons`, `/api/flash-deals`, `/api/sponsored-placements`, `/api/hero`  | Storefront, admin   |
| Engagement                 | `/api/wishlist`, `/api/recently-viewed`, `/api/products` (reviews)            | Storefront          |
| Payments                   | `/api/payments/sslcommerz`                                                    | Storefront checkout |
| Reports & dashboard        | `/api/admin/dashboard`, `/api/vendor/dashboard`, `/api/admin/finance/reports` | Admin, vendor       |
| Site                       | `/api/site-settings`                                                          | Storefront, admin   |

Static uploads: **`GET /uploads/...`** when `IMAGE_STORAGE_DRIVER=local`.

## Project layout

```
src/
  app.ts          Express app factory
  server.ts       HTTP server bootstrap
  routes.ts       Mounts all module routers
  config/         env, database, cors, uploads
  common/         middleware, HTTP helpers
  modules/        Feature modules (auth, products, orders, …)
  scripts/        Seeds and migrations
```

Each module typically includes routes, controller, service, validators, and models as needed.

## Related frontends

| App                 | Default URL           | Repo path                   |
| ------------------- | --------------------- | --------------------------- |
| Customer storefront | http://localhost:3000 | `frontend/nexCart-frontend` |
| Admin dashboard     | http://localhost:5174 | `frontend/nexCart-admin`    |
| Vendor dashboard    | http://localhost:5175 | `frontend/nexCart-vendor`   |

Point each app’s API URL at `http://localhost:4000/api` (or your deployed API).

## License

ISC
