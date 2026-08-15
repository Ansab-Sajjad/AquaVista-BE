# AquaVista Backend API

Node.js · Express · TypeScript · MongoDB (Mongoose)

---

## Setup

### 1. Install dependencies

```bash
cd "AquaVista BE"
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Long random string for signing JWTs |
| `JWT_REFRESH_SECRET` | Separate secret for refresh tokens |
| `ANTHROPIC_API_KEY` | Your Anthropic API key for AVA |
| `GMAIL_USER` | Your full Gmail address (e.g., youremail@gmail.com) |
| `GMAIL_APP_PASSWORD` | 16-character Gmail App Password (no spaces) |
| `GMAIL_PORT` | 587 for TLS or 465 for SSL (defaults to 587) |
| `FRONTEND_URL` | The Next.js app URL (for email links) |

### 3. Seed the admin user

```bash
npm run seed:admin
```

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` in `.env` before running, or edit the defaults in `src/scripts/seed-admin.ts`.

### 4. Run in development

```bash
npm run dev
```

Server starts at `http://localhost:5000`.

### 5. Build for production

```bash
npm run build
npm start
```

---

## API Reference

All routes are prefixed with `/api`. Protected routes require an httpOnly cookie (`access_token`) set by the backend on login/refresh. A Bearer header is also accepted for backward compatibility.

**Interactive API docs (Swagger/OpenAPI)** are available at [`/api/docs`](http://localhost:5000/api/docs) when the server is running.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register a new user (sends activation email) |
| POST | `/auth/login` | — | Login, sets httpOnly cookies |
| POST | `/auth/logout` | Auth | Logout, revokes tokens, clears cookies |
| POST | `/auth/refresh` | — | Refresh access token via refresh cookie |
| GET | `/auth/me` | Auth | Get current user profile |
| PATCH | `/auth/me` | Auth | Update profile |
| PATCH | `/auth/me/password` | Auth | Change password |
| POST | `/auth/me/avatar` | Auth | Upload avatar |
| POST | `/auth/google` | — | Google OAuth sign-in |
| POST | `/auth/github` | — | GitHub OAuth sign-in |
| POST | `/auth/forgot-password` | — | Request password reset email |
| POST | `/auth/reset-password` | — | Set new password via token |
| POST | `/auth/activate` | — | Activate account via token |
| POST | `/auth/resend-activation` | — | Resend activation email |

### Projects

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/projects` | Any | List projects (admin sees all, user sees assigned) |
| POST | `/projects` | Admin | Create project |
| GET | `/projects/:projectId` | Member | Get project detail |

### Users (within a project)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/projects/:projectId/users` | Admin | List project members |
| POST | `/projects/:projectId/users` | Admin | Invite user by email |
| DELETE | `/projects/:projectId/users/:userId` | Admin | Remove user from project |
| POST | `/projects/:projectId/users/:userId/resend-activation` | Admin | Resend activation |

### Data

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/projects/:projectId/data` | Member | List uploaded files |
| POST | `/projects/:projectId/data` | Admin | Upload a file (multipart `file` + `fileType`) |
| GET | `/projects/:projectId/data/:fileId/download` | Member | Download original file |
| DELETE | `/projects/:projectId/data/:fileId` | Admin | Delete file |
| GET | `/projects/:projectId/templates` | Member | List baseline templates |
| GET | `/projects/:projectId/templates/:templateId/download` | Member | Download template |

### Ask AVA

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/projects/:projectId/ava/usage` | Member | Today's usage vs limit |
| GET | `/projects/:projectId/ava/startup-questions` | Member | List startup questions |
| PUT | `/projects/:projectId/ava/startup-questions` | Admin | Save startup questions |
| GET | `/projects/:projectId/ava/user-chats` | Admin | View all user chats (read-only) |
| GET | `/projects/:projectId/ava/chats` | Member | List own chats |
| POST | `/projects/:projectId/ava/chats` | Member | Start new chat |
| GET | `/projects/:projectId/ava/chats/:chatId` | Member | Get chat with messages |
| POST | `/projects/:projectId/ava/chats/:chatId/messages` | Member | Send message to AVA |

### Dashboard

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/projects/:projectId/dashboard` | Member | List pinned items |
| POST | `/projects/:projectId/dashboard/pin` | Member | Pin an AVA response |
| DELETE | `/projects/:projectId/dashboard/:itemId` | Member | Unpin an item |

---

## Project Structure

```
src/
├── config/
│   ├── database.ts       # MongoDB connection
│   └── logger.ts         # Winston logger
├── controllers/
│   ├── auth.controller.ts
│   ├── ava.controller.ts
│   ├── dashboard.controller.ts
│   ├── data.controller.ts
│   ├── project.controller.ts
│   └── user.controller.ts
├── middleware/
│   ├── auth.middleware.ts   # JWT auth + role checks
│   ├── errorHandler.ts      # Global error handler
│   ├── rateLimiter.ts
│   └── upload.middleware.ts # Multer file upload
├── models/
│   ├── Chat.model.ts
│   ├── DataFile.model.ts
│   ├── PinnedItem.model.ts
│   ├── Project.model.ts
│   ├── StartupQuestion.model.ts
│   ├── UsageLog.model.ts
│   └── User.model.ts
├── routes/
│   ├── auth.routes.ts
│   ├── ava.routes.ts
│   ├── dashboard.routes.ts
│   ├── data.routes.ts
│   ├── project.routes.ts
│   ├── user.routes.ts
│   └── validate.ts
├── scripts/
│   └── seed-admin.ts
├── services/
│   ├── ava.service.ts      # Anthropic API call + context builder
│   ├── email.service.ts    # Nodemailer transactional emails
│   ├── token.service.ts    # JWT + secure token helpers
│   └── usage.service.ts    # Daily question limit tracking
├── app.ts
└── index.ts
```

---

## Data Models

- **User** — `admin` or `project_user`, with activation/reset token flows
- **Project** — named workspace with member list and daily question limit
- **DataFile** — uploaded CSV/XLSX files tracked per project
- **Chat** — conversation between a user and AVA, scoped to a project
- **PinnedItem** — AVA response (narrative/table/chart) saved to the dashboard
- **StartupQuestion** — ordered list of suggested prompts per project
- **UsageLog** — daily question and token usage per user per project

---

## Connecting the Frontend

In `AquaVista FE/.env`, add:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

The frontend uses a centralized API client (`src/lib/api-client.ts`) that automatically includes `credentials: "include"` for cookie-based auth. No manual token handling is needed.
