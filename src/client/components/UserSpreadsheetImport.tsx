import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Upload, X } from 'lucide-react';

interface UserSpreadsheetImportProps {
  onImportCsvText: (csvText: string) => Promise<void>;
  onPopulateTextarea: (csvText: string) => void;
}

function normalizeHeaderCell(cell: string): string {
  return cell.replace(/[\s\u3000]+/g, '').toLowerCase();
}

const EXCLUDED_POSITION_RE = /^(顧問教員|顧問|監督|コーチ|師範)$/;
const NON_STUDENT_ID_RE = /^(教員|○○|xx)|研究科/;

function isRosterHeaderRow(row: string[]): boolean {
  const joined = row.map(normalizeHeaderCell).join('|');
  const hasName = /(氏名|名前|name)/.test(joined);
  const hasStudentId = /(学籍番号|学生番号|student|メール|mail)/.test(joined);
  return hasName && hasStudentId;
}

function detectRosterStructure(rows: string[][]): {
  headerRowIdx: number;
  endRowIdx: number;
  hasHeader: boolean;
  nameCol: number;
  studentIdCol: number;
  positionCol: number;
} {
  if (rows.length === 0) {
    return {
      headerRowIdx: 0,
      endRowIdx: 0,
      hasHeader: false,
      nameCol: 0,
      studentIdCol: 1,
      positionCol: -1,
    };
  }

  let headerRowIdx = -1;
  const searchLimit = Math.min(rows.length, 40);
  for (let i = 0; i < searchLimit; i++) {
    if (isRosterHeaderRow(rows[i])) {
      headerRowIdx = i;
      break;
    }
  }

  const hasHeader = headerRowIdx >= 0;
  const effectiveHeaderIdx = hasHeader ? headerRowIdx : 0;

  // 2つ目の名簿表（記入例・別表など）が始まったらそこで打ち切る
  let endRowIdx = rows.length;
  for (let i = effectiveHeaderIdx + 1; i < rows.length; i++) {
    const joinedNoSpace = rows[i].map(normalizeHeaderCell).join('');
    if (
      joinedNoSpace.includes('部員名簿') ||
      isRosterHeaderRow(rows[i])
    ) {
      endRowIdx = i;
      break;
    }
  }

  let nameCol = -1;
  let studentIdCol = -1;
  let positionCol = -1;

  if (hasHeader) {
    rows[effectiveHeaderIdx].forEach((cell, idx) => {
      const h = normalizeHeaderCell(cell);
      if (!h) return;
      if (nameCol < 0 && /(氏名|名前|name)/.test(h)) {
        nameCol = idx;
      } else if (
        studentIdCol < 0 &&
        /(学籍番号|学生番号|student|メール|mail|^id$)/.test(h)
      ) {
        studentIdCol = idx;
      } else if (positionCol < 0 && /(役職|職位)/.test(h)) {
        positionCol = idx;
      }
    });
  }

  const maxCols = Math.max(
    ...rows.slice(effectiveHeaderIdx, Math.min(endRowIdx, effectiveHeaderIdx + 15)).map((r) => r.length),
    1,
  );
  const sampleRows = rows.slice(
    hasHeader ? effectiveHeaderIdx + 1 : 0,
    Math.min(endRowIdx, effectiveHeaderIdx + 15),
  );

  if (studentIdCol < 0) {
    for (let col = 0; col < maxCols; col++) {
      const matches = sampleRows.filter((r) => {
        const val = (r[col] ?? '').trim();
        return /^[a-z0-9._-]+(@|$)/i.test(val) && /\d{2,}/.test(val);
      }).length;
      if (matches > 0 && matches >= Math.ceil(sampleRows.length / 3)) {
        studentIdCol = col;
        break;
      }
    }
  }

  if (nameCol < 0) {
    for (let col = 0; col < maxCols; col++) {
      if (col === studentIdCol || col === positionCol) continue;
      const hasText = sampleRows.some((r) => {
        const val = (r[col] ?? '').trim();
        return val.length > 0 && !/^\d+$/.test(val);
      });
      if (hasText) {
        nameCol = col;
        break;
      }
    }
  }

  return {
    headerRowIdx: effectiveHeaderIdx,
    endRowIdx,
    hasHeader,
    nameCol: nameCol >= 0 ? nameCol : 0,
    studentIdCol: studentIdCol >= 0 ? studentIdCol : Math.min(1, maxCols - 1),
    positionCol,
  };
}

function escapeCsvCell(val: string): string {
  const trimmed = val.replace(/\r?\n/g, ' ').trim();
  if (trimmed.includes(',') || trimmed.includes('"')) {
    return `"${trimmed.replace(/"/g, '""')}"`;
  }
  return trimmed;
}

export function UserSpreadsheetImport({
  onImportCsvText,
  onPopulateTextarea,
}: UserSpreadsheetImportProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [rows, setRows] = useState<string[][]>([]);
  const [headerRowIdx, setHeaderRowIdx] = useState(0);
  const [endRowIdx, setEndRowIdx] = useState(0);
  const [hasHeader, setHasHeader] = useState(true);
  const [nameCol, setNameCol] = useState(0);
  const [studentIdCol, setStudentIdCol] = useState(1);
  const [positionCol, setPositionCol] = useState(-1);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadSheetRows = (wb: XLSX.WorkBook, sheetName: string) => {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return;
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    });
    const normalized = raw.map((r) => r.map((c) => String(c ?? '').trim()));

    setRows(normalized);
    const detected = detectRosterStructure(normalized);
    setHeaderRowIdx(detected.headerRowIdx);
    setEndRowIdx(detected.endRowIdx);
    setHasHeader(detected.hasHeader);
    setNameCol(detected.nameCol);
    setStudentIdCol(detected.studentIdCol);
    setPositionCol(detected.positionCol);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      if (wb.SheetNames.length === 0) {
        setParseError('シートが見つかりませんでした。');
        return;
      }
      setFileName(file.name);
      setWorkbook(wb);
      const firstSheet = wb.SheetNames[0];
      setSelectedSheet(firstSheet);
      loadSheetRows(wb, firstSheet);
    } catch (err) {
      setParseError(
        err instanceof Error
          ? `ファイルの読み込みに失敗しました: ${err.message}`
          : 'ファイルの読み込みに失敗しました。',
      );
    }
  };

  const clearFile = () => {
    setFileName(null);
    setWorkbook(null);
    setSelectedSheet('');
    setRows([]);
    setParseError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const columnOptions = useMemo(() => {
    const slice = rows.slice(headerRowIdx, Math.min(endRowIdx, headerRowIdx + 10));
    const maxCols = Math.max(...slice.map((r) => r.length), 0);
    return Array.from({ length: maxCols }, (_, idx) => {
      const sample = (rows[headerRowIdx]?.[idx] ?? '').replace(/\u3000/g, ' ').trim().slice(0, 16);
      const colLabel = XLSX.utils.encode_col(idx);
      return {
        idx,
        label: sample ? `${colLabel}列 (${sample})` : `${colLabel}列`,
      };
    });
  }, [rows, headerRowIdx, endRowIdx]);

  const extractedEntries = useMemo(() => {
    const startIdx = hasHeader ? headerRowIdx + 1 : 0;
    const entries: Array<{ name: string; studentId: string }> = [];
    for (let i = startIdx; i < endRowIdx; i++) {
      const r = rows[i];
      if (!r) continue;
      const name = (r[nameCol] ?? '').trim();
      const studentId = (r[studentIdCol] ?? '').trim();
      if (!name || !studentId) continue;

      if (positionCol >= 0) {
        const pos = (r[positionCol] ?? '').replace(/[\s\u3000]+/g, '');
        if (EXCLUDED_POSITION_RE.test(pos)) continue;
      }
      if (NON_STUDENT_ID_RE.test(studentId)) continue;

      entries.push({ name, studentId });
    }
    return entries;
  }, [rows, hasHeader, headerRowIdx, endRowIdx, nameCol, studentIdCol, positionCol]);

  const generatedCsv = useMemo(() => {
    return extractedEntries
      .map((e) => `${escapeCsvCell(e.studentId)},${escapeCsvCell(e.name)}`)
      .join('\n');
  }, [extractedEntries]);

  const previewRows = extractedEntries;

  const handleDirectImport = async () => {
    if (!generatedCsv.trim()) return;
    setSubmitting(true);
    try {
      await onImportCsvText(generatedCsv);
      clearFile();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-sm border border-zinc-300 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
          <span className="text-sm font-bold text-zinc-800">
            部員名簿 Excel (.xlsx / .xls) ・ CSV ファイルから取り込む
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
            id="user-spreadsheet-file-input"
          />
          <label
            htmlFor="user-spreadsheet-file-input"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer transition"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>ファイルを選択</span>
          </label>
          {fileName && (
            <button
              type="button"
              onClick={clearFile}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm border border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-xs font-semibold text-zinc-600 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>クリア</span>
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        大学提出用の部員名簿 Excel をそのまま選択できます（上部のタイトル・注記、顧問教員、空行、下部の記入例は自動で除外されます）。選択した「氏名」「学籍番号」列以外の情報（電話番号・メアド等）はサーバーに送信されません。
      </p>

      {parseError && (
        <div className="rounded-sm border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {parseError}
        </div>
      )}

      {workbook && rows.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-zinc-200">
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-zinc-600">
            <span>
              読み込みファイル: <strong className="text-zinc-800">{fileName}</strong>
              （抽出対象 <strong className="text-emerald-700">{extractedEntries.length} 名</strong>）
            </span>
            {workbook.SheetNames.length > 1 && (
              <label className="inline-flex items-center gap-1.5">
                <span>シート:</span>
                <select
                  value={selectedSheet}
                  onChange={(e) => {
                    setSelectedSheet(e.target.value);
                    loadSheetRows(workbook, e.target.value);
                  }}
                  className="rounded-sm border border-zinc-300 bg-white px-2 py-1 text-xs"
                >
                  {workbook.SheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                学籍番号列（必須）
              </label>
              <select
                value={studentIdCol}
                onChange={(e) => setStudentIdCol(Number(e.target.value))}
                className="w-full rounded-sm border border-zinc-300 bg-white px-2.5 py-1.5 text-xs"
              >
                {columnOptions.map((opt) => (
                  <option key={opt.idx} value={opt.idx}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                氏名列（必須）
              </label>
              <select
                value={nameCol}
                onChange={(e) => setNameCol(Number(e.target.value))}
                className="w-full rounded-sm border border-zinc-300 bg-white px-2.5 py-1.5 text-xs"
              >
                {columnOptions.map((opt) => (
                  <option key={opt.idx} value={opt.idx}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
            />
            <span>見出し行（{headerRowIdx + 1}行目）をデータから除外する</span>
          </label>

          {previewRows.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] text-zinc-500">
                抽出プレビュー（全 {previewRows.length} 名・スクロールで全員確認できます）
              </div>
              <div className="max-h-60 overflow-y-auto overflow-x-auto border border-zinc-200 rounded-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-zinc-100 border-b border-zinc-200 text-zinc-700 font-bold">
                    <tr>
                      <th className="px-3 py-1.5 w-12">#</th>
                      <th className="px-3 py-1.5">学籍番号</th>
                      <th className="px-3 py-1.5">氏名</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {previewRows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-1.5 text-zinc-400 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-zinc-700">
                          {row.studentId}
                        </td>
                        <td className="px-3 py-1.5 font-semibold text-zinc-800">
                          {row.name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                onPopulateTextarea(generatedCsv);
                clearFile();
              }}
              className="px-3 py-1.5 rounded-sm border border-zinc-300 bg-white hover:bg-zinc-100 text-xs font-bold text-zinc-700 cursor-pointer"
            >
              下のテキスト欄に展開する
            </button>
            <button
              type="button"
              disabled={submitting || !generatedCsv.trim()}
              onClick={handleDirectImport}
              className="px-4 py-1.5 rounded-sm bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {submitting
                ? '登録中...'
                : `この ${extractedEntries.length} 名を新規登録（重複はスキップ）`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
