/// <reference types="@rsbuild/core/types" />

declare const __APP_VERSION__: string;

interface Window {
  /**
   * Injected by nginx from the X-Ingress-Path request header when the add-on
   * is accessed via Home Assistant ingress.  Empty string for direct access.
   * Used by the WebSocket client to build ingress-aware connection URLs.
   */
  __HA_BASE_PATH__?: string;
}

/**
 * Imports the SVG file as a React component.
 * @requires [@rsbuild/plugin-svgr](https://npmjs.com/package/@rsbuild/plugin-svgr)
 */
declare module '*.svg?react' {
  import type React from 'react';
  const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}
