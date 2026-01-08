// WebGL2 feature demo (GLSL ES 3.00)
//
// WebGL2 corresponds to OpenGL ES 3.00.
// WebGL2 does NOT support OpenGL ES 3.10 / 3.20 features.
//
// Demonstrates ES 3.00 integer/uint ops and pack/unpack helpers.

uint xorshift32(uint x) {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return x;
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    uvec2 ip = uvec2(fragCoord);

    uint t = uint(iTime * 60.0);
    uint seed = (ip.x * 0x07B5u) ^ (ip.y * 0x243Du) ^ (t * 0x684Du);

    // A few uint ops, just to exercise the feature set.
    seed = (seed << 1) ^ (seed >> 3) ^ ~seed;

    uint r = xorshift32(seed);

    // Pack a float color into a uint, xor with random bits, then unpack.
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec3 base = 0.5 + 0.5 * cos(iTime + vec3(0.0, 2.0, 4.0) + uv.xyx * 6.2831);

    // ES 3.00 / WebGL2 pack/unpack builtins
    uint packed = r;
    packed ^= packUnorm2x16(base.rg);

    // floatBitsToUint is available in GLSL ES 3.00.
    packed ^= floatBitsToUint(iTime);
    packed ^= 0xA5A5A5A5u;

    vec2 unpacked2 = unpackUnorm2x16(packed);
    gl_FragColor = vec4(unpacked2, base.b, 1.0);
}