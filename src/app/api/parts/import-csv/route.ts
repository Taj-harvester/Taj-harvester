import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import { importPartsFromCsv } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { csvText, actor, targetSet, forceZeroCount, replaceTargetSet } = await request.json();
    const shopState = await getShopState();
    const { nextState, addedCount, updatedCount } = importPartsFromCsv(
      shopState,
      String(csvText || ''),
      actor || 'tajharvester000',
      new Date().toISOString(),
      targetSet,
      {
        forceZeroCount: Boolean(forceZeroCount),
        replaceTargetSet: Boolean(replaceTargetSet),
      }
    );
    await saveShopState(nextState);
    return NextResponse.json({
      addedCount,
      updatedCount,
      state: nextState,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
