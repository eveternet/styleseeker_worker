import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Handle CORS
  const response = NextResponse.next();
  
  // Get the origin from the request
  const origin = request.headers.get('origin');
  
  // Check if the origin matches *.styleseeker.app pattern
  if (origin && (
    origin === 'https://styleseeker.app' ||
    origin.endsWith('.styleseeker.app')
  )) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: response.headers });
  }
  
  return response;
}

export const config = {
  matcher: '/api/:path*',
}; 