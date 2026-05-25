// Vendored from strip-ansi@7.2.0 + ansi-regex@6.1.0
// https://github.com/chalk/strip-ansi
// https://github.com/chalk/ansi-regex

// Valid string terminator sequences are BEL, ESC\, and 0x9c
const ST = '(?:\\u0007|\\u001B\\u005C|\\u009C)'

// OSC sequences: ESC ] ... ST (non-greedy)
const OSC = `(?:\\u001B\\][\\s\\S]*?${ST})`

// CSI sequences: ESC/C1, optional intermediates + params, then final byte
const CSI = '[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]'

const ANSI_RE = new RegExp(`${OSC}|${CSI}`, 'g')

export function stripAnsi (str: string): string {
  if (typeof str !== 'string') {
    throw new TypeError(`Expected a string, got ${typeof str}`)
  }
  // Fast path: ANSI codes require ESC (7-bit) or C1 CSI (8-bit) introducer
  if (!str.includes('') && !str.includes('')) {
    return str
  }
  return str.replace(ANSI_RE, '')
}
