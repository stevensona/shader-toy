#iKeyboard

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;

    gl_FragColor = vec4(texture(iKeyboard, uv).r, 0.0, 0.0, 1.0);   
}