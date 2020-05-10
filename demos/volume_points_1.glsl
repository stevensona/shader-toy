// Shader by Flyguy
// Adapted for shadertoy VS-Code from: https://www.shadertoy.com/view/MtdcDn

#iChannel0 "volume_points_0.glsl"

#include "volume_points_common.glsl"

#define DEBUG 0 //Visualize the planes
#define ADD 1
#define ALPHA 2

#define BLENDMODE ADD

#iUniform float CUBE_SIZE = 1.5 in { 0.5, 3.5 }
#iUniform float GRID_RES = 17.0 in { 8, 32 }
#iUniform float POINT_SIZE = 0.375 in { 0.01, 1.5 }
#iUniform color3 COLOR_BOOST = color3(1, 1, 1)
#iUniform float ALPHA_BOOST = 3.0 in { 0, 3 }

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 res = iResolution.xy / iResolution.y;
	vec2 uv = fragCoord.xy / iResolution.y;
    
    //Camera setup
    vec3 camAngles = vec3((iMouse.xy / iResolution.xy) * pi, 0);
    camAngles.xy *= vec2(2.0, 1.0);
    
    //Thumbnail mode
    if(iMouse.xy == vec2(0))
    {
    	camAngles = vec3(iTime*0.6, 1.0, 0.0);   
    }
    
    mat3 camMatrix = rotate(camAngles.yzx);
    vec3 camOrig = vec3(0, 0,-1.5) * camMatrix; 
    vec3 camDir = normalize(vec3(uv - res/2.0, 0.5)) * camMatrix;
    
    //Setup plane axis,initial location, and step direction based on ray direction
    vec3 planeNorm = nearestAxis(camDir);
    vec3 planePos = planeNorm * ((GRID_RES-1.0)/GRID_RES)/2.0 * CUBE_SIZE;
    vec3 planeDelta = planeNorm / GRID_RES * CUBE_SIZE;
    
    vec3 outColor = vec3(0);
    vec3 volRes = volumeSize(iChannel0);
    
    for(float i = 0.0;i < GRID_RES;i++)
    {
        vec3 hit = rayPlane(camOrig, camDir, planePos, planeNorm) / CUBE_SIZE;
        
		planePos -= planeDelta;
        
        if(max3(abs(hit)) < 0.5) //Only draw areas inside the cube.
        {
            vec3 pointUVW = fract(((hit-0.5)*GRID_RES))-0.5;
            vec3 volUVW = (floor(((hit-0.5)*GRID_RES))+0.5) / GRID_RES;
            
            //Sample the pseudo-volumetric texture in BufA
            vec4 vCol = texture3DLinear(iChannel0, volUVW, volRes);
            vCol = clamp(vCol * vec4(COLOR_BOOST, ALPHA_BOOST), 0.0, 1.0);
            
            //Make the points face the camera.
            //This makes the transition between planes seamless.
            pointUVW = cross(pointUVW,camDir);
            
            //Shape of the points
            float pointMask = smoothstep(POINT_SIZE*vCol.a,
                                         POINT_SIZE*vCol.a*0.8,
                                         length(pointUVW));
            
            #if BLENDMODE == ADD
            	outColor += 0.5*vCol.rgb*pointMask*vCol.a;
            #elif BLENDMODE == ALPHA
            	outColor = mix(outColor, vCol.rgb, pointMask*vCol.a);
            #elif BLENDMODE == DEBUG
            	outColor = (planeNorm*.5+.5)*(i/GRID_RES);
            #endif
        }
	}

	fragColor = vec4(outColor,1.0);
}