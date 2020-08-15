// Created by Klems - https://www.shadertoy.com/view/4dj3zV
// Adapted for VS Code Shadertoy

#iChannel0 "file://cubemap/yokohama_{}.jpg"
#iChannel0::Type "CubeMap"
#iChannel0::MinFilter "LinearMipMapLinear"

#define PI 					3.14159265359
#define METABALLS 			7
#define METABALLS_TRESHOLD 	1.0

vec2 V;
#define rot(a) mat2( V= sin(vec2(1.57, 0) + a), -V.y, V.x)

#define HASHSCALE1 .1031
float hash12(vec2 p) {
	vec3 p3  = fract(vec3(p.xyx) * HASHSCALE1);
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.x + p3.y) * p3.z);
}

vec4 balls[METABALLS];

float blerp(float x, float y0, float y1, float y2, float y3) {
	float a = y3 - y2 - y0 + y1;
	float b = y0 - y1 - a;
	float c = y2 - y0;
	float d = y1;
	return a * x * x * x + b * x * x + c * x + d;
}

float perlin(float x, float h) {
	float a = floor(x);
	return blerp(mod(x, 1.0),
		hash12(vec2(a-1.0, h)), hash12(vec2(a-0.0, h)),
		hash12(vec2(a+1.0, h)), hash12(vec2(a+2.0, h)));
}

float metaballs(vec3 p) {
	float value = 0.0;
	for (int i = 0 ; i < METABALLS ; i++) {
		vec3 temp = p - (balls[i].xyz);
		value += (balls[i].w) / dot(temp, temp);
	}
	return METABALLS_TRESHOLD - value;
}

vec3 gradient(vec3 p) {
	//analytical gradient (metaballs only)
	vec3 value = vec3(0.0);
	for (int i = 0 ; i < METABALLS ; i++) {
		vec3 a = p - (balls[i].xyz);
		float b = dot(a, a);
		value += 2.0*(balls[i].w)*(a/(b*b));
	}
	return value;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
	
	// update balls
	for (int i = 0 ; i < METABALLS ; i++) {
		float h = float(i)*float(METABALLS);
		float size = float(i*i)*0.3 + 1.0;
		float x    = perlin(iTime*1.412/size, h+1.0)*15.0-7.5;
		float y    = perlin(iTime*1.641/size, h+2.0)*15.0-7.5;
		float z    = perlin(iTime*1.293/size, h+3.0)*12.0-6.0;
		balls[i] = vec4(x, y, z, size);
	}
	
	vec2 uv = fragCoord.xy / iResolution.xy * 2.0 - 1.0;
	uv.y *= iResolution.y / iResolution.x;
	
	vec3 from = vec3(-20, 0, 0);
	vec3 dir = normalize(vec3(uv * 1.1, 1.0));
	dir.xz *= rot(PI*.5);
    
    vec2 rotv = vec2(0);
    if (iMouse.z > 0.0) {
        rotv = vec2((iMouse.xy - iResolution.xy*0.5)*0.01);
    } else {
        rotv = vec2(iTime*0.1, sin(iTime*0.3)*0.2);
    }
    
    mat2 rot1 = rot(rotv.x);
    mat2 rot2 = rot(-rotv.y);
    dir.xy *= rot2;
    from.xy *= rot2;
    dir.xz *= rot1;
    from.xz *= rot1;
    
	bool set = false;
	float totdist = 0.0;
    totdist += metaballs(from)*hash12(fragCoord.xy);
	for (int i = 0 ; i < 50 ; i++) {
		if (set) continue;
        vec3 p = from + totdist * dir;
        float dist = metaballs(p)*2.0;
        totdist += max(0.05, dist);
        if (dist < 0.01) {
            set = true;
        }
	}
    
    vec3 color = vec3(0);
    
    if (set) {
        vec3 p = from + totdist * dir;
        vec3 norm = normalize(gradient(p));
        color = texture(iChannel0, reflect(dir, norm),1.5).rgb;
        dir = reflect(dir, norm);
    } else {
        color = texture(iChannel0, dir).rgb;
    }
    
	fragColor = vec4(color, 1.0);
}