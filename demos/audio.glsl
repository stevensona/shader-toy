#iChannel0 audio://./outfoxing.mp3

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
	vec2 uv = fragCoord.xy / iResolution.xy;
    
    //In shadertoy, audio comes in as a two-row texture.
    //The first row represents the waveform (? - I'm not an audio guy)
    //The second row represents the frequency spectrum (? - Again... no idea what I'm talking about)
    
    //Using our x position in the buffer as a key, we can look up the first row by looking at texture coordinate (x, 0.25).
    //Why 0.25? OpenGL coordinates put (0,0) at the top-left of a pixel, not its center. This means that in a repeating texture
    //the point (0,0) is actually half-way between the top-left pixel and the bottom-right pixel, and would be interpolated.
    vec2 firstRow = vec2(uv.x, 0.25);
    vec2 secondRow = vec2(uv.x, 0.75);
    
    vec4 amplitude = texture(iChannel0, firstRow);
    vec4 frequency = texture(iChannel0, secondRow);
    
    //Now, the return from the textures is a vec4, but these are greyscale textures so all 4 values are the same.
    //Let's output the waveform as red and the spectrum as green
    fragColor = vec4(amplitude.r, frequency.r, 0.0, 1.0);
    
    //<-- That doesn't look like much. This is because we're getting the same value for each y position in the buffer because we only
    //    use x, so naturally it's just vertical bands.
    //    The value we're getting out is some number 0..1, we can visualize it better by placing it on the y axis and drawing black
    //    pixels any time the pixel's y position is greater than this value.
    
    //Try uncommenting this block:
    fragColor = vec4(0.0, 0.0, 0.0, 0.0); //Reset to black
    if(uv.y < amplitude.r)
    {
        fragColor += vec4(1.0, 0.0, 0.0, 1.0); //Add red
    }
    if(uv.y < frequency.r)
    {
        fragColor += vec4(0.0, 1.0, 0.0, 1.0); //Add green
    }
}