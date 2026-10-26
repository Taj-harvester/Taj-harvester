import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import { recordDuePayment } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { amount, paymentMode, note, actor } = await request.json();
    const shopState = await getShopState();
    const { nextState, updatedDue } = recordDuePayment(
      shopState,
      id,
      Number(amount),
      paymentMode || 'CASH',
      note || '',
      actor || 'tajharvester000',
      new Date().toISOString()
    );
    await saveShopState(nextState);
    return NextResponse.json({ due: updatedDue, state: nextState });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
