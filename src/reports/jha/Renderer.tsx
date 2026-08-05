import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { JhaReportData, JhaReportStep } from './types';
import { LIKELIHOOD_OPTIONS, CONSEQUENCE_OPTIONS } from '../../types/jha';
import {
  RunningHeader, RunningFooter, MetadataGrid, SignatureBlock,
} from '../shared/components';
import { pdfColors, pdfFonts } from '../shared/styles';

const styles = StyleSheet.create({
  page: {
    fontFamily: pdfFonts.body,
    fontSize: 9,
    color: pdfColors.text,
    paddingTop: 0,
    paddingBottom: 40,
    paddingHorizontal: 0,
  },
  body: { paddingHorizontal: 28, paddingTop: 18 },
  coverPage: {
    fontFamily: pdfFonts.body,
    fontSize: 9,
    color: pdfColors.text,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  sectionBody: { marginBottom: 16 },
  cellHeader: {
    fontFamily: pdfFonts.body,
    fontSize: 7.5,
    fontWeight: 700,
    color: pdfColors.white,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  cellText: {
    fontFamily: pdfFonts.body,
    fontSize: 8,
    color: pdfColors.text,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  riskPill: {
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 2,
    alignSelf: 'flex-start',
  },
  riskPillText: {
    fontFamily: pdfFonts.body,
    fontSize: 7,
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  ppeChip: {
    fontFamily: pdfFonts.body,
    fontSize: 7.5,
    color: pdfColors.navy,
    backgroundColor: pdfColors.accentLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    marginRight: 5,
    marginBottom: 4,
  },
});

function RiskPill({ risk }: { risk: { label: string; color: string } | null }) {
  if (!risk) {
    return <Text style={styles.cellText}>{'\u2014'}</Text>;
  }
  return (
    <View style={[styles.riskPill, { backgroundColor: risk.color }]}>
      <Text style={styles.riskPillText}>{risk.label.toUpperCase()}</Text>
    </View>
  );
}

function matrixCellStyle(score: number): { backgroundColor: string } {
  if (score >= 16) return { backgroundColor: '#B91C1C' };
  if (score >= 10) return { backgroundColor: '#C2410C' };
  if (score >= 5) return { backgroundColor: '#B45309' };
  return { backgroundColor: '#166534' };
}

function getLikelihoodLabel(id: string): string {
  const found = LIKELIHOOD_OPTIONS.find(l => l.id === id);
  return found ? found.label : id || '\u2014';
}

function getConsequenceLabel(id: string): string {
  const found = CONSEQUENCE_OPTIONS.find(c => c.id === id);
  return found ? found.label : id || '\u2014';
}

function RiskMatrixGrid() {
  const likelihoods = [...LIKELIHOOD_OPTIONS].reverse();
  const consequences = CONSEQUENCE_OPTIONS;
  const labelW = 70;
  const numW = 32;

  return (
    <View>
      {/* Column headers (consequence) */}
      <View style={{ flexDirection: 'row', marginBottom: 1 }}>
        <View style={{ width: labelW, paddingVertical: 4, paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, fontWeight: 700, color: pdfColors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Likelihood / Consequence
          </Text>
        </View>
        {consequences.map(c => (
          <View key={c.id} style={{ width: numW, backgroundColor: pdfColors.navy, paddingVertical: 4, paddingHorizontal: 2, alignItems: 'center' }}>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, fontWeight: 700, color: '#FFFFFF', textAlign: 'center' }}>
              {c.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Matrix rows */}
      {likelihoods.map(l => (
        <View key={l.id} style={{ flexDirection: 'row', marginBottom: 1 }}>
          <View style={{ width: labelW, backgroundColor: '#F3F4F6', paddingVertical: 5, paddingHorizontal: 4, justifyContent: 'center' }}>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 7, fontWeight: 700, color: pdfColors.text }}>
              {l.label}
            </Text>
          </View>
          {consequences.map(c => {
            const score = l.score * c.score;
            return (
              <View key={c.id} style={{ width: numW, ...matrixCellStyle(score), paddingVertical: 5, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: pdfFonts.mono, fontSize: 8, fontWeight: 700, color: '#FFFFFF' }}>
                  {score}
                </Text>
              </View>
            );
          })}
        </View>
      ))}

      {/* Legend */}
      <View style={{ flexDirection: 'row', marginTop: 6, gap: 10 }}>
        {[
          { label: 'Low (1-4)', color: '#166534' },
          { label: 'Moderate (5-9)', color: '#B45309' },
          { label: 'Significant (10-15)', color: '#C2410C' },
          { label: 'Severe (16-25)', color: '#B91C1C' },
        ].map(r => (
          <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 7, height: 7, backgroundColor: r.color }} />
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 7, color: pdfColors.textMuted, fontWeight: 600 }}>{r.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StepTable({ steps, riskLevels }: { steps: JhaReportStep[]; riskLevels: JhaReportData['riskLevels'] }) {
  const colWidths = { step: '5%', desc: '17%', hazards: '15%', consequence: '10%', likelihood: '10%', controls: '15%', initial: '14%', residual: '14%' };

  return (
    <View style={{ borderWidth: 0.5, borderColor: pdfColors.rule }}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', backgroundColor: pdfColors.navy }}>
        <Text style={[styles.cellHeader, { width: colWidths.step }]}>#</Text>
        <Text style={[styles.cellHeader, { width: colWidths.desc }]}>Job Step</Text>
        <Text style={[styles.cellHeader, { width: colWidths.hazards }]}>Potential Hazards</Text>
        <Text style={[styles.cellHeader, { width: colWidths.consequence }]}>Consequence</Text>
        <Text style={[styles.cellHeader, { width: colWidths.likelihood }]}>Likelihood</Text>
        <Text style={[styles.cellHeader, { width: colWidths.controls }]}>Control Measures</Text>
        <Text style={[styles.cellHeader, { width: colWidths.initial, textAlign: 'center' }]}>Before (Initial)</Text>
        <Text style={[styles.cellHeader, { width: colWidths.residual, textAlign: 'center' }]}>After (Residual)</Text>
      </View>

      {/* Data rows */}
      {steps.length === 0 ? (
        <View style={{ paddingVertical: 12, paddingHorizontal: 8 }}>
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, color: pdfColors.textMuted, fontStyle: 'italic' }}>
            No job steps have been recorded.
          </Text>
        </View>
      ) : (
        steps.map((step, i) => {
          const bg = i % 2 !== 0 ? pdfColors.zebra : pdfColors.white;
          return (
            <View key={i} style={{ flexDirection: 'row', backgroundColor: bg, borderBottomWidth: 0.5, borderBottomColor: pdfColors.rule }}>
              <View style={{ width: colWidths.step, paddingVertical: 6, paddingHorizontal: 6 }}>
                <Text style={{ fontFamily: pdfFonts.mono, fontSize: 8, fontWeight: 700, color: pdfColors.accent }}>{i + 1}</Text>
              </View>
              <Text style={[styles.cellText, { width: colWidths.desc }]}>{step.description || '\u2014'}</Text>
              <Text style={[styles.cellText, { width: colWidths.hazards }]}>{step.hazards || '\u2014'}</Text>
              <Text style={[styles.cellText, { width: colWidths.consequence, fontSize: 7.5 }]}>{getConsequenceLabel(step.consequence)}</Text>
              <Text style={[styles.cellText, { width: colWidths.likelihood, fontSize: 7.5 }]}>{getLikelihoodLabel(step.likelihood)}</Text>
              <Text style={[styles.cellText, { width: colWidths.controls }]}>{step.controls || '\u2014'}</Text>
              <View style={{ width: colWidths.initial, paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center' }}>
                <RiskPill risk={step.initialRisk} />
              </View>
              <View style={{ width: colWidths.residual, paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center' }}>
                <RiskPill risk={step.residualRisk} />
              </View>
            </View>
          );
        })
      )}

      {/* Risk legend */}
      <View style={{ flexDirection: 'row', backgroundColor: pdfColors.zebra, paddingHorizontal: 8, paddingVertical: 5, gap: 12 }}>
        <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, color: pdfColors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Risk Scale:
        </Text>
        {riskLevels.map(r => (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: r.color }} />
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, color: pdfColors.textSecondary, fontWeight: 700 }}>{r.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PpeSection({ ppe }: { ppe: string[] }) {
  if (ppe.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: pdfColors.ruleLight, borderTopWidth: 0.5, borderTopColor: pdfColors.rule }}>
      {ppe.map((item, i) => (
        <Text key={i} style={styles.ppeChip}>{item}</Text>
      ))}
    </View>
  );
}

export function JhaReportRenderer({ data }: { data: JhaReportData }) {
  const metaItems = [
    { label: 'Document Number', value: data.reportNumber },
    { label: 'Issue Date', value: data.issueDate },
    ...(data.taskName ? [{ label: 'Task / Activity', value: data.taskName }] : []),
    ...(data.siteName ? [{ label: 'Site / Location', value: data.siteName }] : []),
    ...(data.date ? [{ label: 'Date', value: data.date }] : []),
    ...(data.supervisor ? [{ label: 'Supervisor', value: data.supervisor }] : []),
    ...(data.siteContact ? [{ label: 'Site Contact', value: data.siteContact }] : []),
    { label: 'Prepared By', value: data.inspectorName },
    { label: 'Company', value: data.companyName },
  ];

  const contactParts = [
    data.companyAbn ? `ABN ${data.companyAbn}` : null,
    data.companyPhone,
    data.companyEmail,
    data.companyWebsite,
  ].filter(Boolean).join('  \u00B7  ');

  const docTitle = `${(data.taskName || data.siteName || 'JHA').replace(/[<>:"/\\|?*]/g, '_')} - ${data.reportNumber}`;

  return (
    <Document title={docTitle}>
      {/* COVER PAGE */}
      <Page size="A4" style={styles.coverPage}>
        {/* Branded header band */}
        <View style={{ width: '100%', backgroundColor: pdfColors.navy, paddingHorizontal: 40, paddingVertical: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {data.companyLogoUrl ? (
              <Image src={data.companyLogoUrl} style={{ width: 120, height: 50, objectFit: 'contain', marginRight: 14 }} />
            ) : (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ fontFamily: pdfFonts.body, fontSize: 14, fontWeight: 700, color: '#FFFFFF', letterSpacing: 0.5 }}>
                  {data.companyName.toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 7, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, textTransform: 'uppercase' }}>
              Document
            </Text>
            <Text style={{ fontFamily: pdfFonts.mono, fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
              {data.reportNumber}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 40, paddingTop: 24, flex: 1 }}>
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, color: pdfColors.accent, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 10 }}>
            JOB HAZARD ANALYSIS
          </Text>
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 30, fontWeight: 700, color: pdfColors.navy, marginBottom: 6, lineHeight: 1.15 }}>
            {data.templateName}
          </Text>
          {data.taskName && (
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 14, color: pdfColors.textSecondary, marginBottom: 20 }}>
              {data.taskName}
            </Text>
          )}

          <View style={{ height: 0.5, backgroundColor: pdfColors.rule, marginBottom: 20 }} />
          <MetadataGrid items={metaItems} />

          {/* Emergency Contacts */}
          {data.emergencyContacts.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, fontWeight: 700, color: pdfColors.navy, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                Emergency Contacts
              </Text>
              {data.emergencyContacts.map((c, i) => (
                <View key={i} style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 8, backgroundColor: i % 2 === 0 ? pdfColors.white : pdfColors.zebra, borderBottomWidth: 0.5, borderBottomColor: pdfColors.rule }}>
                  {c.role ? (
                    <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, color: pdfColors.textMuted, width: '35%' }}>{c.role}</Text>
                  ) : (
                    <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, color: pdfColors.textMuted, width: '35%' }}>Contact</Text>
                  )}
                  <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, fontWeight: 700, color: pdfColors.text, flex: 1 }}>{c.name}</Text>
                  <Text style={{ fontFamily: pdfFonts.mono, fontSize: 8, fontWeight: 700, color: pdfColors.accent }}>{c.phone}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Branded footer band */}
        <View style={{ backgroundColor: pdfColors.navy, paddingHorizontal: 40, paddingVertical: 18 }}>
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
            {data.companyName}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 3 }}>
            {contactParts ? (
              <Text style={{ fontFamily: pdfFonts.body, fontSize: 7, color: 'rgba(255,255,255,0.5)' }}>
                {contactParts}
              </Text>
            ) : null}
          </View>
        </View>
      </Page>

      {/* CONTENT PAGE — RISK MATRIX + STEPS */}
      <Page size="A4" style={styles.page}>
        <RunningHeader
          companyName={data.companyName}
          reportNumber={data.reportNumber}
          logoUrl={data.companyLogoUrl}
        />
        <View style={styles.body}>
          {/* Section: PPE */}
          {data.ppe.length > 0 && (
            <View style={styles.sectionBody}>
              <View style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 8 }}>
                <View style={{ width: 28, backgroundColor: pdfColors.accent, alignItems: 'center', justifyContent: 'center', paddingVertical: 7 }}>
                  <Text style={{ fontFamily: pdfFonts.body, fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.95)', letterSpacing: 0.3 }}>
                    01
                  </Text>
                </View>
                <View style={{ flex: 1, backgroundColor: pdfColors.navy, paddingHorizontal: 10, paddingVertical: 7 }}>
                  <Text style={{ fontFamily: pdfFonts.body, fontSize: 9.5, fontWeight: 700, color: pdfColors.white, letterSpacing: 0.8 }}>
                    REQUIRED PPE
                  </Text>
                </View>
              </View>
              <PpeSection ppe={data.ppe} />
            </View>
          )}

          {/* Section: Risk Matrix */}
          <View style={styles.sectionBody} wrap={false}>
            <View style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 8 }}>
              <View style={{ width: 28, backgroundColor: pdfColors.accent, alignItems: 'center', justifyContent: 'center', paddingVertical: 7 }}>
                <Text style={{ fontFamily: pdfFonts.body, fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.95)', letterSpacing: 0.3 }}>
                  {data.ppe.length > 0 ? '02' : '01'}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: pdfColors.navy, paddingHorizontal: 10, paddingVertical: 7 }}>
                <Text style={{ fontFamily: pdfFonts.body, fontSize: 9.5, fontWeight: 700, color: pdfColors.white, letterSpacing: 0.8 }}>
                  RISK ASSESSMENT MATRIX
                </Text>
              </View>
            </View>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 7.5, color: pdfColors.textMuted, marginBottom: 8, fontStyle: 'italic' }}>
              Risk = Likelihood × Consequence. The matrix below shows how risk ratings are calculated for each job step, before and after control measures are applied.
            </Text>
            <RiskMatrixGrid />
          </View>

          {/* Section: Job Steps */}
          <View style={styles.sectionBody} wrap={false}>
            <View style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 10 }}>
              <View style={{ width: 28, backgroundColor: pdfColors.accent, alignItems: 'center', justifyContent: 'center', paddingVertical: 7 }}>
                <Text style={{ fontFamily: pdfFonts.body, fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.95)', letterSpacing: 0.3 }}>
                  {data.ppe.length > 0 ? '03' : '02'}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: pdfColors.navy, paddingHorizontal: 10, paddingVertical: 7 }}>
                <Text style={{ fontFamily: pdfFonts.body, fontSize: 9.5, fontWeight: 700, color: pdfColors.white, letterSpacing: 0.8 }}>
                  JOB STEPS &amp; RISK ASSESSMENT
                </Text>
              </View>
            </View>
            <StepTable steps={data.steps} riskLevels={data.riskLevels} />
          </View>
        </View>
        <RunningFooter />
      </Page>

      {/* SIGN-OFF PAGE */}
      <Page size="A4" style={styles.page}>
        <RunningHeader
          companyName={data.companyName}
          reportNumber={data.reportNumber}
          logoUrl={data.companyLogoUrl}
        />
        <View style={styles.body}>
          <View style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 14 }}>
            <View style={{ width: 28, backgroundColor: pdfColors.accent, alignItems: 'center', justifyContent: 'center', paddingVertical: 7 }}>
              <Text style={{ fontFamily: pdfFonts.body, fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.95)', letterSpacing: 0.3 }}>
                {data.ppe.length > 0 ? '04' : '03'}
              </Text>
            </View>
            <View style={{ flex: 1, backgroundColor: pdfColors.navy, paddingHorizontal: 10, paddingVertical: 7 }}>
              <Text style={{ fontFamily: pdfFonts.body, fontSize: 9.5, fontWeight: 700, color: pdfColors.white, letterSpacing: 0.8 }}>
                SIGN-OFF &amp; APPROVAL
              </Text>
            </View>
          </View>

          <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, color: pdfColors.textMuted, marginBottom: 16, fontStyle: 'italic' }}>
            By signing below, the undersigned acknowledge that they have reviewed this Job Hazard Analysis,
            understand the identified hazards and control measures, and commit to implementing the controls
            as described.
          </Text>

          {data.signOffs.length === 0 ? (
            <View style={{ borderWidth: 0.5, borderColor: pdfColors.rule, borderRadius: 3, paddingHorizontal: 12, paddingVertical: 20, alignItems: 'center' }}>
              <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, color: pdfColors.textMuted, fontStyle: 'italic' }}>
                No sign-offs recorded for this document.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {data.signOffs.map((sign, i) => (
                <View key={i}>
                  <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, fontWeight: 700, color: pdfColors.navy, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {sign.roleLabel}
                  </Text>
                  <SignatureBlock
                    signatureUrl={sign.signature}
                    name={sign.name || '\u2014'}
                    date={sign.date || '\u2014'}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
        <RunningFooter />
      </Page>
    </Document>
  );
}
