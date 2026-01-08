'use strict';

// GLSL `#line` supports a "source string number". We use a sentinel for "this current file"
// so nested includes can be re-mapped correctly when an included file is inlined into a parent.
export const SELF_SOURCE_ID = 65535;
