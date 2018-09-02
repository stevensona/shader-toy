void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    float time = iGlobalTime;
 
    for (float i = 1.0; i < 10.0; i++) {
        float v = 0.1 * sin((uv.r + uv.g) * 0.5 * i + iTime) / i;
        float u = 0.1 * cos((uv.r - uv.g) * 0.5 * i + iTime) / i;

        uv += vec2(u, v);
    }

    uv = fract(uv);

    gl_FragColor = vec4(uv, 1.0, 1.0);
}