# Ágora — web client

The web client of Ágora: an Angular 22 single-page application built with standalone components, without zone.js (zoneless) and without server-side rendering. It is the presentation tier of the platform and the client of the backend's REST API and Socket.io server in `../agora-backend`.

## Running it

Commands run from the repository root. Install dependencies once with `pnpm install` (see the root [README](../README.md)).

| Command | What it does |
| --- | --- |
| `pnpm --filter agora-frontend start` | Development server at `http://localhost:4200/`, reloads on save |
| `pnpm --filter agora-frontend build` | Production build into `agora-frontend/dist/` |
| `pnpm --filter agora-frontend test` | Unit tests with Vitest |

The client needs the backend running at `http://localhost:3000`, so start it first (see the root README). The port matters: the backend's `CORS_ORIGIN` defaults to `http://localhost:4200`, for both REST and Socket.io.

## Styles

Styling uses Tailwind CSS 4, but every value comes from the Ágora design system: Tailwind supplies the utility classes and the design system supplies the values.

```
src/
├── styles.css        # entry point: only chains the three below
└── styles/
    ├── tokens.css    # generated from the design system: the values
    └── theme.css     # bridge: maps the tokens into Tailwind's theme
```

**`styles.css` only chains**, in this order:

```css
@import 'tailwindcss';
@import './styles/tokens.css' layer(base);
@import './styles/theme.css';
```

`tokens.css` goes into the `base` layer so that utilities can override its rules. Without it, its `body`, `:focus-visible` and text-style rules would beat any utility, and a component could not, for example, change the focus ring with `focus-visible:outline-…`.

**`tokens.css` is generated from the design system. Do not edit it by hand.** It holds every value: colours, shadow, spacing, radii, font families, the text-style classes (`.cuerpo`, `.titulo-pagina`…) and the base rules for `body` and `:focus-visible`. If a value is missing, add it to the design system first and regenerate the file.

**`theme.css` is the bridge, and it contains no values.** It first clears Tailwind's defaults with `*: initial` (colours, spacing, radii, shadows, font families, weights, sizes, line heights and letter spacing). Then it maps each token onto a Tailwind theme variable that only references it:

```css
@theme inline {
  --color-veril: var(--veril);              /* bg-veril, text-veril, border-veril… */
  --spacing-espacio-4: var(--espacio-4);    /* p-espacio-4, gap-espacio-4, mt-espacio-4… */
  --radius-radio-md: var(--radio-md);       /* rounded-radio-md */
}
```

Font families, sizes and weights have no utilities. They come only from the text-style classes, so there is a single way to set type. Text-style classes combine with utilities in the same `class` attribute.

**Fonts are loaded with `<link>` in `src/index.html`, not from `tokens.css`.** An `@import` is only valid before every other rule in a stylesheet. Chained after Tailwind, it would land in the middle of the final CSS, and the browser ignores it without any error, so the interface silently falls back to system fonts. The `<link>` requests IBM Plex Sans at 400, 500 and 600 and IBM Plex Sans Condensed at 600, which are exactly the weights the text styles use.

## Breakpoints

The breakpoints are Tailwind's defaults, kept on purpose: the design system does not define its own, and `theme.css` does not clear them. They are mobile-first, so `md:` applies from that width up.

| Prefix | Min width (rem) | Min width (px) |
| --- | --- | --- |
| `sm:` | 40rem | 640px |
| `md:` | 48rem | 768px |
| `lg:` | 64rem | 1024px |
| `xl:` | 80rem | 1280px |
| `2xl:` | 96rem | 1536px |

## Usage rules

No tool enforces these rules. They are conventions, and code review is what keeps them.

- **No Tailwind palette.** `bg-red-500`, `text-slate-700` or `bg-white` generate no CSS here, because `theme.css` clears them, but they must not appear in templates either.
- **No arbitrary values.** Neither `bg-[#hex]` nor `p-[13px]`. Tailwind always compiles them and cannot forbid them. If a value is missing, it is added to the design system first.
- **No `rounded-full`, `rounded-none` or `opacity-45`.** They exist even with the theme cleared and do not come from the tokens: the first two are fixed Tailwind utilities, and opacity accepts any number without going through the theme. Clearing the theme cannot remove them, so they are avoided by convention. Avatars and the presence dot use `rounded-radio-pildora`; dimming uses `opacity-opacidad-deshabilitado`.
- **Any state that arrives over the socket lives in a signal.** The application is zoneless: nothing re-renders after an event unless a signal changes. Pushing into a plain array does not redraw the view, and the failure is silent.
