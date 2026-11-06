# Ágora — web client

The web client of Ágora: an Angular 22 single-page application built with standalone components, without zone.js (zoneless) and without server-side rendering. It is the presentation tier of the platform and the client of the backend's REST API and Socket.io server in `../agora-backend`.

## Read this first: Tailwind's theme is emptied

**`bg-red-500`, `p-4` and `min-w-0` generate nothing here, and nothing tells you.** There is no build error and no warning: the class stays in the template, no CSS comes out, and the element looks unstyled. If a utility seems to do nothing, this is almost certainly why.

`src/styles/theme.css` clears Tailwind's default colours, spacing, radii, shadows, font families, weights, sizes, line heights and letter spacing, and maps the project's tokens in their place. So any utility whose value comes from one of those scales only exists with a token name:

| Generates nothing                                    | Use instead                                                                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bg-red-500`, `bg-white`, `text-slate-700`           | `bg-arrecife`, `bg-superficie-00`, `text-tinta-media`                                                                                                |
| `p-4`, `gap-4`, `mt-2`                               | `p-espacio-4`, `gap-espacio-4`, `mt-espacio-2`                                                                                                       |
| `w-64`, `h-8`, `size-4`                              | `w-espacio-8`, `h-espacio-3`, `size-espacio-3`: only the spacing tokens exist                                                                        |
| `rounded-md`, `rounded`, `shadow-md`, `shadow`       | `rounded-radio-md`, `shadow-sombra-tarjeta`                                                                                                          |
| `text-sm`, `font-bold`, `leading-6`, `tracking-wide` | The text-style classes: `secundario`, `cuerpo-fuerte`, `titulo-pagina`…                                                                              |
| `min-w-0`, `p-0`, `top-0`, `inset-0`                 | Zero goes through the spacing scale too, so there is no utility. Write it in the component's CSS: `min-width: 0; /* sin token: flexbox mechanics */` |

The spacing scale is `espacio-1` to `espacio-6` and `espacio-8`: 4, 8, 12, 16, 24, 32 and 48px. There is no `espacio-7`.

**Not everything is gone.** Utilities that do not read those scales still work, so a class working does not prove it comes from a token: `flex`, `grid`, `hidden`, `w-full`, `mx-auto`, `grid-cols-3`, `z-10`, `text-center`, and the variants, such as `md:flex`. Some of them compile and are avoided on purpose, because their value is not ours:

- `rounded-full`, `rounded-none`: use `rounded-radio-pildora`.
- `opacity-45`, or any other number: use `opacity-opacidad-deshabilitado`.
- Fractions such as `w-1/2`: Tailwind computes them without the theme. No token backs them, and the code does not use them.
- Arbitrary values such as `bg-[#123456]` or `p-[13px]`: they always compile. If a value is missing, it goes into the design system first.

**To check a class,** build and look for it in the CSS. If it is not there, it does nothing:

```bash
pnpm --filter agora-frontend build
grep -oF 'p-espacio-4' agora-frontend/dist/agora-frontend/browser/*.css
```

A class with a variant is escaped in the CSS: search for `md\:flex`, not `md:flex`.

## Running it

Commands run from the repository root. Install dependencies once with `pnpm install` (see the root [README](../README.md)).

| Command                                                   | What it does                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm --filter agora-frontend start`                      | Development server at `http://localhost:4200/`, reloads on save                  |
| `pnpm --filter agora-frontend build`                      | Production build into `agora-frontend/dist/`. Checks that it compiles; see below |
| `pnpm --filter agora-frontend build:deploy`               | The build to publish. Requires `API_URL`                                         |
| `pnpm --filter agora-frontend test`                       | Unit tests with Vitest, in watch mode                                            |
| `pnpm --filter agora-frontend exec ng test --watch=false` | The same tests, once                                                             |

The client needs the backend running at `http://localhost:3000`, so start it first (see the root README). The port matters: the backend's `CORS_ORIGIN` defaults to `http://localhost:4200`, for both REST and Socket.io.

**The API address is fixed at build time.** `ng serve` uses `src/environments/environment.development.ts`, which points to `localhost:3000`. A production build reads the constant `AGORA_API_URL`, and a plain `build` leaves it empty, so its output cannot be published. `build:deploy` takes it from `API_URL` and fails if it is missing, is not `https`, or does not end in `/api/v1`. See _Deployment_ in the root README.

**Run `build` as well as `tsc`.** Some errors only the Angular compiler catches. There is no ESLint in this package: Prettier is the only formatter, and it runs on the files you touch, with `pnpm --filter agora-frontend exec prettier --write <files>`.

## Folder structure

```
agora-frontend/
├── public/               # static files served as-is
├── scripts/
│   └── build-deploy.mjs  # the production build: validates API_URL
├── vercel.json           # hosting: install, build, output and the SPA rewrite
└── src/
    ├── environments/     # the API address
    ├── styles/           # tokens.css, theme.css, layout.css
    ├── index.html        # host page; loads the fonts and declares the viewport
    ├── main.ts           # bootstraps the application
    ├── styles.css        # stylesheet entry point: only chains
    └── app/
        ├── app.config.ts # providers: router, HTTP, interceptor, session restore
        ├── app.routes.ts # every route, with its guards
        ├── core/         # no screens: logic that any screen uses
        ├── features/     # the screens
        └── shared/ui/    # reusable components with no knowledge of the domain's screens
```

| Folder                    | What lives there                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `core/api/`               | The typed HTTP client, one `*.api.ts` and `*.types.ts` per domain, and `api-error.ts`. Screens do not use `HttpClient` directly |
| `core/format/`            | Turning values into text: dates, budgets, file sizes, task figures                                                              |
| `core/navigation/`        | `restoreScrollOnceLoaded()`: gives the scroll position back when going back, once the data has arrived                          |
| `core/realtime/`          | `RealtimeService`, the Socket.io connection, and the event contract it listens to                                               |
| `core/session/`           | `SessionService`, the HTTP interceptor, the guards and `expireSession()`                                                        |
| `features/auth/`          | Sign-in and the session-expired screen                                                                                          |
| `features/chat/`          | What both chats share: the thread, the composer, the message and the timeline                                                   |
| `features/conversations/` | The private chats: the list and one conversation                                                                                |
| `features/home/`          | `/inicio`, one component per role                                                                                               |
| `features/notifications/` | The notification inbox                                                                                                          |
| `features/projects/`      | Every project screen, its forms, and what they share: `project-context.ts`, `project-permissions.ts`, `live-list.ts`            |
| `features/reports/`       | `/reportes`, and the figures that the coordination home reuses                                                                  |
| `features/shell/`         | The application frame: both bars, the account menu and the reconnection notice                                                  |
| `shared/ui/`              | Button, field, dialog, notice, tabs, skeleton, empty state, status pills, avatar, presence, file picker                         |

## Screens

Fifteen routes, all declared in `app.routes.ts`. Everything except the first two is a child of the shell, behind `authGuard`.

| Route                         | Who                    | What it does                                                                                                                                                          |
| ----------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/entrar`                     | Without a session      | Sign-in. There is no public registration. «Recordarme» and «¿Olvidaste tu contraseña?» are placeholders from the mockup: the backend has neither, and they do nothing |
| `/sesion-expirada`            | Without a session      | Explains that the session ended, and offers to sign in again                                                                                                          |
| `/inicio`                     | Everyone               | Where you land. Research accounts see their pending tasks across all their open projects, overdue first. Coordination sees the global figures                         |
| `/reportes`                   | Coordination           | Global figures, projects by status, and each project with the most overdue first                                                                                      |
| `/proyectos`                  | Everyone               | The list, with status filter, search and pagination, all kept in the URL. Each person sees only their projects; coordination sees all of them                         |
| `/proyectos/nuevo`            | Coordination           | Create a project and name its principal investigator                                                                                                                  |
| `/proyectos/:id`              | Members, coordination  | Summary and members. The principal investigator also closes the project, adds and removes members, and hands over the role                                            |
| `/proyectos/:id/editar`       | Principal investigator | Edit the project. Anyone else is sent to the detail                                                                                                                   |
| `/proyectos/:id/cronograma`   | Members, coordination  | Phases, in order. The principal investigator manages and reorders them                                                                                                |
| `/proyectos/:id/tareas`       | Members, coordination  | Tasks and dependencies. The principal investigator manages them; whoever is assigned a task can change its status                                                     |
| `/proyectos/:id/avances`      | Members, coordination  | Progress entries. Any member adds them; only the author edits                                                                                                         |
| `/proyectos/:id/documentos`   | Members, coordination  | Upload, download and versions                                                                                                                                         |
| `/proyectos/:id/conversacion` | Members                | The project chat, with history, unread count and presence. Coordination is sent to the detail                                                                         |
| `/conversaciones`             | Everyone               | Your private chats, most recent first, and who you can start one with                                                                                                 |
| `/conversaciones/:id`         | Participants           | One private chat. There is no presence, and with a deactivated account it can be read but not written to. Anyone else gets the not-found screen                       |

Two pieces have no route: the **notification inbox** and the **account menu**, both in the shell. Below `md` the inbox takes the whole screen, and it is still the same panel.

**Who sees what is the backend's decision,** and the client mirrors it: nobody sees a button the backend would refuse. A project you do not belong to, and a malformed id, show the same not-found screen on purpose: telling them apart would confirm which ids are real. Closed projects are read-only.

Coordination does not join project rooms, so its screens are a snapshot and need a reload to show what changed. That is a decision, not a gap: inside the rooms, presence would announce it in projects it does not belong to.

## Session flow

Two tokens. The **access token** lives only in memory, in `SessionService`. The **refresh token** lives in `sessionStorage`, so it survives a reload and each tab keeps its own session. There are no cookies. The token travels in the `Authorization` header, and in `auth.token` during the Socket.io handshake.

- **Signing in:** `SessionService.login()` stores both tokens, and the screen navigates to `/inicio`.
- **Reloading:** `restore()` runs in the application initializer, before the first navigation, so the guards already know the answer. If the tab has a refresh token, it renews and reads the profile. If that fails, you go to `/entrar`, not to the expired screen: nothing was interrupted.
- **On every request:** `authInterceptor` adds the access token.
- **When the access token expires:** the API answers `TOKEN_EXPIRED`. The interceptor calls `SessionService.renew()` and repeats the request, once. The person notices nothing.
- **When the session is really over:** a rejected renewal or `INVALID_TOKEN` ends in `expireSession()`, which clears the session and goes to `/sesion-expirada`.
- **Signing out:** the local session ends first, then the backend revokes the refresh token. If that call fails, the token expires by itself after seven days.

**All renewal goes through `SessionService.renew()`, always.** It shares the one in progress, and that is not an optimisation. `/refrescar` rotates the token, so a second renewal in parallel would arrive with a token already revoked. The backend treats that as theft and revokes every session of that person. `RealtimeService` uses the same `renew()` for the socket: if it renewed on its own, the two channels would compete.

`SessionService` does not use the typed client, on purpose: its requests carry `SESSION_REQUEST`, and the interceptor leaves them alone. If the `401` of `/refrescar` went through the interceptor, it would end up waiting for itself.

**Known limitation:** duplicating a browser tab copies its `sessionStorage`, so two tabs share a refresh token. The first to renew revokes it for the other, and the reuse detection then closes both. Open new tabs instead.

## Trying it with the seed accounts

Set up the backend as described in the root README, load the seed with `pnpm --filter agora-backend seed`, and start both servers. The accounts and their passwords are in _Seed accounts_ in the root README. Running the seed again restores what it created.

| Sign in as                   | What to check                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `coordinacion@example.com`   | Lands on the global figures. Sees P1, P2 and P3, and has «Crear proyecto». Inside a project there is no Conversación tab and no management button |
| `laura.mendoza@example.com`  | Lands on the pending tasks of that account. Sees only P1, and manages it: edit, close, members, phases, tasks                                     |
| `carlos.beltran@example.com` | Sees P2 and P3. P3 is closed: read-only, and its chat composer is disabled                                                                        |
| `andres.pardo@example.com`   | Co-investigator in P1. Can change the status of an assigned task, and nothing else on it                                                          |
| `daniel.osorio@example.com`  | Sees only P2. Pasting the address of P1 shows the not-found screen                                                                                |

**Real time needs two people at once.** Each tab keeps its own session, so open a new tab and sign in with another account, such as Laura and Andrés in the conversation of P1. Messages, presence and task changes arrive without reloading.

**To see the silent refresh,** set `JWT_EXPIRES_IN=10s` in `agora-backend/.env`, restart the backend, and keep using the application: requests keep working, and `/auth/refrescar` shows up in the network panel.

**Narrow screens:** below 768px the top bar gives way to the bottom bar. Its five destinations use short labels: «Chat» is «Mensajes» on the top bar, and «Avisos» is «Notificaciones» from `lg` up.

## Conventions

### Types say what the backend really returns

Not what would be convenient. Whatever arrives as `null` is `| null`, never an optional field; optional fields are only for request bodies.

- `budget` is `string | null`: it is a Prisma `Decimal`, so it goes out as a number and comes back as a string.
- Dates are `string`, not `Date`: the client hands over the ISO text, and whoever displays it converts it.
- `ProjectListItem` extends `Project` with `principalInvestigator` and `memberCount`, because only the list returns them. It has its own name so that a screen holding a `Project` cannot read a `memberCount` that never arrived.

Each API method returns the object, not the envelope: `{ project }` is unwrapped in the client, not in every screen.

### Errors: `apiErrorOutcome()`

Screens do not interpret errors. They pass whatever they caught to `apiErrorOutcome()` in `core/api/api-error.ts`, and it says what to do:

| `kind`    | When                                                     | What the screen does                                                          |
| --------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `fields`  | `VALIDATION_ERROR` with field details                    | Shows `fields[name]` under each field, and `message` if it cannot place any   |
| `message` | Every other code, a network failure, or anything unknown | Shows `message` in an `app-notice`                                            |
| `none`    | `TOKEN_EXPIRED`, `INVALID_TOKEN`, a session that ended   | Nothing: the interceptor already resolved it, and the person sees the outcome |

**The codes are a closed list** because they are the public contract: `ERROR_CODES` is a copy of the backend's. The client decides from the `code`, never from the `message`, which is text for people and can change. Every code has its default text in `DEFAULT_MESSAGES`, typed as `Record<ErrorCode, string>`, so adding a code without a text does not compile.

The second argument replaces the text of a code for one action, when it knows better: `apiErrorOutcome(error, { CONFLICT: 'Este proyecto ya estaba cerrado.' })`.

`NOT_FOUND` never distinguishes «does not exist» from «no access»: the backend answers `404` to non-members precisely to hide that.

### Loading, empty and error

Every screen with data has these three states, built from the same pieces in `shared/ui/`:

```html
<!-- Always in the template, and outside the aria-busy container. -->
<app-loading-status [loading]="loading()" />

<main [attr.aria-busy]="loading() || null">
  @if (errorMessage(); as message) {
  <app-notice tone="error">
    {{ message }}
    <button appButton variant="secondary" type="button" noticeAction (click)="reload()">
      Reintentar
    </button>
  </app-notice>
  } @if (loading()) {
  <div class="bg-superficie-00 rounded-radio-md p-espacio-4 grid gap-espacio-2">
    <app-skeleton class="cuerpo-fuerte" />
    <app-skeleton class="secundario" />
  </div>
  } @else if (items().length === 0) {
  <app-empty title="…" description="…" />
  } @else {
  <!-- the content -->
  }
</main>
```

- `app-loading-status` is an `aria-live` region. It stays in the template because a live region only announces changes to its text, and outside `aria-busy` because some screen readers hold back what is inside.
- A skeleton has the shape of what is coming. The text-style class on it is what gives it the right height. It does not animate: the design system keeps continuous motion for presence.
- `app-empty` has no default text, because «there are no projects yet» and «nothing matches your search» need different words and different actions. An empty state is an invitation: it says what is missing and offers the action.
- Skeletons only show on the first load. A reload keeps the content.
- A failed reload must not wipe what was there. `resource()` loses its value on error, so lists fed by events use `LiveList` instead.

### Events carry the project id, and the client asks again

A domain event only says which project changed: `{ projectId }`. The client fetches the list again, so creating, editing and deleting all behave the same and nobody has to merge partial changes. `refreshOnLiveEvents()` in `features/projects/project-context.ts` wires this up, and also fetches again after a reconnection, because what happened offline was never delivered.

The exceptions are the events whose content is the point: `chat:mensaje` and `notificacion:nueva` carry the whole object, and the presence events carry who changed.

**The socket only listens.** Every change goes through REST, and the backend emits after saving. There are no client-to-server events.

**Anything arriving over the socket lives in a signal.** The application is zoneless: nothing re-renders after an event unless a signal changes. Pushing into a plain array does not redraw the view, and the failure is silent.

### Breakpoints

The breakpoints are Tailwind's defaults, kept on purpose: the design system does not define its own, and `theme.css` does not clear them. They are mobile-first, so `md:` applies from that width up.

| Prefix | Min width (rem) | Min width (px) |
| ------ | --------------- | -------------- |
| `sm:`  | 40rem           | 640px          |
| `md:`  | 48rem           | 768px          |
| `lg:`  | 64rem           | 1024px         |
| `xl:`  | 80rem           | 1280px         |
| `2xl:` | 96rem           | 1536px         |

**`md` is the responsive breakpoint.** Below it there is a bottom bar instead of the top bar, the inbox takes the whole screen, and row actions go under the text. `max-md:` applies below it. Check every screen at 360px: none may scroll sideways.

The bar is chosen with `matchMedia` in `shell.ts`, not with CSS, so that the bottom bar can come after the content in the DOM and only one inbox exists at a time. In CSS files, write the same breakpoint as `@media (width < 48rem)`.

### Values that are not tokens

Every value that does not come from a token goes in the CSS of its screen or component, with a comment that says `sin token` and why:

```css
.barra-inferior {
  position: sticky;
  bottom: 0; /* sin token: pegada al borde, y `bottom-0` no genera CSS */
}
```

No tool enforces this: review does. A missing value is added to the design system first when it is a design value. When it is mechanics, such as `min-width: 0`, it stays in the CSS with its comment.

## Styles

Styling uses Tailwind CSS 4, but every value comes from the Ágora design system: Tailwind supplies the utility classes and the design system supplies the values.

```
src/
├── styles.css        # entry point: only chains the files below
└── styles/
    ├── tokens.css    # generated from the design system: the values
    ├── theme.css     # bridge: maps the tokens into Tailwind's theme
    └── layout.css    # the one rule that belongs to the document, not to a component
```

**`styles.css` only chains**, in this order:

```css
@import 'tailwindcss';
@import './styles/tokens.css' layer(base);
@import './styles/theme.css';
@import './styles/layout.css';
```

`tokens.css` goes into the `base` layer so that utilities can override its rules. Without it, its `body`, `:focus-visible` and text-style rules would beat any utility, and a component could not, for example, change the focus ring with `focus-visible:outline-…`.

**`tokens.css` is generated from the design system. Do not edit it by hand.** It holds every value: colours, shadow, spacing, radii, font families, the text-style classes (`.cuerpo`, `.titulo-pagina`…) and the base rules for `body` and `:focus-visible`. Prettier ignores it. The design system is frozen and lives outside this repository.

**`theme.css` is the bridge, and it contains no values.** After clearing the defaults, it maps each token onto a Tailwind theme variable that only references it:

```css
@theme inline {
  --color-veril: var(--veril); /* bg-veril, text-veril, border-veril… */
  --spacing-espacio-4: var(--espacio-4); /* p-espacio-4, gap-espacio-4, mt-espacio-4… */
  --radius-radio-md: var(--radio-md); /* rounded-radio-md */
}
```

Font families, sizes and weights have no utilities. They come only from the text-style classes, so there is a single way to set type. Text-style classes combine with utilities in the same `class` attribute.

**Fonts are loaded with `<link>` in `src/index.html`, not from `tokens.css`.** An `@import` is only valid before every other rule in a stylesheet. Chained after Tailwind, it would land in the middle of the final CSS, and the browser ignores it without any error, so the interface silently falls back to system fonts.

## Traps

Each of these has already cost time, and none of them announces itself.

- **`viewChild` does not work on ES private fields.** `readonly #box = viewChild(…)` passes `tsc` and fails only in the Angular compiler, with `NG1053`: use TypeScript's `private`, and run `build`.
- **`field-sizing: content` makes the browser ignore `rows`.** An empty textarea collapses, so `FieldTextarea` reads the `rows` attribute and sets it back as a `min-height`.
- **Never use `type="number"` for money.** Chromium drops the second thousands separator and still reports the value as valid: «48.500.000» became `48.5`. The budget is a text input with `inputmode="numeric"` and a digits-only check.
- **`date` columns are read in UTC, `timestamptz` columns in local time, and mixing them changes the day.** A `date` arrives at midnight UTC, the previous evening in Colombia, so use `formatProjectPeriod()` or `formatDueDate()`. A `timestamptz` is a real instant, so use `formatLocalDay()`.
