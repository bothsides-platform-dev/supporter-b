'use client';

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';
import { cn } from '@/lib/utils';

type DataTableProps<T extends RowData> = {
  columns: ColumnDef<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  className?: string;
};

export function DataTable<T extends RowData>({
  columns,
  data,
  onRowClick,
  className,
}: DataTableProps<T>) {
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-[var(--md-sys-color-outline-variant)]">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 py-2 text-left text-[length:var(--md-typescale-label-medium-size)] font-[number:var(--md-typescale-label-medium-weight)] tracking-[var(--md-typescale-label-medium-tracking)] text-[var(--md-sys-color-on-surface-variant)] font-normal"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row.original)}
              className={cn(
                'border-b border-[var(--md-sys-color-outline-variant)] transition-colors duration-[140ms]',
                onRowClick && 'cursor-pointer hover:bg-[var(--md-sys-color-surface-container-high)]',
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-3 py-3 text-[length:var(--md-typescale-body-medium-size)] text-[var(--md-sys-color-on-surface)]"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="py-12 text-center text-[length:var(--md-typescale-body-medium-size)] text-[var(--md-sys-color-on-surface-variant)]"
              >
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
