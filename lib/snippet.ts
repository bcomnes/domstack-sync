export interface SnippetOptions {
  port: number
  path?: string
}

export function buildSnippet (_opts: SnippetOptions): string {
  const scriptSrc = '/__bs/client.js'
  return `<script id="__bs_script__">
  (function() {
    var script = document.createElement('script');
    script.src = '${scriptSrc}';
    script.async = true;
    document.head.appendChild(script);
  })();
</script>`
}
