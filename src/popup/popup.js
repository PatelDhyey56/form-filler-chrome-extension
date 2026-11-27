(function () {
  'use strict';

  /* ========================================================================
   * Constants & Configuration
   * ======================================================================== */

  const {
    STORAGE_KEYS,
    POPUP_ROUTES,
    PINNED_WINDOW_SIZE,
    LIMITS,
    SAMPLE_CSV,
    ACHIEVEMENT_PRESET_MAPPINGS,
    PREVIEW_HEADER_PREFERENCE_GROUPS,
    DATETIME_DEFAULT_KEYS,
    TIME_DEFAULT_KEYS,
  } = window.AppConstants;

  const urlParams =
    typeof window !== 'undefined' && window.location && typeof URLSearchParams === 'function'
      ? new URLSearchParams(window.location.search || '')
      : null;
  const isPinnedWindow = Boolean(urlParams && urlParams.get('mode') === 'window');
  const pinnedTabId = urlParams && urlParams.get('tabId') ? Number(urlParams.get('tabId')) : null;
  const queryTabOverride = urlParams ? urlParams.get('tab') : '';
  const queryActionHint = urlParams ? urlParams.get('action') : '';

  /* ========================================================================
   * State & DOM References
   * ======================================================================== */

  const state = {
    headers: [],
    idColumn: '',
    records: [],
    indexById: {},
    mappings: {},
    defaultFields: {},
    fileName: '',
    expandedIds: new Set(),
    scannedFields: [],
    randomPreviewFields: [],
  };

  const els = {
    datasetMeta: document.getElementById('dataset-meta'),
    pageFieldsPill: document.getElementById('page-fields-pill'),
    idColPill: document.getElementById('id-col-pill'),
    btnPinWindow: document.getElementById('btn-pin-window'),
    countBadge: document.getElementById('count-badge'),
    statusBanner: document.getElementById('status-banner'),
    statusText: document.getElementById('status-text'),
    btnCloseStatus: document.getElementById('btn-close-status'),
    tabs: Array.from(document.querySelectorAll('.tab')),
    panels: Array.from(document.querySelectorAll('.panel')),

    csvDropzone: document.getElementById('csv-dropzone'),
    btnToggleSource: document.getElementById('btn-toggle-source'),
    sourceDrawer: document.getElementById('source-drawer'),

    quickIdWrap: document.getElementById('quick-id-wrap'),
    quickIdInput: document.getElementById('quick-id-input'),
    btnClearQuickId: document.getElementById('btn-clear-quick-id'),
    btnToggleIdMenu: document.getElementById('btn-toggle-id-menu'),
    quickIdMenu: document.getElementById('quick-id-menu'),
    btnQuickFill: document.getElementById('btn-quick-fill'),
    searchInput: document.getElementById('search-input'),
    recordsFilterCount: document.getElementById('records-filter-count'),
    recordsContainer: document.getElementById('records-container'),

    csvFileInput: document.getElementById('csv-file-input'),
    btnChooseFile: document.getElementById('btn-choose-file'),
    btnLoadSample: document.getElementById('btn-load-sample'),
    btnClearData: document.getElementById('btn-clear-data'),
    pasteCsv: document.getElementById('paste-csv'),
    btnParsePaste: document.getElementById('btn-parse-paste'),
    idColumnSelect: document.getElementById('id-column-select'),

    configDetails: document.getElementById('config-details'),
    configBadge: document.getElementById('config-badge'),
    btnRefreshFields: document.getElementById('btn-refresh-fields'),
    defaultsCount: document.getElementById('defaults-count'),
    defaultTargetField: document.getElementById('default-target-field'),
    defaultFieldValue: document.getElementById('default-field-value'),
    defaultValueSuggestions: document.getElementById('default-value-suggestions'),
    btnAddDefault: document.getElementById('btn-add-default'),
    defaultsList: document.getElementById('defaults-list'),
    btnFillDefaultsOnly: document.getElementById('btn-fill-defaults-only'),

    mapCsvCol: document.getElementById('map-csv-col'),
    mapTargetField: document.getElementById('map-target-field'),
    btnAddMapping: document.getElementById('btn-add-mapping'),
    btnApplyAchievementPreset: document.getElementById('btn-apply-achievement-preset'),
    mappingsList: document.getElementById('mappings-list'),

    btnCopyConfig: document.getElementById('btn-copy-config'),
    btnToggleImportConfig: document.getElementById('btn-toggle-import-config'),
    importConfigDrawer: document.getElementById('import-config-drawer'),
    importConfigInput: document.getElementById('import-config-input'),
    btnImportConfigMerge: document.getElementById('btn-import-config-merge'),
    btnImportConfigReplace: document.getElementById('btn-import-config-replace'),

    rndOverwrite: document.getElementById('rnd-overwrite'),
    rndIncludeHidden: document.getElementById('rnd-include-hidden'),
    btnRandomFill: document.getElementById('btn-random-fill'),
    btnRandomInspect: document.getElementById('btn-random-inspect'),
    randomCount: document.getElementById('random-count'),
    btnRandomRerollAll: document.getElementById('btn-random-reroll-all'),
    btnRandomApplyPreview: document.getElementById('btn-random-apply-preview'),
    randomPreviewList: document.getElementById('random-preview-list'),
  };

  let quickIdHighlightIdx = -1;
  let quickIdFilteredList = [];

  /* ========================================================================
   * UI Feedback, Animations & Tab Switching
   * ======================================================================== */

  function restartAnimationClass(el, className) {
    if (!el || !el.classList) return;
    el.classList.remove(className);
    if (typeof el.offsetWidth === 'number') {
      void el.offsetWidth;
    }
    el.classList.add(className);
  }

  function showStatus(type, msg) {
    const cls = type === 'import' ? 'import-success' : type === 'ok' ? 'ok' : 'err';
    els.statusBanner.className = 'banner hidden';
    if (typeof els.statusBanner.offsetWidth === 'number') {
      void els.statusBanner.offsetWidth;
    }
    els.statusBanner.className = `banner ${cls}`;
    els.statusText.textContent = msg;
    els.statusBanner.classList.remove('hidden');
  }

  function hideStatus() {
    els.statusBanner.classList.add('hidden');
  }

  function flashButton(btn, tempText) {
    if (!btn) return;
    const prev = btn.textContent;
    btn.textContent = tempText;
    setTimeout(() => {
      btn.textContent = prev;
    }, LIMITS.STATUS_FLASH_MS);
  }

  function switchTab(tabName, opts) {
    const targetTab = tabName === 'csv' ? 'csv' : 'random';
    els.tabs.forEach((t) => {
      const isActive = t.dataset.tab === targetTab;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', String(isActive));
    });
    els.panels.forEach((p) => p.classList.toggle('active', p.id === `panel-${targetTab}`));
    if (!opts || !opts.skipPersist) {
      Promise.resolve(chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_TAB]: targetTab })).catch(() => {});
    }
  }

  /* ========================================================================
   * Storage & Config Sharing
   * ======================================================================== */

  async function saveState() {
    await chrome.storage.local.set({
      [STORAGE_KEYS.DATASET]: {
        headers: state.headers,
        idColumn: state.idColumn,
        records: state.records,
        mappings: state.mappings,
        fileName: state.fileName,
      },
    });
  }

  async function saveDefaults() {
    await chrome.storage.local.set({ [STORAGE_KEYS.DEFAULTS]: state.defaultFields });
  }

  function sanitizeConfigDict(obj) {
    const clean = {};
    if (!obj || typeof obj !== 'object') return clean;
    if (Array.isArray(obj)) {
      obj.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const rawKey = item.field ?? item.key ?? item.target ?? item.name;
        const rawVal = item.value ?? item.defaultValue ?? item.val;
        const key = String(rawKey || '').trim();
        if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') return;
        if (rawVal === undefined || rawVal === null || typeof rawVal === 'object') return;
        clean[key] = String(rawVal);
      });
      return clean;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const key = String(k || '').trim();
      if (!key || v === undefined || v === null) continue;
      if (typeof v === 'object') {
        if (!Array.isArray(v) && v.value !== undefined && v.value !== null && typeof v.value !== 'object') {
          clean[key] = String(v.value);
        }
        continue;
      }
      clean[key] = String(v);
    }
    return clean;
  }

  function buildShareableConfigPayload() {
    return {
      type: 'csv-autofiller-config',
      version: 1,
      exportedAt: new Date().toISOString(),
      defaultFields: { ...state.defaultFields },
      mappings: { ...state.mappings },
    };
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (_) {
        // Fallback to textarea selection below
      }
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (!ok) {
      throw new Error('Clipboard access denied.');
    }
  }

  async function copyCurrentConfig() {
    const defCount = Object.keys(state.defaultFields).length;
    const mapCount = Object.keys(state.mappings).length;
    if (defCount === 0 && mapCount === 0) {
      showStatus('err', 'No default fields or mappings to copy yet.');
      return;
    }
    try {
      await copyTextToClipboard(JSON.stringify(buildShareableConfigPayload(), null, 2));
      flashButton(els.btnCopyConfig, '✓ Copied');
      showStatus('ok', `Copied ${defCount} default(s) and ${mapCount} mapping(s) to clipboard.`);
    } catch (err) {
      showStatus('err', `Could not copy data: ${err.message}`);
    }
  }

  function cleanPastedJsonText(rawText) {
    let text = String(rawText || '').trim();
    const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenceMatch) {
      text = fenceMatch[1].trim();
    }
    return text
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
  }

  function parseJsonLenient(rawText) {
    const cleaned = cleanPastedJsonText(rawText);
    try {
      return JSON.parse(cleaned);
    } catch (_) {
      const noTrailingCommas = cleaned.replace(/,(\s*[}\]])/g, '$1');
      return JSON.parse(noTrailingCommas);
    }
  }

  function parseSharedConfigText(rawText) {
    let parsed;
    try {
      parsed = parseJsonLenient(rawText);
    } catch (_) {
      throw new Error('Invalid JSON format. Paste the exact copied config text.');
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Config must be a JSON object.');
    }

    if (Array.isArray(parsed)) {
      const defaultFields = sanitizeConfigDict(parsed);
      if (Object.keys(defaultFields).length === 0) {
        throw new Error('No valid default fields found in pasted array.');
      }
      return { defaultFields, mappings: {}, hasDefaultsSection: true, hasMappingsSection: false };
    }

    const rawDefaults = parsed.defaultFields ?? parsed.defaults ?? parsed.default_fields;
    const rawMappings = parsed.mappings ?? parsed.fieldMappings ?? parsed.customMappings;
    const hasDefaultsSection = rawDefaults !== undefined;
    const hasMappingsSection = rawMappings !== undefined;

    let defaultFields;
    let mappings;
    if (hasDefaultsSection || hasMappingsSection) {
      defaultFields = sanitizeConfigDict(rawDefaults);
      mappings = sanitizeConfigDict(rawMappings);
    } else {
      // Support pasting a flat { "field": "defaultValue" } object directly
      const metaKeys = new Set(['type', 'version', 'exportedAt']);
      const flatCandidate = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (!metaKeys.has(k)) flatCandidate[k] = v;
      }
      defaultFields = sanitizeConfigDict(flatCandidate);
      mappings = {};
    }

    if (Object.keys(defaultFields).length === 0 && Object.keys(mappings).length === 0) {
      throw new Error('No valid default fields or mappings found in pasted config.');
    }
    return {
      defaultFields,
      mappings,
      hasDefaultsSection: hasDefaultsSection || Object.keys(defaultFields).length > 0,
      hasMappingsSection,
    };
  }

  async function applyImportedConfig(imported, mode, sourceLabel) {
    if (mode === 'replace') {
      if (imported.hasDefaultsSection) state.defaultFields = imported.defaultFields;
      if (imported.hasMappingsSection) state.mappings = imported.mappings;
    } else {
      state.defaultFields = { ...state.defaultFields, ...imported.defaultFields };
      state.mappings = { ...state.mappings, ...imported.mappings };
    }

    await Promise.all([saveDefaults(), saveState()]);
    renderDefaults();
    renderMappings();
    if (els.configDetails) els.configDetails.open = true;
    els.importConfigInput.value = '';
    els.importConfigDrawer.classList.add('hidden');

    const defImported = Object.keys(imported.defaultFields).length;
    const mapImported = Object.keys(imported.mappings).length;
    const verb = mode === 'replace' ? 'Replaced with' : 'Merged';
    const suffix = sourceLabel ? ` from ${sourceLabel}` : '';
    showStatus('ok', `${verb} ${defImported} default(s) and ${mapImported} mapping(s)${suffix}.`);
    if (els.statusBanner && typeof els.statusBanner.scrollIntoView === 'function') {
      els.statusBanner.scrollIntoView({ block: 'nearest' });
    }
  }

  async function importSharedConfig(mode) {
    const raw = els.importConfigInput.value.trim();
    if (!raw) {
      showStatus('err', 'Paste shared JSON config first.');
      return;
    }
    try {
      const imported = parseSharedConfigText(raw);
      await applyImportedConfig(imported, mode, '');
    } catch (err) {
      showStatus('err', err.message);
      if (els.statusBanner && typeof els.statusBanner.scrollIntoView === 'function') {
        els.statusBanner.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  function tryParseConfigJson(rawText) {
    const trimmed = cleanPastedJsonText(rawText);
    if (!trimmed.startsWith('{')) return null;
    try {
      const parsed = parseJsonLenient(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const isExplicitConfig =
        parsed.type === 'csv-autofiller-config' ||
        Object.prototype.hasOwnProperty.call(parsed, 'defaultFields') ||
        Object.prototype.hasOwnProperty.call(parsed, 'defaults') ||
        Object.prototype.hasOwnProperty.call(parsed, 'default_fields') ||
        Object.prototype.hasOwnProperty.call(parsed, 'mappings');
      if (!isExplicitConfig) return null;
      return parseSharedConfigText(trimmed);
    } catch (_) {
      return null;
    }
  }

  async function loadState() {
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.DATASET,
      STORAGE_KEYS.DEFAULTS,
      STORAGE_KEYS.ACTIVE_TAB,
    ]);
    if (stored[STORAGE_KEYS.DEFAULTS] && typeof stored[STORAGE_KEYS.DEFAULTS] === 'object') {
      state.defaultFields = sanitizeConfigDict(stored[STORAGE_KEYS.DEFAULTS]);
    }

    const savedTab =
      queryTabOverride === 'csv' || queryTabOverride === 'random'
        ? queryTabOverride
        : stored[STORAGE_KEYS.ACTIVE_TAB];
    if (savedTab === 'csv' || savedTab === 'random') {
      switchTab(savedTab, { skipPersist: true });
    }

    if (isPinnedWindow && typeof document !== 'undefined' && document.body && document.body.classList) {
      document.body.classList.add('is-pinned-window');
    }

    if (els.btnPinWindow && isPinnedWindow) {
      els.btnPinWindow.classList.add('hidden');
    }

    const data = stored[STORAGE_KEYS.DATASET];
    if (data && Array.isArray(data.records)) {
      applyDataset({
        headers: data.headers || [],
        idColumn: data.idColumn || '',
        records: data.records || [],
        mappings: data.mappings || {},
        fileName: data.fileName || '',
        skipPersist: true,
      });
    } else {
      renderAll();
    }

    if (isPinnedWindow && queryActionHint === 'upload') {
      showStatus('ok', 'Stay-open mode ready — click Upload File or drop a file below.');
    }
  }

  /* ========================================================================
   * Dataset Parsing & Import
   * ======================================================================== */

  function buildPresetMappingsForHeaders(headers) {
    const preset = {};
    if (!Array.isArray(headers)) return preset;
    headers.forEach((h) => {
      if (Object.prototype.hasOwnProperty.call(ACHIEVEMENT_PRESET_MAPPINGS, h)) {
        preset[h] = ACHIEVEMENT_PRESET_MAPPINGS[h];
      }
    });
    return preset;
  }

  function applyDataset(opts) {
    const headers = Array.isArray(opts.headers) ? opts.headers : [];
    const records = Array.isArray(opts.records) ? opts.records : [];
    const idColumn =
      opts.idColumn && headers.includes(opts.idColumn)
        ? opts.idColumn
        : window.CSVParser.detectIdColumn(headers);
    const indexed = window.CSVParser.buildIndex(records, idColumn);

    let nextMappings = opts.mappings !== undefined ? opts.mappings : state.mappings;
    if (
      (!nextMappings || Object.keys(nextMappings).length === 0) &&
      (headers.includes('Achevement Name') || headers.includes('Achievement Name'))
    ) {
      nextMappings = buildPresetMappingsForHeaders(headers);
    }

    state.headers = headers;
    state.idColumn = idColumn;
    state.records = records;
    state.indexById = indexed.indexById;
    state.mappings = nextMappings || {};
    state.fileName = opts.fileName || '';

    if (!opts.skipPersist) {
      saveState();
    }
    renderAll();
  }

  function applyParsedDataset(parsed, fileName) {
    if (
      !parsed ||
      !Array.isArray(parsed.headers) ||
      parsed.headers.length === 0 ||
      !Array.isArray(parsed.records) ||
      parsed.records.length === 0
    ) {
      showStatus('err', (parsed && parsed.warnings && parsed.warnings[0]) || 'No tabular rows found in file.');
      return;
    }
    switchTab('csv');
    applyDataset({
      headers: parsed.headers,
      idColumn: parsed.idColumn,
      records: parsed.records,
      mappings: {},
      fileName: fileName || 'uploaded',
    });
    els.sourceDrawer.classList.add('hidden');
    els.btnToggleSource.textContent = 'More ▾';
    if (els.csvDropzone && els.csvDropzone.classList) {
      els.csvDropzone.classList.remove('is-importing');
      restartAnimationClass(els.csvDropzone, 'import-done');
    }
    restartAnimationClass(els.countBadge, 'badge-pop');
    restartAnimationClass(els.recordsContainer, 'imported-flash');
    showStatus('import', `✓ Data Imported! ${parsed.records.length} record(s) from ${fileName || 'file'}.`);
  }

  async function parseAndApplyCsv(rawText, fileName) {
    const configImport = tryParseConfigJson(rawText);
    if (configImport) {
      switchTab('csv');
      await applyImportedConfig(configImport, 'merge', fileName || 'pasted config');
      return;
    }
    let parsed;
    if (window.FileImporter && typeof window.FileImporter.parseTextToMatrix === 'function') {
      const matrix = window.FileImporter.parseTextToMatrix(rawText);
      parsed = window.FileImporter.matrixToDataset(matrix);
    } else {
      parsed = window.CSVParser.parseCSV(rawText);
    }
    applyParsedDataset(parsed, fileName || 'pasted');
  }

  function setImportingVisual(isImporting) {
    if (els.csvDropzone && els.csvDropzone.classList) {
      els.csvDropzone.classList.toggle('is-importing', isImporting);
    }
    if (els.btnChooseFile) {
      els.btnChooseFile.disabled = isImporting;
      els.btnChooseFile.textContent = isImporting ? 'Importing...' : 'Upload File';
    }
  }

  async function readCsvFile(file) {
    if (!file) return;
    setImportingVisual(true);
    try {
      const lowerName = String(file.name || '').toLowerCase();
      if (lowerName.endsWith('.json') || file.type === 'application/json') {
        const text =
          typeof file.text === 'function'
            ? await file.text()
            : await new Response(file).text();
        const configImport = tryParseConfigJson(text);
        if (configImport) {
          switchTab('csv');
          await applyImportedConfig(configImport, 'merge', file.name);
          return;
        }
      }
      if (window.FileImporter && typeof window.FileImporter.importFile === 'function') {
        const parsed = await window.FileImporter.importFile(file);
        applyParsedDataset(parsed, file.name);
        return;
      }
      await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          parseAndApplyCsv(String(reader.result || ''), file.name);
          resolve();
        };
        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.readAsText(file);
      });
    } catch (err) {
      showStatus('err', `Could not import "${file.name}": ${err.message}`);
    } finally {
      setImportingVisual(false);
    }
  }

  /* ========================================================================
   * Rendering (Header, Quick ID Combobox, Selectors, Records, Config, Random)
   * ======================================================================== */

  function normalizeColKey(header) {
    if (window.CSVParser && typeof window.CSVParser.normalizeHeaderKey === 'function') {
      return window.CSVParser.normalizeHeaderKey(header);
    }
    return String(header || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function selectPreviewHeaders(headers, idColumn) {
    const candidates = (headers || []).filter((h) => h && h !== idColumn);
    if (candidates.length <= 4) return candidates;

    const picked = [];
    const pickedSet = new Set();
    const byNorm = new Map();
    candidates.forEach((h) => {
      const nk = normalizeColKey(h);
      if (nk && !byNorm.has(nk)) byNorm.set(nk, h);
    });

    const hasGameCol = () => picked.some((p) => normalizeColKey(p).includes('game'));
    const hasTierCol = () => picked.some((p) => normalizeColKey(p) === 'tier');

    for (const group of PREVIEW_HEADER_PREFERENCE_GROUPS) {
      if (picked.length >= 4) break;
      for (const key of group) {
        const match = byNorm.get(key);
        if (match && !pickedSet.has(match)) {
          if (key === 'category' && hasGameCol()) continue;
          if (key === 'level' && hasTierCol()) continue;
          picked.push(match);
          pickedSet.add(match);
          break;
        }
      }
    }

    for (const h of candidates) {
      if (picked.length >= 4) break;
      if (pickedSet.has(h)) continue;
      const nk = normalizeColKey(h);
      if (nk === 'achievementcategory' && hasGameCol()) continue;
      if (nk === 'level' && hasTierCol()) continue;
      picked.push(h);
      pickedSet.add(h);
    }

    return picked;
  }

  function renderHeader() {
    els.countBadge.textContent = String(state.records.length);
    if (state.records.length === 0) {
      els.datasetMeta.textContent = 'No CSV loaded • Random Fill ready';
      els.idColPill.classList.add('hidden');
    } else {
      els.datasetMeta.textContent = `${state.records.length} row(s)${state.fileName ? ` • ${state.fileName}` : ''}`;
      els.idColPill.textContent = `ID: ${state.idColumn}`;
      els.idColPill.classList.remove('hidden');
    }

    if (state.scannedFields.length > 0) {
      els.pageFieldsPill.textContent = `${state.scannedFields.length} fields`;
      els.pageFieldsPill.classList.remove('hidden');
    } else {
      els.pageFieldsPill.classList.add('hidden');
    }
  }

  function syncQuickIdClearBtn() {
    if (!els.btnClearQuickId || !els.quickIdInput) return;
    const hasVal = Boolean(els.quickIdInput.value);
    els.btnClearQuickId.classList.toggle('hidden', !hasVal);
    if (els.quickIdWrap && els.quickIdWrap.classList) {
      els.quickIdWrap.classList.toggle('has-value', hasVal);
    }
  }

  function hideQuickIdMenu() {
    if (!els.quickIdMenu) return;
    els.quickIdMenu.classList.add('hidden');
    if (els.quickIdWrap && els.quickIdWrap.classList) {
      els.quickIdWrap.classList.remove('menu-open');
    }
    if (els.quickIdInput) {
      els.quickIdInput.setAttribute('aria-expanded', 'false');
    }
    quickIdHighlightIdx = -1;
  }

  function selectQuickIdValue(idVal) {
    if (!els.quickIdInput) return;
    els.quickIdInput.value = idVal;
    syncQuickIdClearBtn();
    hideQuickIdMenu();
  }

  function moveQuickIdHighlight(delta) {
    if (quickIdFilteredList.length === 0 || !els.quickIdMenu) return;
    const len = quickIdFilteredList.length;
    if (delta > 0) {
      quickIdHighlightIdx = (quickIdHighlightIdx + 1) % len;
    } else {
      quickIdHighlightIdx = quickIdHighlightIdx <= 0 ? len - 1 : quickIdHighlightIdx - 1;
    }
    els.quickIdMenu.querySelectorAll('.id-dropdown-item').forEach((el, idx) => {
      const active = idx === quickIdHighlightIdx;
      el.classList.toggle('highlighted', active);
      if (active && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function buildQuickIdMeta(id) {
    const rec = state.indexById[id];
    if (!rec) return '';
    return selectPreviewHeaders(state.headers, state.idColumn)
      .slice(0, 2)
      .map((h) => String(rec[h] ?? '').trim())
      .filter(Boolean)
      .join(' • ');
  }

  function renderQuickIdMenu(showAll) {
    if (!els.quickIdMenu || !els.quickIdInput) return;
    const allIds = Object.keys(state.indexById);
    els.quickIdMenu.innerHTML = '';
    quickIdHighlightIdx = -1;

    const openMenu = () => {
      els.quickIdMenu.classList.remove('hidden');
      if (els.quickIdWrap && els.quickIdWrap.classList) {
        els.quickIdWrap.classList.add('menu-open');
      }
      els.quickIdInput.setAttribute('aria-expanded', 'true');
    };

    const appendEmpty = (text) => {
      const empty = document.createElement('div');
      empty.className = 'id-dropdown-empty';
      empty.textContent = text;
      els.quickIdMenu.appendChild(empty);
      openMenu();
    };

    if (allIds.length === 0) {
      quickIdFilteredList = [];
      appendEmpty('Load a file first to browse IDs.');
      return;
    }

    const currentVal = els.quickIdInput.value.trim();
    const q = showAll ? '' : currentVal.toLowerCase();
    const matches = q ? allIds.filter((id) => id.toLowerCase().includes(q)) : allIds;
    quickIdFilteredList = matches.slice(0, LIMITS.MAX_QUICK_ID_OPTIONS);

    if (quickIdFilteredList.length === 0) {
      appendEmpty(`No ID matches "${currentVal}".`);
      return;
    }

    const head = document.createElement('div');
    head.className = 'id-dropdown-head';
    const leftLbl = document.createElement('span');
    leftLbl.textContent = state.idColumn || 'ID';
    const rightLbl = document.createElement('span');
    rightLbl.textContent = `${quickIdFilteredList.length}${matches.length > LIMITS.MAX_QUICK_ID_OPTIONS ? '+' : ''} option(s)`;
    head.appendChild(leftLbl);
    head.appendChild(rightLbl);
    els.quickIdMenu.appendChild(head);

    const listBox = document.createElement('div');
    listBox.className = 'id-dropdown-list';

    let selectedItemEl = null;
    const fragment = document.createDocumentFragment();
    quickIdFilteredList.forEach((id) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'id-dropdown-item';
      const isSelected = Boolean(currentVal && id === currentVal);
      if (isSelected) {
        item.classList.add('selected');
        selectedItemEl = item;
      }

      const mainSpan = document.createElement('span');
      mainSpan.className = 'id-dropdown-item-main';
      mainSpan.textContent = id;
      item.appendChild(mainSpan);

      const metaText = buildQuickIdMeta(id);
      if (metaText) {
        const metaSpan = document.createElement('span');
        metaSpan.className = 'id-dropdown-item-meta';
        metaSpan.textContent = metaText;
        item.appendChild(metaSpan);
      }

      item.title = metaText ? `${id} (${metaText})` : id;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(isSelected));
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectQuickIdValue(id);
      });
      fragment.appendChild(item);
    });
    listBox.appendChild(fragment);
    els.quickIdMenu.appendChild(listBox);
    openMenu();

    if (selectedItemEl && typeof selectedItemEl.scrollIntoView === 'function') {
      selectedItemEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function renderSelectors() {
    els.idColumnSelect.innerHTML = '';
    els.mapCsvCol.innerHTML = '';
    syncQuickIdClearBtn();

    if (state.headers.length === 0) {
      [els.idColumnSelect, els.mapCsvCol].forEach((sel) => {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Load CSV first...';
        sel.appendChild(opt);
      });
      return;
    }

    state.headers.forEach((h) => {
      const o1 = document.createElement('option');
      o1.value = h;
      o1.textContent = h;
      if (h === state.idColumn) o1.selected = true;
      els.idColumnSelect.appendChild(o1);

      const o2 = document.createElement('option');
      o2.value = h;
      o2.textContent = h;
      els.mapCsvCol.appendChild(o2);
    });
  }

  function renderRecords() {
    els.recordsContainer.innerHTML = '';
    if (state.records.length === 0) {
      els.recordsFilterCount.classList.add('hidden');
      els.recordsContainer.innerHTML =
        '<div class="empty">No data loaded yet. Click <strong>Upload File</strong> or <strong>More ▾ → Load Sample</strong>.</div>';
      return;
    }

    const query = els.searchInput.value.trim().toLowerCase();
    const filtered = query
      ? state.records.filter((row) =>
          Object.values(row).some((val) => String(val).toLowerCase().includes(query))
        )
      : state.records;

    if (query) {
      els.recordsFilterCount.textContent = `${filtered.length}/${state.records.length}`;
      els.recordsFilterCount.classList.remove('hidden');
    } else {
      els.recordsFilterCount.classList.add('hidden');
    }

    if (filtered.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'empty';
      emptyEl.textContent = `No rows match "${query}".`;
      els.recordsContainer.appendChild(emptyEl);
      return;
    }

    const previewHeaders = selectPreviewHeaders(state.headers, state.idColumn);
    const fragment = document.createDocumentFragment();

    filtered.slice(0, LIMITS.MAX_RENDERED_RECORDS).forEach((row, idx) => {
      const rowId = String(row[state.idColumn] ?? '').trim();
      const expandKey = rowId || `__row_${idx}`;
      const isExpanded = state.expandedIds.has(expandKey);

      const card = document.createElement('div');
      card.className = 'record-card';

      const head = document.createElement('div');
      head.className = 'record-head';

      const idLabel = document.createElement('span');
      idLabel.className = 'record-id';
      idLabel.textContent = rowId || '(empty)';
      idLabel.title = `${state.idColumn}: ${rowId || '(empty)'}`;

      const actions = document.createElement('div');
      actions.className = 'record-actions';

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'btn btn-ghost btn-sm';
      toggleBtn.textContent = isExpanded ? 'Hide ▴' : 'Details ▾';
      toggleBtn.addEventListener('click', () => {
        if (state.expandedIds.has(expandKey)) {
          state.expandedIds.delete(expandKey);
        } else {
          state.expandedIds.add(expandKey);
        }
        renderRecords();
      });

      const fillBtn = document.createElement('button');
      fillBtn.type = 'button';
      fillBtn.className = 'btn btn-primary btn-sm';
      fillBtn.textContent = '⚡ Fill';
      fillBtn.disabled = !rowId;
      fillBtn.addEventListener('click', () => fillActiveTabWithRecord(row, rowId, fillBtn));

      actions.appendChild(toggleBtn);
      actions.appendChild(fillBtn);
      head.appendChild(idLabel);
      head.appendChild(actions);
      card.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'record-grid';
      previewHeaders.forEach((h) => {
        const kv = document.createElement('div');
        kv.className = 'kv';
        const strong = document.createElement('strong');
        strong.textContent = `${h}: `;
        kv.appendChild(strong);
        kv.appendChild(document.createTextNode(row[h] ?? ''));
        kv.title = `${h}: ${row[h] ?? ''}`;
        grid.appendChild(kv);
      });
      card.appendChild(grid);

      if (isExpanded) {
        const allBox = document.createElement('div');
        allBox.className = 'record-all-fields';
        state.headers.forEach((h) => {
          const line = document.createElement('div');
          const strong = document.createElement('strong');
          strong.textContent = `${h}: `;
          line.appendChild(strong);
          line.appendChild(document.createTextNode(row[h] ?? ''));
          allBox.appendChild(line);
        });
        card.appendChild(allBox);
      }

      fragment.appendChild(card);
    });

    els.recordsContainer.appendChild(fragment);
  }

  function renderConfigBadge() {
    if (els.configBadge) {
      const total = Object.keys(state.defaultFields).length + Object.keys(state.mappings).length;
      els.configBadge.textContent = String(total);
    }
  }

  function getFieldReference(f) {
    return f.ref || f.wireModel || f.id || f.name || f.label || f.placeholder || '';
  }

  function syncDefaultValueInputType(targetText) {
    const rawTarget = String(targetText || '').trim();
    const rawLower = rawTarget.toLowerCase();
    const clean = normalizeColKey(rawTarget);

    const matchedField = state.scannedFields.find(
      (f) =>
        getFieldReference(f).toLowerCase() === rawLower ||
        (f.wireModel && f.wireModel.toLowerCase() === rawLower) ||
        (f.id && f.id.toLowerCase() === rawLower) ||
        (f.name && f.name.toLowerCase() === rawLower) ||
        (f.label && normalizeColKey(f.label) === clean)
    );

    let nextType = 'text';
    if (matchedField && ['datetime-local', 'date', 'time'].includes(matchedField.type)) {
      nextType = matchedField.type;
    } else if (DATETIME_DEFAULT_KEYS.has(clean)) {
      nextType = 'datetime-local';
    } else if (TIME_DEFAULT_KEYS.has(clean)) {
      nextType = 'time';
    }

    if (els.defaultFieldValue.type !== nextType) {
      els.defaultFieldValue.type = nextType;
    }
    els.defaultFieldValue.placeholder =
      nextType === 'datetime-local' ? 'YYYY-MM-DDTHH:mm' : nextType === 'time' ? 'HH:mm' : 'Default value';

    if (els.defaultValueSuggestions) {
      els.defaultValueSuggestions.innerHTML = '';
      if (nextType === 'text' && matchedField) {
        const suggestions =
          matchedField.options && matchedField.options.length > 0
            ? matchedField.options
            : matchedField.type === 'checkbox'
            ? ['true', 'false']
            : [];
        suggestions.forEach((val) => {
          const opt = document.createElement('option');
          opt.value = val;
          els.defaultValueSuggestions.appendChild(opt);
        });
      }
    }
  }

  function renderTargetFieldSelects() {
    const targets = [els.defaultTargetField, els.mapTargetField];
    const uniqueFields = [];
    const seen = new Set();

    state.scannedFields.forEach((f) => {
      const ref = getFieldReference(f);
      if (!ref || seen.has(ref)) return;
      seen.add(ref);
      uniqueFields.push({ ref, field: f });
    });

    targets.forEach((selectEl) => {
      if (!selectEl) return;
      const prevVal = selectEl.value;
      selectEl.innerHTML = '';

      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = uniqueFields.length > 0 ? '-- Select Page Field --' : '-- Open a form page --';
      selectEl.appendChild(emptyOpt);

      uniqueFields.forEach(({ ref, field }) => {
        const opt = document.createElement('option');
        opt.value = ref;
        const primary = field.label && field.label !== ref ? `${field.label} (${ref})` : ref;
        const suffix = field.section ? ` — ${field.section}` : '';
        opt.textContent = `${primary}${suffix}`;
        selectEl.appendChild(opt);
      });

      if (prevVal && seen.has(prevVal)) {
        selectEl.value = prevVal;
      }
    });

    syncDefaultValueInputType(els.defaultTargetField.value);
  }

  function renderChipList(listEl, entries, separator, emptyMsg, deleteTitle, onDelete) {
    listEl.innerHTML = '';
    if (entries.length === 0) {
      listEl.innerHTML = `<li class="empty-sm">${emptyMsg}</li>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    entries.forEach(([key, val]) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      const c1 = document.createElement('code');
      c1.textContent = key;
      const c2 = document.createElement('code');
      c2.textContent = val;
      label.appendChild(c1);
      label.appendChild(document.createTextNode(separator));
      label.appendChild(c2);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-ghost btn-sm';
      delBtn.textContent = '×';
      delBtn.title = deleteTitle;
      delBtn.addEventListener('click', () => onDelete(key));

      li.appendChild(label);
      li.appendChild(delBtn);
      fragment.appendChild(li);
    });
    listEl.appendChild(fragment);
  }

  function renderDefaults() {
    const entries = Object.entries(state.defaultFields);
    els.defaultsCount.textContent = String(entries.length);
    renderConfigBadge();
    renderChipList(
      els.defaultsList,
      entries,
      ' = ',
      'No default fields added yet.',
      'Remove default field',
      (field) => {
        delete state.defaultFields[field];
        saveDefaults();
        renderDefaults();
      }
    );
  }

  function renderMappings() {
    renderConfigBadge();
    renderChipList(
      els.mappingsList,
      Object.entries(state.mappings),
      ' → ',
      'No custom mappings added.',
      'Remove mapping',
      (csvCol) => {
        delete state.mappings[csvCol];
        saveState();
        renderMappings();
      }
    );
  }

  function renderRandomPreview() {
    els.randomPreviewList.innerHTML = '';
    const items = state.randomPreviewFields;
    els.randomCount.textContent = String(items.length);
    els.btnRandomRerollAll.disabled = items.length === 0;
    els.btnRandomApplyPreview.disabled = items.length === 0;

    if (items.length === 0) {
      els.randomPreviewList.innerHTML =
        '<div class="empty-sm">Click <strong>Fill Page with Random Data</strong> to fill right away, or <strong>Preview Values</strong> to review, edit, or re-roll individual fields first.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'random-item';

      const head = document.createElement('div');
      head.className = 'random-item-head';

      const meta = document.createElement('div');
      meta.className = 'random-item-meta';

      const tagPill = document.createElement('span');
      tagPill.className = 'tag-pill';
      tagPill.textContent = item.type ? `${item.tag}[${item.type}]` : item.tag;

      const title = document.createElement('span');
      title.className = 'field-title';
      title.textContent = item.label || item.name || item.wireModel || item.id || item.placeholder || item.key;
      title.title = [item.label, item.name, item.wireModel, item.id].filter(Boolean).join(' | ');

      meta.appendChild(tagPill);
      meta.appendChild(title);
      head.appendChild(meta);

      if (item.hidden) {
        const hid = document.createElement('span');
        hid.className = 'hint';
        hid.textContent = 'hidden';
        head.appendChild(hid);
      }

      const inputRow = document.createElement('div');
      inputRow.className = 'random-input-row';

      const valInput = document.createElement('input');
      valInput.type = 'text';
      valInput.value = item.randomValue ?? '';
      valInput.addEventListener('input', () => {
        state.randomPreviewFields[index].randomValue = valInput.value;
      });

      const rerollBtn = document.createElement('button');
      rerollBtn.type = 'button';
      rerollBtn.className = 'btn btn-secondary btn-sm';
      rerollBtn.textContent = '↻';
      rerollBtn.title = 'Generate another random value';
      rerollBtn.addEventListener('click', () => rerollSingleRandomField(index));

      inputRow.appendChild(valInput);
      inputRow.appendChild(rerollBtn);

      card.appendChild(head);
      card.appendChild(inputRow);
      fragment.appendChild(card);
    });

    els.randomPreviewList.appendChild(fragment);
  }

  function renderAll() {
    renderHeader();
    renderSelectors();
    renderRecords();
    renderDefaults();
    renderMappings();
    renderTargetFieldSelects();
    renderRandomPreview();
  }

  /* ========================================================================
   * Active Tab Scripting & Form Filling
   * ======================================================================== */

  async function getActiveTab() {
    if (isPinnedWindow && pinnedTabId && chrome.tabs && typeof chrome.tabs.get === 'function') {
      try {
        const specific = await chrome.tabs.get(pinnedTabId);
        if (specific && specific.id) return specific;
      } catch (_) {
        // Fallback to active tab in normal browser window
      }
    }
    if (isPinnedWindow) {
      const [normalTab] = await chrome.tabs.query({ active: true, windowType: 'normal' });
      if (normalTab && normalTab.id) return normalTab;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error('No active browser tab found.');
    }
    return tab;
  }

  async function openPinnedWindow(actionHint) {
    if (!chrome.windows || typeof chrome.windows.create !== 'function') {
      return false;
    }
    const activeTabEl = els.tabs.find((t) => t.classList.contains('active'));
    const currentTabName = activeTabEl ? activeTabEl.dataset.tab : 'csv';
    let targetTabId = '';
    try {
      const tab = await getActiveTab();
      if (tab && tab.id) targetTabId = String(tab.id);
    } catch (_) {
      // Ignore if no active tab
    }
    const params = new URLSearchParams({
      mode: 'window',
      tab: actionHint === 'upload' ? 'csv' : currentTabName,
    });
    if (targetTabId) params.set('tabId', targetTabId);
    if (actionHint) params.set('action', actionHint);
    const route = `${POPUP_ROUTES.POPUP_HTML}?${params.toString()}`;
    const url =
      chrome.runtime && typeof chrome.runtime.getURL === 'function' ? chrome.runtime.getURL(route) : route;
    await chrome.windows.create({
      url,
      type: 'popup',
      width: PINNED_WINDOW_SIZE.WIDTH,
      height: PINNED_WINDOW_SIZE.HEIGHT,
    });
    return true;
  }

  async function ensureContentFillerInjected(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: POPUP_ROUTES.CONTENT_SCRIPTS,
    });
  }

  async function syncSelect2InMainWorld(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        world: 'MAIN',
        func: () => {
          let synced = 0;
          document.querySelectorAll('select[data-csv-filled="1"]').forEach((el) => {
            delete el.dataset.csvFilled;
            if (window.jQuery) {
              const $el = window.jQuery(el);
              if ($el.data('select2') || el.classList.contains('select2-hidden-accessible')) {
                $el.trigger('change');
                $el.trigger('select2:select');
                synced += 1;
              }
            }
          });
          return synced;
        },
      });
      return (results || []).reduce((sum, item) => sum + (Number(item && item.result) || 0), 0);
    } catch (_) {
      return 0;
    }
  }

  function mergeFrameFillResults(results, totals) {
    const acc = totals || { filledCount: 0, totalFields: 0 };
    (results || []).forEach((item) => {
      const r = item && item.result ? item.result : { filledCount: 0, totalFields: 0 };
      acc.filledCount += r.filledCount || 0;
      acc.totalFields = Math.max(acc.totalFields, r.totalFields || 0);
    });
    return acc;
  }

  function mergeFrameArrayResults(results) {
    const merged = [];
    (results || []).forEach((item) => {
      if (Array.isArray(item && item.result)) {
        merged.push(...item.result);
      }
    });
    return merged;
  }

  async function runSelect2FollowUpRounds(tabId, followUpFunc, args, totals, waitMs) {
    let syncedCount = await syncSelect2InMainWorld(tabId);
    for (let round = 0; round < 2 && syncedCount > 0; round += 1) {
      if (waitMs > 0) {
        await new Promise((r) => setTimeout(r, waitMs));
      }
      const followResults = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: followUpFunc,
        args,
      });
      mergeFrameFillResults(followResults, totals);
      syncedCount = await syncSelect2InMainWorld(tabId);
    }
  }

  async function fillActiveTabWithRecord(record, idLabel, triggerBtn) {
    try {
      const tab = await getActiveTab();
      await ensureContentFillerInjected(tab.id);

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: (rec, mappings, defaults) => {
          if (!window.__CSV_EXTENSION_FILLER__) return { filledCount: 0, totalFields: 0 };
          return window.__CSV_EXTENSION_FILLER__.fillPage(rec, mappings, defaults);
        },
        args: [record, state.mappings, state.defaultFields],
      });

      const totals = mergeFrameFillResults(results);
      await runSelect2FollowUpRounds(
        tab.id,
        (rec, mappings, defaults) => {
          if (!window.__CSV_EXTENSION_FILLER__) return { filledCount: 0, totalFields: 0 };
          return window.__CSV_EXTENSION_FILLER__.fillPage(rec, mappings, defaults, {
            onlyEmpty: true,
            waitForAsync: true,
          });
        },
        [record, state.mappings, state.defaultFields],
        totals,
        LIMITS.SELECT2_FOLLOWUP_DELAY_MS
      );

      if (totals.filledCount === 0) {
        showStatus('err', `Found ${totals.totalFields} field(s), filled 0. Check "Defaults & Field Mapping" below.`);
      } else {
        flashButton(triggerBtn, '✓ Filled');
        showStatus('ok', `Filled ${totals.filledCount} field(s) on active page for "${idLabel}".`);
      }
    } catch (err) {
      showStatus('err', `Cannot fill this tab: ${err.message}`);
    }
  }

  function fillByTypedId() {
    const id = els.quickIdInput.value.trim();
    if (!id) {
      showStatus('err', 'Please enter an ID first.');
      return;
    }
    let record = state.indexById[id];
    if (!record) {
      const lower = id.toLowerCase();
      record = state.records.find((r) => String(r[state.idColumn] ?? '').trim().toLowerCase() === lower);
    }
    if (!record) {
      showStatus('err', `No record found for ${state.idColumn || 'ID'} "${id}".`);
      return;
    }
    fillActiveTabWithRecord(record, id, els.btnQuickFill);
  }

  async function scanActivePageFields(opts) {
    const silent = Boolean(opts && opts.silent);
    try {
      const tab = await getActiveTab();
      await ensureContentFillerInjected(tab.id);

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => (window.__CSV_EXTENSION_FILLER__ ? window.__CSV_EXTENSION_FILLER__.scanFields() : []),
      });

      state.scannedFields = mergeFrameArrayResults(results);
      renderHeader();
      renderTargetFieldSelects();
      if (!silent) {
        showStatus('ok', `Refreshed active page fields (${state.scannedFields.length} found).`);
      }
    } catch (err) {
      if (!silent) {
        showStatus('err', `Cannot read fields from this tab: ${err.message}`);
      }
    }
  }

  async function inspectPageForRandom() {
    try {
      const tab = await getActiveTab();
      await ensureContentFillerInjected(tab.id);
      const includeHidden = Boolean(els.rndIncludeHidden.checked);

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: (incHidden) =>
          window.__CSV_EXTENSION_FILLER__ ? window.__CSV_EXTENSION_FILLER__.inspectForRandom(incHidden) : [],
        args: [includeHidden],
      });

      state.randomPreviewFields = mergeFrameArrayResults(results);
      renderRandomPreview();
      showStatus('ok', `Generated random preview for ${state.randomPreviewFields.length} field(s) by tagName & type.`);
    } catch (err) {
      showStatus('err', `Cannot preview this tab: ${err.message}`);
    }
  }

  async function rerollSingleRandomField(index) {
    const item = state.randomPreviewFields[index];
    if (!item) return;
    try {
      const tab = await getActiveTab();
      await ensureContentFillerInjected(tab.id);
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: false },
        func: (descriptor) =>
          window.__CSV_EXTENSION_FILLER__ ? window.__CSV_EXTENSION_FILLER__.generateRandomValue(descriptor) : '',
        args: [item],
      });
      state.randomPreviewFields[index].randomValue = results && results[0] ? results[0].result : '';
      renderRandomPreview();
    } catch (err) {
      showStatus('err', `Could not re-roll field: ${err.message}`);
    }
  }

  async function fillActiveTabRandom(usePreview) {
    try {
      const tab = await getActiveTab();
      await ensureContentFillerInjected(tab.id);

      let previewValues = null;
      if (usePreview && state.randomPreviewFields.length > 0) {
        previewValues = {};
        state.randomPreviewFields.forEach((f) => {
          previewValues[f.key] = f.randomValue;
        });
      }

      const opts = {
        overwrite: Boolean(els.rndOverwrite.checked),
        includeHidden: Boolean(els.rndIncludeHidden.checked),
        previewValues,
      };

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: (randomOpts) =>
          window.__CSV_EXTENSION_FILLER__
            ? window.__CSV_EXTENSION_FILLER__.fillPageRandom(randomOpts)
            : { filledCount: 0, totalFields: 0 },
        args: [opts],
      });

      const totals = mergeFrameFillResults(results);
      await runSelect2FollowUpRounds(
        tab.id,
        (randomOpts) =>
          window.__CSV_EXTENSION_FILLER__
            ? window.__CSV_EXTENSION_FILLER__.sweepEmptyFieldsRandom(randomOpts)
            : { filledCount: 0, totalFields: 0 },
        [opts],
        totals,
        0
      );

      if (totals.filledCount === 0) {
        showStatus('err', `Found ${totals.totalFields} field(s), filled 0.`);
      } else {
        flashButton(usePreview ? els.btnRandomApplyPreview : els.btnRandomFill, '✓ Filled');
        showStatus('ok', `Filled ${totals.filledCount} field(s) with random data on active page.`);
      }
    } catch (err) {
      showStatus('err', `Cannot random-fill this tab: ${err.message}`);
    }
  }

  /* ========================================================================
   * Event Binding & Initialization
   * ======================================================================== */

  function bindEvents() {
    els.btnCloseStatus.addEventListener('click', hideStatus);

    els.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        hideStatus();
        switchTab(tab.dataset.tab);
      });
    });

    els.btnToggleSource.addEventListener('click', () => {
      const isHidden = els.sourceDrawer.classList.toggle('hidden');
      els.btnToggleSource.textContent = isHidden ? 'More ▾' : 'Less ▴';
    });

    els.btnQuickFill.addEventListener('click', () => {
      hideQuickIdMenu();
      fillByTypedId();
    });
    els.quickIdInput.addEventListener('focus', () => renderQuickIdMenu(true));
    els.quickIdInput.addEventListener('click', () => renderQuickIdMenu(true));
    els.quickIdInput.addEventListener('input', () => {
      syncQuickIdClearBtn();
      renderQuickIdMenu(false);
    });
    els.quickIdInput.addEventListener('keydown', (e) => {
      const isMenuOpen = els.quickIdMenu && !els.quickIdMenu.classList.contains('hidden');
      if (e.key === 'ArrowDown' && isMenuOpen) {
        e.preventDefault();
        moveQuickIdHighlight(1);
      } else if (e.key === 'ArrowUp' && isMenuOpen) {
        e.preventDefault();
        moveQuickIdHighlight(-1);
      } else if (e.key === 'Escape') {
        hideQuickIdMenu();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isMenuOpen && quickIdHighlightIdx >= 0 && quickIdFilteredList[quickIdHighlightIdx]) {
          selectQuickIdValue(quickIdFilteredList[quickIdHighlightIdx]);
        } else {
          hideQuickIdMenu();
          fillByTypedId();
        }
      }
    });

    if (els.btnClearQuickId) {
      els.btnClearQuickId.addEventListener('click', () => {
        els.quickIdInput.value = '';
        syncQuickIdClearBtn();
        els.quickIdInput.focus();
        renderQuickIdMenu(true);
      });
    }
    if (els.btnToggleIdMenu) {
      els.btnToggleIdMenu.addEventListener('mousedown', (e) => e.preventDefault());
      els.btnToggleIdMenu.addEventListener('click', () => {
        const isOpen = els.quickIdMenu && !els.quickIdMenu.classList.contains('hidden');
        if (isOpen) {
          hideQuickIdMenu();
        } else {
          els.quickIdInput.focus();
          renderQuickIdMenu(true);
        }
      });
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('mousedown', (e) => {
        if (els.quickIdWrap && els.quickIdWrap.contains && !els.quickIdWrap.contains(e.target)) {
          hideQuickIdMenu();
        }
      });
    }

    els.searchInput.addEventListener('input', renderRecords);

    els.btnChooseFile.addEventListener('click', () => els.csvFileInput.click());
    if (els.btnPinWindow) {
      els.btnPinWindow.addEventListener('click', () => openPinnedWindow(''));
    }
    els.csvFileInput.addEventListener('change', () => {
      const file = els.csvFileInput.files && els.csvFileInput.files[0];
      if (!file) return;
      readCsvFile(file);
      els.csvFileInput.value = '';
    });

    let dragDepth = 0;
    const setDragActive = (active) => {
      if (els.csvDropzone && els.csvDropzone.classList) {
        els.csvDropzone.classList.toggle('drag-over', active);
      }
      if (typeof document !== 'undefined' && document.body && document.body.classList) {
        document.body.classList.toggle('body-drag-active', active);
      }
    };

    const handleDropFile = (e) => {
      e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      dragDepth = 0;
      setDragActive(false);
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        switchTab('csv');
        readCsvFile(file);
      }
    };

    if (els.csvDropzone) {
      els.csvDropzone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        setDragActive(true);
      });
      els.csvDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        setDragActive(true);
      });
      els.csvDropzone.addEventListener('dragleave', (e) => {
        if (!els.csvDropzone.contains(e.relatedTarget)) {
          setDragActive(false);
        }
      });
      els.csvDropzone.addEventListener('drop', handleDropFile);
    }

    if (typeof document !== 'undefined' && document.body && typeof document.body.addEventListener === 'function') {
      document.body.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragDepth += 1;
        setDragActive(true);
      });
      document.body.addEventListener('dragover', (e) => {
        e.preventDefault();
        setDragActive(true);
      });
      document.body.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) setDragActive(false);
      });
      document.body.addEventListener('drop', handleDropFile);
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('paste', (e) => {
        const target = e.target;
        const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable)) {
          return;
        }
        const clip = e.clipboardData;
        if (!clip) return;
        const file = clip.files && clip.files[0];
        if (file) {
          e.preventDefault();
          switchTab('csv');
          readCsvFile(file);
          return;
        }
        const text = typeof clip.getData === 'function' ? clip.getData('text/plain') || clip.getData('text') : '';
        if (
          text &&
          (text.includes('\n') ||
            text.includes('\t') ||
            text.trim().startsWith('[') ||
            text.trim().startsWith('{') ||
            /<table\b/i.test(text))
        ) {
          e.preventDefault();
          switchTab('csv');
          parseAndApplyCsv(text, 'clipboard');
        }
      });
    }

    els.btnLoadSample.addEventListener('click', () => parseAndApplyCsv(SAMPLE_CSV, 'sample.csv'));

    els.btnClearData.addEventListener('click', () => {
      state.headers = [];
      state.idColumn = '';
      state.records = [];
      state.indexById = {};
      state.mappings = {};
      state.fileName = '';
      state.expandedIds.clear();
      if (els.quickIdInput) els.quickIdInput.value = '';
      hideQuickIdMenu();
      saveState();
      renderAll();
      showStatus('ok', 'Cleared saved CSV data.');
    });

    els.btnParsePaste.addEventListener('click', () => {
      const raw = els.pasteCsv.value.trim();
      if (!raw) return;
      parseAndApplyCsv(raw, 'pasted.csv');
      els.pasteCsv.value = '';
    });

    els.idColumnSelect.addEventListener('change', () => {
      const col = els.idColumnSelect.value;
      if (!col || !state.headers.includes(col)) return;
      applyDataset({
        headers: state.headers,
        idColumn: col,
        records: state.records,
        mappings: state.mappings,
        fileName: state.fileName,
      });
      showStatus('ok', `ID column changed to "${col}".`);
    });

    els.btnRefreshFields.addEventListener('click', () => scanActivePageFields({ silent: false }));

    els.btnAddMapping.addEventListener('click', () => {
      const col = els.mapCsvCol.value;
      const target = els.mapTargetField.value.trim();
      if (!col || !target) {
        showStatus('err', 'Select both CSV column and page field.');
        return;
      }
      state.mappings[col] = target;
      els.mapTargetField.value = '';
      saveState();
      renderMappings();
      showStatus('ok', `Mapped "${col}" → "${target}".`);
    });

    els.btnApplyAchievementPreset.addEventListener('click', () => {
      const preset = buildPresetMappingsForHeaders(state.headers);
      state.mappings =
        Object.keys(preset).length > 0 ? { ...state.mappings, ...preset } : { ...ACHIEVEMENT_PRESET_MAPPINGS };
      saveState();
      renderMappings();
      showStatus('ok', `Applied Achievement preset mappings (${Object.keys(state.mappings).length} total).`);
    });

    els.btnCopyConfig.addEventListener('click', copyCurrentConfig);
    els.btnToggleImportConfig.addEventListener('click', () => {
      const isHidden = els.importConfigDrawer.classList.toggle('hidden');
      if (!isHidden) {
        if (typeof els.importConfigDrawer.scrollIntoView === 'function') {
          els.importConfigDrawer.scrollIntoView({ block: 'nearest' });
        }
        els.importConfigInput.focus();
      }
    });
    els.btnImportConfigMerge.addEventListener('click', () => importSharedConfig('merge'));
    els.btnImportConfigReplace.addEventListener('click', () => importSharedConfig('replace'));

    const addDefaultEntry = () => {
      const target = els.defaultTargetField.value.trim();
      const val = els.defaultFieldValue.value.trim();
      if (!target || !val) {
        showStatus('err', 'Select a page field and enter its default value.');
        return;
      }
      state.defaultFields[target] = val;
      els.defaultTargetField.value = '';
      els.defaultFieldValue.value = '';
      syncDefaultValueInputType('');
      saveDefaults();
      renderDefaults();
      showStatus('ok', `Saved default "${target}" = "${val}".`);
    };

    els.defaultTargetField.addEventListener('change', () => {
      syncDefaultValueInputType(els.defaultTargetField.value);
    });
    els.btnAddDefault.addEventListener('click', addDefaultEntry);
    els.defaultFieldValue.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addDefaultEntry();
      }
    });

    els.btnFillDefaultsOnly.addEventListener('click', () => {
      if (Object.keys(state.defaultFields).length === 0) {
        showStatus('err', 'Add at least one default field first.');
        return;
      }
      fillActiveTabWithRecord({}, 'Default Fields', els.btnFillDefaultsOnly);
    });

    els.btnRandomFill.addEventListener('click', () => fillActiveTabRandom(false));
    els.btnRandomInspect.addEventListener('click', inspectPageForRandom);
    els.btnRandomRerollAll.addEventListener('click', inspectPageForRandom);
    els.btnRandomApplyPreview.addEventListener('click', () => fillActiveTabRandom(true));
  }

  bindEvents();
  loadState().then(() => scanActivePageFields({ silent: true }));
})();
