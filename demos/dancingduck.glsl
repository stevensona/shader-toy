

void main() {
    vec2 uv = (gl_FragCoord.xy / iResolution.xy);
    uv.y += .05 * sin(iGlobalTime + uv.x * 10.);
    uv.x += .05 * sin(iGlobalTime + uv.y * 10.);
    vec4 color = texture2D(iChannel0, uv);
    color = color * color;
    gl_FragColor = color;
}