// Created by aaecheve - https://www.shadertoy.com/view/4ddSz4
// Adapted for VS Code Shadertoy

#iChannel0 "self"

vec4 readMemory(vec2 coords) {
    return texture(iChannel0, (coords + 0.5) / iChannelResolution[0].xy);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    //Read data
    vec4 data1 = readMemory(vec2(0, 0));
    vec2 pos1 = data1.xy;
    vec2 vel1 = data1.zw;

    vec4 data2 = readMemory(vec2(1, 1));
    vec2 pos2 = data2.xy;
    vec2 vel2 = data2.zw;

    //Set initial values
    if(pos1.x == 0.0 && pos1.y == 0.0) {
        pos1 = vec2(20, 30);
    }

    if(pos2.x == 0.0 && pos2.y == 0.0) {
        pos2 = vec2(iChannelResolution[0].x - 20.0, 30);
    }

    if(vel1.x == 0.0 && vel1.y == 0.0) {
        vel1 = vec2(1, 1);
    }

    if(vel2.x == 0.0 && vel2.y == 0.0) {
        vel2 = vec2(-1, 1);
    }

    //Update positions
    pos1 += vel1;
    pos2 += vel2;

    //Check boundaries and bounce
    if(pos1.x > iResolution.x) {
        vel1.x = -1.0;
    }
    if(pos1.x < 0.0) {
        vel1.x = 1.0;
    }
    if(pos1.y > iResolution.y) {
        vel1.y = -1.0;
    }
    if(pos1.y < 0.0) {
        vel1.y = 1.0;
    }

    if(pos2.x > iResolution.x) {
        vel2.x = -1.0;
    }
    if(pos2.x < 0.0) {
        vel2.x = 1.0;
    }
    if(pos2.y > iResolution.y) {
        vel2.y = -1.0;
    }
    if(pos2.y < 0.0) {
        vel2.y = 1.0;
    }

    //Write data
    if(fragCoord.x < 1.0 && fragCoord.y < 1.0) {
        fragColor = vec4(pos1.x, pos1.y, vel1.x, vel1.y);
    } else if(fragCoord.x < 2.0 && fragCoord.y < 2.0) {
        fragColor = vec4(pos2.x, pos2.y, vel2.x, vel2.y);
    } else {
        discard;
    }
}