import html from 'fragtml'
import { navTemplate } from './components/nav.ts'
import { MAIN_FRAGMENT, type UiTemplateContext } from './types.ts'
import type { HtmlResult, HtmlSubstitution } from 'fragtml/types.js'

export interface LayoutOptions {
  context: UiTemplateContext
  children: HtmlSubstitution
}

export function layoutTemplate ({ context, children }: LayoutOptions): HtmlResult {
  return html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${context.title} - domstack-sync</title>
      <link rel="stylesheet" href="/app.css">
    </head>
    <body>
      ${navTemplate(context.navLinks)}
      <main
        id="main"
        class="main"
        hx-get="${context.path}"
        hx-trigger="bs:state-update from:body"
        hx-select=".page"
        hx-swap="innerHTML"
      >
        ${html.fragment.start(MAIN_FRAGMENT)}
        ${children}
        ${html.fragment.end}
      </main>
      <script type="module" src="/app.js"></script>
    </body>
    </html>
  `
}
