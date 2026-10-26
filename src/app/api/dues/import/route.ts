import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import { importDuesRecords } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const shopState = await getShopState();
    const { nextState, addedCount, updatedCount } = importDuesRecords(
      shopState,
      body.records || body.dues || [],
      {
        replaceAll: Boolean(body.replaceAll),
        actor: body.actor || 'OWNER',
      },
      new Date().toISOString()
    );
    await saveShopState(nextState);
    return NextResponse.json({
      state: nextState,
      addedCount,
      updatedCount,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
