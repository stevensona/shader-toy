// Created by tayloia at https://www.shadertoy.com/view/MdVcRd
// Adapted for VS Code Shadertoy

// See https://www.shadertoy.com/view/ldKGRR

// Computes a smooth-edged diamond pixel value (Manhattan distance)
#define P(i, j, b) \
	vec2(.1, b).xyxy * smoothstep(0., 9. / R.y, .1 - abs(i) - abs(j))

// Computes a segment value (length = 0.5)
#define S(i, j, b) \
	P(i - clamp(i, 0., .5), j, b & 1)

// Colon render
#define C \
    x += .5; O += P(x, y + .3, i.w / 50) + P(x, y - .3, i.w / 50); t /= 60

// Hyphen render
#define H(b) \
	++x; O += S(x, y, b)

// Computes the horizontal and vertical segments based on a denary digit
#define X(i, j, b) \
	S(x - i, y - j, b)
#define Y(i, j, b) \
	S(y - j, x - i, b)
#define D(n) \
    H(892>>n) \
    + X(0., .7, 1005>>n) \
    + X(0., -.7, 877>>n) \
    + Y(-.1, .1, 881>>n) \
    + Y(.6, .1, 927>>n) \
    + Y(-.1, -.6, 325>>n) \
    + Y(.6, -.6, 1019>>n);

// Two-digit render
#define Z(n) ; D(n % 10) D(n / 10)

void mainImage(out vec4 O, vec2 U)
{
    vec2 R = iResolution.xy;
    U += U - R;
    U /= R.y / 3.; // Global scaling with aspect ratio correction
    O-=O; // Zero the pixel

    float x = U.x - U.y * .2 - 2.8, // Slight skew to slant the digits
          y = --U.y;
    ivec4 i = ivec4(iDate); // Convert everything to integers
    int t = i.w;
    i.w = int(iDate.w * 100.) % 100 // Replace with centiseconds
    
    // Seconds (preceded by a colon)
    Z(t % 60)
    C
    
    // Minutes (preceded by a colon)
    Z(t % 60)
    C
    
    // Hours
    Z(t)

    // Smaller digits
    x /= .6;
    y /= .6;
    R *= .6;

    // Centiseconds
    x -= 14.;
    y += .53
    Z(i.w)

    // Day (preceded by a hyphen)
    x -= .8;
    y += 3.
    Z(i.z)
    H(1)

    // Month (preceded by a hyphen)
    Z((i.y + 1)) // Is it a bug in shadertoy that we have to add one?
    H(1)

	// Year
    Z(i.x % 100)
    Z(i.x / 100)
}
