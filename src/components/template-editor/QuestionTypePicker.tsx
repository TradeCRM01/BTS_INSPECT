import type { QuestionType } from '../../types/template';
import { X, Type, AlignLeft, Hash, CheckSquare, List, ToggleLeft, Calendar, Camera, PenLine, Star, Sliders, Heading2 } from 'lucide-react';

const TYPES: { type: QuestionType; icon: React.FC<{ size?: number; className?: string }>; label: string; desc: string; separator?: boolean }[] = [
  { type: 'heading', icon: Heading2, label: 'Heading', desc: 'Visual divider with title text' },
  { type: 'text', icon: Type, label: 'Text', desc: 'Single-line text answer' },
  { type: 'long_text', icon: AlignLeft, label: 'Long Text', desc: 'Multi-line text / notes' },
  { type: 'number', icon: Hash, label: 'Number', desc: 'Numeric with optional unit' },
  { type: 'yes_no', icon: ToggleLeft, label: 'Yes / No', desc: 'Binary pass/fail answer' },
  { type: 'multiple_choice', icon: List, label: 'Multiple Choice', desc: 'Pick one from a list' },
  { type: 'checkboxes', icon: CheckSquare, label: 'Checkboxes', desc: 'Select multiple options' },
  { type: 'date', icon: Calendar, label: 'Date', desc: 'Date picker' },
  { type: 'photo', icon: Camera, label: 'Photo', desc: 'Capture one or more images' },
  { type: 'signature', icon: PenLine, label: 'Signature', desc: 'Draw and capture signature' },
  { type: 'rating_5', icon: Star, label: 'Rating', desc: 'Five-star rating scale' },
  { type: 'slider', icon: Sliders, label: 'Slider', desc: 'Numeric range slider' },
];

export function QuestionTypePicker({ onSelect, onClose, title = 'Add Question' }: {
  onSelect: (type: QuestionType) => void;
  onClose: () => void;
  title?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-start justify-center p-4 pt-[8vh] overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] md:max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB] sticky top-0 bg-white">
          <h3 className="font-semibold text-[#1A1A1A]">{title}</h3>
          <button onClick={onClose} className="text-[#4A5568] hover:text-[#1A1A1A] p-1 rounded min-w-10 min-h-10 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          {/* Heading type — full-width */}
          <div>
            {(() => {
              const { type, icon: Icon, label, desc } = TYPES[0];
              return (
                <button
                  key={type}
                  onClick={() => onSelect(type)}
                  className="w-full flex items-center gap-3 p-3 rounded-md border border-[#E5E7EB] hover:border-[#0A2540] hover:bg-[#F9FAFB] text-left transition-colors group"
                >
                  <div className="w-8 h-8 rounded bg-[#F9FAFB] group-hover:bg-[#0A2540]/10 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-[#0A2540]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A]">{label}</p>
                    <p className="text-xs text-[#4A5568] mt-0.5">{desc}</p>
                  </div>
                </button>
              );
            })()}
          </div>
          {/* Question types — 2-column grid */}
          <div className="grid grid-cols-2 gap-2">
            {TYPES.slice(1).map(({ type, icon: Icon, label, desc }) => (
              <button
                key={type}
                onClick={() => onSelect(type)}
                className="flex items-start gap-3 p-3 rounded-md border border-[#E5E7EB] hover:border-[#2E75B6] hover:bg-[#F0F7FF] text-left transition-colors group"
              >
                <div className="w-8 h-8 rounded bg-[#F9FAFB] group-hover:bg-[#2E75B6]/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={16} className="text-[#4A5568] group-hover:text-[#2E75B6]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1A1A1A]">{label}</p>
                  <p className="text-xs text-[#4A5568] mt-0.5">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
