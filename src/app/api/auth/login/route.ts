/**
 * ============================================================================
 * TAJ HARVESTER — AUTH LOGIN API ROUTE (src/app/api/auth/login/route.ts)
 * ============================================================================
 * Verifies login strictly against:
 * 1. Owner credentials (initialized from .env OWNER_USER_ID & OWNER_PASSWORD, updatable by Owner)
 * 2. Staff credentials explicitly created by the Owner
 */

import { NextResponse } from 'next/server';
import { getShopState } from '@/lib/store';
import { getDefaultOwnerAccount } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body || {};
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();

    if (!cleanUser || !cleanPass) {
      return NextResponse.json(
        { error: 'User ID and password are required.' },
        { status: 400 }
      );
    }

    const shopState = getShopState();
    const owner = shopState.ownerAccount || getDefaultOwnerAccount();

    // 1. Check Owner credentials (matches User ID or Owner Email)
    if (
      cleanUser === owner.username.toLowerCase() ||
      cleanUser === owner.email.toLowerCase()
    ) {
      if (cleanPass !== owner.password) {
        return NextResponse.json(
          { error: 'Incorrect Owner password.' },
          { status: 401 }
        );
      }

      return NextResponse.json({
        user: {
          id: 'usr-owner-01',
          username: owner.username,
          fullName: owner.fullName,
          email: owner.email,
          role: 'OWNER',
          clerkUserId: owner.email,
        },
      });
    }

    // 2. Check Staff accounts added by the Owner
    const staffList = shopState.staffAccounts || [];
    const matchedStaff = staffList.find(
      (s) => s.username.toLowerCase() === cleanUser
    );

    if (!matchedStaff) {
      return NextResponse.json(
        {
          error:
            'Account not found. Staff accounts must be added by the Owner first.',
        },
        { status: 401 }
      );
    }

    if (matchedStaff.password !== cleanPass) {
      return NextResponse.json(
        {
          error:
            'Incorrect staff password. Please ask the Owner to view your credentials.',
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: matchedStaff.id,
        username: matchedStaff.username,
        fullName: matchedStaff.fullName,
        role: 'STAFF',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
