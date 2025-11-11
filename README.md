# 🧩 Mini Task API

A modern RESTful API for managing tasks with **JWT authentication**, **RBAC/ABAC authorization**, **idempotent POST requests**, and **role-based rate limiting**.  
Built with **Node.js + Express + Prisma + MySQL**, documented via **Swagger (OpenAPI 3.0)**.

---

## 🚀 1. Setup & Installation

### 1.1 Prerequisites
- Node.js v18+ (recommended v20+)
- MySQL 8.0+
- Docker
- npm

### 1.2 Installation
```bash
npm install
```

### 1.3 Environment Configuration

Create `.env` in the project root:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="mysql://root:password@localhost:3306/minitaskdb"
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
IDEMPOTENCY_TTL_HOURS=24
TRUST_PROXY=false
```

> Example template is provided in `.env.example`.

---

## 🗄️ 2. Database Setup

```bash
docker compose up -d
```

# Recommended with dotenv-cli
```bash
npx dotenv -e .env -- prisma migrate dev --name init
npx dotenv -e .env -- prisma generate
```

# If you already exported DATABASE_URL
```bash
npx prisma migrate dev --name init
npx prisma generate
```

To view your database:
```bash
npx prisma studio
```

---

## 🧪 3. Development Server

```bash
npm run dev
```

Health check endpoint:
```
GET http://localhost:3000/health → { "ok": true }
```

---

## 🔐 4. Authentication (JWT)

### Token Types
| Type | Lifetime | Example Payload |
|------|-----------|------------------|
| **Access Token** | 15 minutes | `{ "userId": "123", "email": "user@email.com", "role": "user", "isPremium": false }` |
| **Refresh Token** | 7 days | `{ "userId": "123", "tokenId": "uuid-12345" }` |

### Flow
1. **Register** → Create user + hash password (bcrypt)
2. **Login** → Validate + issue access & refresh tokens
3. **Access API** → Send access token in header
4. **Refresh** → Use refresh token to get new access token
5. **Logout** → Blacklist both tokens

Authorization header example:
```
Authorization: Bearer <accessToken>
```

---

## 🧍 5. User Endpoints (v1)

| Method | Endpoint | Description |
|--------|-----------|-------------|
| POST | /api/v1/auth/register | Register new user |
| POST | /api/v1/auth/login | Login and get tokens |
| POST | /api/v1/auth/refresh | Refresh access token |
| POST | /api/v1/auth/logout | Logout and revoke tokens |
| GET | /api/v1/users/me | View profile |
| PUT | /api/v1/users/me | Update profile |
| DELETE | /api/v1/users/me | Delete account |
| GET | /api/v1/users | List all users (admin only) |

---

## ✅ 6. Task Endpoints

### (v1) Basic RBAC
| Method | Endpoint | Description |
|--------|-----------|-------------|
| GET | /api/v1/tasks | List tasks |
| POST | /api/v1/tasks | Create new task |
| PUT | /api/v1/tasks/:id | Update task |
| PATCH | /api/v1/tasks/:id/status | Update task status |
| DELETE | /api/v1/tasks/:id | Delete task |

### (v2) Enhanced ABAC + Idempotency
| Method | Endpoint | Description |
|--------|-----------|-------------|
| GET | /api/v2/tasks | List visible tasks (ABAC filters) |
| POST | /api/v2/tasks | Create task (idempotent) |
| PATCH | /api/v2/tasks/:id/status | Update status |
| PUT | /api/v2/tasks/:id | Update (owner/admin only) |
| DELETE | /api/v2/tasks/:id | Delete (owner/admin only) |

Header for idempotent requests:
```
Idempotency-Key: create-task-001
```

---

## 🧠 7. ABAC Rules

| Action | Allowed If |
|---------|-------------|
| **Read Task** | `task.isPublic == true` OR `user.id == task.ownerId` OR `user.id == task.assignedTo` OR `user.role == 'admin'` |
| **Update/Delete Task** | `user.id == task.ownerId` OR `user.role == 'admin'` |
| **Create High Priority Task** | `user.isPremium == true` OR `user.role == 'admin'` |
| **Time-Based Access** | `user.isPremium == true` AND `user.subscriptionExpiry > Date.now()` |

---

## 🚦 8. Rate Limiting

Implemented in `src/middleware/rateLimiter.js`  
Each role has its own per-minute request limit.

| Role | Limit (per minute) |
|------|---------------------|
| Anonymous | 3 |
| User | 5 |
| Premium | 8 |

Custom response (HTTP 429):

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Try again in 60 seconds.",
    "retryAfter": 60
  }
}
```

---

## 🧩 9. Error Format

All error responses follow this structure:

```json
{
  "error": {
    "code": "INVALID_STATUS",
    "message": "Invalid task status",
    "details": null,
    "timestamp": "2025-11-11T10:00:00Z",
    "path": "/api/v2/tasks/123/status"
  }
}
```

---

## 📘 10. Swagger Documentation

Accessible at:  
👉 **[http://localhost:3000/docs](http://localhost:3000/docs)**

Generated via:
```js
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```

---

## 🐳 11. Docker Compose (Optional)

```yaml
version: "3.9"
services:
  db:
    image: mysql:8.0
    container_name: mini_task_mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: minitaskdb
    ports:
      - "3306:3306"
    volumes:
      - dbdata:/var/lib/mysql

  phpmyadmin:
    image: phpmyadmin/phpmyadmin
    container_name: mini_phpmyadmin
    restart: unless-stopped
    environment:
      PMA_HOST: db
      PMA_USER: root
      PMA_PASSWORD: password
    ports:
      - "8081:80"
    depends_on:
      - db

volumes:
  dbdata:
```

---

## 🧰 12. Developer Tips

- Use `crypto.randomUUID()` for unique IDs.
- Keep `.env.example` updated for team consistency.
- Use Prisma’s `onDelete: Cascade` for User–Task relations.
- RateLimiter role detection relies on `req.user.role`.

---

**Author:** Kawinphop Suwatwisutthikhun  
**Version:** 2.0.0  
**License:** MIT  
**Last Updated:** 2025-11-11
