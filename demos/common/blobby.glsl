#include "math-common.glsl"

#ifndef saturate
#define saturate(x) (clamp(x, 0., 1.))
#endif

vec2 rotate(vec2 p, float t)
{
    return mat2(cos(t), -sin(t), sin(t), cos(t)) * p;
}