import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import { deleteBillTransaction } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { actor } = await request.json().catch(() => ({}));
    const shopState = await getShopState();
    const nextState = deleteBillTransaction(
      shopState,
      id,
      actor || 'tajharvester000',
      new Date().toISOString()
    );
    await saveShopState(nextState);
    return NextResponse.json({ state: nextState });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
