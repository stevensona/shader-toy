// Demo shader for manual sequencer testing
// (deliberately simple; driven by 3 scalar uniforms)

#iUniform float line1 = 0.0 in { -10.0, 10.0 } step 1.0
#iUniform float line2 = 0.0 in { -10.0, 10.0 } step 1.0
#iUniform float line3 = 0.0 in { -10.0, 10.0 } step 1.0
#iUniform int test = 0 in { -10, 10 } step 1

float barMask(vec2 uv, float yCenter, float yHalfHeight, float v)
{
    // v in [-10, 10]
    float t = clamp(v / 10.0, -1.0, 1.0);

    // Start at center (0.5). For -1 go left to 0.0, for +1 go right to 1.0.
    float x0 = 0.5;
    float x1 = 0.5 + 0.5 * t;

    float left = min(x0, x1);
    float right = max(x0, x1);

    // For v ~ 0 show a very small strip (instead of nothing).
    float minLen = 0.007;
    if (right - left < minLen) {
        left = 0.5 - 0.5 * minLen;
        right = 0.5 + 0.5 * minLen;
    }

    float inY = 1.0 - step(yHalfHeight, abs(uv.y - yCenter));
    float inX = step(left, uv.x) * (1.0 - step(right, uv.x));
    return inX * inY;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = fragCoord.xy / iResolution.xy;

    vec3 col = vec3(0.06);

    // Subtle center axis.
    col += vec3(0.12) * (1.0 - smoothstep(0.0, 0.002, abs(uv.x - 0.5)));

    // 3 bars at fixed Y positions.
    float h = 0.04;
    float b1 = barMask(uv, 0.70, h, line1);
    float b2 = barMask(uv, 0.50, h, line2);
    float b3 = barMask(uv, 0.30, h, line3);

    col = mix(col, vec3(0.20, 0.80, 1.00), b1);
    col = mix(col, vec3(1.00, 0.60, 0.20), b2);
    col = mix(col, vec3(0.35, 1.00, 0.35), b3);

    fragColor = vec4(col, 1.0);
}
