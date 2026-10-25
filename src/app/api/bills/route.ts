import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import { syncStateToMongo } from '@/lib/mongodb';
import { executeAtomicBillTransaction } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const shopState = getShopState();
    const { nextState, createdBill } = executeAtomicBillTransaction(
      shopState,
      payload,
      new Date().toISOString()
    );
    saveShopState(nextState);
    syncStateToMongo(nextState).catch(() => {});
    return NextResponse.json({ bill: createdBill, state: nextState }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
