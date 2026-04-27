import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function hubUrl() {
  return process.env.PIXEL_AGENTS_HUB_URL?.replace(/\/$/, '') || null;
}

export async function GET(request: NextRequest) {
  const hub = hubUrl();
  if (!hub) {
    return new Response('No Pixel Agents hub configured\n', { status: 503 });
  }

  try {
    const response = await fetch(`${hub}/events`, {
      cache: 'no-store',
      headers: { accept: 'text/event-stream' },
      signal: request.signal,
    });

    if (!response.ok || !response.body) {
      return new Response('Pixel Agents hub event stream unavailable\n', { status: 502 });
    }

    return new Response(response.body, {
      headers: {
        'cache-control': 'no-store, no-transform',
        'content-type': 'text/event-stream; charset=utf-8',
        'x-accel-buffering': 'no',
      },
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new Response(null, { status: 204 });
    }

    return new Response(error instanceof Error ? error.message : 'Pixel Agents event stream failed', {
      status: 502,
    });
  }
}
