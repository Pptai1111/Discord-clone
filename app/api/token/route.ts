import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

// Do not cache endpoint result
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get('room');
  const username = req.nextUrl.searchParams.get('username');
  
  console.log('Token request received:', { room, username });
  
  if (!room) {
    return NextResponse.json({ error: 'Missing "room" query parameter' }, { status: 400 });
  } else if (!username) {
    return NextResponse.json({ error: 'Missing "username" query parameter' }, { status: 400 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  console.log('LiveKit configuration:', { 
    apiKeyLength: apiKey?.length || 0, 
    apiSecretLength: apiSecret?.length || 0,
    wsUrl
  });

  if (!apiKey || !apiSecret || !wsUrl) {
    console.error('LiveKit configuration missing');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    // Đảm bảo username không chứa ký tự đặc biệt có thể gây lỗi
    const sanitizedUsername = username.replace(/[^\w\s]/gi, '_');
    console.log('Creating token with sanitized username:', sanitizedUsername);

    const at = new AccessToken(apiKey, apiSecret, { identity: sanitizedUsername });
    at.addGrant({ 
      room, 
      roomJoin: true, 
      canPublish: true, 
      canSubscribe: true 
    });

    const token = await at.toJwt();
    console.log('Token created successfully, length:', token.length);

    return NextResponse.json(
      { token },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error('Error creating LiveKit token:', error);
    return NextResponse.json({ 
      error: 'Failed to generate token',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}