import { Section } from '../../types/template';
import { GripVertical, Trash2, RefreshCw } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  sections: Section[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (sections: Section[]) => void;
}

function SortableItem({ section, isSelected, onSelect, onDelete }: {
  section: Section;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 px-2 py-2 cursor-pointer group transition-colors ${isSelected ? 'bg-[#0A2540]/5' : 'hover:bg-[#F9FAFB]'}`}
      onClick={onSelect}
    >
      <div {...attributes} {...listeners} className="text-[#E5E7EB] hover:text-[#4A5568] cursor-grab active:cursor-grabbing">
        <GripVertical size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs truncate ${isSelected ? 'font-medium text-[#0A2540]' : 'text-[#1A1A1A]'}`}>
          {section.title || 'Untitled'}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-[#4A5568]">{section.questions.length}q</span>
          {section.isRepeating && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-[#2E75B6] bg-[#2E75B6]/10 px-1 rounded">
              <RefreshCw size={8} /> Rep
            </span>
          )}
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 text-[#4A5568] hover:text-[#B42318] p-0.5 rounded"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

export function SectionPanel({ sections, selectedId, onSelect, onDelete, onReorder }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = sections.findIndex(s => s.id === active.id);
      const newIdx = sections.findIndex(s => s.id === over.id);
      onReorder(arrayMove(sections, oldIdx, newIdx));
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
        <div className="divide-y divide-[#F9FAFB]">
          {sections.map(section => (
            <SortableItem
              key={section.id}
              section={section}
              isSelected={selectedId === section.id}
              onSelect={() => onSelect(section.id)}
              onDelete={() => onDelete(section.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
