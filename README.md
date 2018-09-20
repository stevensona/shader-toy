# Visual Studio Code - Shader Toy

With this extension, view a live WebGL preview of GLSL shaders within VSCode, similar to [shadertoy.com](https://www.shadertoy.com/) by providing a "Show GLSL Preview" command.

![metaballs example](https://raw.githubusercontent.com/stevensona/shader-toy/master/images/example.png)

 Running the command splits the view and displays a fullscreen quad with your shader applied. Your fragment shader's entry point is ```void main()``` or if that is unavailable ```void mainImage(out vec4, in vec2)``` where the first parameter is the output color and the second parameter is the fragments screen position.

## Features

Automatically update display with the results of your shader. At the moment, ```iResolution```, ```iGlobalTime``` (also as ```iTime```), ```iTimeDelta```, ```iFrame```, ```iMouse```, and ```iChannelN``` with ```N in [0, 9]``` are the only uniforms provided. The texture channels ```iChannelN``` may be defined by modifying the workspace's settings.json file. For example:
```
{
    "shader-toy.textures": {
        "0": "file://./duck.png",
        "1": "https://66.media.tumblr.com/tumblr_mcmeonhR1e1ridypxo1_500.jpg"
    }
}
```
This demonstrates using local and remote images as textures. *Remember that "power of 2" texture sizes is generally what you want to stick to.* If the ```useInShaderTextures``` option is enabled (disabled by default), textures can also be referenced from the shader source itself like so: ```#iChannel0 https://example.com/example.png```. Note that to be able to use relative paths you will have to open a folder in Visual Code. Besides textures one can also use other shaders by using the ```buf://``` protocol, e.g. ```#iChannel0 buf://./first-pass.glsl```.

The following is an example ported from shadertoy.com:
```glsl
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// Created by S.Guillitte
void main() {
  float time = iGlobalTime * 1.0;
  vec2 uv = (gl_FragCoord.xy / iResolution.xx - 0.5) * 8.0;
  vec2 uv0 = uv;
  float i0 = 1.0;
  float i1 = 1.0;
  float i2 = 1.0;
  float i4 = 0.0;
  for (int s = 0; s < 7; s++) {
    vec2 r;
    r = vec2(cos(uv.y * i0 - i4 + time / i1), sin(uv.x * i0 - i4 + time / i1)) / i2;
    r += vec2(-r.y, r.x) * 0.3;
    uv.xy += r;

    i0 *= 1.93;
    i1 *= 1.15;
    i2 *= 1.7;
    i4 += 0.05 + 0.1 * time * i1;
  }
  float r = sin(uv.x - time) * 0.5 + 0.5;
  float b = sin(uv.y + time) * 0.5 + 0.5;
  float g = sin((uv.x + uv.y + sin(time * 0.5)) * 0.5) * 0.5 + 0.5;
  gl_FragColor = vec4(r, g, b, 1.0);
}
```
Note that compared to *shadertoy.com* ```gl_FragCoord``` replaces ```fragCoord``` and ```gl_FragColor``` replaces ```fragColor``` in the original demo. There is however a rudimentary support for inserting a trivial ```void main()``` which will delegate to a ```void mainImage(out vec4, in vec2)``` function.

The following is an example of using textures in shaders:
![texture example](https://raw.githubusercontent.com/stevensona/shader-toy/master/images/example2.png)

The extensions also supports highlighting of compilation errors in the text editor, for single shaders but also for multiple passes:
![error example](https://raw.githubusercontent.com/stevensona/shader-toy/master/images/example3.png)

## Requirements

* A graphics card supporting WebGL.

## Known Issues

* Performance at the moment is not great for certain shaders, and the cause is under investigation.

## Todo

* Improve compatibility with "shadertoy" shaders,
* allow shaders to feed back into themselves,
* allow using audio channels like shadertoy.com does
* allow using keyboard input like shadertoy.com does.

## Contributing

Contributions of any kind are welcome and encouraged.

[Github Project Page](https://github.com/stevensona/shader-toy)
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=stevensona.shader-toy)

## Release Notes

### 0.7.1

* Added support for using other shaders as inputs (experimental),
* promoted definition of textures in shader from experimental to full feature,
* now allows for using paths relative to the working directory,
* improved support for compiler errors, which can now be used to highlight the erroneous lines,
* improved compatibility with original shader-toy shaders by allowing shaders missing void main but providing void mainImage,
* added shader preview command to context menu.

### 0.7.0

* Fixes the issue with wrongly corresponding line numbers on compiler errors,
* adds a preprocessor definition SHADER_TOY to disambiguate easier where your shader is running,
* allows specifying textures inside the shader instead of inside the vs-vode options (experimental),
* adds an option which uses a remote stats.js to show frame time,
* added support for the iFrame uniform,
* added support for the iMouse uniform,'
* added option to reload shaders when changing the editor.

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
