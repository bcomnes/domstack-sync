# fragtml UI Rendering Plan

Goal: replace the UI's Handlebars and `@fastify/view` rendering path with `fragtml`, while keeping the htmx behavior based on fragments from larger templates rather than separate partial-only templates.

## Findings

- `[x]` The htmx template-fragments article describes fragments as named sub-sections inside a larger server template. For this UI, the fragment should mark the content inside the layout's `<main id="main">`, not wrap every individual page template as if each page were its own fragment root.
- `[x]` `fragtml` directly supports that model with `createHtml({ fragmentId })`, `html.fragment.start(id)`, and `html.fragment.end`. Rendering with a fragment id extracts only that named section from the larger rendered template.
- `[x]` `fragtml` escapes normal substitutions by default. Trusted HTML insertion must stay explicit through `raw()`, matching the old Handlebars rule where only plugin markup and already-rendered page bodies used triple-stash/raw insertion.
- `[x]` `fragtml` supports boolean attributes with the `?attr=${value}` syntax, which replaces custom Handlebars helpers like `{{checked active}}`.
- `[x]` `@fastify/view` has a fixed supported-engine path and does not provide a clean arbitrary custom engine integration for fragtml's function-template model. Keeping `@fastify/view` would require awkward adapter behavior, so a local renderer is the cleaner implementation.
- `[x]` Page templates do not need a passed-around bound `html` context. The module-level `html` tag is enough for normal templates and helpers; only fragment extraction needs a bound tag from `createHtml({ fragmentId })`.

## Implementation Tracker

- `[x]` Add `fragtml` as the rendering dependency.
- `[x]` Remove direct runtime dependencies on `@fastify/view` and `handlebars`.
- `[x]` Replace `reply.view()`/`fastify.view()` usage with local HTML rendering helpers.
- `[x]` Move UI rendering into `lib/ui/templates/`.
- `[x]` Split page templates into page-specific files under `lib/ui/templates/pages/`.
- `[x]` Keep shared nav, form, and connection-list templates in `lib/ui/templates/components/`.
- `[x]` Keep the layout ignorant of page routing by passing already-selected child content into `layoutTemplate()`.
- `[x]` Keep full-page UI responses as full layout renders.
- `[x]` Render htmx action responses by rendering the same layout and extracting the `main` fragment.
- `[x]` Keep individual page templates as plain page markup rather than wrapping each template in its own fragment.
- `[x]` Use the module-level `html` tag in templates and helper functions instead of passing a tag argument through every function.
- `[x]` Use `raw()` only for trusted plugin-provided markup.
- `[x]` Remove obsolete `.hbs` templates.
- `[x]` Rename UI rendering tests away from Handlebars language.
- `[x]` Add regression coverage that fragment responses do not include a full document or nested `<main>`.

## Validation Tracker

- `[x]` `npm run test:tsc`
- `[x]` `npm run test:lint`
- `[x]` `npm run test:node-test`
- `[x]` `npm run test:playwright`

## Follow-Up Cleanup

- `[ ]` Update any older planning prose that still describes the current UI renderer as Handlebars.
- `[ ]` Consider adding direct unit coverage for `renderUiFragment()` to assert it extracts the layout's `main` fragment for every built-in page.
- `[ ]` Re-check plugin page behavior if future plugin templates move beyond trusted static markup strings.

## References

- htmx template fragments: https://htmx.org/essays/template-fragments/
- `@fastify/view` / point-of-view: https://github.com/fastify/point-of-view
- fragtml: https://github.com/bcomnes/fragtml
