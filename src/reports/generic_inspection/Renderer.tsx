import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { GenericReportData, GenericAnswer } from './types';
import {
  RunningHeader, RunningFooter, SectionHeaderBar,
  MetadataGrid, PhotoThumb, VerdictPill, SignatureBlock,
  CoverLetterhead, OverallVerdictStamp, DefectRegister,
} from '../shared/components';
import { TestScheduleTable } from '../shared/TestScheduleTable';
import { pdfColors, pdfFonts } from '../shared/styles';
import { formatMeasured } from '../shared/inspectionCompose';
import { isNaAnswer } from '../../types/template';

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
  comment: {
    fontFamily: pdfFonts.body,
    fontSize: 7.5,
    color: pdfColors.textSecondary,
    fontStyle: 'italic',
    paddingHorizontal: 8,
    paddingBottom: 6,
    backgroundColor: pdfColors.ruleLight,
    borderBottomWidth: 0.5,
    borderBottomColor: pdfColors.rule,
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
  if (isNaAnswer(value)) return 'N/A';
  if (type === 'signature') return '';
  if (type === 'photo') return '';
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
  if (type === 'number' || type === 'slider') {
    return formatMeasured(value, answer.numberConfig);
  }
  return String(value);
}

function AnswerBlock({ answer, index, compact }: { answer: GenericAnswer; index: number; compact?: boolean }) {
  const displayVal = renderAnswerValue(answer);
  const bg = index % 2 !== 0 ? pdfColors.zebra : pdfColors.white;
  const showPhotos = !compact && answer.photos && answer.photos.length > 0;

  if (answer.type === 'heading') {
    return (
      <View style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 3, backgroundColor: pdfColors.zebra, borderBottomWidth: 0.5, borderBottomColor: pdfColors.rule }}>
        <Text style={{ fontFamily: pdfFonts.body, fontSize: 7.5, fontWeight: 700, color: pdfColors.navy, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {answer.label}
        </Text>
      </View>
    );
  }

  // Signatures live on the dedicated sign-off page
  if (answer.type === 'signature') {
    return (
      <View style={[styles.questionRow, { backgroundColor: bg, alignItems: 'center' }]}>
        <Text style={styles.questionLabel}>{answer.label}</Text>
        <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, color: pdfColors.accent, flex: 1 }}>
          See sign-off page
        </Text>
      </View>
    );
  }

  if (answer.type === 'yes_no') {
    return (
      <View>
        <View style={[styles.questionRow, { backgroundColor: bg, alignItems: 'center' }]}>
          <Text style={styles.questionLabel}>{answer.label}</Text>
          <View style={{ flex: 1 }}><VerdictPill verdict={displayVal || 'N/A'} /></View>
        </View>
        {answer.comment ? <Text style={styles.comment}>Note: {answer.comment}</Text> : null}
        {showPhotos && (
          <View style={styles.photoGrid}>
            {answer.photos!.map((p, pi) => <PhotoThumb key={pi} src={p.url} caption={p.caption} width={88} />)}
          </View>
        )}
      </View>
    );
  }

  if (answer.type === 'photo') {
    return (
      <View>
        <View style={[styles.questionRow, { backgroundColor: bg }]}>
          <Text style={styles.questionLabel}>{answer.label}</Text>
          <Text style={styles.questionValue}>
            {answer.photos?.length ? `${answer.photos.length} photo(s) — see appendix` : '—'}
          </Text>
        </View>
        {answer.comment ? <Text style={styles.comment}>Note: {answer.comment}</Text> : null}
      </View>
    );
  }

  if ((answer.type === 'number' || answer.type === 'slider') && answer.numericStatus && answer.numericStatus !== 'unchecked') {
    const pill =
      answer.numericStatus === 'pass' ? 'PASS'
        : answer.numericStatus === 'fail' ? 'FAIL'
          : 'N/A';
    return (
      <View>
        <View style={[styles.questionRow, { backgroundColor: bg, alignItems: 'center' }]}>
          <Text style={styles.questionLabel}>{answer.label}</Text>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.questionValue}>{displayVal || '\u2014'}</Text>
            <VerdictPill verdict={pill} />
          </View>
        </View>
        {answer.comment ? <Text style={styles.comment}>Note: {answer.comment}</Text> : null}
        {showPhotos && (
          <View style={styles.photoGrid}>
            {answer.photos!.map((p, pi) => <PhotoThumb key={pi} src={p.url} caption={p.caption} width={88} />)}
          </View>
        )}
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.questionRow, { backgroundColor: bg }]}>
        <Text style={styles.questionLabel}>{answer.label}</Text>
        <Text style={displayVal ? styles.questionValue : styles.noAnswer}>{displayVal || '\u2014'}</Text>
      </View>
      {answer.comment ? <Text style={styles.comment}>Note: {answer.comment}</Text> : null}
      {showPhotos && (
        <View style={styles.photoGrid}>
          {answer.photos!.map((p, pi) => <PhotoThumb key={pi} src={p.url} caption={p.caption} width={88} />)}
        </View>
      )}
    </View>
  );
}

function isVisibleAnswer(a: GenericAnswer): boolean {
  if (a.type === 'heading' || a.type === 'signature') return true;
  if (a.required) return true;
  if (a.comment) return true;
  if (a.photos && a.photos.length > 0) return true;
  const v = a.value;
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

export function GenericInspectionRenderer({ data }: { data: GenericReportData }) {
  const isCertificate = data.layoutMode === 'certificate';
  const useSchedule = data.layoutMode === 'test_schedule' || data.layoutMode === 'certificate';

  const metaItems = [
    { label: 'Report Number', value: data.reportNumber },
    { label: 'Issue Date', value: data.issueDate },
    { label: 'Document version', value: `v${data.docVersion}` },
    ...(data.amendmentReason ? [{ label: 'Amendment', value: data.amendmentReason }] : []),
    ...(data.siteName ? [{ label: 'Site', value: data.siteName }] : []),
    ...(data.siteAddress ? [{ label: 'Address', value: data.siteAddress }] : []),
    ...(data.clientName ? [{ label: 'Client', value: data.clientName }] : []),
    ...(data.jobNumber ? [{ label: 'Job / Reference', value: data.jobNumber }] : []),
    ...(data.jobDescription ? [{ label: 'Job description', value: data.jobDescription }] : []),
    ...data.customFields.map(f => ({ label: f.label, value: f.value })),
    { label: 'Inspector', value: data.inspectorName },
    ...(data.inspectorLicence ? [{ label: 'Licence No', value: data.inspectorLicence }] : []),
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
        <CoverLetterhead
          companyName={data.companyName}
          logoUrl={data.companyLogoUrl}
          contactLine={contactParts || undefined}
        />

        <View style={{ paddingHorizontal: 40, paddingTop: 20, flex: 1 }}>
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 7.5, color: pdfColors.accent, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
            INSPECTION REPORT
          </Text>
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 26, fontWeight: 700, color: pdfColors.navy, marginBottom: 6, lineHeight: 1.2 }}>
            {data.templateName}
          </Text>
          {data.siteName && (
            <Text style={{ fontFamily: pdfFonts.body, fontSize: 13, color: pdfColors.textSecondary, marginBottom: 16 }}>
              {data.siteName}
            </Text>
          )}

          <OverallVerdictStamp verdict={data.overallVerdict} label={data.overallVerdictLabel} />

          <View style={{ height: 0.5, backgroundColor: pdfColors.rule, marginBottom: 16 }} />
          <MetadataGrid items={metaItems} />
        </View>

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

      {/* ── CONTENT (multi-page wrap enabled) ── */}
      <Page size="A4" style={styles.page} wrap>
        <RunningHeader
          companyName={data.companyName}
          reportNumber={data.reportNumber}
          logoUrl={data.companyLogoUrl}
        />
        <View style={styles.body}>
          {data.sections.map((sec, si) => {
            if (sec.isRepeating && sec.instances) {
              if (sec.instances.length === 0) return null;
              if (useSchedule) {
                return (
                  <TestScheduleTable
                    key={sec.id}
                    title={sec.title.toUpperCase()}
                    sectionNumber={String(si + 1).padStart(2, '0')}
                    instances={sec.instances}
                  />
                );
              }
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
                    <View key={inst.instanceId} style={{ marginBottom: ii < sec.instances!.length - 1 ? 10 : 0 }}>
                      <View style={{ backgroundColor: pdfColors.zebra, paddingHorizontal: 8, paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: pdfColors.rule, borderTopWidth: 0.5, borderTopColor: pdfColors.rule }}>
                        <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, fontWeight: 700, color: pdfColors.navy, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {inst.label}
                        </Text>
                      </View>
                      <View style={{ borderWidth: 0.5, borderTopWidth: 0, borderColor: pdfColors.rule }}>
                        {inst.answers.filter(isVisibleAnswer).map((answer, ai) => (
                          <AnswerBlock key={ai} answer={answer} index={ai} compact={isCertificate} />
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              );
            }

            const visibleAnswers = sec.answers.filter(isVisibleAnswer);
            const nonHeadingCount = visibleAnswers.filter(a => a.type !== 'heading').length;
            if (nonHeadingCount === 0) return null;

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

                <View style={{ borderWidth: 0.5, borderColor: pdfColors.rule }}>
                  {visibleAnswers.map((answer, ai) => (
                    <AnswerBlock key={ai} answer={answer} index={ai} compact={isCertificate} />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
        <RunningFooter />
      </Page>

      {/* ── DEFECT REGISTER ── */}
      <Page size="A4" style={styles.page} wrap>
        <RunningHeader
          companyName={data.companyName}
          reportNumber={data.reportNumber}
          logoUrl={data.companyLogoUrl}
        />
        <View style={styles.body}>
          <SectionHeaderBar number="D" title="NON-CONFORMANCE / DEFECT REGISTER" />
          <Text style={{ fontSize: 8, color: pdfColors.textMuted, marginBottom: 12, paddingHorizontal: 4 }}>
            Fail-flagged checklist items and measurements outside configured limits. Action notes come from inspector comments.
          </Text>
          <DefectRegister defects={data.defects} />
        </View>
        <RunningFooter />
      </Page>

      {/* ── PHOTO APPENDIX ── */}
      {data.photoAppendix.length > 0 && (
        <Page size="A4" style={styles.page} wrap>
          <RunningHeader
            companyName={data.companyName}
            reportNumber={data.reportNumber}
            logoUrl={data.companyLogoUrl}
          />
          <View style={styles.body}>
            <SectionHeaderBar number="A" title="PHOTO APPENDIX" />
            <Text style={{ fontSize: 8, color: pdfColors.textMuted, marginBottom: 12, paddingHorizontal: 4 }}>
              Evidence photos captured during this inspection.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {data.photoAppendix.map((p, i) => (
                <View key={i} style={{ width: '48%', marginRight: i % 2 === 0 ? '4%' : 0, marginBottom: 14 }}>
                  <PhotoThumb src={p.url} width={230} />
                  <Text style={{ fontFamily: pdfFonts.body, fontSize: 7.5, fontWeight: 700, color: pdfColors.navy, marginTop: 4 }}>
                    {p.questionLabel}
                  </Text>
                  <Text style={{ fontFamily: pdfFonts.body, fontSize: 7, color: pdfColors.textMuted }}>
                    {p.sectionTitle}
                  </Text>
                  {p.caption && p.caption !== p.questionLabel ? (
                    <Text style={{ fontFamily: pdfFonts.body, fontSize: 6.5, color: pdfColors.textSecondary, fontStyle: 'italic', marginTop: 1 }}>
                      {p.caption}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
          <RunningFooter />
        </Page>
      )}

      {/* ── SIGN-OFF PAGE ── */}
      <Page size="A4" style={styles.page}>
        <RunningHeader
          companyName={data.companyName}
          reportNumber={data.reportNumber}
          logoUrl={data.companyLogoUrl}
        />
        <View style={styles.body}>
          <SectionHeaderBar number="S" title="SIGN-OFF & CERTIFICATION" />
          <Text style={{ fontSize: 8.5, color: pdfColors.textSecondary, marginBottom: 16, paddingHorizontal: 4, lineHeight: 1.4 }}>
            The undersigned confirms that the inspection findings in this report are true and correct
            to the best of their knowledge at the date of issue.
          </Text>

          <OverallVerdictStamp verdict={data.overallVerdict} label={data.overallVerdictLabel} />

          {(data.signatures.length > 0 ? data.signatures : [{
            label: 'Inspector',
            signatureUrl: data.signatureUrl,
            name: data.inspectorName,
          }]).map((sig, i) => (
            <View key={i} style={{ marginBottom: 16 }}>
              <SignatureBlock
                roleLabel={sig.label}
                signatureUrl={sig.signatureUrl}
                name={sig.name}
                licenceNumber={data.inspectorLicence}
                date={data.signoffDate}
              />
            </View>
          ))}

          {data.countersignatures.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontFamily: pdfFonts.body, fontSize: 9, fontWeight: 700, color: pdfColors.navy, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Countersignatures
              </Text>
              {data.countersignatures.map((c, i) => (
                <View key={i} style={{ marginBottom: 16 }}>
                  <SignatureBlock
                    roleLabel={c.roleLabel}
                    signatureUrl={c.signatureUrl}
                    name={c.name}
                    date={c.date || data.signoffDate}
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
