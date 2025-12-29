// WebGL2 / GLSL ES 3.00
// Pass 2: fragment pass with a custom vertex shader (#iVertex).

#iVertex "file://pass2_iVertex.glsl"

in vec2 vUV;

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = vUV;

    // Stripes + checker modulation.
    float stripes = 0.5 + 0.5 * sin((uv.x + uv.y * 0.5) * 20.0 + iTime * 1.5);
    float checker = mod(floor(uv.x * 10.0) + floor(uv.y * 10.0), 2.0);

    vec3 a = vec3(0.1, 0.25, 0.95);
    vec3 b = vec3(1.0, 0.9, 0.2);
    vec3 col = mix(a, b, stripes);
    col *= mix(0.75, 1.0, checker);

    fragColor = vec4(col, 1.0);
}
