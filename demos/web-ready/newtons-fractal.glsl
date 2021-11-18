// Tested in VS Code with extension:
// https://marketplace.visualstudio.com/items?itemName=stevensona.shader-toy

vec2 complexMul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + b.x * a.y);
}

vec2 complexDiv(vec2 a, vec2 b) {
  return vec2((a.x * b.x + a.y * b.y) / ((b.x * b.x) + b.y * b.y),
              (a.y * b.x - a.x * b.y) / ((b.x * b.x) + b.y * b.y));
}

float complexMag(vec2 a) { return sqrt(a.x * a.x + a.y * a.y); }

vec2 one = vec2(1.0, 0);

vec2 complexPow(vec2 a, int power) {
  vec2 result = one;
  for (int i = 0; i < power; i++) {
    result = complexMul(result, a);
  }
  return result;
}

vec2 f(vec2 z) { return complexPow(z, 5) + complexPow(z, 2) - z + one; }
vec2 fPrime(vec2 z) { return 5.0 * complexPow(z, 4) + 2.0 * z - one; }

vec2 rotateUV(vec2 uv, vec2 pivot, float rotation) {
  float sine = sin(rotation);
  float cosine = cos(rotation);
  uv -= pivot;
  vec2 ret =
      vec2(uv.x * cosine - uv.y * sine, uv.x * sine + uv.y * cosine) + pivot;

  return ret;
}

// radians to rotate per frame.
float rotationSpeed = 1.0 / 100.0;
// steps of newtons formula to apply per frame.
float newtonStepRate = 1.0 / 10.0;
// amount to shrink viewport each frame
float zoomRate = 0.99;
// initial window bounds
float startWindowSize = 4.0;
// final window bounds
float targetWindowSize = 0.01;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 root = vec2(0, 0);
  // roots of f'. These are the sources of the instabilities.
  root = vec2(0.421265654668500, 0);
  // root = vec2(-0.858592994302980, 0);
  // root = vec2(0.218663669817240, -0.710730005932395);
  // root = vec2(0.218663669817240, 0.710730005932395);

  vec2 startMaxP = startWindowSize * vec2(1, 1);
  vec2 startMinP = startWindowSize * vec2(-1, -1);

  vec2 endMaxP = root + vec2(targetWindowSize);
  vec2 endMinP = root - vec2(targetWindowSize);

  float scalingFactor = pow(zoomRate, float(iFrame));
  vec2 maxP = startMaxP * scalingFactor + endMaxP * (1.0 - scalingFactor);
  vec2 minP = startMinP * scalingFactor + endMinP * (1.0 - scalingFactor);

  vec2 range = maxP - minP;

  vec2 coord = ((fragCoord.xy / iResolution.xy) * range) + minP;

  coord = rotateUV(coord, root, float(iFrame) * rotationSpeed);

  vec2 z = coord;
  float maxIters = min(float(iFrame) * newtonStepRate, 100.0);
  for (float i = 0.0; i < maxIters; i++) {
    vec2 delta = complexDiv(f(z), fPrime(z));
    float partialStepAmount = maxIters - i;
    if (partialStepAmount < 1.0) {
      z = z - partialStepAmount * delta;
    } else {
      z = z - delta;
    }
  }

  float colorMapScale = 1.;
  vec2 colorMapMax = vec2(colorMapScale, colorMapScale);
  vec2 colorMapMin = vec2(-colorMapScale, -colorMapScale);

  float r = min(max(colorMapMin.x, z.x), colorMapMax.x);
  float g = min(max(colorMapMin.y, z.y), colorMapMax.y);
  vec2 color = (vec2(r, g) - colorMapMin) / (colorMapMax - colorMapMin);
  float valOfF = complexMag(f(coord));
  float valOfFPrime = complexMag(fPrime(coord));
  float remaining = 1.0 - sqrt(color.x * color.x + color.y * color.y);
  fragColor = vec4(color, remaining, 1.0);
}