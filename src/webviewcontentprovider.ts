'use strict';

import * as Types from './typenames';
import { ShaderParser } from './shaderparser';
import { Context } from './context';
import { WebviewContentAssembler } from './webviewcontentassembler';
import { WebviewExtension } from './extensions/webview_extension';

import { InitialTimeExtension } from './extensions/initial_time_extension';
import { InitialMouseExtension } from './extensions/initial_mouse_extension';
import { InitialNormalizedMouseExtension } from './extensions/initial_normalized_mouse_extension';

import { ForcedAspectExtension } from './extensions/forced_aspect_extension';
import { ForcedScreenshotResolutionExtension } from './extensions/forced_screenshot_resolution_extension';

import { ShaderPreambleExtension } from './extensions/preamble_extension';

import { KeyboardInitExtension } from './extensions/keyboard/keyboard_init_extension';
import { KeyboardUpdateExtension } from './extensions/keyboard/keyboard_update_extension';
import { KeyboardCallbacksExtension } from './extensions/keyboard/keyboard_callbacks_extension';
import { KeyboardShaderExtension } from './extensions/keyboard/keyboard_shader_extension';

import { JQueryExtension } from './extensions/packages/jquery_extension';
import { ThreeExtension } from './extensions/packages/three_extension';
import { StatsExtension } from './extensions/packages/stats_extension';

import { PauseButtonStyleExtension } from './extensions/user_interface/pause_button_style_extension';
import { PauseButtonExtension } from './extensions/user_interface/pause_button_extension';
import { ScreenshotButtonStyleExtension } from './extensions/user_interface/screenshot_button_style_extension';
import { ScreenshotButtonExtension } from './extensions/user_interface/screenshot_button_extension';

import { DefaultErrorsExtension } from './extensions/user_interface/error_display/default_errors_extension';
import { DiagnosticsErrorsExtension } from './extensions/user_interface/error_display/diagnostics_errors_extension';
import { GlslifyErrorsExtension } from './extensions/user_interface/error_display/glslify_errors_extension';

import { PauseWholeRenderExtension } from './extensions/pause_whole_render_extension';
import { AdvanceTimeExtension } from './extensions/advance_time_extension';
import { AdvanceTimeIfNotPausedExtension } from './extensions/advance_time_if_not_paused_extension';

import { BuffersInitExtension } from './extensions/buffers/buffers_init_extension';
import { ShadersExtension } from './extensions/buffers/shaders_extension';
import { IncludesExtension } from './extensions/buffers/includes_extension';
import { IncludesInitExtension } from './extensions/buffers/includes_init_extension';

import { TexturesInitExtension } from './extensions/textures/textures_init_extension';

import { NoAudioExtension } from './extensions/audio/no_audio_extension';
import { AudioInitExtension } from './extensions/audio/audio_init_extension';
import { AudioUpdateExtension } from './extensions/audio/audio_update_extension';
import { AudioPauseExtension } from './extensions/audio/audio_pause_extension';
import { AudioResumeExtension } from './extensions/audio/audio_resume_extension';

export class WebviewContentProvider {
    private context: Context;
    private webviewAssembler: WebviewContentAssembler;
    private documentContent: string;
    private documentName: string;
    
    constructor(context: Context, documentContent: string, documentName: string) {
        this.context = context;
        this.webviewAssembler = new WebviewContentAssembler(context);
        this.documentContent = documentContent;
        this.documentName = documentName;
    }

    public generateWebviewConent(startingState: Types.RenderStartingData): string {
        let shader = this.documentContent;
        let shaderName = this.documentName;

        let preambleExtension = new ShaderPreambleExtension();
        this.webviewAssembler.addReplaceModule(preambleExtension, 'LineOffset: <!-- Preamble Line Numbers --> + 2', '<!-- Preamble Line Numbers -->');

        let webglLineNumbers = 101;

        shaderName = shaderName.replace(/\\/g, '/');
        let buffers: Types.BufferDefinition[] = [];
        let commonIncludes: Types.IncludeDefinition[] = [];

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Parse Shaders
        {
            new ShaderParser(this.context).parseShaderCode(shaderName, shader, buffers, commonIncludes);

            // If final buffer uses feedback we need to add a last pass that renders it to the screen
            // because we can not ping-pong the screen
            {
                let finalBuffer = buffers[buffers.length - 1];
                if (finalBuffer.UsesSelf) {
                    let finalBufferIndex = buffers.length - 1;
                    finalBuffer.Dependents.push({
                        Index: buffers.length,
                        Channel: 0
                    });
                    buffers.push({
                        Name: "final-blit",
                        File: "final-blit",
                        Code: `void main() { gl_FragColor = texture2D(iChannel0, gl_FragCoord.xy / iResolution.xy); }`,
                        TextureInputs: [{
                            Channel: 0,
                            Buffer: finalBuffer.Name,
                            BufferIndex: finalBufferIndex,
                        }],
                        AudioInputs: [],
                        Includes: [],
                        UsesSelf: false,
                        SelfChannel: -1,
                        Dependents: [],
                        LineOffset: 0,
                    });
                }
            }
        }


        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Feature Check
        let useKeyboard = false;
        let useAudio = false;
        for (const buffer of buffers) {
            if (buffer.UsesKeyboard) {
                useKeyboard = true;
            }

            const audios =  buffer.AudioInputs;
            if (audios.length > 0) {
                useAudio = true;
                break;
            }
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Initial State
        let initialTimeExtension = new InitialTimeExtension(startingState.Time);
        this.webviewAssembler.addReplaceModule(initialTimeExtension, 'let startingTime = <!-- Start Time -->;', '<!-- Start Time -->');
        let initialMouseExtension = new InitialMouseExtension(startingState.Mouse);
        this.webviewAssembler.addReplaceModule(initialMouseExtension, 'let mouse = new THREE.Vector4(<!-- Start Mouse -->);', '<!-- Start Mouse -->');
        let initialNormalizedMouseExtension = new InitialNormalizedMouseExtension(startingState.NormalizedMouse);
        this.webviewAssembler.addReplaceModule(initialNormalizedMouseExtension, 'let normalizedMouse = new THREE.Vector2(<!-- Start Normalized Mouse -->);', '<!-- Start Normalized Mouse -->');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Initial State
        let forcedAspect = this.context.getConfig<[ number, number ]>('forceAspectRatio');
        if (forcedAspect === undefined) {
            forcedAspect = [ -1, -1 ];
        }
        let forcedAspectExtension = new ForcedAspectExtension(forcedAspect);
        this.webviewAssembler.addReplaceModule(forcedAspectExtension, 'let forcedAspects = [<!-- Forced Aspect -->];', '<!-- Forced Aspect -->');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Keyboard
        let keyboardShaderExtension: KeyboardShaderExtension | undefined;
        if (useKeyboard) {
            let keyboardInit = new KeyboardInitExtension(startingState.Keys);
            this.webviewAssembler.addWebviewModule(keyboardInit, "// Keyboard Init");

            let keyboardUpdate = new KeyboardUpdateExtension();
            this.webviewAssembler.addWebviewModule(keyboardUpdate, "// Keyboard Update");

            let keyboardCallbacks = new KeyboardCallbacksExtension();
            this.webviewAssembler.addWebviewModule(keyboardCallbacks, "// Keyboard Callbacks");

            keyboardShaderExtension = new KeyboardShaderExtension();
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Fix up line offsets
        for (let buffer of buffers) {
            buffer.LineOffset += preambleExtension.getShaderPreambleLineNumbers() + webglLineNumbers;
            if (buffer.UsesKeyboard && keyboardShaderExtension !== undefined) {
                buffer.LineOffset += keyboardShaderExtension.getShaderPreambleLineNumbers();
            }
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Buffer Logic
        let buffersInitExtension = new BuffersInitExtension(buffers);
        this.webviewAssembler.addWebviewModule(buffersInitExtension, '// Buffers');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Shader Scripts
        let shadersExtension = new ShadersExtension(buffers, preambleExtension, keyboardShaderExtension);
        this.webviewAssembler.addWebviewModule(shadersExtension, '<!-- Shaders -->');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Include Scripts
        let includesExtension = new IncludesExtension(commonIncludes, preambleExtension);
        this.webviewAssembler.addWebviewModule(includesExtension, '<!-- Shaders -->');
        let includesInitExtension = new IncludesInitExtension(commonIncludes);
        this.webviewAssembler.addWebviewModule(includesInitExtension, '// Includes');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Texture Loading
        let textureInitExtension = new TexturesInitExtension(buffers, this.context);
        this.webviewAssembler.addWebviewModule(textureInitExtension, '// Texture Init');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Audio Logic
        if (useAudio) {
            let audioInitExtension = new AudioInitExtension(buffers, this.context);
            this.webviewAssembler.addWebviewModule(audioInitExtension, '// Audio Init');
            textureInitExtension.addTextureContent(audioInitExtension);

            let audioUpdateExtension = new AudioUpdateExtension();
            this.webviewAssembler.addWebviewModule(audioUpdateExtension, '// Audio Update');
            
            let audioPauseExtension = new AudioPauseExtension();
            this.webviewAssembler.addWebviewModule(audioPauseExtension, '// Audio Pause');

            let audioResumeExtension = new AudioResumeExtension();
            this.webviewAssembler.addWebviewModule(audioResumeExtension, '// Audio Resume');
        }
        else {
            let noAudioExtension = new NoAudioExtension();
            this.webviewAssembler.addWebviewModule(noAudioExtension, '// Audio Init');
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Packages
        {
            let jqueryExtension = new JQueryExtension(this.context);
            this.webviewAssembler.addReplaceModule(jqueryExtension, '<script src="<!-- JQuery.js -->"></script>', '<!-- JQuery.js -->');

            let threeExtension = new ThreeExtension(this.context);
            this.webviewAssembler.addReplaceModule(threeExtension, '<script src="<!-- Three.js -->"></script>', '<!-- Three.js -->');
        }
        if (this.context.getConfig<boolean>('printShaderFrameTime')) {
            let statsExtension = new StatsExtension(this.context);
            this.webviewAssembler.addWebviewModule(statsExtension, '<!-- Stats.js -->');
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Pause Logic
        if (this.context.getConfig<boolean>('showPauseButton')) {
            let pauseButtonStyleExtension = new PauseButtonStyleExtension(this.context);
            this.webviewAssembler.addWebviewModule(pauseButtonStyleExtension, '/* Pause Button Style */');

            let pauseButtonExtension = new PauseButtonExtension();
            this.webviewAssembler.addWebviewModule(pauseButtonExtension, '<!-- Pause Element -->');
        }

        if (this.context.getConfig<boolean>('pauseWholeRender')) {
            let pauseWholeRenderExtension = new PauseWholeRenderExtension();
            this.webviewAssembler.addWebviewModule(pauseWholeRenderExtension, '// Pause Whole Render');

            let advanceTimeExtension = new AdvanceTimeExtension();
            this.webviewAssembler.addWebviewModule(advanceTimeExtension, '// Advance Time');
        }
        else {
            let advanceTimeExtension = new AdvanceTimeIfNotPausedExtension();
            this.webviewAssembler.addWebviewModule(advanceTimeExtension, '// Advance Time');
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Screenshot Logic
        if (this.context.getConfig<boolean>('showScreenshotButton')) {
            let screenshotButtonStyleExtension = new ScreenshotButtonStyleExtension(this.context);
            this.webviewAssembler.addWebviewModule(screenshotButtonStyleExtension, '/* Screenshot Button Style */');

            let screenshotButtonExtension = new ScreenshotButtonExtension();
            this.webviewAssembler.addWebviewModule(screenshotButtonExtension, '<!-- Screenshot Element -->');
        }
        let forcedScreenshotResolution = this.context.getConfig<[ number, number ]>('screenshotResolution');
        if (forcedScreenshotResolution === undefined) {
            forcedScreenshotResolution = [ -1, -1 ];
        }
        let forcedScreenshotResolutionExtension = new ForcedScreenshotResolutionExtension(forcedScreenshotResolution);
        this.webviewAssembler.addReplaceModule(forcedScreenshotResolutionExtension, 'let forcedScreenshotResolution = [<!-- Forced Screenshot Resolution -->];', '<!-- Forced Screenshot Resolution -->');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Error Handling
        let errorsExtension: WebviewExtension;
        if (this.context.getConfig<boolean>('enableGlslifySupport')) {
            errorsExtension = new GlslifyErrorsExtension();
        }
        else if (this.context.getConfig<boolean>('showCompileErrorsAsDiagnostics')) {
            errorsExtension = new DiagnosticsErrorsExtension();
        }
        else {
            errorsExtension = new DefaultErrorsExtension();
        }
        this.webviewAssembler.addWebviewModule(errorsExtension, '// Error Callback');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Final Assembly
        return this.webviewAssembler.assembleWebviewConent();
    }
}
