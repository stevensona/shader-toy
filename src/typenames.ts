'use strict';

export class Mouse {
    x: number = -1;
    y: number = -1;
    z: number = -1;
    w: number = -1;
}
export class NormalizedMouse {
    x: number = 0;
    y: number = 0;
}
export type Keys = number[];
export type Position = [number, number, number];
export type Quaternion = [number, number, number, number];
export type UniformsGuiStartingData = {
    Open: boolean;
    Values: Map<string, number[]>;
};
export class RenderStartingData {
    Paused: boolean = false;
    Time: number = 0;
    Mouse: Mouse = new Mouse();
    NormalizedMouse: NormalizedMouse = new NormalizedMouse();
    Keys: Keys = [];
    FlyControlPosition: Position = [0, 0, 0];
    FlyControlRotation: Quaternion = [0, 0, 0, 1];
    UniformsGui: UniformsGuiStartingData = { Open: false, Values: new Map<string, number[]>() };
}

export enum TextureMagFilter {
    Linear  = 'Linear',
    Nearest = 'Nearest',
}
export enum TextureMinFilter {
    Nearest                 = 'Nearest',
    NearestMipMapNearest    = 'NearestMipMapNearest',
    NearestMipMapLinear     = 'NearestMipMapLinear',
    Linear                  = 'Linear',
    LinearMipMapNearest     = 'LinearMipMapNearest',
    LinearMipMapLinear      = 'LinearMipMapLinear',
}
export enum TextureWrapMode {
    Repeat  = 'Repeat',
    Clamp   = 'Clamp',
    Mirror  = 'Mirror',
}
export enum TextureType {
    Texture2D   = 'Texture2D',
    CubeMap     = 'CubeMap',
}

export type TextureDefinition = {
    Channel: number,
    File: string,
    Buffer?: string,
    BufferIndex?: number,
    LocalTexture?: string,
    RemoteTexture?: string,
    Self?: boolean,
    Mag?: TextureMagFilter,
    MagLine?: number,
    Min?: TextureMinFilter,
    MinLine?: number,
    Wrap?: TextureWrapMode,
    WrapLine?: number,
    Type?: TextureType,
    TypeLine?: number,
};
export type AudioDefinition = {
    Channel: number,
    LocalPath?: string,
    RemotePath?: string,
    UserPath: string
};
export type UniformDefinition = {
    Name: string,
    Typename: string,
    Default: number[],
    Min?: number[],
    Max?: number[],
    Step?: number[],

    // Optional marker that this uniform should be exposed as a sequencer track.
    // Populated from `#iUniform ... sequncer {}` / `#iUniform ... sequencer {}`.
    Sequencer?: {
        // Reserved for future options.
    }
};
export type BufferDependency = {
    Index: number,
    Channel: number
};
export type IncludeDefinition = {
    Name: string,
    File: string,
    Code: string,
    LineCount: number
};
export type BufferDefinition = {
    Name: string,
    File: string,
    Code: string,
    TextureInputs: TextureDefinition[],
    AudioInputs: AudioDefinition[],
    CustomUniforms: UniformDefinition[],
    UsesSelf: boolean,
    SelfChannel: number,
    Dependents: BufferDependency[],
    LineOffset: number
    Includes: IncludeDefinition[],
    UsesKeyboard?: boolean,
    UsesFirstPersonControls?: boolean,
};

export type Diagnostic = {
    line: number,
    message: string
};
export type DiagnosticBatch = {
    filename: string,
    diagnostics: Diagnostic[]
};

export type BoxedValue<T> = { Value: T };
