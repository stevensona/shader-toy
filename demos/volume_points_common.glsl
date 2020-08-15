// Created by FlyGuy - https://www.shadertoy.com/view/MtdcDn
// Adapted for VS Code Shadertoy

const float pi = atan(1.0) * 4.0;
const float tau = atan(1.0) * 8.0;
 
//Rotation matrix from euler (X/Y/Z) angles.
mat3 rotate(vec3 angles)
{
    vec3 c = cos(angles);
    vec3 s = sin(angles);
    
    mat3 rotX = mat3( 1.0, 0.0, 0.0, 0.0,c.x,s.x, 0.0,-s.x, c.x);
    mat3 rotY = mat3( c.y, 0.0,-s.y, 0.0,1.0,0.0, s.y, 0.0, c.y);
    mat3 rotZ = mat3( c.z, s.z, 0.0,-s.z,c.z,0.0, 0.0, 0.0, 1.0);

    return rotX * rotY * rotZ;
}

/*Nearest axis to 'dir':
X: (+/-1, 0, 0)
Y: (0, +/-1, 0)
Z: (0, 0, +/-1)
*/
vec3 nearestAxis(vec3 dir)
{
    vec3 asign = sign(dir);
    dir = abs(dir);
    float amax = max(max(dir.x,dir.y),dir.z);
                     
    if(amax == dir.x){ return vec3(asign.x,0,0); }
    if(amax == dir.y){ return vec3(0,asign.y,0); }
    if(amax == dir.z){ return vec3(0,0,asign.z); }
    
    return vec3(0);
}

//Intersection point of ray (rorg, rdir) with plane (porg, pnrm)
//Assumes rdir & pnrm are normalized
vec3 rayPlane(vec3 rorg, vec3 rdir, vec3 porg, vec3 pnrm)
{
    float t = dot(porg - rorg, pnrm) / dot(pnrm, rdir);
    return rorg+rdir*t;
}

//Maximum component of a vec3.
float max3(vec3 v)
{
    return max(max(v.x,v.y),v.z); 
}

//Calculate maximum volumetric resolution of a 2D texture.
vec3 volumeSize(sampler2D tex)
{
    vec2 size2D = vec2(textureSize(tex,0));
	return vec3(floor(pow(size2D.x*size2D.y, 1.0/3.0)));
}

vec3 volumeSize(vec2 size2D)
{
	return vec3(floor(pow(size2D.x*size2D.y, 1.0/3.0)));
}

//Samples a texture as a psuedo-volumetric buffer.
vec4 texture3D(sampler2D tex, vec3 uvw, vec3 vres)
{
    vec2 texRes = vec2(textureSize(tex,0));
    uvw = mod(floor(uvw * vres), vres);
    float idx = (uvw.z * (vres.x*vres.y)) + (uvw.y * vres.x) + uvw.x;
    ivec2 uv = ivec2(mod(idx, texRes.x), floor(idx / texRes.x));
    return texelFetch(tex, uv, 0);
}

//texture3D with linear sampling.
vec4 texture3DLinear(sampler2D tex, vec3 uvw, vec3 vres)
{
    vec3 blend = fract(uvw*vres);
    vec4 off = vec4(1.0/vres, 0.0);
    
    vec4 b000 = texture3D(tex, uvw + off.www, vres);
    vec4 b100 = texture3D(tex, uvw + off.xww, vres);
    
    vec4 b010 = texture3D(tex, uvw + off.wyw, vres);
    vec4 b110 = texture3D(tex, uvw + off.xyw, vres);
    
    vec4 b001 = texture3D(tex, uvw + off.wwz, vres);
    vec4 b101 = texture3D(tex, uvw + off.xwz, vres);
    
    vec4 b011 = texture3D(tex, uvw + off.wyz, vres);
    vec4 b111 = texture3D(tex, uvw + off.xyz, vres);
    
    return mix(mix(mix(b000,b100,blend.x), mix(b010,b110,blend.x), blend.y), 
               mix(mix(b001,b101,blend.x), mix(b011,b111,blend.x), blend.y),
               blend.z);
}
