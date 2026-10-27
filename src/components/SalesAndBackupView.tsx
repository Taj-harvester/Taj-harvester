import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileUp,
  LoaderCircle,
  Printer,
  Trash2,
  Search,
  ShieldCheck,
} from 'lucide-react';
import type { Bill, PartSet, ShopState } from '../types/shop';
import {
  formatDateTimeDisplay,
  inspectXlsxWorkbook,
  isTodayBill,
  PART_SET_META,
} from '../utils/shopLogic';
import { Button, Card, Dialog, Input, Select } from './ui/primitives';

interface SalesAndBackupViewProps {
  mode: 'sales' | 'backup';
  state: ShopState;
  mongoConnected?: boolean;
  onInspectBill: (bill: Bill) => void;
  onDeleteBill: (billId: string) => Promise<void>;
  onExportBackup: (setFilter?: 'ALL' | PartSet) => void;
  onExportSalesCsv: () => void;
  onExportAllDuesCsv: () => void;
  onImportCsv: (
    csvText: string,
    targetSet?: PartSet,
    options?: { forceZeroCount?: boolean; replaceTargetSet?: boolean }
  ) => Promise<{ addedCount: number; updatedCount: number }>;
  onTriggerLoader?: () => void;
}

export const SalesAndBackupView: React.FC<SalesAndBackupViewProps> = ({
  mode,
  state,
  onInspectBill,
  onDeleteBill,
  onExportBackup,
  onExportSalesCsv,
  onExportAllDuesCsv,
  onImportCsv,
  onTriggerLoader,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [billStatusFilter, setBillStatusFilter] = useState<'ALL' | 'PAID' | 'PARTIAL_DUE'>('ALL');
  const [salesPage, setSalesPage] = useState(1);
  const [isLoadingMoreSales, setIsLoadingMoreSales] = useState(false);
  const [deletingBill, setDeletingBill] = useState<Bill | null>(null);
  const [deletingBillId, setDeletingBillId] = useState<string | null>(null);
  const [restoreText, setRestoreText] = useState('');
  const [restoreTargetSet, setRestoreTargetSet] = useState<PartSet>('kubota');
  const [restoreReplaceSet, setRestoreReplaceSet] = useState(true);
  const [restoreFileName, setRestoreFileName] = useState<string>('');
  const [restoreRowCount, setRestoreRowCount] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const SALES_PAGE_SIZE = 40;

  const validBills = state.bills;

  const todayBills = useMemo(
    () => validBills.filter((b) => isTodayBill(b.createdAt)),
    [validBills]
  );

  const todaySales = useMemo(
    () => todayBills.reduce((s, b) => s + b.netTotal, 0),
    [todayBills]
  );

  const totalActiveSales = useMemo(
    () => validBills.reduce((s, b) => s + b.netTotal, 0),
    [validBills]
  );

  const totalCollectedSales = useMemo(
    () => validBills.reduce((s, b) => s + b.paidAmount, 0),
    [validBills]
  );

  const totalPendingDuesFromBills = useMemo(
    () => validBills.reduce((s, b) => s + b.dueAmount, 0),
    [validBills]
  );

  const filteredBills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.bills.filter((b) => {
      if (billStatusFilter === 'PAID' && b.dueAmount > 0) return false;
      if (billStatusFilter === 'PARTIAL_DUE' && b.dueAmount === 0) return false;
      if (!q) return true;
      return (
        b.invoiceNumber.toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        b.customerPhone.toLowerCase().includes(q) ||
        b.customerVillage.toLowerCase().includes(q)
      );
    });
  }, [state.bills, searchQuery, billStatusFilter]);

  useEffect(() => {
    setSalesPage(1);
  }, [searchQuery, billStatusFilter]);

  const visibleBills = useMemo(
    () => filteredBills.slice(0, salesPage * SALES_PAGE_SIZE),
    [filteredBills, salesPage]
  );
  const hasMoreSales = visibleBills.length < filteredBills.length;

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingBill) return;
    setDeletingBillId(deletingBill.id);
    try {
      await onDeleteBill(deletingBill.id);
      setStatusMessage(
        `Deleted invoice ${deletingBill.invoiceNumber}. Stock quantities for ${deletingBill.items.length} part(s) have been restored.`
      );
      setDeletingBill(null);
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setDeletingBillId(null);
    }
  };

  const handleRestoreFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage('');
    setRestoreFileName(file.name);
    const isExcelBinary = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        if (isExcelBinary && ev.target?.result instanceof ArrayBuffer) {
          const wbInfo = inspectXlsxWorkbook(ev.target.result, file.name, true);
          const prefSheet = wbInfo.sheets[wbInfo.preferredSheetIndex];
          setRestoreText(prefSheet ? prefSheet.csvText : wbInfo.combinedCsvText);
          setRestoreRowCount(prefSheet ? prefSheet.rowCount : wbInfo.totalRowCount);
        } else {
          const text = String(ev.target?.result || '');
          setRestoreText(text);
          setRestoreRowCount(Math.max(0, text.trim().split(/\r?\n/).length - 1));
        }
      } catch (err) {
        setErrorMessage((err as Error).message);
      }
    };
    if (isExcelBinary) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!restoreText.trim()) {
      setErrorMessage('Please choose an Excel (.xlsx / .xls / .csv) file first.');
      return;
    }
    try {
      const res = await onImportCsv(restoreText, restoreTargetSet, {
        forceZeroCount: true,
        replaceTargetSet: restoreReplaceSet,
      });
      setStatusMessage(
        `Excel Import Complete (${PART_SET_META[restoreTargetSet].label}): ${
          restoreReplaceSet
            ? `Replaced dataset with ${res.addedCount} parts.`
            : `Merged ${res.addedCount} new parts and updated ${res.updatedCount} existing parts.`
        }`
      );
      setRestoreText('');
      setRestoreFileName('');
      setRestoreRowCount(0);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  if (mode === 'sales') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <p className="text-xs font-medium text-slate-500">
              All Customer Bills
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mt-1">
              Sales Register &amp; Revenue Analytics
            </h1>
          </div>
          <Button
            variant="outline"
            onClick={onExportSalesCsv}
            data-testid="export-sales-csv"
          >
            <Download className="w-4 h-4" />
            Export Sales Data (.xlsx)
          </Button>
        </div>

        {statusMessage && (
          <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 text-sm">
            <span className="inline-flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              {statusMessage}
            </span>
            <button
              type="button"
              onClick={() => setStatusMessage('')}
              className="text-xs font-semibold underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Accurate Transaction & Revenue Totals */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Card className="p-5">
            <div className="text-xs font-medium text-slate-500">Today&apos;s Sales Total</div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono tabular-nums mt-2">
              ₹{todaySales.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {todayBills.length} active bill(s) today
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs font-medium text-slate-500">
              Total Active Sales ({validBills.length} Bills)
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono tabular-nums mt-2">
              ₹{totalActiveSales.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              Collected: ₹{totalCollectedSales.toLocaleString('en-IN')} · Due: ₹
              {totalPendingDuesFromBills.toLocaleString('en-IN')}
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs font-medium text-slate-500">
              Total Cash / UPI Collected
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-emerald-700 font-mono tabular-nums mt-2">
              ₹{totalCollectedSales.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              100% reconciled with Pending Customer Dues
            </div>
          </Card>
        </div>

        {/* Search & Filter */}
        <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="search"
              placeholder="Search bills by invoice number, customer name, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['ALL', 'PAID', 'PARTIAL_DUE'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setBillStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  billStatusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'ALL'
                  ? 'All Bills'
                  : st === 'PAID'
                  ? 'Fully Paid'
                  : st === 'PARTIAL_DUE'
                  ? 'Partial / Due'
                  : 'Partial / Due'}
              </button>
            ))}
          </div>
        </Card>

        {/* Bills Table (Parts Sold column removed for clean UI on 10–30 part bills) */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50">
                  <th className="py-3 px-4 font-semibold">Invoice &amp; Date</th>
                  <th className="py-3 px-4 font-semibold">Customer</th>
                  <th className="py-3 px-4 font-semibold text-right">Final Price</th>
                  <th className="py-3 px-4 font-semibold text-right">Paid / Due</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {visibleBills.map((bill) => (
                  <tr
                    key={bill.id}
                    className="hover:bg-slate-50"
                  >
                    <td className="py-3 px-4">
                      <div className="font-mono text-xs font-bold text-slate-900">
                        {bill.invoiceNumber}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatDateTimeDisplay(bill.createdAt)} · {bill.items.length} Part(s)
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{bill.customerName}</div>
                      <div className="text-xs text-slate-500">
                        {bill.customerPhone} · {bill.customerVillage}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                      ₹{bill.netTotal.toLocaleString('en-IN')}
                      {bill.discountAmount > 0 && (
                        <div className="text-[11px] font-normal text-emerald-700">
                          Disc: -₹{bill.discountAmount.toLocaleString('en-IN')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      <div className="text-emerald-700 font-semibold">
                        Paid: ₹{bill.paidAmount.toLocaleString('en-IN')} ({bill.paymentMode})
                      </div>
                      {bill.dueAmount > 0 && (
                        <div className="text-amber-700 font-bold">
                          Due: ₹{bill.dueAmount.toLocaleString('en-IN')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onInspectBill(bill)}
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Print
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingBill(bill)}
                          disabled={deletingBillId === bill.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Manual Load Next 40 Sales Pagination Footer (Auto-Loading Disabled) */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs text-slate-600 font-mono tabular-nums">
              Loaded {visibleBills.length.toLocaleString('en-IN')} of{' '}
              {filteredBills.length.toLocaleString('en-IN')} sales bills
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMoreSales || isLoadingMoreSales}
              onClick={() => {
                if (!hasMoreSales || isLoadingMoreSales) return;
                setIsLoadingMoreSales(true);
                onTriggerLoader?.();
                window.setTimeout(() => {
                  setSalesPage((p) => p + 1);
                  setIsLoadingMoreSales(false);
                }, 360);
              }}
              data-testid="load-next-40-sales"
            >
              {isLoadingMoreSales ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-700 border-t-transparent animate-spin shrink-0" />
                  Loading Next {SALES_PAGE_SIZE}...
                </>
              ) : (
                `Load Next ${SALES_PAGE_SIZE} Sales`
              )}
            </Button>
          </div>
        </Card>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={Boolean(deletingBill)}
          onClose={() => {
            if (!deletingBillId) setDeletingBill(null);
          }}
          title={deletingBill ? `Delete Invoice · ${deletingBill.invoiceNumber}` : 'Delete Invoice'}
          description="This permanently deletes the bill, restores all sold quantities to inventory, removes its due record entries, and makes the invoice number available again."
        >
          <form onSubmit={handleConfirmDelete} className="space-y-4">
            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingBill(null)}
                disabled={Boolean(deletingBillId)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={Boolean(deletingBillId)}>
                {deletingBillId && <LoaderCircle className="w-4 h-4 animate-spin" />}
                {deletingBillId ? 'Deleting Bill...' : 'Delete Bill &amp; Restore Stock'}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    );
  }

  // BACKUP & 5-SET XLSX EXPORT VIEW (Local Setup Instructions Card Removed + Disaster Recovery XLSXs)
  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Offline Disaster Recovery · Export All 5 Parts Sets, Sales Invoices, and Customer Dues in Excel (.xlsx)
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mt-1">
            Backup &amp; 5-Set XLSX Export / Restore
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            onClick={onExportSalesCsv}
            data-testid="backup-export-sales-csv"
          >
            <Download className="w-4 h-4" />
            Export Sales Data (.xlsx)
          </Button>
          <Button
            variant="outline"
            onClick={onExportAllDuesCsv}
            data-testid="backup-export-dues-csv"
          >
            <Download className="w-4 h-4" />
            Download Dues (.xlsx)
          </Button>
          <Button variant="amber" onClick={() => onExportBackup('ALL')}>
            <Download className="w-4 h-4" />
            Download All Parts Backup (.xlsx)
          </Button>
        </div>
      </div>

      {/* 5 Separate Parts XLSX Download Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="text-xs font-bold text-amber-700 uppercase">Set 1 · Original</div>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">Kubota Original XLSX</h3>
            <p className="text-xs text-slate-500 mt-1">
              Part Number, Description, Rack No, Count, Selling Price
            </p>
          </div>
          <Button variant="outline" onClick={() => onExportBackup('kubota')} className="w-full">
            <Download className="w-4 h-4" />
            Export Kubota (.xlsx)
          </Button>
        </Card>

        <Card className="p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="text-xs font-bold text-amber-700 uppercase">Set 2 · Original</div>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">Yanmar Original XLSX</h3>
            <p className="text-xs text-slate-500 mt-1">
              Part Number, Description, Rack No, Count, Selling Price
            </p>
          </div>
          <Button variant="outline" onClick={() => onExportBackup('yanmar')} className="w-full">
            <Download className="w-4 h-4" />
            Export Yanmar (.xlsx)
          </Button>
        </Card>

        <Card className="p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="text-xs font-bold text-amber-700 uppercase">Set 3 · Original</div>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">GM Original XLSX</h3>
            <p className="text-xs text-slate-500 mt-1">
              Part Number, Description, Rack No, Count, Selling Price
            </p>
          </div>
          <Button variant="outline" onClick={() => onExportBackup('gm')} className="w-full">
            <Download className="w-4 h-4" />
            Export GM (.xlsx)
          </Button>
        </Card>

        <Card className="p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="text-xs font-bold text-slate-600 uppercase">Set 4 · Local Brands</div>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">Local Parts List XLSX</h3>
            <p className="text-xs text-slate-500 mt-1">
              Part Number, Description, Rack No, Count, Selling Price
            </p>
          </div>
          <Button variant="outline" onClick={() => onExportBackup('local')} className="w-full">
            <Download className="w-4 h-4" />
            Export Local List (.xlsx)
          </Button>
        </Card>

        <Card className="p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="text-xs font-bold text-slate-600 uppercase">Set 5 · No Part No.</div>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">Others (Hardware) XLSX</h3>
            <p className="text-xs text-slate-500 mt-1">
              Nut Bolt, Washer, Spring Washer, Gum, Spray, etc.
            </p>
          </div>
          <Button variant="outline" onClick={() => onExportBackup('others')} className="w-full">
            <Download className="w-4 h-4" />
            Export Others (.xlsx)
          </Button>
        </Card>
      </div>

      {statusMessage && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 text-sm">
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            {statusMessage}
          </span>
          <button
            type="button"
            onClick={() => setStatusMessage('')}
            className="text-xs font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Top Split: Snapshots & Excel Restore */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-6 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Automatic Daily &amp; Manual Backups
              </h2>
              <p className="text-xs text-slate-500">
                Every day at 06:00 AM, a snapshot is recorded across all 5 sets, sales, and customer dues.
              </p>
            </div>
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
          </div>

          <div className="divide-y divide-slate-200 border-t border-slate-200">
            {state.backups.map((bkp) => (
              <div key={bkp.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-slate-900">
                    {bkp.type === 'AUTO_DAILY' ? 'Daily Automatic Backup' : 'Manual XLSX Export'}
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    {formatDateTimeDisplay(bkp.createdAt)} · {bkp.triggeredBy}
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="font-bold text-slate-900">{bkp.partsCount} Parts</div>
                  <div className="text-slate-500">
                    Value: ₹{bkp.totalStockValue.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-6 p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Import Excel (.xlsx) to Dataset
            </h2>
            <p className="text-xs text-slate-500">
              Select your dataset, upload your Excel sheet, and choose Replace or Merge.
            </p>
          </div>

          <form onSubmit={handleRestoreSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Select Dataset
              </label>
              <Select
                value={restoreTargetSet}
                onChange={(e) => setRestoreTargetSet(e.target.value as PartSet)}
                className="w-full"
              >
                <option value="kubota">1. Kubota Original Parts</option>
                <option value="yanmar">2. Yanmar Original Parts</option>
                <option value="gm">3. GM Original Parts</option>
                <option value="local">4. Local Parts List</option>
                <option value="others">5. Others (No Part Number)</option>
              </Select>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">
                  Upload Excel Sheet (.xlsx / .xls / .csv)
                </div>
                <div className="text-[11px] text-slate-600 truncate">
                  {restoreFileName
                    ? `${restoreFileName} (${restoreRowCount.toLocaleString('en-IN')} items ready)`
                    : 'No Excel file selected yet'}
                </div>
              </div>
              <label className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100 shrink-0">
                Choose Excel File
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  onChange={handleRestoreFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer text-xs font-semibold transition-colors ${
                  restoreReplaceSet
                    ? 'border-amber-500 bg-amber-50/70 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={restoreReplaceSet}
                  onChange={() => setRestoreReplaceSet(true)}
                  className="rounded border-slate-300 text-amber-600"
                />
                Replace the data
              </label>

              <label
                className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer text-xs font-semibold transition-colors ${
                  !restoreReplaceSet
                    ? 'border-amber-500 bg-amber-50/70 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!restoreReplaceSet}
                  onChange={() => setRestoreReplaceSet(false)}
                  className="rounded border-slate-300 text-amber-600"
                />
                Merge the data
              </label>
            </div>

            <Button type="submit" variant="amber" className="w-full" disabled={!restoreText.trim()}>
              <FileUp className="w-4 h-4" />
              Import to Dataset
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};
