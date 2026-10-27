"use client";

/**
 * ============================================================================
 * TAJ HARVESTER — MAIN NEXT.JS APPLICATION SHELL (src/App.tsx)
 * ============================================================================
 * Handles:
 * - Instant, glitch-free URL navigation across all routes (/dashboard, /inventory,
 *   /billing, /dealers, /dues, /sales, /backup, /staff, /sign-in)
 * - Universal Top-Left (10%) sliding loading indicator on navigation & async actions
 * - Multi-Staff & Owner Real-Time Synchronization (BroadcastChannel + 4s polling +
 *   window focus sync)
 * - Strict Atomic All-or-Nothing Transactions: if any server check fails (e.g.,
 *   insufficient stock, duplicate part, already settled due, network error),
 *   no partial or wrong state changes are applied; state re-syncs from server
 *   and the user can safely redo the action.
 * - Multi-page A4 print root for Customer Bills (1, 2, 3+ pages) & Dealer Orders
 * - Developer Signature Box for Sk Nasim Ali on every single page
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  LogIn,
  Package,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  UserCheck,
  Users,
} from 'lucide-react';
import type {
  Bill,
  BillItem,
  DealerOrder,
  DealerOrderItem,
  PartSet,
  PaymentMode,
  PendingDue,
  ShopState,
  ShopUser,
  SparePart,
} from './types/shop';
import {
  TAJ_HARVESTER_SHOP_INFO,
  formatDateShortDisplay,
  generateAllDuesXlsxBuffer,
  generateCsvBackup,
  generateCustomerLedgerCsv,
  generateSalesCsv,
  generateXlsxBufferFromCsv,
  getDefaultOwnerAccount,
} from './utils/shopLogic';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { BillingView } from './components/BillingView';
import { DealerOrdersView } from './components/DealerOrdersView';
import { PendingDuesView } from './components/PendingDuesView';
import { CustomersView } from './components/CustomersView';
import { SalesAndBackupView } from './components/SalesAndBackupView';
import { StaffAndAuthView } from './components/StaffAndAuthView';
import {
  CustomSignInPage,
  DealerOrderPdfModal,
  PrintableBillPages,
  PrintableInvoiceModal,
} from './components/PrintableModals';

function toBlobArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export type ActiveTab =
  | 'dashboard'
  | 'inventory'
  | 'billing'
  | 'dealers'
  | 'dues'
  | 'customers'
  | 'sales'
  | 'backup'
  | 'staff';

const TAB_ROUTES: Record<ActiveTab, string> = {
  dashboard: '/dashboard',
  inventory: '/inventory',
  billing: '/billing',
  dealers: '/dealers',
  dues: '/dues',
  customers: '/customers',
  sales: '/sales',
  backup: '/backup',
  staff: '/staff',
};

function resolveTabFromPathname(pathname: string | null, fallback: ActiveTab): ActiveTab {
  if (!pathname || pathname === '/') return fallback;
  const clean = pathname.replace(/^\/+/, '').split('/')[0]?.toLowerCase();
  if (
    clean === 'dashboard' ||
    clean === 'inventory' ||
    clean === 'billing' ||
    clean === 'dealers' ||
    clean === 'dues' ||
    clean === 'customers' ||
    clean === 'sales' ||
    clean === 'backup' ||
    clean === 'staff'
  ) {
    return clean;
  }
  return fallback;
}

const DEFAULT_OWNER: ShopUser = {
  id: 'usr-owner-01',
  username: 'tajharvester000',
  fullName: 'Taj Harvester Owner',
  email: 'tajharvester000@gmail.com',
  role: 'OWNER',
  clerkUserId: 'tajharvester000@gmail.com',
};

const USER_STORAGE_KEY = 'taj_harvester_active_user_v3';
const SYNC_CHANNEL_NAME = 'taj_harvester_multi_staff_sync_v3';

export default function App({ initialTab = 'dashboard' }: { initialTab?: ActiveTab } = {}) {
  const pathname = usePathname();

  const [state, setState] = useState<ShopState>(() => ({
    schemaVersion: 6,
    ownerAccount: getDefaultOwnerAccount(),
    staffAccounts: [],
    parts: [],
    bills: [],
    dues: [],
    dealers: [],
    dealerOrders: [],
    auditLogs: [],
    backups: [],
  }));
  const [mongoConnected, setMongoConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState<ShopUser>(DEFAULT_OWNER);

  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
    resolveTabFromPathname(pathname, initialTab)
  );
  const [inventoryStockFilter, setInventoryStockFilter] = useState<
    'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'HEALTHY'
  >('ALL');
  const [countCheckEnabled, setCountCheckEnabled] = useState<boolean>(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Universal Loading Indicator State (slides out from left top 10% and retracts when done)
  const [isUniversalLoading, setIsUniversalLoading] = useState(false);
  const loadingTimerRef = useRef<number | null>(null);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);

  const pulseUniversalLoader = useCallback((durationMs = 280) => {
    if (typeof window === 'undefined') return;
    if (loadingTimerRef.current) {
      window.clearTimeout(loadingTimerRef.current);
    }
    setIsUniversalLoading(true);
    loadingTimerRef.current = window.setTimeout(() => {
      setIsUniversalLoading(false);
      loadingTimerRef.current = null;
    }, durationMs);
  }, []);

  const beginAsyncLoading = useCallback(() => {
    if (typeof window !== 'undefined' && loadingTimerRef.current) {
      window.clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    setIsUniversalLoading(true);
  }, []);

  const endAsyncLoading = useCallback(() => {
    if (typeof window === 'undefined') {
      setIsUniversalLoading(false);
      return;
    }
    if (loadingTimerRef.current) {
      window.clearTimeout(loadingTimerRef.current);
    }
    loadingTimerRef.current = window.setTimeout(() => {
      setIsUniversalLoading(false);
      loadingTimerRef.current = null;
    }, 180);
  }, []);

  // POS Billing Cart (includes partSet and per-part discount)
  const [cart, setCart] = useState<BillItem[]>([]);

  // Modals for Print Invoice, Dealer Order PDF, and /sign-in Page
  const [inspectedBill, setInspectedBill] = useState<Bill | null>(null);
  const [inspectedOrder, setInspectedOrder] = useState<DealerOrder | null>(null);
  const [isSignInPageOpen, setIsSignInPageOpen] = useState<boolean>(
    () => Boolean(pathname && pathname.startsWith('/sign-in'))
  );

  // Applies validated server state and reconciles POS cart prices against latest catalog
  const applyServerState = useCallback((data: ShopState & { meta?: { mongoConnected?: boolean } }) => {
    if (!data || !Array.isArray(data.parts)) return;
    setState({
      schemaVersion: data.schemaVersion || 3,
      ownerAccount: data.ownerAccount || getDefaultOwnerAccount(),
      staffAccounts: Array.isArray(data.staffAccounts) ? data.staffAccounts : [],
      parts: data.parts,
      bills: data.bills,
      dues: data.dues,
      dealers: data.dealers,
      dealerOrders: data.dealerOrders,
      auditLogs: data.auditLogs,
      backups: data.backups,
    });
    if (data.meta !== undefined) {
      setMongoConnected(Boolean(data.meta?.mongoConnected));
    }
    // Keep cart part names synced with latest server inventory while preserving any custom unitPrice edited in cart
    setCart((prevCart) =>
      prevCart.map((item) => {
        const latestPart = data.parts.find((p) => p.id === item.partId && !p.isArchived);
        if (!latestPart) return item;
        const activeUnitPrice = item.unitPrice > 0 ? item.unitPrice : latestPart.price;
        const gross = item.quantity * activeUnitPrice;
        const clampedDisc = Math.min(gross, item.discount || 0);
        return {
          ...item,
          partSet: latestPart.partSet,
          partNumber: latestPart.partNumber,
          nameModel: latestPart.nameModel,
          unitPrice: activeUnitPrice,
          discount: clampedDisc,
          lineTotal: Math.max(0, gross - clampedDisc),
        };
      })
    );
  }, []);

  // Fetches latest authoritative state from /api/state (used on mount, polling, focus, and error recovery)
  const syncFromServer = useCallback(
    async (showLoader = false) => {
      if (showLoader) beginAsyncLoading();
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          applyServerState(data);
        }
      } catch {
        // Keep current state if network is temporarily unreachable
      } finally {
        if (showLoader) endAsyncLoading();
      }
    },
    [applyServerState, beginAsyncLoading, endAsyncLoading]
  );

  // Broadcasts state change to any other open Staff/Owner tabs on the same browser
  const notifyOtherSessions = useCallback((nextState: ShopState) => {
    applyServerState(nextState);
    try {
      syncChannelRef.current?.postMessage({ type: 'STATE_UPDATED', timestamp: Date.now() });
      window.localStorage.setItem('taj_harvester_last_sync_ping', String(Date.now()));
    } catch {
      // Ignore BroadcastChannel / storage error
    }
  }, [applyServerState]);

  // Restore saved user session on client mount (avoids SSR hydration mismatch)
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(USER_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ShopUser;
        if (parsed && parsed.username && parsed.role) {
          setCurrentUser(parsed);
        }
      }
      const savedCountCheck = window.localStorage.getItem('taj_harvester_count_check_enabled');
      if (savedCountCheck === 'true' || savedCountCheck === 'false') {
        setCountCheckEnabled(savedCountCheck === 'true');
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const handleToggleCountCheck = useCallback((enabled: boolean) => {
    setCountCheckEnabled(enabled);
    try {
      window.localStorage.setItem('taj_harvester_count_check_enabled', String(enabled));
    } catch {
      // Ignore storage error
    }
  }, []);

  // Sync activeTab when Next.js pathname or browser Back/Forward popstate changes
  useEffect(() => {
    if (pathname?.startsWith('/sign-in')) {
      setIsSignInPageOpen(true);
      return;
    }
    setIsSignInPageOpen(false);
    const nextTab = resolveTabFromPathname(pathname, initialTab);
    setActiveTab(nextTab);
  }, [pathname, initialTab]);

  useEffect(() => {
    const onPopState = () => {
      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/sign-in')) {
        setIsSignInPageOpen(true);
        return;
      }
      setIsSignInPageOpen(false);
      setActiveTab(resolveTabFromPathname(currentPath, 'dashboard'));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Multi-Staff & Owner Real-Time Synchronization (Initial fetch + BroadcastChannel + storage event + focus sync + 25s poll)
  useEffect(() => {
    syncFromServer(true);

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        channel.onmessage = () => {
          syncFromServer(false);
        };
        syncChannelRef.current = channel;
      } catch {
        // Ignore if BroadcastChannel is blocked
      }
    }

    const handleStoragePing = (e: StorageEvent) => {
      if (e.key === 'taj_harvester_last_sync_ping') {
        syncFromServer(false);
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        syncFromServer(false);
      }
    }, 25000);

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        syncFromServer(false);
      }
    };

    window.addEventListener('storage', handleStoragePing);
    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('storage', handleStoragePing);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      try {
        syncChannelRef.current?.close();
      } catch {
        // Ignore
      }
    };
  }, [syncFromServer]);

  // Glitch-free URL navigation using pushState (prevents Next.js route remounting & state loss)
  const updateBrowserUrl = (targetUrl: string) => {
    if (typeof window !== 'undefined' && window.location.pathname !== targetUrl) {
      window.history.pushState(null, '', targetUrl);
    }
  };

  const handleNavigate = (tab: ActiveTab) => {
    const allowedTab =
      currentUser.role === 'STAFF' && tab !== 'inventory' && tab !== 'billing'
        ? 'billing'
        : tab;

    pulseUniversalLoader(240);
    if (allowedTab !== 'inventory') {
      setInventoryStockFilter('ALL');
    }
    setActiveTab(allowedTab);
    setIsSignInPageOpen(false);
    const targetUrl = TAB_ROUTES[allowedTab] || '/dashboard';
    updateBrowserUrl(targetUrl);
  };

  const handleOpenLowStockInventory = () => {
    pulseUniversalLoader(240);
    setInventoryStockFilter('LOW_STOCK');
    setActiveTab('inventory');
    setIsSignInPageOpen(false);
    updateBrowserUrl('/inventory');
  };

  // Auth Login Handler (verifies Owner from .env or Staff added by Owner)
  const handleLogin = async (username: string, password: string) => {
    beginAsyncLoading();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Invalid login credentials.');
      }

      const loggedUser: ShopUser = data.user;
      setCurrentUser(loggedUser);
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(loggedUser));
        } catch {
          // Ignore storage error
        }
      }
      await syncFromServer(false);
      setIsSignInPageOpen(false);
      setActiveTab('inventory');
      updateBrowserUrl('/inventory');
    } finally {
      endAsyncLoading();
    }
  };

  // Staff & Owner Auth Management Handlers (All-or-Nothing Atomic)
  const handleAddOrUpdateStaff = async (payload: {
    fullName: string;
    username: string;
    password: string;
  }) => {
    beginAsyncLoading();
    try {
      const res = await fetch('/api/auth/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await syncFromServer(false);
        throw new Error(data.error || 'Failed to save staff credentials.');
      }
      notifyOtherSessions(data.state);
    } finally {
      endAsyncLoading();
    }
  };

  const handleDeleteStaff = async (id: string) => {
    beginAsyncLoading();
    try {
      const res = await fetch(`/api/auth/staff?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await syncFromServer(false);
        throw new Error(data.error || 'Failed to remove staff account.');
      }
      notifyOtherSessions(data.state);
    } finally {
      endAsyncLoading();
    }
  };

  const handleUpdateOwnerPassword = async (payload: {
    currentPassword: string;
    newPassword: string;
    email?: string;
  }) => {
    beginAsyncLoading();
    try {
      const res = await fetch('/api/auth/owner-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await syncFromServer(false);
        throw new Error(data.error || 'Failed to update Owner password.');
      }
      notifyOtherSessions(data.state);
    } finally {
      endAsyncLoading();
    }
  };

  // POS Cart Handlers (with per-part percentage discount support & Count Check toggle)
  const handleAddToCart = (part: SparePart) => {
    if (countCheckEnabled && part.stockQty <= 0) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.partId === part.id);
      if (existing) {
        const nextQty = countCheckEnabled
          ? Math.min(part.stockQty, existing.quantity + 1)
          : existing.quantity + 1;
        const gross = nextQty * existing.unitPrice;
        const pct = Math.max(0, Math.min(100, existing.discountPercent || 0));
        const clampedDisc = Math.min(gross, Math.round((gross * pct) / 100));
        return prev.map((i) =>
          i.partId === part.id
            ? {
                ...i,
                quantity: nextQty,
                discountPercent: pct,
                discount: clampedDisc,
                lineTotal: Math.max(0, gross - clampedDisc),
              }
            : i
        );
      }
      return [
        ...prev,
        {
          partId: part.id,
          partSet: part.partSet,
          partNumber: part.partNumber,
          nameModel: part.nameModel,
          unitPrice: part.price,
          quantity: 1,
          discountPercent: 0,
          discount: 0,
          lineTotal: part.price,
        },
      ];
    });
  };

  const handleQuickAddPartToBill = (part: SparePart) => {
    handleAddToCart(part);
    handleNavigate('billing');
  };

  const handleUpdateCartQty = (partId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((i) => i.partId !== partId));
      return;
    }
    const partInStock = state.parts.find((p) => p.id === partId);
    if (!partInStock) return;
    if (countCheckEnabled && partInStock.stockQty <= 0) return;
    const clampedQty = countCheckEnabled
      ? Math.max(1, Math.min(partInStock.stockQty, quantity))
      : Math.max(1, Math.round(quantity));
    setCart((prev) =>
      prev.map((i) => {
        if (i.partId !== partId) return i;
        const gross = clampedQty * i.unitPrice;
        const pct = Math.max(0, Math.min(100, i.discountPercent || 0));
        const clampedDisc = Math.min(gross, Math.round((gross * pct) / 100));
        return {
          ...i,
          quantity: clampedQty,
          discountPercent: pct,
          discount: clampedDisc,
          lineTotal: Math.max(0, gross - clampedDisc),
        };
      })
    );
  };

  const handleUpdateCartDiscount = (partId: string, discountPercent: number) => {
    const pct = Math.max(0, Math.min(100, Number(discountPercent) || 0));
    setCart((prev) =>
      prev.map((i) => {
        if (i.partId !== partId) return i;
        const gross = i.quantity * i.unitPrice;
        const clampedDisc = Math.max(0, Math.min(gross, Math.round((gross * pct) / 100)));
        return {
          ...i,
          discountPercent: pct,
          discount: clampedDisc,
          lineTotal: Math.max(0, gross - clampedDisc),
        };
      })
    );
  };

  const handleUpdateCartUnitPrice = (partId: string, unitPrice: number) => {
    const cleanPrice = Math.max(0, Math.round(unitPrice || 0));
    setCart((prev) =>
      prev.map((i) => {
        if (i.partId !== partId) return i;
        const gross = i.quantity * cleanPrice;
        const pct = Math.max(0, Math.min(100, i.discountPercent || 0));
        const clampedDisc = Math.max(0, Math.min(gross, Math.round((gross * pct) / 100)));
        return {
          ...i,
          unitPrice: cleanPrice,
          discountPercent: pct,
          discount: clampedDisc,
          lineTotal: Math.max(0, gross - clampedDisc),
        };
      })
    );
  };

  const handleRemoveFromCart = (partId: string) => {
    setCart((prev) => prev.filter((i) => i.partId !== partId));
  };

  // Inventory CRUD Handlers (Strict Atomic Server-First Validation — Zero Partial/Wrong Changes)
  const handleAddPart = async (partData: {
    partSet: PartSet;
    partNumber: string;
    nameModel: string;
    rackLocation: string;
    stockQty: number;
    price: number;
    minStockLevel: number;
  }): Promise<SparePart> => {
    beginAsyncLoading();
    try {
      const res = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...partData, actor: currentUser.username }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await syncFromServer(false);
        throw new Error(
          data.error || 'Failed to add spare part. No changes were made — please try again.'
        );
      }
      notifyOtherSessions(data.state);
      return data.part;
    } finally {
      endAsyncLoading();
    }
  };

  const handleUpdatePart = async (id: string, updates: Partial<SparePart>) => {
    beginAsyncLoading();
    try {
      const res = await fetch(`/api/parts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updates, actor: currentUser.username }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await syncFromServer(false);
        throw new Error(
          data.error || 'Failed to update spare part. Changes were rolled back.'
        );
      }
      notifyOtherSessions(data.state);
    } finally {
      endAsyncLoading();
    }
  };

  const handleArchivePart = async (id: string) => {
    beginAsyncLoading();
    try {
      const res = await fetch(
        `/api/parts/${id}?actor=${encodeURIComponent(currentUser.username)}`,
        {
          method: 'DELETE',
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await syncFromServer(false);
        throw new Error(data.error || 'Failed to archive spare part.');
      }
      notifyOtherSessions(data.state);
    } finally {
      endAsyncLoading();
    }
  };

  const handleImportCsv = async (
    csvText: string,
    targetSet?: PartSet,
    options?: { forceZeroCount?: boolean; replaceTargetSet?: boolean }
  ) => {
    beginAsyncLoading();
    try {
      const res = await fetch('/api/parts/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvText,
          targetSet,
          forceZeroCount: Boolean(options?.forceZeroCount),
          replaceTargetSet: Boolean(options?.replaceTargetSet),
          actor: currentUser.username,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await syncFromServer(false);
        throw new Error(
          data.error || 'XLSX import failed validation. No parts were modified.'
        );
      }
      notifyOtherSessions(data.state);
      return { addedCount: data.addedCount, updatedCount: data.updatedCount };
    } finally {
      endAsyncLoading();
    }
  };

  // Exports .xlsx workbook for Kubota, Yanmar, GM, Local, Others, or All
  const handleExportBackupCsv = (setFilter: 'ALL' | PartSet = 'ALL') => {
    pulseUniversalLoader(320);
    const setLabel =
      setFilter === 'ALL' ? 'All_Sets' : `${setFilter.toUpperCase()}_Parts`;
    const xlsxBytes = generateXlsxBufferFromCsv(
      generateCsvBackup(state.parts, setFilter),
      setLabel
    );
    const blob = new Blob([toBlobArrayBuffer(xlsxBytes)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Taj_Harvester_${setLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

    fetch('/api/backups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'MANUAL_EXCEL',
        actor: `${currentUser.username} (${setLabel})`,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.state) notifyOtherSessions(data.state);
      })
      .catch(() => {});
  };

  // Exports all Sales / Bills data to .xlsx
  const handleExportSalesCsv = () => {
    pulseUniversalLoader(320);
    const xlsxBytes = generateXlsxBufferFromCsv(
      generateSalesCsv(state.bills),
      'Sales Register'
    );
    const blob = new Blob([toBlobArrayBuffer(xlsxBytes)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Taj_Harvester_Sales_Data_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exports all Pending Customer Dues data (summary + individual customer tabs) to .xlsx
  const handleExportAllDuesCsv = () => {
    pulseUniversalLoader(320);
    const xlsxBytes = generateAllDuesXlsxBuffer(state.dues, state.bills);
    const blob = new Blob([toBlobArrayBuffer(xlsxBytes)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Taj_Harvester_Customer_Dues_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exports a single customer's Excel-style Transaction Ledger to .xlsx
  const handleExportCustomerLedgerCsv = (due: PendingDue) => {
    pulseUniversalLoader(320);
    const sheetTitle = `${due.customerName.toUpperCase()} (${due.customerVillage.toUpperCase()})`;
    const xlsxBytes = generateXlsxBufferFromCsv(
      generateCustomerLedgerCsv(due, state.bills),
      sheetTitle
    );
    const blob = new Blob([toBlobArrayBuffer(xlsxBytes)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = due.customerName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    a.download = `${safeName}_${due.customerPhone}_Transactions.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Atomic POS Bill Creation: if stock is insufficient or another staff member sold the item,
  // fails cleanly without modifying state or clearing the cart so the user can adjust and redo it.
  const handleCompleteSale = async (payload: {
    customerName: string;
    customerPhone: string;
    customerVillage: string;
    items: {
      partId: string;
      quantity: number;
      discountPercent?: number;
      discount: number;
      unitPrice?: number;
    }[];
    discountAmount: number;
    paidAmount: number;
    paymentMode: PaymentMode;
    ignoreStockCount?: boolean;
  }): Promise<Bill> => {
    beginAsyncLoading();
    try {
      const fullPayload = { ...payload, createdBy: currentUser.username };
      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullPayload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Re-sync latest stock from server so staff sees exact available stock and can redo bill
        await syncFromServer(false);
        throw new Error(
          data.error ||
            'Bill transaction failed. Stock & dues were not changed — please check quantities and try again.'
        );
      }
      notifyOtherSessions(data.state);
      setCart([]);
      return data.bill;
    } finally {
      endAsyncLoading();
    }
  };

  // Record Pending Due Payment (Atomic: fails cleanly if balance already paid by another staff/owner)
  const handleRecordPayment = async (
    dueId: string,
    amount: number,
    paymentMode: PaymentMode,
    note: string
  ) => {
    beginAsyncLoading();
    try {
      const res = await fetch(`/api/dues/${dueId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          paymentMode,
          note,
          actor: currentUser.username,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await syncFromServer(false);
        throw new Error(
          data.error ||
            'Payment could not be recorded. Balance was not modified — please verify and try again.'
        );
      }
      notifyOtherSessions(data.state);
    } finally {
      endAsyncLoading();
    }
  };

  // Import Customer Dues from Excel (.xlsx)
  const handleImportDues = async (
    records: Omit<PendingDue, 'id'>[],
    replaceAll: boolean
  ) => {
    beginAsyncLoading();
    try {
      const res = await fetch('/api/dues/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records,
          replaceAll,
          actor: currentUser.username,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await syncFromServer(false);
        throw new Error(data.error || 'Could not import customer dues.');
      }
      notifyOtherSessions(data.state);
    } finally {
      endAsyncLoading();
    }
  };

  // Update Customer Details (Name, Phone Number, Address/Village)
  const handleUpdateCustomer = async (
    dueId: string,
    payload: {
      customerName: string;
      customerPhone: string;
      customerVillage: string;
    }
  ) => {
    beginAsyncLoading();
    try {
      const res = await fetch(`/api/dues/${dueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          actor: currentUser.username,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await syncFromServer(false);
        throw new Error(data.error || 'Could not update customer details.');
      }
      notifyOtherSessions(data.state);
    } finally {
      endAsyncLoading();
    }
  };

  // Delete Duplicate / Unwanted Customer Record
  const handleDeleteCustomer = async (dueId: string) => {
    beginAsyncLoading();
    try {
      const res = await fetch(
        `/api/dues/${dueId}?actor=${encodeURIComponent(currentUser.username)}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await syncFromServer(false);
        throw new Error(data.error || 'Could not delete customer record.');
      }
      notifyOtherSessions(data.state);
    } finally {
      endAsyncLoading();
    }
  };

  // Transfer from Pending Dues directly to the dedicated Customer Page
  const handleOpenCustomerFromDues = (dueId: string) => {
    pulseUniversalLoader(240);
    setSelectedCustomerId(dueId);
    setActiveTab('customers');
    updateBrowserUrl('/customers');
  };

  // Delete Bill (Atomic: restores stock and removes the persisted bill)
  const handleDeleteBill = async (billId: string) => {
    beginAsyncLoading();
    try {
      const res = await fetch(`/api/bills/${billId}/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: currentUser.username }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await syncFromServer(false);
        throw new Error(data.error || 'Could not delete invoice. No stock or due changes were made.');
      }
      notifyOtherSessions(data.state);
    } finally {
      endAsyncLoading();
    }
  };

  // Simple Dealer Order List PDF Generation
  const handleGenerateDealerOrder = async (payload: {
    dealerName: string;
    items: DealerOrderItem[];
    notes: string;
  }): Promise<DealerOrder> => {
    beginAsyncLoading();
    try {
      const res = await fetch('/api/dealer-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, actor: currentUser.username }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await syncFromServer(false);
        throw new Error(data.error || 'Could not generate dealer order list.');
      }
      notifyOtherSessions(data.state);
      return data.order;
    } finally {
      endAsyncLoading();
    }
  };

  const navItems: {
    id: ActiveTab;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
    ownerOnly?: boolean;
  }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard Overview',
      shortLabel: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
      ownerOnly: true,
    },
    {
      id: 'inventory',
      label: 'Spare Parts Inventory',
      shortLabel: 'Inventory',
      icon: <Package className="w-4 h-4" />,
    },
    {
      id: 'billing',
      label: 'Customer Bill (POS)',
      shortLabel: 'Customer Bill',
      icon: <ShoppingCart className="w-4 h-4" />,
    },
    {
      id: 'dealers',
      label: 'Dealer Order List',
      shortLabel: 'Dealer Order',
      icon: <FileSpreadsheet className="w-4 h-4" />,
      ownerOnly: true,
    },
    {
      id: 'dues',
      label: 'Pending Customer Dues',
      shortLabel: 'Pending Dues',
      icon: <Users className="w-4 h-4" />,
      ownerOnly: true,
    },
    {
      id: 'customers',
      label: 'Customers & History',
      shortLabel: 'Customers',
      icon: <UserCheck className="w-4 h-4" />,
      ownerOnly: true,
    },
    {
      id: 'sales',
      label: 'Sales & Void Log',
      shortLabel: 'Sales',
      icon: <BarChart3 className="w-4 h-4" />,
      ownerOnly: true,
    },
    {
      id: 'backup',
      label: '5-Set XLSX Backup',
      shortLabel: 'XLSX Backup',
      icon: <ShieldAlert className="w-4 h-4" />,
      ownerOnly: true,
    },
    {
      id: 'staff',
      label: 'Staff & Owner Auth',
      shortLabel: 'Staff & Auth',
      icon: <KeyRound className="w-4 h-4" />,
      ownerOnly: true,
    },
  ];

  const visibleNavItems = navItems.filter(
    (item) => !item.ownerOnly || currentUser.role === 'OWNER'
  );

  // Universal Top-Right (10%) Sliding Loading Indicator
  const universalLoaderElement = (
    <div
      role="status"
      aria-live="polite"
      data-testid="universal-top-right-loader"
      data-loading={isUniversalLoading ? 'true' : 'false'}
      className={`fixed top-[10%] right-0 z-50 pointer-events-none transition-transform duration-200 ease-out no-print ${
        isUniversalLoading ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div className="flex items-center gap-2.5 pl-4 pr-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-l-xl shadow-lg border border-r-0 border-amber-500/50">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
        <span>Loading Taj Harvester...</span>
      </div>
    </div>
  );

  if (isSignInPageOpen) {
    return (
      <>
        {universalLoaderElement}
        <CustomSignInPage
          onLoginSuccess={handleLogin}
          onCancelBackToOwnerSession={() => {
            pulseUniversalLoader(240);
            setIsSignInPageOpen(false);
            const target = currentUser.role === 'OWNER' ? '/dashboard' : '/billing';
            setActiveTab(currentUser.role === 'OWNER' ? 'dashboard' : 'billing');
            updateBrowserUrl(target);
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {universalLoaderElement}

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200 no-print">
        {/* Zone 1: Single text element wordmark */}
        <a
          href={currentUser.role === 'OWNER' ? '/dashboard' : '/billing'}
          onClick={(e) => {
            e.preventDefault();
            handleNavigate(currentUser.role === 'OWNER' ? 'dashboard' : 'billing');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
        >
          Taj Harvester
        </a>

        {/* Zone 2: 4–5 clean single-line text navigation links */}
        <nav
          aria-label="Primary Top Navigation"
          className="flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          {visibleNavItems.slice(0, 5).map((item) => (
            <a
              key={item.id}
              href={TAB_ROUTES[item.id]}
              onClick={(e) => {
                e.preventDefault();
                handleNavigate(item.id);
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
                activeTab === item.id
                  ? 'text-slate-900 font-semibold border-b-2 border-amber-600'
                  : ''
              }`}
            >
              {item.shortLabel}
            </a>
          ))}
        </nav>

        {/* Zone 3: 1 primary action (Sign In / Switch User route) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              pulseUniversalLoader(240);
              setIsSignInPageOpen(true);
              updateBrowserUrl('/sign-in');
            }}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {currentUser.username} ({currentUser.role}) ·{' '}
            </span>
            <span>Sign In</span>
          </button>
        </div>
      </header>

      {/* Workspace Body: Left Sidebar + Main Viewport */}
      <div className="flex-1 flex flex-row items-start no-print">
        {/* Sidebar Navigation (Sticky, Never Scrolls, Items + Signature Always Visible) */}
        <aside
          aria-label="Shop Modules Sidebar"
          className="sticky top-[57px] h-[calc(100vh-57px)] self-start flex w-64 flex-col justify-between bg-white border-r border-slate-200 p-4 shrink-0 overflow-hidden"
        >
          <div className="space-y-1">
            <div className="px-3 py-1.5 flex items-center justify-between text-xs font-semibold text-slate-400">
              <span>Shop Modules ({currentUser.role})</span>
              <button
                type="button"
                onClick={() => syncFromServer(true)}
                title="Sync latest data across Staff & Owner sessions"
                className="text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Sync</span>
              </button>
            </div>
            {visibleNavItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <a
                  key={item.id}
                  href={TAB_ROUTES[item.id]}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavigate(item.id);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </a>
              );
            })}
          </div>

          {/* Developer Signature (Sk Nasim Ali) in Sidebar — Always Visible Without Scroll */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs shrink-0">
            <div className="text-[11px] font-medium text-slate-500">
              Designed &amp; Developed by
            </div>
            <a
              href="https://dev-nasim.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-bold text-slate-900 hover:text-amber-700 inline-flex items-center gap-1.5 transition-colors"
            >
              <span>Sk Nasim Ali</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <p className="text-slate-600 leading-relaxed pt-0.5">
              I design and develop experiences that make{' '}
              <strong className="font-bold text-slate-900">WORK</strong>{' '}
              people&apos;s lives simple.
            </p>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto flex flex-col">
          <div className="flex-1">
            {activeTab === 'dashboard' && currentUser.role === 'OWNER' && (
              <DashboardView
                state={state}
                onNavigate={handleNavigate}
                onOpenLowStockInventory={handleOpenLowStockInventory}
                onExportBackup={() => handleExportBackupCsv('ALL')}
                onInspectBill={(bill) => setInspectedBill(bill)}
                onQuickAddPartToBill={handleQuickAddPartToBill}
              />
            )}

            {activeTab === 'inventory' && (
              <InventoryView
                parts={state.parts}
                initialStockFilter={inventoryStockFilter}
                countCheckEnabled={countCheckEnabled}
                onAddPart={handleAddPart}
                onUpdatePart={handleUpdatePart}
                onArchivePart={handleArchivePart}
                onImportCsv={handleImportCsv}
                onExportCsv={handleExportBackupCsv}
                onAddPartToBill={handleQuickAddPartToBill}
                onTriggerLoader={() => pulseUniversalLoader(400)}
              />
            )}

            {activeTab === 'billing' && (
              <BillingView
                parts={state.parts}
                cart={cart}
                countCheckEnabled={countCheckEnabled}
                onToggleCountCheck={handleToggleCountCheck}
                onAddToCart={handleAddToCart}
                onAddPart={handleAddPart}
                onUpdateCartQty={handleUpdateCartQty}
                onUpdateCartUnitPrice={handleUpdateCartUnitPrice}
                onUpdateCartDiscount={handleUpdateCartDiscount}
                onRemoveFromCart={handleRemoveFromCart}
                onClearCart={() => setCart([])}
                onCompleteSale={handleCompleteSale}
                onPrintBill={(bill) => setInspectedBill(bill)}
              />
            )}

            {activeTab === 'dealers' && currentUser.role === 'OWNER' && (
              <DealerOrdersView
                parts={state.parts}
                dealerOrders={state.dealerOrders}
                onGenerateDealerOrder={handleGenerateDealerOrder}
                onPreviewOrderPdf={(order) => setInspectedOrder(order)}
              />
            )}

            {activeTab === 'dues' && currentUser.role === 'OWNER' && (
              <PendingDuesView
                dues={state.dues}
                bills={state.bills}
                onRecordPayment={handleRecordPayment}
                onUpdateCustomer={handleUpdateCustomer}
                onOpenCustomerPage={handleOpenCustomerFromDues}
                onImportDues={handleImportDues}
                onExportAllDuesCsv={handleExportAllDuesCsv}
                onExportCustomerLedgerCsv={handleExportCustomerLedgerCsv}
                onInspectBill={(bill) => setInspectedBill(bill)}
                onTriggerLoader={() => pulseUniversalLoader(400)}
              />
            )}

            {activeTab === 'customers' && currentUser.role === 'OWNER' && (
              <CustomersView
                dues={state.dues}
                bills={state.bills}
                selectedCustomerId={selectedCustomerId}
                onSelectCustomer={(id) => setSelectedCustomerId(id)}
                onBackToDues={() => handleNavigate('dues')}
                onUpdateCustomer={handleUpdateCustomer}
                onDeleteCustomer={handleDeleteCustomer}
                onRecordPayment={handleRecordPayment}
                onExportCustomerLedgerCsv={handleExportCustomerLedgerCsv}
                onInspectBill={(bill) => setInspectedBill(bill)}
              />
            )}

            {activeTab === 'sales' && currentUser.role === 'OWNER' && (
              <SalesAndBackupView
                mode="sales"
                state={state}
                mongoConnected={mongoConnected}
                onInspectBill={(bill) => setInspectedBill(bill)}
                onDeleteBill={handleDeleteBill}
                onExportBackup={handleExportBackupCsv}
                onExportSalesCsv={handleExportSalesCsv}
                onExportAllDuesCsv={handleExportAllDuesCsv}
                onImportCsv={handleImportCsv}
                onTriggerLoader={() => pulseUniversalLoader(400)}
              />
            )}

            {activeTab === 'backup' && currentUser.role === 'OWNER' && (
              <SalesAndBackupView
                mode="backup"
                state={state}
                mongoConnected={mongoConnected}
                onInspectBill={(bill) => setInspectedBill(bill)}
                onDeleteBill={handleDeleteBill}
                onExportBackup={handleExportBackupCsv}
                onExportSalesCsv={handleExportSalesCsv}
                onExportAllDuesCsv={handleExportAllDuesCsv}
                onImportCsv={handleImportCsv}
                onTriggerLoader={() => pulseUniversalLoader(400)}
              />
            )}

            {activeTab === 'staff' && currentUser.role === 'OWNER' && (
              <StaffAndAuthView
                ownerAccount={state.ownerAccount || getDefaultOwnerAccount()}
                staffAccounts={state.staffAccounts || []}
                onAddOrUpdateStaff={handleAddOrUpdateStaff}
                onDeleteStaff={handleDeleteStaff}
                onUpdateOwnerPassword={handleUpdateOwnerPassword}
              />
            )}
          </div>
        </main>
      </div>

      {/* Dedicated Multi-Page Print Root (renders unclipped A4 sheets when window.print() is triggered) */}
      {inspectedBill && (
        <div className="print-only-root" aria-hidden="true">
          <PrintableBillPages bill={inspectedBill} isPrintCopy={true} />
        </div>
      )}

      {inspectedOrder && !inspectedBill && (
        <div className="print-only-root" aria-hidden="true">
          <div className="print-invoice-sheet bg-white p-6 space-y-4 text-slate-900">
            <div className="flex items-start justify-between pb-4 border-b-2 border-slate-800">
              <div>
                <h3 className="text-xl font-bold text-slate-900 font-display uppercase">
                  {TAJ_HARVESTER_SHOP_INFO.name} — DEALER ORDER LIST
                </h3>
                <p className="text-xs font-semibold text-slate-700 mt-1">
                  Address: {TAJ_HARVESTER_SHOP_INFO.address} · Ph: {TAJ_HARVESTER_SHOP_INFO.phone}
                </p>
                <p className="text-sm font-bold text-slate-900 mt-2">
                  Dealer: {inspectedOrder.dealerName}
                </p>
              </div>
              <div className="text-right font-mono text-xs">
                <div className="font-bold text-slate-900">{inspectedOrder.orderNumber}</div>
                <div>{formatDateShortDisplay(inspectedOrder.createdAt)}</div>
              </div>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-y border-slate-300 bg-slate-50">
                  <th className="py-2 px-2.5 font-semibold">#</th>
                  <th className="py-2 px-2.5 font-semibold">Part Number</th>
                  <th className="py-2 px-2.5 font-semibold">Description</th>
                  <th className="py-2 px-2.5 font-semibold text-right">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {inspectedOrder.items.map((item, idx) => (
                  <tr key={`${item.partId}-${idx}`}>
                    <td className="py-2 px-2.5 font-mono">{idx + 1}</td>
                    <td className="py-2 px-2.5 font-mono font-bold">{item.partNumber}</td>
                    <td className="py-2 px-2.5">{item.nameModel}</td>
                    <td className="py-2 px-2.5 text-right font-mono font-bold">
                      {item.orderQty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* On-Screen Modals */}
      <PrintableInvoiceModal
        bill={inspectedBill}
        autoPrint={false}
        onClose={() => setInspectedBill(null)}
      />

      <DealerOrderPdfModal
        order={inspectedOrder}
        onClose={() => setInspectedOrder(null)}
      />
    </div>
  );
}
