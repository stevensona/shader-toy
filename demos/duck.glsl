#iChannel0 "https://cdn-images-1.medium.com/max/1200/1*eFjpoz8lhNKyd8XcSWv2OA.jpeg"
#iChannel0::WrapMode "Repeat"

void main() {
    vec2 uv = (gl_FragCoord.xy / iResolution.xy);
    uv.y += 0.05 * sin(iTime + uv.x * 10.0);
    uv.x += 0.05 * sin(iTime + uv.y * 10.0);
    vec4 color = texture(iChannel0, uv);
    color = color * color;
    gl_FragColor = color;
}