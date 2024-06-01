# Visual Studio Code - Shader Toy
<p align="center">
  <a href="https://github.com/stevensona/shader-toy/actions">
      <img src="https://github.com/stevensona/shader-toy/workflows/Build%20and%20Test/badge.svg">
  </a>
  <a href="https://opensource.org/licenses/MIT" >
      <img src="https://img.shields.io/apm/l/vim-mode.svg">
  </a>
</p>

With this extension, view a live WebGL preview of GLSL shaders within VSCode, similar to [shadertoy.com](https://www.shadertoy.com/) by providing a "Show GLSL Preview" command.

![metaballs example](https://raw.githubusercontent.com/stevensona/shader-toy/master/images/example.png)

To run the command, either open the "Command Palette" and type "Shader Toy: Show GLSL Preview" or right-click inside a text editor and select "Shader Toy: Show GLSL Preview" from the context menu.

Running the command splits the view and displays a fullscreen quad with your shader applied. Your fragment shader's entry point is `void main()` or if that is unavailable `void mainImage(out vec4, in vec2)` where the first parameter is the output color and the second parameter is the fragments screen position.

An alternative command "Shader Toy: Show Static GLSL Preview" is available, which will open a preview that does not react to changing editors. An arbitrary amount of those views can be opened at one time, which enables a unique workflow to edit shaders that rely on multiple passes. 

## Features

### Uniforms
At the moment, `iResolution`, `iGlobalTime` (also as `iTime`), `iTimeDelta`, `iFrame`, `iMouse`, `iMouseButton`, `iDate`, `iSampleRate`, `iChannelN` with `N in [0, 9]` and `iChannelResolution[]` are available uniforms.

### Texture Input
The texture channels `iChannelN` may be defined by inserting code of the following form at the top of your shader
```
#iChannel0 "file://duck.png"
#iChannel1 "https://66.media.tumblr.com/tumblr_mcmeonhR1e1ridypxo1_500.jpg"
#iChannel2 "file://other/shader.glsl"
#iChannel2 "self"
#iChannel4 "file://music/epic.mp3"
```
This demonstrates using local and remote images as textures *(Remember that power of 2 texture sizes is generally what you want to stick to.)*, using another shaders results as a texture, using the last frame of this shader by specifying `self` or using audio input. Note that to use relative paths for local input you will have to open a folder in Visual Code.
![texture example](https://raw.githubusercontent.com/stevensona/shader-toy/master/images/example2.png)
To influence the sampling behaviour of a texture, use the following syntax:
```
#iChannel0::MinFilter "NearestMipMapNearest"
#iChannel0::MagFilter "Nearest"
#iChannel0::WrapMode "Repeat"
```
Though keep in mind that, because of the WebGL standard, many options will only work with textures of width and height that are power of 2.

### Cubemap Input
Cubemaps may be specified as any other texture, the fact that they are cubemaps is a combination of their path containing a wildcard and their type being explicitly stated.
```
#iChannel0 "file://cubemaps/yokohama_{}.jpg" // Note the wildcard '{}'
#iChannel0::Type "CubeMap"
```
The wildcard will be resolved by replacement with values from any of the following sets
* [ 'e', 'w', 'u', 'd', 'n', 's' ],
* [ 'east', 'west', 'up', 'down', 'north', 'south' ],
* [ 'px', 'nx', 'py', 'ny', 'pz', 'nz' ] or
* [ 'posx', 'negx', 'posy', 'negy', 'posz', 'negz' ].

If any of the six files can not be found, the next set is tried, starting from the first. 

### Audio Input (experimental)
_Note: By default audio input is disabled, change the setting "Enable Audio Input" to use it._\
Audio input is not supported from within _Visual Studio Code_, since _ffmpeg_ is not shipped with _Visual Studio Code_, so you will have to generate a standalone version and host a local server to be able to load local files (or fiddle with your browsers security settings) if you want to use audio in your shaders.
If your channel defines audio input, it will be inferred from the file extension. The channel will be a `2` pixels high and `512` pixels wide texture, where the width can be adjusted by the "Audio Domain Size" setting. The first row containing the audios frequency spectrum and the second row containing its waveform.

### Keyboard Input
If you want to use keyboard input you can prepend `#iKeyboard` to your shader. This will expose to your shader the following functions:
```
bool isKeyPressed(int);
bool isKeyReleased(int);
bool isKeyDown(int);
bool isKeyToggled(int);
```
Additionally it will expose variables such as `Key_A` to `Key_Z`, `Key_0` to `Key_9`, `Key_UpArrow`, `Key_LeftArrow`, `Key_Shift`, etc. Use these constants together with the functions mentioned above to query the state of a key.

### Shader Includes
You may also include other files into your shader via a standard C-like syntax:
```
#include "some/shared/code.glsl"
#include "other/local/shader_code.glsl"
#include "d:/some/global/code.glsl"
```
These shaders may not define a `void main()` function and as such can be used only for utility functions, constant definitions etc.

### Custom Uniforms (experimental and subject to change)
To use custom uniforms define those directly in your shader, giving an initial value as well as an optional range for the uniform.
```glsl
#iUniform float my_scalar = 1.0 in { 0.0, 5.0 } // This will expose a slider to edit the value
#iUniform float my_discreet_scalar = 1.0 in { 0.0, 5.0 } step 0.2 // This will expose a slider incrementing at 0.2
#iUniform float other_scalar = 5.0 // This will expose a text field to give an arbitrary value
#iUniform color3 my_color = color3(1.0) // This will be editable as a color picker
#iUniform vec2 position_in_2d = vec2(1.0) // This will expose two text fields
#iUniform vec4 other_color = vec4(1.0) in { 0.0, 1.0 } // This will expose four sliders

 `iViewMatrix`, a mat4 with the view matrix. Must use directive `#iFirstPersonControls` in order to control, otherwise it remains identity.
 Controls:
 <b>WASD</b> move, <b>R|F</b> up | down, <b>Q|E</b> roll, <b>up|down</b> pitch, <b>left|right</b> yaw
```

### Compatibility with Shadertoy.com
The following is an example of a shader ported from *shadertoy.com*:
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
Note that compared to *shadertoy.com* `gl_FragCoord` replaces `fragCoord` and `gl_FragColor` replaces `fragColor` in the original demo. There is however a rudimentary support for inserting a trivial `void main()` which will delegate to a `void mainImage(out vec4, in vec2)` function. The definition of `void main()` is found by matching the regex `/void\s+main\s*\(\s*\)\s*\{/g`, thus if you require to define `void main()` in addition to the extension generating a definition you may define it as `void main(void)`. This might be necessary, for example, if your main definition would be processed away by the preprocessor and should thus not be picked up by the extension.
Since compatibility is achieved with a simple regex match it is only semi-reliable. If you only use shaders from *shadertoy.com* that do things such as defining `mainImage` via macros you may want to enable the "Shader Toy Strict Compatibility" setting, which disables the ability to use shaders that define `void main()` and only allows shaders that define `mainImage` in some way. Alternatively you can use `#StrictCompatibility` in your shader to have this feature localized to just that shader.

### Integration of _glslify_
You can enable support for _glslify_ in the settings, but because _glslify_ does not support line mappings pre and post its transform, line numbers on errors will unfortunately be disabled as long as you have the setting enabled. Using _glslify_ allows using a node.js-style module system for your shaders:
```glsl
#pragma glslify: snoise = require('glsl-noise/simplex/2d')

float noise(in vec2 pt) {
    return snoise(pt) * 0.5 + 0.5;
}

void main () {
    float r = noise(gl_FragCoord.xy * 0.01);
    float g = noise(gl_FragCoord.xy * 0.01 + 100.0);
    float b = noise(gl_FragCoord.xy * 0.01 + 300.0);
    gl_FragColor = vec4(r, g, b, 1);
}
```


### GLSL Preview Interaction
The extension provides a pause button inside the GLSL Preview to stop the progression of time. In conjunction with this you can use the screenshot button provided inside the GLSL Preview to capture and save a frame. The resolution of the saved screenshot will by default be the same resolution as the GLSL Preview, though a setting is available that allows the user to override the resolution with an arbitrary value. A recording button is also available, the quality as well as the size of the recording is determined by the webview. Lastly the extension provides a superficial view into the shaders performance and memory consumption.

### Error Highlighting
The extension also supports highlighting of compilation errors in the text editor, for single shaders but also for multiple passes. It does so by showing errors as diagnostics directly in the text editor as well as presenting them in a digestible format inside the GLSL Preview and allowing the user to interact with the error messages to jump to the relevant lines, and open the relevant files if necessary:

![error example](https://raw.githubusercontent.com/stevensona/shader-toy/master/images/example3.png)

## Recording Capabilities
Two rendering modes are supported:
* Realtime rendering: suitable for previews and scenarios where real-time interaction with the visuals are required. As with all real-time video capture, frame drops might occur, especially on lower spec hardware or when rendering very complex visuals.
* Offline rendering: suitable for production-grade rendering. Each frame is rendered sequentially without any drops.

The default is real-time rendering to activate offline rendering set `shader-toy.recordOffline`to true.

### Shared parameters

* `shader-toy.recordTargetFramerate`: Set recording target frame-rate. Default is 30fps.
* `shader-toy.recordMaxDuration`: Maximum recording duration in seconds. 0 (the default) will keep recording until the record button is pressed again.

### Real-time Rendering parameters

* `shader-toy.recordVideoContainer`: Set the video file container. Currently only `webm` is supported, but `mp4`support is coming [soon](https://chromestatus.com/feature/5163469011943424).
* `shader-toy.recordVideoCodec`: Set video codec. `vp8`, `vp9`, `h264` and `avc1` are all supported. Default it `vp8`.
* `shader-toy.recordVideoBitRate`: Set recording bit rate in bits/second. Default is 2500000.

### Offline rendering parameters

* `shader-toy.recordOfflineFormat`: Offline recording format. Possible value are `webm`, `gif`, `png` and `jpg`. PNG and JPEG images are individual images packaged in a .tar archive.
* `shader-toy.recordOfflineQuality`: Offline recording quality. 0 is lowest and 100 highest. Applies when format is `webm` or `jpg`.

## Requirements

* A graphics card supporting WebGL.

## Known Issues

* Performance at the moment is not great for certain shaders, and the cause is under investigation
* Shaders with audio from remote sources are currently not working properly, this is however an issue on VSCode side and will be fixed when releasing with Electron 6.
* There seems to be a very rare bug that causes audio inputs to sound corrupted.

## Contributing

Contributions of any kind are welcome and encouraged.

[GitHub Project Page](https://github.com/stevensona/shader-toy)

[Contributing Guidelines](https://raw.githubusercontent.com/stevensona/shader-toy/master/CONTRIBUTING.md)

[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=stevensona.shader-toy)

## Release Notes

### 0.11.3
* Added `shader-toy.recordVideoContainer` (set video file container).
* Added `shader-toy.recordVideoCodec` (set video codec).
* Added `shader-toy.recordVideoBitRate` (set recording bit rate).
* Added `shader-toy.recordMaxDuration` (set maximum recording duration).
* Fixed the `shader-toy.recordTargetFramerate` setting.
* Moved the Stats widget to the bottom left, so it doesn't overlap with the GUI.
* Added `shader-toy.recordOffline` to switch between real-time and offline rendering.
* Added `shader-toy.recordOfflineFormat`. Used in conjunction with `shader-toy.recordOffline`
* Added `shader-toy.recordOfflineQuality`. Used in conjunction with `shader-toy.recordOffline`
* Added `shader-toy.reloadOnSaveFile` option to reload on save,
* fixed a bug where glslify would never find modules.

### 0.11.2
* Added free fly controls,
* fixed a bug that would result in recording the frame time panel.

### 0.11.1
* Added option to maintain pause state when reloading the shader,
* added ability to record the shader,
* fixed first frame of mouse down mismatch with online version,
* added setting to not compile included files separately.

### 0.11.0
* Use the async interface for file I/O.

### 0.10.15
* Lex numbers with exponents as floating point, not integer,
* make assignability testing more robust.

### 0.10.14
* Hotfix, extension was trying to run a non-existant file.

### 0.10.13
* Fix attributions of several demo shaders,
* align default wrap mode with what is default on shadertoy.com,
* allow control of filter and wrap mode for sampling other shaders,
* add a strict compatibility mode for shadertoy.com,
* add setting to skip all automatic recompilation and instead have a button in the webview for that.

### 0.10.11
* Automatic dependency updates.

### 0.10.10
* Fix stats display,
* fix includes and shader names resolving on only their filename,
* fix shader reloading on extension settings changing.

### 0.10.9
* Hotfix a freeze when parsing some multiline c-style comments.

### 0.10.8
* Hotfix to make the extension work with the web version of VSCode.

### 0.10.7
* Make all uniform vector types use separate UI for editing them at runtime,
* add a color3 uniform type when the user explicitly wants a color edit field,
* fix an error where using uniforms could cause the extension to become unresponsive when mixing unexpected types,
* introduce the step keyword to allow setting an increment for uniform values,
* improve error reporting for parsing errors when files are included early in a shader.

### 0.10.6
* Add commands corresponding to UI buttons to allow custom keybindings. Thank you @Ayassaka

### 0.10.5
* Fix bug that caused the static preview command to open a dynamic preview,
* fix a bug when parsing back-to-back comments
* fix a bug with uniforms that have more than one and not exactly three components,
* fully support floating point parsing, including exponents.

### 0.10.4
* Fix an issue that caused a full webview recreation on a recompile,
* made webview not grab focus when it is being created.

### 0.10.3
* Improve error diagnostic for texture settings,
* add a command to generate a portable file of the GLSL preview,
* fix a bug a bug where MinFilter was not recognised as a valid setting,
* add basic support for cubemaps,
* fix an issue that would not allow arbitrary local resources from absolute paths.

### 0.10.2
* Hotfix for infinite loop while parsing a shader.

### 0.10.1
* Correctly parse comments in GLSL code, allowing to remove e.g. texture definitions with both single- as well as multi-line comments,
* changed syntax for uniform definitions to align closer to standard GLSL syntax,
* allow definitions of e.g. textures to be made in include files,
* reworked path resolution for files, adding the possibility to find files relative to the file they are used in,
* make the initial './' in relative paths optional,
* reload shaders when their dependents change, e.g. when included files change,
* maintain state of uniforms gui across reloads.

### 0.9.2
* Add controls for custom uniforms,
* add documentation for custom uniforms,
* add a static GLSL view for working on multi pass projects,
* enabled code to be loaded from visible editors instead of files.

### 0.9.1
* Small refactor to improve development iteration time,
* add support for multiple folders in a workspace,
* add support for custom screenshot resolution,
* fix a type mismatch for forceAspectRatio setting,
* added experimental, undocumented support for custom uniforms.

### 0.9.0
* Major refactoring,
* added support for iChannelResolution.

### 0.8.10
* Fix bugs that allowed only one shader to be parsed.

### 0.8.9
* Added rudimentary support for glslify,
* added support for texture sampling and wrapping options,
* fix includes to allow going into depth rather than only one level deep.

### 0.8.8
* Update iFrame after a frame is rendered instead of before, so that the first frames value is zero,
* fixed a bug that caused deprecation warnings to be shown only if the user meant to disable them,
* fixed a bug with wrong line numbers being displayed if the shader contains a version directive,
* enabled diagnostics correctly when using multiple passes,
* allow specifying a path for a shader as input even if the path refers to the very same shader, thus removing the need for the self keyword despite being a shorthand,
* added shader compile-time panel to stats,
* fixed bug that caused circular dependencies between passes not to work.

### 0.8.7
* Hotfix for typo.

### 0.8.6
* Document how main definition is found,
* remove version directives from shaders,
* fix an issue that would remove all newlines from beginning of shader and cause errors to be reported on the wrong lines,
* reintroduce error when textures could not be loaded,
* add iGlobalFrame,
* add option that shows compile errors as diagnostics, enabled by default.

### 0.8.5
* Hotfix for missing dependencies.

### 0.8.4
* The extension now reloads the GLSL Preview when the user changes the extension's settings,
* iTime, iMouse and iKeyboard states now persist across compilations of the same shader,
* added an option to persist state also when changing the shader that is previewed, disabled by default,
* fixed bug that caused a reload of the preview when unfocusing and refocusing the previewed editor,
* added icon to GLSL Preview,
* deprecated input definitions inside settings.json in favour of inside the shader,
* fixed a bug that broke line highlighting from GLSL compile errors,
* added experimental ability use audio as input to shaders,
* added iSampleRate uniform, which holds the sample rate of the audio context,
* deprecated input definitions using different "protocols", instead the type of input is inferred from the extension, 
* deprecated requirement of using a "protocol" for includes,
* added iDate uniform, which holds year, month, day and seconds in day in its components,
* fixed a bug that caused shaders defining void mainImage(out vec4, in vec2) without in qualifier to not compile,
* added ability to specify input in quotes, rather than freestanding, which removes some bugs with spaces in file paths,
* deprecated omitting quotes when specifying input,
* added option to omit deprecation warnings, disabled by default,
* introduced a small update message.

### 0.8.3
* Hotfix for texture loading bug introduced in the last version.

### 0.8.2
* Fixed issue with path generation on Linux and MacOS resulting in a broken experience,
* fixed issue where editor changes would trigger a shader reload even if they were not text editors.

### 0.8.0
* Refactored a lot of code to use _Visual Studio Code_'s _WebView API_ instead of its deprecated _PreviewHtml_ command.

### 0.7.10
* Fixed behaviour of iMouse to resemble shaderoty.com as close as possible,
* added iMouseButton uniform which holds left mousebutton in x and right mousebutton in y, 0 being up and 1 being down.

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
