#iChannel0 buf://self

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;

    vec2 halfResolution = iResolution.xy / 2.0;

    if (iFrame <= 1) {
        gl_FragColor.a = 1.0;
        if (gl_FragCoord.x < halfResolution.x &&
            gl_FragCoord.y < halfResolution.y) {
            gl_FragColor.r = 1.0;
        }
        else if (gl_FragCoord.x > halfResolution.x) {
            gl_FragColor.g = 1.0;
            if (gl_FragCoord.y > halfResolution.y) {
                gl_FragColor.b = 1.0;
            }
        }
        else {
            gl_FragColor.r = float(int(gl_FragCoord.x) % 16) / 16.0;
            gl_FragColor.g = float(int(gl_FragCoord.y) % 16) / 16.0;
        }
    }
    else {
        const int offsetSize = 1;
        vec2 offsets[4] = vec2[4](
            vec2( 0,  offsetSize) / iResolution.xy,
            vec2( 0, -offsetSize) / iResolution.xy,
            vec2( offsetSize,  0) / iResolution.xy,
            vec2(-offsetSize,  0) / iResolution.xy
        );
        gl_FragColor = texture(iChannel0, uv) * 2.0;
        for (int i = 0; i < 4; i++) {
            gl_FragColor += texture(iChannel0, uv + offsets[i]);
        }
        gl_FragColor /= 6.0;
    }
}
