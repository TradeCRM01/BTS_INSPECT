import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import {
  parseReportTheme,
  pdfFonts,
  resolvePdfColors,
  type PdfColors,
  type PdfThemeTokens,
} from '../shared/styles';
import { formatMoney } from '../../types/fsm';
import type { QuoteLineItem, InvoiceLineItem } from '../../types/fsm';
import { gstLabel } from '../../lib/gst';
import { companyDocumentLogoUrl } from '../../lib/companyLogo';

/** Saved companies.report_theme on this document, or the existing commercial default. */
export function commercialDocumentColors(theme?: unknown): PdfColors {
  return resolvePdfColors(parseReportTheme(theme));
}

export type CommercialDocKind = 'quote' | 'invoice' | 'purchase_order';

export interface CommercialLine {
  description: string;
  quantity: number;
  unit_price: number;
  charge_type?: string | null;
  unit_cost?: number | null;
}

export interface CommercialPdfData {
  kind: CommercialDocKind;
  title: string;
  docNumber: string;
  dateLabel: string;
  dateValue: string;
  secondaryLabel?: string;
  secondaryValue?: string;
  clientName: string;
  clientDetail?: string | null;
  company: {
    name: string;
    abn?: string | null;
    licence_number?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    logo_url?: string | null;
    report_theme?: PdfThemeTokens | Record<string, unknown> | null;
  };
  inclusions: string[];
  exclusions: string[];
  lines: CommercialLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  /** Short quote summary (shown near client). */
  description?: string | null;
  /** Longer client-facing scope narrative. */
  scopeOfWorks?: string | null;
  notes?: string | null;
  paymentTerms?: string | null;
  paymentMethods?: { label: string; lines: string[] }[];
}

function commercialStyles(colors: PdfColors, kind: CommercialDocKind) {
  const quote = kind === 'quote' || kind === 'invoice';
  const titleFace = quote ? 'Rajdhani' : pdfFonts.body;
  const bodyFace = quote ? 'Source Sans 3' : pdfFonts.body;
  const ink = quote ? '#0A2540' : colors.text;
  const muted = quote ? '#5B6B7C' : colors.textMuted;
  const secondary = quote ? '#5B6B7C' : colors.textSecondary;
  const hairline = quote ? '#E2D9CC' : colors.rule;
  return StyleSheet.create({
    page: {
      fontFamily: bodyFace,
      fontSize: 9,
      color: ink,
      backgroundColor: quote ? '#F5F0E6' : colors.white,
      paddingTop: 28,
      paddingBottom: 40,
      paddingHorizontal: 36,
    },
    letterhead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      borderBottomWidth: 2.5,
      borderBottomColor: colors.navy,
      paddingBottom: 14,
      marginBottom: 16,
    },
    brandBlock: { flexDirection: 'row', alignItems: 'flex-start', maxWidth: '62%' },
    logo: { width: 56, height: 32, objectFit: 'contain', marginRight: 10, marginTop: 1 },
    companyName: {
      fontFamily: titleFace,
      fontSize: 14,
      fontWeight: 700,
      color: colors.navy,
      letterSpacing: 0.4,
    },
    companyMeta: { fontFamily: bodyFace, fontSize: 7.5, color: muted, marginTop: 2, lineHeight: 1.35 },
    docMeta: { alignItems: 'flex-end' },
    docTitle: {
      fontFamily: titleFace,
      fontSize: quote ? 20 : 16,
      fontWeight: 700,
      color: colors.navy,
      letterSpacing: quote ? 1.4 : 1,
    },
    docNumber: { fontFamily: titleFace, fontSize: 10, color: colors.accent, fontWeight: 700, marginTop: 4 },
    metaRow: { fontFamily: bodyFace, fontSize: 8, color: secondary, marginTop: 3 },
    partyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
      gap: 16,
    },
    partyBox: { flex: 1 },
    partyLabel: {
      fontFamily: titleFace,
      fontSize: 7,
      fontWeight: 700,
      color: muted,
      letterSpacing: quote ? 1.2 : 0.6,
      marginBottom: 4,
      textTransform: 'uppercase',
    },
    partyValue: { fontFamily: titleFace, fontSize: 10, fontWeight: 700, color: colors.navy },
    partySub: { fontFamily: bodyFace, fontSize: 8, color: secondary, marginTop: 2 },
    sectionTitle: {
      fontFamily: titleFace,
      fontSize: 10,
      fontWeight: 700,
      color: colors.navy,
      marginBottom: 8,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: hairline,
    },
    twoCol: { flexDirection: 'row', gap: 14, marginBottom: 18 },
    col: { flex: 1 },
    colHead: {
      fontFamily: titleFace,
      fontSize: 8,
      fontWeight: 700,
      color: colors.white,
      backgroundColor: colors.navy,
      paddingVertical: 5,
      paddingHorizontal: 8,
      marginBottom: 6,
    },
    colHeadAmber: { backgroundColor: '#92400E' },
    bullet: { flexDirection: 'row', marginBottom: 4, paddingRight: 4 },
    bulletMark: { width: 10, fontSize: 8, color: colors.accent },
    bulletText: { flex: 1, fontFamily: bodyFace, fontSize: 8.5, color: secondary, lineHeight: 1.35 },
    emptyHint: { fontSize: 8, color: muted, fontStyle: 'italic' },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: colors.navy,
      paddingVertical: 6,
      paddingHorizontal: 6,
    },
    th: { fontFamily: titleFace, color: colors.white, fontSize: 7.5, fontWeight: 700 },
    row: {
      flexDirection: 'row',
      paddingVertical: 5,
      paddingHorizontal: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: hairline,
    },
    rowAlt: { backgroundColor: quote ? '#FFFDF8' : colors.zebra },
    td: { fontFamily: bodyFace, fontSize: 8, color: ink },
    totals: { marginTop: 10, alignSelf: 'flex-end', width: quote ? 220 : 200 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
    totalLabel: { fontFamily: bodyFace, fontSize: 8.5, color: secondary },
    totalValue: { fontFamily: bodyFace, fontSize: 8.5, color: ink },
    grandRow: quote
      ? {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 8,
          paddingVertical: 8,
          paddingHorizontal: 10,
          backgroundColor: colors.navy,
        }
      : {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 4,
          paddingTop: 6,
          borderTopWidth: 1.5,
          borderTopColor: colors.navy,
        },
    grandLabel: {
      fontFamily: titleFace,
      fontSize: quote ? 12 : 10,
      fontWeight: 700,
      color: quote ? colors.white : colors.navy,
    },
    grandValue: {
      fontFamily: titleFace,
      fontSize: quote ? 12 : 10,
      fontWeight: 700,
      color: quote ? colors.white : colors.navy,
    },
    notes: { marginTop: 16 },
    notesBody: { fontSize: 8.5, color: secondary, lineHeight: 1.4 },
    footer: {
      position: 'absolute',
      bottom: 18,
      left: 36,
      right: 36,
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 0.5,
      borderTopColor: hairline,
      paddingTop: 6,
    },
    footerText: { fontSize: 7, color: muted },
  });
}

function kindLabel(kind: CommercialDocKind): string {
  if (kind === 'quote') return 'QUOTATION';
  if (kind === 'invoice') return 'TAX INVOICE';
  return 'PURCHASE ORDER';
}

export function CommercialDocumentPdf({ data }: { data: CommercialPdfData }) {
  const { company } = data;
  const colors = commercialDocumentColors(company.report_theme);
  const s = commercialStyles(colors, data.kind);
  const logoUrl = companyDocumentLogoUrl(company);
  const contactBits = [company.phone, company.email, company.website].filter(Boolean).join('  ·  ');
  const abnBits = [
    company.abn ? `ABN ${company.abn}` : null,
    company.licence_number ? `Lic. ${company.licence_number}` : null,
  ].filter(Boolean).join('  ·  ');

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* 1. Letterhead */}
        <View style={s.letterhead}>
          <View style={s.brandBlock}>
            {logoUrl ? (
              <Image src={logoUrl} style={s.logo} />
            ) : null}
            <View>
              <Text style={s.companyName}>{company.name.toUpperCase()}</Text>
              {abnBits ? <Text style={s.companyMeta}>{abnBits}</Text> : null}
              {contactBits ? <Text style={s.companyMeta}>{contactBits}</Text> : null}
            </View>
          </View>
          <View style={s.docMeta}>
            <Text style={s.docTitle}>{kindLabel(data.kind)}</Text>
            <Text style={s.docNumber}>{data.docNumber}</Text>
            <Text style={s.metaRow}>{data.dateLabel}: {data.dateValue}</Text>
            {data.secondaryLabel && data.secondaryValue ? (
              <Text style={s.metaRow}>{data.secondaryLabel}: {data.secondaryValue}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.partyRow}>
          <View style={s.partyBox}>
            <Text style={s.partyLabel}>{data.kind === 'purchase_order' ? 'Supplier' : 'Prepared for'}</Text>
            <Text style={s.partyValue}>{data.clientName || '—'}</Text>
            {data.clientDetail ? <Text style={s.partySub}>{data.clientDetail}</Text> : null}
            {data.description?.trim() ? (
              <Text style={[s.partySub, { marginTop: 6, fontWeight: 700, color: colors.navy }]}>
                {data.description.trim()}
              </Text>
            ) : null}
          </View>
          {data.paymentTerms ? (
            <View style={s.partyBox}>
              <Text style={s.partyLabel}>Payment terms</Text>
              <Text style={s.partyValue}>{data.paymentTerms}</Text>
            </View>
          ) : null}
        </View>

        {data.scopeOfWorks?.trim() ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={s.sectionTitle}>Scope of works</Text>
            <Text style={s.notesBody}>{data.scopeOfWorks.trim()}</Text>
          </View>
        ) : null}

        {/* 2. Variations — only sections that have content */}
        {(data.inclusions.length > 0 || data.exclusions.length > 0) && (
          <View>
            <Text style={s.sectionTitle}>Variations</Text>
            <View style={s.twoCol}>
              {data.inclusions.length > 0 && (
                <View style={s.col}>
                  <Text style={s.colHead}>INCLUDED</Text>
                  {data.inclusions.map((item, i) => (
                    <View key={`in-${i}`} style={s.bullet}>
                      <Text style={s.bulletMark}>•</Text>
                      <Text style={s.bulletText}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}
              {data.exclusions.length > 0 && (
                <View style={s.col}>
                  <Text style={[s.colHead, s.colHeadAmber]}>NOT INCLUDED</Text>
                  {data.exclusions.map((item, i) => (
                    <View key={`ex-${i}`} style={s.bullet}>
                      <Text style={s.bulletMark}>•</Text>
                      <Text style={s.bulletText}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* 3. Pricing breakdown */}
        <Text style={s.sectionTitle}>{data.title || 'Pricing breakdown'}</Text>
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: '18%' }]}>Type</Text>
          <Text style={[s.th, { width: '42%' }]}>Description</Text>
          <Text style={[s.th, { width: '10%', textAlign: 'right' }]}>Qty</Text>
          <Text style={[s.th, { width: '15%', textAlign: 'right' }]}>Unit</Text>
          <Text style={[s.th, { width: '15%', textAlign: 'right' }]}>Amount</Text>
        </View>
        {data.lines.map((li, i) => {
          const amount = (li.quantity || 0) * (li.unit_price || 0);
          return (
            <View key={i} style={i % 2 === 1 ? [s.row, s.rowAlt] : s.row} wrap={false}>
              <Text style={[s.td, { width: '18%', color: colors.textMuted }]}>{li.charge_type || '—'}</Text>
              <Text style={[s.td, { width: '42%' }]}>{li.description}</Text>
              <Text style={[s.td, { width: '10%', textAlign: 'right' }]}>{li.quantity}</Text>
              <Text style={[s.td, { width: '15%', textAlign: 'right' }]}>{formatMoney(li.unit_price)}</Text>
              <Text style={[s.td, { width: '15%', textAlign: 'right', fontWeight: 700 }]}>{formatMoney(amount)}</Text>
            </View>
          );
        })}

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal (ex GST)</Text>
            <Text style={s.totalValue}>{formatMoney(data.subtotal)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>{gstLabel(data.taxRate)}</Text>
            <Text style={s.totalValue}>{formatMoney(data.taxAmount)}</Text>
          </View>
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>Total (inc GST)</Text>
            <Text style={s.grandValue}>{formatMoney(data.total)}</Text>
          </View>
        </View>

        {data.notes?.trim() ? (
          <View style={s.notes}>
            <Text style={s.sectionTitle}>Notes</Text>
            <Text style={s.notesBody}>{data.notes}</Text>
          </View>
        ) : null}

        {data.kind === 'invoice' && (data.paymentMethods?.length ?? 0) > 0 ? (
          <View style={s.notes}>
            <Text style={s.sectionTitle}>How to pay</Text>
            {data.paymentMethods!.map((method, i) => (
              <View key={`pay-${i}`} style={{ marginBottom: 8 }} wrap={false}>
                <Text style={s.partyValue}>{method.label}</Text>
                {method.lines.map((line, j) => (
                  <Text key={`pay-${i}-${j}`} style={s.notesBody}>{line}</Text>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>{company.name} — {kindLabel(data.kind).toLowerCase()}</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export function linesFromQuoteItems(items: QuoteLineItem[] | InvoiceLineItem[]): CommercialLine[] {
  return (items ?? []).map(li => ({
    description: li.description,
    quantity: li.quantity,
    unit_price: li.unit_price,
    charge_type: li.charge_type ?? null,
    unit_cost: li.unit_cost ?? null,
  }));
}
