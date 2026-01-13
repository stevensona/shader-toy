// Demo shader for manual sequencer testing
// (deliberately simple; driven by 3 float + 1 int scalar uniforms)

#iUniform float line1 = 0.0 in { -10.0, 10.0 } step 1.0 sequncer
#iUniform float line2 = 0.0 in { -10.0, 10.0 } step 1.0 sequncer
#iUniform float line3 = 0.0 in { -10.0, 10.0 } step 1.0 sequncer

// Control-window-only uniforms (not exposed to the sequencer):
#iUniform float test1 = 0.0 in { -10.0, 10.0 } step 1.0
#iUniform float test2 = 0.0 in { -10.0, 10.0 } step 1.0
#iUniform float test3 = 0.0 in { -10.0, 10.0 } step 1.0

#iUniform int lineINT = 0 in { -10, 10 } step 1 sequncer

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

    // 3 float bars at fixed Y positions (kept higher in frame).
    float h = 0.04;
    float b1 = barMask(uv, 0.78, h, line1);
    float b2 = barMask(uv, 0.62, h, line2);
    float b3 = barMask(uv, 0.46, h, line3);

    // Clean separation, then one thicker int bar.
    // NOTE: int uniform must be explicitly converted to float for drawing.
    float hInt = 0.08; // double the half-height of float bars
    float lineINTf = float(lineINT);
    float b4 = barMask(uv, 0.24, hInt, lineINTf);

    col = mix(col, vec3(0.20, 0.80, 1.00), b1);
    col = mix(col, vec3(1.00, 0.60, 0.20), b2);
    col = mix(col, vec3(0.35, 1.00, 0.35), b3);
    col = mix(col, vec3(0.95, 0.35, 0.90), b4);

    fragColor = vec4(col, 1.0);
}
