#iKeyboard
#iChannel0 "https://i.imgur.com/lX8OAQV.jpg"
#iChannel1 "https://farm5.static.flickr.com/4541/38604095012_ab7a81b807_b.jpg"

// Ben Quantock 2014
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

// Adapted for shadertoy VS-Code from: https://www.shadertoy.com/view/XdS3RV

// fit a coordinate system to xx
vec4 screen; // coord*screen.z+screen.xy, coord e [-screen.w,screen.w
vec2 pixel;
vec2 fragCoord;
vec4 fragColor;

void Fit( float w )
{
	screen.w = w;
	screen.xy = iResolution.xy/2.0;
	screen.z = min(screen.x,screen.y)/screen.w;
	
	pixel = (fragCoord.xy-screen.xy)/screen.z;
}

bool ReadKey( int key )//, bool toggle )
{
	return isKeyToggled(key);
}



// Character definitions.
vec2	A[6],B[6],C[6],D[6],E[6],F[6],G[6],H[6],I[6],J[6],
		K[6],L[6],M[6],N[6],O[6],P[6],Q[6],R[6],S[6],T[6],
		U[6],V[6],W[6],X[6],Y[6],Z[6],c0[6],c1[6],c2[6],c3[6],
		c4[6],c5[6],c6[6],c7[6],c8[6],c9[6],c_[6];

void DefC( inout vec2 c[6], vec2 A, vec2 B, vec2 C, vec2 D, vec2 E, vec2 F )
{
	c[0] = A; c[1] = B; c[2]=C; c[3]=D; c[4]=E; c[5]=F;
}

// WHY CAN'T I INITIALIZE A CONST ARRAY????!!!! The compiler would be able to hard code all the values!!! STUPID COMPILER! *headdesk*
void DefineChars()
{
	DefC( A, vec2(-1,0), vec2(3,8), vec2(7,0), vec2(6,2), vec2(0,2), vec2(1,2) );
	DefC( B, vec2(0,0), vec2(0,8), vec2(6,6), vec2(3,4), vec2(7,0), vec2(0,0) );
	DefC( C, vec2(6,8), vec2(3,8), vec2(0,5), vec2(0,3), vec2(3,0), vec2(6,0) );
	DefC( D, vec2(0,0), vec2(0,8), vec2(3,8), vec2(6,5), vec2(6,0), vec2(0,0) );
	DefC( E, vec2(6,0), vec2(0,0), vec2(0,4), vec2(4,4), vec2(0,8), vec2(6,8) );
	DefC( F, vec2(0,0), vec2(0,4), vec2(4,4), vec2(0,4), vec2(0,8), vec2(6,8) );
	DefC( G, vec2(6,8), vec2(3,8), vec2(0,4), vec2(3,0), vec2(6,0), vec2(6,4) );
	DefC( H, vec2(0,0), vec2(0,8), vec2(0,4), vec2(6,4), vec2(6,0), vec2(6,8) );
	DefC( I, vec2(0,0), vec2(6,0), vec2(3,0), vec2(3,8), vec2(0,8), vec2(6,8) );
	DefC( J, vec2(0,0), vec2(2,0), vec2(3,1), vec2(3,8), vec2(0,8), vec2(6,8) );
	DefC( K, vec2(5,8), vec2(1,4), vec2(1,8), vec2(1,0), vec2(1,4), vec2(5,0) );
	DefC( L, vec2(6,0), vec2(0,0), vec2(0,8), vec2(0,8), vec2(0,8), vec2(0,8) );
	DefC( M, vec2(-1,0), vec2(-1,8), vec2(3,5), vec2(7,8), vec2(7,0), vec2(7,0) );
	DefC( N, vec2(0,0), vec2(0,8), vec2(6,0), vec2(6,8), vec2(6,8), vec2(6,8) );
	DefC( O, vec2(3,8), vec2(6,6), vec2(6,2), vec2(3,0), vec2(0,2), vec2(0,6) );
	DefC( P, vec2(0,0), vec2(0,8), vec2(4,8), vec2(6,6), vec2(6,3), vec2(0,3) );
	DefC( Q, vec2(3,0), vec2(0,4), vec2(3,8), vec2(6,4), vec2(4,3), vec2(6,0) );
	DefC( R, vec2(0,0), vec2(0,8), vec2(3,8), vec2(6,5), vec2(3,3), vec2(6,0) );
	DefC( S, vec2(5,8), vec2(0,8), vec2(0,4), vec2(6,4), vec2(6,0), vec2(0,0) );
	DefC( T, vec2(0,8), vec2(6,8), vec2(3,8), vec2(3,0), vec2(3,0), vec2(3,0) );
	DefC( U, vec2(0,8), vec2(0,2), vec2(2,0), vec2(6,0), vec2(6,8), vec2(6,8) );
	DefC( V, vec2(0,8), vec2(3,0), vec2(6,8), vec2(6,8), vec2(6,8), vec2(6,8) );
	DefC( W, vec2(-1,8), vec2(0,0), vec2(3,4), vec2(6,0), vec2(7,8), vec2(7,8) );
	DefC( X, vec2(0,0), vec2(6,8), vec2(3,4), vec2(0,8), vec2(6,0), vec2(6,0) );
	DefC( Y, vec2(0,0), vec2(6,8), vec2(3,4), vec2(0,8), vec2(0,8), vec2(0,8) );
	DefC( Z, vec2(0,8), vec2(6,8), vec2(0,0), vec2(6,0), vec2(6,0), vec2(6,0) );

	DefC( c0, vec2(0,1), vec2(6,7), vec2(6,0), vec2(0,0), vec2(0,8), vec2(6,8) );
	DefC( c1, vec2(1,6), vec2(3,8), vec2(3,0), vec2(0,0), vec2(6,0), vec2(6,0) );
	DefC( c2, vec2(1,7), vec2(3,8), vec2(6,6), vec2(6,4), vec2(0,0), vec2(6,0) );
	DefC( c3, vec2(0,8), vec2(6,8), vec2(4,5), vec2(6,3), vec2(6,0), vec2(0,0) );
	DefC( c4, vec2(4,0), vec2(4,8), vec2(0,4), vec2(0,3), vec2(6,3), vec2(0,3) );
	DefC( c5, vec2(0,0), vec2(3,0), vec2(6,5), vec2(0,5), vec2(0,8), vec2(6,8) );
	DefC( c6, vec2(6,8), vec2(0,5), vec2(0,0), vec2(6,0), vec2(6,5), vec2(0,5) );
	DefC( c7, vec2(0,8), vec2(6,8), vec2(0,0), vec2(0,0), vec2(0,0), vec2(0,0) );
	DefC( c8, vec2(6,0), vec2(0,0), vec2(6,8), vec2(0,8), vec2(0,8), vec2(6,0) );
	DefC( c9, vec2(0,0), vec2(6,3), vec2(6,8), vec2(0,8), vec2(0,5), vec2(4,5) );

	// space - put points off screen
	DefC( c_, vec2(0,-10000), vec2(0,-10000), vec2(0,-10000), vec2(0,-10000), vec2(0,-10000), vec2(0,-10000) );
}

vec3 s_textCol = vec3(1);
float s_textScale = 1.0;

// col = current pixel colour (will be modified if pixel hits letter)
void DrawChar( vec2 pos, vec2 lines[6] )//vec2 A, vec2 B, vec2 C, vec2 D, vec2 E, vec2 F )
{
	//vec2 lines[6]; lines[0] = A; lines[1] = B; lines[2]=C; lines[3]=D; lines[4]=E; lines[5]=F;
	vec2 p = pixel-pos-.5;
	
	p /= s_textScale;
	p += vec2(3,4); // offset to centre of characters

	float c = 100.0;
	
	for ( int l=0; l < 5; l++ )
	{
		// find distance from line
		vec2 pp = p - lines[l];
		
		float d = dot( pp, normalize(lines[l+1]-lines[l]) );
		float e =  dot(pp,pp) - d*d;
		
		// make a distance field for the letter
		//c = min( c, max( e, max( -.5-d, d-.5-length(lines[l+1]-lines[l]) ) ) );
		if ( d > -.5/s_textScale && d < .5/s_textScale+length(lines[l+1]-lines[l]) )
		{
			c = min( c, sqrt(e) );
		}
		else
		{
			c = min ( c, min( length(pp), length( p - lines[l+1] ) ) );
		}
		
/*		if ( d > -.5 && d < .5+length(lines[l+1]-lines[l])
		   	&& e < 1.0 )
		{
			col = vec3(0);
			return;
		}*/
	}
	
	// outline
	fragColor.rgb = mix ( vec3(0), fragColor.rgb, smoothstep( 0.6, 2.0, c ) );
	
	// fill
	fragColor.rgb = mix ( s_textCol, fragColor.rgb, smoothstep( 0.0, 1.0/min(s_textScale,1.0), c ) );
}


vec2 s_cursor;
float s_margin;

void PrintPos( vec2 pos )
{
	s_cursor = pos;
	s_margin = pos.x;
}

void Print( vec2 ch[6] )
{
	DrawChar( s_cursor, ch );
	s_cursor.x += s_textScale*10.0;
}

void Print( vec2 a[6], vec2 b[6], vec2 c[6], vec2 d[6], vec2 e[6], vec2 f[6], vec2 g[6], vec2 h[6], vec2 i[6] )
{
	Print(a);
	Print(b);
	Print(c);
	Print(d);
	Print(e);
	Print(f);
	Print(g);
	Print(h);
	Print(i);
}

void NewLine()
{
	s_cursor.x = s_margin;
	s_cursor.y -= s_textScale*14.0;
}



// sprites
void DrawDirt()
{
	if ( abs(pixel.x) < 180.0 && abs(pixel.y) < 180.0 )
	{
		fragColor.rgb = mix( vec3(.2,.1,.05), vec3(.35,.2,.13), texture( iChannel0, pixel/40.0 ).r);
	}
}

void DrawTrees( vec2 pos )
{
	vec2 p = pixel-pos;
	vec2 ap = abs(p);
	vec4 t = texture( iChannel0, pixel*vec2(2,1)/80.0 );
	if ( max(ap.x,ap.y) < 60.0+10.0*pow(t.b,.5) )
	{
		fragColor.rgb = mix( vec3(.0,.0,.0), vec3(.0,.3,.0), t.g);
	}
}

void DrawPaving()
{
	if ( abs(pixel.x) < 180.0 && abs(pixel.y) < 180.0 )
	{
//		fragColor.rgb = mix( vec3(.0), vec3(.2), pow(texture( iChannel0, pixel/120.0+.5 ).r,.5) );
		fragColor.rgb = mix( vec3(.0), vec3(.3,.25,.2), pow(texture( iChannel1, pixel/60.0+.5 ).r,.5) );
	}
}

void DrawWalls( vec2 pos )
{
	vec2 p = pixel-pos;
	vec2 ap = abs(p);
	vec4 t = texture( iChannel0, pixel*vec2(1,1)/60.0 );
	if ( max(ap.x,ap.y-20.0) < 60.0+4.0*pow((1.0-t.g),2.0) )
	{
		fragColor.rgb = mix( vec3(.4,.5,.6)*.2, vec3(.4,.5,.6), pow(1.0-t.r,5.0));
		
		fragColor.rgb *= mix( .3, 1.5, smoothstep( -40.0, -35.0, p.y ) );
	}
}

vec3 Key1Col()
{
	return mix ( vec3(.4,.6,.9), vec3(1), smoothstep( 0.7, 1.0, sin((pixel.x+pixel.y)*.1-6.0*iTime) ) );
}

vec3 Key2Col()
{
	return mix ( vec3(1.0,.4,.0), vec3(1), smoothstep( 0.7, 1.0, sin((pixel.x+pixel.y)*.1-6.0*iTime) ) );
}


void DrawKey( vec2 pos, vec3 keyCol )
{
	vec2 p = pixel-pos;
	vec2 c = p-vec2(5,0);
	
	bool draw = false;
	if ( abs(p.x) < 10.0 && abs(p.y) < 5.0 )
	{
		if ( p.x > 1.0 )
		{
			if ( length(c) < 5.0 && length(c-vec2(1,0)) > 2.0 )
				draw = true;
		}
		else
		{
			if ( p.y < 2.0 &&
				p.y > 10.0-20.0*texture( iChannel1, vec2(0,pixel.x/5.0) ).r )
				draw = true;
		}
	}
	
	if ( draw )
		fragColor.rgb = keyCol;
}

void DrawDoor( vec2 pos, vec3 keyCol )
{
	vec2 p = pixel-pos;
	vec2 ap = abs(p);
	vec4 t = texture( iChannel1, pixel.yx/40.0 );
	if ( max(ap.x,ap.y+20.0) < 60.0+4.0*pow((1.0-t.g),2.0) )
	{
		fragColor.rgb = mix( vec3(.2,.1,.03), vec3(0), t.r);
		
		fragColor.rgb *= 1.0+1.0*step(10.0,p.y); // lighting on top
		
		fragColor.rgb = mix( fragColor.rgb, vec3(0), step(-1.0,-ap.x) );
		
		// keyhole
		vec2 lp = p-vec2(0,-15);
		if ( abs(lp.x) < 6.0 && abs(lp.y) < 4.0 )
		{
			fragColor.rgb = keyCol;
			
			fragColor.rgb *= smoothstep(1.0,2.0, length(lp));
		}
	}
}


// compiler gets angry (on my office PC) if I draw chars all over the place
// => draw all 7 letters once, but offset their position inside the conditions
void North( out vec2 p ) { p = vec2(0, 170); }
void South( out vec2 p ) { p = vec2(0,-170); }
void East ( out vec2 p ) { p = vec2( 170,0); }
void West ( out vec2 p ) { p = vec2(-170,0); }
/*void North( out vec2 p ) { p = vec2(-170, 170); } // isometric
void South( out vec2 p ) { p = vec2( 170,-170); }
void East ( out vec2 p ) { p = vec2( 170, 170); }
void West ( out vec2 p ) { p = vec2(-170,-170); }*/
	

void mainImage( out vec4 oFragColor, in vec2 iFragCoord )
{
	fragColor = vec4(.7);
	fragCoord = iFragCoord;
	// my base coord system
	Fit(180.0);
	
	DefineChars();

	s_textScale = 2.0;
	s_textCol = mix( vec3(1,1,0), vec3(0,1,1),
					step(.0,cos(4.0*6.28*iTime))
					*step(.8,cos(.1*6.28*iTime))
				);
	
	/*
	MAP (spoilers!):
	D D-E-F E
	| |     |
	C-B-A-C-D
	===]|[===
	E-D-#-B-C
	|   | |
	F D-C D-E
	  |   | |
	F-E G-F F
	*/
	
	// Compiler can get angry if I draw stuff inside each "if"
	// so, instead, move things inside the ifs and draw once afterwards
	vec2 a=vec2(-999), b=vec2(-999), c=vec2(-999), d=vec2(-999), e=vec2(-999), f=vec2(-999), g=vec2(-999);
	
// how can I describe the environment in similar terms?
//=> a few stock pieces which I position
	bool trees[9];
	bool walls[9];
	bool paved = false; // false = dirt, true = stone
	for ( int i = 0; i < 9; i++ )
	{
		trees[i] = false;
		walls[i] = false;
	}
	bool drawDoor1 = false;
	bool drawDoor2 = false;
	bool drawKey1 = false;
	bool drawKey2 = false;
	
	// could use date to randomise these, to prevent cheating, but that's a bit OTT.
	bool gotKey1 = ReadKey(Key_K);
	bool gotKey2 = ReadKey(Key_H);
	
	bool win = false;
	
	if ( ReadKey(Key_A) && gotKey1 )
	{
		// inside castle
		paved = true;

		walls[0] = walls[2] = walls[6] = walls[8] = true;

		
		if ( ReadKey(Key_B) )
		{
			if ( ReadKey(Key_C) )
			{
				if ( ReadKey(Key_D) )
				{
					South(d);

					walls[1] = true;
					walls[3] = true;
					walls[5] = true;
				}
				else
				{
					North(d);
					East(c);

					walls[3] = true;
					walls[7] = true;
				}
			}
			else if ( ReadKey(Key_D) )
			{
				if ( ReadKey(Key_E) )
				{
					if ( ReadKey(Key_F) )
					{
						West( f );

						walls[1] = true;
						walls[5] = true;
						walls[7] = true;
						
						if ( !gotKey2 )
							drawKey2 = true;
					}
					else
					{
						East( f );
						West( e );

						walls[1] = true;
						walls[7] = true;
					}
				}
				else
				{
					East( e );
					South( d );

					walls[1] = true;
					walls[3] = true;
				}
			}
			else
			{
				East( b );
				West( c );
				North( d );

				walls[7] = true;
			}
		}
		else if ( ReadKey(Key_C) )
		{
			if ( ReadKey(Key_D) )
			{
				if ( ReadKey(Key_E) )
				{
					if ( ReadKey(Key_F) && gotKey2 )
					{
						win = true;
					}
					else
					{
						South( e );
						
						walls[3] = true;
						walls[5] = true;
						
						drawDoor2 = true;
	
						if ( gotKey2 )
						{
							North( f );
						}
					}
				}
				else
				{
					North( e );
					West( d );

					walls[5] = true;
					walls[7] = true;
				}
			}
			else
			{
				East( d );
				West( c );

				walls[1] = true;
				walls[7] = true;
			}
		}
		else
		{
			East( c );
			West( b );
			South( a );
			
			walls[1] = true;
		}
	}
	else if ( ReadKey(Key_B) )
	{
		if ( ReadKey(Key_C) )
		{
			West( c );

			walls[0] = walls[1] = walls[2] = true;
			trees[5] = trees[6] = trees[7] = trees[8] = true;
		}
		else if ( ReadKey(Key_D) )
		{
			trees[0] = trees[2] = trees[6] = trees[8] = true;

			if ( ReadKey(Key_E) )
			{
				if ( ReadKey(Key_F) )
				{
					if ( !gotKey1 )
						drawKey1 = true;

					North( f );

					trees[3] = true;
					trees[5] = true;
					trees[7] = true;
				}
				else
				{
					South( f );
					West( e );

					trees[1] = true;
					trees[5] = true;
				}
			}
			else if ( ReadKey(Key_F) )
			{
				if ( ReadKey(Key_G) )
				{
					East( g );

					trees[1] = true;
					trees[3] = true;
					trees[7] = true;
				}
				else
				{
					West( g );
					North( f );

					trees[5] = true;
					trees[7] = true;
				}
			}
			else
			{
				South( f );
				East( e );
				North( d );

				trees[3] = true;
			}
		}
		else
		{
			South( d );
			West( b );
			East( c );

			walls[0] = walls[1] = walls[2] = true;
			trees[6] = trees[8] = true;
		}
	}
	else if ( ReadKey(Key_C) )
	{
		trees[0] = trees[2] = trees[6] = trees[8] = true;

		if ( ReadKey(Key_D) )
		{
			if ( ReadKey(Key_E) )
			{
				if ( ReadKey(Key_F) )
				{
					East( f );

					trees[1] = true;
					trees[3] = true;
					trees[7] = true;
				}
				else
				{
					West( f );
					North( e );

					trees[5] = true;
					trees[7] = true;
				}
			}
			else
			{
				South( e );
				East( d );

				trees[1] = true;
				trees[3] = true;
			}
		}
		else
		{
			West( d );
			North( c );

			trees[5] = true;
			trees[7] = true;
		}
	}
	else if ( ReadKey(Key_D) )
	{
		walls[0] = walls[1] = walls[2] = true;
		trees[6] = trees[8] = true;

		if ( ReadKey(Key_E) )
		{
			if ( ReadKey(Key_F) )
			{
				North( f );

				walls[0] = walls[1] = walls[2] = false;
				trees[0] = trees[2] = true;
				trees[3] = true;
				trees[5] = true;
				trees[7] = true;
			}
			else
			{
				South( f );
				East( e );

				trees[3] = true;
			}
		}
		else
		{
			West( e );
			East( d );

			trees[7] = true;
		}
	}
	else
	{
		// start position
		if ( gotKey1 )
		{
			North( a );
		}

		East( b );
		South( c );
		West( d );
		
		walls[0] = walls[2] = true;
		trees[6] = trees[8] = true;

		drawDoor1 = true;
	}
	
	if ( !win )
	{
		if ( paved )
			DrawPaving();
		else
			DrawDirt();
	
		// special items
		if ( drawDoor1 ) DrawDoor( vec2(0,120), Key1Col() );
		if ( drawDoor2 ) DrawDoor( vec2(0,120), Key2Col() );
	
		if ( drawKey1 )
		{
			DrawChar( vec2(0,20), K );
			DrawKey( vec2(0,0), Key1Col() );
		}
	
		if ( drawKey2 )
		{
			DrawChar( vec2(0,20), H );
			DrawKey( vec2(0,0), Key2Col() );
		}
		
		if ( trees[0] ) DrawTrees( vec2(-120, 120) );
		if ( trees[1] ) DrawTrees( vec2(   0, 120) );
		if ( trees[2] ) DrawTrees( vec2( 120, 120) );
		if ( trees[3] ) DrawTrees( vec2(-120,   0) );
		if ( trees[4] ) DrawTrees( vec2(   0,   0) );
		if ( trees[5] ) DrawTrees( vec2( 120,   0) );
		if ( trees[6] ) DrawTrees( vec2(-120,-120) );
		if ( trees[7] ) DrawTrees( vec2(   0,-120) );
		if ( trees[8] ) DrawTrees( vec2( 120,-120) );
		
		if ( walls[0] ) DrawWalls( vec2(-120, 120) );
		if ( walls[1] ) DrawWalls( vec2(   0, 120) );
		if ( walls[2] ) DrawWalls( vec2( 120, 120) );
		if ( walls[3] ) DrawWalls( vec2(-120,   0) );
		if ( walls[4] ) DrawWalls( vec2(   0,   0) );
		if ( walls[5] ) DrawWalls( vec2( 120,   0) );
		if ( walls[6] ) DrawWalls( vec2(-120,-120) );
		if ( walls[7] ) DrawWalls( vec2(   0,-120) );
		if ( walls[8] ) DrawWalls( vec2( 120,-120) );
		
		DrawChar( a, A );
		DrawChar( b, B );
		DrawChar( c, C );
		DrawChar( d, D );
		DrawChar( e, E );
		DrawChar( f, F );
		DrawChar( g, G );
	}
	else
	{
		// Success!
		fragColor.rgb = .5+.5*sin(length(pixel)*.1-vec3(1,1.1,1.13)*4.0*iTime);
		
		s_textCol = vec3(1,sin(iTime*11.0)*.5+.5,sin(iTime*8.0)*.5+.5);
		PrintPos( vec2(-80,20) );
		Print( c_,Y,O,U,c_,W,I,N,c_ );
		NewLine();
		NewLine();
		Print( G,A,M,E,c_,O,V,E,R );
	}
	
	fragColor.rgb = pow(fragColor.rgb,vec3(1.0/2.2));
    
    oFragColor = fragColor;
}
