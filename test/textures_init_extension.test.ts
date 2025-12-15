import * as assert from 'assert';
import { TexturesInitExtension } from '../src/extensions/textures/textures_init_extension';
import * as Types from '../src/typenames';

suite('Texture Init Extension Tests', () => {
    test('Generates DDS loader path for .dds textures', async () => {
        const buffers: Types.BufferDefinition[] = [
            {
                Name: 'Image',
                File: 'demos/dds_loader.glsl',
                Code: '',
                TextureInputs: [
                    {
                        Channel: 0,
                        File: 'demos/dds_loader.glsl',
                        LocalTexture: 'demos/lut/ltc_1.dds',
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fakeContext: any = { showDiagnostics: () => undefined };
        const makeAvailableResource = (localUri: string) => localUri;

        await ext.init(buffers, fakeContext, makeAvailableResource);
        const content = ext.generateContent();

        assert.ok(content.includes('function parseDDS(buffer)'), 'Expected DDS parser helper to be present');
        assert.ok(content.includes('loadDDSTextureFromLocalFile'), 'Expected DDS texture loader helper to be present');
        assert.ok(content.includes("loadDDSTextureFromLocalFile(\"demos/lut/ltc_1.dds\""), 'Expected .dds texture to use local DDS loader');
    });

    test('Routes local and remote DDS through the DDS loader', async () => {
        const buffers: Types.BufferDefinition[] = [
            {
                Name: 'Image',
                File: 'demos/dds_loader.glsl',
                Code: '',
                TextureInputs: [
                    {
                        Channel: 0,
                        File: 'demos/dds_loader.glsl',
                        LocalTexture: 'demos/lut/ltc_1.dds',
                        Mag: Types.TextureMagFilter.Linear,
                        Min: Types.TextureMinFilter.Linear,
                        Wrap: Types.TextureWrapMode.Clamp,
                    },
                    {
                        Channel: 1,
                        File: 'demos/dds_loader.glsl',
                        RemoteTexture: 'https://example.com/ltc_lut2.dds',
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fakeContext: any = { showDiagnostics: () => undefined };
        const makeAvailableResource = (localUri: string) => localUri;

        await ext.init(buffers, fakeContext, makeAvailableResource);
        const content = ext.generateContent();

        assert.ok(content.includes("loadDDSTextureFromLocalFile(\"demos/lut/ltc_1.dds\""), 'Expected local .dds texture to use local DDS loader');
        assert.ok(content.includes("loadDDSTexture('https://example.com/ltc_lut2.dds'"), 'Expected remote .dds texture to use remote DDS loader');
    });
});
