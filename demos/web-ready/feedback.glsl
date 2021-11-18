// Example shader created for VS Code ShaderToy extension

#iChannel0 "file://self"

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;

    vec2 halfResolution = iResolution.xy / 2.0;

    if (iFrame == 0) {
        gl_FragColor.a = 1.0;
        float distFromCenter = length(gl_FragCoord.xy / iResolution.xy - 0.5);
        if (distFromCenter < 0.1) {
            gl_FragColor.r = cos(distFromCenter * 100.0) * 0.5 + 0.5;
            gl_FragColor.g = sin(distFromCenter * 100.0) * 0.5 + 0.5;
        } 
        else if (gl_FragCoord.x < halfResolution.x &&
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
    else if (iTimeDelta > 0.0) {
        const float offsetSize = 1.0;
        vec2 offsets[4] = vec2[4](
            vec2( 0,  offsetSize / iResolution.y),
            vec2( 0, -offsetSize / iResolution.y),
            vec2( offsetSize / iResolution.x,  0),
            vec2(-offsetSize / iResolution.x,  0)
        );
        gl_FragColor = texture(iChannel0, uv) * 2.0;
        for (int i = 0; i < 4; i++) {
            gl_FragColor += texture(iChannel0, mod(uv + offsets[i] + 1.0, 1.0));
        }
        gl_FragColor /= 6.0;
    } else {
        gl_FragColor = texture(iChannel0, uv);
    }
}
