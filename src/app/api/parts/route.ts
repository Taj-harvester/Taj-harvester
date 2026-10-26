import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import type { SparePart } from '@/types/shop';
import { detectPartSet, PART_SET_META } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let shopState = await getShopState();

    const { partSet, partNumber, nameModel, rackLocation, stockQty, price, minStockLevel, actor } =
      body || {};
    const cleanName = String(nameModel || '').trim();
    const rawCode = String(partNumber || '').trim().toUpperCase();

    if (!cleanName) {
      return NextResponse.json(
        { error: 'Part Name is required.' },
        { status: 400 }
      );
    }

    const resolvedSet = detectPartSet(rawCode, cleanName, partSet);
    const isOthers =
      resolvedSet === 'others' ||
      !rawCode ||
      rawCode === 'N/A' ||
      rawCode === '—' ||
      rawCode === '-';

    if (!isOthers && !rawCode) {
      return NextResponse.json(
        { error: 'Part Number is required for Kubota, Yanmar, GM, and Local parts.' },
        { status: 400 }
      );
    }

    const cleanCode = isOthers ? 'N/A' : rawCode;
    const cleanRack = String(rackLocation || '').trim() || (isOthers ? 'Bin / Counter' : '');

    if (!cleanRack) {
      return NextResponse.json(
        { error: 'Rack No is required.' },
        { status: 400 }
      );
    }

    if (!isOthers) {
      const existingByCode = shopState.parts.find(
        (p) => !p.isArchived && p.partNumber.toUpperCase() === cleanCode
      );
      if (existingByCode) {
        return NextResponse.json(
          { error: `Part Number ${cleanCode} already exists in inventory (${existingByCode.nameModel}).` },
          { status: 409 }
        );
      }
    }

    const meta = PART_SET_META[resolvedSet];
    const nowIso = new Date().toISOString();

    const newPart: SparePart = {
      id: `part-${Date.now()}`,
      partSet: resolvedSet,
      partNumber: cleanCode,
      nameModel: cleanName,
      rackLocation: cleanRack,
      price: Math.max(1, Math.round(Number(price) || 0)),
      stockQty: Math.max(0, Math.round(Number(stockQty) || 0)),
      minStockLevel: Math.max(1, Math.round(Number(minStockLevel) || 5)),
      brand: meta.brandPrefix,
      category: meta.shortLabel,
      unit: 'Pc',
      updatedAt: nowIso,
      isArchived: false,
    };

    shopState = {
      ...shopState,
      parts: [newPart, ...shopState.parts],
      auditLogs: [
        {
          id: `audit-${Date.now()}`,
          timestamp: nowIso,
          action: 'PART_ADDED',
          actor: actor || 'tajharvester000',
          summary: `Added [${resolvedSet.toUpperCase()}] ${newPart.partNumber} (${newPart.nameModel}) · Rack: ${newPart.rackLocation} · Count: ${newPart.stockQty} · Selling Price: ₹${newPart.price}`,
          referenceId: newPart.id,
        },
        ...shopState.auditLogs,
      ],
    };

    await saveShopState(shopState);
    return NextResponse.json({ part: newPart, state: shopState }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
