import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { ElectricalReportData, ElectricalAnswer } from './types';
import {
  RunningHeader, RunningFooter, SectionHeaderBar,
  VerdictPill, MetadataGrid, PhotoThumb, SignatureBlock,
  CoverLetterhead, OverallVerdictStamp, DefectRegister,
} from '../shared/components';
import { TestScheduleTable } from '../shared/TestScheduleTable';
import { pdfColors, pdfFonts } from '../shared/styles';
import { formatMeasured } from '../shared/inspectionCompose';
import { isNaAnswer } from '../../types/template';

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
  if (isNaAnswer(value)) return 'N/A';
  if (type === 'signature' || type === 'photo') return '';
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

function AnswerRow({ answer, index }: { answer: ElectricalAnswer; index: number }) {
  const displayVal = renderAnswerValue(answer);
  const bg = index % 2 !== 0 ? pdfColors.zebra : pdfColors.white;

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
    return (
      <View style={[s.questionRow, { backgroundColor: bg, alignItems: 'center' }]}>
        <Text style={s.questionLabel}>{answer.label}</Text>
        <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, color: pdfColors.accent, flex: 1 }}>
          See sign-off page
        </Text>
      </View>
    );
  }

  if (answer.type === 'yes_no') {
    return (
      <View>
        <View style={[s.questionRow, { backgroundColor: bg, alignItems: 'center' }]}>
          <Text style={s.questionLabel}>{answer.label}</Text>
          <View style={{ flex: 1 }}>
            <VerdictPill verdict={displayVal || 'N/A'} />
          </View>
        </View>
        {answer.comment ? <Text style={s.comment}>Note: {answer.comment}</Text> : null}
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

  if (answer.type === 'photo') {
    return (
      <View>
        <View style={[s.questionRow, { backgroundColor: bg }]}>
          <Text style={s.questionLabel}>{answer.label}</Text>
          <Text style={s.questionValue}>
            {answer.photos?.length ? `${answer.photos.length} photo(s) — see appendix` : '—'}
          </Text>
        </View>
        {answer.comment ? <Text style={s.comment}>Note: {answer.comment}</Text> : null}
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
        <View style={[s.questionRow, { backgroundColor: bg, alignItems: 'center' }]}>
          <Text style={s.questionLabel}>{answer.label}</Text>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={s.questionValue}>{displayVal || '\u2014'}</Text>
            <View style={{ marginLeft: 8 }}><VerdictPill verdict={pill} /></View>
          </View>
        </View>
        {answer.comment ? <Text style={s.comment}>Note: {answer.comment}</Text> : null}
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

  return (
    <View>
      <View style={[s.questionRow, { backgroundColor: bg }]}>
        <Text style={s.questionLabel}>{answer.label}</Text>
        <Text style={displayVal ? s.questionValue : s.noAnswer}>
          {displayVal || '\u2014'}
        </Text>
      </View>
      {answer.comment ? <Text style={s.comment}>Note: {answer.comment}</Text> : null}
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

function isVisibleAnswer(a: ElectricalAnswer): boolean {
  if (a.type === 'heading' || a.type === 'signature') return true;
  if (a.required) return true;
  if (a.comment) return true;
  if (a.photos && a.photos.length > 0) return true;
  const v = a.value;
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

export function ElectricalReport({ data }: { data: ElectricalReportData }) {
  const { meta, company } = data;

  const coverMeta = [
    { label: 'Report Number', value: meta.reportNumber },
    { label: 'Issue Date', value: meta.issueDate },
    { label: 'Document version', value: `v${data.docVersion}` },
    ...(data.amendmentReason ? [{ label: 'Amendment', value: data.amendmentReason }] : []),
    { label: 'Site', value: meta.site },
    { label: 'Address', value: meta.siteAddress },
    { label: 'Client', value: meta.client },
    ...(meta.jobNumber ? [{ label: 'Job / Reference', value: meta.jobNumber }] : []),
    ...data.customFields.map(f => ({ label: f.label, value: f.value })),
    { label: 'Inspector', value: meta.inspector },
    { label: 'Licence No', value: meta.licenceNumber },
    { label: 'Date of Test', value: meta.dateOfTest },
  ].filter(item => item.value);

  const contactParts = [
    company.abn ? `ABN ${company.abn}` : null,
    company.licenceNumber ? `Licence ${company.licenceNumber}` : null,
    company.phone,
    company.email,
    company.website,
  ].filter(Boolean).join('  \u00B7  ');

  const docTitle = `${(meta.site || 'Site').replace(/[<>:"/\\|?*]/g, '_')} - ${meta.reportNumber}`;

  return (
    <Document title={docTitle}>
      <Page size="A4" style={s.coverPage}>
        <CoverLetterhead
          companyName={company.name}
          logoUrl={company.logoUrl}
          contactLine={contactParts || undefined}
        />

        <View style={{ paddingHorizontal: 40, paddingTop: 20, flex: 1 }}>
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 7.5, color: pdfColors.accent, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
            AS/NZS 3000:2018 — SECTION 8 VERIFICATION
          </Text>
          <Text style={{ fontFamily: pdfFonts.body, fontSize: 26, fontWeight: 700, color: pdfColors.navy, marginBottom: 16, lineHeight: 1.2 }}>
            Electrical Verification{'\n'}Report
          </Text>

          <OverallVerdictStamp verdict={data.overallVerdict} label={data.overallVerdictLabel} />

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

      <Page size="A4" style={s.page} wrap>
        <RunningHeader companyName={company.name} reportNumber={meta.reportNumber} logoUrl={company.logoUrl} />
        <View style={s.body}>
          {data.sections.map((sec, si) => {
            if (sec.isRepeating && sec.instances) {
              if (sec.instances.length === 0) return null;
              // AS/NZS-style verification: always schedule table for repeating blocks
              if (data.layoutMode !== 'checklist') {
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
                    <View key={inst.instanceId} style={{ marginBottom: ii < sec.instances!.length - 1 ? 10 : 0 }}>
                      <View style={s.instanceHeader}>
                        <Text style={{ fontFamily: pdfFonts.body, fontSize: 8, fontWeight: 700, color: pdfColors.navy, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {inst.label}
                        </Text>
                      </View>
                      <View style={{ borderWidth: 0.5, borderTopWidth: 0, borderColor: pdfColors.rule }}>
                        {inst.answers.filter(isVisibleAnswer).map((answer, ai) => (
                          <AnswerRow key={ai} answer={answer} index={ai} />
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

      <Page size="A4" style={s.page} wrap>
        <RunningHeader companyName={company.name} reportNumber={meta.reportNumber} logoUrl={company.logoUrl} />
        <View style={s.body}>
          <SectionHeaderBar number="D" title="NON-CONFORMANCE / DEFECT REGISTER" />
          <Text style={{ fontSize: 8, color: pdfColors.textMuted, marginBottom: 12, paddingHorizontal: 4 }}>
            Fail-flagged verification items and measurements outside allowable limits.
          </Text>
          <DefectRegister defects={data.defects} />
        </View>
        <RunningFooter />
      </Page>

      {data.photoAppendix.length > 0 && (
        <Page size="A4" style={s.page} wrap>
          <RunningHeader companyName={company.name} reportNumber={meta.reportNumber} logoUrl={company.logoUrl} />
          <View style={s.body}>
            <SectionHeaderBar number="A" title="PHOTO APPENDIX" />
            <Text style={{ fontSize: 8, color: pdfColors.textMuted, marginBottom: 12, paddingHorizontal: 4 }}>
              Evidence photos captured during this verification.
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
                </View>
              ))}
            </View>
          </View>
          <RunningFooter />
        </Page>
      )}

      <Page size="A4" style={s.page}>
        <RunningHeader companyName={company.name} reportNumber={meta.reportNumber} logoUrl={company.logoUrl} />
        <View style={s.body}>
          <SectionHeaderBar number="S" title="SIGN-OFF & CERTIFICATION" />
          <Text style={{ fontSize: 8.5, color: pdfColors.textSecondary, marginBottom: 16, paddingHorizontal: 4, lineHeight: 1.4 }}>
            The undersigned confirms that the electrical verification findings in this report are true
            and correct to the best of their knowledge at the date of test.
          </Text>

          <OverallVerdictStamp verdict={data.overallVerdict} label={data.overallVerdictLabel} />

          {(data.signatures.length > 0
            ? data.signatures
            : [{ label: 'Licensed electrician / inspector', signatureUrl: undefined, name: meta.inspector }]
          ).map((sig, i) => (
            <View key={i} style={{ marginBottom: 16 }}>
              <SignatureBlock
                roleLabel={sig.label}
                signatureUrl={sig.signatureUrl}
                name={sig.name}
                licenceNumber={meta.licenceNumber || company.licenceNumber}
                date={meta.dateOfTest}
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
                    date={c.date || meta.dateOfTest}
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
