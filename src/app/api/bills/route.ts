import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import { executeAtomicBillTransaction } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const shopState = await getShopState();
    const { nextState, createdBill } = executeAtomicBillTransaction(
      shopState,
      payload,
      new Date().toISOString()
    );
    await saveShopState(nextState);
    return NextResponse.json({ bill: createdBill, state: nextState }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
