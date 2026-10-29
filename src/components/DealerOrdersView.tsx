/**
 * ============================================================================
 * TAJ HARVESTER — DEALER ORDER LIST VIEW (src/components/DealerOrdersView.tsx)
 * ============================================================================
 * Simple Custom Dealer Name & Parts List generator without preset supplier clutter.
 */

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  FileDown,
  Plus,
  Printer,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import type { DealerOrder, DealerOrderItem, PartSet, SparePart } from '../types/shop';
import { detectPartSet, formatDateShortDisplay } from '../utils/shopLogic';
import { Button, Card, Input } from './ui/primitives';

interface DealerOrdersViewProps {
  parts: SparePart[];
  dealerOrders: DealerOrder[];
  onGenerateDealerOrder: (payload: {
    dealerName: string;
    items: DealerOrderItem[];
    notes: string;
  }) => Promise<DealerOrder>;
  onPreviewOrderPdf: (order: DealerOrder) => void;
}

export const DealerOrdersView: React.FC<DealerOrdersViewProps> = ({
  parts,
  dealerOrders,
  onGenerateDealerOrder,
  onPreviewOrderPdf,
}) => {
  const [customDealerName, setCustomDealerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [setFilter, setSetFilter] = useState<'ALL' | PartSet>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [uncheckedIds, setUncheckedIds] = useState<Record<string, boolean>>({});
  const [customItems, setCustomItems] = useState<DealerOrderItem[]>([]);

  // Custom item inputs
  const [customPartNo, setCustomPartNo] = useState('');
  const [customPartName, setCustomPartName] = useState('');
  const [customOrderQty, setCustomOrderQty] = useState('10');

  const [submitting, setSubmitting] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const lowStockParts = useMemo(
    () =>
      parts
        .filter((p) => !p.isArchived && p.stockQty <= p.minStockLevel)
        .filter((p) => {
          const pSet = p.partSet || detectPartSet(p.partNumber, p.nameModel);
          if (setFilter !== 'ALL' && pSet !== setFilter) return false;
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          return (
            p.partNumber.toLowerCase().includes(q) ||
            p.nameModel.toLowerCase().includes(q)
          );
        }),
    [parts, setFilter, searchQuery]
  );

  const getRecommendedQty = (part: SparePart) => {
    if (qtyMap[part.id] !== undefined) return qtyMap[part.id];
    return Math.max(10, part.minStockLevel * 2 - part.stockQty);
  };

  const selectedLowStockParts = useMemo(
    () => lowStockParts.filter((p) => !uncheckedIds[p.id]),
    [lowStockParts, uncheckedIds]
  );

  const togglePartSelection = (partId: string) => {
    setUncheckedIds((prev) => ({
      ...prev,
      [partId]: !prev[partId],
    }));
  };

  const handleSelectAll = () => setUncheckedIds({});
  const handleDeselectAll = () => {
    const next: Record<string, boolean> = {};
    for (const p of lowStockParts) next[p.id] = true;
    setUncheckedIds(next);
  };

  const handleAddCustomRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPartName.trim()) return;
    const newItem: DealerOrderItem = {
      partId: `custom-${Date.now()}`,
      partNumber: customPartNo.trim().toUpperCase() || 'N/A',
      nameModel: customPartName.trim(),
      currentStock: 0,
      minStockLevel: 0,
      orderQty: Math.max(1, Number(customOrderQty) || 1),
    };
    setCustomItems((prev) => [newItem, ...prev]);
    setCustomPartNo('');
    setCustomPartName('');
    setCustomOrderQty('10');
  };

  const handleRemoveCustomItem = (partId: string) => {
    setCustomItems((prev) => prev.filter((i) => i.partId !== partId));
  };

  const totalSelectedCount = selectedLowStockParts.length + customItems.length;

  const handleCreateOrderPdf = async () => {
    setErrorMsg('');
    if (!customDealerName.trim()) {
      setErrorMsg('Please enter a Dealer Name.');
      return;
    }
    if (totalSelectedCount === 0) {
      setErrorMsg('Please select at least one part to include in the order list.');
      return;
    }

    setSubmitting(true);
    try {
      const lowStockOrderItems: DealerOrderItem[] = selectedLowStockParts.map((part) => ({
        partId: part.id,
        partNumber: part.partNumber,
        nameModel: part.nameModel,
        currentStock: part.stockQty,
        minStockLevel: part.minStockLevel,
        orderQty: Math.max(1, getRecommendedQty(part)),
      }));

      const allItems = [...customItems, ...lowStockOrderItems];

      const order = await onGenerateDealerOrder({
        dealerName: customDealerName.trim(),
        items: allItems,
        notes: orderNotes.trim(),
      });

      setStatusBanner(
        `Saved Order List (${order.orderNumber}) for ${order.dealerName}.`
      );
      onPreviewOrderPdf(order);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Dealer Order List
        </h1>
        <Button
          variant="amber"
          size="lg"
          disabled={totalSelectedCount === 0 || submitting}
          onClick={handleCreateOrderPdf}
        >
          <FileDown className="w-5 h-5" />
          {submitting
            ? 'Generating PDF...'
            : `Generate Order List (${totalSelectedCount} Parts)`}
        </Button>
      </div>

      {statusBanner && (
        <div
          role="status"
          className="flex items-center justify-between px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 text-sm"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            {statusBanner}
          </span>
          <button
            type="button"
            onClick={() => setStatusBanner('')}
            className="text-xs font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Dealer Name + Custom Part Input */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5 p-5 space-y-4">
          <div>
            <label
              htmlFor="custom-dealer-name"
              className="block text-xs font-bold text-slate-800 mb-1"
            >
              Dealer Name *
            </label>
            <Input
              id="custom-dealer-name"
              value={customDealerName}
              onChange={(e) => setCustomDealerName(e.target.value)}
              placeholder="Enter Dealer Name"
            />
          </div>

          <div>
            <label
              htmlFor="dealer-order-note"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Note (Optional)
            </label>
            <Input
              id="dealer-order-note"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="Optional order note"
            />
          </div>
        </Card>

        {/* Add Custom Part to List */}
        <Card className="lg:col-span-7 p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900">
            Add Custom Part to Order List
          </h2>
          <form onSubmit={handleAddCustomRow} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-3">
              <Input
                value={customPartNo}
                onChange={(e) => setCustomPartNo(e.target.value)}
                placeholder="Part No"
              />
            </div>
            <div className="sm:col-span-5">
              <Input
                value={customPartName}
                onChange={(e) => setCustomPartName(e.target.value)}
                placeholder="Description *"
              />
            </div>
            <div className="sm:col-span-2">
              <Input
                type="number"
                min="1"
                value={customOrderQty}
                onChange={(e) => setCustomOrderQty(e.target.value)}
                placeholder="Count"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary" className="w-full">
                <Plus className="w-4 h-4" />
                Add
              </Button>
            </div>
          </form>

          {customItems.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-1.5 max-h-32 overflow-y-auto">
              {customItems.map((ci) => (
                <div
                  key={ci.partId}
                  className="flex items-center justify-between text-xs bg-amber-50/70 border border-amber-200 px-3 py-1.5 rounded-md"
                >
                  <div>
                    <span className="font-mono font-bold text-slate-900">{ci.partNumber}</span> ·{' '}
                    <span className="font-medium text-slate-800">{ci.nameModel}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-amber-800">Count: {ci.orderQty}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomItem(ci.partId)}
                      className="text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Low Stock Parts Picker Table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">
            Low-Stock Parts ({lowStockParts.length})
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', 'kubota', 'yanmar', 'gm', 'local', 'bearings', 'others'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSetFilter(s)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold uppercase cursor-pointer ${
                  setFilter === s
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {s === 'ALL' ? 'All Sets' : s}
              </button>
            ))}

            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="search"
                placeholder="Filter parts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeselectAll}>
              Clear All
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50">
                <th className="py-3 px-4 font-semibold w-12">Select</th>
                <th className="py-3 px-4 font-semibold">Part Number</th>
                <th className="py-3 px-4 font-semibold">Description</th>
                <th className="py-3 px-4 font-semibold text-right">Stock Count</th>
                <th className="py-3 px-4 font-semibold text-right">Order Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {lowStockParts.map((part) => {
                const isSelected = !uncheckedIds[part.id];
                const orderQty = getRecommendedQty(part);
                return (
                  <tr
                    key={part.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 opacity-60'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => togglePartSelection(part.id)}
                        aria-label={`Toggle ${part.partNumber} in dealer order`}
                        className="text-slate-800 hover:text-amber-600 cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-amber-600" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-400" />
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-bold text-slate-900">
                      {part.partSet === 'bearings' || part.partSet === 'others'
                        ? '--'
                        : part.partNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {part.nameModel}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      <span className="font-bold text-red-600">{part.stockQty}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <input
                        type="number"
                        min="1"
                        aria-label={`Order quantity for ${part.partNumber}`}
                        value={orderQty}
                        onChange={(e) =>
                          setQtyMap((prev) => ({
                            ...prev,
                            [part.id]: Math.max(1, Number(e.target.value) || 1),
                          }))
                        }
                        className="w-20 px-2.5 py-1.5 text-right font-mono tabular-nums text-xs font-bold border border-slate-300 rounded-lg bg-white"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Previous Dealer Order Lists */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">
            Saved Order Lists ({dealerOrders.length})
          </h2>
        </div>
        <div className="divide-y divide-slate-200">
          {dealerOrders.map((po) => (
            <div
              key={po.id}
              className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
            >
              <div>
                <div className="text-sm font-bold text-slate-900 font-mono">
                  {po.orderNumber} · <span className="font-sans">{po.dealerName}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {formatDateShortDisplay(po.createdAt)} · {po.totalItemsCount} parts ·{' '}
                  {po.totalUnitsQty} total count
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => onPreviewOrderPdf(po)}>
                <Printer className="w-4 h-4" />
                View / Print PDF
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
