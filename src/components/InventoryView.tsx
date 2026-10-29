import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Edit3,
  FileUp,
  LoaderCircle,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import type { PartSet, SparePart } from '../types/shop';
import {
  detectPartSet,
  filterAndSearchParts,
  getDuplicatePartKeySet,
  getPartDuplicateKey,
  isPartSetWithoutPartNumber,
  inspectXlsxWorkbook,
  paginateParts,
  PART_SET_META,
} from '../utils/shopLogic';
import { Badge, Button, Card, Dialog, Input, Select } from './ui/primitives';

interface InventoryViewProps {
  parts: SparePart[];
  initialStockFilter?:
    | 'ALL'
    | 'LOW_STOCK'
    | 'OUT_OF_STOCK'
    | 'HEALTHY'
    | 'DUPLICATE_PART_NO';
  onAddPart: (partData: {
    partSet: PartSet;
    partNumber: string;
    nameModel: string;
    rackLocation: string;
    stockQty: number;
    price: number;
    minStockLevel: number;
  }) => Promise<SparePart>;
  onUpdatePart: (id: string, updates: Partial<SparePart>) => Promise<void>;
  onArchivePart: (id: string) => Promise<void>;
  onImportCsv: (
    csvText: string,
    targetSet?: PartSet,
    options?: { forceZeroCount?: boolean; replaceTargetSet?: boolean }
  ) => Promise<{ addedCount: number; updatedCount: number }>;
  onExportCsv: (setFilter?: 'ALL' | PartSet) => void;
  onAddPartToBill: (part: SparePart) => void;
  countCheckEnabled?: boolean;
  onTriggerLoader?: () => void;
}

const PAGE_SIZE = 40;

const SAMPLE_EXCEL_CSV = [
  'SL NO,PART NO,DESCRIPTION,SELLING RATE,POSITION,OPENING QTY,MATERIALS IN,MATERIALS OUT,MATERIALS BALANCE',
  '1,1E6680-73040,"SLEEVE, 35X45X17",80,A1,423,0,0,423',
  '2,24311-000210,"O-RING ,1AP21.0",70,OR-5,10,0,0,10',
  '3,5T078-55515,,0,S SIDE,6,0,0,6',
  '4,W1.8-33-06-04-00A,OIL SEAL ASSY,180,GAM 1,5,0,0,5',
].join('\n');

export const InventoryView: React.FC<InventoryViewProps> = ({
  parts,
  initialStockFilter = 'ALL',
  onAddPart,
  onUpdatePart,
  onArchivePart,
  onImportCsv,
  onExportCsv,
  onAddPartToBill,
  countCheckEnabled = false,
  onTriggerLoader,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<
    'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'HEALTHY' | 'DUPLICATE_PART_NO'
  >(initialStockFilter);
  const [activeSetFilter, setActiveSetFilter] = useState<'ALL' | PartSet>('ALL');
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<SparePart | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importTargetSet, setImportTargetSet] = useState<PartSet>('kubota');
  const [csvTextInput, setCsvTextInput] = useState('');
  const [replaceTargetSet, setReplaceTargetSet] = useState(true);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [uploadedRowCount, setUploadedRowCount] = useState<number>(0);
  const [formError, setFormError] = useState('');
  const [feedbackBanner, setFeedbackBanner] = useState('');
  const [savingPart, setSavingPart] = useState(false);
  const [importingParts, setImportingParts] = useState(false);

  // Form state for the 5 Core Fields (+ DB Set):
  // 1. partNumber
  // 2. nameModel (Excel Description)
  // 3. rackLocation (Rack No)
  // 4. stockQty (Count)
  // 5. price (Selling Price)
  const [partSet, setPartSet] = useState<PartSet>('kubota');
  const [partNumber, setPartNumber] = useState('');
  const [nameModel, setNameModel] = useState('');
  const [rackLocation, setRackLocation] = useState('');
  const [stockQty, setStockQty] = useState('15');
  const [price, setPrice] = useState('');

  useEffect(() => {
    setStockFilter(initialStockFilter);
    setPage(1);
  }, [initialStockFilter]);

  const activeParts = useMemo(() => parts.filter((p) => !p.isArchived), [parts]);

  const setCounts = useMemo(() => {
    const counts: Record<PartSet, number> = {
      kubota: 0,
      yanmar: 0,
      gm: 0,
      local: 0,
      bearings: 0,
      others: 0,
    };
    for (const p of activeParts) {
      const s = p.partSet || detectPartSet(p.partNumber, p.nameModel);
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [activeParts]);

  const filteredParts = useMemo(
    () => filterAndSearchParts(activeParts, searchQuery, stockFilter, activeSetFilter),
    [activeParts, searchQuery, stockFilter, activeSetFilter]
  );

  const { items: visibleParts, total, hasMore, loadedCount } = useMemo(
    () => paginateParts(filteredParts, page, PAGE_SIZE),
    [filteredParts, page]
  );

  // Reset pagination when filters change (auto-loading on scroll is disabled; manual "Load Next 40 Parts" button is used)
  useEffect(() => {
    setPage(1);
  }, [searchQuery, stockFilter, activeSetFilter]);

  const openAddDialog = () => {
    setFormError('');
    const defaultSet: PartSet = activeSetFilter === 'ALL' ? 'kubota' : activeSetFilter;
    const meta = PART_SET_META[defaultSet];
    const nextCode =
      isPartSetWithoutPartNumber(defaultSet)
        ? ''
        : `${meta.codePrefix}-${String(activeParts.length + 1).padStart(4, '0')}`;
    setPartSet(defaultSet);
    setPartNumber(nextCode);
    setNameModel(isPartSetWithoutPartNumber(defaultSet) ? '' : `${meta.brandPrefix} - `);
    setRackLocation(isPartSetWithoutPartNumber(defaultSet) ? 'Bin / Counter' : `Rack ${meta.rackPrefix}-05`);
    setStockQty('20');
    setPrice('');
    setAddModalOpen(true);
  };

  const handleSetChangeInModal = (nextSet: PartSet) => {
    setPartSet(nextSet);
    if (!editingPart) {
      if (isPartSetWithoutPartNumber(nextSet)) {
        setPartNumber('');
        if (nameModel.endsWith(' - ')) {
          setNameModel('');
        }
        setRackLocation('Bin / Counter');
      } else {
        const meta = PART_SET_META[nextSet];
        setPartNumber(`${meta.codePrefix}-${String(activeParts.length + 1).padStart(4, '0')}`);
        if (!nameModel.trim() || nameModel.endsWith(' - ')) {
          setNameModel(`${meta.brandPrefix} - `);
        }
        setRackLocation(`Rack ${meta.rackPrefix}-05`);
      }
    }
  };

  const openEditDialog = (part: SparePart) => {
    setFormError('');
    setEditingPart(part);
    const resolvedSet = part.partSet || detectPartSet(part.partNumber, part.nameModel);
    setPartSet(resolvedSet);
    setPartNumber(isPartSetWithoutPartNumber(resolvedSet) ? '' : part.partNumber);
    setNameModel(part.nameModel);
    setRackLocation(part.rackLocation);
    setStockQty(String(part.stockQty));
    setPrice(String(part.price));
  };

  const handleSavePart = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const isNoPartNumber = isPartSetWithoutPartNumber(partSet);
    if (!isNoPartNumber && !partNumber.trim()) {
      setFormError('Part Number is required for Kubota, Yanmar, GM, and Local parts.');
      return;
    }
    const finalPartName = nameModel.trim() || '--';
    const finalRack = rackLocation.trim() || '--';

    const numericPrice = Number(price || 0);
    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      setFormError('Enter 0 or a valid positive Selling Price in ₹.');
      return;
    }

    const cleanCode = isNoPartNumber ? '--' : partNumber.trim().toUpperCase();

    setSavingPart(true);
    try {
      if (editingPart) {
        await onUpdatePart(editingPart.id, {
          partSet,
          partNumber: cleanCode,
          nameModel: finalPartName,
          rackLocation: finalRack,
          stockQty: Math.max(0, Math.round(Number(stockQty) || 0)),
          price: Math.round(numericPrice * 100) / 100,
        });
        setFeedbackBanner(
          `Updated [${partSet.toUpperCase()}] ${isNoPartNumber ? 'No Part No.' : cleanCode} (${finalPartName})`
        );
        setEditingPart(null);
      } else {
        await onAddPart({
          partSet,
          partNumber: cleanCode,
          nameModel: finalPartName,
          rackLocation: finalRack,
          stockQty: Math.max(0, Math.round(Number(stockQty) || 0)),
          price: Math.round(numericPrice * 100) / 100,
          minStockLevel: 5,
        });
        setFeedbackBanner(
          `Added new part ${isNoPartNumber ? '(No Part No.)' : cleanCode} (${finalPartName}) to ${PART_SET_META[partSet].shortLabel} set`
        );
        setAddModalOpen(false);
      }
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSavingPart(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!csvTextInput.trim()) {
      setFormError('Please choose an Excel (.xlsx / .xls / .csv) file first.');
      return;
    }
    setImportingParts(true);
    try {
      const res = await onImportCsv(csvTextInput, importTargetSet, {
        forceZeroCount: true,
        replaceTargetSet,
      });
      setFeedbackBanner(
        `Excel Import Complete (${PART_SET_META[importTargetSet].label}): ${
          replaceTargetSet
            ? `Replaced dataset with ${res.addedCount} parts.`
            : `Merged ${res.addedCount} new parts and updated ${res.updatedCount} existing parts.`
        }`
      );
      setImportModalOpen(false);
      setCsvTextInput('');
      setUploadedFileName('');
      setUploadedRowCount(0);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setImportingParts(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError('');
    setUploadedFileName(file.name);
    const isExcelBinary = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        if (isExcelBinary && ev.target?.result instanceof ArrayBuffer) {
          const wbInfo = inspectXlsxWorkbook(ev.target.result, file.name, true);
          const prefSheet = wbInfo.sheets[wbInfo.preferredSheetIndex];
          setCsvTextInput(prefSheet ? prefSheet.csvText : wbInfo.combinedCsvText);
          setUploadedRowCount(prefSheet ? prefSheet.rowCount : wbInfo.totalRowCount);
        } else {
          const text = String(ev.target?.result || '');
          setCsvTextInput(text);
          setUploadedRowCount(Math.max(0, text.trim().split(/\r?\n/).length - 1));
        }
      } catch (err) {
        setFormError((err as Error).message);
      }
    };
    if (isExcelBinary) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const lowStockCount = useMemo(
    () => activeParts.filter((p) => p.stockQty <= p.minStockLevel).length,
    [activeParts]
  );

  const duplicatePartCodes = useMemo(
    () => getDuplicatePartKeySet(activeParts, activeSetFilter),
    [activeParts, activeSetFilter]
  );

  const duplicatePartsCount = useMemo(
    () =>
      activeParts.filter((p) => {
        const s = p.partSet || detectPartSet(p.partNumber, p.nameModel);
        if (activeSetFilter !== 'ALL' && s !== activeSetFilter) return false;
        const key = getPartDuplicateKey({ ...p, partSet: s });
        return Boolean(key && duplicatePartCodes.has(key));
      }).length,
    [activeParts, activeSetFilter, duplicatePartCodes]
  );

  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500">
            6 Database Sets (Kubota · Yanmar · GM · Local · Bearings · Others) · 5 Core Fields per Part
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mt-1">
            Spare Parts Inventory ({activeParts.length.toLocaleString('en-IN')})
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => {
              setFormError('');
              if (activeSetFilter !== 'ALL') {
                setImportTargetSet(activeSetFilter);
              }
              setImportModalOpen(true);
            }}
          >
            <FileUp className="w-4 h-4" />
            Import / Restore XLSX
          </Button>
          <Button variant="amber" size="lg" onClick={openAddDialog}>
            <Plus className="w-4 h-4" />
            Add Spare Part
          </Button>
        </div>
      </div>

      {/* 3 Original XLSX Exports (Kubota, Yanmar, GM) + Local + Bearings + Others XLSX Export */}
      <Card className="p-4 bg-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Export .XLSX by Database Set (3 Original Sets + Local + Bearings + Others)
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              5 Columns: Part Number, Description, Rack No, Count, Selling Price
            </p>
          </div>
          <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExportCsv('kubota')}
              data-testid="export-kubota-csv"
            >
              <Download className="w-3.5 h-3.5 text-amber-700" />
              1. Kubota (.xlsx)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExportCsv('yanmar')}
              data-testid="export-yanmar-csv"
            >
              <Download className="w-3.5 h-3.5 text-amber-700" />
              2. Yanmar (.xlsx)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExportCsv('gm')}
              data-testid="export-gm-csv"
            >
              <Download className="w-3.5 h-3.5 text-amber-700" />
              3. GM (.xlsx)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExportCsv('local')}
              data-testid="export-local-csv"
            >
              <Download className="w-3.5 h-3.5 text-slate-700" />
              4. Local List (.xlsx)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExportCsv('bearings')}
              data-testid="export-bearings-csv"
            >
              <Download className="w-3.5 h-3.5 text-slate-700" />
              5. Bearings (.xlsx)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExportCsv('others')}
              data-testid="export-others-csv"
            >
              <Download className="w-3.5 h-3.5 text-slate-700" />
              6. Others (.xlsx)
            </Button>
          </div>
        </div>
      </Card>

      {feedbackBanner && (
        <div
          role="status"
          className="flex items-center justify-between px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            {feedbackBanner}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackBanner('')}
            className="text-xs font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Database Sets Tabs (Kubota, Yanmar, GM, Local, Bearings, Others) + Search & Stock Filter Bar */}
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
          <button
            type="button"
            onClick={() => setActiveSetFilter('ALL')}
            className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
              activeSetFilter === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="text-xs font-bold">All Sets</div>
            <div className="text-[11px] opacity-80 font-mono tabular-nums">
              {activeParts.length} Parts
            </div>
          </button>

          {(['kubota', 'yanmar', 'gm', 'local', 'bearings', 'others'] as PartSet[]).map((setKey) => {
            const meta = PART_SET_META[setKey];
            const isSelected = activeSetFilter === setKey;
            return (
              <button
                key={setKey}
                type="button"
                onClick={() => setActiveSetFilter(setKey)}
                data-testid={`set-tab-${setKey}`}
                className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div className="text-xs font-bold truncate">{meta.label}</div>
                <div className="text-[11px] opacity-85 font-mono tabular-nums">
                  {setCounts[setKey]} Parts
                </div>
              </button>
            );
          })}
        </div>

        {/* Search & Stock Filter */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="search"
              aria-label="Search parts by part number, brandname-partname, or rack no"
              placeholder="Search by Part Number (KB-0001), Description, or Rack No..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setStockFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                stockFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({activeParts.length})
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('DUPLICATE_PART_NO')}
              data-testid="inventory-filter-duplicates"
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer inline-flex items-center gap-1 ${
                stockFilter === 'DUPLICATE_PART_NO'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-amber-800 hover:text-amber-950'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Same Part No. ({duplicatePartsCount})
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('LOW_STOCK')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                stockFilter === 'LOW_STOCK'
                  ? 'bg-white text-red-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Low Stock ({lowStockCount})
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('OUT_OF_STOCK')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                stockFilter === 'OUT_OF_STOCK'
                  ? 'bg-white text-red-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Out of Stock
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('HEALTHY')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                stockFilter === 'HEALTHY'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Healthy
            </button>
          </div>
        </div>
      </Card>

      {/* 5-Column Parts Table with Infinite Scroll */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-600 bg-slate-50">
                <th className="py-3 px-4 font-semibold">1. Part Number</th>
                <th className="py-3 px-4 font-semibold">2. Description</th>
                <th className="py-3 px-4 font-semibold">3. Rack No</th>
                <th className="py-3 px-4 font-semibold text-right">4. Count</th>
                <th className="py-3 px-4 font-semibold text-right">5. Selling Price</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {visibleParts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No spare parts match your search criteria. Try clearing filters or add a new part.
                  </td>
                </tr>
              ) : (
                visibleParts.map((part) => {
                  const isLow = part.stockQty <= part.minStockLevel;
                  const isOut = part.stockQty === 0;
                  const pSet = part.partSet || detectPartSet(part.partNumber, part.nameModel);
                  const duplicateKey = getPartDuplicateKey({ ...part, partSet: pSet });
                  const isDuplicatePartNo = Boolean(duplicateKey && duplicatePartCodes.has(duplicateKey));
                  return (
                    <tr
                      key={part.id}
                      className={`transition-colors ${
                        isLow ? 'bg-amber-50/40 hover:bg-amber-50/80' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* 1. Part Number */}
                      <td className="py-3 px-4 align-middle whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-slate-900">
                            {isPartSetWithoutPartNumber(pSet)
                              ? '-- (No Part No.)'
                              : part.partNumber}
                          </span>
                          {isDuplicatePartNo && (
                            <Badge variant="red">Same Part No.</Badge>
                          )}
                        </div>
                        <div className="text-[11px] font-semibold uppercase text-amber-700 mt-0.5">
                          Set: {pSet}
                        </div>
                      </td>

                      {/* 2. Description from Excel */}
                      <td className="py-3 px-4 align-middle">
                        <div className="font-medium text-slate-900">{part.nameModel}</div>
                        {isLow && (
                          <div className="text-xs font-medium text-red-700 inline-flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            {isOut ? 'Out of stock' : 'Low stock alert'}
                          </div>
                        )}
                      </td>

                      {/* 3. Rack No */}
                      <td className="py-3 px-4 align-middle whitespace-nowrap">
                        <span className="text-xs font-medium text-slate-800">
                          {part.rackLocation}
                        </span>
                      </td>

                      {/* 4. Count */}
                      <td className="py-3 px-4 align-middle text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            aria-label={`Decrease count for ${part.partNumber}`}
                            onClick={() =>
                              onUpdatePart(part.id, {
                                stockQty: Math.max(0, part.stockQty - 1),
                              })
                            }
                            className="w-7 h-7 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 font-mono text-xs font-bold cursor-pointer"
                          >
                            -
                          </button>
                          <div className="min-w-[44px] text-center font-mono tabular-nums">
                            <span
                              className={`text-sm font-bold ${
                                isOut
                                  ? 'text-red-700'
                                  : isLow
                                  ? 'text-amber-700'
                                  : 'text-slate-900'
                              }`}
                            >
                              {part.stockQty}
                            </span>
                          </div>
                          <button
                            type="button"
                            aria-label={`Increase count for ${part.partNumber}`}
                            onClick={() =>
                              onUpdatePart(part.id, {
                                stockQty: part.stockQty + 1,
                              })
                            }
                            className="w-7 h-7 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 font-mono text-xs font-bold cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* 5. Selling Price */}
                      <td className="py-3 px-4 align-middle text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        ₹{part.price.toLocaleString('en-IN')}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 align-middle text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onAddPartToBill(part)}
                            disabled={countCheckEnabled && part.stockQty <= 0}
                            aria-label={`Add ${part.partNumber} to bill`}
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            + Bill
                          </Button>
                          <button
                            type="button"
                            onClick={() => openEditDialog(part)}
                            aria-label={`Edit ${part.partNumber}`}
                            className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onArchivePart(part.id)}
                            aria-label={`Delete ${part.partNumber}`}
                            className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Manual Load Next 40 Parts Pagination Footer (Auto-Loading Disabled) */}
        <div className="px-6 py-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          {hasMore ? (
            <>
              <span className="text-xs text-slate-600 font-mono tabular-nums">
                Loaded {loadedCount.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} parts
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={isLoadingMore}
                onClick={() => {
                  if (isLoadingMore) return;
                  setIsLoadingMore(true);
                  onTriggerLoader?.();
                  window.setTimeout(() => {
                    setPage((p) => p + 1);
                    setIsLoadingMore(false);
                  }, 360);
                }}
                data-testid="load-next-40-parts"
              >
                {isLoadingMore ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-700 border-t-transparent animate-spin shrink-0" />
                    Loading Next {PAGE_SIZE}...
                  </>
                ) : (
                  `Load Next ${PAGE_SIZE} Parts`
                )}
              </Button>
            </>
          ) : (
            <div
              className="w-full text-center text-xs font-semibold text-slate-600 py-1"
              data-testid="infinite-scroll-end"
            >
              No more parts to load — showing all {total.toLocaleString('en-IN')} matching spare parts.
            </div>
          )}
        </div>
      </Card>

      {/* Add / Edit Spare Part Dialog (Strictly the 5 Required Fields + Set Selection) */}
      <Dialog
        open={addModalOpen || Boolean(editingPart)}
        onClose={() => {
          setAddModalOpen(false);
          setEditingPart(null);
        }}
        title={
          editingPart
            ? `Edit Part · ${isPartSetWithoutPartNumber(editingPart.partSet) ? editingPart.nameModel : editingPart.partNumber}`
            : 'Add Spare Part (5 Details)'
        }
        description="Select the database set (Kubota, Yanmar, GM, Local, Bearings, or Others) and enter the part details."
      >
        <form onSubmit={handleSavePart} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Database Set (Kubota / Yanmar / GM / Local / Bearings / Others) *
            </label>
            <Select
              value={partSet}
              onChange={(e) => handleSetChangeInModal(e.target.value as PartSet)}
              className="w-full"
            >
              <option value="kubota">1. Kubota — Original Parts</option>
              <option value="yanmar">2. Yanmar — Original Parts</option>
              <option value="gm">3. GM — Original Parts</option>
              <option value="local">4. Local — All Other Different Parts</option>
              <option value="bearings">5. Bearings — No Part Number</option>
              <option value="others">6. Others — No Part Number (Nut Bolt, Washer, Gum, Spray, etc.)</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                1. Part Number {isPartSetWithoutPartNumber(partSet) ? '(Not Required)' : '*'}
              </label>
              <Input
                required={!isPartSetWithoutPartNumber(partSet)}
                disabled={isPartSetWithoutPartNumber(partSet)}
                value={isPartSetWithoutPartNumber(partSet) ? '' : partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                placeholder={
                  isPartSetWithoutPartNumber(partSet)
                    ? 'No Part Number (-- for Bearings/Others)'
                    : 'e.g. KB-0105'
                }
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                3. Rack / Bin No *
              </label>
              <Input
                required
                value={rackLocation}
                onChange={(e) => setRackLocation(e.target.value)}
                placeholder={isPartSetWithoutPartNumber(partSet) ? 'e.g. Bin O-01 (Counter)' : 'e.g. Rack K-04'}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              2. Description *
            </label>
            <Input
              required
              value={nameModel}
              onChange={(e) => setNameModel(e.target.value)}
              placeholder={
                isPartSetWithoutPartNumber(partSet)
                  ? 'e.g. Nut Bolt, Plain Washer, Spring Washer, Gasket Gum, Rosting Spray'
                  : 'e.g. Kubota DC-68G - Hydraulic Gear Pump'
              }
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                4. Count (Stock Quantity) *
              </label>
              <Input
                type="number"
                min="0"
                required
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                placeholder="e.g. 20"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                5. Selling Price (₹ INR) *
              </label>
              <Input
                type="number"
                min="1"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 1850"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddModalOpen(false);
                setEditingPart(null);
              }}
              disabled={savingPart}
            >
              Cancel
            </Button>
            <Button type="submit" variant="amber" disabled={savingPart}>
              {savingPart && <LoaderCircle className="w-4 h-4 animate-spin" />}
              {savingPart
                ? 'Saving Part...'
                : editingPart
                ? 'Save Part Changes'
                : 'Add Part to Inventory'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Excel (.xlsx) Import & Restore Dialog */}
      <Dialog
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import Excel (.xlsx) to Dataset"
        description="Select your dataset, upload your Excel sheet, and choose Replace or Merge."
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleImportSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Dataset
            </label>
            <Select
              value={importTargetSet}
              onChange={(e) => setImportTargetSet(e.target.value as PartSet)}
              className="w-full"
            >
              <option value="kubota">1. Kubota Original Parts</option>
              <option value="yanmar">2. Yanmar Original Parts</option>
              <option value="gm">3. GM Original Parts</option>
              <option value="local">4. Local Parts List</option>
              <option value="bearings">5. Bearings</option>
              <option value="others">6. Others (No Part Number)</option>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900">
                Upload Excel Sheet (.xlsx / .xls / .csv)
              </div>
              <div className="text-[11px] text-slate-600 truncate">
                {uploadedFileName
                  ? `${uploadedFileName} (${uploadedRowCount.toLocaleString('en-IN')} items ready)`
                  : 'No Excel file selected yet'}
              </div>
            </div>
            <label className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100 shrink-0">
              Choose Excel File
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.tsv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <label
              className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer text-xs font-semibold transition-colors ${
                replaceTargetSet
                  ? 'border-amber-500 bg-amber-50/70 text-slate-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                checked={replaceTargetSet}
                onChange={() => setReplaceTargetSet(true)}
                className="rounded border-slate-300 text-amber-600"
              />
              Replace the data
            </label>

            <label
              className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer text-xs font-semibold transition-colors ${
                !replaceTargetSet
                  ? 'border-amber-500 bg-amber-50/70 text-slate-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                checked={!replaceTargetSet}
                onChange={() => setReplaceTargetSet(false)}
                className="rounded border-slate-300 text-amber-600"
              />
              Merge the data
            </label>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setImportModalOpen(false)} disabled={importingParts}>
              Cancel
            </Button>
            <Button type="submit" variant="amber" disabled={importingParts}>
              {importingParts && <LoaderCircle className="w-4 h-4 animate-spin" />}
              {importingParts ? 'Importing Parts...' : 'Import to Dataset'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
