import type { Section } from '../../types/template';
import { Star } from 'lucide-react';

export function MobilePreview({ section }: { section: Section | null }) {
  if (!section) {
    return (
      <div className="bg-[#0A2540] rounded-2xl p-2 shadow-xl">
        <div className="bg-[#F9FAFB] rounded-xl p-4 min-h-[500px] flex items-center justify-center">
          <p className="text-xs text-[#4A5568] text-center">Select a section to preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0A2540] rounded-2xl p-2 shadow-xl">
      {/* Phone chrome */}
      <div className="bg-[#1A1A1A] rounded-xl overflow-hidden">
        {/* Status bar */}
        <div className="bg-[#1A1A1A] h-6 flex items-center justify-between px-3">
          <span className="text-[9px] text-white/60">9:41</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-1.5 border border-white/60 rounded-sm">
              <div className="w-2 h-1 bg-white/60 rounded-sm m-px" />
            </div>
          </div>
        </div>
        {/* Content */}
        <div className="bg-[#F9FAFB] overflow-y-auto max-h-[480px]">
          <div className="px-3 pt-3 pb-2 bg-white border-b border-[#E5E7EB]">
            <h2 className="text-sm font-semibold text-[#1A1A1A]">{section.title || 'Section'}</h2>
            {section.description && (
              <p className="text-[10px] text-[#4A5568] mt-0.5">{section.description}</p>
            )}
          </div>
          <div className="p-2 space-y-2">
            {section.questions.map(q => {
              if (q.type === 'heading') {
                return (
                  <div key={q.id} className="pt-1 pb-0.5">
                    <p className="text-[10px] font-semibold text-[#0A2540] uppercase tracking-wide border-b border-[#E5E7EB] pb-1">
                      {q.label || 'Heading'}
                    </p>
                  </div>
                );
              }
              return (
              <div key={q.id} className="bg-white rounded-md p-2.5 border border-[#E5E7EB]">
                <p className="text-[11px] font-medium text-[#1A1A1A]">
                  {q.label || '(Untitled)'}{q.required && <span className="text-red-500 ml-0.5">*</span>}
                </p>
                {q.helpText && <p className="text-[9px] text-[#4A5568] mt-0.5">{q.helpText}</p>}
                <div className="mt-2">
                  {q.type === 'text' && (
                    <div className="h-6 border border-[#E5E7EB] rounded bg-[#F9FAFB]" />
                  )}
                  {q.type === 'long_text' && (
                    <div className="h-10 border border-[#E5E7EB] rounded bg-[#F9FAFB]" />
                  )}
                  {q.type === 'number' && (
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-6 border border-[#E5E7EB] rounded bg-[#F9FAFB]" />
                      {q.numberConfig?.unit && <span className="text-[10px] text-[#4A5568]">{q.numberConfig.unit}</span>}
                    </div>
                  )}
                  {q.type === 'yes_no' && (
                    <div className="flex gap-1.5">
                      <div className="flex-1 h-7 border border-[#1B7F3A]/40 rounded bg-[#1B7F3A]/5 flex items-center justify-center">
                        <span className="text-[10px] font-semibold text-[#1B7F3A]">{q.yesNoLabels === 'pass_fail' ? 'PASS' : 'YES'}</span>
                      </div>
                      <div className="flex-1 h-7 border border-[#E5E7EB] rounded bg-[#F9FAFB] flex items-center justify-center">
                        <span className="text-[10px] font-semibold text-[#4A5568]">{q.yesNoLabels === 'pass_fail' ? 'FAIL' : 'NO'}</span>
                      </div>
                    </div>
                  )}
                  {(q.type === 'multiple_choice' || q.type === 'checkboxes') && (
                    <div className="space-y-1">
                      {(q.options ?? []).slice(0, 3).map((opt, i) => (
                        <div key={i} className="h-5 border border-[#E5E7EB] rounded bg-[#F9FAFB] px-2 flex items-center">
                          <span className="text-[9px] text-[#4A5568]">{opt}</span>
                        </div>
                      ))}
                      {(q.options?.length ?? 0) > 3 && (
                        <span className="text-[9px] text-[#4A5568]">+{(q.options?.length ?? 0) - 3} more</span>
                      )}
                    </div>
                  )}
                  {q.type === 'date' && (
                    <div className="h-6 border border-[#E5E7EB] rounded bg-[#F9FAFB] px-2 flex items-center">
                      <span className="text-[9px] text-[#4A5568]">dd/mm/yyyy</span>
                    </div>
                  )}
                  {q.type === 'photo' && (
                    <div className="h-8 border-2 border-dashed border-[#E5E7EB] rounded bg-[#F9FAFB] flex items-center justify-center">
                      <span className="text-[9px] text-[#4A5568]">Tap to capture</span>
                    </div>
                  )}
                  {q.type === 'signature' && (
                    <div className="h-12 border border-[#E5E7EB] rounded bg-[#F9FAFB] flex items-center justify-center">
                      <span className="text-[9px] text-[#4A5568]">Sign here</span>
                    </div>
                  )}
                  {q.type === 'rating_5' && (
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} size={14} className="text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                  )}
                  {q.type === 'slider' && (
                    <div className="h-4 relative flex items-center">
                      <div className="w-full h-1 bg-[#E5E7EB] rounded-full" />
                      <div className="absolute left-1/2 w-3 h-3 bg-[#2E75B6] rounded-full -translate-x-1/2 shadow-sm" />
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
