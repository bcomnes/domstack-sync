import type { UiElementDescriptor } from '../protocol.ts'
import type {
  OverlayGridState,
  RemoteDebugClientFile,
  RemoteDebugState,
} from './types.ts'

export const remoteDebugClientFiles: RemoteDebugClientFile[] = [
  {
    type: 'css',
    id: '__browser-sync-pesticide__',
    active: false,
    title: 'CSS Outlining',
    name: 'pesticide',
    src: '/browser-sync/pesticide.css',
  },
  {
    type: 'css',
    id: '__browser-sync-pesticidedepth__',
    active: false,
    title: 'CSS Depth Outlining',
    name: 'pesticide-depth',
    src: '/browser-sync/pesticide-depth.css',
  },
]

export const defaultOverlayGrid: OverlayGridState = {
  active: false,
  offsetY: '0',
  offsetX: '0',
  size: '16px',
  selector: 'body',
  color: 'rgba(0, 0, 0, .2)',
  horizontal: true,
  vertical: true,
}

export function fileToElement (file: RemoteDebugClientFile): UiElementDescriptor {
  const element: UiElementDescriptor = {
    id: file.id,
    type: file.type,
  }
  if (file.src) element.src = file.src
  return element
}

export function cloneRemoteDebug (state: RemoteDebugState): RemoteDebugState {
  return {
    clientFiles: state.clientFiles.map(file => ({ ...file })),
    overlayGrid: { ...state.overlayGrid },
    noCache: { ...state.noCache },
    latency: { ...state.latency },
  }
}

export function getOverlayGridCss (opts: OverlayGridState): string {
  const selectorPosition = `${opts.selector} {position:relative;}`
  const horizontal = opts.horizontal
    ? `${opts.selector}:after {
  position: absolute;
  width: auto;
  height: auto;
  z-index: 9999;
  content: '';
  display: block;
  pointer-events: none;
  top: ${opts.offsetY};
  right: 0;
  bottom: 0;
  left: ${opts.offsetX};
  background-color: transparent;
  background-image: linear-gradient(${opts.color} 1px, transparent 1px);
  background-size: 100% ${opts.size};
}`
    : ''
  const vertical = opts.vertical
    ? `${opts.selector}:before {
  position: absolute;
  width: auto;
  height: auto;
  z-index: 9999;
  content: '';
  display: block;
  pointer-events: none;
  top: ${opts.offsetY};
  right: 0;
  bottom: 0;
  left: ${opts.offsetX};
  background-color: transparent;
  background-image: linear-gradient(90deg, ${opts.color} 1px, transparent 1px);
  background-size: ${opts.size} 100%;
}`
    : ''
  return [selectorPosition, horizontal, vertical].filter(Boolean).join('\n')
}
