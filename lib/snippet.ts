export interface SnippetOptions {
  port: number
  path?: string
  version?: string
  token?: string
}

export function buildSnippet (opts: SnippetOptions): string {
  const scriptPath = opts.path ?? '/__bs/client.js'
  const params = new URLSearchParams()
  if (opts.version) params.set('v', opts.version)
  if (opts.token) params.set('token', opts.token)
  const query = params.size > 0 ? `?${params.toString()}` : ''
  const scriptSrc = `${scriptPath}${query}`

  return `<script id="__bs_script__">
  (function() {
    var script = document.createElement('script');
    var protocol = location.protocol === 'https:' ? 'https:' : 'http:';
    script.src = protocol + '//' + location.hostname + ':${opts.port}${scriptSrc}';
    script.async = true;
    (document.head || document.documentElement).appendChild(script);
  })();
</script>`
}
