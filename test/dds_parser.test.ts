import * as assert from 'assert';
import { TexturesInitExtension } from '../src/extensions/textures/textures_init_extension';
import * as Types from '../src/typenames';
import * as vm from 'vm';

function extractFunctionSource(source: string, functionName: string): string {
    const needle = `function ${functionName}(`;
    const start = source.indexOf(needle);
    assert.ok(start >= 0, `Missing ${functionName}() in generated webview script`);

    // Find the opening brace for the function.
    const braceStart = source.indexOf('{', start);
    assert.ok(braceStart >= 0, `Missing opening brace for ${functionName}()`);

    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') {
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0) {
                return source.slice(start, i + 1);
            }
        }
    }

    assert.fail(`Could not find end of ${functionName}() function body`);
}

async function getParseDDS(): Promise<(buffer: ArrayBuffer) => { width: number; height: number; data: Float32Array; channelCount: number }> {
    const buffers: Types.BufferDefinition[] = [
        {
            Name: 'Image',
            File: 'demos/dds_loader.glsl',
            Code: '',
            TextureInputs: [
                {
                    Channel: 0,
                    File: 'demos/dds_loader.glsl',
                    LocalTexture: 'lut/ltc_1.dds',
                    Mag: Types.TextureMagFilter.Linear,
                    Min: Types.TextureMinFilter.Linear,
                    Wrap: Types.TextureWrapMode.Clamp,
                }
            ],
            AudioInputs: [],
            CustomUniforms: [],
            UsesSelf: false,
            SelfChannel: 0,
            Dependents: [],
            LineOffset: 0,
            Includes: [],
        }
    ];

    const ext = new TexturesInitExtension();
    // We don't need a real VS Code Context for this test; this path should not hit diagnostics.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeContext: any = { showDiagnostics: () => undefined };
    const makeAvailableResource = (localUri: string) => localUri;

    await ext.init(buffers, fakeContext, makeAvailableResource);

    const content = ext.generateContent();
    const fn = extractFunctionSource(content, 'parseDDS');
    const sandbox: Record<string, unknown> = {};
    vm.runInNewContext(`${fn}\nthis.parseDDS = parseDDS;`, sandbox);
    return sandbox.parseDDS as (buffer: ArrayBuffer) => { width: number; height: number; data: Float32Array; channelCount: number };
}

function writeAscii4(dv: DataView, offset: number, text: string) {
    assert.strictEqual(text.length, 4);
    for (let i = 0; i < 4; i++) {
        dv.setUint8(offset + i, text.charCodeAt(i));
    }
}

function makeDx10DDS(options: {
    width: number;
    height: number;
    dxgiFormat: number;
    bytesPerPixel: number;
    floats: number[];
    mipMapCount?: number;
    pitch?: number;
    caps2?: number;
    miscFlag?: number;
}): ArrayBuffer {
    const { width, height, dxgiFormat, bytesPerPixel, floats } = options;

    const headerSize = 124;
    const dx10Size = 20;
    const dataOffset = 4 + headerSize + dx10Size;
    const dataBytes = width * height * bytesPerPixel;
    const totalBytes = dataOffset + dataBytes;

    const buffer = new ArrayBuffer(totalBytes);
    const dv = new DataView(buffer);

    // Magic 'DDS '
    writeAscii4(dv, 0, 'DDS ');

    const headerStart = 4;
    dv.setUint32(headerStart + 0, headerSize, true);

    // Header flags: include DDSD_PITCH so pitch validation runs.
    const DDSD_PITCH = 0x8;
    dv.setUint32(headerStart + 4, DDSD_PITCH, true);

    dv.setUint32(headerStart + 8, height, true);
    dv.setUint32(headerStart + 12, width, true);

    const pitch = options.pitch ?? (width * bytesPerPixel);
    dv.setUint32(headerStart + 16, pitch, true);

    const mipMapCount = options.mipMapCount ?? 1;
    dv.setUint32(headerStart + 24, mipMapCount, true);

    const caps2 = options.caps2 ?? 0;
    dv.setUint32(headerStart + 108, caps2, true);

    // DDS_PIXELFORMAT
    const pfStart = headerStart + 72;
    dv.setUint32(pfStart + 0, 32, true);

    const DDPF_FOURCC = 0x4;
    dv.setUint32(pfStart + 4, DDPF_FOURCC, true);

    // FourCC 'DX10'
    writeAscii4(dv, pfStart + 8, 'DX10');

    // DX10 header
    const dx10Start = headerStart + headerSize;
    dv.setUint32(dx10Start + 0, dxgiFormat, true);
    dv.setUint32(dx10Start + 4, 3, true); // TEXTURE2D
    dv.setUint32(dx10Start + 8, options.miscFlag ?? 0, true);
    dv.setUint32(dx10Start + 12, 1, true); // arraySize
    dv.setUint32(dx10Start + 16, 0, true);

    const f32 = new Float32Array(buffer, dataOffset, floats.length);
    f32.set(floats);

    return buffer;
}

suite('DDS Parser Tests', () => {
    test('parseDDS supports DX10 RGBA32F', async () => {
        const parseDDS = await getParseDDS();
        const width = 2;
        const height = 2;
        const floats = [
            1, 2, 3, 4,
            5, 6, 7, 8,
            9, 10, 11, 12,
            13, 14, 15, 16
        ];
        const buffer = makeDx10DDS({ width, height, dxgiFormat: 2, bytesPerPixel: 16, floats });
        const parsed = parseDDS(buffer);
        assert.strictEqual(parsed.width, width);
        assert.strictEqual(parsed.height, height);
        assert.strictEqual(parsed.channelCount, 4);
        assert.strictEqual(parsed.data.length, width * height * 4);
        assert.strictEqual(parsed.data[0], 1);
        assert.strictEqual(parsed.data[15], 16);
    });

    test('parseDDS supports DX10 RGB32F', async () => {
        const parseDDS = await getParseDDS();
        const width = 1;
        const height = 2;
        const floats = [
            1, 2, 3,
            4, 5, 6
        ];
        const buffer = makeDx10DDS({ width, height, dxgiFormat: 6, bytesPerPixel: 12, floats });
        const parsed = parseDDS(buffer);
        assert.strictEqual(parsed.channelCount, 3);
        assert.deepStrictEqual(Array.from(parsed.data), floats);
    });

    test('parseDDS supports DX10 R32_FLOAT (expanded to RGBA)', async () => {
        const parseDDS = await getParseDDS();
        const width = 1;
        const height = 1;
        const buffer = makeDx10DDS({ width, height, dxgiFormat: 41, bytesPerPixel: 4, floats: [0.25] });
        const parsed = parseDDS(buffer);
        assert.strictEqual(parsed.channelCount, 4);
        assert.deepStrictEqual(Array.from(parsed.data), [0.25, 0.0, 0.0, 1.0]);
    });

    test('parseDDS supports DX10 R32G32_FLOAT (expanded to RGBA)', async () => {
        const parseDDS = await getParseDDS();
        const width = 1;
        const height = 1;
        const buffer = makeDx10DDS({ width, height, dxgiFormat: 16, bytesPerPixel: 8, floats: [0.25, 0.75] });
        const parsed = parseDDS(buffer);
        assert.strictEqual(parsed.channelCount, 4);
        assert.deepStrictEqual(Array.from(parsed.data), [0.25, 0.75, 0.0, 1.0]);
    });

    test('parseDDS rejects mipmaps', async () => {
        const parseDDS = await getParseDDS();
        const buffer = makeDx10DDS({ width: 1, height: 1, dxgiFormat: 2, bytesPerPixel: 16, floats: [0, 0, 0, 1], mipMapCount: 2 });
        assert.throws(() => parseDDS(buffer), /Mipmaps not supported/);
    });

    test('parseDDS rejects padded pitch', async () => {
        const parseDDS = await getParseDDS();
        // Expected pitch = width * bpp = 4, but set 8.
        const buffer = makeDx10DDS({ width: 1, height: 1, dxgiFormat: 41, bytesPerPixel: 4, floats: [1], pitch: 8 });
        assert.throws(() => parseDDS(buffer), /row pitch/);
    });

    test('parseDDS rejects unsupported DX10 formats', async () => {
        const parseDDS = await getParseDDS();
        const buffer = makeDx10DDS({ width: 1, height: 1, dxgiFormat: 34, bytesPerPixel: 4, floats: [0] });
        assert.throws(() => parseDDS(buffer), /Unsupported DDS DX10 format/);
    });
});
