import type { Condition, ShowIf } from '../../types/template';
import { isConditionGroup, normalizeShowIf } from '../../lib/conditionEval';
import { Plus, X } from 'lucide-react';

type QuestionOption = { id: string; label: string; sectionTitle: string };

interface Props {
  value: ShowIf | undefined;
  questions: QuestionOption[];
  onChange: (next: ShowIf | undefined) => void;
  label?: string;
}

function emptyCondition(questions: QuestionOption[]): Condition {
  return {
    questionId: questions[0]?.id ?? '',
    operator: 'equals',
    value: '',
  };
}

export function ShowIfEditor({ value, questions, onChange, label = 'Show only if…' }: Props) {
  if (questions.length === 0) {
    return (
      <p className="text-xs text-[#9CA3AF]">Add other questions first to use conditional logic.</p>
    );
  }

  const normalized = normalizeShowIf(value);
  const group = normalized
    ? isConditionGroup(normalized)
      ? normalized
      : { logic: 'and' as const, conditions: [normalized] }
    : null;

  function setConditions(logic: 'and' | 'or', conditions: Condition[]) {
    if (conditions.length === 0) {
      onChange(undefined);
      return;
    }
    onChange(normalizeShowIf({ logic, conditions }));
  }

  if (!group) {
    return (
      <div>
        <label className="block text-xs font-medium text-[#4A5568] mb-1">{label}</label>
        <button
          type="button"
          onClick={() => onChange(emptyCondition(questions))}
          className="text-xs text-[#2E75B6] hover:underline"
        >
          + Add condition
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="text-xs font-medium text-[#4A5568]">{label}</label>
        <div className="flex items-center gap-1">
          {(['and', 'or'] as const).map(logic => (
            <button
              key={logic}
              type="button"
              onClick={() => setConditions(logic, group.conditions)}
              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${
                group.logic === logic
                  ? 'bg-[#0A2540] text-white border-[#0A2540]'
                  : 'bg-white text-[#6B7280] border-[#E5E7EB]'
              }`}
            >
              {logic === 'and' ? 'Match all' : 'Match any'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {group.conditions.map((cond, i) => (
          <div key={i} className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-1.5 p-2 rounded border border-[#E5E7EB] bg-white">
            {i > 0 && (
              <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase w-full mb-0.5">
                {group.logic}
              </span>
            )}
            <select
              value={cond.questionId}
              onChange={e => {
                const next = [...group.conditions];
                next[i] = { ...cond, questionId: e.target.value };
                setConditions(group.logic, next);
              }}
              className="text-xs min-h-[44px] h-auto border border-[#E5E7EB] rounded px-2 py-2 bg-white focus:outline-none w-full min-w-0 sm:flex-1 sm:min-w-[140px]"
            >
              {questions.map(q => (
                <option key={q.id} value={q.id}>{q.sectionTitle} → {q.label || '(unlabelled)'}</option>
              ))}
            </select>
            <select
              value={cond.operator}
              onChange={e => {
                const next = [...group.conditions];
                next[i] = { ...cond, operator: e.target.value as Condition['operator'] };
                setConditions(group.logic, next);
              }}
              className="text-xs min-h-[44px] h-auto border border-[#E5E7EB] rounded px-2 py-2 bg-white focus:outline-none w-full min-w-0 sm:w-auto"
            >
              <option value="equals">equals</option>
              <option value="not_equals">not equals</option>
              <option value="is_empty">is empty</option>
              <option value="is_not_empty">is not empty</option>
            </select>
            {(cond.operator === 'equals' || cond.operator === 'not_equals') && (
              <input
                value={String(cond.value ?? '')}
                onChange={e => {
                  const next = [...group.conditions];
                  next[i] = { ...cond, value: e.target.value };
                  setConditions(group.logic, next);
                }}
                className="text-xs min-h-[44px] h-auto border border-[#E5E7EB] rounded px-2 py-2 bg-white focus:outline-none w-full min-w-0 sm:flex-1"
                placeholder="value"
              />
            )}
            <button
              type="button"
              onClick={() => setConditions(group.logic, group.conditions.filter((_, j) => j !== i))}
              className="text-[#4A5568] hover:text-[#B42318] p-0.5"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mt-2">
        <button
          type="button"
          onClick={() => setConditions(group.logic, [...group.conditions, emptyCondition(questions)])}
          className="flex items-center gap-1 text-xs text-[#2E75B6] hover:underline"
        >
          <Plus size={12} /> Add condition
        </button>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-xs text-[#9CA3AF] hover:text-[#B42318]"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
