import html from 'fragtml'
import { toggleTemplate } from '../components/forms.ts'
import type { PageTemplate } from '../types.ts'

export const remoteDebugPageTemplate: PageTemplate = context => {
  const { remoteDebug } = context

  return html`
    <div class="page">
      <h1 class="page__title">Remote Debug</h1>

      <div class="card">
        <h2 class="card__title">Client Files</h2>
        <ul class="option-list">
          ${remoteDebug.clientFiles.map(file => html`
            <li class="option-item">
              <div class="option-item__text"><strong>${file.title}</strong></div>
              <form method="post" action="/actions/remote-debug/file" hx-post="/actions/remote-debug/file" hx-target="#main" hx-swap="innerHTML">
                <input type="hidden" name="name" value="${file.name}">
                <input type="hidden" name="returnTo" value="/remote-debug">
                ${toggleTemplate(file.active)}
              </form>
            </li>
          `)}
        </ul>
      </div>

      <div class="card">
        <h2 class="card__title">Overlay Grid</h2>
        <div class="option-item">
          <div class="option-item__text"><strong>Grid overlay</strong></div>
          <form method="post" action="/actions/remote-debug/overlay-grid" hx-post="/actions/remote-debug/overlay-grid" hx-target="#main" hx-swap="innerHTML">
            <input type="hidden" name="returnTo" value="/remote-debug">
            ${toggleTemplate(remoteDebug.overlayGrid.active)}
          </form>
        </div>
        ${remoteDebug.overlayGrid.active
          ? html`
            <form class="form-grid" method="post" action="/actions/remote-debug/overlay-grid/update" hx-post="/actions/remote-debug/overlay-grid/update" hx-target="#main" hx-swap="innerHTML">
              <input type="hidden" name="returnTo" value="/remote-debug">
              <label class="field"><span>Grid Size</span><input name="size" value="${remoteDebug.overlayGrid.size}"></label>
              <label class="field"><span>Grid Colour</span><input name="color" value="${remoteDebug.overlayGrid.color}"></label>
              <label class="field"><span>CSS Selector</span><input name="selector" value="${remoteDebug.overlayGrid.selector}"></label>
              <label class="field"><span>Offset Top</span><input name="offsetY" value="${remoteDebug.overlayGrid.offsetY}"></label>
              <label class="field"><span>Offset Left</span><input name="offsetX" value="${remoteDebug.overlayGrid.offsetX}"></label>
              <label class="checkbox-row"><input type="checkbox" name="vertical" value="true" ?checked=${remoteDebug.overlayGrid.vertical}> <span>Vertical Axis</span></label>
              <label class="checkbox-row"><input type="checkbox" name="horizontal" value="true" ?checked=${remoteDebug.overlayGrid.horizontal}> <span>Horizontal Axis</span></label>
              <button class="button" type="submit">Apply Grid</button>
            </form>
          `
          : null}
      </div>

      <div class="card">
        <h2 class="card__title">Response Controls</h2>
        <ul class="option-list">
          <li class="option-item">
            <div class="option-item__text"><strong>No Cache</strong></div>
            <form method="post" action="/actions/remote-debug/no-cache" hx-post="/actions/remote-debug/no-cache" hx-target="#main" hx-swap="innerHTML">
              <input type="hidden" name="returnTo" value="/remote-debug">
              ${toggleTemplate(remoteDebug.noCache.active)}
            </form>
          </li>
          <li class="option-item">
            <div class="option-item__text">
              <strong>Latency</strong>
              ${remoteDebug.latency.active
                ? html`
                  <form class="range-field" method="post" action="/actions/remote-debug/latency" hx-post="/actions/remote-debug/latency" hx-target="#main" hx-swap="innerHTML">
                    <input type="hidden" name="active" value="true">
                    <input type="hidden" name="returnTo" value="/remote-debug">
                    <input type="range" name="rate" max="5" min="0" step=".50" value="${remoteDebug.latency.rate}">
                    <button class="button button--subtle" type="submit">Apply ${remoteDebug.latency.rate}s</button>
                  </form>
                `
                : null}
            </div>
            <form method="post" action="/actions/remote-debug/latency" hx-post="/actions/remote-debug/latency" hx-target="#main" hx-swap="innerHTML">
              <input type="hidden" name="rate" value="${remoteDebug.latency.rate}">
              <input type="hidden" name="returnTo" value="/remote-debug">
              ${toggleTemplate(remoteDebug.latency.active)}
            </form>
          </li>
        </ul>
      </div>
    </div>
  `
}
