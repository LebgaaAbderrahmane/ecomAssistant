# Frontend stack: Radix behavior, custom tokens, TanStack data

The dashboard is React 18 + Vite + Tailwind 3 with hand-written components. It has no data layer, no form library, no primitive library, and no design tokens. Pages re-implement fetching, loading, cursors, and resource types.

We keep React + Vite + Tailwind and add:

- **Radix primitives** for behavior (dialog, drawer, popover, dropdown, tabs, tooltip, switch, checkbox, select). Styling stays ours.
- **Custom design tokens** as CSS variables mapped into Tailwind. No default shadcn theme.
- **TanStack Query** for server state; one typed client generated from OpenAPI or shared schemas.
- **TanStack Table** for the order ledger (sorting, selection, column visibility, density).
- **React Hook Form + zod** for forms.
- **CSS transitions only** for motion. No Framer Motion.

## Considered options

- **shadcn/ui defaults.** Fast, but produces the exact generic look the rework is meant to remove. Radix without the default theme keeps behavior and avoids the sameness.
- **MUI or Chakra.** Complete, but heavy, opinionated, and hard to make distinctive.
- **Build every primitive from scratch.** Full control, but re-implements focus traps and keyboard behavior badly.
- **Radix + tokens + TanStack.** Chosen.

## Consequences

- Roughly 30 primitives to build and document on `/design`.
- Bundle grows by Radix + TanStack; lazy routes and tree-shaking keep the initial payload under 250KB gzip.
- The typed client becomes a build dependency: an API change without regeneration fails CI.
- The landing app (Next 16 / React 19) stays separate for now; unifying it is a follow-up, not a blocker.
