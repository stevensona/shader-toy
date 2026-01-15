// WebGL2 feature demo (GLSL ES 3.00)
//
// WebGL2 corresponds to OpenGL ES 3.00.
// WebGL2 does NOT support OpenGL ES 3.10 / 3.20 features.
//
// Demo flow:
// 1) Build UV + aspect-corrected coords; compute polar r/a.
// 2) Generate uint hash from fragCoord + time for stable jitter.
// 3) Warp UVs with a swirl + tiny jitter.
// 4) WebGL2-only pack/unpack roundtrip on warped UVs:
//    packHalf2x16 -> unpackHalf2x16 -> packUnorm2x16 -> unpackUnorm2x16
//    Result feeds hue, so it directly affects final color.
// 5) HSV->RGB gradient + vignette => final color.

uint hashU32(uint x) {
    x ^= x >> 16;
    x *= 0x7FEB352Du;
    x ^= x >> 15;
    x *= 0x846CA68Bu;
    x ^= x >> 16;
    return x;
}

uint hash2(uvec2 p) {
    return hashU32(p.x ^ (p.y * 0x9E3779B9u));
}

vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    vec3 rgb = clamp(p - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), rgb, c.y);
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord / iResolution.xy;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= iResolution.x / iResolution.y;

    float t = iTime * 0.25;
    float r = length(p);
    float a = atan(p.y, p.x);

    // WebGL2 uint ops for subtle jitter.
    uint seed = hash2(uvec2(fragCoord) + uvec2(uint(iTime * 60.0), 123u));
    float jitter = float(seed & 1023u) / 1023.0;

    // Warp the UVs a bit for a smooth, swirling gradient.
    vec2 warp = vec2(cos(a * 3.0 + t), sin(a * 2.0 - t)) * (0.05 - 0.04 * r);
    vec2 warped = uv + warp + (jitter - 0.5) * 0.003;

    // WebGL2 pack/unpack: half-float roundtrip.
    uint packedHalf = packHalf2x16(warped);
    vec2 unpackedHalf = unpackHalf2x16(packedHalf);

    // WebGL2 pack/unpack: normalized roundtrip.
    uint packedNorm = packUnorm2x16(unpackedHalf);
    vec2 unpackedNorm = unpackUnorm2x16(packedNorm);

    float hue = fract(a / 6.2831853 + t + unpackedNorm.x * 0.15);
    float sat = 0.7;
    float val = 0.9 - 0.45 * smoothstep(0.15, 1.0, r);
    vec3 col = hsv2rgb(vec3(hue, sat, val));

    // A soft vignette for contrast.
    col *= 0.25 + 0.75 * smoothstep(1.2, 0.2, r);

    gl_FragColor = vec4(col, 1.0);
}