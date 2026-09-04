import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import {
  CloudSun, Bitcoin, TrendingUp, TrendingDown, ArrowRight, X,
  CheckCircle, FileText, LayoutTemplate, Calendar as CalIcon,
  Calculator, Activity, ListTodo, Gauge, ClipboardList, Users,
  ShoppingCart, Package, Receipt, AlertTriangle, DollarSign,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { formatMoney, getStockLevel, STOCK_LEVEL_STYLES, STOCK_LEVEL_LABELS } from '../types/fsm';
import {
  AiAgentWidget,
  IndustryNewsWidget,
  ComplianceDeadlinesWidget,
  CashFlowWidget,
  KpiScorecardWidget,
  TeamActivityWidget,
  AgentRemindersWidget,
  AgentActivityWidget,
} from './IntelligenceWidgets';
export interface WidgetProps {
  config: Record<string, unknown>;
  onConfigChange?: (config: Record<string, unknown>) => void;
}

interface InspectionRow {
  id: string;
  status: string;
  meta: Record<string, string>;
  started_at: string;
  completed_at: string | null;
  template_snapshot: Record<string, unknown>;
}

interface TemplateRow {
  id: string;
  name: string;
  report_renderer: string;
  created_at: string;
}

// ─── Weather Widget ──────────────────────────────────────────────
export function WeatherWidget({ config, onConfigChange }: WidgetProps) {
  const city = (config.city as string) || 'Auckland';
  const [editing, setEditing] = useState(false);
  const [cityInput, setCityInput] = useState(city);

  // Geocode the city name to lat/long, then fetch weather
  const { data: geo } = useQuery({
    queryKey: ['geo', city],
    queryFn: async () => {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      );
      if (!res.ok) throw new Error('Geo failed');
      const json = await res.json();
      return json.results?.[0] ?? null;
    },
  });

  const { data: weather, isLoading: wLoading, error: wError } = useQuery({
    queryKey: ['weather-coords', geo?.latitude, geo?.longitude],
    queryFn: async () => {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`,
      );
      if (!res.ok) throw new Error('Weather fetch failed');
      return res.json();
    },
    enabled: !!geo?.latitude,
    refetchInterval: 600000,
  });

  const codeMap: Record<number, { label: string; icon: string }> = {
    0: { label: 'Clear sky', icon: '☀️' },
    1: { label: 'Mainly clear', icon: '🌤️' },
    2: { label: 'Partly cloudy', icon: '⛅' },
    3: { label: 'Overcast', icon: '☁️' },
    45: { label: 'Fog', icon: '🌫️' },
    51: { label: 'Light drizzle', icon: '🌦️' },
    53: { label: 'Drizzle', icon: '🌦️' },
    61: { label: 'Light rain', icon: '🌧️' },
    63: { label: 'Rain', icon: '🌧️' },
    71: { label: 'Light snow', icon: '🌨️' },
    73: { label: 'Snow', icon: '❄️' },
    80: { label: 'Rain showers', icon: '🌦️' },
    95: { label: 'Thunderstorm', icon: '⛈️' },
  };

  const cond = weather?.current ? codeMap[weather.current.weather_code] ?? { label: 'Unknown', icon: '🌡️' } : null;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <CloudSun size={14} className="text-blue-500" />
          <span className="text-xs font-semibold text-[#4A5568]">Weather</span>
        </div>
        <button
          onClick={() => setEditing(e => !e)}
          className="text-[10px] text-blue-500 hover:underline"
        >
          {city}
        </button>
      </div>
      {editing && (
        <div className="mb-2 flex gap-1">
          <input
            value={cityInput}
            onChange={e => setCityInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                onConfigChange?.({ ...config, city: cityInput.trim() });
                setEditing(false);
              }
            }}
            className="flex-1 min-h-[44px] h-auto text-xs border border-gray-200 rounded px-2 py-2 outline-none focus:border-blue-400"
            placeholder="City name…"
            autoFocus
          />
          <button
            onClick={() => { onConfigChange?.({ ...config, city: cityInput.trim() }); setEditing(false); }}
            className="text-xs bg-blue-500 text-white rounded px-2 py-1"
          >OK</button>
        </div>
      )}
      {wLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : wError || !weather?.current ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Weather unavailable</div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-4xl mb-1">{cond?.icon}</div>
          <div className="text-2xl font-bold text-[#1A1A1A]">{Math.round(weather.current.temperature_2m)}°C</div>
          <div className="text-xs text-gray-500">{cond?.label}</div>
          <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
            <span>💨 {Math.round(weather.current.wind_speed_10m)} km/h</span>
            <span>💧 {weather.current.relative_humidity_2m}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bitcoin Widget (CoinGecko free API + following list) ────────

export function BitcoinWidget({ config, onConfigChange }: WidgetProps) {
  const following = (config.following as string[]) || [];
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; symbol: string; thumb: string }[]>([]);
  const [searching, setSearching] = useState(false);

  // Fetch BTC + all followed coins in one request
  const allIds = ['bitcoin', ...following.filter(id => id !== 'bitcoin')];
  const { data, isLoading, error } = useQuery({
    queryKey: ['crypto-prices', allIds.join(',')],
    queryFn: async () => {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(allIds.join(','))}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`,
      );
      if (!res.ok) throw new Error('Price fetch failed');
      const json = await res.json();
      return json as Record<string, { usd: number; usd_24h_change: number; last_updated_at: number }>;
    },
    refetchInterval: 60000,
  });

  // Search CoinGecko for coins to add
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(search.trim())}`);
        if (!res.ok) return;
        const json = await res.json();
        setSearchResults((json.coins ?? []).slice(0, 6).map((c: { id: string; name: string; symbol: string; thumb: string }) => ({
          id: c.id, name: c.name, symbol: c.symbol, thumb: c.thumb,
        })));
      } catch { /* ignore */ }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  function addCoin(id: string) {
    if (following.includes(id) || id === 'bitcoin') { setSearch(''); setSearchResults([]); setAdding(false); return; }
    onConfigChange?.({ ...config, following: [...following, id] });
    setSearch(''); setSearchResults([]); setAdding(false);
  }

  function removeCoin(id: string) {
    onConfigChange?.({ ...config, following: following.filter(c => c !== id) });
  }

  const btcData = data?.['bitcoin'];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Bitcoin size={14} className="text-orange-500" />
          <span className="text-xs font-semibold text-[#4A5568]">Crypto</span>
        </div>
        <button onClick={() => setAdding(a => !a)} className="text-[10px] text-blue-500 hover:underline">
          {adding ? 'Done' : '+ Add coin'}
        </button>
      </div>

      {/* BTC hero price */}
      {isLoading ? (
        <div className="py-3 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : error || !btcData ? (
        <div className="py-3 flex items-center justify-center text-xs text-gray-400">Price unavailable</div>
      ) : (
        <div className="flex items-baseline gap-2 px-1 py-1.5">
          <div className="text-xl font-bold text-[#1A1A1A]">
            ${btcData.usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div className={`flex items-center gap-0.5 text-[10px] font-medium ${btcData.usd_24h_change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {btcData.usd_24h_change >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {btcData.usd_24h_change?.toFixed(2)}%
          </div>
          <span className="text-[9px] text-gray-400 ml-auto">BTC</span>
        </div>
      )}

      {/* Add coin search */}
      {adding && (
        <div className="px-1 pb-1.5 relative">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full min-h-[44px] h-auto text-xs border border-gray-200 rounded px-2 py-2 outline-none focus:border-blue-400"
            placeholder="Search coins (e.g. ethereum, solana)…"
            autoFocus
          />
          {searching && <div className="text-[9px] text-gray-400 mt-1">Searching…</div>}
          {searchResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-[calc(100%-8px)] bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-auto">
              {searchResults.map(c => (
                <button
                  key={c.id}
                  onClick={() => addCoin(c.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-blue-50 text-left transition-colors"
                >
                  <img src={c.thumb} alt="" className="w-4 h-4 rounded-full" />
                  <span className="text-xs font-medium text-[#1A1A1A] truncate">{c.name}</span>
                  <span className="text-[9px] text-gray-400 uppercase">{c.symbol}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Following list */}
      <div className="flex-1 overflow-auto -mx-1 px-1 space-y-0.5 min-h-0">
        {following.length === 0 && !adding && (
          <div className="flex items-center justify-center h-full text-[10px] text-gray-400">
            Click "+ Add coin" to follow more
          </div>
        )}
        {following.map(id => {
          const coin = data?.[id];
          return (
            <div key={id} className="group flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[10px] font-medium text-gray-500 uppercase truncate">{id}</span>
                  {coin && (
                    <span className="text-xs font-semibold text-[#1A1A1A]">
                      ${coin.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
                {coin ? (
                  <div className={`text-[9px] ${coin.usd_24h_change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {coin.usd_24h_change >= 0 ? '+' : ''}{coin.usd_24h_change?.toFixed(2)}%
                  </div>
                ) : (
                  <div className="text-[9px] text-gray-300">—</div>
                )}
              </div>
              <button
                onClick={() => removeCoin(id)}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Crypto Widget (configurable symbol) ─────────────────────────
export function CryptoWidget({ config, onConfigChange }: WidgetProps) {
  const symbol = (config.symbol as string) || 'ethereum';
  const [editing, setEditing] = useState(false);
  const [symInput, setSymInput] = useState(symbol);

  const { data, isLoading, error } = useQuery({
    queryKey: ['crypto-price', symbol],
    queryFn: async () => {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(symbol)}&vs_currencies=usd&include_24hr_change=true`);
      if (!res.ok) throw new Error('Price fetch failed');
      const json = await res.json();
      const entry = json[symbol];
      if (!entry) throw new Error('Symbol not found');
      return { price: entry.usd, change: entry.usd_24h_change };
    },
    refetchInterval: 60000,
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-green-500 font-bold text-sm">＄</span>
          <span className="text-xs font-semibold text-[#4A5568] uppercase">{symbol}</span>
        </div>
        <button onClick={() => setEditing(e => !e)} className="text-[10px] text-blue-500 hover:underline">edit</button>
      </div>
      {editing && (
        <div className="mb-2 flex gap-1">
          <input
            value={symInput}
            onChange={e => setSymInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                onConfigChange?.({ ...config, symbol: symInput.trim().toLowerCase() });
                setEditing(false);
              }
            }}
            className="flex-1 min-h-[44px] h-auto text-xs border border-gray-200 rounded px-2 py-2 outline-none focus:border-blue-400"
            placeholder="e.g. solana"
            autoFocus
          />
          <button
            onClick={() => { onConfigChange?.({ ...config, symbol: symInput.trim().toLowerCase() }); setEditing(false); }}
            className="text-xs bg-blue-500 text-white rounded px-2 py-1"
          >OK</button>
        </div>
      )}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Price unavailable</div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-[#1A1A1A]">
            ${data?.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </div>
          <div className={`flex items-center gap-1 text-xs mt-1 ${data && data.change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {data && data.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{data?.change?.toFixed(2)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Market Overview Widget ──────────────────────────────────────
export function MarketOverviewWidget() {
  const indices = [
    { symbol: '^GSPC', label: 'S&P 500' },
    { symbol: '^IXIC', label: 'Nasdaq' },
    { symbol: '^DJI', label: 'Dow Jones' },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingUp size={14} className="text-green-500" />
        <span className="text-xs font-semibold text-[#4A5568]">Market Overview</span>
      </div>
      <div className="flex-1 flex flex-col justify-center gap-2">
        {indices.map(idx => <MarketRow key={idx.symbol} label={idx.label} />)}
      </div>
    </div>
  );
}

function MarketRow({ label }: { label: string }) {
  const { data } = useQuery({
    queryKey: ['market', label],
    queryFn: async () => {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=1d`);
      if (!res.ok) return null;
      const json = await res.json();
      const meta = json.chart?.result?.[0]?.meta;
      return { price: meta?.regularMarketPrice, prev: meta?.chartPreviousClose };
    },
    refetchInterval: 300000,
  });

  const change = data && data.price && data.prev ? ((data.price - data.prev) / data.prev) * 100 : 0;

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        {data?.price && <span className="font-medium text-[#1A1A1A]">{data.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>}
        {data?.price && (
          <span className={`text-[10px] ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </span>
        )}
        {!data?.price && <span className="text-gray-300 text-[10px]">—</span>}
      </div>
    </div>
  );
}

// ─── Clock Widget ────────────────────────────────────────────────
export function ClockWidget() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="text-3xl font-bold text-[#1A1A1A] tabular-nums">{format(now, 'HH:mm')}</div>
      <div className="text-xs text-gray-500 mt-1">{format(now, 'EEEE, d MMM')}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">{format(now, 'yyyy')}</div>
    </div>
  );
}

// ─── Calendar Widget ─────────────────────────────────────────────
export function CalendarWidget() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <CalIcon size={14} className="text-blue-500" />
        <span className="text-xs font-semibold text-[#4A5568]">{format(today, 'MMMM yyyy')}</span>
      </div>
      <div className="flex-1 grid grid-cols-7 gap-0.5 text-center">
        {weekDays.map((d, i) => <div key={i} className="text-[9px] font-medium text-gray-400">{d}</div>)}
        {cells.map((day, i) => (
          <div
            key={i}
            className={`text-[10px] flex items-center justify-center rounded ${
              day === today.getDate()
                ? 'bg-blue-500 text-white font-bold'
                : day
                  ? 'text-gray-600 hover:bg-gray-100'
                  : ''
            }`}
          >
            {day}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Calculator Widget ───────────────────────────────────────────
export function CalculatorWidget() {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [resetNext, setResetNext] = useState(false);

  const inputDigit = useCallback((d: string) => {
    if (resetNext) { setDisplay(d); setResetNext(false); }
    else setDisplay(display === '0' ? d : display + d);
  }, [display, resetNext]);

  const inputDot = () => {
    if (resetNext) { setDisplay('0.'); setResetNext(false); return; }
    if (!display.includes('.')) setDisplay(display + '.');
  };

  const compute = (a: number, b: number, operator: string): number => {
    switch (operator) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? 0 : a / b;
      default: return b;
    }
  };

  const handleOp = (nextOp: string) => {
    const current = parseFloat(display);
    if (prev !== null && op && !resetNext) {
      const result = compute(prev, current, op);
      setPrev(result);
      setDisplay(String(result));
    } else {
      setPrev(current);
    }
    setOp(nextOp);
    setResetNext(true);
  };

  const handleEquals = () => {
    if (prev !== null && op) {
      const current = parseFloat(display);
      const result = compute(prev, current, op);
      setDisplay(String(result));
      setPrev(null);
      setOp(null);
      setResetNext(true);
    }
  };

  const clear = () => { setDisplay('0'); setPrev(null); setOp(null); setResetNext(false); };

  const btnClass = "rounded-lg text-sm font-medium transition-colors active:scale-95";
  const numClass = `${btnClass} bg-gray-50 hover:bg-gray-100 text-[#1A1A1A]`;
  const opClass = `${btnClass} bg-blue-50 hover:bg-blue-100 text-blue-600`;
  const eqClass = `${btnClass} bg-blue-500 hover:bg-blue-600 text-white`;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-1">
        <Calculator size={14} className="text-blue-500" />
        <span className="text-xs font-semibold text-[#4A5568]">Calculator</span>
      </div>
      <div className="bg-gray-50 rounded-lg px-3 py-2 text-right mb-1.5">
        <span className="text-lg font-semibold text-[#1A1A1A] tabular-nums">{display}</span>
      </div>
      <div className="flex-1 grid grid-cols-4 gap-1">
        <button className={`${numClass} col-span-2`} onClick={clear}>C</button>
        <button className={opClass} onClick={() => handleOp('÷')}>÷</button>
        <button className={opClass} onClick={() => handleOp('×')}>×</button>
        {['7', '8', '9'].map(n => <button key={n} className={numClass} onClick={() => inputDigit(n)}>{n}</button>)}
        <button className={opClass} onClick={() => handleOp('-')}>-</button>
        {['4', '5', '6'].map(n => <button key={n} className={numClass} onClick={() => inputDigit(n)}>{n}</button>)}
        <button className={opClass} onClick={() => handleOp('+')}>+</button>
        {['1', '2', '3'].map(n => <button key={n} className={numClass} onClick={() => inputDigit(n)}>{n}</button>)}
        <button className={eqClass} onClick={handleEquals}>=</button>
        <button className={`${numClass} col-span-2`} onClick={inputDot}>.</button>
        <button className={numClass} onClick={() => inputDigit('0')}>0</button>
      </div>
    </div>
  );
}

// ─── Recent Inspections Widget ───────────────────────────────────
export function RecentInspectionsWidget() {
  const navigate = useNavigate();
  const { data: inspections, isLoading } = useQuery<InspectionRow[]>({
    queryKey: ['inspections', 'recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('id, status, meta, started_at, template_snapshot')
        .order('started_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as InspectionRow[];
    },
  });

  const statusMap: Record<string, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'bg-amber-100 text-amber-700' },
    completed: { label: 'Done', color: 'bg-green-100 text-green-700' },
    issued: { label: 'Issued', color: 'bg-blue-100 text-blue-700' },
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <ClipboardList size={14} className="text-blue-500" />
          <span className="text-xs font-semibold text-[#4A5568]">Recent Inspections</span>
        </div>
        <Link to="/inspections" className="text-[10px] text-blue-500 hover:underline">View all</Link>
      </div>
      <div className="flex-1 overflow-auto -mx-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">Loading…</div>
        ) : !inspections?.length ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">No inspections yet</div>
        ) : (
          <div className="space-y-1 px-1">
            {inspections.map(insp => {
              const meta = insp.meta as Record<string, string>;
              const snapshot = insp.template_snapshot as Record<string, unknown>;
              const to = insp.status === 'completed' || insp.status === 'issued'
                ? `/inspections/${insp.id}/report`
                : `/inspections/${insp.id}`;
              const s = statusMap[insp.status] ?? statusMap.draft;
              return (
                <button
                  key={insp.id}
                  onClick={() => navigate(to)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${s.color}`}>{s.label}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#1A1A1A] truncate">{meta?.siteName ?? 'Untitled'}</p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {(snapshot?.name as string) ?? ''} · {format(new Date(insp.started_at), 'd MMM')}
                    </p>
                  </div>
                  <ArrowRight size={12} className="text-gray-300 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Templates Widget ────────────────────────────────────────────
export function TemplatesWidget() {
  const navigate = useNavigate();
  const { data: templates, isLoading } = useQuery<TemplateRow[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('id, name, report_renderer, created_at')
        .eq('archived', false)
        .order('updated_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as TemplateRow[];
    },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <LayoutTemplate size={14} className="text-blue-500" />
          <span className="text-xs font-semibold text-[#4A5568]">Templates</span>
        </div>
        <Link to="/templates" className="text-[10px] text-blue-500 hover:underline">View all</Link>
      </div>
      <div className="flex-1 overflow-auto -mx-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">Loading…</div>
        ) : !templates?.length ? (
          <div className="flex flex-col items-center justify-center h-full text-xs text-gray-400">
            <FileText size={20} className="mb-1 text-gray-300" />
            No templates yet
          </div>
        ) : (
          <div className="space-y-1 px-1">
            {templates.map(tmpl => (
              <button
                key={tmpl.id}
                onClick={() => navigate(`/inspections/new?templateId=${tmpl.id}`)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                <CheckCircle size={14} className="text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#1A1A1A] truncate">{tmpl.name}</p>
                  <p className="text-[10px] text-gray-400">
                    {tmpl.report_renderer === 'electrical_3000' ? 'AS/NZS 3000' : 'Generic'}
                  </p>
                </div>
                <ArrowRight size={12} className="text-gray-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inspection Stats Widget ─────────────────────────────────────
export function InspectionStatsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['inspection-stats'],
    queryFn: async () => {
      const { count: total } = await supabase.from('inspections').select('*', { count: 'exact', head: true });
      const { count: completed } = await supabase.from('inspections').select('*', { count: 'exact', head: true }).eq('status', 'completed');
      const { count: drafts } = await supabase.from('inspections').select('*', { count: 'exact', head: true }).eq('status', 'draft');
      return { total: total ?? 0, completed: completed ?? 0, drafts: drafts ?? 0 };
    },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <Gauge size={14} className="text-blue-500" />
        <span className="text-xs font-semibold text-[#4A5568]">Inspection Stats</span>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-2">
          <StatRow label="Total" value={data?.total ?? 0} color="text-blue-600" />
          <StatRow label="Completed" value={data?.completed ?? 0} color="text-green-600" />
          <StatRow label="In Progress" value={data?.drafts ?? 0} color="text-amber-600" />
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
    </div>
  );
}

// ─── Pending Reports Widget ──────────────────────────────────────
export function PendingReportsWidget() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery<InspectionRow[]>({
    queryKey: ['pending-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('id, status, meta, started_at')
        .eq('status', 'completed')
        .order('started_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as InspectionRow[];
    },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <FileText size={14} className="text-blue-500" />
        <span className="text-xs font-semibold text-[#4A5568]">Pending Reports</span>
      </div>
      <div className="flex-1 overflow-auto -mx-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">Loading…</div>
        ) : !data?.length ? (
          <div className="flex flex-col items-center justify-center h-full text-xs text-gray-400">
            <CheckCircle size={20} className="mb-1 text-green-300" />
            All caught up!
          </div>
        ) : (
          <div className="space-y-1 px-1">
            {data.map(insp => {
              const meta = insp.meta as Record<string, string>;
              return (
                <button
                  key={insp.id}
                  onClick={() => navigate(`/inspections/${insp.id}/report`)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <FileText size={14} className="text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#1A1A1A] truncate">{meta?.siteName ?? 'Untitled'}</p>
                    <p className="text-[10px] text-gray-400">{format(new Date(insp.started_at), 'd MMM yyyy')}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Activity Feed Widget ────────────────────────────────────────
export function ActivityFeedWidget() {
  const { data: inspections } = useQuery<InspectionRow[]>({
    queryKey: ['activity-inspections'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inspections')
        .select('id, status, meta, started_at, completed_at')
        .order('started_at', { ascending: false })
        .limit(4);
      return (data ?? []) as InspectionRow[];
    },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <Activity size={14} className="text-blue-500" />
        <span className="text-xs font-semibold text-[#4A5568]">Activity Feed</span>
      </div>
      <div className="flex-1 overflow-auto space-y-1.5 -mx-1 px-1">
        {inspections?.map(insp => {
          const meta = insp.meta as Record<string, string>;
          const isComplete = insp.status === 'completed' || insp.status === 'issued';
          return (
            <div key={insp.id} className="flex items-start gap-2">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${isComplete ? 'bg-green-400' : 'bg-blue-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#1A1A1A] truncate">
                  {isComplete ? 'Completed' : 'Started'}: {meta?.siteName ?? 'Untitled'}
                </p>
                <p className="text-[10px] text-gray-400">
                  {format(new Date(insp.completed_at ?? insp.started_at), 'd MMM, HH:mm')}
                </p>
              </div>
            </div>
          );
        })}
        {!inspections?.length && (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">No recent activity</div>
        )}
      </div>
    </div>
  );
}

// ─── Quick Actions Widget ────────────────────────────────────────
export function QuickActionsWidget() {
  const navigate = useNavigate();
  const actions = [
    { label: 'New Inspection', icon: ClipboardList, color: 'bg-blue-500', action: () => navigate('/inspections/new') },
    { label: 'New Job', icon: CalIcon, color: 'bg-indigo-500', action: () => navigate('/schedule') },
    { label: 'New Quote', icon: FileText, color: 'bg-emerald-500', action: () => navigate('/quotes') },
    { label: 'New Invoice', icon: Receipt, color: 'bg-amber-500', action: () => navigate('/invoices') },
    { label: 'New PO', icon: ShoppingCart, color: 'bg-purple-500', action: () => navigate('/purchase-orders') },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <ListTodo size={14} className="text-blue-500" />
        <span className="text-xs font-semibold text-[#4A5568]">Quick Actions</span>
      </div>
      <div className="flex-1 flex flex-col justify-center gap-1.5">
        {actions.map(a => (
          <button
            key={a.label}
            onClick={a.action}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            <div className={`w-6 h-6 rounded-md ${a.color} flex items-center justify-center`}>
              <a.icon size={12} className="text-white" />
            </div>
            <span className="text-xs font-medium text-[#1A1A1A]">{a.label}</span>
            <ArrowRight size={12} className="ml-auto text-gray-300" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Upcoming Jobs Widget ────────────────────────────────────────
export function UpcomingJobsWidget({ config }: WidgetProps) {
  const lookJobs = Array.isArray(config?.lookJobs) ? config.lookJobs as Array<{
    id: string;
    title: string;
    scheduled_date: string;
    start_time?: string;
    client_id?: string;
    client_name?: string;
    priority?: string;
  }> : null;
  const { data: jobs, isLoading } = useQuery({
    queryKey: ['widget-upcoming-jobs'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, scheduled_date, start_time, status, priority, client_id')
        .gte('scheduled_date', today)
        .in('status', ['scheduled', 'in_progress'])
        .order('scheduled_date', { ascending: true })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !lookJobs,
  });

  const clientIds = [...new Set((lookJobs ?? jobs ?? []).map((j: any) => j.client_id).filter(Boolean))];
  const { data: clients } = useQuery({
    queryKey: ['widget-job-clients', clientIds.join(',')],
    queryFn: async () => {
      if (clientIds.length === 0) return [];
      const { data } = await supabase.from('clients').select('id, name').in('id', clientIds);
      return data ?? [];
    },
    enabled: !lookJobs && clientIds.length > 0,
  });

  const clientMap = lookJobs
    ? new Map(lookJobs.map(j => [j.client_id, j.client_name]))
    : new Map((clients ?? []).map((c: any) => [c.id, c.name]));
  const rows = lookJobs ?? jobs ?? [];
  const loading = lookJobs ? false : isLoading;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <CalIcon size={14} className="text-blue-500" />
          <span className="text-xs font-semibold text-[#4A5568]">Upcoming Jobs</span>
        </div>
        <Link to="/schedule" className="text-[10px] text-blue-500 hover:underline">View all</Link>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">No upcoming jobs</div>
      ) : (
        <div className="flex-1 overflow-auto space-y-1 -mx-1 px-1">
          {rows.map((job: any) => (
            <Link key={job.id} to="/schedule"
              className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="text-center shrink-0 w-9">
                <div className="text-[10px] text-gray-400 uppercase">
                  {job.scheduled_date ? format(new Date(job.scheduled_date), 'MMM') : '?'}
                </div>
                <div className="text-sm font-bold text-[#1A1A1A] leading-none">
                  {job.scheduled_date ? format(new Date(job.scheduled_date), 'd') : '-'}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[#1A1A1A] truncate">{job.title}</p>
                <p className="text-[10px] text-gray-400 truncate">
                  {job.start_time ? job.start_time.slice(0, 5) : ''}
                  {job.client_id && clientMap.get(job.client_id) ? ` · ${clientMap.get(job.client_id)}` : ''}
                </p>
              </div>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                job.priority === 'high' ? 'bg-red-500' : job.priority === 'medium' ? 'bg-orange-400' : 'bg-gray-300'
              }`} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Client Stats Widget ─────────────────────────────────────────
export function ClientStatsWidget() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['widget-client-stats'],
    queryFn: async () => {
      const [{ count: total }, { count: activeJobs }, { count: scheduledJobs }] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('archived', false),
        supabase.from('jobs').select('*', { count: 'exact', head: true }).in('status', ['scheduled', 'in_progress']),
        supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'scheduled'),
      ]);
      return { total: total ?? 0, activeJobs: activeJobs ?? 0, scheduledJobs: scheduledJobs ?? 0 };
    },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Users size={14} className="text-blue-500" />
          <span className="text-xs font-semibold text-[#4A5568]">Clients</span>
        </div>
        <Link to="/clients" className="text-[10px] text-blue-500 hover:underline">View all</Link>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[#4A5568]">Total Clients</span>
            <span className="text-xl font-bold text-[#1A1A1A]">{stats?.total ?? 0}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[#4A5568]">Active Jobs</span>
            <span className="text-xl font-bold text-blue-600">{stats?.activeJobs ?? 0}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[#4A5568]">Scheduled</span>
            <span className="text-xl font-bold text-amber-600">{stats?.scheduledJobs ?? 0}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Open POs Widget ────────────────────────────────────────────
export function OpenPOsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget-open-pos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, status, total')
        .in('status', ['draft', 'sent', 'partially_received'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      const pos = data ?? [];
      const totalValue = pos.reduce((sum: number, p: any) => sum + Number(p.total ?? 0), 0);
      return { count: pos.length, totalValue, recent: pos.slice(0, 5) };
    },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <ShoppingCart size={14} className="text-blue-500" />
          <span className="text-xs font-semibold text-[#4A5568]">Open POs</span>
        </div>
        <Link to="/purchase-orders" className="text-[10px] text-blue-500 hover:underline">View all</Link>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[#4A5568]">Open POs</span>
            <span className="text-xl font-bold text-[#1A1A1A]">{data?.count ?? 0}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[#4A5568]">Total Value</span>
            <span className="text-lg font-bold text-blue-600">{formatMoney(data?.totalValue ?? 0)}</span>
          </div>
          {data && data.recent.length > 0 && (
            <div className="mt-1 pt-1.5 border-t border-gray-100 space-y-0.5">
              {data.recent.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-500">PO #{String(p.po_number).padStart(4, '0')}</span>
                  <span className="font-medium text-[#1A1A1A]">{formatMoney(p.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Low Stock Alerts Widget ─────────────────────────────────────
export function LowStockWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget-low-stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_items')
        .select('id, name, sku, quantity_on_hand, reorder_level, unit_of_measure')
        .eq('archived', false)
        .order('quantity_on_hand', { ascending: true })
        .limit(20);
      if (error) throw error;
      const items = (data ?? []) as any[];
      const lowItems = items.filter(i => getStockLevel(i) !== 'adequate');
      return { items: lowItems.slice(0, 8), total: lowItems.length };
    },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Package size={14} className="text-blue-500" />
          <span className="text-xs font-semibold text-[#4A5568]">Low Stock</span>
        </div>
        <Link to="/stock" className="text-[10px] text-blue-500 hover:underline">View all</Link>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-green-500">
          <CheckCircle size={14} className="mr-1" /> All stock levels OK
        </div>
      ) : (
        <div className="flex-1 overflow-auto space-y-1 -mx-1 px-1">
          <div className="text-[10px] text-amber-600 mb-1 font-medium">
            {data?.total ?? 0} item{(data?.total ?? 0) !== 1 ? 's' : ''} need restocking
          </div>
          {(data?.items ?? []).map((item: any) => {
            const level = getStockLevel(item);
            return (
              <Link key={item.id} to={`/stock/${item.id}`}
                className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-gray-50 transition-colors">
                <AlertTriangle size={12} className={
                  level === 'out' ? 'text-red-500' : 'text-amber-500'
                } />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[#1A1A1A] truncate">{item.name}</p>
                  <p className="text-[10px] text-gray-400">
                    {item.quantity_on_hand} {item.unit_of_measure} left
                    {item.sku && ` · ${item.sku}`}
                  </p>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${STOCK_LEVEL_STYLES[level]}`}>
                  {STOCK_LEVEL_LABELS[level]}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Outstanding Invoices Widget ─────────────────────────────────
export function OutstandingInvoicesWidget({ config }: WidgetProps) {
  const lookInvoices = config?.lookInvoices && typeof config.lookInvoices === 'object'
    ? config.lookInvoices as {
        count: number;
        outstanding: number;
        overdue: number;
        recent: Array<{ id: string; invoice_number: number; status: string; total: number; due_date?: string }>;
      }
    : null;
  const { data: fetched, isLoading } = useQuery({
    queryKey: ['widget-outstanding-invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, total, due_date')
        .in('status', ['sent', 'overdue'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      const invs = (data ?? []) as any[];
      const outstanding = invs.reduce((s, i) => s + Number(i.total ?? 0), 0);
      const overdue = invs.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.total ?? 0), 0);
      return { count: invs.length, outstanding, overdue, recent: invs.slice(0, 5) };
    },
    enabled: !lookInvoices,
  });
  const data = lookInvoices ?? fetched;
  const loading = lookInvoices ? false : isLoading;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Receipt size={14} className="text-blue-500" />
          <span className="text-xs font-semibold text-[#4A5568]">Invoices</span>
        </div>
        <Link to="/invoices" className="text-[10px] text-blue-500 hover:underline">View all</Link>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[#4A5568]">Outstanding</span>
            <span className="text-xl font-bold text-amber-600">{formatMoney(data?.outstanding ?? 0)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[#4A5568]">Overdue</span>
            <span className="text-lg font-bold text-red-500">{formatMoney(data?.overdue ?? 0)}</span>
          </div>
          {data && data.recent.length > 0 && (
            <div className="mt-1 pt-1.5 border-t border-gray-100 space-y-0.5">
              {data.recent.map((i: any) => (
                <div key={i.id} className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-500">
                    INV #{String(i.invoice_number).padStart(4, '0')}
                    {i.due_date && ` · due ${format(new Date(i.due_date), 'd MMM')}`}
                  </span>
                  <span className="font-medium text-[#1A1A1A]">{formatMoney(i.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Revenue Overview Widget ─────────────────────────────────────
export function RevenueOverviewWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget-revenue-overview'],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const [{ data: invData }, { data: paidData }] = await Promise.all([
        supabase.from('invoices')
          .select('total, status')
          .gte('created_at', monthStart)
          .in('status', ['sent', 'paid', 'overdue']),
        supabase.from('invoices')
          .select('total')
          .eq('status', 'paid')
          .gte('created_at', monthStart),
      ]);
      const invoiced = (invData ?? []).reduce((s: number, i: any) => s + Number(i.total ?? 0), 0);
      const collected = (paidData ?? []).reduce((s: number, i: any) => s + Number(i.total ?? 0), 0);
      return { invoiced, collected };
    },
  });

  const invoiced = data?.invoiced ?? 0;
  const collected = data?.collected ?? 0;
  const pct = invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <DollarSign size={14} className="text-green-500" />
          <span className="text-xs font-semibold text-[#4A5568]">Revenue (This Month)</span>
        </div>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[#4A5568]">Invoiced</span>
            <span className="text-xl font-bold text-[#1A1A1A]">{formatMoney(invoiced)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[#4A5568]">Collected</span>
            <span className="text-xl font-bold text-green-600">{formatMoney(collected)}</span>
          </div>
          {invoiced > 0 && (
            <div className="mt-1">
              <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
                <span>Collection rate</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Widget Renderer ─────────────────────────────────────────────
const WIDGET_COMPONENTS: Record<string, ComponentType<WidgetProps>> = {
  weather: WeatherWidget,
  bitcoin: BitcoinWidget,
  crypto: CryptoWidget,
  stock_market: MarketOverviewWidget,
  clock: ClockWidget,
  calendar: CalendarWidget,
  calculator: CalculatorWidget,
  recent_inspections: RecentInspectionsWidget,
  templates: TemplatesWidget,
  inspection_stats: InspectionStatsWidget,
  pending_reports: PendingReportsWidget,
  activity_feed: ActivityFeedWidget,
  quick_actions: QuickActionsWidget,
  upcoming_jobs: UpcomingJobsWidget,
  client_stats: ClientStatsWidget,
  open_pos: OpenPOsWidget,
  low_stock: LowStockWidget,
  outstanding_invoices: OutstandingInvoicesWidget,
  revenue_overview: RevenueOverviewWidget,
  ai_agent: AiAgentWidget,
  industry_news: IndustryNewsWidget,
  compliance_deadlines: ComplianceDeadlinesWidget,
  cash_flow: CashFlowWidget,
  kpi_scorecard: KpiScorecardWidget,
  team_activity: TeamActivityWidget,
  agent_reminders: AgentRemindersWidget,
  agent_activity: AgentActivityWidget,
};

export function WidgetRenderer({ type, config, onConfigChange }: { type: string; config: Record<string, unknown>; onConfigChange?: (c: Record<string, unknown>) => void }) {
  const Comp = WIDGET_COMPONENTS[type];
  if (!Comp) return <div className="h-full flex items-center justify-center text-xs text-gray-400">Unknown widget</div>;
  return <Comp config={config} onConfigChange={onConfigChange} />;
}


