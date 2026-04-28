import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

let localLayout: unknown = null;
let localLayoutUpdatedAt = 0;
let localLayoutOrigin: string | null = null;

function hubUrl() {
  return process.env.PIXEL_AGENTS_HUB_URL?.replace(/\/$/, '') || null;
}

function localLayoutPayload() {
  return { layout: localLayout, updatedAt: localLayoutUpdatedAt, origin: localLayoutOrigin };
}

export async function GET() {
  const hub = hubUrl();
  if (hub) {
    try {
      const response = await fetch(`${hub}/layout`, { cache: 'no-store' });
      if (response.ok) return NextResponse.json(await response.json());
    } catch {}
  }

  return NextResponse.json(localLayoutPayload());
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.layout || body.layout.version !== 1) {
    return NextResponse.json({ error: 'Expected version 1 layout' }, { status: 400 });
  }

  const hub = hubUrl();
  if (hub) {
    try {
      const response = await fetch(`${hub}/layout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          layout: body.layout,
          origin: body.origin || null,
          seed: body.seed === true,
          ifEmpty: body.ifEmpty === true,
        }),
      });
      if (response.ok) return NextResponse.json(await response.json());
    } catch {}
  }

  const seedOnly = body.seed === true || body.ifEmpty === true;
  if (seedOnly && localLayout) {
    return NextResponse.json({ ok: true, seeded: false, ...localLayoutPayload() });
  }

  localLayout = body.layout;
  localLayoutUpdatedAt = Date.now();
  localLayoutOrigin = typeof body.origin === 'string' ? body.origin : null;
  return NextResponse.json({ ok: true, seeded: seedOnly, ...localLayoutPayload() });
}
