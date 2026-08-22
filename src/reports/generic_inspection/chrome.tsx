import { View, Text, Image } from '@react-pdf/renderer';
import { pdfFonts, type PdfColors } from '../shared/styles';

export function InspectionRunningHeader({
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

export function InspectionCoverLetterhead({
  companyName,
  logoUrl,
  contactLine,
  colors,
}: {
  companyName: string;
  logoUrl?: string | null;
  contactLine?: string;
  colors: PdfColors;
}) {
  return (
    <View
      style={{
        width: '100%',
        backgroundColor: colors.navy,
        paddingHorizontal: 40,
        paddingVertical: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flex: 1, paddingRight: 16 }}>
        {logoUrl ? (
          <Image src={logoUrl} style={{ width: 96, height: 36, objectFit: 'contain', marginBottom: 8 }} />
        ) : null}
        <Text style={{ fontFamily: pdfFonts.body, fontSize: logoUrl ? 14 : 22, fontWeight: 700, color: '#FFFFFF', letterSpacing: 0.4 }}>
          {companyName}
        </Text>
        {contactLine ? (
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 7.5, color: 'rgba(255,255,255,0.55)', marginTop: 8 }}>
            {contactLine}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: pdfFonts.body, fontSize: 7, color: 'rgba(255,255,255,0.45)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Inspection report
        </Text>
      </View>
    </View>
  );
}

export function InspectionSectionHeaderBar({
  number,
  title,
  clauseRef,
  colors,
}: {
  number: string;
  title: string;
  clauseRef?: string;
  colors: PdfColors;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 10 }}>
      <View
        style={{
          width: 28,
          backgroundColor: colors.accent,
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
          backgroundColor: colors.navy,
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
            color: colors.white,
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

export function InspectionSignatureBlock({
  signatureUrl,
  name,
  licenceNumber,
  date,
  roleLabel,
  colors,
}: {
  signatureUrl?: string | null;
  name: string;
  licenceNumber?: string;
  date: string;
  roleLabel?: string;
  colors: PdfColors;
}) {
  return (
    <View style={{ marginTop: 8 }}>
      {roleLabel ? (
        <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, fontWeight: 700, color: colors.navy, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {roleLabel}
        </Text>
      ) : null}
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
            <Image src={signatureUrl} style={{ width: 220, height: 60, objectFit: 'contain' }} />
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
          {licenceNumber ? (
            <View>
              <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>
                Licence No
              </Text>
              <Text style={{ fontFamily: pdfFonts.mono, fontSize: 8.5, color: colors.navy, fontWeight: 700 }}>
                {licenceNumber}
              </Text>
            </View>
          ) : null}
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
