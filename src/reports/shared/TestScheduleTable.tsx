import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { pdfColors, pdfFonts, type PdfColors } from './styles';
import { VerdictPill } from './components';
import { formatMeasured, type ComposedAnswer, type ComposedInstance } from './inspectionCompose';
import { isNaAnswer } from '../../types/template';

function cellValue(answer: ComposedAnswer): string {
  if (answer.value === null || answer.value === undefined || answer.value === '') return '—';
  if (isNaAnswer(answer.value)) return 'N/A';
  if (answer.type === 'yes_no') {
    const raw = String(answer.value).toLowerCase();
    if (answer.yesNoLabels === 'pass_fail') {
      if (raw === 'yes') return 'PASS';
      if (raw === 'no') return 'FAIL';
      return 'N/A';
    }
    return String(answer.value).toUpperCase();
  }
  if (answer.type === 'number' || answer.type === 'slider') {
    return formatMeasured(answer.value, answer.numberConfig);
  }
  if (Array.isArray(answer.value)) return answer.value.join(', ');
  return String(answer.value);
}

/** Compact multi-column schedule for repeating test / verification blocks. */
export function TestScheduleTable({
  title,
  sectionNumber,
  instances,
  colors = pdfColors,
}: {
  title: string;
  sectionNumber: string;
  instances: ComposedInstance[];
  colors?: PdfColors;
}) {
  if (instances.length === 0) return null;

  // Column model from first instance questions (skip heading/signature/photo/long_text)
  const columns = (instances[0]?.answers ?? []).filter(a =>
    !['heading', 'signature', 'photo', 'long_text'].includes(a.type),
  );

  if (columns.length === 0) return null;

  // Cap columns for A4 readability
  const cols = columns.slice(0, 6);
  const colWidth = `${Math.floor(100 / (cols.length + 1))}%`;

  const s = StyleSheet.create({
    wrap: { marginBottom: 14 },
    header: {
      backgroundColor: colors.navy,
      paddingHorizontal: 8,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerNum: {
      fontFamily: pdfFonts.mono,
      fontSize: 8,
      color: colors.accentLight,
      marginRight: 8,
    },
    headerTitle: {
      fontFamily: pdfFonts.body,
      fontSize: 9,
      fontWeight: 700,
      color: '#FFFFFF',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    table: {
      borderWidth: 0.5,
      borderColor: colors.rule,
      borderTopWidth: 0,
    },
    row: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderBottomColor: colors.rule,
    },
    th: {
      width: colWidth,
      paddingVertical: 4,
      paddingHorizontal: 4,
      backgroundColor: colors.zebra,
      fontFamily: pdfFonts.body,
      fontSize: 6.5,
      fontWeight: 700,
      color: colors.navy,
      textTransform: 'uppercase',
    },
    td: {
      width: colWidth,
      paddingVertical: 4,
      paddingHorizontal: 4,
      fontFamily: pdfFonts.body,
      fontSize: 7.5,
      color: colors.text,
    },
    tdMono: {
      width: colWidth,
      paddingVertical: 4,
      paddingHorizontal: 4,
      fontFamily: pdfFonts.mono,
      fontSize: 7.5,
      color: colors.text,
    },
  });

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.headerNum}>{sectionNumber}</Text>
        <Text style={s.headerTitle}>{title}</Text>
      </View>
      <View style={s.table}>
        <View style={s.row} wrap={false}>
          <Text style={s.th}>Ref</Text>
          {cols.map(c => (
            <Text key={c.questionId ?? c.label} style={s.th}>
              {c.label.length > 22 ? `${c.label.slice(0, 20)}…` : c.label}
            </Text>
          ))}
        </View>
        {instances.map((inst, ri) => (
          <View
            key={inst.instanceId}
            style={[s.row, { backgroundColor: ri % 2 ? colors.zebra : colors.white }]}
            wrap={false}
          >
            <Text style={s.td}>{inst.label}</Text>
            {cols.map(col => {
              const answer = inst.answers.find(a => a.questionId === col.questionId) ?? col;
              const display = cellValue(answer);
              if (answer.type === 'yes_no' || answer.numericStatus === 'pass' || answer.numericStatus === 'fail') {
                const pill =
                  answer.type === 'yes_no'
                    ? display
                    : answer.numericStatus === 'pass'
                      ? 'PASS'
                      : answer.numericStatus === 'fail'
                        ? 'FAIL'
                        : display;
                return (
                  <View key={col.questionId ?? col.label} style={{ width: colWidth, paddingVertical: 3, paddingHorizontal: 4, justifyContent: 'center' }}>
                    {(pill === 'PASS' || pill === 'FAIL' || pill === 'YES' || pill === 'NO' || pill === 'N/A') ? (
                      <VerdictPill verdict={pill} />
                    ) : (
                      <Text style={{ fontFamily: pdfFonts.mono, fontSize: 7.5 }}>{display}</Text>
                    )}
                  </View>
                );
              }
              return (
                <Text
                  key={col.questionId ?? col.label}
                  style={answer.type === 'number' || answer.type === 'slider' ? s.tdMono : s.td}
                >
                  {display}
                </Text>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
