(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../constants/parser-constants'));
  } else {
    root.CSVParser = factory(root.ParserConstants);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ParserConstants) {
  'use strict';

  const { CSV_DELIMITERS, ID_CANDIDATES, PARSER_MESSAGES } = ParserConstants;

  /**
   * Normalize a header or identifier string for case-insensitive matching.
   */
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
    const firstLine =
      String(text || '')
        .split(/\r?\n/)
        .find((line) => line.trim().length > 0) || '';
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
    let bestCount = 0;
    for (const delim of CSV_DELIMITERS) {
      if (counts[delim] > bestCount) {
        bestCount = counts[delim];
        best = delim;
      }
    }
    return best;
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

    const commitRow = () => {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    };

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
        if (cleanText[i + 1] === '\n') i += 1;
        commitRow();
      } else if (ch === '\n') {
        commitRow();
      } else {
        currentField += ch;
      }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      commitRow();
    }

    return rows.filter((row) => row.some((cell) => String(cell).trim() !== ''));
  }

  /**
   * Pick the most likely ID column from parsed headers.
   */
  function detectIdColumn(headers) {
    if (!headers || headers.length === 0) return '';
    for (const candidate of ID_CANDIDATES) {
      const match = headers.find((h) => normalizeHeaderKey(h) === candidate);
      if (match) return match;
    }
    return headers[0];
  }

  /**
   * Ensure all column headers are non-empty and unique.
   */
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
   * Build a lookup map of trimmed ID values to their latest matching record.
   */
  function buildIndex(records, idColumn) {
    const indexById = {};
    const warnings = [];
    const duplicates = [];
    let emptyCount = 0;

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

  /**
   * Parse CSV text into { headers, idColumn, records, indexById, warnings }.
   */
  function parseCSV(rawText, preferredIdColumn) {
    const matrix = parseCSVRows(rawText);
    if (matrix.length === 0) {
      return {
        headers: [],
        idColumn: '',
        records: [],
        indexById: {},
        warnings: [PARSER_MESSAGES.EMPTY_CSV],
      };
    }

    const headers = deduplicateHeaders(matrix[0]);
    const idColumn =
      preferredIdColumn && headers.includes(preferredIdColumn)
        ? preferredIdColumn
        : detectIdColumn(headers);

    const records = [];
    for (let r = 1; r < matrix.length; r += 1) {
      const rowValues = matrix[r];
      const record = {};
      for (let c = 0; c < headers.length; c += 1) {
        record[headers[c]] = rowValues[c] !== undefined ? String(rowValues[c]).trim() : '';
      }
      records.push(record);
    }

    const indexResult = buildIndex(records, idColumn);
    return {
      headers,
      idColumn,
      records,
      indexById: indexResult.indexById,
      warnings: indexResult.warnings,
    };
  }

  return {
    parseCSV,
    parseCSVRows,
    detectIdColumn,
    deduplicateHeaders,
    buildIndex,
    normalizeHeaderKey,
  };
});
