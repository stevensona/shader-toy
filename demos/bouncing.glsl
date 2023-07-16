// Created by aaecheve - https://www.shadertoy.com/view/4ddSz4
// Adapted for VS Code Shadertoy

#iChannel0 "file://buffer_a.glsl"

vec4 readMemory(vec2 coords) {
    return texture(iChannel0, (coords + 0.5) / iChannelResolution[0].xy);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec4 data1 = readMemory(vec2(0, 0));
    vec4 data2 = readMemory(vec2(1, 1));

    vec2 pos1 = data1.xy;
    vec2 pos2 = data2.xy;

    vec4 col = vec4(0, 0, 0, 1);
    if(distance(pos1, fragCoord.xy) < 20.0) {
        col = vec4(1, 0, 0, 1);
    } else if(distance(pos2, fragCoord.xy) < 15.0) {
        col = vec4(1, 1, 0, 1);
    }

    fragColor = col;
}