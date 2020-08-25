// Example shader created for VS Code ShaderToy extension

#iChannel0 "https://66.media.tumblr.com/tumblr_mcmeonhR1e1ridypxo1_500.jpg"
#iChannel1 "https://static.wixstatic.com/media/5a6af3_59508f8a1ef6461abd9b97fba2e4a2ce~mv2.png"
#iChannel1::WrapMode "Mirror"

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;

    vec3 pattern = texture2D(iChannel0, uv).rgb;
    float mask = texture2D(iChannel1, uv * 2.0).a;

    vec3 maskedPattern = pattern * mask;
    gl_FragColor = vec4(maskedPattern, 1.0);
}