'use strict';

// GLSL `#line` supports a "source string number". We use a sentinel for "this current file"
// so nested includes can be re-mapped correctly when an included file is inlined into a parent.
export const SELF_SOURCE_ID = 65535;

// When running in WebGL2/GLSL300 mode, additional lines are inserted into shader sources
// by the webview runtime (e.g. output declaration and compatibility shims). We compensate
// for this when mapping error logs back to the original sources.
export const WEBGL2_EXTRA_SHADER_LINES = 16;
