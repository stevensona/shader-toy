// WebGL2 / GLSL ES 3.00 demo
//
// Uses #iVertex in two offscreen passes (iChannel1/iChannel2).
// iChannel0 is a simple WebGL2-only background shader.
//
// Note: Set `shader-toy.glslVersion` to "WebGL2".

#iChannel0 "file://webgl2_features.glsl"
#iChannel1 "file://vertex/pass1.glsl"
#iChannel2 "file://vertex/pass2.glsl"

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 uv = fragCoord.xy / iResolution.xy;
	vec3 bg = texture2D(iChannel0, uv).rgb;
	vec3 p1 = texture2D(iChannel1, uv).rgb;
	vec3 p2 = texture2D(iChannel2, uv).rgb;
	vec3 col = bg + p1 + p2;
	fragColor = vec4(col, 1.0);
}
