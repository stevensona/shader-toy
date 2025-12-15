// LTC lookup visualization and dummy lobe + Fresnel preview

#iChannel0 "file://lut/ltc_1.dds"
#iChannel0::WrapMode   "Clamp"
#iChannel0::MinFilter  "Linear"
#iChannel0::MagFilter  "Linear"

#iChannel1 "file://lut/ltc_2.dds"
#iChannel1::WrapMode   "Clamp"
#iChannel1::MinFilter  "Linear"
#iChannel1::MagFilter  "Linear"

#define S(x) clamp(x, 0.0, 1.0)
#define esp 1e-6

// singular value ratio of 2x2 matrix (anisotropy measure)
float aniso(mat2 A)
{
    mat2 ATA = transpose(A) * A;
    float tr  = ATA[0][0] + ATA[1][1];
    float det = ATA[0][0] * ATA[1][1] - ATA[0][1] * ATA[1][0];
    float disc = sqrt(max(tr*tr - 4.0*det, 0.0));
    float l1 = 0.5 * (tr + disc);
    float l2 = 0.5 * (tr - disc);
    float s1 = sqrt(max(l1, 0.0));
    float s2 = sqrt(max(l2, esp));
    return s1 / s2;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 R = iResolution.xy;
    vec2 uv = fragCoord / R;

    vec2 lutRes   = max(iChannelResolution[0].xy, vec2(1.0));
    vec2 lutScale = (lutRes - 1.0) / lutRes;
    vec2 lutBias  = 0.5 / lutRes;

    float rough = 0.5;
    float NoV   = 0.5;

    if (iMouse.x != 0.0 || iMouse.y != 0.0 || iMouse.z != 0.0 || iMouse.w != 0.0)
    {
        float my = iMouse.y;
        if (my >= 0.5 * R.y)
        {
            rough = S(iMouse.x / R.x);
            NoV   = S((my - 0.5 * R.y) / (0.5 * R.y));
        }
    }

    vec3 col = vec3(0.05);

    if (uv.y > 0.5)
    {
        // --- TOP: parameter-space map ---
        float uR = uv.x;                 // roughness axis
        float uN = (uv.y - 0.5) * 2.0;   // NoV axis

        vec2 lutUV = vec2(S(uR), sqrt(1.0 - S(uN)));
        lutUV = lutUV * lutScale + lutBias;
        // t1 swizzle, due to DDS was written as A32B32G32R32F pattern
        vec4 t1 = texture2D(iChannel0, lutUV).wzyx; 
        vec4 t2 = texture2D(iChannel1, lutUV);

        // xz-block of the LTC matrix (written explicitly to match how you build invM below)
        mat2 A = mat2(t1.x, t1.z, t1.y, t1.w);

        float anisoRatio = aniso(A);
        float detA  = abs(A[0][0]*A[1][1] - A[0][1]*A[1][0]);

        // Map to visible ranges
        float an = S(log2(anisoRatio) / 4.0);
        float de = S(0.5 + 0.125 * log2(detA + esp));
        // LTC2 is commonly (nD, fD, unused, sphere). Use nD as the “energy”/norm term.
        float sp = S(t2.x);

        col = vec3(an, de, sp);

        // Draw crosshair for selected (rough, NoV)
        vec2 sel = vec2(rough, 0.5 + 0.5 * NoV);
        vec2 d = abs(uv - sel);
        float cross = smoothstep(0.003, 0.0, min(d.x, d.y));
        col = mix(col, vec3(1.0, 1.0, 1.0), 0.75 * cross);
    }
    else
    {
        // --- BOTTOM: lobe preview + raw components tiles ---
        vec2 uv2 = vec2(uv.x, uv.y * 2.0);

        vec2 lutUV = vec2(S(rough), sqrt(1.0 - S(NoV)));
        lutUV = lutUV * lutScale + lutBias;
        // t1 swizzle, due to DDS was written as A32B32G32R32F pattern
        vec4 t1 = texture2D(iChannel0, lutUV).wzyx; 
        vec4 t2 = texture2D(iChannel1, lutUV);

        mat3 invM = mat3(
            vec3(t1.x, 0.0, t1.y),
            vec3(0.0,  1.0, 0.0),
            vec3(t1.z, 0.0, t1.w)
        );

        float hx = (uv2.x < 0.5) ? (uv2.x / 0.5) : ((uv2.x - 0.5) / 0.5);
        vec2 disk = vec2(hx * 2.0 - 1.0, uv2.y * 2.0 - 1.0);
        float diskR2 = dot(disk, disk);

        if (diskR2 > 1.0)
        {
            col = vec3(0.07);
        }
        else if (uv2.x < 0.5)
        {
            float y = sqrt(max(1.0 - diskR2, 0.0));
            vec3 d  = normalize(vec3(disk.x, y, disk.y));
            vec3 dp0 = invM * d;
            vec3 dp  = dp0 * inversesqrt(max(dot(dp0, dp0), esp));

            float w     = max(dp.y, 0.0);            
            float nD    = max(t2.x, 0.0); // (GGX norm / magnitude)
            float vis   = log2(1.0 + 32.0 * w * nD) / log2(33.0);

            col = vec3(vis);
        }
        else
        {
            // Visualize the Fresnel approximation scalars:
            // nD = LTC2.x, fD = LTC2.y, and final scale is linear in R0 (F0).
            float nD = max(t2.x, 0.0);
            float fD = max(t2.y, 0.0);
            float R0 = S(disk.x * 0.5 + 0.5);   // sweep F0 horizontally across the disk
            float F  = mix(fD, nD, R0);         // == R0*nD + (1-R0)*fD

            col = vec3(S(nD), S(fD), S(F));
        }
    }

    fragColor = vec4(col, 1.0);
}
