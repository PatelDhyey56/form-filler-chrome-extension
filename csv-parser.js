(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CSVParser = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ID_CANDIDATES = [
    'id',
    'record_id',
    'recordid',
    'user_id',
    'userid',
    'customer_id',
    'customerid',
    'emp_id',
    'empid',
    'employee_id',
    'student_id',
    'order_id',
    'code',
    'key',
    'achievementname',
    'achevementname',
  ];

  function normalizeHeaderKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Detect delimiter from the first non-empty line (comma, semicolon, or tab).
   */
  function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQuotes = false;

    for (let i = 0; i < firstLine.length; i += 1) {
      const ch = firstLine[i];
      if (ch === '"') {
        if (inQuotes && firstLine[i + 1] === '"') {
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes && Object.prototype.hasOwnProperty.call(counts, ch)) {
        counts[ch] += 1;
      }
    }

    let best = ',';
    let bestCount = -1;
    for (const delim of [',', ';', '\t']) {
      if (counts[delim] > bestCount) {
        bestCount = counts[delim];
        best = delim;
      }
    }
    return bestCount > 0 ? best : ',';
  }

  /**
   * RFC-4180 compliant CSV parser supporting quoted fields, escaped quotes, and embedded newlines.
   */
  function parseCSVRows(rawText, delimiter) {
    const cleanText = String(rawText || '').replace(/^\uFEFF/, '');
    const sep = delimiter || detectDelimiter(cleanText);
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < cleanText.length; i += 1) {
      const ch = cleanText[i];

      if (inQuotes) {
        if (ch === '"') {
          if (cleanText[i + 1] === '"') {
            currentField += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          currentField += ch;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
      } else if (ch === sep) {
        currentRow.push(currentField);
        currentField = '';
      } else if (ch === '\r') {
        if (cleanText[i + 1] === '\n') {
          i += 1;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (ch === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    return rows.filter((row) => row.some((cell) => String(cell).trim() !== ''));
  }

  function detectIdColumn(headers) {
    if (!headers || headers.length === 0) return '';
    for (const candidate of ID_CANDIDATES) {
      const match = headers.find((h) => normalizeHeaderKey(h) === candidate);
      if (match) return match;
    }
    return headers[0];
  }

  function deduplicateHeaders(rawHeaders) {
    const seen = new Map();
    return rawHeaders.map((header, idx) => {
      const base = String(header || '').trim() || `column_${idx + 1}`;
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base}_${count + 1}`;
    });
  }

  /**
   * Parse CSV string into { headers, idColumn, records, indexById, warnings }.
   */
  function parseCSV(rawText, preferredIdColumn) {
    const matrix = parseCSVRows(rawText);
    if (matrix.length === 0) {
      return {
        headers: [],
        idColumn: '',
        records: [],
        indexById: {},
        warnings: ['CSV file is empty.'],
      };
    }

    const headers = deduplicateHeaders(matrix[0]);
    const idColumn =
      preferredIdColumn && headers.includes(preferredIdColumn)
        ? preferredIdColumn
        : detectIdColumn(headers);

    const records = [];
    const warnings = [];

    for (let r = 1; r < matrix.length; r += 1) {
      const rowValues = matrix[r];
      const record = {};
      for (let c = 0; c < headers.length; c += 1) {
        record[headers[c]] = rowValues[c] !== undefined ? String(rowValues[c]).trim() : '';
      }
      records.push(record);
    }

    const indexResult = buildIndex(records, idColumn);
    warnings.push(...indexResult.warnings);

    return {
      headers,
      idColumn,
      records,
      indexById: indexResult.indexById,
      warnings,
    };
  }

  function buildIndex(records, idColumn) {
    const indexById = {};
    const warnings = [];
    let emptyCount = 0;
    const duplicates = [];

    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      const rawId = idColumn ? record[idColumn] : '';
      const id = rawId !== undefined && rawId !== null ? String(rawId).trim() : '';
      if (!id) {
        emptyCount += 1;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(indexById, id)) {
        duplicates.push(id);
      }
      indexById[id] = record;
    }

    if (emptyCount > 0) {
      warnings.push(`${emptyCount} row(s) had an empty "${idColumn}" value.`);
    }
    if (duplicates.length > 0) {
      const uniqueDups = Array.from(new Set(duplicates)).slice(0, 5);
      warnings.push(
        `Duplicate ID(s) found for "${idColumn}" (${uniqueDups.join(', ')}). Latest row is used.`
      );
    }

    return { indexById, warnings };
  }

  return {
    parseCSV,
    parseCSVRows,
    detectIdColumn,
    buildIndex,
    normalizeHeaderKey,
  };
});
