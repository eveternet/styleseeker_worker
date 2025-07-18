import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Get the origin from the request
  const origin = request.headers.get('origin');
  
  console.log(`[CORS Middleware] ${request.method} ${request.url}`);
  console.log(`[CORS Middleware] Origin: ${origin}`);
  
  // Create response with CORS headers
  const response = NextResponse.next();
  
  // Check if the origin matches styleseeker.app patterns
  const isAllowedOrigin = origin && (
    origin === 'https://styleseeker.app' ||
    origin === 'https://www.styleseeker.app' ||
    origin.endsWith('.styleseeker.app')
  );
  
  console.log(`[CORS Middleware] Origin allowed: ${isAllowedOrigin}`);
  
  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    console.log('[CORS Middleware] Handling OPTIONS preflight request');
    
    // For preflight, we need to return a response with just the headers
    const preflightResponse = new NextResponse(null, { status: 200 });
    
    if (isAllowedOrigin) {
      preflightResponse.headers.set('Access-Control-Allow-Origin', origin);
      preflightResponse.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    
    preflightResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    preflightResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    preflightResponse.headers.set('Access-Control-Max-Age', '86400');
    
    return preflightResponse;
  }
  
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
  ],
}; 