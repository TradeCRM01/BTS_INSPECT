import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { GenericReportData, GenericAnswer } from './types';
const btsBanner = `${window.location.origin}/2_(9).png`;
import {
  RunningHeader, RunningFooter, SectionHeaderBar,
  MetadataGrid, PhotoThumb, VerdictPill,
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
    width: '38%',
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
});

function renderAnswerValue(answer: GenericAnswer): string {
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

export function GenericInspectionRenderer({ data }: { data: GenericReportData }) {
  const metaItems = [
    { label: 'Report Number', value: data.reportNumber },
    { label: 'Issue Date', value: data.issueDate },
    ...(data.siteName ? [{ label: 'Site', value: data.siteName }] : []),
    ...(data.siteAddress ? [{ label: 'Address', value: data.siteAddress }] : []),
    ...(data.clientName ? [{ label: 'Client', value: data.clientName }] : []),
    ...(data.jobNumber ? [{ label: 'Job / Reference', value: data.jobNumber }] : []),
    { label: 'Inspector', value: data.inspectorName },
    { label: 'Company', value: data.companyName },
  ];

  const contactParts = [
    data.companyAbn ? `ABN ${data.companyAbn}` : null,
    data.companyPhone,
    data.companyEmail,
    data.companyWebsite,
  ].filter(Boolean).join('  \u00B7  ');

  const docTitle = `${(data.siteName ?? 'Site').replace(/[<>:"/\\|?*]/g, '_')} - ${data.reportNumber}`;

  return (
    <Document title={docTitle}>
      {/* ── COVER PAGE ── */}
      <Page size="A4" style={styles.coverPage}>
        {/* Full-width BTS banner header */}
        <View style={{ width: '100%', height: 180, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <Image src={btsBanner} style={{ width: '80%', height: 165, objectFit: 'contain' }} />
        </View>

        <View style={{ paddingHorizontal: 40, paddingTop: 12, flex: 1 }}>

          {/* Eyebrow + title */}
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 7.5, color: pdfColors.accent, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
            INSPECTION REPORT
          </Text>
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 28, fontWeight: 700, color: pdfColors.navy, marginBottom: 6, lineHeight: 1.2 }}>
            {data.templateName}
          </Text>
          {data.siteName && (
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 13, color: pdfColors.textSecondary, marginBottom: 24 }}>
              {data.siteName}
            </Text>
          )}

          <View style={{ height: 0.5, backgroundColor: pdfColors.rule, marginBottom: 20 }} />
          <MetadataGrid items={metaItems} />
        </View>

        {/* Bottom dark band */}
        <View style={{ backgroundColor: pdfColors.navy, paddingHorizontal: 40, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
              {data.companyName}
            </Text>
            {contactParts ? (
              <Text style={{ fontFamily: pdfFonts.body, fontSize: 7, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
                {contactParts}
              </Text>
            ) : null}
          </View>
          <Text style={{ fontFamily: pdfFonts.mono, fontSize: 7.5, color: 'rgba(255,255,255,0.35)' }}>
            {data.reportNumber}
          </Text>
        </View>
      </Page>

      {/* ── CONTENT PAGES ── */}
      <Page size="A4" style={styles.page}>
        <RunningHeader
          companyName={data.companyName}
          reportNumber={data.reportNumber}
          logoUrl={data.companyLogoUrl}
        />
        <View style={styles.body}>
          {data.sections.map((sec, si) => {
            if (sec.isRepeating && sec.instances) {
              if (sec.instances.length === 0) return null;
              return (
                <View key={sec.id} style={styles.sectionBody}>
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
                      <View style={{ backgroundColor: pdfColors.zebra, paddingHorizontal: 8, paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: pdfColors.rule, borderTopWidth: 0.5, borderTopColor: pdfColors.rule }}>
                        <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, fontWeight: 700, color: pdfColors.navy, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {inst.label}
                        </Text>
                      </View>
                      <View style={{ borderWidth: 0.5, borderTopWidth: 0, borderColor: pdfColors.rule }}>
                        {inst.answers.map((answer, ai) => {
                          const displayVal = renderAnswerValue(answer);
                          const bg = ai % 2 !== 0 ? pdfColors.zebra : pdfColors.white;
                          if (answer.type === 'yes_no') {
                            return (
                              <View key={ai} style={[styles.questionRow, { backgroundColor: bg, alignItems: 'center' }]}>
                                <Text style={styles.questionLabel}>{answer.label}</Text>
                                <View style={{ flex: 1 }}><VerdictPill verdict={displayVal || 'N/A'} /></View>
                              </View>
                            );
                          }
                          if (answer.type === 'heading') {
                            return (
                              <View key={ai} style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 3, backgroundColor: pdfColors.zebra, borderBottomWidth: 0.5, borderBottomColor: pdfColors.rule }}>
                                <Text style={{ fontFamily: pdfFonts.body, fontSize: 7.5, fontWeight: 700, color: pdfColors.navy, textTransform: 'uppercase', letterSpacing: 0.8 }}>{answer.label}</Text>
                              </View>
                            );
                          }
                          if (answer.type === 'signature') {
                            const raw = answer.value;
                            const sigData: string | null = typeof raw === 'string' ? raw : raw && typeof raw === 'object' && (raw as { url?: string }).url ? (raw as { url: string }).url : null;
                            return (
                              <View key={ai} style={[styles.questionRow, { backgroundColor: bg, alignItems: 'flex-start' }]}>
                                <Text style={styles.questionLabel}>{answer.label}</Text>
                                <View style={{ flex: 1 }}>
                                  {sigData ? <Image src={sigData} style={{ width: 160, height: 50, objectFit: 'contain' }} /> : <Text style={styles.noAnswer}>{'\u2014'}</Text>}
                                </View>
                              </View>
                            );
                          }
                          return (
                            <View key={ai}>
                              <View style={[styles.questionRow, { backgroundColor: bg }]}>
                                <Text style={styles.questionLabel}>{answer.label}</Text>
                                <Text style={displayVal ? styles.questionValue : styles.noAnswer}>{displayVal || '\u2014'}</Text>
                              </View>
                              {answer.photos && answer.photos.length > 0 && (
                                <View style={styles.photoGrid}>
                                  {answer.photos.map((p, pi) => <PhotoThumb key={pi} src={p.url} caption={p.caption} width={88} />)}
                                </View>
                              )}
                            </View>
                          );
                        })}
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
              <View key={sec.id} style={styles.sectionBody} wrap={false}>
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
                  {visibleAnswers.map((answer, ai) => {
                    const displayVal = renderAnswerValue(answer);
                    const bg = ai % 2 !== 0 ? pdfColors.zebra : pdfColors.white;

                    if (answer.type === 'yes_no') {
                      const verdict = displayVal || 'N/A';
                      return (
                        <View key={ai} style={[styles.questionRow, { backgroundColor: bg, alignItems: 'center' }]}>
                          <Text style={styles.questionLabel}>{answer.label}</Text>
                          <View style={{ flex: 1 }}>
                            <VerdictPill verdict={verdict} />
                          </View>
                        </View>
                      );
                    }

                    if (answer.type === 'heading') {
                      return (
                        <View key={ai} style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 3, backgroundColor: pdfColors.zebra, borderBottomWidth: 0.5, borderBottomColor: pdfColors.rule }}>
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
                        <View key={ai} style={[styles.questionRow, { backgroundColor: bg, alignItems: 'flex-start' }]}>
                          <Text style={styles.questionLabel}>{answer.label}</Text>
                          <View style={{ flex: 1 }}>
                            {sigData ? (
                              <Image src={sigData} style={{ width: 160, height: 50, objectFit: 'contain' }} />
                            ) : (
                              <Text style={styles.noAnswer}>{'\u2014'}</Text>
                            )}
                          </View>
                        </View>
                      );
                    }

                    return (
                      <View key={ai}>
                        <View style={[styles.questionRow, { backgroundColor: bg }]}>
                          <Text style={styles.questionLabel}>{answer.label}</Text>
                          <Text style={displayVal ? styles.questionValue : styles.noAnswer}>
                            {displayVal || '\u2014'}
                          </Text>
                        </View>
                        {answer.photos && answer.photos.length > 0 && (
                          <View style={styles.photoGrid}>
                            {answer.photos.map((p, pi) => (
                              <PhotoThumb key={pi} src={p.url} caption={p.caption} width={88} />
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}
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
