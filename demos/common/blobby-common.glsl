#include "math-common.glsl"

#define saturate01(x) (clamp(x, 0., 1.))

vec2 rotate(vec2 p, float t)
{
    return mat2(cos(t), -sin(t), sin(t), cos(t)) * p;
}