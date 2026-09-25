# Design Tokens

- Version: 1.0
- Status: Accepted
- Related: design-principles.md, technical-architecture.md, .cursor/rules/ui.mdc

Tokens before components. Define values once; every component, style, and Cursor-generated class references the same source. Changing a value in one place updates the whole product.

---

## 1. Approach — Tailwind 4 `@theme`

Tailwind CSS 4 defines tokens in CSS, not in `tailwind.config.js`. The `@theme` block in `src/app/globals.css` is the single source of truth. Tailwind turns each token into a utility class; the browser exposes it as a native CSS variable; plain CSS and Cursor-generated styles all speak the same language.

```css
/* src/app/globals.css */
@import "tailwindcss";

@theme {
  /* tokens go here */
}
```

Rules:
- Never use arbitrary Tailwind values (`text-[14px]`, `bg-[#3b82f6]`). Use a token.
- Never hardcode hex, rgb, or hsl values in JSX or component files.
- Add a new token to `@theme` before using a new value anywhere.
- The `@apply` directive is deprecated in Tailwind 4 — write explicit CSS properties instead.

---

## 2. Primitive tokens

Raw scales. Not used directly in components — semantic tokens map to these.

```css
@theme {
  /* Blue ramp */
  --color-blue-50: oklch(97% 0.02 250);
  --color-blue-100: oklch(93% 0.05 250);
  --color-blue-200: oklch(87% 0.09 250);
  --color-blue-300: oklch(79% 0.13 250);
  --color-blue-400: oklch(68% 0.17 250);
  --color-blue-500: oklch(56% 0.20 250);
  --color-blue-600: oklch(46% 0.18 250);
  --color-blue-700: oklch(38% 0.15 250);
  --color-blue-800: oklch(29% 0.11 250);
  --color-blue-900: oklch(20% 0.07 250);

  /* Neutral ramp */
  --color-neutral-50: oklch(98% 0.005 250);
  --color-neutral-100: oklch(95% 0.008 250);
  --color-neutral-200: oklch(90% 0.01 250);
  --color-neutral-300: oklch(82% 0.012 250);
  --color-neutral-400: oklch(70% 0.012 250);
  --color-neutral-500: oklch(56% 0.012 250);
  --color-neutral-600: oklch(44% 0.01 250);
  --color-neutral-700: oklch(33% 0.008 250);
  --color-neutral-800: oklch(22% 0.006 250);
  --color-neutral-900: oklch(13% 0.004 250);

  /* Amber ramp (reconnect / at-risk signals) */
  --color-amber-400: oklch(78% 0.17 75);
  --color-amber-500: oklch(68% 0.19 72);
  --color-amber-600: oklch(56% 0.18 68);
}
```

---

## 3. Semantic tokens

Map human intent to primitives. Components use semantic tokens, never primitives directly.

```css
@theme {
  /* Surfaces */
  --color-surface-primary: var(--color-neutral-50);
  --color-surface-secondary: var(--color-neutral-100);
  --color-surface-raised: white;

  /* Text */
  --color-text-primary: var(--color-neutral-900);
  --color-text-secondary: var(--color-neutral-600);
  --color-text-muted: var(--color-neutral-400);
  --color-text-inverse: white;

  /* Borders */
  --color-border-default: var(--color-neutral-200);
  --color-border-strong: var(--color-neutral-300);

  /* Interactive */
  --color-interactive-primary: var(--color-blue-600);
  --color-interactive-hover: var(--color-blue-700);
  --color-interactive-subtle: var(--color-blue-50);
}
```

---

## 4. Ecosystem-specific tokens

These are unique to this product. Every component that renders relationship data uses these — never ad-hoc colours.

### 4.1 Owner palette

One colour per team member in `src/config/team-members.json` — used in Orbit nodes, profile headers, and anywhere owner attribution appears. Defined as CSS tokens in `src/app/globals.css` and mirrored dynamically in `src/config/owner-colours.ts`.

```css
@theme {
  --color-owner-jordan: oklch(62% 0.18 330);
  --color-owner-priya: oklch(62% 0.18 10);
  --color-owner-sam: oklch(62% 0.18 35);
  --color-owner-taylor: oklch(62% 0.18 175);
  --color-owner-morgan: oklch(62% 0.18 290);
  --color-owner-default: var(--color-neutral-400); /* fallback for members without a colour */
}
```

TypeScript mirror — `src/config/owner-colours.ts` builds from `TEAM_MEMBERS`:

```ts
export const OWNER_COLOURS: Record<string, string> = Object.fromEntries(
  TEAM_MEMBERS.map((member) => [member.id, member.colourToken]),
);

export function ownerColour(userId: string): string {
  return OWNER_COLOURS[userId] ?? "var(--color-owner-default)";
}
```

Never hardcode an owner's colour anywhere else. Always call `ownerColour(userId)`.

### 4.2 Relationship strength

```css
@theme {
  --color-strength-inner-circle: oklch(62% 0.18 250);  /* same blue as primary interactive */
  --color-strength-strong:       oklch(62% 0.16 200);
  --color-strength-warm:         oklch(62% 0.14 145);
  --color-strength-weak:         oklch(62% 0.08 145);
  --color-strength-unknown:      var(--color-neutral-300);

  /* Orbit recency bands */
  --color-recency-active:    var(--color-strength-strong);
  --color-recency-reconnect: var(--color-amber-500);  /* warming signal */
  --color-recency-dormant:   var(--color-neutral-400); /* greyed out */
}
```

### 4.3 Data state — confirmed vs inferred

This is a design principle (Honest inference). Any inferred or computed data must be visually distinct everywhere it appears.

```css
@theme {
  --color-data-confirmed:   var(--color-text-primary);
  --color-data-inferred:    var(--color-text-secondary);
  --color-data-pending:     var(--color-amber-500);

  --border-data-inferred:   2px dashed var(--color-border-default);
  --border-data-confirmed:  1px solid var(--color-border-default);
}
```

Usage rule: inferred connections, inferred company relationships, and email-participant-review profiles all use `--color-data-inferred` text and `--border-data-inferred` borders. Never render inferred data with confirmed styling.

---

## 5. Typography scale

shadcn/ui sets the base. Override semantically — don't reach for raw sizes.

```css
@theme {
  --text-display: 1.5rem;    /* 24px — page titles */
  --text-heading: 1.125rem;  /* 18px — section headings */
  --text-subheading: 1rem;   /* 16px — card titles, tab labels */
  --text-body: 0.9375rem;    /* 15px — body copy */
  --text-caption: 0.8125rem; /* 13px — metadata, timestamps */
  --text-label: 0.75rem;     /* 12px — tags, badges */

  --font-weight-normal: 400;
  --font-weight-medium: 500;  /* Use for headings and labels only — never 600 or 700 */
}
```

---

## 6. Spacing and layout

Based on a 4px base unit. Reference the scale, never use arbitrary pixel values.

```css
@theme {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-12: 3rem;     /* 48px */

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;  /* pills and avatars */
}
```

---

## 7. Component variants — Class Variance Authority (CVA)

For components with multiple states or sizes, use CVA to define controlled variants. Do not use long conditional class strings in JSX.

Example — relationship strength badge:

```ts
import { cva } from 'class-variance-authority'

export const strengthBadge = cva(
  'inline-flex items-center rounded-full text-label font-medium px-2 py-0.5',
  {
    variants: {
      strength: {
        inner_circle: 'bg-interactive-subtle text-strength-inner-circle',
        strong:       'bg-interactive-subtle text-strength-strong',
        warm:         'bg-interactive-subtle text-strength-warm',
        weak:         'bg-neutral-50 text-strength-weak',
        unknown:      'bg-neutral-50 text-strength-unknown',
      },
      inferred: {
        true:  'border border-dashed border-border-default',
        false: '',
      },
    },
    defaultVariants: { strength: 'unknown', inferred: false },
  }
)
```

Rule: any component with 3+ visual states gets a CVA definition. No ad-hoc conditional class strings.

---

## 8. What still needs doing (deferred from v1)

These require 2–3 hero screens before they can be decided:

- Motion and transition durations
- Shadow scale (if any — prefer flat)
- Orbit-specific visual language (node chrome, ring appearance) — see `docs/specs/orbit-interaction.md` (expand before Phase 2 Orbit UI)
- Dark mode overrides (shadcn handles most; Ecosystem-specific tokens may need a `.dark` override block)
