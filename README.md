# Visual Studio Code - Shader Toy

With this extension, view a live WebGL preview of GLSL shaders within VSCode, similar to [shadertoy.com](https://www.shadertoy.com/) by providing a "Show GLSL Preview" command.

![metaballs example](https://raw.githubusercontent.com/stevensona/shader-toy/master/images/example.png)

 Running the command splits the view and displays a fullscreen quad with your shader applied. Your fragment shader's entry point is ```void main()```. 

## Features

Automatically update display with the results of your shader. At the moment, ```iResolution```, ```iGlobalTime```, and ```iDeltaTime```, ```iChannel0-3``` are the only uniforms provided. The 4 available texture channels (```iChannel0```...```iChannel3```) may be defined by modifying the workspace's settings.json file. For example:  
```
{
    "shader-toy.textures": {
        "0": "./duck.png",
        "1": "https://66.media.tumblr.com/tumblr_mcmeonhR1e1ridypxo1_500.jpg"
    }
}
```
This demonstrates using local and remote images as textures. *Remember that "power of 2" texture sizes is generally what you want to stick to.*


The following is an example ported from Shadertoy.com:
```glsl
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// Created by S.Guillitte 
void main()
{
	float time=iGlobalTime*1.0;
	vec2 uv = (gl_FragCoord.xy / iResolution.xx-0.5)*8.0;
    vec2 uv0=uv;
	float i0=1.0;
	float i1=1.0;
	float i2=1.0;
	float i4=0.0;
	for(int s=0;s<7;s++)
	{
		vec2 r;
		r=vec2(cos(uv.y*i0-i4+time/i1),sin(uv.x*i0-i4+time/i1))/i2;
        r+=vec2(-r.y,r.x)*0.3;
		uv.xy+=r;
        
		i0*=1.93;
		i1*=1.15;
		i2*=1.7;
		i4+=0.05+0.1*time*i1;
	}
    float r=sin(uv.x-time)*0.5+0.5;
    float b=sin(uv.y+time)*0.5+0.5;
    float g=sin((uv.x+uv.y+sin(time*0.5))*0.5)*0.5+0.5;
	gl_FragColor = vec4(r,g,b,1.0);
}
```

note that ```gl_FragCoord``` replaces ```fragCoord``` and ```gl_FragColor``` replaces ```fragColor``` in the original demo.

The following is an example of using textures in shaders:  
![texture example](https://raw.githubusercontent.com/stevensona/shader-toy/master/images/example2.png)

## Requirements

* A graphics card supporting WebGL.

## Known Issues

* Performance at the moment is not great for certain shaders, and the cause is under investigation.

## Todo

* Better error output integration with the editor (Highlight error lines with error message)
* FPS counter in status bar
* Improve compatibility with "shadertoy" shaders.

## Contributing

Contributions of any kind are welcome and encouraged. 

[Github Project Page](https://github.com/stevensona/shader-toy)  
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=stevensona.shader-toy)

## Release Notes

### 0.1.6

This patch adds the ability to view GLSL compiler errors. They are currently displayed as a list in the preview viewport.

### 0.1.5

Fix for error when settings.json is not present (no textures defined)

### 0.1.4

Adds support for texture channels.

### 0.1.3

Add support for a few more of the uniforms, and implements a 1 second time delay between modifying the source and recompilation. 

### 0.1.1

Initial release of shadertoy for vscode. Many uniforms not available.
