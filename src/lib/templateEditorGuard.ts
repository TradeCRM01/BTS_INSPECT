export function templateQuestionDeleteCopy(label?: string): {
  title: string;
  message: string;
  confirmLabel: string;
} {
  const named = (label ?? '').trim();
  return {
    title: 'Delete this question?',
    message: named
      ? `Delete “${named}”? Cancel keeps it on the template.`
      : 'Delete this question? Cancel keeps it on the template.',
    confirmLabel: 'Delete',
  };
}
