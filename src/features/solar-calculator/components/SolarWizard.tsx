import { useMemo } from 'react';
import { formatMoney } from '../../../types/fsm';
import { SYSTEM_SIZE_OPTIONS_KW, type SolarEstimateInputs } from '../draft';
import { computeSolarOutputs, SOLAR_DISCLAIMER, selectedSizesKw } from '../compute';
import { lookupZone } from '../lib/zones';
import { Field } from './Field';

const STEPS = [
  { n: 1, label: 'Site & size' },
  { n: 2, label: 'Usage & cost' },
  { n: 3, label: 'Results' },
] as const;

export const SOLAR_WIZARD_MAX_STEP = 3;

type ClientOpt = { id: string; name: string };

type Props = {
  inputs: SolarEstimateInputs;
  step: number;
  midscaleAck: boolean;
  clients: ClientOpt[];
  saving: boolean;
  onChange: (patch: Partial<SolarEstimateInputs>) => void;
  onStep: (step: number) => void;
  onMidscaleAck: (v: boolean) => void;
  onSave: () => void;
  onClose: () => void;
};

function acceptDecimal(raw: string) {
  return raw === '' || /^-?\d*\.?\d*$/.test(raw);
}

export function SolarWizard({
  inputs,
  step,
  midscaleAck,
  clients,
  saving,
  onChange,
  onStep,
  onMidscaleAck,
  onSave,
  onClose,
}: Props) {
  const zoneInfo = useMemo(
    () => lookupZone({ postcode: inputs.postcode, suburb: inputs.suburb || null }),
    [inputs.postcode, inputs.suburb],
  );

  const outputs = useMemo(() => computeSolarOutputs(inputs), [inputs]);
  const sizes = selectedSizesKw(inputs);
  const safeStep = Math.min(Math.max(step, 1), SOLAR_WIZARD_MAX_STEP);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex flex-wrap gap-1 px-1 pb-4 border-b border-[#E5E7EB]">
        {STEPS.map(s => (
          <button
            key={s.n}
            type="button"
            onClick={() => onStep(s.n)}
            className={`px-3 py-1.5 text-xs rounded-md font-medium ${
              safeStep === s.n
                ? 'bg-[#0A2540] text-white'
                : 'bg-[#F3F4F6] text-[#4A5568] hover:bg-[#E5E7EB]'
            }`}
          >
            {s.n}. {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {safeStep === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-[#4A5568]">
              Postcode + system size + install date drive the STC rebate. Everything else is optional.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Customer name">
                <input
                  className="form-input"
                  value={inputs.customerName}
                  onChange={e => onChange({ customerName: e.target.value })}
                  placeholder="e.g. Acme Warehousing"
                />
              </Field>
              <Field label="Link client (optional)">
                <select
                  className="form-input cursor-pointer"
                  value={inputs.clientId ?? ''}
                  onChange={e => {
                    const id = e.target.value || null;
                    const name = clients.find(c => c.id === id)?.name;
                    onChange({
                      clientId: id,
                      customerName: inputs.customerName || name || '',
                    });
                  }}
                >
                  <option value="">— None —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Site address (optional)">
                <input
                  className="form-input"
                  value={inputs.siteAddress}
                  onChange={e => onChange({ siteAddress: e.target.value })}
                />
              </Field>
              <Field label="Postcode" help="Sets the CER STC zone.">
                <input
                  className="form-input"
                  value={inputs.postcode}
                  inputMode="numeric"
                  onChange={e => onChange({ postcode: e.target.value.replace(/[^\d]/g, '').slice(0, 4) })}
                  placeholder="e.g. 4000"
                />
              </Field>
              {zoneInfo.status === 'needs_suburb' && (
                <Field label="Suburb" help="This postcode is split across zones.">
                  <select
                    className="form-input cursor-pointer"
                    value={inputs.suburb}
                    onChange={e => onChange({ suburb: e.target.value })}
                  >
                    <option value="">Select suburb…</option>
                    {zoneInfo.suburbs.map(s => (
                      <option key={s.suburb} value={s.suburb}>
                        {s.suburb} (Zone {s.zone})
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {zoneInfo.status === 'resolved' && (
                <p className="sm:col-span-2 text-sm text-[#2E75B6]">
                  CER zone {zoneInfo.zone} · rating {zoneInfo.rating}
                </p>
              )}
              {zoneInfo.status === 'invalid_postcode' && inputs.postcode.length >= 3 && (
                <p className="sm:col-span-2 text-sm text-amber-700">{zoneInfo.message}</p>
              )}
              <Field label="Proposed install date" help="Drives deeming years for the rebate.">
                <input
                  type="date"
                  className="form-input"
                  value={inputs.installDate}
                  onChange={e => onChange({ installDate: e.target.value })}
                />
              </Field>
            </div>

            <Field label="System size (kW)" help="Select up to 1 MW (1000 kW).">
              <select
                className="form-input cursor-pointer max-w-xs"
                value={String(inputs.compareSizesKw[0] ?? 100)}
                onChange={e => {
                  const kw = parseFloat(e.target.value);
                  onChange({
                    compareSizesKw: [kw],
                    customSizeKw: '',
                    panelDcKw: '',
                  });
                }}
              >
                {(() => {
                  const current = inputs.compareSizesKw[0];
                  const opts =
                    current != null && !SYSTEM_SIZE_OPTIONS_KW.includes(current)
                      ? [...SYSTEM_SIZE_OPTIONS_KW, current].sort((a, b) => a - b)
                      : SYSTEM_SIZE_OPTIONS_KW;
                  return opts.map(sz => (
                    <option key={sz} value={sz}>
                      {sz >= 1000 ? '1000 kW (1 MW)' : `${sz} kW`}
                    </option>
                  ));
                })()}
              </select>
            </Field>

            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
              <Field label="STC price low $">
                <input
                  className="form-input"
                  value={inputs.stcPriceLowDollars}
                  inputMode="decimal"
                  onChange={e => {
                    if (acceptDecimal(e.target.value)) onChange({ stcPriceLowDollars: e.target.value });
                  }}
                />
              </Field>
              <Field label="STC price high $">
                <input
                  className="form-input"
                  value={inputs.stcPriceHighDollars}
                  inputMode="decimal"
                  onChange={e => {
                    if (acceptDecimal(e.target.value)) onChange({ stcPriceHighDollars: e.target.value });
                  }}
                />
              </Field>
            </div>

            <label className="flex items-start gap-2 text-sm text-[#4A5568]">
              <input
                type="checkbox"
                className="mt-1"
                checked={inputs.midscaleFlatDeeming}
                onChange={e => onChange({ midscaleFlatDeeming: e.target.checked })}
              />
              <span>
                Mid-scale flat deeming (100 kW–1 MW from Oct 2026)
                <span className="block text-xs text-amber-700 mt-0.5">Proposed rules — off by default.</span>
              </span>
            </label>
          </div>
        )}

        {safeStep === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-[#4A5568]">
              Optional — fill these in for year-1 savings and payback. Skip if you only need the rebate.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Annual usage (kWh)" help="From the bill, or estimate.">
                <input
                  className="form-input"
                  value={inputs.annualKwh}
                  inputMode="decimal"
                  placeholder="e.g. 120000"
                  onChange={e => {
                    if (!acceptDecimal(e.target.value)) return;
                    onChange({ energyMode: 'annual_kwh', annualKwh: e.target.value });
                  }}
                />
              </Field>
              <Field
                label="Specific yield (kWh/kWp/yr)"
                help="Site generation estimate. Typical SEQ roof ~1400–1550."
              >
                <input
                  className="form-input"
                  value={inputs.specificYieldKwhPerKwp}
                  inputMode="decimal"
                  placeholder="e.g. 1450"
                  onChange={e => {
                    if (acceptDecimal(e.target.value)) onChange({ specificYieldKwhPerKwp: e.target.value });
                  }}
                />
              </Field>
              <Field label="Usage rate (c/kWh)">
                <input
                  className="form-input"
                  value={inputs.usageRateCentsPerKwh}
                  inputMode="decimal"
                  onChange={e => {
                    if (acceptDecimal(e.target.value)) onChange({ usageRateCentsPerKwh: e.target.value });
                  }}
                />
              </Field>
              <Field label="Feed-in tariff (c/kWh)">
                <input
                  className="form-input"
                  value={inputs.fitCentsPerKwh}
                  inputMode="decimal"
                  onChange={e => {
                    if (acceptDecimal(e.target.value)) onChange({ fitCentsPerKwh: e.target.value });
                  }}
                />
              </Field>
              <Field
                label="Daytime usage share %"
                help="% of load used when solar is generating — biggest savings driver."
              >
                <input
                  className="form-input"
                  value={inputs.daytimeSharePct}
                  inputMode="decimal"
                  onChange={e => {
                    if (acceptDecimal(e.target.value)) onChange({ daytimeSharePct: e.target.value });
                  }}
                />
              </Field>
              <Field label="Installed cost $/W" help="Used for net upfront and payback.">
                <input
                  className="form-input"
                  value={inputs.dollarsPerWatt}
                  inputMode="decimal"
                  onChange={e => {
                    if (acceptDecimal(e.target.value)) {
                      onChange({ costMode: 'per_watt', dollarsPerWatt: e.target.value });
                    }
                  }}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                { l: 'Office / warehouse ~70%', v: '70' },
                { l: 'Retail ~60%', v: '60' },
                { l: '24/7 ~40%', v: '40' },
              ].map(p => (
                <button
                  key={p.v}
                  type="button"
                  className="px-2 py-1 rounded border border-[#E5E7EB] hover:bg-[#F9FAFB]"
                  onClick={() => onChange({ daytimeSharePct: p.v })}
                >
                  {p.l}
                </button>
              ))}
            </div>
            {sizes.length > 0 && (
              <p className="text-xs text-[#9CA3AF]">
                Comparing {sizes.map(s => `${s} kW`).join(', ')}
              </p>
            )}
          </div>
        )}

        {safeStep === 3 && (
          <div className="space-y-4">
            {outputs.sizes.some(s => s.midscaleProposed) && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">Proposed — subject to regulations</p>
                <p className="text-xs text-amber-800 mt-1">
                  Mid-scale STCs (100 kW–1 MW from 1 Oct 2026) are announced but not yet legislated.
                </p>
                <label className="flex items-center gap-2 text-sm mt-2 text-amber-950">
                  <input type="checkbox" checked={midscaleAck} onChange={e => onMidscaleAck(e.target.checked)} />
                  I acknowledge mid-scale figures are indicative only
                </label>
              </div>
            )}

            {outputs.waitingCostMidCents != null && outputs.waitingCostMidCents > 0 && (
              <p className="text-sm font-medium text-[#0A2540]">
                Waiting ~12 months costs about{' '}
                <span className="text-[#2E75B6]">{formatMoney(outputs.waitingCostMidCents / 100)}</span>
                {' '}in mid-band STC rebate (deeming step-down).
              </p>
            )}

            <div className="overflow-x-auto border border-[#E5E7EB] rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-[#F9FAFB] text-xs text-[#6B7280]">
                  <tr>
                    <th className="px-3 py-2 text-left">Size</th>
                    <th className="px-3 py-2 text-right">STCs</th>
                    <th className="px-3 py-2 text-right">Rebate range</th>
                    <th className="px-3 py-2 text-right">Net upfront</th>
                    <th className="px-3 py-2 text-right">Yr1 saving</th>
                    <th className="px-3 py-2 text-right">Payback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {outputs.sizes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-[#9CA3AF]">
                        Enter a valid postcode and pick at least one size on step 1.
                      </td>
                    </tr>
                  )}
                  {outputs.sizes.map(s => (
                    <tr key={s.sizeKw}>
                      <td className="px-3 py-2 font-medium">
                        {s.sizeKw} kW
                        {s.midscaleProposed && (
                          <span className="ml-1 text-[10px] text-amber-700">mid-scale</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.stcCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(s.rebateLowCents / 100)} – {formatMoney(s.rebateHighCents / 100)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.netUpfrontMidCents != null ? formatMoney(s.netUpfrontMidCents / 100) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.year1SavingCents != null ? formatMoney(s.year1SavingCents / 100) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.simplePaybackYears != null ? `${s.simplePaybackYears} yr` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!inputs.specificYieldKwhPerKwp || !inputs.annualKwh ? (
              <p className="text-xs text-amber-700">
                Rebate is calculated. Add annual kWh + specific yield on step 2 for savings / payback.
              </p>
            ) : null}
            <p className="text-[11px] text-[#6B7280] leading-relaxed border-t border-[#E5E7EB] pt-3">
              Assumes accredited installer, CEC-approved new equipment, and a valid STC claim.
              Indicative only — not a quote. {SOLAR_DISCLAIMER()}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-between gap-2 pt-4 border-t border-[#E5E7EB]">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 text-sm border border-[#E5E7EB] rounded-md text-[#4A5568]"
        >
          Close
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={safeStep <= 1}
            onClick={() => onStep(safeStep - 1)}
            className="px-3 py-2 text-sm border border-[#E5E7EB] rounded-md disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="px-3 py-2 text-sm border border-[#2E75B6] text-[#2E75B6] rounded-md disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          {safeStep < SOLAR_WIZARD_MAX_STEP ? (
            <button
              type="button"
              onClick={() => onStep(safeStep + 1)}
              className="px-3 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="px-3 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md disabled:opacity-50"
            >
              Save estimate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
