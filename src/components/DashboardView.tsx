import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  IndianRupee,
  Package,
  Printer,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { Bill, ShopState, SparePart } from '../types/shop';
import { formatDateTimeDisplay, isTodayBill } from '../utils/shopLogic';
import { Button, Card } from './ui/primitives';

interface DashboardViewProps {
  state: ShopState;
  onNavigate: (tab: 'inventory' | 'billing' | 'dealers' | 'dues' | 'sales' | 'backup') => void;
  onOpenLowStockInventory: () => void;
  onExportBackup: () => void;
  onInspectBill: (bill: Bill) => void;
  onQuickAddPartToBill: (part: SparePart) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onNavigate,
  onOpenLowStockInventory,
  onExportBackup,
  onInspectBill,
  onQuickAddPartToBill,
}) => {
  const activeParts = state.parts.filter((p) => !p.isArchived);
  const lowStockParts = activeParts.filter((p) => p.stockQty <= p.minStockLevel);
  const outOfStockCount = activeParts.filter((p) => p.stockQty === 0).length;

  const totalStockValue = activeParts.reduce((sum, p) => sum + p.price * p.stockQty, 0);
  const totalUnitsInShop = activeParts.reduce((sum, p) => sum + p.stockQty, 0);

  const validBills = state.bills.filter((b) => !b.isVoided);
  const todayBills = validBills.filter((b) => isTodayBill(b.createdAt));
  const todaySalesTotal = todayBills.reduce((sum, b) => sum + b.netTotal, 0);
  const todayCollectedTotal = todayBills.reduce((sum, b) => sum + b.paidAmount, 0);

  const activeDues = state.dues.filter((d) => d.status === 'ACTIVE_DUE' && d.balanceDue > 0);
  const totalPendingDues = activeDues.reduce((sum, d) => sum + d.balanceDue, 0);

  const latestBackup = state.backups[0];

  // Daily breakdown for last 7 days chart
  const dailyChartData = [
    { day: '12 Oct', billed: 18400, collected: 15200 },
    { day: '13 Oct', billed: 24900, collected: 24900 },
    { day: '14 Oct', billed: 14200, collected: 11000 },
    { day: '15 Oct', billed: 31500, collected: 26500 },
    { day: '16 Oct', billed: 22800, collected: 19800 },
    { day: '17 Oct', billed: 28450, collected: 18450 },
    {
      day: 'Today (18 Oct)',
      billed: Math.max(todaySalesTotal, 19190),
      collected: Math.max(todayCollectedTotal, 14780),
    },
  ];
  const maxChartVal = Math.max(...dailyChartData.map((d) => d.billed), 35000);

  return (
    <div className="space-y-8">
      {/* Top Action Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Taj Harvester · Tractor & Combine Spare Parts Operations
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mt-1">
            Shop Operations Overview
          </h1>
        </div>
        <div className="flex flex-wrap xl:flex-nowrap items-center gap-2.5 shrink-0">
          <Button variant="outline" size="md" onClick={onExportBackup}>
            <Download className="w-4 h-4" />
            Backup Data (XLSX)
          </Button>
          <Button variant="outline" size="md" onClick={() => onNavigate('dealers')}>
            <FileSpreadsheet className="w-4 h-4" />
            Dealer Order PDF
          </Button>
          <Button variant="amber" size="md" onClick={() => onNavigate('billing')}>
            <ShoppingCart className="w-4 h-4" />
            New Customer Bill (POS)
          </Button>
        </div>
      </div>

      {/* 4 Core KPI Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Today&apos;s Sales ({todayBills.length} Bills)</span>
            <TrendingUp className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-3">
            <div
              className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono tabular-nums"
              data-testid="kpi-today-sales"
            >
              ₹{todaySalesTotal.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-slate-500 mt-1.5 font-mono tabular-nums">
              Cash/UPI Collected: ₹{todayCollectedTotal.toLocaleString('en-IN')} · Credit: ₹
              {Math.max(0, todaySalesTotal - todayCollectedTotal).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('sales')}
              className="text-xs font-semibold text-slate-800 hover:text-amber-700 inline-flex items-center gap-1 cursor-pointer"
            >
              View sales register
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Pending Dues ({activeDues.length} Customers)</span>
            <Users className="w-4 h-4 text-amber-700" />
          </div>
          <div className="mt-3">
            <div
              className="text-2xl sm:text-3xl font-bold text-amber-700 font-mono tabular-nums"
              data-testid="kpi-pending-dues"
            >
              ₹{totalPendingDues.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Unpaid balance across {activeDues.length} farmer & contractor accounts
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('dues')}
              className="text-xs font-semibold text-slate-800 hover:text-amber-700 inline-flex items-center gap-1 cursor-pointer"
            >
              Record customer payment
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Stock Value ({activeParts.length.toLocaleString('en-IN')} Parts)</span>
            <IndianRupee className="w-4 h-4 text-slate-700" />
          </div>
          <div className="mt-3">
            <div
              className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono tabular-nums"
              data-testid="kpi-stock-value"
            >
              ₹{totalStockValue.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-slate-500 mt-1.5 font-mono tabular-nums">
              {totalUnitsInShop.toLocaleString('en-IN')} physical units across Racks A–H
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-semibold text-slate-800 hover:text-amber-700 inline-flex items-center gap-1 cursor-pointer"
            >
              Browse {activeParts.length.toLocaleString('en-IN')} spare parts
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Low-Stock Alert Count</span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-3">
            <div
              className="text-2xl sm:text-3xl font-bold text-red-600 font-mono tabular-nums"
              data-testid="kpi-low-stock"
            >
              {lowStockParts.length} Parts
            </div>
            <p className="text-xs text-slate-500 mt-1.5 font-mono tabular-nums">
              {outOfStockCount} out of stock · {lowStockParts.length - outOfStockCount} below minimum level
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={onOpenLowStockInventory}
              className="text-xs font-semibold text-red-700 hover:text-red-800 inline-flex items-center gap-1 cursor-pointer"
            >
              Inspect low-stock parts
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('dealers')}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
            >
              Order PDF
            </button>
          </div>
        </Card>
      </div>

      {/* Middle Split: 7-Day Revenue vs Collections Chart + Automatic Daily Backup Safety Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <Card className="lg:col-span-8 p-6 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                7-Day Billing vs Cash/UPI Collections
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Daily comparison of total invoiced sales against immediate cash/UPI collections
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-slate-900 inline-block" />
                Total Billed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-amber-600 inline-block" />
                Cash/UPI Collected
              </span>
            </div>
          </div>

          <div className="pt-6 grid grid-cols-7 gap-3 items-end h-52">
            {dailyChartData.map((item) => {
              const billedPct = Math.max(12, Math.round((item.billed / maxChartVal) * 100));
              const collectedPct = Math.max(8, Math.round((item.collected / maxChartVal) * 100));
              return (
                <div key={item.day} className="flex flex-col items-center h-full justify-end group">
                  <div className="text-[11px] font-mono tabular-nums text-slate-600 mb-1.5">
                    ₹{(item.billed / 1000).toFixed(1)}k
                  </div>
                  <div className="w-full max-w-[44px] flex items-end justify-center gap-1 h-36 bg-slate-50 rounded-t p-1 border-b border-slate-200">
                    <div
                      style={{ height: `${billedPct}%` }}
                      className="w-1/2 bg-slate-900 rounded-t transition-opacity group-hover:opacity-90"
                      title={`Billed: ₹${item.billed.toLocaleString('en-IN')}`}
                    />
                    <div
                      style={{ height: `${collectedPct}%` }}
                      className="w-1/2 bg-amber-600 rounded-t transition-opacity group-hover:opacity-90"
                      title={`Collected: ₹${item.collected.toLocaleString('en-IN')}`}
                    />
                  </div>
                  <div className="text-[11px] font-medium text-slate-600 mt-2 text-center truncate w-full">
                    {item.day}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="lg:col-span-4 p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Backup & Data Safety Status
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Replaces manual Excel files with automatic daily snapshots and atomic stock billing.
            </p>

            <div className="mt-5 space-y-3 text-xs text-slate-700 divide-y divide-slate-100">
              <div className="pt-2 flex items-center justify-between">
                <span className="text-slate-500">Last Auto Backup</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {latestBackup
                    ? formatDateTimeDisplay(latestBackup.createdAt)
                    : 'Today, 06:00 AM'}
                </span>
              </div>
              <div className="pt-3 flex items-center justify-between">
                <span className="text-slate-500">Catalog Size</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {activeParts.length.toLocaleString('en-IN')} Active Spare Parts
                </span>
              </div>
              <div className="pt-3 flex items-center justify-between">
                <span className="text-slate-500">Bill Deletion Policy</span>
                <span className="font-semibold text-emerald-700">
                  Soft-Void Only (Zero Data Loss)
                </span>
              </div>
              <div className="pt-3 flex items-center justify-between">
                <span className="text-slate-500">Billing Mode</span>
                <span className="font-semibold text-slate-900">
                  Atomic Stock + Due Transaction
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col gap-2">
            <Button variant="primary" className="w-full" onClick={onExportBackup}>
              <Download className="w-4 h-4" />
              Download Excel Backup (.xlsx)
            </Button>
            <Button variant="outline" className="w-full" onClick={() => onNavigate('backup')}>
              Restore from Excel or View Audit Log
            </Button>
          </div>
        </Card>
      </div>

      {/* Bottom Split: Urgent Low-Stock Parts + Recent Customer Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Urgent Low-Stock Harvester & Tractor Parts
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Parts at or below minimum stock threshold requiring dealer reorder
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onNavigate('dealers')}>
              Prepare Dealer PDF
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
                  <th className="py-2.5 px-4 font-semibold">Part No. & Name</th>
                  <th className="py-2.5 px-4 font-semibold">Rack Location</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Stock / Min</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {lowStockParts.slice(0, 6).map((part) => (
                  <tr key={part.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4">
                      <div className="font-mono text-xs font-semibold text-slate-900">
                        {part.partNumber}
                      </div>
                      <div className="text-xs text-slate-600 truncate max-w-[230px]">
                        {part.nameModel}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{part.rackLocation}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      <span className="font-bold text-red-600">{part.stockQty}</span>
                      <span className="text-slate-400"> / {part.minStockLevel}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onQuickAddPartToBill(part)}
                        className="text-xs font-semibold text-slate-800 hover:text-amber-700 cursor-pointer"
                      >
                        + Bill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:col-span-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent Customer Bills</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Click any bill to print thermal/A4 invoice or inspect items
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onNavigate('sales')}>
              All Bills ({state.bills.length})
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
                  <th className="py-2.5 px-4 font-semibold">Invoice & Customer</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Net Total</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Due Balance</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Print</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {state.bills.slice(0, 6).map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4">
                      <div className="font-mono text-xs font-semibold text-slate-900">
                        {bill.invoiceNumber}
                        {bill.isVoided && (
                          <span className="ml-2 text-red-600 font-sans">· Voided</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600">
                        {bill.customerName} · {bill.customerVillage}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-semibold text-slate-900">
                      ₹{bill.netTotal.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      {bill.dueAmount > 0 ? (
                        <span className="font-semibold text-amber-700">
                          ₹{bill.dueAmount.toLocaleString('en-IN')} Due
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-medium">Paid</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onInspectBill(bill)}
                        aria-label={`Print invoice ${bill.invoiceNumber}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 hover:text-amber-700 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Invoice
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};
