import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type RowSelectionState, type SortingState, type VisibilityState } from "@tanstack/react-table";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "./ui";

export function DataTable<T extends { id: string }>({ data, columns, title, subtitle, selectable = false, onSelectionChange, actions, pageSize = 8, emptyText = "暂无符合条件的数据" }: { data:T[];columns:ColumnDef<T>[];title?:string;subtitle?:string;selectable?:boolean;onSelectionChange?:(rows:T[])=>void;actions?:ReactNode;pageSize?:number;emptyText?:string }) {
  const [sorting,setSorting]=useState<SortingState>([]);
  const [globalFilter,setGlobalFilter]=useState("");
  const [columnVisibility,setColumnVisibility]=useState<VisibilityState>({});
  const [rowSelection,setRowSelection]=useState<RowSelectionState>({});
  const [columnsOpen,setColumnsOpen]=useState(false);
  const tableColumns = useMemo<ColumnDef<T>[]>(()=> selectable ? [{
    id:"select",header:({table})=><input aria-label="全选当前页" type="checkbox" checked={table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()}/>,
    cell:({row})=><input aria-label={`选择第 ${row.index+1} 行`} type="checkbox" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()}/>,enableSorting:false,enableHiding:false,
  },...columns] : columns,[columns,selectable]);
  const table = useReactTable({ data, columns:tableColumns, state:{ sorting,globalFilter,columnVisibility,rowSelection }, onSortingChange:setSorting,onGlobalFilterChange:setGlobalFilter,onColumnVisibilityChange:setColumnVisibility,onRowSelectionChange:setRowSelection,getCoreRowModel:getCoreRowModel(),getSortedRowModel:getSortedRowModel(),getFilteredRowModel:getFilteredRowModel(),getPaginationRowModel:getPaginationRowModel(),getRowId:(row)=>row.id,initialState:{pagination:{pageSize}} });
  const selectedRows = table.getSelectedRowModel().rows.map((row)=>row.original);
  useEffect(()=>onSelectionChange?.(selectedRows),[rowSelection]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="data-table-card">
    <header className="data-table-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><div className="data-table-tools"><label className="table-search"><Search size={14}/><input value={globalFilter} onChange={(event)=>setGlobalFilter(event.target.value)} placeholder="搜索当前列表"/></label><div className="column-picker"><Button onClick={()=>setColumnsOpen(!columnsOpen)}><Columns3 size={14}/>列设置<ChevronDown size={13}/></Button>{columnsOpen&&<div className="column-menu">{table.getAllLeafColumns().filter((column)=>column.getCanHide()).map((column)=><label key={column.id}><input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()}/>{String(column.columnDef.header ?? column.id)}</label>)}</div>}</div>{actions}</div></header>
    {selectable&&selectedRows.length>0&&<div className="selection-bar">已选择 <b>{selectedRows.length}</b> 条记录</div>}
    <div className="table-scroll"><table><thead>{table.getHeaderGroups().map((group)=><tr key={group.id}>{group.headers.map((header)=><th key={header.id} onClick={header.column.getToggleSortingHandler()} className={header.column.getCanSort()?"sortable":""}>{header.isPlaceholder?null:flexRender(header.column.columnDef.header,header.getContext())}{header.column.getCanSort()&&<ChevronsUpDown size={12}/>}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.length?table.getRowModel().rows.map((row)=><tr key={row.id}>{row.getVisibleCells().map((cell)=><td key={cell.id}>{flexRender(cell.column.columnDef.cell,cell.getContext())}</td>)}</tr>):<tr><td className="table-empty" colSpan={table.getVisibleLeafColumns().length}>{emptyText}</td></tr>}</tbody></table></div>
    <footer className="table-footer"><span>共 {table.getFilteredRowModel().rows.length} 条 · 第 {table.getState().pagination.pageIndex+1}/{Math.max(1,table.getPageCount())} 页</span><div><select value={table.getState().pagination.pageSize} onChange={(event)=>table.setPageSize(Number(event.target.value))}><option value="8">8 条/页</option><option value="12">12 条/页</option><option value="20">20 条/页</option></select><button aria-label="上一页" onClick={()=>table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft size={15}/></button><button aria-label="下一页" onClick={()=>table.nextPage()} disabled={!table.getCanNextPage()}><ChevronRight size={15}/></button></div></footer>
  </section>;
}
