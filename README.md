# Visual Studio Code - Shader Toy

With this extension, view a live WebGL preview of GLSL shaders within VSCode, similar to [shadertoy.com](https://www.shadertoy.com/) by providing a "Show GLSL Preview" command.

![metaballs example](https://raw.githubusercontent.com/stevensona/shader-toy/master/images/example.png)

 Running the command splits the view and displays a fullscreen quad with your shader applied. Your fragment shader's entry point is ```void main()``` or if that is unavailable ```void mainImage(out vec4, in vec2)``` where the first parameter is the output color and the second parameter is the fragments screen position.

## Features

Automatically update display with the results of your shader. At the moment, ```iResolution```, ```iGlobalTime``` (also as ```iTime```), ```iTimeDelta```, ```iFrame```, ```iMouse```, and ```iChannelN``` with ```N in [0, 9]``` are the only uniforms provided. The texture channels ```iChannelN``` may be defined by inserting code of the following form at the top of your shader
```
#iChannel0 file://./duck.png
#iChannel1 https://66.media.tumblr.com/tumblr_mcmeonhR1e1ridypxo1_500.jpg
#iChannel2 buf://./other/shader.glsl
```
This demonstrates using local and remote images as textures *(Remember that "power of 2" texture sizes is generally what you want to stick to.)* or usign another shaders results as a texture. You may also use the last frame of the current shader itself as a texture by specifying simply ```self``` instead of a path.
If the ```useInShaderTextures``` option is disable you can define the channels by modifying the workspace's settings.json file. For example:
```
{
    "shader-toy.textures": {
        "0": "file://./duck.png",
        "1": "https://66.media.tumblr.com/tumblr_mcmeonhR1e1ridypxo1_500.jpg",
        "2": "buf://./other/shader.glsl"
    }
}
```
Note that for either option to be able to use relative paths you will have to open a folder in Visual Code.

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

If you want to use keyboard input you can prepend ```#iKeyboard``` to your shader. This will expose to your shader the following functions:
```
bool isKeyPressed(int);
bool isKeyReleased(int);
bool isKeyDown(int);
bool isKeyToggled(int);
```
Additionally it will expose variables such as ```Key_A``` to ```Key_Z```, ```Key_0``` to ```Key_9```, ```Key_UpArrow```, ```Key_LeftArrow```, ```Key_Shift```, etc. Use these constants together with the functions mentioned above to querry the state of a key. 

## Requirements

* A graphics card supporting WebGL.

## Known Issues

* Performance at the moment is not great for certain shaders, and the cause is under investigation.

## Todo

* Improve compatibility with "shadertoy" shaders,
* allow using audio channels like shadertoy.com does.

## Contributing

Contributions of any kind are welcome and encouraged.

[Github Project Page](https://github.com/stevensona/shader-toy)
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=stevensona.shader-toy)

## Release Notes

### 0.7.9
* Added setting to enforce aspect ratio, this has to be entered manually into users settings.json,
* added setting to enable a screenshot button to save the current frame as a png, enabled by default.

### 0.7.6
* Added experimental support for keyboard input.

### 0.7.5
* Added experimental support for includes, relative to the shader file.

### 0.7.4

* Added support for using the current shader as input, thus allowing it to feed into itself (experimental),
* improved error handling in some cases,
* fixed a bug that would cause a iChannel definition inside a shader to be parsed even when commented out,
* added an option that allows users to specify the delay between shader edits and shader reloads,
* added an option to emit a warning when a shader uses an iChannel that is not defined (experimental),
* added an option which gives the user a pause button inside the GLSL preview.

### 0.7.3

* Added support for WebGL 2.0 if available,
* using higher precision textures if available.

### 0.7.2

* Hotfix for a bug which would cause users to crash on any shader preview.

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

## Acknowledgements

Screenshot feature's camera icon made by [Smashicons](https://www.flaticon.com/authors/smashicons) from www.flaticon.com.
