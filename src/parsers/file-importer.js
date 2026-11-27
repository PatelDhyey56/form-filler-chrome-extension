(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./csv-parser'), require('../constants/parser-constants'));
  } else {
    root.FileImporter = factory(root.CSVParser, root.ParserConstants);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CSVParser, ParserConstants) {
  'use strict';

  const { JSON_COLLECTION_KEYS, PDF_ESCAPE_MAP, FILE_SIGNATURES, PARSER_MESSAGES } = ParserConstants;

  /* ========================================================================
   * XML, Encoding & Binary Helpers
   * ======================================================================== */

  function decodeXmlEntities(str) {
    return String(str || '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&amp;/g, '&');
  }

  function stripTags(htmlOrXml) {
    return decodeXmlEntities(String(htmlOrXml || '').replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getAttr(attrStr, name) {
    if (!attrStr) return '';
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`(?:^|\\s)(?:[a-zA-Z0-9_-]+:)?${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
    const match = attrStr.match(rx);
    return match ? decodeXmlEntities(match[1] !== undefined ? match[1] : match[2] || '') : '';
  }

  function extractJoinedTagText(xml, tagName) {
    const rx = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
    const parts = [];
    let match;
    while ((match = rx.exec(xml)) !== null) {
      parts.push(decodeXmlEntities(match[1]));
    }
    return parts.join('');
  }

  function decodeBytes(bytes) {
    if (!bytes || bytes.length === 0) return '';
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    }
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  function startsWithSignature(bytes, signature) {
    if (!bytes || bytes.length < signature.length) return false;
    for (let i = 0; i < signature.length; i += 1) {
      if (bytes[i] !== signature[i]) return false;
    }
    return true;
  }

  async function inflateBytes(compressed, format) {
    if (typeof DecompressionStream === 'function') {
      const ds = new DecompressionStream(format);
      const stream = new Blob([compressed]).stream().pipeThrough(ds);
      const buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    }
    if (typeof require === 'function') {
      const zlib = require('zlib');
      const input = Buffer.from(compressed);
      const out = format === 'deflate-raw' ? zlib.inflateRawSync(input) : zlib.inflateSync(input);
      return new Uint8Array(out);
    }
    throw new Error('DecompressionStream is not available in this environment.');
  }

  function readUint16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readUint32LE(bytes, offset) {
    return (
      (bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)) >>>
      0
    );
  }

  /* ========================================================================
   * ZIP Archive Reader (Central Directory)
   * ======================================================================== */

  async function extractZipEntries(bytes) {
    const entries = new Map();
    const minEocd = Math.max(0, bytes.length - 65557);
    let eocdOffset = -1;

    for (let i = bytes.length - 22; i >= minEocd; i -= 1) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset < 0) {
      throw new Error('Invalid or corrupted ZIP archive.');
    }

    const cdSize = readUint32LE(bytes, eocdOffset + 12);
    const cdOffset = readUint32LE(bytes, eocdOffset + 16);
    const cdEnd = Math.min(bytes.length, cdOffset + cdSize);

    let ptr = cdOffset;
    while (ptr + 46 <= cdEnd) {
      if (readUint32LE(bytes, ptr) !== 0x02014b50) break;

      const method = readUint16LE(bytes, ptr + 10);
      const compSize = readUint32LE(bytes, ptr + 20);
      const nameLen = readUint16LE(bytes, ptr + 28);
      const extraLen = readUint16LE(bytes, ptr + 30);
      const commentLen = readUint16LE(bytes, ptr + 32);
      const localOffset = readUint32LE(bytes, ptr + 42);

      const fileName = decodeBytes(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
      ptr += 46 + nameLen + extraLen + commentLen;

      if (!fileName || fileName.endsWith('/')) continue;
      if (localOffset + 30 > bytes.length || readUint32LE(bytes, localOffset) !== 0x04034b50) {
        continue;
      }

      const lfhNameLen = readUint16LE(bytes, localOffset + 26);
      const lfhExtraLen = readUint16LE(bytes, localOffset + 28);
      const dataStart = localOffset + 30 + lfhNameLen + lfhExtraLen;
      const compSlice = bytes.subarray(dataStart, dataStart + compSize);

      if (method === 0) {
        entries.set(fileName, compSlice);
      } else if (method === 8) {
        try {
          entries.set(fileName, await inflateBytes(compSlice, 'deflate-raw'));
        } catch (_) {
          // Skip unreadable compressed entry
        }
      }
    }
    return entries;
  }

  /* ========================================================================
   * Office / Spreadsheet / Document Parsers (XLSX, ODS, DOCX, HTML, XML, RTF)
   * ======================================================================== */

  function colRefToIndex(ref) {
    const letters = String(ref || '').replace(/[^A-Za-z]/g, '').toUpperCase();
    let idx = 0;
    for (let i = 0; i < letters.length; i += 1) {
      idx = idx * 26 + (letters.charCodeAt(i) - 64);
    }
    return Math.max(0, idx - 1);
  }

  function parseXlsxSharedStrings(xml) {
    if (!xml) return [];
    const strings = [];
    const siRx = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
    let match;
    while ((match = siRx.exec(xml)) !== null) {
      strings.push(extractJoinedTagText(match[1], 't'));
    }
    return strings;
  }

  function parseXlsxSheet(xml, sharedStrings) {
    const rows = [];
    const rowRx = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
    let rm;
    while ((rm = rowRx.exec(xml)) !== null) {
      const rowCells = [];
      const cellRx = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
      let cm;
      while ((cm = cellRx.exec(rm[1])) !== null) {
        const attrs = cm[1];
        const body = cm[2];
        const ref = getAttr(attrs, 'r');
        const type = getAttr(attrs, 't');
        const colIdx = ref ? colRefToIndex(ref) : rowCells.length;

        let val = '';
        if (type === 'inlineStr') {
          val = extractJoinedTagText(body, 't');
        } else {
          const vm = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
          const rawV = vm ? decodeXmlEntities(vm[1]) : '';
          if (type === 's') {
            const sIdx = Number(rawV);
            val = Number.isInteger(sIdx) && sharedStrings[sIdx] !== undefined ? sharedStrings[sIdx] : rawV;
          } else if (type === 'b') {
            val = rawV === '1' ? 'true' : 'false';
          } else {
            val = rawV;
          }
        }

        while (rowCells.length < colIdx) rowCells.push('');
        rowCells[colIdx] = String(val).trim();
      }
      if (rowCells.some((c) => c !== '')) {
        rows.push(rowCells);
      }
    }
    return rows;
  }

  function parseXlsxFromEntries(entries) {
    const ssEntry = entries.get('xl/sharedStrings.xml');
    const sharedStrings = ssEntry ? parseXlsxSharedStrings(decodeBytes(ssEntry)) : [];

    const sheetNames = Array.from(entries.keys())
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
      .sort((a, b) => {
        const na = Number((a.match(/(\d+)/) || [0, 0])[1]);
        const nb = Number((b.match(/(\d+)/) || [0, 0])[1]);
        return na - nb;
      });

    for (const sName of sheetNames) {
      const rows = parseXlsxSheet(decodeBytes(entries.get(sName)), sharedStrings);
      if (rows.length >= 2 || (rows.length === 1 && rows[0].length > 1)) {
        return rows;
      }
    }
    return [];
  }

  function parseOdsContent(xml) {
    const tableMatch = xml.match(/<table:table\b[^>]*>([\s\S]*?)<\/table:table>/i);
    const scope = tableMatch ? tableMatch[1] : xml;
    const rows = [];
    const rowRx = /<table:table-row\b([^>]*)>([\s\S]*?)<\/table:table-row>/gi;
    let rm;

    while ((rm = rowRx.exec(scope)) !== null) {
      const rowCells = [];
      const cellRx = /<table:table-cell\b([^>]*)(?:\/>|>([\s\S]*?)<\/table:table-cell>)/gi;
      let cm;
      while ((cm = cellRx.exec(rm[2])) !== null) {
        const attrs = cm[1];
        const body = cm[2] || '';
        const repeatRaw = Number(getAttr(attrs, 'number-columns-repeated'));
        const repeat = Number.isInteger(repeatRaw) && repeatRaw > 1 && repeatRaw < 200 ? repeatRaw : 1;

        const textParts = [];
        const pRx = /<text:p\b[^>]*>([\s\S]*?)<\/text:p>/gi;
        let pm;
        while ((pm = pRx.exec(body)) !== null) {
          textParts.push(stripTags(pm[1]));
        }
        const val = textParts.length > 0 ? textParts.join('\n').trim() : stripTags(body);
        if (!val && repeat > 20) break;
        for (let i = 0; i < repeat; i += 1) {
          rowCells.push(val);
        }
      }
      while (rowCells.length > 0 && rowCells[rowCells.length - 1] === '') {
        rowCells.pop();
      }
      if (rowCells.some((c) => c !== '')) {
        rows.push(rowCells);
      }
    }
    return rows;
  }

  function extractDocxParagraphLines(xml) {
    const lines = [];
    const pRx = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi;
    let pm;
    while ((pm = pRx.exec(xml)) !== null) {
      const pText = extractJoinedTagText(pm[1], 'w:t').trim();
      if (pText) lines.push(pText);
    }
    return lines;
  }

  function parseDocxDocument(xml) {
    const tblRx = /<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/gi;
    let tm;
    while ((tm = tblRx.exec(xml)) !== null) {
      const trRx = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/gi;
      const tblRows = [];
      let trm;
      while ((trm = trRx.exec(tm[1])) !== null) {
        const cells = [];
        const tcRx = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/gi;
        let tcm;
        while ((tcm = tcRx.exec(trm[1])) !== null) {
          cells.push(extractDocxParagraphLines(tcm[1]).join(' ').trim());
        }
        if (cells.some((c) => c !== '')) {
          tblRows.push(cells);
        }
      }
      if (tblRows.length > 0) return tblRows;
    }

    const lines = extractDocxParagraphLines(xml);
    return lines.length > 0 ? parseTextToMatrix(lines.join('\n')) : [];
  }

  function parseHtmlTable(html) {
    const tblRx = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
    let tm;
    while ((tm = tblRx.exec(html)) !== null) {
      const rows = [];
      const trRx = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      let trm;
      while ((trm = trRx.exec(tm[1])) !== null) {
        const cells = [];
        const tdRx = /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
        let tdm;
        while ((tdm = tdRx.exec(trm[1])) !== null) {
          const val = stripTags(tdm[3]);
          const spanRaw = Number(getAttr(tdm[2], 'colspan'));
          const span = Number.isInteger(spanRaw) && spanRaw > 1 && spanRaw < 50 ? spanRaw : 1;
          cells.push(val);
          for (let s = 1; s < span; s += 1) cells.push('');
        }
        if (cells.some((c) => c !== '')) {
          rows.push(cells);
        }
      }
      if (rows.length > 0) return rows;
    }
    return [];
  }

  function parseSpreadsheetMlXml(xml) {
    const rows = [];
    const rowRx = /<Row\b[^>]*>([\s\S]*?)<\/Row>/gi;
    let rm;
    while ((rm = rowRx.exec(xml)) !== null) {
      const rowCells = [];
      const cellRx = /<Cell\b([^>]*)>([\s\S]*?)<\/Cell>/gi;
      let cm;
      while ((cm = cellRx.exec(rm[1])) !== null) {
        const idxAttr = Number(getAttr(cm[1], 'Index'));
        const colIdx = Number.isInteger(idxAttr) && idxAttr > 0 ? idxAttr - 1 : rowCells.length;
        const dataMatch = cm[2].match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i);
        const val = dataMatch ? stripTags(dataMatch[1]) : stripTags(cm[2]);
        while (rowCells.length < colIdx) rowCells.push('');
        rowCells[colIdx] = val;
      }
      if (rowCells.some((c) => c !== '')) {
        rows.push(rowCells);
      }
    }
    return rows;
  }

  function parseRtf(rtfText) {
    let text = String(rtfText || '');
    text = text.replace(/\{\\\*(?:[^{}]|\{[^{}]*\})*\}/g, '');
    text = text.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict|object)(?:[^{}]|\{[^{}]*\})*\}/g, '');
    text = text
      .replace(/\\cell\b\s?/g, '\t')
      .replace(/\\row\b\s?/g, '\n')
      .replace(/\\tab\b\s?/g, '\t')
      .replace(/\\par\b\s?|\\line\b\s?/g, '\n')
      .replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\u(-?\d+)\??/g, (_, code) => {
        const c = Number(code);
        return String.fromCharCode(c < 0 ? c + 65536 : c);
      })
      .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
      .replace(/[{}]/g, '')
      .replace(/\t+(?=\n|$)/g, '');

    return parseTextToMatrix(text);
  }

  /* ========================================================================
   * PDF Text Stream Extractor
   * ======================================================================== */

  function decodePdfLiteralString(raw) {
    let out = '';
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i];
      if (ch !== '\\') {
        out += ch;
        continue;
      }
      i += 1;
      if (i >= raw.length) break;
      const esc = raw[i];
      if (Object.prototype.hasOwnProperty.call(PDF_ESCAPE_MAP, esc)) {
        out += PDF_ESCAPE_MAP[esc];
      } else if (esc === '\r' && raw[i + 1] === '\n') {
        i += 1;
      } else if (esc === '\n' || esc === '\r') {
        // Line continuation
      } else if (/[0-7]/.test(esc)) {
        let oct = esc;
        for (let k = 0; k < 2 && /[0-7]/.test(raw[i + 1] || ''); k += 1) {
          i += 1;
          oct += raw[i];
        }
        out += String.fromCharCode(parseInt(oct, 8));
      } else {
        out += esc;
      }
    }
    return out;
  }

  function decodePdfHexString(hex) {
    const clean = String(hex || '').replace(/\s+/g, '');
    if (!clean) return '';
    const padded = clean.length % 2 === 1 ? `${clean}0` : clean;
    let out = '';
    if (padded.toUpperCase().startsWith('FEFF')) {
      for (let i = 4; i + 3 < padded.length; i += 4) {
        out += String.fromCharCode(parseInt(padded.slice(i, i + 4), 16));
      }
      return out;
    }
    for (let i = 0; i + 1 < padded.length; i += 2) {
      const code = parseInt(padded.slice(i, i + 2), 16);
      if (code >= 32 || code === 9 || code === 10 || code === 13) {
        out += String.fromCharCode(code);
      }
    }
    return out;
  }

  function extractPdfTextTokensFromStream(streamText) {
    const tokens = [];
    const btRx = /BT\b([\s\S]*?)ET\b/g;
    const opRx =
      /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Tm\b|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+T[dD]\b|(-?\d+(?:\.\d+)?)\s+TL\b|T\*|(\((?:\\.|[^\\()])*\))\s*(?:Tj|'|")|<([0-9a-fA-F\s]+)>\s*(?:Tj|'|")|\[((?:[^\[\]]|\((?:\\.|[^\\()])*\))*)\]\s*TJ/g;

    let bm;
    while ((bm = btRx.exec(streamText)) !== null) {
      const block = bm[1];
      let x = 0;
      let y = 0;
      let leading = 12;

      opRx.lastIndex = 0;
      let om;
      while ((om = opRx.exec(block)) !== null) {
        if (om[5] !== undefined && om[6] !== undefined) {
          x = Number(om[5]);
          y = Number(om[6]);
        } else if (om[7] !== undefined && om[8] !== undefined) {
          x += Number(om[7]);
          y += Number(om[8]);
        } else if (om[9] !== undefined) {
          leading = Math.abs(Number(om[9])) || 12;
        } else if (om[0] === 'T*') {
          y -= leading;
        } else if (om[10] !== undefined) {
          const str = decodePdfLiteralString(om[10].slice(1, -1)).trim();
          if (str) tokens.push({ x, y, text: str });
        } else if (om[11] !== undefined) {
          const str = decodePdfHexString(om[11]).trim();
          if (str) tokens.push({ x, y, text: str });
        } else if (om[12] !== undefined) {
          let joined = '';
          const partRx = /\((?:\\.|[^\\()])*\)|<([0-9a-fA-F\s]+)>|(-?\d+(?:\.\d+)?)/g;
          let pm;
          while ((pm = partRx.exec(om[12])) !== null) {
            if (pm[0].startsWith('(')) {
              joined += decodePdfLiteralString(pm[0].slice(1, -1));
            } else if (pm[1] !== undefined) {
              joined += decodePdfHexString(pm[1]);
            } else if (pm[2] !== undefined && Number(pm[2]) < -180) {
              joined += ' ';
            }
          }
          if (joined.trim()) tokens.push({ x, y, text: joined.trim() });
        }
      }
    }
    return tokens;
  }

  function pdfTokensToMatrix(tokens) {
    if (!tokens || tokens.length === 0) return [];
    const sorted = [...tokens].sort((a, b) => (Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x));
    const lines = [];
    for (const tok of sorted) {
      const lastLine = lines[lines.length - 1];
      if (lastLine && Math.abs(lastLine.y - tok.y) <= 3.5) {
        lastLine.items.push(tok);
      } else {
        lines.push({ y: tok.y, items: [tok] });
      }
    }

    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));

    const plainLines = lines.map((l) => l.items.map((i) => i.text).join(' ').trim()).filter(Boolean);
    if (plainLines.length >= 2 && /[,\t;|]/.test(plainLines.slice(0, 5).join('\n'))) {
      const textMatrix = parseTextToMatrix(plainLines.join('\n'));
      if (textMatrix.length >= 2 && textMatrix[0].length >= 2) {
        return textMatrix;
      }
    }

    const multiTokenLines = lines.filter((l) => l.items.length >= 2);
    if (multiTokenLines.length === 0) {
      return plainLines.map((l) => [l]);
    }

    const colAnchors = [];
    multiTokenLines.forEach((l) => {
      l.items.forEach((item) => {
        if (colAnchors.every((ax) => Math.abs(ax - item.x) > 18)) {
          colAnchors.push(item.x);
        }
      });
    });
    colAnchors.sort((a, b) => a - b);

    const rows = [];
    for (const line of lines) {
      if (line.items.length < 2 && colAnchors.length > 2) continue;
      const row = new Array(colAnchors.length).fill('');
      for (const item of line.items) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < colAnchors.length; i += 1) {
          const dist = Math.abs(colAnchors[i] - item.x);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
        row[bestIdx] = row[bestIdx] ? `${row[bestIdx]} ${item.text}` : item.text;
      }
      if (row.some((c) => c !== '')) rows.push(row);
    }
    return rows;
  }

  async function parsePdfBytes(bytes) {
    const latin1 = new TextDecoder('latin1').decode(bytes);
    const allTokens = [];
    const streamRx = /stream\r?\n([\s\S]*?)\r?\n?endstream/g;
    let sm;

    while ((sm = streamRx.exec(latin1)) !== null) {
      const startIdx = sm.index + sm[0].indexOf(sm[1]);
      const rawSlice = bytes.subarray(startIdx, startIdx + sm[1].length);

      let streamStr = '';
      if (sm[1].includes('BT') && (sm[1].includes('Tj') || sm[1].includes('TJ'))) {
        streamStr = sm[1];
      } else {
        for (const fmt of ['deflate', 'deflate-raw']) {
          try {
            const inflated = await inflateBytes(rawSlice, fmt);
            streamStr = new TextDecoder('latin1').decode(inflated);
            break;
          } catch (_) {
            // Try next decompression format or skip non-text stream
          }
        }
      }

      if (streamStr && (streamStr.includes('BT') || streamStr.includes('Tj') || streamStr.includes('TJ'))) {
        allTokens.push(...extractPdfTextTokensFromStream(streamStr));
      }
    }

    if (allTokens.length === 0) {
      allTokens.push(...extractPdfTextTokensFromStream(latin1));
    }

    return pdfTokensToMatrix(allTokens);
  }

  /* ========================================================================
   * Text Formats (JSON, Markdown, Delimited) & Dataset Normalization
   * ======================================================================== */

  function parseMarkdownTable(text) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.includes('|'));
    if (lines.length < 2) return null;

    const isSepLine = (line) => /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(line);
    if (!lines.some(isSepLine)) return null;

    const rows = [];
    for (const line of lines) {
      if (isSepLine(line)) continue;
      const cells = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
      if (cells.some((c) => c !== '')) rows.push(cells);
    }
    return rows.length > 0 ? rows : null;
  }

  function parseJsonToMatrix(text) {
    const parsed = JSON.parse(text);
    let list = null;
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && typeof parsed === 'object') {
      for (const key of JSON_COLLECTION_KEYS) {
        if (Array.isArray(parsed[key])) {
          list = parsed[key];
          break;
        }
      }
      if (!list) list = [parsed];
    }

    if (!list || list.length === 0) return [];
    if (Array.isArray(list[0])) {
      return list.map((row) => (Array.isArray(row) ? row.map((v) => String(v ?? '').trim()) : [String(row ?? '')]));
    }

    const headers = [];
    const headerSet = new Set();
    for (const item of list) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        Object.keys(item).forEach((k) => {
          if (!headerSet.has(k)) {
            headerSet.add(k);
            headers.push(k);
          }
        });
      }
    }
    if (headers.length === 0) return [];

    const rows = [headers];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      rows.push(
        headers.map((h) => {
          const val = item[h];
          if (val === undefined || val === null) return '';
          return typeof val === 'object' ? JSON.stringify(val) : String(val).trim();
        })
      );
    }
    return rows;
  }

  function parseTextToMatrix(rawText) {
    const clean = String(rawText || '').replace(/^\uFEFF/, '').trim();
    if (!clean) return [];

    if (clean.startsWith('[') || clean.startsWith('{')) {
      try {
        const jsonRows = parseJsonToMatrix(clean);
        if (jsonRows.length > 0) return jsonRows;
      } catch (_) {
        // Not valid JSON
      }
    }

    if (/<table\b/i.test(clean)) {
      const htmlRows = parseHtmlTable(clean);
      if (htmlRows.length > 0) return htmlRows;
    }

    if (/<Row\b/i.test(clean) && /<Cell\b/i.test(clean)) {
      const xmlRows = parseSpreadsheetMlXml(clean);
      if (xmlRows.length > 0) return xmlRows;
    }

    const mdRows = parseMarkdownTable(clean);
    if (mdRows && mdRows.length > 0) return mdRows;

    const firstLines = clean.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5).join('\n');
    if (CSVParser && typeof CSVParser.parseCSVRows === 'function') {
      const pipeCount = (firstLines.match(/\|/g) || []).length;
      const commaCount = (firstLines.match(/,/g) || []).length;
      const semiCount = (firstLines.match(/;/g) || []).length;
      const tabCount = (firstLines.match(/\t/g) || []).length;
      if (pipeCount > Math.max(commaCount, semiCount, tabCount)) {
        return CSVParser.parseCSVRows(clean, '|');
      }
      return CSVParser.parseCSVRows(clean);
    }

    return clean
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => l.split(',').map((c) => c.trim()));
  }

  function extractBinaryOle2Fallback(bytes) {
    const ascii = new TextDecoder('latin1').decode(bytes);
    const utf16 = new TextDecoder('utf-16le').decode(bytes);
    const pickLines = (str) =>
      str
        .split(/[\r\n]+/)
        .map((l) => l.replace(/[^\x20-\x7E\t]/g, '').trim())
        .filter((l) => l.length >= 3 && /[a-zA-Z0-9]/.test(l) && /[\t,;|]/.test(l));

    const utf16Lines = pickLines(utf16);
    if (utf16Lines.length >= 2) return parseTextToMatrix(utf16Lines.join('\n'));
    const asciiLines = pickLines(ascii);
    if (asciiLines.length >= 2) return parseTextToMatrix(asciiLines.join('\n'));
    return [];
  }

  function deduplicateColumns(rawHeaders) {
    if (CSVParser && typeof CSVParser.deduplicateHeaders === 'function') {
      return CSVParser.deduplicateHeaders(rawHeaders);
    }
    const seen = new Map();
    return rawHeaders.map((h, idx) => {
      const base = String(h || '').trim() || `column_${idx + 1}`;
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base}_${count + 1}`;
    });
  }

  function emptyResult(warning) {
    return { headers: [], idColumn: '', records: [], indexById: {}, warnings: [warning] };
  }

  function matrixToDataset(rawMatrix) {
    const matrix = (rawMatrix || [])
      .map((row) => {
        const arr = Array.isArray(row) ? row.map((c) => String(c ?? '').trim()) : [String(row ?? '').trim()];
        while (arr.length > 0 && arr[arr.length - 1] === '') arr.pop();
        return arr;
      })
      .filter((row) => row.some((c) => c !== ''));

    if (matrix.length === 0) {
      return emptyResult(PARSER_MESSAGES.NO_ROWS);
    }

    const headerIdx =
      matrix.length >= 3 && matrix[0].filter(Boolean).length === 1 && matrix[1].filter(Boolean).length >= 2 ? 1 : 0;

    const rawHeaderRow = matrix[headerIdx];
    const maxCols = matrix.slice(headerIdx).reduce((m, r) => Math.max(m, r.length), rawHeaderRow.length);
    const paddedHeaders = [];
    for (let i = 0; i < maxCols; i += 1) {
      paddedHeaders.push(rawHeaderRow[i] || `column_${i + 1}`);
    }

    const headers = deduplicateColumns(paddedHeaders);
    const idColumn = CSVParser ? CSVParser.detectIdColumn(headers) : headers[0];
    const records = [];

    for (let r = headerIdx + 1; r < matrix.length; r += 1) {
      const rowValues = matrix[r];
      const record = {};
      for (let c = 0; c < headers.length; c += 1) {
        record[headers[c]] = rowValues[c] !== undefined ? String(rowValues[c]).trim() : '';
      }
      records.push(record);
    }

    const indexResult = CSVParser ? CSVParser.buildIndex(records, idColumn) : { indexById: {}, warnings: [] };
    return {
      headers,
      idColumn,
      records,
      indexById: indexResult.indexById,
      warnings: indexResult.warnings,
    };
  }

  /* ========================================================================
   * Entry Points
   * ======================================================================== */

  async function parseArrayBuffer(arrayBuffer, fileName) {
    const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
    if (bytes.length === 0) {
      return emptyResult(PARSER_MESSAGES.EMPTY_FILE);
    }

    const lowerName = String(fileName || '').toLowerCase();

    if (startsWithSignature(bytes, FILE_SIGNATURES.ZIP)) {
      const entries = await extractZipEntries(bytes);
      if (entries.has('xl/workbook.xml') || Array.from(entries.keys()).some((k) => k.startsWith('xl/worksheets/'))) {
        return matrixToDataset(parseXlsxFromEntries(entries));
      }
      if (entries.has('content.xml')) {
        return matrixToDataset(parseOdsContent(decodeBytes(entries.get('content.xml'))));
      }
      if (entries.has('word/document.xml')) {
        return matrixToDataset(parseDocxDocument(decodeBytes(entries.get('word/document.xml'))));
      }
    }

    if (startsWithSignature(bytes, FILE_SIGNATURES.PDF) || lowerName.endsWith('.pdf')) {
      const pdfRows = await parsePdfBytes(bytes);
      if (pdfRows.length === 0) {
        return emptyResult(PARSER_MESSAGES.PDF_EMPTY);
      }
      return matrixToDataset(pdfRows);
    }

    if (startsWithSignature(bytes, FILE_SIGNATURES.OLE2)) {
      const oleRows = extractBinaryOle2Fallback(bytes);
      if (oleRows.length === 0) {
        return emptyResult(PARSER_MESSAGES.OLE2_UNSUPPORTED);
      }
      return matrixToDataset(oleRows);
    }

    const text = decodeBytes(bytes);
    if (text.trimStart().startsWith('{\\rtf') || lowerName.endsWith('.rtf')) {
      return matrixToDataset(parseRtf(text));
    }

    return matrixToDataset(parseTextToMatrix(text));
  }

  async function importFile(file) {
    if (!file) {
      return emptyResult(PARSER_MESSAGES.NO_FILE);
    }
    const buffer =
      typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : await new Response(file).arrayBuffer();
    return parseArrayBuffer(buffer, file.name || 'uploaded');
  }

  return {
    importFile,
    parseArrayBuffer,
    parseTextToMatrix,
    matrixToDataset,
    extractZipEntries,
    parsePdfBytes,
    parseDocxDocument,
    parseOdsContent,
    parseRtf,
  };
});
