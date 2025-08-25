'use strict';

import * as vscode from 'vscode';
import * as Types from './typenames';
import { Context } from './context';
import { BufferProvider } from './bufferprovider';
import { WebviewContentAssembler } from './webviewcontentassembler';
import { WebviewExtension } from './extensions/webview_extension';

import { InitialTimeExtension } from './extensions/initial_time_extension';
import { InitialPausedExtension } from './extensions/initial_paused_extension';
import { InitialMouseExtension } from './extensions/initial_mouse_extension';
import { InitialNormalizedMouseExtension } from './extensions/initial_normalized_mouse_extension';
import { InitialFlyControlPositionExtension } from './extensions/initial_fly_control_position_extension';
import { InitialFlyControlRotationExtension } from './extensions/initial_fly_control_rotation_extension';

import { ForcedAspectExtension } from './extensions/forced_aspect_extension';
import { ForcedScreenshotResolutionExtension } from './extensions/forced_screenshot_resolution_extension';

import { ShaderPreambleExtension } from './extensions/preamble_extension';

import { KeyboardInitExtension } from './extensions/keyboard/keyboard_init_extension';
import { KeyboardUpdateExtension } from './extensions/keyboard/keyboard_update_extension';
import { KeyboardCallbacksExtension } from './extensions/keyboard/keyboard_callbacks_extension';
import { KeyboardShaderExtension } from './extensions/keyboard/keyboard_shader_extension';

import { JQueryExtension } from './extensions/packages/jquery_extension';
import { ThreeExtension } from './extensions/packages/three_extension';
import { ThreeFlyControlsExtension } from './extensions/packages/three_flycontrols';
import { StatsExtension } from './extensions/packages/stats_extension';
import { DatGuiExtension } from './extensions/packages/dat_gui_extension';
import { CCaptureExtension } from './extensions/packages/ccapture_extension';

import { PauseButtonStyleExtension } from './extensions/user_interface/pause_button_style_extension';
import { PauseButtonExtension } from './extensions/user_interface/pause_button_extension';
import { ScreenshotButtonStyleExtension } from './extensions/user_interface/screenshot_button_style_extension';
import { ScreenshotButtonExtension } from './extensions/user_interface/screenshot_button_extension';
import { RecordButtonStyleExtension } from './extensions/user_interface/record_button_style_extension';
import { RecordButtonExtension } from './extensions/user_interface/record_button_extension';
import { ReloadButtonStyleExtension } from './extensions/user_interface/reload_button_style_extension';
import { ReloadButtonExtension } from './extensions/user_interface/reload_button_extension';

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
import { IncludesTestCompileExtension } from './extensions/buffers/includes_test_compile_extension';

import { TexturesInitExtension } from './extensions/textures/textures_init_extension';

import { NoAudioExtension } from './extensions/audio/no_audio_extension';
import { AudioInitExtension } from './extensions/audio/audio_init_extension';
import { AudioUpdateExtension } from './extensions/audio/audio_update_extension';
import { AudioPauseExtension } from './extensions/audio/audio_pause_extension';
import { AudioResumeExtension } from './extensions/audio/audio_resume_extension';

import { UniformsInitExtension } from './extensions/uniforms/uniforms_init_extension';
import { UniformsUpdateExtension } from './extensions/uniforms/uniforms_update_extension';
import { UniformsPreambleExtension } from './extensions/uniforms/uniforms_preamble_extension';

import { removeDuplicates } from './utility';
import { RecordTargetFramerateExtension } from './extensions/user_interface/record_target_framerate_extension';
import { RecordVideoContainerExtension } from './extensions/user_interface/record_video_container_extension';
import { RecordVideoCodecExtension } from './extensions/user_interface/record_video_codec_extension';
import { RecordVideoBitRateExtension } from './extensions/user_interface/record_video_bit_rate_extension';
import { RecordMaxDurationExtension } from './extensions/user_interface/record_max_duration_extension';
import { RecordOfflineFormatExtension } from './extensions/user_interface/record_offline_format_extension';
import { RecordOfflineQualityExtension } from './extensions/user_interface/record_offline_quality_extension';

export class WebviewContentProvider {
    private context: Context;
    private webviewAssembler: WebviewContentAssembler;
    private documentContent: string;
    private documentName: string;

    private buffers: Types.BufferDefinition[];
    private commonIncludes: Types.IncludeDefinition[];

    constructor(context: Context, documentContent: string, documentName: string) {
        this.context = context;
        this.webviewAssembler = new WebviewContentAssembler(context);
        this.documentContent = documentContent;
        this.documentName = documentName;

        this.buffers = [];
        this.commonIncludes = [];
    }

    public async parseShaderTree(generateStandalone: boolean): Promise<string[]> {
        let shaderName = this.documentName;
        shaderName = shaderName.replace(/\\/g, '/');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Parse Shaders
        {
            const shader = this.documentContent;
            {
                const buffer_provider = new BufferProvider(this.context);
                await buffer_provider.parseShaderCode(shaderName, shader, this.buffers, this.commonIncludes, generateStandalone);
            }

            // If final buffer uses feedback we need to add a last pass that renders it to the screen
            // because we can not ping-pong the screen
            {
                const finalBuffer = this.buffers[this.buffers.length - 1];
                if (finalBuffer.UsesSelf) {
                    const finalBufferIndex = this.buffers.length - 1;
                    finalBuffer.Dependents.push({
                        Index: this.buffers.length,
                        Channel: 0
                    });
                    this.buffers.push({
                        Name: 'final-blit',
                        File: 'final-blit',
                        Code: 'void main() { gl_FragColor = texture2D(iChannel0, gl_FragCoord.xy / iResolution.xy); }',
                        TextureInputs: [{
                            Channel: 0,
                            File: '',
                            Buffer: finalBuffer.Name,
                            BufferIndex: finalBufferIndex,
                        }],
                        AudioInputs: [],
                        CustomUniforms: [],
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
        // Local Resources
        let localResources: string[] = [];
        for (const buffer of this.buffers) {
            for (const texture of buffer.TextureInputs) {
                if (texture.LocalTexture) {
                    localResources.push(texture.LocalTexture);
                }
            }
            for (const audio of buffer.AudioInputs) {
                if (audio.LocalPath) {
                    localResources.push(audio.LocalPath);
                }
            }
        }
        localResources = localResources.filter(function (elem, index, self) {
            return index === self.indexOf(elem);
        });
        localResources = removeDuplicates(localResources);

        return localResources;
    }

    public async generateWebviewContent(webview: vscode.Webview | undefined, startingState: Types.RenderStartingData): Promise<string> {

        const generateStandalone = webview === undefined;

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Resource Helpers
        const makeWebviewResource = webview !== undefined
            ? (localPath: string) => this.context.makeWebviewResource(webview, this.context.makeUri(localPath)).toString()
            : (localPath: string) => localPath;
        const getWebviewResourcePath = webview !== undefined
            ? (relativePath: string) => this.context.getWebviewResourcePath(webview, relativePath)
            : (relativePath: string) => relativePath;

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Feature Check
        let useKeyboard = false;
        let useFirstPersonControls = false;
        let useAudio = false;
        let useUniforms = false;
        for (const buffer of this.buffers) {
            if (buffer.UsesKeyboard) {
                useKeyboard = true;
            }

            if (buffer.UsesFirstPersonControls) {
                useFirstPersonControls = true;
            }

            const audios = buffer.AudioInputs;
            if (audios.length > 0) {
                useAudio = true;
            }

            const uniforms = buffer.CustomUniforms;
            if (uniforms.length > 0) {
                useUniforms = true;
            }
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Initial State
        const initialTimeExtension = new InitialTimeExtension(startingState.Time);
        this.webviewAssembler.addReplaceModule(initialTimeExtension, 'let startingTime = <!-- Start Time -->;', '<!-- Start Time -->');
        const initialPausedExtension = new InitialPausedExtension(startingState.Paused);
        this.webviewAssembler.addReplaceModule(initialPausedExtension, 'let paused = <!-- Start Paused -->;', '<!-- Start Paused -->');
        const initialMouseExtension = new InitialMouseExtension(startingState.Mouse);
        this.webviewAssembler.addReplaceModule(initialMouseExtension, 'let mouse = new THREE.Vector4(<!-- Start Mouse -->);', '<!-- Start Mouse -->');
        const initialNormalizedMouseExtension = new InitialNormalizedMouseExtension(startingState.NormalizedMouse);
        this.webviewAssembler.addReplaceModule(initialNormalizedMouseExtension, 'let normalizedMouse = new THREE.Vector2(<!-- Start Normalized Mouse -->);', '<!-- Start Normalized Mouse -->');
        const initialFlyControlPositionExtension = new InitialFlyControlPositionExtension(startingState.FlyControlPosition);
        this.webviewAssembler.addReplaceModule(initialFlyControlPositionExtension, 'controlState.position.set(<!-- Start Fly Control Position -->);', '<!-- Start Fly Control Position -->');
        const initialFlyControlRotationExtension = new InitialFlyControlRotationExtension(startingState.FlyControlRotation);
        this.webviewAssembler.addReplaceModule(initialFlyControlRotationExtension, 'controlState.quaternion.set(<!-- Start Fly Control Rotation -->);', '<!-- Start Fly Control Rotation -->');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Initial State
        let forcedAspect = this.context.getConfig<[number, number]>('forceAspectRatio');
        if (forcedAspect === undefined) {
            forcedAspect = [-1, -1];
        }
        const forcedAspectExtension = new ForcedAspectExtension(forcedAspect);
        this.webviewAssembler.addReplaceModule(forcedAspectExtension, 'let forcedAspects = [<!-- Forced Aspect -->];', '<!-- Forced Aspect -->');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Keyboard
        let keyboardShaderExtension: KeyboardShaderExtension | undefined;
        if (useKeyboard) {
            const keyboardInit = new KeyboardInitExtension(startingState.Keys);
            this.webviewAssembler.addWebviewModule(keyboardInit, '// Keyboard Init');

            const keyboardUpdate = new KeyboardUpdateExtension();
            this.webviewAssembler.addWebviewModule(keyboardUpdate, '// Keyboard Update');

            const keyboardCallbacks = new KeyboardCallbacksExtension();
            this.webviewAssembler.addWebviewModule(keyboardCallbacks, '// Keyboard Callbacks');

            keyboardShaderExtension = new KeyboardShaderExtension();
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Shader Preamble
        const preambleExtension = new ShaderPreambleExtension();
        this.webviewAssembler.addReplaceModule(preambleExtension, 'LineOffset: <!-- Preamble Line Numbers --> + 2', '<!-- Preamble Line Numbers -->');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Custom Uniforms
        if (useUniforms) {
            const uniformsInitExtension = new UniformsInitExtension(this.buffers, startingState.UniformsGui);
            this.webviewAssembler.addWebviewModule(uniformsInitExtension, '// Uniforms Init');
            const uniformsUpdateExtension = new UniformsUpdateExtension(this.buffers);
            this.webviewAssembler.addWebviewModule(uniformsUpdateExtension, '// Uniforms Update');
            const uniformsPreambleExtension = new UniformsPreambleExtension(this.buffers);
            preambleExtension.addPreambleExtension(uniformsPreambleExtension);

            const datGuiExtension = new DatGuiExtension(getWebviewResourcePath, generateStandalone);
            this.webviewAssembler.addWebviewModule(datGuiExtension, '<!-- dat.gui -->');
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Fix up line offsets
        {
            const webglPlusThreeJsLineNumbers = 107;
            for (const buffer of this.buffers) {
                buffer.LineOffset += preambleExtension.getShaderPreambleLineNumbers() + webglPlusThreeJsLineNumbers;
                if (buffer.UsesKeyboard && keyboardShaderExtension !== undefined) {
                    buffer.LineOffset += keyboardShaderExtension.getShaderPreambleLineNumbers();
                }
            }
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Buffer Logic
        const buffersInitExtension = new BuffersInitExtension(this.buffers);
        this.webviewAssembler.addWebviewModule(buffersInitExtension, '// Buffers');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Shader Scripts
        const shadersExtension = new ShadersExtension(this.buffers, preambleExtension, keyboardShaderExtension);
        this.webviewAssembler.addWebviewModule(shadersExtension, '<!-- Shaders -->');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Misc Scripts

        // First Person Camera
        if (useFirstPersonControls) {
            const flycontrolsExtension = new ThreeFlyControlsExtension(getWebviewResourcePath);
            this.webviewAssembler.addWebviewModule(flycontrolsExtension, '<!-- FlyControls -->');
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Include Scripts
        const includesExtension = new IncludesExtension(this.commonIncludes, preambleExtension);
        this.webviewAssembler.addWebviewModule(includesExtension, '<!-- Shaders -->');
        const includesInitExtension = new IncludesInitExtension(this.commonIncludes);
        this.webviewAssembler.addWebviewModule(includesInitExtension, '// Includes');

        if (this.context.getConfig<boolean>('testCompileIncludedFiles')) {
            const includesTestCompileExtension = new IncludesTestCompileExtension();
            this.webviewAssembler.addWebviewModule(includesTestCompileExtension, '// Test Compile Included Files');
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Texture Loading
        const textureInitExtension = new TexturesInitExtension();
        await textureInitExtension.init(this.buffers, this.context, makeWebviewResource);
        this.webviewAssembler.addWebviewModule(textureInitExtension, '// Texture Init');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Audio Logic
        if (useAudio) {
            const audioInitExtension = new AudioInitExtension(this.buffers, this.context, makeWebviewResource);
            this.webviewAssembler.addWebviewModule(audioInitExtension, '// Audio Init');
            textureInitExtension.addTextureContent(audioInitExtension);

            const audioUpdateExtension = new AudioUpdateExtension();
            this.webviewAssembler.addWebviewModule(audioUpdateExtension, '// Audio Update');

            const audioPauseExtension = new AudioPauseExtension();
            this.webviewAssembler.addWebviewModule(audioPauseExtension, '// Audio Pause');

            const audioResumeExtension = new AudioResumeExtension();
            this.webviewAssembler.addWebviewModule(audioResumeExtension, '// Audio Resume');
        }
        else {
            const noAudioExtension = new NoAudioExtension();
            this.webviewAssembler.addWebviewModule(noAudioExtension, '// Audio Init');
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Packages
        {
            const jqueryExtension = new JQueryExtension(getWebviewResourcePath, generateStandalone);
            this.webviewAssembler.addReplaceModule(jqueryExtension, '<script src="<!-- JQuery.js -->"></script>', '<!-- JQuery.js -->');

            const threeExtension = new ThreeExtension(getWebviewResourcePath, generateStandalone);
            this.webviewAssembler.addReplaceModule(threeExtension, '<script src="<!-- Three.js -->"></script>', '<!-- Three.js -->');
        }
        if (this.context.getConfig<boolean>('printShaderFrameTime')) {
            const statsExtension = new StatsExtension(getWebviewResourcePath, generateStandalone);
            this.webviewAssembler.addWebviewModule(statsExtension, '<!-- Stats.js -->');
        }
        if (this.context.getConfig<boolean>('recordOffline')) {
            const ccaptureExtension = new CCaptureExtension(getWebviewResourcePath, generateStandalone);
            this.webviewAssembler.addWebviewModule(ccaptureExtension, '<!-- CCapture.js -->');
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Pause Logic
        if (!generateStandalone) {
            if (this.context.getConfig<boolean>('showPauseButton')) {
                const pauseButtonStyleExtension = new PauseButtonStyleExtension(getWebviewResourcePath);
                this.webviewAssembler.addWebviewModule(pauseButtonStyleExtension, '/* Pause Button Style */');

                const pauseButtonExtension = new PauseButtonExtension();
                this.webviewAssembler.addWebviewModule(pauseButtonExtension, '<!-- Pause Element -->');
            }
        }

        if (this.context.getConfig<boolean>('pauseWholeRender')) {
            const pauseWholeRenderExtension = new PauseWholeRenderExtension();
            this.webviewAssembler.addWebviewModule(pauseWholeRenderExtension, '// Pause Whole Render');

            const advanceTimeExtension = new AdvanceTimeExtension();
            this.webviewAssembler.addWebviewModule(advanceTimeExtension, '// Advance Time');
        }
        else {
            const advanceTimeExtension = new AdvanceTimeIfNotPausedExtension();
            this.webviewAssembler.addWebviewModule(advanceTimeExtension, '// Advance Time');
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Screenshot Logic
        if (!generateStandalone) {
            if (this.context.getConfig<boolean>('showScreenshotButton')) {
                const screenshotButtonStyleExtension = new ScreenshotButtonStyleExtension(getWebviewResourcePath);
                this.webviewAssembler.addWebviewModule(screenshotButtonStyleExtension, '/* Screenshot Button Style */');

                const screenshotButtonExtension = new ScreenshotButtonExtension();
                this.webviewAssembler.addWebviewModule(screenshotButtonExtension, '<!-- Screenshot Element -->');
            }
            if (this.context.getConfig<boolean>('showRecordButton')) {
                const recordButtonStyleExtension = new RecordButtonStyleExtension(getWebviewResourcePath);
                this.webviewAssembler.addWebviewModule(recordButtonStyleExtension, '/* Record Button Style */');

                const recordButtonExtension = new RecordButtonExtension();
                this.webviewAssembler.addWebviewModule(recordButtonExtension, '<!-- Record Element -->');
            }
        }

        const forcedScreenshotResolution = this.context.getConfig<[number, number]>('screenshotResolution') || [-1, -1];
        const forcedScreenshotResolutionExtension = new ForcedScreenshotResolutionExtension(forcedScreenshotResolution);
        this.webviewAssembler.addReplaceModule(forcedScreenshotResolutionExtension, 'let forcedScreenshotResolution = [<!-- Forced Screenshot Resolution -->];', '<!-- Forced Screenshot Resolution -->');
        this.webviewAssembler.addReplaceModule(forcedScreenshotResolutionExtension, 'let forcedResolutions = [<!-- Forced Resolution -->];', '<!-- Forced Resolution -->');

        const recordTargetFramerate = this.context.getConfig<number>('recordTargetFramerate') || 30;
        const recordTargetFramerateExtension = new RecordTargetFramerateExtension(recordTargetFramerate);
        this.webviewAssembler.addReplaceModule(recordTargetFramerateExtension, 'let targetFrameRate = <!-- Record Target Framerate -->;', '<!-- Record Target Framerate -->');

        const recordVideoContainer = this.context.getConfig<string>('recordVideoContainer') || "webm";
        const recordVideoContainerExtension = new RecordVideoContainerExtension(recordVideoContainer);
        this.webviewAssembler.addReplaceModule(recordVideoContainerExtension, 'let videoContainer = <!-- Record Video Container -->;', '<!-- Record Video Container -->');

        const recordVideoCodec = this.context.getConfig<string>('recordVideoCodec') || "vp8";
        const recordVideoCodecExtension = new RecordVideoCodecExtension(recordVideoCodec);
        this.webviewAssembler.addReplaceModule(recordVideoCodecExtension, 'let videoCodec = <!-- Record Video Codec -->;', '<!-- Record Video Codec -->');

        const recordVideoBitRate = this.context.getConfig<number>('recordVideoBitRate') || 2500000;
        const recordVideoBitRateExtension = new RecordVideoBitRateExtension(recordVideoBitRate);
        this.webviewAssembler.addReplaceModule(recordVideoBitRateExtension, 'videoBitsPerSecond: <!-- Record Video Bit Rate -->,', '<!-- Record Video Bit Rate -->');

        const recordMaxDuration = this.context.getConfig<number>('recordMaxDuration') || 0;
        const recordMaxDurationExtension = new RecordMaxDurationExtension(recordMaxDuration);
        this.webviewAssembler.addReplaceModule(recordMaxDurationExtension, 'let maxDuration = <!-- Record Max Duration -->;', '<!-- Record Max Duration -->');

        const recordOfflineFormat = this.context.getConfig<string>('recordOfflineFormat') || "webm";
        const recordOfflineFormatExtension = new RecordOfflineFormatExtension(recordOfflineFormat);
        this.webviewAssembler.addReplaceModule(recordOfflineFormatExtension, 'let format = <!-- Record Offline Format -->;', '<!-- Record Offline Format -->');

        const recordOfflineQuality = this.context.getConfig<number>('recordOfflineQuality') || 80;
        const recordOfflineQualityExtension = new RecordOfflineQualityExtension(recordOfflineQuality);
        this.webviewAssembler.addReplaceModule(recordOfflineQualityExtension, 'let quality = <!-- Record Offline Quality -->;', '<!-- Record Offline Quality -->');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Reload Logic
        if (!generateStandalone) {
            if (!this.context.getConfig<boolean>('reloadAutomatically')) {
                const reloadButtonStyleExtension = new ReloadButtonStyleExtension(getWebviewResourcePath);
                this.webviewAssembler.addWebviewModule(reloadButtonStyleExtension, '/* Reload Button Style */');

                const reloadButtonExtension = new ReloadButtonExtension();
                this.webviewAssembler.addWebviewModule(reloadButtonExtension, '<!-- Reload Element -->');
            }
        }

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
        return this.webviewAssembler.assembleWebviewContent();
    }
}
