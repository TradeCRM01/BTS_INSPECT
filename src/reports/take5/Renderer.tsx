import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { RunningHeader, RunningFooter, SignatureBlock } from '../shared/components';
import { pdfColors, pdfFonts } from '../shared/styles';

export interface Take5ReportData {
  parentReportNumber: string;
  parentTaskName: string;
  parentSiteName: string;
  companyName: string;
  companyLogoUrl?: string | null;
  inspectorName: string;
  date: string;
  time: string;
  location: string;
  stopThink: string;
  identifyHazards: string;
  assessRisk: string;
  controlActions: string;
  goNoGo: 'go' | 'stop';
  signedName: string;
  signature: string | null;
  signedAt: string;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: pdfFonts.body,
    fontSize: 10,
    color: pdfColors.text,
    paddingTop: 0,
    paddingBottom: 40,
  },
  body: { paddingHorizontal: 36, paddingTop: 20 },
  title: {
    fontFamily: pdfFonts.body,
    fontSize: 18,
    fontWeight: 700,
    color: pdfColors.navy,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: pdfColors.textMuted,
    marginBottom: 16,
  },
  section: { marginBottom: 12 },
  label: {
    fontSize: 8,
    fontWeight: 700,
    color: pdfColors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  box: {
    borderWidth: 0.5,
    borderColor: pdfColors.rule,
    borderRadius: 3,
    padding: 8,
    backgroundColor: '#FAFAFA',
    minHeight: 36,
  },
  metaRow: { flexDirection: 'row', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  metaItem: { width: '30%' },
  metaLabel: { fontSize: 7, color: pdfColors.textMuted, marginBottom: 2 },
  metaValue: { fontSize: 9, fontWeight: 600 },
  banner: {
    padding: 10,
    borderRadius: 3,
    marginBottom: 14,
  },
});

export function Take5ReportRenderer({ data }: { data: Take5ReportData }) {
  const go = data.goNoGo === 'go';
  return (
    <Document title={`Take5 - ${data.parentReportNumber || data.parentTaskName}`}>
      <Page size="A4" style={styles.page}>
        <RunningHeader
          companyName={data.companyName}
          reportNumber={data.parentReportNumber || 'TAKE5'}
          logoUrl={data.companyLogoUrl ?? undefined}
        />
        <View style={styles.body}>
          <Text style={styles.title}>Take 5 — Point of work risk assessment</Text>
          <Text style={styles.subtitle}>
            Companion to JHA {data.parentReportNumber || '—'} · Does not replace the parent JHA on permit-controlled work.
          </Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Parent task</Text>
              <Text style={styles.metaValue}>{data.parentTaskName || '—'}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Site</Text>
              <Text style={styles.metaValue}>{data.parentSiteName || '—'}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Prepared by</Text>
              <Text style={styles.metaValue}>{data.inspectorName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{data.date || '—'}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Time</Text>
              <Text style={styles.metaValue}>{data.time || '—'}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Location / face</Text>
              <Text style={styles.metaValue}>{data.location || '—'}</Text>
            </View>
          </View>

          <View style={[styles.banner, { backgroundColor: go ? '#DCFCE7' : '#FEE2E2' }]}>
            <Text style={{ fontWeight: 700, color: go ? '#166534' : '#B91C1C', fontSize: 11 }}>
              {go ? 'GO — Proceed with controls in place' : 'STOP — Do not proceed until controls are adequate'}
            </Text>
          </View>

          {[
            { label: '1. Stop & think', value: data.stopThink },
            { label: '2. Identify hazards', value: data.identifyHazards },
            { label: '3. Assess the risk', value: data.assessRisk },
            { label: '4. Control actions', value: data.controlActions },
          ].map(s => (
            <View key={s.label} style={styles.section}>
              <Text style={styles.label}>{s.label}</Text>
              <View style={styles.box}>
                <Text>{s.value || '—'}</Text>
              </View>
            </View>
          ))}

          <View style={{ marginTop: 16 }}>
            <Text style={styles.label}>Worker / Take 5 sign-on</Text>
            <SignatureBlock
              signatureUrl={data.signature}
              name={data.signedName || '—'}
              date={data.signedAt || format(new Date(), 'd MMM yyyy')}
            />
          </View>
        </View>
        <RunningFooter />
      </Page>
    </Document>
  );
}
