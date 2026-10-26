import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import type { DealerOrder, DealerOrderItem } from '@/types/shop';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { dealerId, dealerName, items, notes, actor } = await request.json();
    let shopState = await getShopState();

    const customDealerName = String(dealerName || '').trim();
    const matchedDealer = dealerId
      ? shopState.dealers.find((d) => d.id === dealerId)
      : undefined;
    const resolvedDealerName = matchedDealer?.name || customDealerName;

    if (!resolvedDealerName) {
      return NextResponse.json(
        { error: 'Please enter a Dealer Name for the order list.' },
        { status: 400 }
      );
    }

    const orderItems: DealerOrderItem[] = Array.isArray(items) ? items : [];
    if (orderItems.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one part to generate a dealer order list.' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const nextOrderNum = `ORDER-2026-${String(shopState.dealerOrders.length + 1).padStart(2, '0')}`;
    const totalUnitsQty = orderItems.reduce((sum, i) => sum + Number(i.orderQty || 0), 0);

    const newOrder: DealerOrder = {
      id: `po-${Date.now()}`,
      orderNumber: nextOrderNum,
      dealerId: matchedDealer?.id || 'custom-dealer',
      dealerName: resolvedDealerName,
      dealerPhone: matchedDealer?.phone || '',
      dealerCity: matchedDealer?.city || '',
      items: orderItems,
      totalItemsCount: orderItems.length,
      totalUnitsQty,
      estimatedOrderValue: 0,
      notes: String(notes || '').trim(),
      createdBy: actor || 'tajharvester000',
      createdAt: nowIso,
    };

    shopState = {
      ...shopState,
      dealerOrders: [newOrder, ...shopState.dealerOrders],
      auditLogs: [
        {
          id: `audit-${Date.now()}`,
          timestamp: nowIso,
          action: 'DEALER_ORDER_GENERATED',
          actor: actor || 'tajharvester000',
          summary: `Generated Dealer Order List ${newOrder.orderNumber} for ${newOrder.dealerName} (${newOrder.totalItemsCount} items, ${newOrder.totalUnitsQty} units)`,
          referenceId: newOrder.id,
        },
        ...shopState.auditLogs,
      ],
    };

    await saveShopState(shopState);
    return NextResponse.json({ order: newOrder, state: shopState }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
