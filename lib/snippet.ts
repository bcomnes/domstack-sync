export interface SnippetOptions {
  port: number
  path?: string
  version?: string
}

export function buildSnippet (opts: SnippetOptions): string {
  const scriptPath = opts.path ?? '/__bs/client.js'
  const scriptSrc = opts.version
    ? `${scriptPath}?v=${encodeURIComponent(opts.version)}`
    : scriptPath

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
