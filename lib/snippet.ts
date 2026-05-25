export interface SnippetOptions {
  port: number
  path?: string
  version?: string
}

export function buildSnippet (opts: SnippetOptions): string {
  const scriptSrc = opts.version
    ? `/__bs/client.js?v=${encodeURIComponent(opts.version)}`
    : '/__bs/client.js'
  return `<script id="__bs_script__">
  (function() {
    var script = document.createElement('script');
    script.src = '${scriptSrc}';
    script.async = true;
    (document.head || document.documentElement).appendChild(script);
  })();
</script>`
}
