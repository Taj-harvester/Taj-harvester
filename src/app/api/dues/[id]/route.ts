import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import { deleteCustomerDueRecord, updateCustomerDueDetails } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const shopState = await getShopState();
    const { nextState, updatedDue } = updateCustomerDueDetails(
      shopState,
      id,
      {
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        customerVillage: body.customerVillage,
        actor: body.actor || 'OWNER',
      },
      new Date().toISOString()
    );
    await saveShopState(nextState);
    return NextResponse.json({ due: updatedDue, state: nextState });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const actor = searchParams.get('actor') || 'OWNER';
    const shopState = await getShopState();
    const { nextState } = deleteCustomerDueRecord(
      shopState,
      id,
      actor,
      new Date().toISOString()
    );
    await saveShopState(nextState);
    return NextResponse.json({ state: nextState });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
