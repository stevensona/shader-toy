#iChannel0 "file://horizon.jpg"
#iChannel1 "file://uv-warp.glsl"

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    
    vec2 uvWarped = texture2D(iChannel1, uv).rg;
    vec3 pattern = texture2D(iChannel0, uvWarped).rgb;

    gl_FragColor = vec4(pattern, 1.0);
}