import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';

interface DroppableTableRowProps {
  dateKey: string;
  className?: string;
  children: ReactNode;
}

export function DroppableTableRow({ dateKey, className, children }: DroppableTableRowProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  const rowClassName = [className, isOver && 'meal-plan-row-drop-target'].filter(Boolean).join(' ');

  return (
    <tr ref={setNodeRef} className={rowClassName}>
      {children}
    </tr>
  );
}
