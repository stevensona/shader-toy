#iChannel0 https://66.media.tumblr.com/tumblr_mcmeonhR1e1ridypxo1_500.jpg
#iChannel1 buf://D:/zollk/Documents/Visual Studio 2017/Projects/shader-toy/demos/plasma1.glsl

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    
    vec2 plasma = texture2D(iChannel1, uv).rg;
    vec3 pattern = texture2D(iChannel0, plasma).rgb;

    gl_FragColor = vec4(pattern, 1.0);
}