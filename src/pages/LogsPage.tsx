import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Copy, RefreshCw } from "lucide-react";
import Prism from "prismjs";
import "prismjs/components/prism-json";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { Modal } from "../ui/Modal";
import { tauriInvoke } from "../utils/appLogger";
import "./LogsPage.css";

type LogItem = {
  id: number;
  kind: "error" | "warn" | "info";
  type: string;
  description: string;
  meta: unknown;
  createdAt: number;
  traceId: string;
};

type LogListResult = {
  items: LogItem[];
  nextOffset: number | null;
};

type SortField = "id" | "kind" | "trace_id" | "type" | "created_at";
type SortDir = "asc" | "desc";

type TextFilters = {
  id: string;
  traceId: string;
  createdFromRaw: string;
  createdToRaw: string;
};

type EnumPick = {
  kind: string;
  type: string;
};

const PAGE_SIZE = 60;

const EMPTY_TEXT_FILTERS: TextFilters = {
  id: "",
  traceId: "",
  createdFromRaw: "",
  createdToRaw: "",
};

const EMPTY_ENUM_PICK: EnumPick = {
  kind: "",
  type: "",
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function trimOrUndef(s: string): string | undefined {
  const t = s.trim();
  return t.length ? t : undefined;
}

/** dd.mm.yyyy [hh:mm[:ss]] — локальное время (как в ru-RU: «06.04.2026, 23:31:39») */
function parseDdMmYyyyTime(s: string): number | undefined {
  const t = s.trim();
  const m = t.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:(?:\s*,\s*|\s+)(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
  );
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const hh = m[4] !== undefined ? Number(m[4]) : 0;
  const mm = m[5] !== undefined ? Number(m[5]) : 0;
  const ss = m[6] !== undefined ? Number(m[6]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  if (hh > 23 || mm > 59 || ss > 59) return undefined;
  const d = new Date(year, month - 1, day, hh, mm, ss);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return undefined;
  }
  return Math.floor(d.getTime() / 1000);
}

/** Unix seconds: unix, ISO, dd.mm.yyyy hh:mm */
function parseFlexibleTime(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n > 1e12 ? Math.floor(n / 1000) : n;
  }
  const ru = parseDdMmYyyyTime(t);
  if (ru !== undefined) return ru;
  const ms = Date.parse(t);
  if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
  return undefined;
}

/** Значение для `datetime-local` из распознанного текста (локальное время). */
function toDatetimeLocalValue(raw: string): string {
  const u = parseFlexibleTime(raw);
  if (u === undefined) return "";
  const d = new Date(u * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

type PickerCapableInput = HTMLInputElement & {
  showPicker?: () => void;
  hidePicker?: () => void;
};

/** Попап привязывается к bounding box input — он должен совпадать с кнопкой, не быть 1×1 в углу. */
function toggleNativeDateTimePicker(
  input: HTMLInputElement | null,
  openRef: MutableRefObject<boolean>,
) {
  if (!input) return;
  const el = input as PickerCapableInput;
  if (openRef.current) {
    try {
      if (typeof el.hidePicker === "function") {
        el.hidePicker();
      }
    } catch {
      /* нет в старых WebView */
    }
    el.blur();
    openRef.current = false;
    return;
  }
  try {
    if (typeof el.showPicker === "function") {
      void el.showPicker();
      openRef.current = true;
      return;
    }
  } catch {
    /* fallback */
  }
  el.focus({ preventScroll: true });
  el.click();
  openRef.current = true;
}

function filtersToPayload(text: TextFilters, enums: EnumPick): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const add = (key: string, v: string) => {
    const u = trimOrUndef(v);
    if (u !== undefined) out[key] = u;
  };
  add("id", text.id);
  add("kind", enums.kind);
  add("type", enums.type);
  add("traceId", text.traceId);
  const fromUnix = parseFlexibleTime(text.createdFromRaw);
  const toUnix = parseFlexibleTime(text.createdToRaw);
  if (fromUnix !== undefined) out.createdFrom = fromUnix;
  if (toUnix !== undefined) out.createdTo = toUnix;
  return out;
}

type TimeDisplayMode = "local" | "unix" | "unix_int" | "custom";

function formatTimestamp(unixSeconds: number, mode: TimeDisplayMode, customTimeZone: string): string {
  const date = new Date(unixSeconds * 1000);
  if (mode === "unix") {
    // UTC time (+00:00) view.
    return date.toISOString().replace("T", " ").replace("Z", " +00:00");
  }
  if (mode === "unix_int") return String(unixSeconds);
  if (mode === "custom" && customTimeZone.trim()) {
    try {
      return new Intl.DateTimeFormat("ru-RU", {
        timeZone: customTimeZone.trim(),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date);
    } catch {
      return date.toLocaleString();
    }
  }
  return date.toLocaleString();
}

function JsonBlock({ value }: { value: unknown }) {
  const json = useMemo(() => {
    try {
      return JSON.stringify(value ?? {}, null, 2);
    } catch {
      return "{}";
    }
  }, [value]);

  const html = useMemo(() => Prism.highlight(json, Prism.languages.json, "json"), [json]);

  return (
    <pre className="logsPage__jsonPre">
      <code className="language-json" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

function CopyValueButton({ value, label = "Копировать" }: { value: string; label?: string }) {
  return (
    <button
      type="button"
      className="logsPage__copyBtn"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(value);
      }}
    >
      <Copy className="logsPage__copyIcon" aria-hidden />
    </button>
  );
}

function CellWithCopy({ value, display }: { value: string; display: ReactNode }) {
  return (
    <div className="logsPage__cellInner">
      <span className="logsPage__cellText">{display}</span>
      <CopyValueButton value={value} />
    </div>
  );
}

function displayNullableCellValue(value: unknown): ReactNode {
  if (value == null) return <span className="dataTable__null">NULL</span>;
  return String(value);
}

type LogFilterOptions = {
  kinds: string[];
  types: string[];
};

const LOGS_TABLE_COLGROUP = (
  <colgroup>
    <col className="logsPage__col logsPage__col--id" />
    <col className="logsPage__col logsPage__col--kind" />
    <col className="logsPage__col logsPage__col--trace" />
    <col className="logsPage__col logsPage__col--type" />
    <col className="logsPage__col logsPage__col--desc" />
    <col className="logsPage__col logsPage__col--created" />
  </colgroup>
);

export function LogsPage() {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const createdFromPickerRef = useRef<HTMLInputElement | null>(null);
  const createdToPickerRef = useRef<HTMLInputElement | null>(null);
  const createdFromPickerOpenRef = useRef(false);
  const createdToPickerOpenRef = useRef(false);
  const queryClient = useQueryClient();
  const [draftText, setDraftText] = useState<TextFilters>(EMPTY_TEXT_FILTERS);
  const appliedText = useDebouncedValue(draftText, 320);
  const [enumPick, setEnumPick] = useState<EnumPick>(EMPTY_ENUM_PICK);
  const [sortField, setSortField] = useState<SortField>("id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [timeMode, setTimeMode] = useState<TimeDisplayMode>("local");
  const [customTimeZone, setCustomTimeZone] = useState("");
  const [selected, setSelected] = useState<LogItem | null>(null);

  const filterOptionsQ = useQuery({
    queryKey: ["logs.filterOptions"],
    queryFn: () => tauriInvoke<LogFilterOptions>("log_filter_options"),
    staleTime: 30_000,
  });

  const q = useInfiniteQuery({
    queryKey: ["logs.infinite", appliedText, enumPick, sortField, sortDir] as const,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      tauriInvoke<LogListResult>("log_list", {
        input: {
          offset: pageParam,
          limit: PAGE_SIZE,
          filter: filtersToPayload(appliedText, enumPick),
          sort: { field: sortField, dir: sortDir },
        },
      }),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });

  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);

  useEffect(() => {
    if (filterOptionsQ.isError && filterOptionsQ.error) {
      console.error("[LogsPage] log_filter_options failed", filterOptionsQ.error);
    }
  }, [filterOptionsQ.isError, filterOptionsQ.error]);

  useEffect(() => {
    if (q.isError && q.error) {
      console.error("[LogsPage] log_list failed", q.error);
    }
  }, [q.isError, q.error]);

  useEffect(() => {
    const root = bodyScrollRef.current;
    const el = sentinelRef.current;
    if (!root || !el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (q.hasNextPage && !q.isFetchingNextPage) {
          void q.fetchNextPage();
        }
      },
      { root, threshold: 0.05 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "id" || field === "created_at" ? "desc" : "asc");
    }
  }

  function sortLabel(field: SortField): string {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  function refreshLogs() {
    void queryClient.invalidateQueries({ queryKey: ["logs.infinite"] });
    void queryClient.invalidateQueries({ queryKey: ["logs.filterOptions"] });
  }

  return (
    <div className="logsPage">
      <div className="logsPage__topBar">
        <div className="logsPage__timeBar">
          <label className="logsPage__timeLabel">
            <span>Время:</span>
            <select
              className="logsPage__filter logsPage__filterSelect logsPage__timeSelect"
              value={timeMode}
              onChange={(e) => setTimeMode(e.target.value as TimeDisplayMode)}
            >
              <option value="local">local</option>
              <option value="unix">unix (+00:00)</option>
              <option value="unix_int">unix(int)</option>
              <option value="custom">custom tz</option>
            </select>
          </label>
          {timeMode === "custom" ? (
            <input
              className="logsPage__filter logsPage__tzInput"
              value={customTimeZone}
              onChange={(e) => setCustomTimeZone(e.target.value)}
              placeholder="Europe/Moscow"
            />
          ) : null}
          <button type="button" className="logsPage__refreshBtn" title="Обновить список" onClick={refreshLogs}>
            <RefreshCw className="logsPage__refreshIcon" aria-hidden />
            <span className="logsPage__refreshLabel">Обновить</span>
          </button>
        </div>
      </div>

      <div className="logsPage__tableShell">
        <div className="logsPage__theadWrap">
          <table className="logsPage__table logsPage__tableHead">
            {LOGS_TABLE_COLGROUP}
            <thead>
              <tr>
                <th className="logsPage__th">
                  <button type="button" className="logsPage__sortBtn" onClick={() => toggleSort("id")}>
                    id{sortLabel("id")}
                  </button>
                </th>
                <th className="logsPage__th">
                  <button type="button" className="logsPage__sortBtn" onClick={() => toggleSort("kind")}>
                    kind{sortLabel("kind")}
                  </button>
                </th>
                <th className="logsPage__th">
                  <button type="button" className="logsPage__sortBtn" onClick={() => toggleSort("trace_id")}>
                    trace_id{sortLabel("trace_id")}
                  </button>
                </th>
                <th className="logsPage__th">
                  <button type="button" className="logsPage__sortBtn" onClick={() => toggleSort("type")}>
                    type{sortLabel("type")}
                  </button>
                </th>
                <th className="logsPage__th">
                  <span className="logsPage__thPlain">description</span>
                </th>
                <th className="logsPage__th">
                  <button type="button" className="logsPage__sortBtn" onClick={() => toggleSort("created_at")}>
                    created_at{sortLabel("created_at")}
                  </button>
                </th>
              </tr>
              <tr className="logsPage__filterRow">
                <td className="logsPage__td">
                  <input
                    className="logsPage__filter"
                    aria-label="filter id"
                    inputMode="numeric"
                    value={draftText.id}
                    onChange={(e) => setDraftText((f) => ({ ...f, id: e.target.value }))}
                    placeholder="…"
                  />
                </td>
                <td className="logsPage__td">
                  <select
                    className="logsPage__filter logsPage__filterSelect"
                    aria-label="filter kind"
                    value={enumPick.kind}
                    onChange={(e) => setEnumPick((f) => ({ ...f, kind: e.target.value }))}
                  >
                    <option value="">Все</option>
                    {(filterOptionsQ.data?.kinds ?? []).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="logsPage__td">
                  <input
                    className="logsPage__filter"
                    aria-label="filter trace_id"
                    autoComplete="off"
                    spellCheck={false}
                    value={draftText.traceId}
                    onChange={(e) => setDraftText((f) => ({ ...f, traceId: e.target.value }))}
                    placeholder="…"
                  />
                </td>
                <td className="logsPage__td">
                  <select
                    className="logsPage__filter logsPage__filterSelect"
                    aria-label="filter type"
                    value={enumPick.type}
                    onChange={(e) => setEnumPick((f) => ({ ...f, type: e.target.value }))}
                  >
                    <option value="">Все</option>
                    {(filterOptionsQ.data?.types ?? []).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="logsPage__td logsPage__tdFilterEmpty" aria-hidden />
                <td className="logsPage__td logsPage__tdStack">
                  <div className="logsPage__timeField">
                    <span className="logsPage__timeFieldLabel">from</span>
                    <input
                      className="logsPage__timeFieldInput"
                      type="text"
                      aria-label="created from"
                      autoComplete="off"
                      spellCheck={false}
                      value={draftText.createdFromRaw}
                      onChange={(e) => setDraftText((f) => ({ ...f, createdFromRaw: e.target.value }))}
                      placeholder="unix · ISO · dd.mm.yyyy hh:mm"
                    />
                    <div className="logsPage__timeFieldCalAnchor">
                      <input
                        ref={createdFromPickerRef}
                        className="logsPage__timeFieldNativePicker"
                        type="datetime-local"
                        step={1}
                        tabIndex={-1}
                        aria-hidden
                        value={toDatetimeLocalValue(draftText.createdFromRaw)}
                        onChange={(e) =>
                          setDraftText((f) => ({ ...f, createdFromRaw: e.target.value }))
                        }
                        onBlur={(ev) => {
                          const next = ev.relatedTarget as Node | null;
                          if (next && ev.currentTarget.parentElement?.contains(next)) return;
                          createdFromPickerOpenRef.current = false;
                        }}
                      />
                      <button
                        type="button"
                        className="logsPage__timeFieldCalBtn"
                        title="Календарь: открыть или закрыть"
                        aria-label="Календарь from: открыть или закрыть"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleNativeDateTimePicker(
                            createdFromPickerRef.current,
                            createdFromPickerOpenRef,
                          );
                        }}
                      >
                        <Calendar className="logsPage__timeFieldCalIcon" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="logsPage__timeField">
                    <span className="logsPage__timeFieldLabel">to</span>
                    <input
                      className="logsPage__timeFieldInput"
                      type="text"
                      aria-label="created to"
                      autoComplete="off"
                      spellCheck={false}
                      value={draftText.createdToRaw}
                      onChange={(e) => setDraftText((f) => ({ ...f, createdToRaw: e.target.value }))}
                      placeholder="unix · ISO · dd.mm.yyyy hh:mm"
                    />
                    <div className="logsPage__timeFieldCalAnchor">
                      <input
                        ref={createdToPickerRef}
                        className="logsPage__timeFieldNativePicker"
                        type="datetime-local"
                        step={1}
                        tabIndex={-1}
                        aria-hidden
                        value={toDatetimeLocalValue(draftText.createdToRaw)}
                        onChange={(e) =>
                          setDraftText((f) => ({ ...f, createdToRaw: e.target.value }))
                        }
                        onBlur={(ev) => {
                          const next = ev.relatedTarget as Node | null;
                          if (next && ev.currentTarget.parentElement?.contains(next)) return;
                          createdToPickerOpenRef.current = false;
                        }}
                      />
                      <button
                        type="button"
                        className="logsPage__timeFieldCalBtn"
                        title="Календарь: открыть или закрыть"
                        aria-label="Календарь to: открыть или закрыть"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleNativeDateTimePicker(
                            createdToPickerRef.current,
                            createdToPickerOpenRef,
                          );
                        }}
                      >
                        <Calendar className="logsPage__timeFieldCalIcon" aria-hidden />
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </thead>
          </table>
        </div>

        <div ref={bodyScrollRef} className="logsPage__tbodyScroll">
          <table className="logsPage__table logsPage__tableBody">
            {LOGS_TABLE_COLGROUP}
            <tbody>
              {items.map((x) => {
                const createdDisplay = formatTimestamp(x.createdAt, timeMode, customTimeZone);
                return (
                  <tr
                    key={x.id}
                    className={`logsPage__row logsPage__row_${x.kind}`}
                    onClick={() => setSelected(x)}
                    title="Открыть meta"
                  >
                    <td className="logsPage__td logsPage__cell">
                      <CellWithCopy value={String(x.id)} display={x.id} />
                    </td>
                    <td className="logsPage__td logsPage__cell">
                      <CellWithCopy value={x.kind == null ? "NULL" : String(x.kind)} display={displayNullableCellValue(x.kind)} />
                    </td>
                    <td className="logsPage__td logsPage__cell">
                      <CellWithCopy
                        value={x.traceId == null ? "NULL" : String(x.traceId)}
                        display={displayNullableCellValue(x.traceId)}
                      />
                    </td>
                    <td className="logsPage__td logsPage__cell">
                      <CellWithCopy value={x.type == null ? "NULL" : String(x.type)} display={displayNullableCellValue(x.type)} />
                    </td>
                    <td className="logsPage__td logsPage__cell" title={x.description}>
                      <CellWithCopy
                        value={x.description == null ? "NULL" : String(x.description)}
                        display={displayNullableCellValue(x.description)}
                      />
                    </td>
                    <td className="logsPage__td logsPage__cell">
                      <CellWithCopy value={createdDisplay} display={createdDisplay} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!q.isLoading && items.length === 0 ? <div className="logsPage__empty">Логи пока пустые</div> : null}
          <div ref={sentinelRef} className="logsPage__sentinel" />
          {q.isFetchingNextPage ? <div className="logsPage__loading">Загрузка...</div> : null}
        </div>
      </div>

      <Modal
        open={selected !== null}
        title={selected ? `Лог #${selected.id}` : ""}
        titleId="logs-meta-modal-title"
        busy={false}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div className="logsPage__modalBody">
            <dl className="logsPage__dl">
              <div>
                <dt>kind</dt>
                <dd>{selected.kind}</dd>
              </div>
              <div>
                <dt>trace_id</dt>
                <dd>{selected.traceId}</dd>
              </div>
              <div>
                <dt>type</dt>
                <dd>{selected.type}</dd>
              </div>
              <div>
                <dt>description</dt>
                <dd>{selected.description}</dd>
              </div>
              <div>
                <dt>created_at</dt>
                <dd>{formatTimestamp(selected.createdAt, timeMode, customTimeZone)}</dd>
              </div>
            </dl>
            <div className="logsPage__jsonWrap">
              <div className="logsPage__jsonLabel">meta</div>
              <JsonBlock value={selected.meta} />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
