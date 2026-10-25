import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import { syncStateToMongo } from '@/lib/mongodb';
import { importDuesRecords } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const shopState = getShopState();
    const { nextState, addedCount, updatedCount } = importDuesRecords(
      shopState,
      body.records || body.dues || [],
      {
        replaceAll: Boolean(body.replaceAll),
        actor: body.actor || 'OWNER',
      },
      new Date().toISOString()
    );
    saveShopState(nextState);
    syncStateToMongo(nextState).catch(() => {});
    return NextResponse.json({
      state: nextState,
      addedCount,
      updatedCount,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
