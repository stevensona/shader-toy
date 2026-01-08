// WebGL2 / GLSL ES 3.00
// Pass 1: fragment pass with a custom vertex shader (#iVertex).

#iVertex "file://pass1_iVertex.glsl"

in vec2 vUV;

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = vUV;

    // Simple gradient + rings.
    float rings = 0.5 + 0.5 * cos(40.0 * length(uv - 0.5) - iTime * 2.0);
    vec3 col = vec3(uv.x, uv.y, 0.0);
    col = mix(col, vec3(1.0, 0.2, 0.1), rings * 0.35);

    fragColor = vec4(col, 1.0);
}
