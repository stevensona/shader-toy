#include "./volume_points_common.glsl"

vec3 iVResolution = vec3(0);

void mainVolume(out vec4 voxColor, in vec3 voxCoord);

void mainImage(out vec4 fragColor, in vec2 fragCoord )
{
    vec3 vres = volumeSize(iResolution.xy);    
    vec2 uv = floor(fragCoord - 0.5);
    float idx = (uv.y * iResolution.x) + uv.x; 
    vec3 uvw = mod(floor(vec3(idx) / vec3(1.0, vres.x, vres.x*vres.y)), vres);  
    iVResolution = vres;
    mainVolume(fragColor, uvw);
}

//Write your shader here.
//3D plasma thing.
void mainVolume( out vec4 voxColor, in vec3 voxCoord)
{
    vec3 uvw = voxCoord / iVResolution;

    vec3 color = vec3(1,0,0);
    
    vec3 p0 = sin(vec3(1.3,0.9,2.1) * iTime + 7.0)*.5+.5;
    vec3 p1 = sin(vec3(0.5,1.6,0.8) * iTime + 4.0)*.5+.5;
    vec3 p2 = sin(vec3(0.9,1.2,1.5) * iTime + 2.0)*.5+.5;
    
    float s0 = cos(length(p0-uvw)*14.0);
    float s1 = cos(length(p1-uvw)*10.0);
    float s2 = cos(length(p2-uvw)*11.0);
    
    float dens = (s0+s1+s2)/3.0;
    
    color = vec3(s0,s1,s2);
    
    dens *= 0.5;
    
    voxColor = vec4(color, dens);
}