import html from 'fragtml'
import type { UiTemplateContext } from '../types.ts'
import type { HtmlResult } from 'fragtml/types.js'

export function networkThrottlePageTemplate (context: UiTemplateContext): HtmlResult {
  return html`
    <div class="page">
      <h1 class="page__title">Network Throttle</h1>
      <div class="card">
        <h2 class="card__title">Create Server</h2>
        <form class="throttle-layout" method="post" action="/actions/network-throttle/create" hx-post="/actions/network-throttle/create" hx-target="#main" hx-swap="innerHTML">
          <input type="hidden" name="returnTo" value="/network-throttle">
          <fieldset class="fieldset">
            <legend>Speed</legend>
            ${context.throttleTargets.map((target, index) => html`
              <label class="radio-row">
                <input type="radio" name="targetId" value="${target.id}" ?checked=${index === 0}>
                <span>${target.title}</span>
              </label>
            `)}
          </fieldset>
          <fieldset class="fieldset">
            <legend>Port</legend>
            <label class="field">
              <span>User specified port</span>
              <input class="text-input" name="port" placeholder="auto">
            </label>
            <button class="button" type="submit">Create Server</button>
          </fieldset>
        </form>
      </div>

      <div class="card">
        <h2 class="card__title">Your Servers</h2>
        ${context.throttleServers.length
          ? html`
            <ul class="throttle-server-list">
              ${context.throttleServers.map(server => html`
                <li class="throttle-server-item">
                  <div>
                    <div class="connection-item__browser">${server.speed.id}</div>
                    <div class="connection-item__meta">
                      ${server.urls.map(url => html`<a class="url-link" href="${url}">${url}</a>`)}
                    </div>
                  </div>
                  <form method="post" action="/actions/network-throttle/destroy" hx-post="/actions/network-throttle/destroy" hx-target="#main" hx-swap="innerHTML">
                    <input type="hidden" name="port" value="${server.port}">
                    <input type="hidden" name="returnTo" value="/network-throttle">
                    <button class="button button--icon" type="submit" aria-label="Destroy server ${server.port}">x</button>
                  </form>
                </li>
              `)}
            </ul>
          `
          : html`<p class="empty">No throttle servers running.</p>`}
      </div>
    </div>
  `
}
