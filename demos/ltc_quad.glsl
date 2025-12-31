
// Full LTC quad example (based on Eric Heitz: "Real-Time Polygonal-Light Shading with Linearly Transformed Cosines")

#iChannel0 "file://lut/ltc_1.dds"
#iChannel0::WrapMode   "Clamp"
#iChannel0::MinFilter  "Linear"
#iChannel0::MagFilter  "Linear"

#iChannel1 "file://lut/ltc_2.dds"
#iChannel1::WrapMode   "Clamp"
#iChannel1::MinFilter  "Linear"
#iChannel1::MagFilter  "Linear"

#iUniform float roughness = 0.25 in { 0.01, 1.0 } step 0.001

#iUniform color3 dcolor = color3(0.8, 0.4, 0.4)
#iUniform color3 scolor = color3(0.23, 0.23, 0.23)

#iUniform float intensity = 4.0 in { 0.0, 10.0 }
#iUniform float width  = 8.0 in { 0.1, 15.0 } step 0.1
#iUniform float height = 8.0 in { 0.1, 15.0 } step 0.1
#iUniform float roty = 0.11 in { 0.0, 1.0 } step 0.001
#iUniform float rotz = 0.33 in { 0.0, 1.0 } step 0.001

mat4  view;

#define S(x) clamp(x, 0.0, 1.0)

const float pi  = 3.14159265;
const float esp = 1e-6;

struct Ray
{
	vec3 origin;
	vec3 dir;
};

struct Rect
{
	vec3  center;
	vec3  dirx;
	vec3  diry;
	float halfx;
	float halfy;
	vec4  plane;
};

bool RayPlaneIntersect(Ray ray, vec4 plane, out float t)
{
	t = -dot(plane, vec4(ray.origin, 1.0)) / dot(plane.xyz, ray.dir);
	return t > 0.0;
}

bool RayRectIntersect(Ray ray, Rect rect, out float t)
{
	bool intersect = RayPlaneIntersect(ray, rect.plane, t);
	if (intersect)
	{
		vec3 pos  = ray.origin + ray.dir * t;
		vec3 lpos = pos - rect.center;

		float x = dot(lpos, rect.dirx);
		float y = dot(lpos, rect.diry);

		if (abs(x) > rect.halfx || abs(y) > rect.halfy)
			intersect = false;
	}

	return intersect;
}

mat4 Translate(vec3 t)
{
	return mat4(
		vec4(1.0, 0.0, 0.0, 0.0),
		vec4(0.0, 1.0, 0.0, 0.0),
		vec4(0.0, 0.0, 1.0, 0.0),
		vec4(t, 1.0)
	);
}

mat4 RotateX(float a)
{
	float c = cos(a);
	float s = sin(a);
	return mat4(
		vec4(1.0, 0.0, 0.0, 0.0),
		vec4(0.0, c,   s,   0.0),
		vec4(0.0, -s,  c,   0.0),
		vec4(0.0, 0.0, 0.0, 1.0)
	);
}

mat4 RotateY(float a)
{
	float c = cos(a);
	float s = sin(a);
	return mat4(
		vec4(c,   0.0, s,   0.0),
		vec4(0.0, 1.0, 0.0, 0.0),
		vec4(-s,  0.0, c,   0.0),
		vec4(0.0, 0.0, 0.0, 1.0)
	);
}

Ray GenerateCameraRay(vec2 fragCoord, vec2 resolution)
{
    Ray ray;

    vec2 xy = 2.0*fragCoord.xy/resolution - vec2(1.0);

    ray.dir = normalize(vec3(xy, 2.0));

    float focalDistance = 2.0;
    float ft = focalDistance/ray.dir.z;
    vec3 pFocus = ray.dir*ft;

    ray.origin = vec3(0);
    ray.dir    = normalize(pFocus - ray.origin);

    // Apply camera transform
    ray.origin = (view*vec4(ray.origin, 1)).xyz;
    ray.dir    = (view*vec4(ray.dir,    0)).xyz;

    return ray;
}

vec3 rotation_y(vec3 v, float a)
{
	return vec3(
		v.x * cos(a) + v.z * sin(a),
		v.y,
	   -v.x * sin(a) + v.z * cos(a)
	);
}

vec3 rotation_z(vec3 v, float a)
{
	return vec3(
		v.x * cos(a) - v.y * sin(a),
		v.x * sin(a) + v.y * cos(a),
		v.z
	);
}

vec3 rotation_yz(vec3 v, float ay, float az)
{
	return rotation_z(rotation_y(v, ay), az);
}

vec3 IntegrateEdgeVec(vec3 v1, vec3 v2)
{
	float x = dot(v1, v2);
	float y = abs(x);

	float a = 0.8543985 + (0.4965155 + 0.0145206 * y) * y;
	float b = 3.4175940 + (4.1616724 + y) * y;
	float v = a / b;

	float theta_sintheta = (x > 0.0) ? v : 0.5 * inversesqrt(max(1.0 - x * x, 1e-6)) - v;

	return cross(v1, v2) * theta_sintheta;
}

vec3 LTC_Evaluate(vec3 N, vec3 V, vec3 P, mat3 Minv, vec3 p0, vec3 p1, vec3 p2, vec3 p3, bool twoSided)
{
	// construct orthonormal basis around N
	vec3 T1 = normalize(V - N * dot(V, N));
	vec3 T2 = cross(N, T1);

	// rotate area light in (T1, T2, N) basis
	Minv = Minv * transpose(mat3(T1, T2, N));

	vec3 L0 = Minv * (p0 - P);
	vec3 L1 = Minv * (p1 - P);
	vec3 L2 = Minv * (p2 - P);
	vec3 L3 = Minv * (p3 - P);

	float sum = 0.0;

    vec3 dir = p0 - P;
    vec3 lightNormal = cross(p1 - p0, p3 - p0);
    bool behind = (dot(dir, lightNormal) < 0.0);

    L0 = normalize(L0);
    L1 = normalize(L1);
    L2 = normalize(L2);
    L3 = normalize(L3);

    vec3 vsum = vec3(0.0);
    vsum += IntegrateEdgeVec(L0, L1);
    vsum += IntegrateEdgeVec(L1, L2);
    vsum += IntegrateEdgeVec(L2, L3);
    vsum += IntegrateEdgeVec(L3, L0);

    float len = length(vsum);
    float z = vsum.z / max(len, esp);
    if (behind) z = -z;

    vec2 uv = vec2(z * 0.5 + 0.5, len);

    vec2 lutRes   = max(iChannelResolution[1].xy, vec2(1.0));
    vec2 lutScale = (lutRes - 1.0) / lutRes;
    vec2 lutBias  = 0.5 / lutRes;
    uv = uv * lutScale + lutBias;

    float scale = texture2D(iChannel1, uv).w;
    sum = len * scale;

    if (behind && !twoSided)
        sum = 0.0;

	return vec3(sum);
}

void InitRect(out Rect rect)
{
	rect.dirx = rotation_yz(vec3(1.0, 0.0, 0.0), roty * 2.0 * pi, rotz * 2.0 * pi);
	rect.diry = rotation_yz(vec3(0.0, 1.0, 0.0), roty * 2.0 * pi, rotz * 2.0 * pi);

	rect.center = vec3(0.0, 6.0, 32.0);
	rect.halfx  = 0.5 * width;
	rect.halfy  = 0.5 * height;

	vec3 rectNormal = cross(rect.dirx, rect.diry);
	rect.plane = vec4(rectNormal, -dot(rectNormal, rect.center));
}

void InitRectPoints(Rect rect, out vec3 p0, out vec3 p1, out vec3 p2, out vec3 p3)
{
	vec3 ex = rect.halfx * rect.dirx;
	vec3 ey = rect.halfy * rect.diry;

	p0 = rect.center - ex - ey;
	p1 = rect.center + ex - ey;
	p2 = rect.center + ex + ey;
	p3 = rect.center - ex + ey;
}

vec3 PowVec3(vec3 v, float p) { return vec3(pow(v.x, p), pow(v.y, p), pow(v.z, p)); }
const float gamma = 2.2;
vec3 ToLinear(vec3 v) { return PowVec3(v, gamma); }

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
	view = mat4(1.0);
	view = view * Translate(vec3(0.0, 5.0, -0.5));
	view = view * RotateX((+10.0) * (pi / 180.0));
	view = view * RotateY((0.0) * (pi / 180.0));

	vec2 res = iResolution.xy;

	Rect rect;
	InitRect(rect);

	vec3 p0, p1, p2, p3;
	InitRectPoints(rect, p0, p1, p2, p3);

	vec4 floorPlane = vec4(0.0, 1.0, 0.0, 0.0);

	vec3 lcol = vec3(intensity);
	vec3 dcol = ToLinear(dcolor);
	vec3 scol = ToLinear(scolor);

	vec3 col = vec3(0.0);

	Ray ray = GenerateCameraRay(fragCoord, res);

	float distToFloor;
	bool hitFloor = RayPlaneIntersect(ray, floorPlane, distToFloor);
	
    if (hitFloor)
	{
		vec3 pos = ray.origin + ray.dir * distToFloor;
		vec3 N = floorPlane.xyz;
		vec3 V = -ray.dir;

		float ndotv = S(dot(N, V));
		vec2 uv = vec2(S(roughness), sqrt(1.0 - ndotv));

		vec2 lutRes0   = max(iChannelResolution[0].xy, vec2(1.0));
		vec2 lutScale0 = (lutRes0 - 1.0) / lutRes0;
		vec2 lutBias0  = 0.5 / lutRes0;
		uv = uv * lutScale0 + lutBias0;

		vec4 t1 = texture2D(iChannel0, uv).wzyx;
		vec4 t2 = texture2D(iChannel1, uv);

		mat3 Minv = mat3(
			vec3(t1.x, 0.0, t1.y),
			vec3(0.0,  1.0, 0.0),
			vec3(t1.z, 0.0, t1.w)
		);

		vec3 spec = LTC_Evaluate(N, V, pos, Minv, p0, p1, p2, p3, true);
		// BRDF shadowing and Fresnel
		spec *= scol * t2.x + (1.0 - scol) * t2.y;

		vec3 diff = LTC_Evaluate(N, V, pos, mat3(1.0), p0, p1, p2, p3, true);
		col = lcol * (spec + dcol * diff);
	}

	float distToRect;
	if (RayRectIntersect(ray, rect, distToRect))
		if ((distToRect < distToFloor) || !hitFloor)
			col = lcol;

	fragColor = vec4(col, 1.0);
}
