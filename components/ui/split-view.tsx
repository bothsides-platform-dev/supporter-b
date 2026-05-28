import React from 'react';

interface SplitViewProps {
  list: React.ReactNode;
  panel?: React.ReactNode;
}

export function SplitView({ list, panel }: SplitViewProps) {
  if (!panel) return <>{list}</>;
  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex w-60 shrink-0 flex-col overflow-x-auto border-r border-[var(--md-sys-color-outline-variant)]">
        {list}
      </div>
      <div className="flex-1 overflow-y-auto">
        {panel}
      </div>
    </div>
  );
}
