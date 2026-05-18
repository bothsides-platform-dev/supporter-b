'use client';

import { Tabs } from '@/components/primitives/Tabs';

export type BidView = 'table' | 'board';

type Props = {
  value: BidView;
  onChange: (v: BidView) => void;
  tableCount?: number;
};

export function BidViewToggle({ value, onChange, tableCount }: Props) {
  return (
    <Tabs
      tabs={[
        { id: 'table', label: '[ 표 ]', count: tableCount },
        { id: 'board', label: '[ 보드 ]' },
      ]}
      active={value}
      onChange={(id) => onChange(id as BidView)}
      className="border-b-0"
    />
  );
}
