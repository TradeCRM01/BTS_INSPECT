import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { ElectricalReportData, ElectricalAnswer } from './types';
const btsBanner = `${window.location.origin}/2_(9).png`;
import {
  RunningHeader, RunningFooter, SectionHeaderBar,
  VerdictPill, MetadataGrid, PhotoThumb,
} from '../shared/components';
import { pdfColors, pdfFonts } from '../shared/styles';

const s = StyleSheet.create({
  page: {
    fontFamily: pdfFonts.body,
    fontSize: 9,
    color: pdfColors.text,
    paddingTop: 0,
    paddingBottom: 40,
    paddingHorizontal: 0,
  },
  body: { paddingHorizontal: 28, paddingTop: 18 },
  coverPage: { fontFamily: pdfFonts.body, fontSize: 9, color: pdfColors.text, paddingBottom: 0, paddingHorizontal: 0 },
  sectionBody: { marginBottom: 16 },
  questionRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: pdfColors.rule,
  },
  questionLabel: {
    fontFamily: pdfFonts.body,
    fontSize: 8,
    color: pdfColors.textMuted,
    width: '42%',
    paddingRight: 8,
  },
  questionValue: {
    fontFamily: pdfFonts.body,
    fontSize: 8.5,
    color: pdfColors.text,
    fontWeight: 700,
    flex: 1,
  },
  noAnswer: {
    fontFamily: pdfFonts.body,
    fontSize: 8.5,
    color: pdfColors.rule,
    flex: 1,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 4,
    backgroundColor: pdfColors.ruleLight,
  },
  instanceHeader: {
    backgroundColor: pdfColors.zebra,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: pdfColors.rule,
    borderTopWidth: 0.5,
    borderTopColor: pdfColors.rule,
  },
});

function renderAnswerValue(answer: ElectricalAnswer): string {
  const { value, type } = answer;
  if (value === null || value === undefined || value === '') return '';
  if (type === 'signature') return '';
  if (Array.isArray(value)) return value.join(', ');
  if (type === 'yes_no') {
    const raw = String(value).toLowerCase();
    if (answer.yesNoLabels === 'pass_fail') {
      if (raw === 'yes') return 'PASS';
      if (raw === 'no') return 'FAIL';
      return 'N/A';
    }
    return String(value).toUpperCase();
  }
  return String(value);
}

function AnswerRow({ answer, index }: { answer: ElectricalAnswer; index: number }) {
  const displayVal = renderAnswerValue(answer);
  const bg = index % 2 !== 0 ? pdfColors.zebra : pdfColors.white;

  if (answer.type === 'yes_no') {
    const verdict = displayVal || 'N/A';
    return (
      <View style={[s.questionRow, { backgroundColor: bg, alignItems: 'center' }]}>
        <Text style={s.questionLabel}>{answer.label}</Text>
        <View style={{ flex: 1 }}>
          <VerdictPill verdict={verdict} />
        </View>
      </View>
    );
  }

  if (answer.type === 'heading') {
    return (
      <View style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 3, backgroundColor: pdfColors.zebra, borderBottomWidth: 0.5, borderBottomColor: pdfColors.rule }}>
        <Text style={{ fontFamily: pdfFonts.body, fontSize: 7.5, fontWeight: 700, color: pdfColors.navy, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {answer.label}
        </Text>
      </View>
    );
  }

  if (answer.type === 'signature') {
    const raw = answer.value;
    const sigData: string | null =
      typeof raw === 'string' ? raw
      : raw && typeof raw === 'object' && (raw as { url?: string }).url ? (raw as { url: string }).url
      : null;
    return (
      <View style={[s.questionRow, { backgroundColor: bg, alignItems: 'flex-start' }]}>
        <Text style={s.questionLabel}>{answer.label}</Text>
        <View style={{ flex: 1 }}>
          {sigData ? (
            <Image src={sigData} style={{ width: 160, height: 50, objectFit: 'contain' }} />
          ) : (
            <Text style={s.noAnswer}>{'\u2014'}</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View>
      <View style={[s.questionRow, { backgroundColor: bg }]}>
        <Text style={s.questionLabel}>{answer.label}</Text>
        <Text style={displayVal ? s.questionValue : s.noAnswer}>
          {displayVal || '\u2014'}
        </Text>
      </View>
      {answer.photos && answer.photos.length > 0 && (
        <View style={s.photoGrid}>
          {answer.photos.map((p, pi) => (
            <PhotoThumb key={pi} src={p.url} caption={p.caption} width={88} />
          ))}
        </View>
      )}
    </View>
  );
}

export function ElectricalReport({ data }: { data: ElectricalReportData }) {
  const { meta, company } = data;

  const coverMeta = [
    { label: 'Report Number', value: meta.reportNumber },
    { label: 'Issue Date', value: meta.issueDate },
    { label: 'Site', value: meta.site },
    { label: 'Address', value: meta.siteAddress },
    { label: 'Client', value: meta.client },
    { label: 'Inspector', value: meta.inspector },
    { label: 'Licence No', value: meta.licenceNumber },
    { label: 'Date of Test', value: meta.dateOfTest },
  ].filter(item => item.value);

  const contactParts = [
    company.abn ? `ABN ${company.abn}` : null,
    company.licenceNumber ? `Licence ${company.licenceNumber}` : null,
    company.phone,
    company.website,
  ].filter(Boolean).join('  \u00B7  ');

  const docTitle = `${(meta.site ?? 'Site').replace(/[<>:"/\\|?*]/g, '_')} - ${meta.reportNumber}`;

  return (
    <Document title={docTitle}>
      {/* ── COVER PAGE ── */}
      <Page size="A4" style={s.coverPage}>
        {/* Full-width BTS banner header */}
        <View style={{ width: '100%', height: 180, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <Image src={btsBanner} style={{ width: '80%', height: 165, objectFit: 'contain' }} />
        </View>

        <View style={{ paddingHorizontal: 40, paddingTop: 12, flex: 1 }}>

          <Text style={{ fontFamily: pdfFonts.body, fontSize: 7.5, color: pdfColors.accent, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
            AS/NZS 3000:2018 — SECTION 8 VERIFICATION
          </Text>
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 26, fontWeight: 700, color: pdfColors.navy, marginBottom: 20, lineHeight: 1.2 }}>
            Electrical Verification{'\n'}Report
          </Text>

          <View style={{ height: 0.5, backgroundColor: pdfColors.rule, marginBottom: 16 }} />
          <MetadataGrid items={coverMeta as Array<{ label: string; value: string }>} />
        </View>

        <View style={{ backgroundColor: pdfColors.navy, paddingHorizontal: 40, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
              {company.name}
            </Text>
            {contactParts ? (
              <Text style={{ fontFamily: pdfFonts.body, fontSize: 7, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
                {contactParts}
              </Text>
            ) : null}
          </View>
          <Text style={{ fontFamily: pdfFonts.mono, fontSize: 7.5, color: 'rgba(255,255,255,0.35)' }}>
            {meta.reportNumber}
          </Text>
        </View>
      </Page>

      {/* ── INSPECTION RESULTS ── */}
      <Page size="A4" style={s.page}>
        <RunningHeader companyName={company.name} reportNumber={meta.reportNumber} logoUrl={company.logoUrl} />
        <View style={s.body}>
          {data.sections.map((sec, si) => {
            if (sec.isRepeating && sec.instances) {
              if (sec.instances.length === 0) return null;
              return (
                <View key={sec.id} style={s.sectionBody}>
                  <SectionHeaderBar
                    number={String(si + 1).padStart(2, '0')}
                    title={sec.title.toUpperCase()}
                  />
                  {sec.description ? (
                    <Text style={{ fontSize: 8, color: pdfColors.textMuted, marginBottom: 8, fontStyle: 'italic', paddingHorizontal: 8 }}>
                      {sec.description}
                    </Text>
                  ) : null}
                  {sec.instances.map((inst, ii) => (
                    <View key={inst.instanceId} wrap={false} style={{ marginBottom: ii < sec.instances!.length - 1 ? 10 : 0 }}>
                      <View style={s.instanceHeader}>
                        <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, fontWeight: 700, color: pdfColors.navy, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {inst.label}
                        </Text>
                      </View>
                      <View style={{ borderWidth: 0.5, borderTopWidth: 0, borderColor: pdfColors.rule }}>
                        {inst.answers.map((answer, ai) => (
                          <AnswerRow key={ai} answer={answer} index={ai} />
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              );
            }

            const visibleAnswers = sec.answers.filter(a => {
              if (a.type === 'heading') return true;
              if (a.required) return true;
              const v = a.value;
              if (v === null || v === undefined || v === '') return false;
              if (Array.isArray(v) && v.length === 0) return false;
              return true;
            });
            const nonHeadingCount = visibleAnswers.filter(a => a.type !== 'heading').length;
            if (nonHeadingCount === 0) return null;

            return (
              <View key={sec.id} style={s.sectionBody} wrap={false}>
                <SectionHeaderBar
                  number={String(si + 1).padStart(2, '0')}
                  title={sec.title.toUpperCase()}
                />
                {sec.description ? (
                  <Text style={{ fontSize: 8, color: pdfColors.textMuted, marginBottom: 8, fontStyle: 'italic', paddingHorizontal: 8 }}>
                    {sec.description}
                  </Text>
                ) : null}
                <View style={{ borderWidth: 0.5, borderColor: pdfColors.rule }}>
                  {visibleAnswers.map((answer, ai) => (
                    <AnswerRow key={ai} answer={answer} index={ai} />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
        <RunningFooter />
      </Page>

    </Document>
  );
}
