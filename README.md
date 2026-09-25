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
| Node.js | 20.20.2 LTS | |
| pnpm | 10.28.2 | Workspace at the repository root |
| TypeScript | 6.0.3 | Pinned: TypeScript 7 has no stable programmatic API yet |
| Express | 5.2.1 | Async errors reach the error handler without wrappers |
| Socket.io | 4.8.3 | Also serves its own browser client bundle |
| Prisma / @prisma/client | 6.19.3 | Pinned; both versions must match |
| PostgreSQL | 16-alpine | Runs in Docker |
| jsonwebtoken | 9.0.3 | Access tokens |
| bcryptjs | 3.0.3 | Password hashing, pure JS |
| Zod | 4 | Request and environment validation |

## Repository layout

```
agora-platform/
├── agora-backend/
│   ├── prisma/              # schema, migrations and seed
│   └── src/
│       ├── config/          # validated environment, Prisma instance
│       ├── middlewares/     # authenticate, authorize, project access, validate, errors
│       ├── modules/         # auth, projects, chat (one folder per domain)
│       ├── routes/v1.ts     # mounts every module under /api/v1
│       ├── sockets/         # Socket.io: event contract, handshake, rooms, emitter
│       ├── app.ts           # Express application
│       └── server.ts        # HTTP server + Socket.io
├── docs/
│   ├── demo/                # HTML connectivity demo client
│   └── postman/             # Postman collection
├── docker-compose.yml       # PostgreSQL
└── pnpm-workspace.yaml
```

## Requirements

- **Node.js 20.20.2**
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
| `POST` | `/registro` | — | `{ email, password, fullName }` | `201 { user }`. Always created as `RESEARCHER`. |
| `POST` | `/iniciar-sesion` | — | `{ email, password }` | `200 { user, accessToken, refreshToken }` |
| `POST` | `/refrescar` | — | `{ refreshToken }` | `200 { accessToken, refreshToken }`. The old token is revoked. |
| `POST` | `/cerrar-sesion` | — | `{ refreshToken }` | `204`. Idempotent. |
| `GET` | `/perfil` | Token | — | `200 { user }`, read from the database |

Reusing a refresh token that was already revoked revokes **every** session of that user.

**Projects** — `/api/v1/proyectos`

| Method | Route | Who | Body / query | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Any user (only visible projects) | `?estado=&buscar=&pagina=1&porPagina=20` | `200 { items, total, page, perPage }` |
| `POST` | `/` | Coordinator | `{ title, principalInvestigatorId, description?, objectives?, startDate?, endDate?, budget? }` | `201 { project }` |
| `GET` | `/:projectId` | Member or coordinator | — | `200 { project }` |
| `PATCH` | `/:projectId` | Principal investigator | At least one of `title`, `description`, `objectives`, `status`, `startDate`, `endDate`, `budget` | `200 { project }` |
| `POST` | `/:projectId/cerrar` | Principal investigator | — | `200 { project }`. Sets `COMPLETED`; the project becomes read-only. |
| `GET` | `/:projectId/miembros` | Member or coordinator | — | `200 { members }` |
| `POST` | `/:projectId/miembros` | Principal investigator | `{ email }` | `201 { members }` |
| `DELETE` | `/:projectId/miembros/:userId` | Principal investigator | — | `204` |

Dates use the `YYYY-MM-DD` format.

**Project chat** — `/api/v1/proyectos/:projectId/mensajes`

| Method | Route | Who | Body / query | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Project member | `?antes=<messageId>&limite=50` (1–100) | `200 { messages, nextCursor }` |
| `POST` | `/` | Project member | `{ content }` (1–2000 characters, trimmed) | `201 { message }`, then emits `chat:mensaje` |

The history uses cursor pagination. Each page comes back in chronological order. To load older messages, pass the page's `nextCursor` as `antes`; `nextCursor` is `null` when there is no more history. The coordinator can see projects but does not take part in their chats (`403`). Sending to a `COMPLETED` project returns `409`.

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

Rooms follow membership changes live. Adding someone to a project, or removing them, updates the rooms of all their open sockets without a reconnect. The coordinator joins no project rooms.

### Server → client events

There are no client → server events: all changes go through REST.

| Event | Emitted to | Payload | When |
| --- | --- | --- | --- |
| `chat:mensaje` | `proyecto:{id}` | `{ id, projectId, content, createdAt, sender: { id, fullName } }` | After a message sent with `POST /proyectos/:projectId/mensajes` is saved |
| `usuario:conectado` | The person's project rooms | `{ userId, projectId }` | The person's **first** socket connects |
| `usuario:desconectado` | The person's project rooms | `{ userId, projectId }` | The person's **last** socket disconnects |

`chat:mensaje` has the same shape as the `message` returned by the REST call. The event also goes back to the sender. The tab that sent the message already has it from the REST response and discards the duplicate by `id`, while the sender's other tabs display it.

Presence is tracked per person, not per tab: opening a second tab does not announce the person again.

Planned for Deliveries 3 and 4: `avance:creado`, `tarea:actualizada`, `documento:subido`, `cronograma:modificado`.

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
