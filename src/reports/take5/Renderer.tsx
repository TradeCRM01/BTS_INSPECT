import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { RunningFooter } from '../shared/components';
import { pdfColors, pdfFonts, type PdfColors, type PdfThemeTokens } from '../shared/styles';
import { take5DocumentColors } from './theme';

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
  /** Saved companies.report_theme palette (navy, accent, accentLight, navyLight). */
  theme?: PdfThemeTokens | null;
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

function Take5RunningHeader({
  companyName,
  reportNumber,
  logoUrl,
  colors,
}: {
  companyName: string;
  reportNumber: string;
  logoUrl?: string | null;
  colors: PdfColors;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 28,
        paddingVertical: 8,
        borderBottomWidth: 2,
        borderBottomColor: colors.accent,
        backgroundColor: colors.white,
      }}
      fixed
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {logoUrl ? (
          <>
            <Image src={logoUrl} style={{ width: 56, height: 24, objectFit: 'contain', marginRight: 8 }} />
            <View>
              <Text style={{ fontFamily: pdfFonts.body, fontSize: 10, fontWeight: 700, color: colors.navy, letterSpacing: 0.3 }}>
                {companyName.toUpperCase()}
              </Text>
              <Text style={{ fontFamily: pdfFonts.body, fontSize: 7, color: colors.textMuted, marginTop: 1 }}>
                INSPECTION REPORT
              </Text>
            </View>
          </>
        ) : (
          <View style={{ backgroundColor: colors.navy, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 4 }}>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 10, fontWeight: 700, color: '#FFFFFF', letterSpacing: 0.5 }}>
              {companyName.toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={{ fontFamily: pdfFonts.mono, fontSize: 7.5, color: colors.textMuted, textAlign: 'right' }}>
        {reportNumber}
      </Text>
    </View>
  );
}

function Take5SignatureBlock({
  signatureUrl,
  name,
  date,
  colors,
}: {
  signatureUrl?: string | null;
  name: string;
  date: string;
  colors: PdfColors;
}) {
  return (
    <View style={{ marginTop: 8 }}>
      <View
        style={{
          width: 280,
          borderWidth: 1,
          borderColor: colors.accent,
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            backgroundColor: colors.accentLight,
            paddingHorizontal: 10,
            paddingVertical: 5,
            flexDirection: 'row',
            alignItems: 'center',
            borderBottomWidth: 0.5,
            borderBottomColor: colors.accent,
          }}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: colors.accent,
              marginRight: 6,
            }}
          />
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, color: colors.accent, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            Digitally Signed
          </Text>
        </View>
        {signatureUrl ? (
          <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.white, borderBottomWidth: 0.5, borderBottomColor: colors.rule }}>
            <Image
              src={signatureUrl}
              style={{ width: 220, height: 60, objectFit: 'contain' }}
            />
          </View>
        ) : (
          <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, backgroundColor: colors.white }}>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 18, fontWeight: 700, color: colors.navy, letterSpacing: 0.3 }}>
              {name}
            </Text>
          </View>
        )}
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 12,
            paddingVertical: 7,
            backgroundColor: colors.zebra,
            borderTopWidth: 0.5,
            borderTopColor: colors.rule,
            gap: 24,
          }}
        >
          <View>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>
              Signed By
            </Text>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 8.5, color: colors.navy, fontWeight: 700 }}>
              {name}
            </Text>
          </View>
          <View>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>
              Date Signed
            </Text>
            <Text style={{ fontFamily: pdfFonts.mono, fontSize: 8.5, color: colors.navy, fontWeight: 700 }}>
              {date}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function Take5ReportRenderer({ data }: { data: Take5ReportData }) {
  const go = data.goNoGo === 'go';
  const colors = take5DocumentColors(data.theme);
  return (
    <Document title={`Take5 - ${data.parentReportNumber || data.parentTaskName}`}>
      <Page size="A4" style={styles.page}>
        <Take5RunningHeader
          companyName={data.companyName}
          reportNumber={data.parentReportNumber || 'TAKE5'}
          logoUrl={data.companyLogoUrl ?? undefined}
          colors={colors}
        />
        <View style={styles.body}>
          <Text style={[styles.title, { color: colors.navy }]}>Take 5 — Point of work risk assessment</Text>
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
              <Text style={[styles.label, { color: colors.navy }]}>{s.label}</Text>
              <View style={styles.box}>
                <Text>{s.value || '—'}</Text>
              </View>
            </View>
          ))}

          <View style={{ marginTop: 16 }}>
            <Text style={[styles.label, { color: colors.navy }]}>Worker / Take 5 sign-on</Text>
            <Take5SignatureBlock
              signatureUrl={data.signature}
              name={data.signedName || '—'}
              date={data.signedAt || format(new Date(), 'd MMM yyyy')}
              colors={colors}
            />
          </View>
        </View>
        <RunningFooter />
      </Page>
    </Document>
  );
}
