#define BRANCHLESS

void main() {
    const float speedFactor = 1000.0;

    int maxIdx = int(iResolution.x * iResolution.y) + int(iResolution.y);

    int idx = int(gl_FragCoord.x * iResolution.y) + int(gl_FragCoord.y);
    int frame = int(float(iFrame) * speedFactor);

    float fraction = float(frame - idx) / float(maxIdx);

#ifdef BRANCHLESS
    gl_FragColor.r = (1.0 - fraction) * step(0.0, fraction);
    gl_FragColor.b = (1.0 + fraction) * step(0.0, -fraction);
    gl_FragColor.g = step(0.0, fraction) * step(0.0, -fraction);
#else
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    if (idx < frame)
        gl_FragColor.r = 1.0 - fraction;
    else if (idx > frame)
        gl_FragColor.b = 1.0 + fraction;
    else
        gl_FragColor.g = 1.0;
#endif
}