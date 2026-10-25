/**
 * ============================================================================
 * TAJ HARVESTER — CUSTOMERS & TRANSACTION HISTORY VIEW (src/components/CustomersView.tsx)
 * ============================================================================
 * Dedicated Customer Profile, Edit (Name, Phone Number, Address), Duplicate Finder,
 * and Full-Page Side-by-Side Transaction Ledger & Payment History.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  IndianRupee,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import type { Bill, PaymentMode, PendingDue } from '../types/shop';
import {
  buildCustomerLedgerSheetData,
  formatDateShortDisplay,
  getDuplicateCustomerAnalysis,
  isCustomerPhoneMissing,
  normalizeCustomerNameForDupCheck,
} from '../utils/shopLogic';
import { Badge, Button, Card, Dialog, Input, Select } from './ui/primitives';

interface CustomersViewProps {
  dues: PendingDue[];
  bills: Bill[];
  selectedCustomerId: string | null;
  onSelectCustomer: (customerId: string | null) => void;
  onBackToDues: () => void;
  onUpdateCustomer: (
    dueId: string,
    payload: {
      customerName: string;
      customerPhone: string;
      customerVillage: string;
    }
  ) => Promise<void>;
  onDeleteCustomer: (dueId: string) => Promise<void>;
  onRecordPayment: (
    dueId: string,
    amount: number,
    paymentMode: PaymentMode,
    note: string
  ) => Promise<void>;
  onExportCustomerLedgerCsv: (due: PendingDue) => void;
  onInspectBill?: (bill: Bill) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  dues,
  bills,
  selectedCustomerId,
  onSelectCustomer,
  onBackToDues,
  onUpdateCustomer,
  onDeleteCustomer,
  onRecordPayment,
  onExportCustomerLedgerCsv,
  onInspectBill,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [directoryFilter, setDirectoryFilter] = useState<
    'ALL' | 'ACTIVE_DUE' | 'DUPLICATES' | 'MISSING_PHONE'
  >('ALL');
  const [directoryPage, setDirectoryPage] = useState(1);

  // Edit Customer Modal state
  const [editingCustomer, setEditingCustomer] = useState<PendingDue | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editVillage, setEditVillage] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Record Payment Modal state
  const [paymentTargetDue, setPaymentTargetDue] = useState<PendingDue | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [paymentNote, setPaymentNote] = useState('');

  // Delete confirmation state
  const [deletingCustomer, setDeletingCustomer] = useState<PendingDue | null>(null);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const PAGE_SIZE = 40;

  const duplicateMap = useMemo(() => getDuplicateCustomerAnalysis(dues), [dues]);

  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? dues.find((d) => d.id === selectedCustomerId) || null : null),
    [dues, selectedCustomerId]
  );

  const selectedSheetData = useMemo(
    () =>
      selectedCustomer ? buildCustomerLedgerSheetData(selectedCustomer, bills) : null,
    [selectedCustomer, bills]
  );

  // Find other records that are duplicates of the currently selected customer
  const relatedDuplicates = useMemo(() => {
    if (!selectedCustomer) return [];
    const normName = normalizeCustomerNameForDupCheck(selectedCustomer.customerName);
    const digits = !isCustomerPhoneMissing(selectedCustomer.customerPhone)
      ? selectedCustomer.customerPhone.replace(/\D/g, '')
      : '';
    return dues.filter((d) => {
      if (d.id === selectedCustomer.id) return false;
      const dName = normalizeCustomerNameForDupCheck(d.customerName);
      const dDigits = !isCustomerPhoneMissing(d.customerPhone)
        ? d.customerPhone.replace(/\D/g, '')
        : '';
      return (
        (normName.length >= 2 && dName === normName) ||
        (digits.length >= 6 && dDigits === digits)
      );
    });
  }, [dues, selectedCustomer]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = dues.filter((d) => {
      if (directoryFilter === 'ACTIVE_DUE' && d.balanceDue <= 0) return false;
      if (directoryFilter === 'DUPLICATES' && !duplicateMap.has(d.id)) return false;
      if (directoryFilter === 'MISSING_PHONE' && !isCustomerPhoneMissing(d.customerPhone)) {
        return false;
      }
      if (!q) return true;
      return (
        d.customerName.toLowerCase().includes(q) ||
        d.customerPhone.toLowerCase().includes(q) ||
        d.customerVillage.toLowerCase().includes(q)
      );
    });

    if (directoryFilter === 'DUPLICATES') {
      return [...list].sort((a, b) =>
        normalizeCustomerNameForDupCheck(a.customerName).localeCompare(
          normalizeCustomerNameForDupCheck(b.customerName)
        )
      );
    }
    return list;
  }, [dues, searchQuery, directoryFilter, duplicateMap]);

  useEffect(() => {
    setDirectoryPage(1);
  }, [searchQuery, directoryFilter]);

  const visibleCustomers = useMemo(
    () => filteredCustomers.slice(0, directoryPage * PAGE_SIZE),
    [filteredCustomers, directoryPage]
  );
  const hasMoreCustomers = visibleCustomers.length < filteredCustomers.length;

  const openEditModal = (due: PendingDue) => {
    setErrorMsg('');
    setEditingCustomer(due);
    setEditName(due.customerName);
    setEditPhone(isCustomerPhoneMissing(due.customerPhone) ? '' : due.customerPhone);
    setEditVillage(
      !due.customerVillage || /^copy$/i.test(due.customerVillage)
        ? 'Local'
        : due.customerVillage
    );
  };

  const handleSaveCustomerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setErrorMsg('');
    setIsSavingEdit(true);
    try {
      await onUpdateCustomer(editingCustomer.id, {
        customerName: editName.trim(),
        customerPhone: editPhone.trim() || '—',
        customerVillage: editVillage.trim() || 'Local',
      });
      setSuccessMsg(`Updated details for ${editName.trim()}.`);
      setEditingCustomer(null);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openPaymentModal = (due: PendingDue) => {
    setErrorMsg('');
    setPaymentTargetDue(due);
    setPaymentAmount(due.balanceDue > 0 ? String(due.balanceDue) : '');
    setPaymentMode('CASH');
    setPaymentNote('');
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTargetDue) return;
    setErrorMsg('');
    const numAmt = Number(paymentAmount);
    if (!numAmt || numAmt <= 0) {
      setErrorMsg('Enter a valid positive payment amount.');
      return;
    }
    try {
      await onRecordPayment(paymentTargetDue.id, numAmt, paymentMode, paymentNote);
      setSuccessMsg(
        `Recorded ₹${numAmt.toLocaleString('en-IN')} (${paymentMode}) from ${paymentTargetDue.customerName}.`
      );
      setPaymentTargetDue(null);
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingCustomer) return;
    const removedName = deletingCustomer.customerName;
    const removedId = deletingCustomer.id;
    try {
      await onDeleteCustomer(removedId);
      setDeletingCustomer(null);
      if (selectedCustomerId === removedId) {
        onSelectCustomer(null);
      }
      setSuccessMsg(`Removed customer record "${removedName}".`);
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const ledgerRowCount = selectedSheetData
    ? Math.max(selectedSheetData.billRows.length, selectedSheetData.receiptRows.length, 1)
    : 1;

  return (
    <div className="space-y-6" data-testid="customers-view">
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

      {/* ===================================================================
          MODE 1: SELECTED CUSTOMER PROFILE, EDIT & FULL TRANSACTION SHEET
          =================================================================== */}
      {selectedCustomer && selectedSheetData ? (
        <div className="space-y-6" data-testid="customer-detail-page">
          {/* Top Navigation Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={onBackToDues}
                data-testid="back-to-dues-btn"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Pending Dues
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onSelectCustomer(null)}
                data-testid="all-customers-directory-btn"
              >
                <Users className="w-4 h-4" />
                All Customers ({dues.length})
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditModal(selectedCustomer)}
                data-testid="edit-customer-details-btn"
              >
                <Edit3 className="w-4 h-4" />
                Edit Name / Phone
              </Button>

              {selectedCustomer.balanceDue > 0 && (
                <Button
                  variant="amber"
                  size="sm"
                  onClick={() => openPaymentModal(selectedCustomer)}
                  data-testid="customer-record-payment-btn"
                >
                  <Wallet className="w-4 h-4" />
                  Record Payment
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => onExportCustomerLedgerCsv(selectedCustomer)}
                data-testid="download-customer-ledger-csv"
              >
                <Download className="w-4 h-4" />
                Download Ledger (.xlsx)
              </Button>

              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeletingCustomer(selectedCustomer)}
                title="Delete duplicate or unwanted customer record"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </div>
          </div>

          {/* Customer Profile & Financial Summary Card */}
          <Card className="p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                    {selectedCustomer.customerName}
                  </h1>
                  {selectedCustomer.balanceDue > 0 ? (
                    <Badge variant="amber">ACTIVE DUE</Badge>
                  ) : (
                    <Badge variant="emerald">SETTLED</Badge>
                  )}
                  {duplicateMap.has(selectedCustomer.id) && (
                    <Badge variant="red">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Duplicate ({duplicateMap.get(selectedCustomer.id)?.reason})
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700 pt-1">
                  {/* Phone Number or + Add Number button */}
                  <div className="inline-flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500">Phone:</span>
                    {isCustomerPhoneMissing(selectedCustomer.customerPhone) ? (
                      <button
                        type="button"
                        onClick={() => openEditModal(selectedCustomer)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 text-xs font-semibold cursor-pointer transition-colors"
                        data-testid="detail-add-phone-btn"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Phone Number
                      </button>
                    ) : (
                      <span className="font-mono font-bold text-slate-900">
                        {selectedCustomer.customerPhone}
                      </span>
                    )}
                  </div>

                  <span className="text-slate-300">|</span>

                  {/* Village / Address */}
                  <div className="inline-flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500">Address:</span>
                    <span className="font-semibold text-slate-800">
                      {!selectedCustomer.customerVillage ||
                      /^copy$/i.test(selectedCustomer.customerVillage)
                        ? 'Local'
                        : selectedCustomer.customerVillage}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3 Aligned KPI Boxes */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4 shrink-0">
                <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-right font-mono tabular-nums">
                  <div className="text-[11px] font-sans font-medium text-slate-500">
                    Total Billed
                  </div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">
                    ₹{selectedCustomer.totalBilled.toLocaleString('en-IN')}
                  </div>
                </div>

                <div className="px-4 py-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-right font-mono tabular-nums">
                  <div className="text-[11px] font-sans font-medium text-emerald-800">
                    Total Paid
                  </div>
                  <div className="text-lg font-bold text-emerald-700 mt-0.5">
                    ₹{selectedCustomer.totalPaid.toLocaleString('en-IN')}
                  </div>
                </div>

                <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-right font-mono tabular-nums">
                  <div className="text-[11px] font-sans font-medium text-amber-900">
                    Remaining Due
                  </div>
                  <div className="text-xl font-bold text-amber-800 mt-0.5">
                    ₹{selectedCustomer.balanceDue.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            </div>

            {/* If related duplicates exist, show a quick switcher bar */}
            {relatedDuplicates.length > 0 && (
              <div className="p-3.5 rounded-lg bg-amber-50/80 border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-amber-950 font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Found {relatedDuplicates.length} other customer record(s) with the same name or phone number:
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {relatedDuplicates.map((dup) => (
                    <button
                      key={dup.id}
                      type="button"
                      onClick={() => onSelectCustomer(dup.id)}
                      className="px-2.5 py-1 rounded-md bg-white border border-amber-300 text-slate-900 font-semibold hover:bg-amber-100 cursor-pointer"
                    >
                      {dup.customerName} (Due: ₹{dup.balanceDue.toLocaleString('en-IN')})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Full-Page Side-by-Side Customer Transaction Sheet */}
          <Card className="p-6 space-y-4" data-testid="customer-ledger-sheet">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Customer Transaction Sheet (Bills &amp; Payments)
                </h2>
                <p className="text-xs text-slate-500">
                  Side-by-side record of credit bills and receipt voucher payments
                </p>
              </div>
              <div className="text-xs font-mono text-slate-600">
                Last Updated: {formatDateShortDisplay(selectedCustomer.lastUpdated)}
              </div>
            </div>

            <div className="border border-slate-300 rounded-lg bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs font-mono tabular-nums">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 font-bold text-center">
                      <th className="border border-slate-300 py-2.5 px-3 uppercase">
                        BILL NO
                      </th>
                      <th className="border border-slate-300 py-2.5 px-3 uppercase">
                        DATE
                      </th>
                      <th className="border border-slate-300 py-2.5 px-3 uppercase">
                        DUE AMOUNT
                      </th>
                      <th className="border border-slate-300 py-2.5 px-3 uppercase">
                        DATE
                      </th>
                      <th className="border border-slate-300 py-2.5 px-3 uppercase">
                        RECEIPT / NOTE
                      </th>
                      <th className="border border-slate-300 py-2.5 px-3 uppercase">
                        PAID AMOUNT
                      </th>
                      <th className="border border-slate-300 py-2.5 px-4 uppercase">
                        BALANCE DUE
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: ledgerRowCount }).map((_, rowIdx) => {
                      const bRow = selectedSheetData.billRows[rowIdx];
                      const rRow = selectedSheetData.receiptRows[rowIdx];
                      const matchedBillObj = bRow
                        ? bills.find(
                            (b) => b.id === bRow.billId || b.invoiceNumber === bRow.billNo
                          )
                        : undefined;

                      return (
                        <tr key={rowIdx} className="hover:bg-slate-50/70">
                          <td className="border border-slate-300 py-2.5 px-3 text-center font-bold text-slate-900 whitespace-nowrap">
                            {bRow ? (
                              matchedBillObj && onInspectBill ? (
                                <button
                                  type="button"
                                  onClick={() => onInspectBill(matchedBillObj)}
                                  className="text-slate-900 hover:text-amber-700 underline cursor-pointer"
                                >
                                  {bRow.billNo}
                                </button>
                              ) : (
                                bRow.billNo
                              )
                            ) : (
                              ''
                            )}
                          </td>
                          <td className="border border-slate-300 py-2.5 px-3 text-center text-slate-800 whitespace-nowrap">
                            {bRow ? bRow.date : ''}
                          </td>
                          <td className="border border-slate-300 py-2.5 px-3 text-center font-bold text-slate-900 whitespace-nowrap">
                            {bRow ? `₹${bRow.dueAmount.toLocaleString('en-IN')}` : ''}
                          </td>
                          <td className="border border-slate-300 py-2.5 px-3 text-center text-slate-800 whitespace-nowrap">
                            {rRow ? rRow.date : ''}
                          </td>
                          <td className="border border-slate-300 py-2.5 px-3 text-left text-slate-800">
                            {rRow ? rRow.voucherNo : ''}
                          </td>
                          <td className="border border-slate-300 py-2.5 px-3 text-center font-bold text-emerald-700 whitespace-nowrap">
                            {rRow ? `₹${rRow.paidAmount.toLocaleString('en-IN')}` : ''}
                          </td>
                          {rowIdx === 0 && (
                            <td
                              rowSpan={ledgerRowCount}
                              className="border border-slate-300 bg-[#00a619] text-white text-center align-middle p-4 w-52"
                              data-testid="excel-green-balance-box"
                            >
                              <div className="text-2xl sm:text-3xl font-bold tracking-tight">
                                ₹{selectedSheetData.remainingBalance.toLocaleString('en-IN')}
                              </div>
                              <div className="text-[11px] font-sans font-medium text-emerald-100 mt-1">
                                Remaining Due
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}

                    {/* Bottom TOTAL Row */}
                    <tr className="bg-slate-100 font-bold text-slate-900">
                      <td className="border border-slate-300 py-2.5 px-3"></td>
                      <td className="border border-slate-300 py-2.5 px-3 text-center uppercase">
                        TOTAL
                      </td>
                      <td className="border border-slate-300 py-2.5 px-3 text-center text-amber-800">
                        ₹{selectedSheetData.totalBillDue.toLocaleString('en-IN')}
                      </td>
                      <td className="border border-slate-300 py-2.5 px-3"></td>
                      <td className="border border-slate-300 py-2.5 px-3 text-center uppercase">
                        TOTAL
                      </td>
                      <td
                        className="border border-slate-300 py-2.5 px-3 text-center text-emerald-800"
                        data-testid="excel-total-voucher-paid"
                      >
                        ₹{selectedSheetData.totalReceiptPaid.toLocaleString('en-IN')}
                      </td>
                      <td className="border border-slate-300 py-2.5 px-3 text-center text-slate-900">
                        Due: ₹{selectedSheetData.remainingBalance.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          {/* Payment History Section (Shown cleanly on the Customer's dedicated page) */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Payment History ({selectedCustomer.payments.length})
              </h3>
              {selectedCustomer.balanceDue > 0 && (
                <Button
                  variant="amber"
                  size="sm"
                  onClick={() => openPaymentModal(selectedCustomer)}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Record New Payment
                </Button>
              )}
            </div>

            {selectedCustomer.payments.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                No payments recorded for this customer yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {selectedCustomer.payments.map((pay) => (
                  <div
                    key={pay.id}
                    className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-sm text-emerald-700">
                        +₹{pay.amount.toLocaleString('en-IN')}
                      </span>{' '}
                      <span className="text-slate-500 font-semibold">
                        ({pay.paymentMode})
                      </span>
                      {pay.note && (
                        <div className="text-slate-700 font-medium mt-0.5">
                          Voucher / Note: {pay.note}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-[11px] text-slate-500 font-mono">
                      { /^\d{2}\.\d{2}\.\d{4}$/.test(pay.recordedAt)
                        ? pay.recordedAt
                        : formatDateShortDisplay(pay.recordedAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : (
        /* ===================================================================
           MODE 2: ALL CUSTOMERS DIRECTORY & DUPLICATE FINDER
           =================================================================== */
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
            <div>
              <p className="text-xs font-medium text-slate-500">
                Manage customer details, add missing phone numbers, clean up duplicate entries, and inspect transaction history
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mt-1">
                Customers &amp; Transaction History
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700">
                Total Customers: <strong className="font-mono text-slate-900">{dues.length}</strong>
              </div>
              <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
                Duplicates Found:{' '}
                <strong className="font-mono text-amber-800">{duplicateMap.size}</strong>
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
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
                onClick={() => setDirectoryFilter('ALL')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  directoryFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({dues.length})
              </button>
              <button
                type="button"
                onClick={() => setDirectoryFilter('ACTIVE_DUE')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  directoryFilter === 'ACTIVE_DUE'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active Dues ({dues.filter((d) => d.balanceDue > 0).length})
              </button>
              <button
                type="button"
                onClick={() => setDirectoryFilter('DUPLICATES')}
                data-testid="customers-filter-duplicates"
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  directoryFilter === 'DUPLICATES'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-amber-800 hover:text-amber-950'
                }`}
              >
                Duplicates ({duplicateMap.size})
              </button>
              <button
                type="button"
                onClick={() => setDirectoryFilter('MISSING_PHONE')}
                data-testid="customers-filter-missing-phone"
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  directoryFilter === 'MISSING_PHONE'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                No Phone ({dues.filter((d) => isCustomerPhoneMissing(d.customerPhone)).length})
              </button>
            </div>
          </Card>

          {/* Aligned Customer Directory Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4">Customer Name</th>
                    <th className="py-3.5 px-4">Address / Village</th>
                    <th className="py-3.5 px-4">Phone Number</th>
                    <th className="py-3.5 px-4 text-right">Total Billed</th>
                    <th className="py-3.5 px-4 text-right">Total Paid</th>
                    <th className="py-3.5 px-4 text-right">Remaining Due</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500 text-sm">
                        No customers match the current filter.
                      </td>
                    </tr>
                  ) : (
                    visibleCustomers.map((due) => {
                      const dupInfo = duplicateMap.get(due.id);
                      const phoneMissing = isCustomerPhoneMissing(due.customerPhone);
                      return (
                        <tr
                          key={due.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onSelectCustomer(due.id)}
                                className="text-sm font-bold text-slate-900 hover:text-amber-700 hover:underline text-left cursor-pointer"
                              >
                                {due.customerName}
                              </button>
                              {dupInfo && (
                                <Badge variant="red">{dupInfo.reason}</Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 font-medium">
                            {!due.customerVillage || /^copy$/i.test(due.customerVillage)
                              ? 'Local'
                              : due.customerVillage}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {phoneMissing ? (
                              <button
                                type="button"
                                onClick={() => openEditModal(due)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 text-xs font-semibold cursor-pointer transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                Add Number
                              </button>
                            ) : (
                              <span className="font-mono font-semibold text-slate-800 inline-flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {due.customerPhone}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                            ₹{due.totalBilled.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                            ₹{due.totalPaid.toLocaleString('en-IN')}
                          </td>
                          <td
                            className={`py-3.5 px-4 text-right font-mono tabular-nums text-sm font-bold whitespace-nowrap ${
                              due.balanceDue > 0 ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            ₹{due.balanceDue.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditModal(due)}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Edit
                              </Button>
                              <Button
                                variant="amber"
                                size="sm"
                                onClick={() => onSelectCustomer(due.id)}
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                Transactions
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-600 font-mono tabular-nums">
                Showing {visibleCustomers.length.toLocaleString('en-IN')} of{' '}
                {filteredCustomers.length.toLocaleString('en-IN')} customers
              </span>
              {hasMoreCustomers && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDirectoryPage((p) => p + 1)}
                >
                  Load Next {PAGE_SIZE} Customers
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Edit Customer Details Modal (Name, Phone Number, Address) */}
      <Dialog
        open={Boolean(editingCustomer)}
        onClose={() => setEditingCustomer(null)}
        title={
          editingCustomer
            ? `Edit Customer · ${editingCustomer.customerName}`
            : 'Edit Customer Details'
        }
      >
        {editingCustomer && (
          <form onSubmit={handleSaveCustomerEdit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
                {errorMsg}
              </div>
            )}

            <div>
              <label
                htmlFor="edit-customer-name"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Customer Name *
              </label>
              <Input
                id="edit-customer-name"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter customer full name"
              />
            </div>

            <div>
              <label
                htmlFor="edit-customer-phone"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Phone Number
              </label>
              <Input
                id="edit-customer-phone"
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Enter 10-digit phone number"
                className="font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="edit-customer-village"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Address / Village
              </label>
              <Input
                id="edit-customer-village"
                value={editVillage}
                onChange={(e) => setEditVillage(e.target.value)}
                placeholder="e.g. Pandua, Hooghly"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingCustomer(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="amber"
                disabled={isSavingEdit}
                data-testid="save-customer-edit-btn"
              >
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Record Payment Modal */}
      <Dialog
        open={Boolean(paymentTargetDue)}
        onClose={() => setPaymentTargetDue(null)}
        title={
          paymentTargetDue
            ? `Record Payment · ${paymentTargetDue.customerName}`
            : 'Record Payment'
        }
      >
        {paymentTargetDue && (
          <form onSubmit={handlePaymentSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-600">Current Balance Due</span>
              <span className="text-base font-bold text-amber-700 font-mono tabular-nums">
                ₹{paymentTargetDue.balanceDue.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="cust-payment-amount"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Amount Received (₹) *
                </label>
                <Input
                  id="cust-payment-amount"
                  type="number"
                  min="1"
                  max={paymentTargetDue.balanceDue}
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="font-mono tabular-nums font-bold"
                />
              </div>
              <div>
                <label
                  htmlFor="cust-payment-mode"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Payment Mode (Cash / UPI)
                </label>
                <Select
                  id="cust-payment-mode"
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
                htmlFor="cust-payment-note"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Receipt Voucher No / Note (Optional)
              </label>
              <Input
                id="cust-payment-note"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="e.g. Receipt Voucher #01"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPaymentTargetDue(null)}
              >
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

      {/* Delete Customer Confirmation Modal */}
      <Dialog
        open={Boolean(deletingCustomer)}
        onClose={() => setDeletingCustomer(null)}
        title="Delete Customer Record"
      >
        {deletingCustomer && (
          <div className="space-y-4 text-xs text-slate-700">
            <p className="text-sm text-slate-800">
              Are you sure you want to delete{' '}
              <strong className="font-bold text-slate-900">
                {deletingCustomer.customerName}
              </strong>{' '}
              (Balance Due: ₹{deletingCustomer.balanceDue.toLocaleString('en-IN')})?
            </p>
            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setDeletingCustomer(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDelete}>
                <Trash2 className="w-4 h-4" />
                Confirm Delete
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
