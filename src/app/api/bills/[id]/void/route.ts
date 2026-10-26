import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import { voidBillTransaction } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { reason, actor } = await request.json();
    const shopState = await getShopState();
    const nextState = voidBillTransaction(
      shopState,
      id,
      reason || 'Voided by owner',
      actor || 'tajharvester000',
      new Date().toISOString()
    );
    await saveShopState(nextState);
    return NextResponse.json({ state: nextState });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
