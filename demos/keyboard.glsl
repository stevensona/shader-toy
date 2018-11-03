#iKeyboard

// Created by inigo quilez - iq/2013
// Adapted for VS Code Shadertoy

// An example showing how to use the keyboard input.
//
// Row 0: contain the current state of the 256 keys. 
// Row 1: contains Keypress.
// Row 2: contains a toggle for every key.
// Row 3: contains Keyrelease.
//
// Texel positions correspond to ASCII codes. Press arrow keys to test.

// #define USE_TEXEL_FETCH

const int KEY_LEFT  = Key_LeftArrow;
const int KEY_UP    = Key_UpArrow;
const int KEY_RIGHT = Key_RightArrow;
const int KEY_DOWN  = Key_DownArrow;

#ifdef USE_TEXEL_FETCH
float state(int key) {
    return texelFetch(iKeyboard, ivec2(key, 0), 0).x;
}
float keypress(int key) {
    return texelFetch(iKeyboard, ivec2(key, 1), 0).x;
}
float keyrelease(int key) {
    return texelFetch(iKeyboard, ivec2(key, 3), 0).x;
}
float toggle(int key) {
    return texelFetch(iKeyboard, ivec2(key, 2), 0).x;
}
#else
float state(int key) {
    return isKeyDown(key) ? 1.0 : 0.0;
}
float keypress(int key) {
    return isKeyPressed(key) ? 1.0 : 0.0;
}
float keyrelease(int key) {
    return isKeyReleased(key) ? 1.0 : 0.0;
}
float toggle(int key) {
    return isKeyToggled(key) ? 1.0 : 0.0;
}
#endif

void stateColor(inout vec3 col, const in vec2 uv,
                const in vec3 keyCol, const in vec2 keyPos, const in int key) {
    col = mix(col, keyCol,
        (1.0 - smoothstep(0.3, 0.31, length(uv - keyPos))) * 
        (0.3 + 0.7 * state(key)));
}
void keypressColor(inout vec3 col, const in vec2 uv,
                   const in vec3 keyCol, const in vec2 keyPos, const in int key) {
    col = mix(col, keyCol,
        (1.0 - smoothstep(0.0, 0.01, abs(length(uv - keyPos) - 0.35))) *
        keypress(key));
}
void keyreleaseColor(inout vec3 col, const in vec2 uv,
                   const in vec3 keyCol, const in vec2 keyPos, const in int key) {
    col = mix(col, keyCol,
        (1.0 - smoothstep(0.0, 0.01, abs(length(uv - keyPos) - 0.4))) *
        keyrelease(key));
}
void toggleColor(inout vec3 col, const in vec2 uv,
                   const in vec3 keyCol, const in vec2 keyPos, const in int key) {
    col = mix(col, keyCol,
        (1.0 - smoothstep(0.0, 0.01, abs(length(uv - keyPos) - 0.3))) *
        toggle(key));
}

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
    const vec3 red = vec3(1.0,0.0,0.0);
    const vec3 yellow = vec3(1.0,1.0,0.0);
    const vec3 green = vec3(0.0,1.0,0.0);
    const vec3 blue = vec3(0.0,0.0,1.0);

    const vec2 redPos = vec2(-0.75,0.0);
    const vec2 yellowPos = vec2(0.0,0.5);
    const vec2 greenPos = vec2(0.75,0.0);
    const vec2 bluePos = vec2(0.0,-0.5);

    vec2 uv = (-iResolution.xy + 2.0*fragCoord) * 2.0 / iResolution.y;
    vec3 col = vec3(0.0);

    // state
    stateColor(col, uv, red, redPos, KEY_LEFT);
    stateColor(col, uv, yellow, yellowPos, KEY_UP);
    stateColor(col, uv, green, greenPos, KEY_RIGHT);
    stateColor(col, uv, blue, bluePos, KEY_DOWN);

    // keypress
    keypressColor(col, uv, red, redPos, KEY_LEFT);
    keypressColor(col, uv, yellow, yellowPos, KEY_UP);
    keypressColor(col, uv, green, greenPos, KEY_RIGHT);
    keypressColor(col, uv, blue, bluePos, KEY_DOWN);

    // keyrelease
    keyreleaseColor(col, uv, red, redPos, KEY_LEFT);
    keyreleaseColor(col, uv, yellow, yellowPos, KEY_UP);
    keyreleaseColor(col, uv, green, greenPos, KEY_RIGHT);
    keyreleaseColor(col, uv, blue, bluePos, KEY_DOWN);
    
    // toggle
    toggleColor(col, uv, red, redPos, KEY_LEFT);
    toggleColor(col, uv, yellow, yellowPos, KEY_UP);
    toggleColor(col, uv, green, greenPos, KEY_RIGHT);
    toggleColor(col, uv, blue, bluePos, KEY_DOWN);

    fragColor = vec4(col,1.0);
}