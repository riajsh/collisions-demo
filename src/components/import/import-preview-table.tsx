import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DedupStatus, ImportRowView } from "@/lib/import/types";

type ImportPreviewTableProps = {
  rows: ImportRowView[];
};

const MATCH_STATUS_LABELS: Record<DedupStatus, string> = {
  pending: "Checking…",
  matched_email: "Matches existing profile",
  soft_match: "Possible match",
  new: "New profile",
  error: "Error — skipped",
};

export function ImportPreviewTable({ rows }: ImportPreviewTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-body text-muted-foreground">No staged rows for this import.</p>
    );
  }

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row.raw)))];

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            {columns.map((column) => (
              <TableHead key={column}>{column}</TableHead>
            ))}
            <TableHead>Match status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.rowNumber}</TableCell>
              {columns.map((column) => (
                <TableCell key={column} className="text-muted-foreground">
                  {row.raw[column] ?? "—"}
                </TableCell>
              ))}
              <TableCell className="text-muted-foreground">
                {MATCH_STATUS_LABELS[row.dedupStatus]}
                {row.error ? ` (${row.error})` : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
