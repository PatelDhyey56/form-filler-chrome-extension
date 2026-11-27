(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ParserConstants = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CSV_DELIMITERS = [',', ';', '\t'];

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

  const JSON_COLLECTION_KEYS = ['records', 'data', 'rows', 'items', 'results'];

  const PDF_ESCAPE_MAP = {
    n: '\n',
    r: '\r',
    t: '\t',
    b: '\b',
    f: '\f',
    '(': '(',
    ')': ')',
    '\\': '\\',
  };

  const FILE_SIGNATURES = {
    ZIP: [0x50, 0x4b, 0x03, 0x04],
    PDF: [0x25, 0x50, 0x44, 0x46, 0x2d],
    OLE2: [0xd0, 0xcf, 0x11, 0xe0],
  };

  const PARSER_MESSAGES = {
    EMPTY_CSV: 'CSV file is empty.',
    EMPTY_FILE: 'File is empty.',
    NO_FILE: 'No file provided.',
    NO_ROWS: 'No tabular rows found in the selected file.',
    PDF_EMPTY: 'No extractable text table found in this PDF (it may be scanned or encrypted).',
    OLE2_UNSUPPORTED: 'Legacy binary .doc/.xls could not be parsed as a table. Please save as .docx, .xlsx, or .csv.',
  };

  return {
    CSV_DELIMITERS,
    ID_CANDIDATES,
    JSON_COLLECTION_KEYS,
    PDF_ESCAPE_MAP,
    FILE_SIGNATURES,
    PARSER_MESSAGES,
  };
});
