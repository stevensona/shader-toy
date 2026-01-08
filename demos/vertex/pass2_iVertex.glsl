// WebGL2 / GLSL ES 3.00
// Pass 2 vertex shader for the iVertex demo.
// Use from a fragment pass via: #iVertex "file://pass2_iVertex.glsl"

out vec2 vUV;

void main()
{
    const float d = 0.6;

    vec2 ndc;
    int id = gl_VertexID % 3;
    if (id == 0) {
        ndc = vec2(-1.0, 1.0 - d);
    }
    else if (id == 1) {
        ndc = vec2(1.0 - d, -1.0);
    }
    else {
        ndc = vec2(1.0, 1.0);
    }

    vUV = clamp(ndc * 0.5 + 0.5, 0.0, 1.0);
    gl_Position = vec4(ndc, 0.0, 1.0);
}
