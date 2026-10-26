import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import type { SparePart } from '@/types/shop';
import { detectPartSet, PART_SET_META } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    let shopState = await getShopState();

    const idx = shopState.parts.findIndex((p) => p.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: 'Spare part not found.' }, { status: 404 });
    }

    const existing = shopState.parts[idx];
    const nowIso = new Date().toISOString();
    const nextName = body.nameModel !== undefined ? String(body.nameModel).trim() : existing.nameModel;
    if (!nextName) {
      return NextResponse.json({ error: 'Part Name cannot be empty.' }, { status: 400 });
    }

    const rawCode =
      body.partNumber !== undefined
        ? String(body.partNumber).trim().toUpperCase()
        : existing.partNumber;

    const nextSet = body.partSet
      ? detectPartSet(rawCode, nextName, body.partSet)
      : existing.partSet || detectPartSet(rawCode, nextName);

    const isOthers =
      nextSet === 'others' ||
      !rawCode ||
      rawCode === 'N/A' ||
      rawCode === '—' ||
      rawCode === '-';

    if (!isOthers && !rawCode) {
      return NextResponse.json({ error: 'Part Number cannot be empty.' }, { status: 400 });
    }

    const nextCode = isOthers ? 'N/A' : rawCode;

    if (!isOthers && nextCode !== existing.partNumber.toUpperCase()) {
      const duplicate = shopState.parts.find(
        (p) =>
          p.id !== id &&
          !p.isArchived &&
          p.partSet === nextSet &&
          p.partNumber.toUpperCase() === nextCode
      );
      if (duplicate) {
        return NextResponse.json(
          {
            error: `Cannot update: Part Number ${nextCode} is already used by "${duplicate.nameModel}".`,
          },
          { status: 409 }
        );
      }
    }

    if (body.price !== undefined && (Number.isNaN(Number(body.price)) || Number(body.price) < 0)) {
      return NextResponse.json(
        { error: 'Selling Price must be 0 or a positive number.' },
        { status: 400 }
      );
    }

    if (body.stockQty !== undefined && (Number.isNaN(Number(body.stockQty)) || Number(body.stockQty) < 0)) {
      return NextResponse.json(
        { error: 'Stock Count cannot be negative.' },
        { status: 400 }
      );
    }

    const meta = PART_SET_META[nextSet];

    const updatedPart: SparePart = {
      ...existing,
      partSet: nextSet,
      partNumber: nextCode,
      nameModel: nextName,
      rackLocation: body.rackLocation
        ? String(body.rackLocation).trim()
        : existing.rackLocation,
      price:
        body.price !== undefined
          ? Math.max(0, Math.round(Number(body.price) * 100) / 100)
          : existing.price,
      stockQty:
        body.stockQty !== undefined
          ? Math.max(0, Math.round(Number(body.stockQty)))
          : existing.stockQty,
      minStockLevel:
        body.minStockLevel !== undefined
          ? Math.max(1, Math.round(Number(body.minStockLevel)))
          : existing.minStockLevel,
      brand: meta.brandPrefix,
      category: meta.shortLabel,
      updatedAt: nowIso,
    };

    const nextParts = [...shopState.parts];
    nextParts[idx] = updatedPart;

    shopState = {
      ...shopState,
      parts: nextParts,
      auditLogs: [
        {
          id: `audit-${Date.now()}`,
          timestamp: nowIso,
          action: 'PART_UPDATED',
          actor: body.actor || 'tajharvester000',
          summary: `Updated [${updatedPart.partSet.toUpperCase()}] ${updatedPart.partNumber} (${updatedPart.nameModel}) · Rack: ${updatedPart.rackLocation} · Count: ${updatedPart.stockQty} · Price: ₹${updatedPart.price}`,
          referenceId: updatedPart.id,
        },
        ...shopState.auditLogs,
      ],
    };

    await saveShopState(shopState);
    return NextResponse.json({ part: updatedPart, state: shopState });
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
    const actor = searchParams.get('actor') || 'tajharvester000';
    let shopState = await getShopState();

    const target = shopState.parts.find((p) => p.id === id);
    if (!target) {
      return NextResponse.json({ error: 'Part not found.' }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    shopState = {
      ...shopState,
      parts: shopState.parts.map((p) =>
        p.id === id ? { ...p, isArchived: true, updatedAt: nowIso } : p
      ),
      auditLogs: [
        {
          id: `audit-${Date.now()}`,
          timestamp: nowIso,
          action: 'PART_ARCHIVED',
          actor,
          summary: `Archived part ${target.partNumber} (${target.nameModel}) from active catalog.`,
          referenceId: id,
        },
        ...shopState.auditLogs,
      ],
    };

    await saveShopState(shopState);
    return NextResponse.json({ state: shopState });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
