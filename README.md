# Ágora

Collaborative web platform for managing university research projects across their whole life cycle: planning, execution and closure. Coordinators, principal investigators and co-investigators share one source of truth for phases, tasks, progress, documents and a per-project chat, with changes pushed to every member in real time.

Academic project for the *Programación Distribuida* course, Universidad de Cartagena, 2026-2.

> **Status — Delivery 2 (backend and basic real-time communication).** This README documents the backend setup. The Angular client arrives in Delivery 3.

## Contents

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Requirements](#requirements)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Running the backend](#running-the-backend)
- [Seed accounts](#seed-accounts)
- [REST API](#rest-api)
- [Real-time events (Socket.io)](#real-time-events-socketio)
- [Connectivity demo](#connectivity-demo)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Architecture

Three-tier client-server architecture:

- **Presentation:** Angular SPA (Delivery 3). For now, a minimal HTML client in `docs/demo/`.
- **Business logic:** Node.js + Express server, organised as a modular monolith. Each domain module (`auth`, `projects`, `chat`, …) has its own routes, controller, service, repository and validation schemas. Socket.io runs on the same HTTP server.
- **Data:** PostgreSQL for structured data. File attachments will live in a separate file store; only their metadata goes into the database.

Communication runs over two channels, and they follow one rule: **every change goes through REST and is persisted first. Only after the write succeeds does the server emit the matching WebSocket event.** Clients never write through the socket; they only listen.

## Tech stack

| Component | Version | Notes |
| --- | --- | --- |
| Node.js | 24.22.1 LTS | Patched for the 21 October 2026 security release; Node 20 is out of support. Also required by Angular 22 |
| pnpm | 10.28.2 | Workspace at the repository root |
| TypeScript | 6.0.3 | Pinned: TypeScript 7 has no stable programmatic API yet. Angular 22 requires the 6.0 branch |
| Express | 5.2.1 | Async errors reach the error handler without wrappers |
| Socket.io | 4.8.3 | Also serves its own browser client bundle |
| Prisma / @prisma/client | 6.19.3 | Pinned; both versions must match |
| PostgreSQL | 16-alpine | Runs in Docker |
| jsonwebtoken | 9.0.3 | Access tokens |
| bcryptjs | 3.0.3 | Password hashing, pure JS |
| Zod | 4 | Request and environment validation |
| Angular | 22.2.4 | Web client: standalone components, zoneless, no SSR |
| Tailwind CSS | 4.3.3 | Utilities generated only from the design system's tokens |

## Repository layout

```
agora-platform/
├── agora-backend/
│   ├── prisma/              # schema, migrations and seed
│   └── src/
│       ├── config/          # validated environment, Prisma instance
│       ├── middlewares/     # authenticate, authorize, project access, validate, errors
│       ├── modules/         # auth, users, projects, phases, tasks, progress, documents, chat, notifications (one folder per domain)
│       ├── routes/v1.ts     # mounts every module under /api/v1
│       ├── sockets/         # Socket.io: event contract, handshake, rooms, emitter
│       ├── storage/         # file storage: one port, Supabase and local disk behind it
│       ├── app.ts           # Express application
│       └── server.ts        # HTTP server + Socket.io
├── agora-frontend/
│   ├── public/              # static files served as-is
│   └── src/
│       ├── app/             # root component, routes and application config
│       ├── styles/          # tokens.css (generated from the design system), theme.css (Tailwind bridge)
│       ├── index.html       # host page; loads the IBM Plex fonts
│       ├── main.ts          # bootstraps the application
│       └── styles.css       # stylesheet entry: Tailwind, tokens, theme
├── docs/
│   ├── demo/                # HTML connectivity demo client
│   └── postman/             # Postman collection
├── docker-compose.yml       # PostgreSQL
└── pnpm-workspace.yaml
```

## Requirements

- **Node.js 24.22.1 LTS.** Node's 21 October 2026 security release fixed ten CVEs, four of them high severity, including remote code execution in the Brotli decoder. The patched lines are 26.12.1, 24.22.1 and 22.23.4; Node 20 is out of support and did not get the fixes. Angular 22 also requires Node `^22.22.3 || ^24.15.0 || >=26`, so Node 20 cannot run the client.
- **pnpm 10.28.2.** With Corepack: `corepack enable`. Corepack picks up the version pinned in `packageManager`.
- **Docker** with Docker Compose v2 (Docker Desktop on Windows and macOS)
- Git

## Setup

All commands run from the repository root unless noted otherwise.

**1. Clone and install dependencies.**

```bash
git clone <repository-url> agora-platform
cd agora-platform
pnpm install
pnpm --filter agora-backend exec prisma generate
```

The second command generates the Prisma client into `node_modules`. Run it again whenever `prisma/schema.prisma` changes.

**2. Create both environment files** from their templates, then fill them in (see [Environment variables](#environment-variables)).

```bash
cp .env.example .env
cp agora-backend/.env.example agora-backend/.env
```

For `JWT_SECRET`, generate a random value:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The user, password and database name in `DATABASE_URL` must match `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` in the root `.env`. The port must match `POSTGRES_PORT`.

**3. Start PostgreSQL.**

```bash
docker compose up -d
docker compose ps        # wait until agora-db reports "healthy"
```

**4. Apply the migrations.**

```bash
pnpm --filter agora-backend exec prisma migrate deploy
```

**5. Load the test data.**

```bash
pnpm --filter agora-backend seed
```

The seed is idempotent: running it again updates the same rows instead of duplicating them. To wipe the database and start over, run `pnpm --filter agora-backend exec prisma migrate reset`. This drops all data, reapplies the migrations and runs the seed.

**6. Start the server** (see the next section) and check that it responds:

```bash
curl http://localhost:3000/salud
# {"status":"ok","time":"..."}
```

## Environment variables

There are two `.env` files, each with its own consumer. Neither is committed; both have a committed `.env.example`.

### `.env` (repository root) — read by Docker Compose

| Variable | Example | Description |
| --- | --- | --- |
| `POSTGRES_USER` | `agora` | Database user created when the container is first initialised |
| `POSTGRES_PASSWORD` | — | Password for that user |
| `POSTGRES_DB` | `agora_db` | Database name |
| `POSTGRES_PORT` | `5433` | Host port that PostgreSQL is published on (see [Troubleshooting](#troubleshooting)) |

The container only reads these credentials the first time it creates its data volume. To change them later, run `docker compose down -v`. **This deletes all data.**

### `agora-backend/.env` — read by the application

The server validates these values at startup with Zod. If any value is missing or invalid, the process exits with a message naming the variable.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP and Socket.io port |
| `NODE_ENV` | `development` | `development`, `test` or `production`. The demo client is only served outside production. |
| `DATABASE_URL` | — (required) | `postgresql://USER:PASSWORD@localhost:5433/agora_db?schema=public` |
| `JWT_SECRET` | — (required) | Signing key for access tokens, at least 32 characters |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime. Format: a number followed by `s`, `m`, `h` or `d` |
| `REFRESH_TOKEN_EXPIRES_IN` | `7d` | Refresh token lifetime, same format |
| `CORS_ORIGIN` | `http://localhost:4200` | Allowed origin for both REST and Socket.io (the Angular dev server) |
| `SUPABASE_URL` | — (optional) | Supabase project URL |
| `SUPABASE_SECRET_KEY` | — (optional) | Secret key (`sb_secret_...`). Backend only |
| `SUPABASE_BUCKET` | — (optional) | Private bucket for the files |

**The three `SUPABASE_*` variables are optional, and they go together: all three or none.** Without them, files are stored on local disk under `agora-backend/uploads/` (ignored by git), so you can clone the repository and run everything without a Supabase account, including the documents of the seed. With them, files go to Supabase Storage. The server logs which one it uses at startup. Setting only some of them stops the server at startup. Use Supabase in production: a host such as Render does not keep its local disk across restarts.

Run the seed after changing the storage: it uploads its four documents to whichever one is active.

## Running the backend

| Command (from the root) | What it does |
| --- | --- |
| `pnpm --filter agora-backend dev` | Development server with reload on save (`tsx watch`) |
| `pnpm --filter agora-backend build` | Compiles TypeScript into `agora-backend/dist/` |
| `pnpm --filter agora-backend start` | Runs the compiled build |
| `pnpm --filter agora-backend seed` | Loads the test data |
| `pnpm --filter agora-backend lint` | ESLint (`lint:fix` applies fixes) |
| `pnpm --filter agora-backend format:check` | Prettier check (`format` rewrites files) |

Local ports:

| Port | Service |
| --- | --- |
| 3000 | Backend (REST, Socket.io and the demo client) |
| 5433 | PostgreSQL in Docker |
| 4200 | Angular dev server (Delivery 3) |
| 5555 | Prisma Studio (`pnpm --filter agora-backend exec prisma studio`) |

## Seed accounts

All accounts are active. The `example.com` domain is reserved for documentation, so no real email addresses are used.

| Email | Password | Role |
| --- | --- | --- |
| `coordinacion@example.com` | `Coordinador123*` | Research coordinator (sees every project) |
| `laura.mendoza@example.com` | `Investigador123*` | Principal investigator of P1 |
| `carlos.beltran@example.com` | `Investigador123*` | Principal investigator of P2 and P3 |
| `andres.pardo@example.com` | `Coinvestigador123*` | Co-investigator in P1 |
| `sofia.navarro@example.com` | `Coinvestigador123*` | Co-investigator in P1 and P3 |
| `daniel.osorio@example.com` | `Coinvestigador123*` | Co-investigator in P2 |

| Project | Title | Status |
| --- | --- | --- |
| P1 | Metales pesados y bioindicadores en la Ciénaga de la Virgen | `IN_PROGRESS`, with chat history |
| P2 | Movilidad urbana sostenible en el centro histórico de Cartagena | `PLANNING` |
| P3 | Deserción estudiantil en programas de ingeniería | `COMPLETED` (its chat is read-only) |

Roles work on two independent axes. The **system role** (`COORDINATOR` or `RESEARCHER`) lives on the user. The **project role** (`PRINCIPAL_INVESTIGATOR` or `CO_INVESTIGATOR`) lives on each project membership. A user only sees the projects they belong to; the coordinator is the only exception.

## REST API

The base URL is `http://localhost:3000/api/v1`. The public contract uses Spanish route names. Request and response bodies are JSON.

Authenticated routes expect the access token in the `Authorization: Bearer <token>` header. Sessions use two tokens:

- a 15-minute **access token**, kept in client memory only;
- a 7-day **refresh token**, stored hashed (SHA-256) in the database and rotated on every refresh.

No cookies are used.

### Endpoints

**Infrastructure**

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/salud` | — | Health check. Outside `/api/v1`. |

**Authentication** — `/api/v1/auth`

| Method | Route | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| `POST` | `/registro` | Coordinator | `{ email, password, fullName }` | `201 { user }`. Always created as `RESEARCHER`. `401` without a session, `403` for a researcher. |
| `POST` | `/iniciar-sesion` | — | `{ email, password }` | `200 { user, accessToken, refreshToken }` |
| `POST` | `/refrescar` | — | `{ refreshToken }` | `200 { accessToken, refreshToken }`. The old token is revoked. |
| `POST` | `/cerrar-sesion` | — | `{ refreshToken }` | `204`. Idempotent. |
| `GET` | `/perfil` | Token | — | `200 { user }`, read from the database |

There is no public sign-up: accounts are created by the coordinator. Coordinator accounts come only from the seed, so one coordinator cannot create another.

Reusing a refresh token that was already revoked revokes **every** session of that user.

**Users** — `/api/v1/usuarios`

| Method | Route | Who | Query / body | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Coordinator | `?rol=COORDINATOR\|RESEARCHER&buscar=&incluirInactivas=true` | `200 { users }`, each `{ id, email, fullName, systemRole, isActive }` |
| `PATCH` | `/:userId` | Coordinator | `{ fullName }` | `200 { user }` |
| `DELETE` | `/:userId` | Coordinator | — | `204`. Logical deactivation; revokes every refresh token of the account. |
| `POST` | `/:userId/reactivar` | Coordinator | — | `200 { user }` |

Only active accounts unless `incluirInactivas=true`, ordered by `fullName`. `buscar` matches name or email, case-insensitive; an empty `buscar` is ignored rather than rejected. There is no pagination: the system holds dozens of accounts, not thousands. A researcher gets `403`, since only the coordinator appoints principal investigators; principal investigators invite members by email.

`PATCH` changes the name and nothing else: the role, the email and `isActive` return `400`. Deactivating is logical, since accounts with authorship cannot be deleted. It closes the open sockets of the account, and `/auth/refrescar` and `/auth/iniciar-sesion` stop working for it; an access token that was already issued lives on for up to 15 minutes. Deactivating returns `409` for your own account, for an account that is already inactive, and for someone who leads a project that is neither `COMPLETED` nor `CANCELLED`: those projects have to be closed first. `POST /reactivar` returns `409` if the account is already active; the person signs in again.

**Projects** — `/api/v1/proyectos`

| Method | Route | Who | Body / query | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Any user (only visible projects) | `?estado=&buscar=&pagina=1&porPagina=20` | `200 { items, total, page, perPage }`. Each item also carries `principalInvestigator` and `memberCount`. |
| `POST` | `/` | Coordinator | `{ title, principalInvestigatorId, description?, objectives?, startDate?, endDate?, budget? }` | `201 { project }` |
| `GET` | `/:projectId` | Member or coordinator | — | `200 { project }` |
| `PATCH` | `/:projectId` | Principal investigator | At least one of `title`, `description`, `objectives`, `status`, `startDate`, `endDate`, `budget` | `200 { project }` |
| `POST` | `/:projectId/cerrar` | Principal investigator | — | `200 { project }`. Sets `COMPLETED`; the project becomes read-only. |
| `GET` | `/:projectId/miembros` | Member or coordinator | — | `200 { members }` |
| `POST` | `/:projectId/miembros` | Principal investigator | `{ email }` | `201 { members }`. `409` on a `COMPLETED` project. |
| `DELETE` | `/:projectId/miembros/:userId` | Principal investigator | — | `204`. Their tasks in this project become unassigned. `409` on a `COMPLETED` project. |
| `PUT` | `/:projectId/investigador-principal` | Principal investigator | `{ userId }` | `200 { members }`. Hands the project over. |

Dates use the `YYYY-MM-DD` format.

**Emptying fields.** On `PATCH`, `null` empties a field and leaving it out does not change it. That works for `description`, `objectives`, `startDate`, `endDate` and `budget` on projects, `description`, `startDate` and `endDate` on phases, and `description`, `startDate`, `dueDate` and `assigneeId` on tasks. The end date cannot be before the start date when both are present. Fields that are not declared return `400`.

**Handing a project over.** `PUT /:projectId/investigador-principal` swaps both roles in one transaction: the current principal investigator becomes a co-investigator and the new one takes over, so nobody ever reads zero or two of them. Only the current principal investigator can do it, and the new one must already be an active member (`404` otherwise). It returns `409` for yourself and on a `COMPLETED` project.

List items are not the same shape as the `project` returned by `POST`, `PATCH` and the detail. Each item adds:

- `principalInvestigator`: `{ id, email, fullName, systemRole, isActive }`, the same shape as `user` in a member. It can be `null`: the API never leaves a project without one, but the database schema does not enforce it.
- `memberCount`: how many members the project has.
- `unreadCount`: chat messages from others that the caller has not read. `0` for the coordinator, who does not take part in the chat.

None of them takes one request per project.

**Project chat** — `/api/v1/proyectos/:projectId/mensajes`

| Method | Route | Who | Body / query | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Project member | `?antes=<messageId>` or `?despues=<messageId>`, `&limite=50` (1–100) | `200 { messages, nextCursor }` |
| `POST` | `/` | Project member | `{ content }` (1–2000 characters, trimmed) | `201 { message }`, then emits `chat:mensaje` |
| `GET` | `/lectura` | Project member | — | `200 { lastReadAt, unreadCount }` |
| `PUT` | `/lectura` | Project member | `{ messageId }` | `200 { lastReadAt, unreadCount }` |

The history uses cursor pagination, in both directions. Each page comes back in chronological order. To load older messages, pass the page's `nextCursor` as `antes`; `nextCursor` is `null` when there is no more history. To catch up after a reconnection, pass the id of the last message you have as `despues`, and keep passing `nextCursor` until it is `null`: that is what tells you nothing is missing. `antes` and `despues` cannot go together (`400`), and a `despues` from another conversation returns `404`. The coordinator can see projects but does not take part in their chats (`403`). Sending to a `COMPLETED` project returns `409`.

The read mark is computed on the server, so it survives a reload. The client sends the id of the last message it saw, and the server takes the date of that message: it never accepts a date, because the client's clock is not the server's. The mark only moves forward. A message from another conversation returns `404`. `unreadCount` counts messages from others after the mark, or all of them if there is no mark.

**Project phases** — `/api/v1/proyectos/:projectId/fases`

| Method | Route | Who | Body | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Member or coordinator | — | `200 { phases }`, ordered by `position` |
| `POST` | `/` | Principal investigator | `{ name, description?, status?, startDate?, endDate? }` | `201 { phase }`, placed last |
| `PATCH` | `/:phaseId` | Principal investigator | At least one of `name`, `description`, `status`, `startDate`, `endDate` | `200 { phase }` |
| `DELETE` | `/:phaseId` | Principal investigator | — | `204`. The remaining phases close the gap. `409` if the phase has tasks: move or delete them first. |
| `PUT` | `/orden` | Principal investigator | `{ phaseIds }`: every phase of the project, in the new order | `200 { phases }` |

A phase is `{ id, projectId, name, description, position, status, startDate, endDate, createdAt, updatedAt }`. `status` is `PENDING` (the default), `IN_PROGRESS` or `COMPLETED`. `name` takes 3–150 characters. Dates use `YYYY-MM-DD`, and the end date cannot be before the start date; `PATCH` compares against the stored value when the body brings only one of them.

`position` is managed by the server: positions always run from 1 to the number of phases. Sending `position` to `POST` or `PATCH` returns `400`; the only way to change it is `PUT /orden`. That endpoint takes the whole order on purpose: moving phases one at a time leaves gaps and ties if two people reorder at once, while a complete list cannot end up half applied. It returns `400` unless the list holds exactly the phases of the project, with none missing, extra or repeated.

Every write returns `409` on a `COMPLETED` project and emits `cronograma:modificado` after it is saved. A phase that belongs to another project returns `404`.

**Project tasks** — `/api/v1/proyectos/:projectId/tareas`

| Method | Route | Who | Body | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Member or coordinator | — | `200 { tasks }`, by phase position and then age |
| `POST` | `/` | Principal investigator | `{ phaseId, title, description?, status?, priority?, assigneeId?, startDate?, dueDate? }` | `201 { task }` |
| `PATCH` | `/:taskId` | Principal investigator, or the assignee (`status` only) | At least one of `phaseId`, `title`, `description`, `status`, `priority`, `assigneeId`, `startDate`, `dueDate` | `200 { task }` |
| `DELETE` | `/:taskId` | Principal investigator | — | `204` |
| `POST` | `/:taskId/dependencias` | Principal investigator | `{ dependsOnTaskId }` | `201 { task }` |
| `DELETE` | `/:taskId/dependencias/:dependsOnId` | Principal investigator | — | `204` |

A task is `{ id, phaseId, title, description, status, priority, assigneeId, assignee, createdById, startDate, dueDate, completedAt, createdAt, updatedAt, dependsOnTaskIds }`. `assignee` has the same shape as `user` in a member, or `null`. `status` is `TODO` (the default), `IN_PROGRESS`, `IN_REVIEW`, `DONE` or `BLOCKED`; `priority` is `LOW`, `MEDIUM` (the default) or `HIGH`. `title` takes 3–200 characters. Dates use `YYYY-MM-DD`, and `dueDate` cannot be before `startDate`.

**Who can edit.** The principal investigator changes any field. The assignee changes `status` and nothing else: sending any other field returns `403`, it is not ignored. Any other member gets `403`, and so does the coordinator. A task with no assignee can only be edited by the principal investigator. Nobody assigns a task to themselves.

`completedAt` belongs to the server: it is set when the task moves to `DONE` and cleared when it leaves. Fields that are not in the table return `400`. `assigneeId` accepts `null` on `PATCH` to leave a task unassigned; the assignee must be an active member of the project, or the request returns `404`. Sending `phaseId` on `PATCH` moves the task to another phase of the same project, which is how a phase with tasks can be emptied before deleting it.

**Dependencies.** Both tasks must belong to the project: otherwise `404`. A task cannot depend on itself (`400`). A repeated dependency returns `409`, and so does one that would close a cycle of any length. Dependencies inform, they do not govern: a task can be marked `DONE` while the tasks it depends on are not, and `BLOCKED` is a status set by hand.

Every write returns `409` on a `COMPLETED` project and emits `tarea:actualizada` after it is saved. A task that belongs to another project returns `404`.

Removing a member from a project unassigns their tasks there in the same transaction, and emits `tarea:actualizada` if there were any. Having tasks does not block the removal. Deleting a task is allowed: progress entries and documents linked to it stay on the project and only lose that link.

**Project progress** — `/api/v1/proyectos/:projectId/avances`

| Method | Route | Who | Body | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Member or coordinator | — | `200 { progress }`, newest first |
| `POST` | `/` | Any member | `{ description, taskId? }` | `201 { progress }`, then emits `avance:creado` |
| `PATCH` | `/:progressId` | Its author only | At least one of `description`, `taskId` | `200 { progress }`, then emits `avance:modificado` |
| `DELETE` | `/:progressId` | Its author or the principal investigator | — | `204`, then emits `avance:modificado` |

A progress entry is `{ id, projectId, taskId, authorId, author, description, createdAt, updatedAt }`. It belongs to the project: `taskId` is optional, and a task from another project returns `404`. On `PATCH`, `taskId` accepts `null`. Nobody rewrites somebody else's words, so not even the principal investigator can edit an entry they did not write; they can delete it, since they answer for the project's record. The coordinator reads but does not write. Writes return `409` on a `COMPLETED` project.

**Project documents** — `/api/v1/proyectos/:projectId/documentos`

| Method | Route | Who | Body | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Member or coordinator | — | `200 { documents }`, only the latest version of each chain |
| `GET` | `/:documentId/versiones` | Member or coordinator | — | `200 { documents }`, the whole chain, newest first |
| `GET` | `/:documentId/descarga` | Member or coordinator | — | `200` with the bytes and the original name in `Content-Disposition` |
| `POST` | `/` | Any member | `multipart/form-data`: `file`, `taskId?` | `201 { document }`, then emits `documento:subido` |
| `POST` | `/:documentId/versiones` | Any member | `multipart/form-data`: `file` | `201 { document }`, then emits `documento:subido` |
| `DELETE` | `/:documentId` | Whoever uploaded it, or the principal investigator | — | `204`, then emits `documento:modificado` |

A document is `{ id, projectId, taskId, uploadedById, uploadedBy, name, mimeType, sizeBytes, version, previousVersionId, createdAt }`. Files go up to 20 MB: anything larger returns `400` from the backend. A task from another project returns `404`. The coordinator reads and downloads but does not write. Writes return `409` on a `COMPLETED` project.

A new version is a new row linked to the previous one, which stays in place with its file. It inherits the task of the previous version. A chain is a line, not a tree: uploading on top of a version that is not the latest returns `409`.

`DELETE` removes that version and its file, not the chain. Deleting a version in the middle links its neighbours, so the chain stays whole. Deleting the latest makes the previous one the latest again.

Downloads always go through the backend. There are no signed URLs: access is checked on every download, and both storage implementations follow the same path.

**Notifications** — `/api/v1/notificaciones`

| Method | Route | Who | Query | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Any user, their own | `?limite=50` (1–100) | `200 { notifications, unreadCount }`, newest first |
| `POST` | `/:notificationId/leida` | Its owner | — | `200 { notification }`. Idempotent. |
| `POST` | `/leidas` | Any user, their own | — | `200 { updated }` |

A notification is `{ id, type, title, body, resourceId, projectId, isRead, readAt, createdAt }`. Somebody else's notification returns `404`. Only two facts create one, both caused by someone else and aimed at one person: being added to a project (`PROJECT_INVITATION`, `resourceId` is the project), which includes being named principal investigator of a new project, and being assigned a task (`TASK_ASSIGNED`, `resourceId` is the task). Doing either to yourself creates none. Everything else already travels as a project room event.

`projectId` is resolved on every response, so a notification can link to its project: there is no route to a task without one. It is `null` when the target can no longer be reached, because the task was deleted or the person left the project. The notification stays in the list either way, and a client should simply not offer the link.

### Access rules

- A user who is not a member gets **`404`**, not `403`. A `403` would confirm that the project exists.
- `403` is for members who lack the required project role.
- The coordinator passes the read checks but not the management checks: phases, tasks, members and closing a project belong to the principal investigator.

### Error format

Every error has the same shape. `details` only appears when there is something to report.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son válidos",
    "details": [{ "field": "email", "message": "El correo no tiene un formato válido" }]
  }
}
```

Clients must branch on `code`, never on `message`. The `message` field is human-readable Spanish text.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | The request failed schema validation. `details` lists each invalid field. |
| `UNAUTHENTICATED` | 401 | No token was sent |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `TOKEN_EXPIRED` | 401 | Access token expired. The client should refresh it. |
| `INVALID_TOKEN` | 401 | Bad signature, bad payload or an unusable refresh token. The client should log out. |
| `ACCOUNT_DISABLED` | 403 | The account has been deactivated |
| `FORBIDDEN` | 403 | Authenticated, but not allowed |
| `NOT_FOUND` | 404 | The resource or route does not exist, or is not visible to the caller |
| `CONFLICT` | 409 | Uniqueness clash or invalid state (for example, a closed project) |
| `INTERNAL_ERROR` | 500 | Unexpected server error. Returns a generic message. |

A Postman collection with the authentication, project and chat requests, including error cases, is available at [`docs/postman/agora.postman_collection.json`](docs/postman/agora.postman_collection.json).

## Real-time events (Socket.io)

Socket.io runs on the same host and port as the REST API. The server serves the browser client bundle at `/socket.io/socket.io.js`.

### Connecting

The access token is sent in the handshake's `auth` object, and nowhere else:

```js
const socket = io('http://localhost:3000', { auth: { token: accessToken } });

socket.on('connect_error', (err) => {
  console.log(err.data?.code, err.message); // same codes as REST
});
```

The token is verified **once, when the socket connects**. If the check fails, the client receives `connect_error` with `data.code`:

- `UNAUTHENTICATED`: no token was sent;
- `TOKEN_EXPIRED`: refresh the token and reconnect;
- `INVALID_TOKEN`: log out.

A connection that is already open survives token expiry. This is safe because the socket only receives; every write goes through REST, which checks the token on each request.

### Rooms

**The server decides which rooms a socket joins; the client never does.** On connection, each socket joins:

| Room | Members |
| --- | --- |
| `proyecto:{projectId}` | Every socket of every member of that project |
| `usuario:{userId}` | Every socket (browser tab) of one person |

Rooms follow membership changes live. Adding someone to a project, or removing them, updates the rooms of all their open sockets without a reconnect. A person added while connected receives `presencia:inicial` and the room sees `usuario:conectado`; a person removed while connected makes the room see `usuario:desconectado`. The coordinator joins no project rooms.

### Server → client events

There are no client → server events: all changes go through REST.

| Event | Emitted to | Payload | When |
| --- | --- | --- | --- |
| `chat:mensaje` | `proyecto:{id}` | `{ id, projectId, content, createdAt, sender: { id, fullName } }` | After a message sent with `POST /proyectos/:projectId/mensajes` is saved |
| `usuario:conectado` | The person's project rooms | `{ userId, projectId }` | The person's **first** socket connects |
| `usuario:desconectado` | The person's project rooms | `{ userId, projectId }` | The person's **last** socket disconnects |
| `presencia:inicial` | The socket that just connected, or every socket of a person added to a project | `[{ projectId, userIds }]` | Right after joining the rooms |
| `cronograma:modificado` | `proyecto:{id}` | `{ projectId }` | After a phase is created, edited, deleted or reordered |
| `tarea:actualizada` | `proyecto:{id}` | `{ projectId }` | After a task or one of its dependencies is created, edited or deleted, or a member with tasks is removed |
| `avance:creado` | `proyecto:{id}` | `{ projectId }` | After a progress entry is created |
| `avance:modificado` | `proyecto:{id}` | `{ projectId }` | After a progress entry is edited or deleted |
| `documento:subido` | `proyecto:{id}` | `{ projectId }` | After a document or a new version is uploaded |
| `documento:modificado` | `proyecto:{id}` | `{ projectId }` | After a document version is deleted |
| `notificacion:nueva` | `usuario:{id}` | The notification, as in `GET /notificaciones` | After a notification is saved |

`chat:mensaje` has the same shape as the `message` returned by the REST call. The event also goes back to the sender. The tab that sent the message already has it from the REST response and discards the duplicate by `id`, while the sender's other tabs display it.

Presence is tracked per person, not per tab: opening a second tab does not announce the person again.

`presencia:inicial` tells a new socket who was already online. It has one entry per project room the socket joined, with no repeated ids. `userIds` includes the person connecting, and a project with nobody online comes with an empty list, so "nobody is online" and "nothing is known about that project yet" stay different. The coordinator joins no project rooms and receives an empty array. Being added to a project while connected sends a new snapshot of all the person's projects, not only the new one, since a client replaces what it had.

`cronograma:modificado` carries only the project id, and the client fetches the schedule again with `GET /proyectos/:projectId/fases`. A schedule is a handful of rows, and this way the four writes emit exactly the same thing instead of four shapes the client would have to merge. The coordinator joins no project rooms, so they do not receive it. `tarea:actualizada` and the progress and document events work the same way: fetch the list again.

## Connectivity demo

`docs/demo/index.html` is a single-file HTML client that shows several users exchanging messages in a project's public channel. The backend serves it at:

```
http://localhost:3000/demo/
```

It is only served when `NODE_ENV` is not `production`. Because it has the same origin as the API, it does not depend on `CORS_ORIGIN`. Opening the file directly (`file://`) will not work.

**Multi-client walkthrough:**

1. Start the database and the backend, and run the seed ([Setup](#setup)).
2. Open `http://localhost:3000/demo/` in three tabs or windows.
3. Log in with three members of P1: Laura, Andrés and Sofía. Pick them from the account selector. Each tab keeps its own session, because tokens live only in memory.
4. In each tab, select the *Ciénaga de la Virgen* project. Its chat history loads.
5. Send a message from any tab. It appears in the other tabs immediately.

The event log panel on the right records every REST call and every socket event: `connect`, `chat:mensaje`, `usuario:conectado` and `usuario:desconectado`. Closing a tab shows the disconnection in the others.

**Error cases.** The log shows each failure's HTTP status, error `code`, message, field details and a short explanation of the code.

| Case | How to trigger it | Expected |
| --- | --- | --- |
| Handshake without a token | *Handshake sin token* button | `UNAUTHENTICATED` |
| Tampered token | *Handshake con token alterado* button | `INVALID_TOKEN` |
| Empty message | *Enviar mensaje vacío* button | `400 VALIDATION_ERROR` with `content` detail |
| Another project's chat | *Leer chat de proyecto ajeno* button | `404 NOT_FOUND` |
| Coordinator opens a chat | Log in as *Coordinación*, select any project | `403 FORBIDDEN` |
| Message to a closed project | Log in as Sofía, select P3 and send | `409 CONFLICT` |
| Wrong password | Edit the password field before logging in | `401 INVALID_CREDENTIALS` |

The demo does not refresh tokens. After 15 minutes, requests fail with `TOKEN_EXPIRED`; log out and back in to continue.

## Troubleshooting

**`P1000: Authentication failed` against the database.** Check that `DATABASE_URL` uses the port from `POSTGRES_PORT` (`5433`), not `5432`. A PostgreSQL server installed natively on the host usually holds `5432`, so connections to that port reach it instead of the container.

**The container ignores the credentials in `.env`.** Credentials are only applied when the data volume is first created. After changing them, recreate the volume with `docker compose down -v`. **This deletes all data.** The Compose file uses `env_file` rather than `${VAR}` interpolation, so `POSTGRES_*` variables defined in the host shell do not override the file.

**The server exits with `Configuración de entorno inválida`.** A variable in `agora-backend/.env` is missing or malformed. The message names it.

**`@prisma/client did not initialize yet`.** Run `pnpm --filter agora-backend exec prisma generate`.

## License

[MIT](LICENSE)
