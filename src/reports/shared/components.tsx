import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { pdfColors, pdfFonts } from './styles';

const sh = StyleSheet.create({
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: pdfColors.accent,
    backgroundColor: pdfColors.white,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCompany: {
    fontFamily: pdfFonts.body,
    fontSize: 10,
    fontWeight: 700,
    color: pdfColors.navy,
    letterSpacing: 0.3,
  },
  headerSub: {
    fontFamily: pdfFonts.body,
    fontSize: 7,
    color: pdfColors.textMuted,
    marginTop: 1,
  },
  headerRight: {
    fontFamily: pdfFonts.mono,
    fontSize: 7.5,
    color: pdfColors.textMuted,
    textAlign: 'right',
  },
  footerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 6,
    borderTopWidth: 0.5,
    borderTopColor: pdfColors.rule,
    backgroundColor: pdfColors.zebra,
  },
  footerText: {
    fontFamily: pdfFonts.body,
    fontSize: 7,
    color: pdfColors.textMuted,
  },
});

export function RunningHeader({
  companyName,
  reportNumber,
  logoUrl,
}: {
  companyName: string;
  reportNumber: string;
  logoUrl?: string | null;
}) {
  return (
    <View style={sh.headerWrap} fixed>
      <View style={sh.headerLeft}>
        {logoUrl ? (
          <>
            <Image src={logoUrl} style={{ width: 90, height: 36, objectFit: 'contain', marginRight: 10 }} />
            <View>
              <Text style={sh.headerCompany}>{companyName.toUpperCase()}</Text>
              <Text style={sh.headerSub}>INSPECTION REPORT</Text>
            </View>
          </>
        ) : (
          <View style={{ backgroundColor: pdfColors.navy, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 4 }}>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 10, fontWeight: 700, color: '#FFFFFF', letterSpacing: 0.5 }}>
              {companyName.toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={sh.headerRight}>{reportNumber}</Text>
    </View>
  );
}

export function RunningFooter() {
  return (
    <View style={sh.footerWrap} fixed>
      <Text style={sh.footerText}>CONFIDENTIAL — FOR AUTHORISED RECIPIENTS ONLY</Text>
      <Text
        style={sh.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

export function SectionHeaderBar({
  number,
  title,
  clauseRef,
}: {
  number: string;
  title: string;
  clauseRef?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 10 }}>
      <View
        style={{
          width: 28,
          backgroundColor: pdfColors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 7,
        }}
      >
        <Text
          style={{
            fontFamily: pdfFonts.body,
            fontSize: 7,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.95)',
            letterSpacing: 0.3,
          }}
        >
          {number}
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          backgroundColor: pdfColors.navy,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 10,
          paddingVertical: 7,
        }}
      >
        <Text
          style={{
            fontFamily: pdfFonts.body,
            fontSize: 9.5,
            fontWeight: 700,
            color: pdfColors.white,
            letterSpacing: 0.8,
          }}
        >
          {title}
        </Text>
        {clauseRef && (
          <Text
            style={{
              fontFamily: pdfFonts.body,
              fontSize: 7,
              color: 'rgba(255,255,255,0.5)',
              fontStyle: 'italic',
            }}
          >
            {clauseRef}
          </Text>
        )}
      </View>
    </View>
  );
}

const VERDICT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  PASS: { bg: pdfColors.pass, text: '#fff', label: 'PASS' },
  FAIL: { bg: pdfColors.fail, text: '#fff', label: 'FAIL' },
  YES: { bg: pdfColors.pass, text: '#fff', label: 'YES' },
  NO: { bg: pdfColors.fail, text: '#fff', label: 'NO' },
  'N/A': { bg: pdfColors.naBlue, text: '#fff', label: 'N/A' },
  OBSERVATIONS: { bg: pdfColors.warning, text: '#fff', label: 'OBSERVATIONS' },
  INCOMPLETE: { bg: pdfColors.incomplete, text: '#fff', label: 'INCOMPLETE' },
  COMPLIANT: { bg: pdfColors.pass, text: '#fff', label: 'COMPLIANT' },
  NON_COMPLIANT: { bg: pdfColors.fail, text: '#fff', label: 'NON-COMPLIANT' },
  COMPLIANT_WITH_OBSERVATIONS: { bg: pdfColors.warning, text: '#fff', label: 'COMPLIANT W/ OBSERVATIONS' },
};

export function VerdictPill({ verdict }: { verdict: string }) {
  const style = VERDICT_STYLES[verdict] ?? VERDICT_STYLES['N/A'];
  return (
    <View
      style={{
        backgroundColor: style.bg,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 2,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          fontFamily: pdfFonts.body,
          fontWeight: 700,
          fontSize: 6.5,
          color: style.text,
          letterSpacing: 0.6,
        }}
      >
        {style.label}
      </Text>
    </View>
  );
}

export function MetadataGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <View style={{ borderWidth: 0.5, borderColor: pdfColors.rule }}>
      {items.map((item, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            paddingVertical: 4.5,
            paddingHorizontal: 8,
            backgroundColor: i % 2 === 0 ? pdfColors.white : pdfColors.zebra,
            borderBottomWidth: i < items.length - 1 ? 0.5 : 0,
            borderBottomColor: pdfColors.rule,
          }}
        >
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, color: pdfColors.textMuted, width: '40%' }}>
            {item.label}
          </Text>
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, fontWeight: 700, color: pdfColors.text, flex: 1 }}>
            {item.value || '—'}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function PhotoThumb({
  src,
  caption,
  width = 100,
}: {
  src: string | null | undefined;
  caption?: string;
  width?: number;
}) {
  if (!src) return null;
  return (
    <View style={{ width, marginRight: 6, marginBottom: 4 }}>
      <Image
        src={src}
        style={{ width, height: width * 0.75, borderWidth: 0.5, borderColor: pdfColors.rule, objectFit: 'cover' }}
      />
      {caption && (
        <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, color: pdfColors.textMuted, marginTop: 2, fontStyle: 'italic' }}>
          {caption}
        </Text>
      )}
    </View>
  );
}

export function SignatureBlock({
  signatureUrl,
  name,
  licenceNumber,
  date,
}: {
  signatureUrl?: string | null;
  name: string;
  licenceNumber?: string;
  date: string;
}) {
  return (
    <View style={{ marginTop: 8 }}>
      <View
        style={{
          width: 280,
          borderWidth: 1,
          borderColor: pdfColors.accent,
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        {/* Header strip */}
        <View
          style={{
            backgroundColor: pdfColors.accentLight,
            paddingHorizontal: 10,
            paddingVertical: 5,
            flexDirection: 'row',
            alignItems: 'center',
            borderBottomWidth: 0.5,
            borderBottomColor: pdfColors.accent,
          }}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: pdfColors.accent,
              marginRight: 6,
            }}
          />
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, color: pdfColors.accent, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            Digitally Signed
          </Text>
        </View>

        {/* Signature image */}
        {signatureUrl ? (
          <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: pdfColors.white, borderBottomWidth: 0.5, borderBottomColor: pdfColors.rule }}>
            <Image
              src={signatureUrl}
              style={{ width: 220, height: 60, objectFit: 'contain' }}
            />
          </View>
        ) : (
          <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, backgroundColor: pdfColors.white }}>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 18, fontWeight: 700, color: pdfColors.navy, letterSpacing: 0.3 }}>
              {name}
            </Text>
          </View>
        )}

        {/* Details row */}
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 12,
            paddingVertical: 7,
            backgroundColor: pdfColors.zebra,
            borderTopWidth: 0.5,
            borderTopColor: pdfColors.rule,
            gap: 24,
          }}
        >
          <View>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, color: pdfColors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>
              Signed By
            </Text>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 8.5, color: pdfColors.navy, fontWeight: 700 }}>
              {name}
            </Text>
          </View>
          {licenceNumber ? (
            <View>
              <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, color: pdfColors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>
                Licence No
              </Text>
              <Text style={{ fontFamily: pdfFonts.mono, fontSize: 8.5, color: pdfColors.navy, fontWeight: 700 }}>
                {licenceNumber}
              </Text>
            </View>
          ) : null}
          <View>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, color: pdfColors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>
              Date Signed
            </Text>
            <Text style={{ fontFamily: pdfFonts.mono, fontSize: 8.5, color: pdfColors.navy, fontWeight: 700 }}>
              {date}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
