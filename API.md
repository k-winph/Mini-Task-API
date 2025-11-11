
# Mini Task API — Reference (v2.0)

A RESTful API for managing tasks with authentication (JWT), ABAC policies, idempotent creates, and adaptive rate limiting.  
Stack: **Node.js + Express + Prisma + MySQL**, docs via **Swagger** and **Postman**.

- Base URL (local): `http://localhost:3000`
- Docs (Swagger UI): `GET /docs`
- Health check: `GET /health` → `{ "ok": true }`

---

## 1) Authentication (v1)

JWT consists of:
- **Access Token (15m)** — carries: `userId, email, role, isPremium, subscriptionExpiry?`
- **Refresh Token (7d)** — carries: `userId, tokenId`

### 1.1 Register
`POST /api/v1/auth/register`  
Creates a user and returns access & refresh tokens.

**Body**
```json
{
  "email": "user@example.com",
  "password": "secret123",
  "name": "Test User",
  "role": "user",           // optional: user | premium | admin (defaults to user)
  "isPremium": false,       // optional; if using role=premium, token will reflect it
  "subscriptionExpiry": null
}
```

**200 Response**
```json
{
  "user": { "id": 5, "email": "user@example.com", "name": "Test User", "role": "user", "isPremium": false },
  "tokens": {
    "accessToken": "<JWT>",
    "refreshToken": "<JWT>"
  }
}
```

### 1.2 Login
`POST /api/v1/auth/login`

**Body**
```json
{ "email": "user@example.com", "password": "secret123" }
```

**200 Response** – same shape as Register.

### 1.3 Refresh
`POST /api/v1/auth/refresh`

**Body**
```json
{ "refreshToken": "<JWT>" }
```

**200 Response**
```json
{ "accessToken": "<JWT>" }
```

### 1.4 Logout
`POST /api/v1/auth/logout`  
**Body**
```json
{ "refreshToken": "<JWT>" }
```

**200 Response**
```json
{ "ok": true }
```

**Auth Header (for protected endpoints)**  
`Authorization: Bearer <accessToken>`

---

## 2) Users (v1)

### 2.1 Get my profile
`GET /api/v1/users/me` — **auth required**

**200**
```json
{ "id": 5, "email": "user@example.com", "name": "Test User", "role": "user", "isPremium": false }
```

### 2.2 Update my profile
`PUT /api/v1/users/me` — **auth required**

**Body**
```json
{ "name": "New Name", "email": "new@example.com" }
```

**200**
```json
{ "id": 5, "email": "new@example.com", "name": "New Name", "role": "user", "isPremium": false }
```

### 2.3 Delete my account
`DELETE /api/v1/users/me` — **auth required**  
Deletes the user; cascades according to schema.

**200** → `{ "ok": true }`

### 2.4 List all users (admin only)
`GET /api/v1/users` — **admin required**

**200** → `[{ id, email, role, ... }]`

---

## 3) Tasks (v1) — Basic Shape

Responses are **basic** (subset): `{ id, title, status }`  

- `GET /api/v1/tasks` — list visible tasks (auth required)
- `POST /api/v1/tasks` — **idempotent**; requires `Idempotency-Key` (auth required)
- `GET /api/v1/tasks/:id` — get by id (auth required)
- `PUT /api/v1/tasks/:id` — update (auth + ABAC owner/admin)
- `PATCH /api/v1/tasks/:id/status` — idempotent-by-nature (auth + ABAC owner/admin)
- `DELETE /api/v1/tasks/:id` — delete (auth + ABAC owner/admin)

**Idempotency-Key for v1 create:** header must be present; identical key + payload returns the cached response (24h).

---

## 4) Tasks (v2) — Full Shape + Query

Full entity fields:
```json
{
  "id": 8,
  "title": "task-9",
  "description": "999 999",
  "status": "completed",            // pending | in_progress | completed
  "priority": "medium",             // low | medium | high
  "isPublic": false,
  "ownerId": 5,
  "assignedTo": null,
  "createdAt": "2025-11-10T16:28:51.438Z",
  "updatedAt": "2025-11-10T16:30:22.759Z"
}
```

### 4.1 List (optional auth; filtering, sorting, pagination)
`GET /api/v2/tasks`

**Visibility**
- Anonymous: only `isPublic = true`
- Authenticated: `isPublic = true` **OR** `ownerId = me`
- Admin: all

**Query Params**
- `status`: `pending | in_progress | completed`
- `priority`: `low | medium | high`
- `assignedTo`: integer
- `isPublic`: boolean (`true`/`false`)
- `sort`: `field:dir` — fields: `createdAt|updatedAt|title|priority|status`; dir: `asc|desc`  
  e.g. `sort=createdAt:desc`
- Pagination: `page` (default 1), `limit` (1–100, default 10)

**200**
```json
{
  "page": 1,
  "limit": 10,
  "total": 27,
  "totalPages": 3,
  "items": [ /* full tasks */ ]
}
```

### 4.2 Create (idempotent)
`POST /api/v2/tasks` — **auth required**, **Idempotency-Key required**

**Headers**
```
Authorization: Bearer <accessToken>
Idempotency-Key: uuid-v4-here
```

**Body**
```json
{ "title": "New task", "description": "...", "priority": "high", "isPublic": false }
```

**High Priority Rule (ABAC)**
- Allowed if `role = admin` **or** `role = premium` (or `isPremium=true` with active subscription, if you use that style).
- Otherwise `403 FORBIDDEN_HIGH_PRIORITY`.

**201** → returns **full** task.  
**200** → cached response if same key+payload within TTL (24h).  
**409** → key reused with different payload/endpoint.

### 4.3 Get by id (optional auth)
`GET /api/v2/tasks/:id`  
Anonymous can see only public tasks; authed owner/admin can see theirs; admin can see all.

### 4.4 Update (full PUT)
`PUT /api/v2/tasks/:id` — **auth + ABAC (owner or admin)**

- If `priority = high`, only **admin** or **premium** may set it; others → `403 FORBIDDEN_HIGH_PRIORITY_UPDATE`.

### 4.5 Update Status (idempotent-by-nature)
`PATCH /api/v2/tasks/:id/status` — **auth + ABAC (owner or admin)**  
Body: `{ "status": "in_progress" }`

### 4.6 Delete
`DELETE /api/v2/tasks/:id` — **auth + ABAC (owner or admin)**

---

## 5) Idempotency — Server Behavior

- Store `Idempotency-Key` with: `key, userId, endpoint, requestHash, response, expiresAt`.
- TTL default: **24 hours** (`IDEMPOTENCY_TTL_HOURS`).
- Reuse with **different payload** or **different endpoint** → `409`.
- Reuse with same payload within TTL → return cached `200`/`201` response.

Endpoints covered:
- v1: `POST /api/v1/tasks`
- v2: `POST /api/v2/tasks`

---

## 6) ABAC Rules (summarized)

1. **Read Task** — allow if:
   - `task.isPublic == true` (anonymous and authenticated)
   - OR requester is **owner** (`userId === task.ownerId`)
   - OR requester is **assignee** (`userId === task.assignedTo`)
   - OR requester is **admin**

2. **Update / Delete Task** — allow if owner or admin.

3. **Create/Set High Priority Task** — allow if **admin** or **premium** (or `isPremium` active).

4. **Time-Based Access** — if using `isPremium + subscriptionExpiry`, require `subscriptionExpiry > now`.

---

## 7) Rate Limiting

Adaptive by role (example dev profile):
- **anonymous**: 20 req / 15 min (or your current test window, e.g., 3/min)
- **user**: 100 req / 15 min (or 5/min in test)
- **premium**: 500 req / 15 min (or 8/min in test)

**Headers on 429**
```
Retry-After: <seconds>
X-RateLimit-Limit: <limit>
X-RateLimit-Remaining: <remaining>
X-RateLimit-Reset: <unix-epoch-seconds>
```

**429 Body**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Try again in 5 minutes.",
    "retryAfter": 300
  }
}
```

**Placement**
- Applied to `/api/**` via `optionalAuth` (so role-aware keys) + `rateLimiter` in `app.js`.

---

## 8) Error Format (Uniform)

```json
{
  "error": {
    "code": "INVALID_STATUS",
    "message": "Invalid task status",
    "details": null,
    "timestamp": "2025-11-10T09:41:00.000Z",
    "path": "/api/v2/tasks/123/status"
  }
}
```

**Common Codes**
- `NO_TOKEN`, `INVALID_TOKEN`
- `FORBIDDEN`, `FORBIDDEN_HIGH_PRIORITY`, `FORBIDDEN_HIGH_PRIORITY_UPDATE`
- `INVALID_STATUS`, `INVALID_PRIORITY`, `INVALID_ID`, `MISSING_FIELD`
- `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_SCOPE_CONFLICT`, `MISSING_IDEMPOTENCY_KEY`

---

## 9) Curl Examples

### Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login   -H "Content-Type: application/json"   -d '{ "email": "user@example.com", "password": "secret123" }'
```

### Create Task (v2, idempotent)
```bash
curl -X POST http://localhost:3000/api/v2/tasks   -H "Authorization: Bearer $ACCESS_TOKEN"   -H "Idempotency-Key: $(uuidgen)"   -H "Content-Type: application/json"   -d '{ "title": "New task", "priority": "medium", "isPublic": false }'
```

### List Tasks with filters
```bash
curl "http://localhost:3000/api/v2/tasks?status=pending&priority=low&sort=createdAt:desc&page=1&limit=10"
```

### Update priority to high (premium/admin only)
```bash
curl -X PUT http://localhost:3000/api/v2/tasks/123   -H "Authorization: Bearer $ACCESS_TOKEN"   -H "Content-Type: application/json"   -d '{ "title": "T", "priority": "high" }'
```

---

## 10) Postman & OpenAPI (YAML)

- **Postman Collection**: organize as
  - `01 Auth/` (register, login, refresh, logout)
  - `02 Users/` (me get/put/delete, list users)
  - `03 Tasks v2/` (list, create, get, put, patch status, delete)
  - `04 Security & Policies/` (ABAC/rate-limit test requests)
  - `05 Error cases/` (negative scenarios)
- **Variables**: `{{base_url}}`, `{{access_token}}`, `{{refresh_token}}`, etc.
- **Export OpenAPI (YAML)**: Postman → **Generate Collection > API > Export** → commit to `docs/openapi.yaml`.

---

## 11) Environment & Config

- `.env` — runtime secrets (do **NOT** commit). Example:
  ```env
  PORT=3000
  NODE_ENV=development
  DATABASE_URL="mysql://root:password@localhost:3306/minitaskdb"
  JWT_ACCESS_SECRET=your-strong-access-secret
  JWT_REFRESH_SECRET=your-strong-refresh-secret
  JWT_ACCESS_EXPIRES=15m
  JWT_REFRESH_EXPIRES=7d
  IDEMPOTENCY_TTL_HOURS=24
  TRUST_PROXY=false
  ```
- `.env.example` — safe template without secrets.
- `.env.test` — for tests CI (separate DB).
- `prisma/.env` — used by `prisma` CLI when needed.

---

## 12) Versioning

- **v1** — basic task responses, create idempotency, strict auth.
- **v2** — full task schema, optional auth on reads, advanced filters.

---

## 13) License & Authors

- License: MIT  
- Authors/Maintainers: see `MEMBERS.md`

