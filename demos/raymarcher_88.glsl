// Created by Xor - https://www.shadertoy.com/view/ld2BWK
// Adapted for VS Code Shadertoy

#StrictCompatibility

#define mainImage(O,I)         \
                        O -= O;\
       for (int i; i++ < 99;)\
O += ( length(cos(O/.1)) - 1.1)\
* vec4( I/1e4, .1, 0)

//82 Character version:       
//#define mainImage(O,I) for(int i;i++<99;)O+=(length(cos(O/.1))-1.)*vec4(I/1e4,.1,0)