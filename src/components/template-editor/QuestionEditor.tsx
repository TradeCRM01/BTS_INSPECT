import { useState } from 'react';
import type { Question, QuestionType } from '../../types/template';
import {
  ChevronDown, ChevronUp, Trash2, Plus, X, GripVertical, Pencil,
  Type, AlignLeft, Hash, CheckSquare, List, ToggleLeft, Calendar, Camera, PenLine, Star, Sliders, MessageSquare, Heading2
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { QuestionTypePicker } from './QuestionTypePicker';
import { ShowIfEditor } from './ShowIfEditor';
import { isConditionGroup } from '../../lib/conditionEval';

const TYPE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  text: Type, long_text: AlignLeft, number: Hash, checkboxes: CheckSquare,
  multiple_choice: List, yes_no: ToggleLeft, date: Calendar, photo: Camera,
  signature: PenLine, rating_5: Star, slider: Sliders, heading: Heading2
};

const TYPE_LABELS: Record<string, string> = {
  text: 'Text', long_text: 'Long Text', number: 'Number', checkboxes: 'Checkboxes',
  multiple_choice: 'Multiple Choice', yes_no: 'Yes / No', date: 'Date', photo: 'Photo',
  signature: 'Signature', rating_5: 'Rating', slider: 'Slider', heading: 'Heading'
};

const NA_CAPABLE = new Set(['text', 'long_text', 'number', 'multiple_choice', 'date', 'rating_5', 'slider']);

interface Props {
  question: Question;
  index: number;
  allQuestions: (Question & { sectionTitle: string })[];
  onChange: (updates: Partial<Question>) => void;
  onDelete: () => void;
}

export function QuestionEditor({ question, index, allQuestions, onChange, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const Icon = TYPE_ICONS[question.type] ?? Type;

  function changeType(newType: QuestionType) {
    const updates: Partial<Question> = { type: newType };
    if (newType !== 'multiple_choice' && newType !== 'checkboxes') updates.options = undefined;
    if (newType !== 'number' && newType !== 'slider') updates.numberConfig = undefined;
    if (newType !== 'yes_no') { updates.yesNoLabels = undefined; updates.failOnNo = undefined; }
    if (!NA_CAPABLE.has(newType)) updates.allowNa = undefined;
    onChange(updates);
    setShowTypePicker(false);
  }
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  function addOption() {
    onChange({ options: [...(question.options ?? []), `Option ${(question.options?.length ?? 0) + 1}`] });
  }

  function updateOption(idx: number, val: string) {
    const opts = [...(question.options ?? [])];
    opts[idx] = val;
    onChange({ options: opts });
  }

  function removeOption(idx: number) {
    onChange({ options: (question.options ?? []).filter((_, i) => i !== idx) });
  }

  const otherQuestions = allQuestions.filter(q => q.id !== question.id);
  const hasShowIf = !!question.showIf && (
    isConditionGroup(question.showIf) ? question.showIf.conditions.length > 0 : true
  );

  if (question.type === 'heading') {
    return (
      <div ref={setNodeRef} style={style} className="border-b border-[#E5E7EB] last:border-0 bg-[#F9FAFB]">
        <div className="flex items-center gap-2 px-4 py-2.5 group">
          <div
            {...attributes}
            {...listeners}
            className="text-[#D1D5DB] hover:text-[#4A5568] cursor-grab active:cursor-grabbing shrink-0"
          >
            <GripVertical size={14} />
          </div>
          <Heading2 size={13} className="text-[#0A2540] shrink-0" />
          <input
            value={question.label}
            onChange={e => onChange({ label: e.target.value })}
            className="flex-1 text-sm font-semibold text-[#0A2540] border-none outline-none bg-transparent"
            placeholder="Heading text..."
          />
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 text-[#4A5568] hover:text-[#B42318] p-0.5 rounded shrink-0"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="border-b border-[#E5E7EB] last:border-0">
      <div
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-[#F9FAFB] group"
        onClick={() => setExpanded(!expanded)}
      >
        <div
          {...attributes}
          {...listeners}
          onClick={e => e.stopPropagation()}
          className="text-[#D1D5DB] hover:text-[#4A5568] cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical size={14} />
        </div>
        <div className="w-5 h-5 rounded bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center shrink-0">
          <Icon size={11} className="text-[#4A5568]" />
        </div>
        <span className="text-xs font-medium text-[#4A5568] shrink-0 font-mono">{index + 1}</span>
        <input
          value={question.label}
          onChange={e => { e.stopPropagation(); onChange({ label: e.target.value }); }}
          onClick={e => e.stopPropagation()}
          className="flex-1 text-sm text-[#1A1A1A] border-none outline-none bg-transparent"
          placeholder="Question label..."
        />
        <div className="flex items-center gap-1 shrink-0">
          {question.required && <span className="text-[10px] text-red-500 font-medium">REQ</span>}
          {hasShowIf && <span className="text-[10px] text-[#2E75B6] font-medium">COND</span>}
          {question.allowNa && <span className="text-[10px] text-[#6B7280] font-medium">N/A</span>}
          {question.allowPhotos && question.type !== 'photo' && <Camera size={10} className="text-[#4A5568]" />}
          {question.allowComments && <MessageSquare size={10} className="text-[#4A5568]" />}
          <span className="text-[10px] text-[#4A5568]">{TYPE_LABELS[question.type]}</span>
          <button
            onClick={e => { e.stopPropagation(); setShowTypePicker(true); }}
            className="opacity-0 group-hover:opacity-100 text-[#4A5568] hover:text-[#2E75B6] p-0.5 rounded"
            title="Change question type"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 text-[#4A5568] hover:text-[#B42318] p-0.5 rounded"
          >
            <Trash2 size={12} />
          </button>
          {expanded ? <ChevronUp size={13} className="text-[#4A5568]" /> : <ChevronDown size={13} className="text-[#4A5568]" />}
        </div>
      </div>

      {showTypePicker && (
        <QuestionTypePicker
          title="Change Question Type"
          onSelect={changeType}
          onClose={() => setShowTypePicker(false)}
        />
      )}

      {expanded && (
        <div className="px-4 pb-3 space-y-3 bg-[#FAFAFA]">
          <div>
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Help text (optional)</label>
            <input
              value={question.helpText ?? ''}
              onChange={e => onChange({ helpText: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-[#E5E7EB] rounded text-xs text-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#2E75B6] bg-white"
              placeholder="Additional context shown below the label..."
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <div
              className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${question.required ? 'bg-[#2E75B6]' : 'bg-[#E5E7EB]'}`}
              onClick={() => onChange({ required: !question.required })}
            >
              <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${question.required ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs text-[#1A1A1A]">Required</span>
          </label>

          {question.type !== 'photo' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${question.allowPhotos ? 'bg-[#2E75B6]' : 'bg-[#E5E7EB]'}`}
                onClick={() => onChange({ allowPhotos: !question.allowPhotos })}
              >
                <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${question.allowPhotos ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs text-[#1A1A1A]">Allow photo attachments</span>
            </label>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <div
              className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${question.allowComments ? 'bg-[#2E75B6]' : 'bg-[#E5E7EB]'}`}
              onClick={() => onChange({ allowComments: !question.allowComments })}
            >
              <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${question.allowComments ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs text-[#1A1A1A]">Allow additional comments</span>
          </label>

          {NA_CAPABLE.has(question.type) && (
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${question.allowNa ? 'bg-[#2E75B6]' : 'bg-[#E5E7EB]'}`}
                onClick={() => onChange({ allowNa: !question.allowNa })}
              >
                <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${question.allowNa ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs text-[#1A1A1A]">Allow N/A</span>
            </label>
          )}

          {(question.type === 'multiple_choice' || question.type === 'checkboxes') && (
            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1.5">Options</label>
              <div className="space-y-1.5">
                {(question.options ?? []).map((opt, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      value={opt}
                      onChange={e => updateOption(i, e.target.value)}
                      className="flex-1 px-2.5 py-1.5 border border-[#E5E7EB] rounded text-xs text-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#2E75B6] bg-white"
                    />
                    <button onClick={() => removeOption(i)} className="text-[#4A5568] hover:text-[#B42318]">
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button onClick={addOption} className="flex items-center gap-1 text-xs text-[#2E75B6] hover:text-[#0A2540]">
                  <Plus size={12} /> Add option
                </button>
              </div>
            </div>
          )}

          {(question.type === 'number' || question.type === 'slider') && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[#4A5568] mb-1">Unit</label>
                  <input
                    value={question.numberConfig?.unit ?? ''}
                    onChange={e => onChange({ numberConfig: { ...question.numberConfig, unit: e.target.value } })}
                    className="w-full px-2.5 py-1.5 border border-[#E5E7EB] rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#2E75B6]"
                    placeholder={question.type === 'slider' ? '%' : 'e.g. Ω'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A5568] mb-1">Min</label>
                  <input
                    type="number"
                    value={question.numberConfig?.min ?? ''}
                    onChange={e => onChange({ numberConfig: { ...question.numberConfig, min: e.target.value !== '' ? Number(e.target.value) : undefined } })}
                    className="w-full px-2.5 py-1.5 border border-[#E5E7EB] rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#2E75B6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A5568] mb-1">Max</label>
                  <input
                    type="number"
                    value={question.numberConfig?.max ?? ''}
                    onChange={e => onChange({ numberConfig: { ...question.numberConfig, max: e.target.value !== '' ? Number(e.target.value) : undefined } })}
                    className="w-full px-2.5 py-1.5 border border-[#E5E7EB] rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#2E75B6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A5568] mb-1">Decimals</label>
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={question.numberConfig?.decimals ?? ''}
                    onChange={e => onChange({ numberConfig: { ...question.numberConfig, decimals: e.target.value !== '' ? Number(e.target.value) : undefined } })}
                    className="w-full px-2.5 py-1.5 border border-[#E5E7EB] rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#2E75B6]"
                    placeholder="auto"
                  />
                </div>
              </div>
              {question.type === 'number' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${question.numberConfig?.failOutsideRange ? 'bg-[#B42318]' : 'bg-[#E5E7EB]'}`}
                    onClick={() => onChange({
                      numberConfig: {
                        ...question.numberConfig,
                        failOutsideRange: !question.numberConfig?.failOutsideRange,
                      },
                    })}
                  >
                    <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${question.numberConfig?.failOutsideRange ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-xs text-[#1A1A1A]">Auto FAIL if outside min/max (PDF + defect register)</span>
                </label>
              )}
            </div>
          )}

          {question.type === 'yes_no' && (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-[#4A5568] mb-1.5">Button labels</label>
                <div className="flex gap-2">
                  {(['yes_no', 'pass_fail'] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => onChange({ yesNoLabels: opt })}
                      className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${
                        (question.yesNoLabels ?? 'yes_no') === opt
                          ? 'border-[#0A2540] bg-[#0A2540] text-white'
                          : 'border-[#E5E7EB] text-[#4A5568] hover:border-[#0A2540]/40 bg-white'
                      }`}
                    >
                      {opt === 'yes_no' ? 'Yes / No' : 'Pass / Fail'}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${question.failOnNo ? 'bg-[#B42318]' : 'bg-[#E5E7EB]'}`}
                  onClick={() => onChange({ failOnNo: !question.failOnNo })}
                >
                  <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${question.failOnNo ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-xs text-[#1A1A1A]">
                  Flag as FAIL if answered {(question.yesNoLabels ?? 'yes_no') === 'pass_fail' ? 'Fail' : 'No'}
                </span>
              </label>
            </div>
          )}

          <ShowIfEditor
            value={question.showIf}
            questions={otherQuestions.map(q => ({ id: q.id, label: q.label, sectionTitle: q.sectionTitle }))}
            onChange={showIf => onChange({ showIf })}
          />
        </div>
      )}
    </div>
  );
}
