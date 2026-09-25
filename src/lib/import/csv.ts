export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

export function parseCsv(text: string): ParsedCsv {
  const normalised = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();

  if (!normalised) {
    throw new Error("CSV file is empty");
  }

  const lines = normalised.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row");
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());

  if (headers.some((header) => header.length === 0)) {
    throw new Error("CSV header row contains empty column names");
  }

  const rows: Record<string, string>[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const values = parseCsvLine(lines[lineIndex]);

    if (values.every((value) => value.length === 0)) {
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex] ?? "";
    });
    rows.push(row);
  }

  if (rows.length === 0) {
    throw new Error("CSV contains no data rows");
  }

  return { headers, rows };
}
