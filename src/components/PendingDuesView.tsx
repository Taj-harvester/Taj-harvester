/**
 * ============================================================================
 * TAJ HARVESTER — PENDING CUSTOMER DUES VIEW (src/components/PendingDuesView.tsx)
 * ============================================================================
 * Clean, strictly aligned customer credit ledger:
 * - No cluttered invoice list on cards
 * - Duplicate filter for same customer name or phone number
 * - Quick "+ Add Number" button whenever a customer's phone number is missing
 * - Clicking any customer transfers directly to the dedicated Customer Page
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  IndianRupee,
  Phone,
  Plus,
  Printer,
  Search,
  Upload,
  Wallet,
} from 'lucide-react';
import type { Bill, PaymentMode, PendingDue } from '../types/shop';
import {
  TAJ_HARVESTER_SHOP_INFO,
  formatDateShortDisplay,
  getDuplicateCustomerAnalysis,
  isCustomerPhoneMissing,
  normalizeCustomerNameForDupCheck,
  parseDuesFromXlsxBuffer,
} from '../utils/shopLogic';
import { triggerBrowserPrint } from './PrintableModals';
import { Badge, Button, Card, Dialog, Input, Select } from './ui/primitives';

interface PendingDuesViewProps {
  dues: PendingDue[];
  bills: Bill[];
  onRecordPayment: (
    dueId: string,
    amount: number,
    paymentMode: PaymentMode,
    note: string
  ) => Promise<void>;
  onUpdateCustomer?: (
    dueId: string,
    payload: {
      customerName: string;
      customerPhone: string;
      customerVillage: string;
    }
  ) => Promise<void>;
  onOpenCustomerPage?: (dueId: string) => void;
  onImportDues?: (
    records: Omit<PendingDue, 'id'>[],
    replaceAll: boolean
  ) => Promise<void>;
  onExportAllDuesCsv: () => void;
  onExportCustomerLedgerCsv: (due: PendingDue) => void;
  onInspectBill?: (bill: Bill) => void;
  onTriggerLoader?: () => void;
}

export const PendingDuesView: React.FC<PendingDuesViewProps> = ({
  dues,
  onRecordPayment,
  onUpdateCustomer,
  onOpenCustomerPage,
  onImportDues,
  onExportAllDuesCsv,
  onTriggerLoader,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ACTIVE_DUE' | 'DUPLICATES' | 'MISSING_PHONE' | 'SETTLED' | 'ALL'
  >('ACTIVE_DUE');
  const [duesPage, setDuesPage] = useState(1);
  const [isLoadingMoreDues, setIsLoadingMoreDues] = useState(false);
  const [selectedDue, setSelectedDue] = useState<PendingDue | null>(null);
  const [isPrintDatasheetOpen, setIsPrintDatasheetOpen] = useState(false);

  // Quick Add Phone / Edit Customer Modal
  const [quickEditDue, setQuickEditDue] = useState<PendingDue | null>(null);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickVillage, setQuickVillage] = useState('');
  const [isSavingQuickEdit, setIsSavingQuickEdit] = useState(false);

  // Import Dues Modal
  const [isImportDuesModalOpen, setIsImportDuesModalOpen] = useState(false);
  const [importDuesMode, setImportDuesMode] = useState<'REPLACE' | 'MERGE'>('MERGE');
  const [pendingDuesRecords, setPendingDuesRecords] = useState<Omit<PendingDue, 'id'>[]>([]);
  const [selectedFilesLabel, setSelectedFilesLabel] = useState('');
  const [isImportingDues, setIsImportingDues] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [paymentNote, setPaymentNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const DUES_PAGE_SIZE = 40;

  const duplicateMap = useMemo(() => getDuplicateCustomerAnalysis(dues), [dues]);

  const filteredDues = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = dues.filter((d) => {
      if (statusFilter === 'ACTIVE_DUE' && d.balanceDue <= 0) return false;
      if (statusFilter === 'SETTLED' && d.balanceDue > 0) return false;
      if (statusFilter === 'DUPLICATES' && !duplicateMap.has(d.id)) return false;
      if (statusFilter === 'MISSING_PHONE' && !isCustomerPhoneMissing(d.customerPhone)) {
        return false;
      }
      if (!q) return true;
      return (
        d.customerName.toLowerCase().includes(q) ||
        d.customerPhone.toLowerCase().includes(q) ||
        d.customerVillage.toLowerCase().includes(q)
      );
    });

    if (statusFilter === 'DUPLICATES') {
      return [...list].sort((a, b) =>
        normalizeCustomerNameForDupCheck(a.customerName).localeCompare(
          normalizeCustomerNameForDupCheck(b.customerName)
        )
      );
    }
    return list;
  }, [dues, searchQuery, statusFilter, duplicateMap]);

  useEffect(() => {
    setDuesPage(1);
  }, [searchQuery, statusFilter]);

  const visibleDues = useMemo(
    () => filteredDues.slice(0, duesPage * DUES_PAGE_SIZE),
    [filteredDues, duesPage]
  );
  const hasMoreDues = visibleDues.length < filteredDues.length;

  const activeDuesForDatasheet = useMemo(
    () => dues.filter((d) => d.balanceDue > 0),
    [dues]
  );

  const totalOutstandingBalance = useMemo(
    () => activeDuesForDatasheet.reduce((sum, d) => sum + d.balanceDue, 0),
    [activeDuesForDatasheet]
  );

  const openPaymentModal = (due: PendingDue) => {
    setErrorMsg('');
    setSelectedDue(due);
    setPaymentAmount(String(due.balanceDue));
    setPaymentMode('CASH');
    setPaymentNote('');
  };

  const openQuickPhoneModal = (due: PendingDue) => {
    setErrorMsg('');
    setQuickEditDue(due);
    setQuickName(due.customerName);
    setQuickPhone(isCustomerPhoneMissing(due.customerPhone) ? '' : due.customerPhone);
    setQuickVillage(
      !due.customerVillage || /^copy$/i.test(due.customerVillage)
        ? 'Local'
        : due.customerVillage
    );
  };

  const handleSaveQuickPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEditDue || !onUpdateCustomer) return;
    setErrorMsg('');
    setIsSavingQuickEdit(true);
    try {
      await onUpdateCustomer(quickEditDue.id, {
        customerName: quickName.trim(),
        customerPhone: quickPhone.trim() || '—',
        customerVillage: quickVillage.trim() || 'Local',
      });
      setSuccessMsg(`Saved details for ${quickName.trim()}.`);
      setQuickEditDue(null);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSavingQuickEdit(false);
    }
  };

  const handleOpenAndPrintDatasheet = () => {
    setIsPrintDatasheetOpen(true);
    window.setTimeout(() => {
      triggerBrowserPrint('Taj Harvester — Pending Dues Datasheet');
    }, 150);
  };

  const handleDuesFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setErrorMsg('');
    try {
      const allExtracted: Omit<PendingDue, 'id'>[] = [];
      for (const file of files) {
        const buffer = new Uint8Array(await file.arrayBuffer());
        const extracted = parseDuesFromXlsxBuffer(buffer, file.name);
        allExtracted.push(...extracted);
      }
      setSelectedFilesLabel(
        files.length === 1 ? files[0].name : `${files.length} files selected`
      );
      setPendingDuesRecords(allExtracted);
      if (allExtracted.length === 0) {
        setErrorMsg('No customer due rows found in the selected Excel file(s).');
      }
    } catch (err) {
      setErrorMsg((err as Error).message || 'Could not read Excel file.');
    }
  };

  const handleConfirmDuesImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onImportDues || pendingDuesRecords.length === 0) {
      setErrorMsg('Please select at least one valid Excel (.xlsx) file to import.');
      return;
    }
    setErrorMsg('');
    setIsImportingDues(true);
    try {
      const replaceAll = importDuesMode === 'REPLACE';
      await onImportDues(pendingDuesRecords, replaceAll);
      setSuccessMsg(
        `${replaceAll ? 'Replaced' : 'Merged'} ${pendingDuesRecords.length} customer due record(s) from ${selectedFilesLabel}.`
      );
      setIsImportDuesModalOpen(false);
      setPendingDuesRecords([]);
      setSelectedFilesLabel('');
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsImportingDues(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDue) return;
    setErrorMsg('');

    const numAmt = Number(paymentAmount);
    if (!numAmt || numAmt <= 0) {
      setErrorMsg('Enter a valid positive payment amount.');
      return;
    }

    try {
      await onRecordPayment(selectedDue.id, numAmt, paymentMode, paymentNote);
      setSuccessMsg(
        `Recorded ₹${numAmt.toLocaleString('en-IN')} (${paymentMode}) from ${selectedDue.customerName}.`
      );
      setSelectedDue(null);
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const renderDueDatasheetTable = () => (
    <div className="print-invoice-sheet bg-white border border-slate-300 rounded-xl p-5 sm:p-6 print:p-6 space-y-4 text-slate-900">
      <div className="flex flex-row items-start justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-slate-900 font-display uppercase">
            {TAJ_HARVESTER_SHOP_INFO.name} — DUE DATASHEET
          </h3>
          <p className="text-xs font-semibold text-slate-700 mt-1">
            Address: {TAJ_HARVESTER_SHOP_INFO.address} · Ph: {TAJ_HARVESTER_SHOP_INFO.phone}
          </p>
        </div>
        <div className="text-right font-mono text-xs space-y-0.5 shrink-0">
          <div className="font-bold text-slate-900">
            Date: {formatDateShortDisplay(new Date().toISOString())}
          </div>
          <div className="font-bold text-amber-800">
            Total Due: ₹{totalOutstandingBalance.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
        <thead>
          <tr className="border-y border-slate-400 bg-slate-100 text-slate-900 font-bold">
            <th className="border border-slate-300 py-2 px-3 w-12 text-center">#</th>
            <th className="border border-slate-300 py-2 px-3 font-sans">Customer Name</th>
            <th className="border border-slate-300 py-2 px-3">Phone</th>
            <th className="border border-slate-300 py-2 px-3 text-right">Due</th>
          </tr>
        </thead>
        <tbody>
          {activeDuesForDatasheet.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="border border-slate-300 py-6 px-3 text-center font-sans text-slate-500"
              >
                No pending customer dues.
              </td>
            </tr>
          ) : (
            activeDuesForDatasheet.map((due, idx) => (
              <tr key={due.id} className="border-b border-slate-200">
                <td className="border border-slate-300 py-2 px-3 text-center text-slate-600">
                  {idx + 1}
                </td>
                <td className="border border-slate-300 py-2 px-3 font-sans font-bold text-slate-900">
                  {due.customerName}
                </td>
                <td className="border border-slate-300 py-2 px-3 text-slate-800">
                  {isCustomerPhoneMissing(due.customerPhone) ? '—' : due.customerPhone}
                </td>
                <td className="border border-slate-300 py-2 px-3 text-right font-bold text-amber-800">
                  ₹{due.balanceDue.toLocaleString('en-IN')}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100 font-bold text-slate-900">
            <td
              colSpan={3}
              className="border border-slate-300 py-2.5 px-3 text-right uppercase font-sans text-xs"
            >
              Total Due
            </td>
            <td
              className="border border-slate-300 py-2.5 px-3 text-right text-sm text-amber-900"
              data-testid="datasheet-total-due"
            >
              ₹{totalOutstandingBalance.toLocaleString('en-IN')}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Aligned Top Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Click any Customer Name to open their Customer Profile &amp; Transaction History page
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mt-0.5">
            Pending Customer Dues
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3 mr-1">
            <span className="text-xs font-semibold text-amber-900">Total Unpaid Balance</span>
            <span
              className="text-xl font-bold text-amber-800 font-mono tabular-nums"
              data-testid="dues-total-balance"
            >
              ₹{totalOutstandingBalance.toLocaleString('en-IN')}
            </span>
          </div>

          <Button
            variant="amber"
            onClick={handleOpenAndPrintDatasheet}
            data-testid="print-dues-datasheet-btn"
          >
            <Printer className="w-4 h-4" />
            Print Due Datasheet
          </Button>

          {onImportDues && (
            <Button
              variant="outline"
              onClick={() => {
                setErrorMsg('');
                setPendingDuesRecords([]);
                setSelectedFilesLabel('');
                setIsImportDuesModalOpen(true);
              }}
              data-testid="open-import-dues-btn"
            >
              <Upload className="w-4 h-4" />
              Import Dues (.xlsx)
            </Button>
          )}

          <Button
            variant="outline"
            onClick={onExportAllDuesCsv}
            data-testid="export-all-dues-csv"
          >
            <Download className="w-4 h-4" />
            Download Dues (.xlsx)
          </Button>
        </div>
      </div>

      {successMsg && (
        <div
          role="status"
          className="flex items-center justify-between px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 text-sm"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            {successMsg}
          </span>
          <button
            type="button"
            onClick={() => setSuccessMsg('')}
            className="text-xs font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Filter Bar (Includes Duplicate Name / Phone Filter & Missing Phone Filter) */}
      <Card className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="search"
            placeholder="Search customer name, phone, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setStatusFilter('ACTIVE_DUE')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              statusFilter === 'ACTIVE_DUE'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active Dues ({dues.filter((d) => d.balanceDue > 0).length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('DUPLICATES')}
            data-testid="dues-filter-duplicates"
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer inline-flex items-center gap-1 ${
              statusFilter === 'DUPLICATES'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-800 hover:text-amber-950'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Duplicates ({duplicateMap.size})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('MISSING_PHONE')}
            data-testid="dues-filter-missing-phone"
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              statusFilter === 'MISSING_PHONE'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            No Phone ({dues.filter((d) => isCustomerPhoneMissing(d.customerPhone)).length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('SETTLED')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              statusFilter === 'SETTLED'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Settled ({dues.filter((d) => d.balanceDue === 0).length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({dues.length})
          </button>
        </div>
      </Card>

      {/* Strictly Aligned Customer Dues Table (No Invoice No clutter) */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Customer Name</th>
                <th className="py-3.5 px-4">Phone Number</th>
                <th className="py-3.5 px-4 text-right">Total Billed</th>
                <th className="py-3.5 px-4 text-right">Total Paid</th>
                <th className="py-3.5 px-4 text-right">Remaining Due</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visibleDues.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                    No customer dues match the current filter.
                  </td>
                </tr>
              ) : (
                visibleDues.map((due) => {
                  const dupInfo = duplicateMap.get(due.id);
                  const phoneMissing = isCustomerPhoneMissing(due.customerPhone);

                  return (
                    <tr
                      key={due.id}
                      className="hover:bg-slate-50/80 transition-colors align-middle"
                    >
                      {/* Customer Name (Click transfers to Customer Page) */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenCustomerPage?.(due.id)}
                            className="text-sm font-bold text-slate-900 hover:text-amber-700 hover:underline text-left cursor-pointer transition-colors"
                            title="Click to open Customer Profile & Transactions"
                            data-testid={`customer-name-link-${due.id}`}
                          >
                            {due.customerName}
                          </button>
                          {dupInfo && (
                            <Badge variant="red">{dupInfo.reason}</Badge>
                          )}
                        </div>
                      </td>

                      {/* Phone Number OR "+ Add Number" Button */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {phoneMissing ? (
                          <button
                            type="button"
                            onClick={() => openQuickPhoneModal(due)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 text-xs font-semibold cursor-pointer transition-colors"
                            data-testid={`add-phone-btn-${due.id}`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Number
                          </button>
                        ) : (
                          <span className="font-mono font-semibold text-slate-800 inline-flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {due.customerPhone}
                          </span>
                        )}
                      </td>

                      {/* Total Billed */}
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-sm font-semibold text-slate-900 whitespace-nowrap">
                        ₹{due.totalBilled.toLocaleString('en-IN')}
                      </td>

                      {/* Total Paid */}
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-sm font-semibold text-emerald-700 whitespace-nowrap">
                        ₹{due.totalPaid.toLocaleString('en-IN')}
                      </td>

                      {/* Remaining Due */}
                      <td
                        className={`py-3.5 px-4 text-right font-mono tabular-nums text-base font-bold whitespace-nowrap ${
                          due.balanceDue > 0 ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        ₹{due.balanceDue.toLocaleString('en-IN')}
                      </td>

                      {/* Aligned Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          {due.balanceDue > 0 ? (
                            <Button
                              variant="amber"
                              size="sm"
                              onClick={() => openPaymentModal(due)}
                              aria-label={`Record payment for ${due.customerName}`}
                            >
                              <Wallet className="w-3.5 h-3.5" />
                              Record Payment
                            </Button>
                          ) : (
                            <span className="text-xs font-semibold text-emerald-700 px-2">
                              Settled
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Manual Load Next 40 Customer Dues Pagination Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-slate-600 font-mono tabular-nums">
            Loaded {visibleDues.length.toLocaleString('en-IN')} of{' '}
            {filteredDues.length.toLocaleString('en-IN')} customer dues
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMoreDues || isLoadingMoreDues}
            onClick={() => {
              if (!hasMoreDues || isLoadingMoreDues) return;
              setIsLoadingMoreDues(true);
              onTriggerLoader?.();
              window.setTimeout(() => {
                setDuesPage((p) => p + 1);
                setIsLoadingMoreDues(false);
              }, 360);
            }}
            data-testid="load-next-40-dues"
          >
            {isLoadingMoreDues ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-700 border-t-transparent animate-spin shrink-0" />
                Loading Next {DUES_PAGE_SIZE}...
              </>
            ) : (
              `Load Next ${DUES_PAGE_SIZE} Customer Dues`
            )}
          </Button>
        </div>
      </Card>

      {/* Quick Add Phone / Edit Customer Modal */}
      <Dialog
        open={Boolean(quickEditDue)}
        onClose={() => setQuickEditDue(null)}
        title={
          quickEditDue
            ? `Update Customer · ${quickEditDue.customerName}`
            : 'Update Customer'
        }
      >
        {quickEditDue && (
          <form onSubmit={handleSaveQuickPhone} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
                {errorMsg}
              </div>
            )}

            <div>
              <label
                htmlFor="quick-edit-name"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Customer Name *
              </label>
              <Input
                id="quick-edit-name"
                required
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
              />
            </div>

            <div>
              <label
                htmlFor="quick-edit-phone"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Phone Number *
              </label>
              <Input
                id="quick-edit-phone"
                type="tel"
                autoFocus
                value={quickPhone}
                onChange={(e) => setQuickPhone(e.target.value)}
                placeholder="Enter 10-digit phone number"
                className="font-mono font-bold"
              />
            </div>

            <div>
              <label
                htmlFor="quick-edit-village"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Address / Village
              </label>
              <Input
                id="quick-edit-village"
                value={quickVillage}
                onChange={(e) => setQuickVillage(e.target.value)}
                placeholder="e.g. Pandua, Hooghly"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setQuickEditDue(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="amber"
                disabled={isSavingQuickEdit}
                data-testid="save-quick-phone-btn"
              >
                {isSavingQuickEdit ? 'Saving...' : 'Save Customer'}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Printable Due Datasheet Modal */}
      <Dialog
        open={isPrintDatasheetOpen}
        onClose={() => setIsPrintDatasheetOpen(false)}
        title="Pending Dues Datasheet"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4 text-slate-900" data-testid="printable-dues-datasheet-modal">
          {renderDueDatasheetTable()}

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3 no-print">
            <Button variant="outline" onClick={() => setIsPrintDatasheetOpen(false)}>
              Close
            </Button>
            <Button
              variant="amber"
              onClick={() => triggerBrowserPrint('Taj Harvester — Pending Dues Datasheet')}
            >
              <Printer className="w-4 h-4" />
              Print Due Datasheet
            </Button>
          </div>
        </div>
      </Dialog>

      {isPrintDatasheetOpen && (
        <div className="print-only-root" aria-hidden="true">
          {renderDueDatasheetTable()}
        </div>
      )}

      {/* Record Payment Dialog (Cash & UPI only) */}
      <Dialog
        open={Boolean(selectedDue)}
        onClose={() => setSelectedDue(null)}
        title={selectedDue ? `Record Payment · ${selectedDue.customerName}` : 'Record Payment'}
      >
        {selectedDue && (
          <form onSubmit={handlePaymentSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-600">Current Balance Due</span>
              <span className="text-base font-bold text-amber-700 font-mono tabular-nums">
                ₹{selectedDue.balanceDue.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="due-payment-amount"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Amount Received (₹) *
                </label>
                <Input
                  id="due-payment-amount"
                  type="number"
                  min="1"
                  max={selectedDue.balanceDue}
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="font-mono tabular-nums font-bold"
                />
              </div>
              <div>
                <label
                  htmlFor="due-payment-mode"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Payment Mode (Cash / UPI)
                </label>
                <Select
                  id="due-payment-mode"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className="w-full"
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                </Select>
              </div>
            </div>

            <div>
              <label
                htmlFor="due-payment-note"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Receipt Voucher No / Note (Optional)
              </label>
              <Input
                id="due-payment-note"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="e.g. Receipt Voucher #01 or note"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setSelectedDue(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="amber">
                <IndianRupee className="w-4 h-4" />
                Save Payment
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Simple Import Customer Dues (.xlsx) Modal */}
      <Dialog
        open={isImportDuesModalOpen}
        onClose={() => setIsImportDuesModalOpen(false)}
        title="Import Customer Dues (.xlsx)"
      >
        <form onSubmit={handleConfirmDuesImport} className="space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              {errorMsg}
            </div>
          )}

          <div>
            <label
              htmlFor="dues-xlsx-upload-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Upload Excel Sheet (.xlsx) — Select 1 or Multiple Customer Credit Reports
            </label>
            <input
              id="dues-xlsx-upload-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              onChange={handleDuesFilesUpload}
              className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-semibold file:bg-slate-50 file:text-slate-800 hover:file:bg-slate-100 file:cursor-pointer"
            />
            {pendingDuesRecords.length > 0 && (
              <p className="text-xs font-semibold text-emerald-700 mt-1.5 font-mono">
                Ready to import {pendingDuesRecords.length} customer due sheet(s) ({selectedFilesLabel})
              </p>
            )}
          </div>

          {/* Two Checkboxes: Replace the data or Merge the data */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={importDuesMode === 'REPLACE'}
                onChange={() => setImportDuesMode('REPLACE')}
                className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                data-testid="dues-import-replace-checkbox"
              />
              <span>Replace the data (Clear old dues and add all items from Excel)</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={importDuesMode === 'MERGE'}
                onChange={() => setImportDuesMode('MERGE')}
                className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                data-testid="dues-import-merge-checkbox"
              />
              <span>Merge the data (Update existing customer dues and add new ones)</span>
            </label>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsImportDuesModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="amber"
              disabled={pendingDuesRecords.length === 0 || isImportingDues}
              data-testid="confirm-import-dues-btn"
            >
              <Upload className="w-4 h-4" />
              {isImportingDues ? 'Importing...' : 'Import Dues'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
