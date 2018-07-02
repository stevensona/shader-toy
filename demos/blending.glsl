#iChannel0 https://66.media.tumblr.com/tumblr_mcmeonhR1e1ridypxo1_500.jpg
#iChannel1 https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Sony_Alpha_logo.svg/1200px-Sony_Alpha_logo.svg.png

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;

    vec3 pattern = texture2D(iChannel0, uv).rgb;
    float mask = texture2D(iChannel1, uv).a;

    vec3 maskedPattern = pattern * mask;
    gl_FragColor = vec4(maskedPattern, 1.0);
}