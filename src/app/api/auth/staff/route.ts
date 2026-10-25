/**
 * ============================================================================
 * TAJ HARVESTER — STAFF CREDENTIALS MANAGEMENT API ROUTE (Owner Only)
 * ============================================================================
 * Allows the Shop Owner to add, update, or remove Staff accounts.
 * Staff accounts do not have self-service sign-up or forgot-password;
 * if staff needs their credentials, the Owner can view or update them here.
 */

import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import { getDefaultOwnerAccount } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, fullName } = body || {};

    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanPassword = String(password || '').trim();
    const cleanName = String(fullName || '').trim();

    if (!cleanUsername || !cleanPassword || !cleanName) {
      return NextResponse.json(
        { error: 'Staff Full Name, User ID, and Password are required.' },
        { status: 400 }
      );
    }

    const shopState = getShopState();
    const owner = shopState.ownerAccount || getDefaultOwnerAccount();

    if (cleanUsername === owner.username.toLowerCase()) {
      return NextResponse.json(
        { error: 'Staff User ID cannot be the same as the Owner User ID.' },
        { status: 400 }
      );
    }

    const staffList = [...(shopState.staffAccounts || [])];
    const existingIdx = staffList.findIndex(
      (s) => s.username.toLowerCase() === cleanUsername
    );

    if (existingIdx >= 0) {
      staffList[existingIdx] = {
        ...staffList[existingIdx],
        username: cleanUsername,
        password: cleanPassword,
        fullName: cleanName,
      };
    } else {
      staffList.push({
        id: `staff-${Date.now()}`,
        username: cleanUsername,
        password: cleanPassword,
        fullName: cleanName,
        createdAt: new Date().toISOString(),
      });
    }

    shopState.staffAccounts = staffList;
    saveShopState(shopState);

    return NextResponse.json({
      state: shopState,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    const shopState = getShopState();
    shopState.staffAccounts = (shopState.staffAccounts || []).filter(
      (s) => s.id !== id
    );
    saveShopState(shopState);

    return NextResponse.json({
      state: shopState,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
