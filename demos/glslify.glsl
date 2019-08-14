#pragma glslify: snoise = require('glsl-noise/simplex/2d')

float noise(in vec2 pt) {
    return snoise(pt) * 0.5 + 0.5;
}

void main () {
    float r = noise(gl_FragCoord.xy * 0.01);
    float g = noise(gl_FragCoord.xy * 0.01 + 100.0);
    float b = noise(gl_FragCoord.xy * 0.01 + 300.0);
    gl_FragColor = vec4(r, g, b, 1);
}