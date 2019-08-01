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
export class RenderStartingData {
    Time: number = 0;
    Mouse: Mouse = new Mouse();
    NormalizedMouse: NormalizedMouse = new NormalizedMouse();
    Keys: Keys = [];
}

// Texture setting enums start at 1 so valid settings never implicitly convert to false
export enum TextureMagFilter {
    Linear  = 1,
    Nearest = 2,
}
export enum TextureMinFilter {
    Nearest                 = 1,
    NearestMipMapNearest    = 2,
    NearestMipMapLinear     = 3,
    Linear                  = 4,
    LinearMipMapNearest     = 5,
    LinearMipMapLinear      = 6,
}
export enum TextureWrapMode {
    Repeat  = 1,
    Clamp   = 2,
    Mirror  = 3,
}

export type TextureDefinition = {
    Channel: number,
    Buffer?: string,
    BufferIndex?: number,
    LocalTexture?: string,
    RemoteTexture?: string,
    Self?: boolean,
    Mag?: TextureMagFilter,
    Min?: TextureMinFilter,
    Wrap?: TextureWrapMode
};
export type AudioDefinition = {
    Channel: number,
    LocalPath?: string,
    RemotePath?: string,
    UserPath: string
};
export type BufferDependency = {
    Index: number,
    Channel: number
};
export type BufferDefinition = {
    Name: string,
    File: string,
    Code: string,
    TextureInputs: TextureDefinition[],
    AudioInputs: AudioDefinition[],
    UsesSelf: boolean,
    SelfChannel: number,
    Dependents: BufferDependency[],
    LineOffset: number
    Includes: string[],
    UsesKeyboard?: boolean,
};

export type IncludeDefinition = {
    Name: string,
    File: string,
    Code: string,
    LineCount: number
};

export type Diagnostic = {
    line: number,
    message: string
};
export type DiagnosticBatch = {
    filename: string,
    diagnostics: Diagnostic[]
};
