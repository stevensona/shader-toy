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

export type TextureDefinition = {
    Channel: number,
    Buffer?: string,
    BufferIndex?: number,
    LocalTexture?: string,
    RemoteTexture?: string,
    Self?: boolean
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
    IncludeName?: string,
    UsesKeyboard?: boolean,
};

export type IncludeDefinition = {
    Name: string,
    File: string,
    Code: string,
    LineCount: number
};
