(function () {
  'use strict';

  const IGNORED_INPUT_TYPES = new Set([
    'hidden',
    'submit',
    'button',
    'reset',
    'file',
    'image',
    'search',
  ]);
  const TRUTHY = new Set(['true', '1', 'yes', 'y', 'on', 'active', 'checked']);
  const FALSY = new Set(['false', '0', 'no', 'n', 'off', 'inactive', 'unchecked', '']);

  const SELECT_ALIASES = {
    ludoclassic: 'cittaludo',
    cittaludo: 'ludoclassic',
    xoxo: 'xoxopro',
    breezyblock: 'breezyblockspuzzle',
    brezzyblock: 'breezyblockspuzzle',
    '8ballpool': '8ballpoll',
    discfootball: 'frisbeefootball',
    discfootballer: 'frisbeefootball',
    playgame: 'gameplay',
    wingame: 'gamewin',
    losegame: 'gameloss',
    lossgame: 'gameloss',
    drawgame: 'gamedraw',
  };

  function normalizeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function tokenize(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      let diag = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const temp = prev[j];
        if (a[i - 1] === b[j - 1]) {
          prev[j] = diag;
        } else {
          prev[j] = 1 + Math.min(diag, prev[j], prev[j - 1]);
        }
        diag = temp;
      }
    }
    return prev[b.length];
  }

  function isTruthyValue(raw) {
    const clean = String(raw ?? '').trim().toLowerCase();
    if (TRUTHY.has(clean)) return true;
    if (FALSY.has(clean)) return false;
    return Boolean(clean);
  }

  function normalizeDateValue(raw) {
    const str = String(raw ?? '').trim();
    if (!str) return '';
    const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (iso) {
      return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    }
    const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      const a = Number(dmy[1]);
      const b = Number(dmy[2]);
      const month = a > 12 && b <= 12 ? b : a;
      const day = a > 12 && b <= 12 ? a : b;
      return `${dmy[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return str;
  }

  function normalizeTimeValue(raw) {
    const str = String(raw ?? '').trim();
    if (!str) return '';
    const ampm = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)$/i);
    if (ampm) {
      let hour = Number(ampm[1]);
      const min = ampm[2];
      const period = ampm[3].toLowerCase();
      if (period === 'pm' && hour < 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;
      return `${String(hour).padStart(2, '0')}:${min}`;
    }
    const hm = str.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
    if (hm) {
      return `${hm[1].padStart(2, '0')}:${hm[2].padStart(2, '0')}`;
    }
    return str;
  }

  function normalizeDateTimeLocalValue(raw, defaultTime) {
    const str = String(raw ?? '').trim();
    if (!str) return '';

    const lower = str.toLowerCase();
    if (lower === 'now' || lower === 'today') {
      return formatDateTimeLocal(new Date());
    }
    const relDays = lower.match(/^\+(\d+)\s*d(?:ays?)?$/);
    if (relDays) {
      const d = new Date();
      d.setDate(d.getDate() + Number(relDays[1]));
      return formatDateTimeLocal(d);
    }

    const fallbackTime = defaultTime || '00:00';
    const parseClock = (hStr, mStr, ampmStr) => {
      let hour = Number(hStr);
      if (ampmStr) {
        const p = ampmStr.toLowerCase();
        if (p === 'pm' && hour < 12) hour += 12;
        if (p === 'am' && hour === 12) hour = 0;
      }
      return `${String(hour).padStart(2, '0')}:${String(mStr).padStart(2, '0')}`;
    };

    // YYYY-MM-DD or YYYY/MM/DD with optional time + AM/PM
    const iso = str.match(
      /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s,]+(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(am|pm))?)?/i
    );
    if (iso) {
      const datePart = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
      const timePart = iso[4] ? parseClock(iso[4], iso[5], iso[6]) : fallbackTime;
      return `${datePart}T${timePart}`;
    }

    // DD/MM/YYYY or MM/DD/YYYY with optional time + AM/PM
    const dmy = str.match(
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[T\s,]+(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(am|pm))?)?/i
    );
    if (dmy) {
      const a = Number(dmy[1]);
      const b = Number(dmy[2]);
      const month = a > 12 && b <= 12 ? b : a;
      const day = a > 12 && b <= 12 ? a : b;
      const datePart = `${dmy[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const timePart = dmy[4] ? parseClock(dmy[4], dmy[5], dmy[6]) : fallbackTime;
      return `${datePart}T${timePart}`;
    }

    // Fallback: JS Date.parse for formats like "Nov 26, 2026 6:30 PM"
    const parsedMs = Date.parse(str);
    if (!Number.isNaN(parsedMs)) {
      return formatDateTimeLocal(new Date(parsedMs));
    }

    return str;
  }

  function setNativeValue(element, value) {
    const proto = Object.getPrototypeOf(element);
    const descriptor =
      Object.getOwnPropertyDescriptor(proto, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function setNativeChecked(element, checked) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(element, Boolean(checked));
    } else {
      element.checked = Boolean(checked);
    }
  }

  function dispatchEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  const highlightState = new WeakMap();

  function highlightElement(element) {
    if (!element || !element.style) return;
    let saved = highlightState.get(element);
    if (!saved) {
      saved = {
        outline: element.style.outline || '',
        backgroundColor: element.style.backgroundColor || '',
        timerId: null,
      };
      highlightState.set(element, saved);
    } else if (saved.timerId) {
      clearTimeout(saved.timerId);
    }

    element.style.outline = '2px solid #10b981';
    element.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
    saved.timerId = setTimeout(() => {
      if (saved.outline) {
        element.style.outline = saved.outline;
      } else if (typeof element.style.removeProperty === 'function') {
        element.style.removeProperty('outline');
      } else {
        element.style.outline = '';
      }

      if (saved.backgroundColor) {
        element.style.backgroundColor = saved.backgroundColor;
      } else if (typeof element.style.removeProperty === 'function') {
        element.style.removeProperty('background-color');
      } else {
        element.style.backgroundColor = '';
      }

      highlightState.delete(element);
    }, 1600);
  }

  function getWireModel(element) {
    if (!element || !element.attributes) return '';
    for (let i = 0; i < element.attributes.length; i += 1) {
      const attr = element.attributes[i];
      if (attr.name === 'wire:model' || attr.name.startsWith('wire:model.')) {
        return attr.value.trim();
      }
    }
    return '';
  }

  function cleanLabelText(text) {
    return String(text || '')
      .replace(/\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getAssociatedLabels(element) {
    const texts = [];
    if (element.labels && element.labels.length > 0) {
      for (const lbl of element.labels) {
        if (lbl.textContent) texts.push(lbl.textContent);
      }
    }

    if (element.id) {
      try {
        const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(element.id) : element.id;
        document.querySelectorAll(`label[for="${escaped}"]`).forEach((lbl) => {
          if (lbl.textContent) texts.push(lbl.textContent);
        });
      } catch (_) {
        // Ignore invalid selector characters
      }
    }

    const parentLabel = element.closest('label');
    if (parentLabel && parentLabel.textContent) {
      texts.push(parentLabel.textContent);
    }

    // Walk up up to 4 ancestor containers (supports Bootstrap col-md-*, mb-3, row, MUI, AntD, Tailwind)
    let ancestor = element.parentElement;
    for (let depth = 0; depth < 4 && ancestor; depth += 1) {
      const inputsInBox = ancestor.querySelectorAll('input:not([type="hidden"]), select, textarea');
      if (inputsInBox.length > 1) break;
      if (inputsInBox.length === 1) {
        const boxLabels = Array.from(ancestor.querySelectorAll('label'));
        if (boxLabels.length > 0) {
          boxLabels.forEach((lbl) => {
            if (lbl.textContent) texts.push(lbl.textContent);
          });
          break;
        }
      }
      ancestor = ancestor.parentElement;
    }

    return Array.from(new Set(texts.map(cleanLabelText).filter(Boolean)));
  }

  function getElementMatchKeys(element) {
    const raw = [];
    const dataField = element.getAttribute('data-csv-field');
    if (dataField) raw.push(dataField);
    const wireModel = getWireModel(element);
    if (wireModel) raw.push(wireModel);
    const elemName = element.name || (typeof element.getAttribute === 'function' ? element.getAttribute('name') : '') || '';
    if (elemName) raw.push(elemName);
    if (element.id) raw.push(element.id);
    const aria = element.getAttribute('aria-label');
    if (aria) raw.push(aria);
    if (element.placeholder) raw.push(element.placeholder);
    raw.push(...getAssociatedLabels(element));
    return Array.from(new Set(raw.map(normalizeKey).filter(Boolean)));
  }

  function isWidgetInternalControl(el) {
    if (!el) return true;
    if (
      el.classList &&
      (el.classList.contains('select2-search__field') ||
        el.classList.contains('select2-focusser') ||
        el.classList.contains('tagify__input'))
    ) {
      return true;
    }
    if (el.closest && el.closest('#csv-autofill-widget, .select2-container, .cropper-container')) {
      return true;
    }
    return false;
  }

  const CHROME_CONTAINER_SELECTOR = [
    'nav',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="search"]',
    '[role="contentinfo"]',
    '[role="menubar"]',
    '[role="toolbar"]',
    '.navbar',
    '.nav-bar',
    '.topbar',
    '.top-bar',
    '.app-header',
    '.app-footer',
    '.main-header',
    '.main-footer',
    '.breadcrumb',
    '.pagination',
    '.pager',
    '.dataTables_length',
    '.dataTables_filter',
    '.dataTables_paginate',
    '.dt-length',
    '.dt-search',
    '.dt-paging',
  ].join(', ');

  const SIDEBAR_CLASS_SELECTOR = [
    '[role="complementary"]',
    '.sidebar',
    '.main-sidebar',
    '.side-nav',
    '.sidenav',
    '.app-sidebar',
  ].join(', ');

  function isNonFormChromeElement(el) {
    if (!el || !el.closest) return false;
    if (el.closest(CHROME_CONTAINER_SELECTOR)) return true;
    const headerOrFooter = el.closest('header, footer');
    if (headerOrFooter) {
      const enclosingForm = el.form || el.closest('form');
      if (!enclosingForm || !enclosingForm.contains || !enclosingForm.contains(headerOrFooter)) {
        return true;
      }
    }
    if (!el.closest('[role="dialog"], .modal.show, .modal.in, dialog[open]')) {
      if (el.closest(SIDEBAR_CLASS_SELECTOR)) return true;
      const aside = el.closest('aside');
      if (aside) {
        const enclosingForm = el.form || el.closest('form');
        const asideHasForm =
          enclosingForm &&
          aside.contains &&
          aside.contains(enclosingForm) &&
          enclosingForm.querySelectorAll &&
          enclosingForm.querySelectorAll('input, select, textarea').length >= 2;
        if (!asideHasForm) return true;
      }
    }
    return false;
  }

  function isNavigationalControl(el) {
    if (!el || typeof el.getAttribute !== 'function') return false;
    const onChange = String(el.getAttribute('onchange') || '');
    const onInput = String(el.getAttribute('oninput') || '');
    const combined = `${onChange} ${onInput}`;
    return /\b(window\.location|location\.href|location\.assign|location\.replace|\.submit\s*\()/i.test(combined);
  }

  function isInInactiveSubtree(el) {
    if (!el || !el.closest) return false;
    if (el.closest('[inert], dialog:not([open]), .modal:not(.show)')) return true;
    const isSelect2Hidden =
      el.tagName &&
      el.tagName.toLowerCase() === 'select' &&
      el.classList &&
      el.classList.contains('select2-hidden-accessible');
    const ariaCheckNode = isSelect2Hidden ? el.parentElement : el;
    if (ariaCheckNode && ariaCheckNode.closest && ariaCheckNode.closest('[aria-hidden="true"]')) {
      return true;
    }
    return false;
  }

  function isDisallowedSubframe() {
    if (typeof window === 'undefined' || !window.top || window === window.top) return false;
    try {
      if (typeof window.innerWidth === 'number' && window.innerWidth < 80) return true;
      if (typeof window.innerHeight === 'number' && window.innerHeight < 80) return true;
      if (window.frameElement && isElementHidden(window.frameElement)) return true;
    } catch (_) {
      // Cross-origin frameElement access can throw SecurityError
    }
    return false;
  }

  function isSearchLikeControl(el) {
    if (!el) return false;
    const type = String(el.type || '').toLowerCase();
    if (type === 'search') return true;
    const descriptor = `${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${
      typeof el.getAttribute === 'function' ? el.getAttribute('aria-label') || '' : ''
    }`.trim();
    return /^(q|query|search|keyword|keywords|filter)$/i.test(descriptor.trim());
  }

  function isExcludedForm(form) {
    if (!form) return true;
    if (form.closest && form.closest('#csv-autofill-widget')) return true;
    if (isNonFormChromeElement(form)) return true;
    if (isInInactiveSubtree(form)) return true;
    if (isElementHidden(form)) return true;

    const role = typeof form.getAttribute === 'function' ? String(form.getAttribute('role') || '').toLowerCase() : '';
    if (role === 'search') return true;

    const formMeta = `${form.id || ''} ${form.name || ''} ${form.className || ''} ${
      typeof form.getAttribute === 'function' ? form.getAttribute('action') || '' : ''
    }`;
    if (/\b(logout|signout|sign-out|log-out)\b/i.test(formMeta)) return true;

    if (!form.querySelectorAll) return false;
    const controls = Array.from(form.querySelectorAll('input, select, textarea')).filter((ctrl) => {
      if (ctrl.disabled) return false;
      if (ctrl.readOnly && !isFakeReadOnlyTrap(ctrl)) return false;
      const tag = ctrl.tagName.toLowerCase();
      if (tag === 'input') {
        const type = String(ctrl.type || 'text').toLowerCase();
        if (IGNORED_INPUT_TYPES.has(type) && type !== 'search') return false;
      }
      return true;
    });

    if (controls.length === 0) return true;

    const visibleControls = controls.filter((ctrl) => !isElementHidden(ctrl));
    if (visibleControls.length === 1 && isSearchLikeControl(visibleControls[0])) {
      return true;
    }

    const method = String((typeof form.getAttribute === 'function' ? form.getAttribute('method') : '') || 'get').toLowerCase();
    if (method === 'get' && visibleControls.length <= 2 && /\b(search|filter)\b/i.test(formMeta)) {
      return true;
    }

    return false;
  }

  function getActiveModalRoot() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return null;
    const modals = Array.from(
      document.querySelectorAll('dialog[open], .modal.show, .modal.in, [role="dialog"]:not(.hidden):not(.d-none)')
    ).filter((modal) => !isElementHidden(modal) && !isInInactiveSubtree(modal));

    for (let i = modals.length - 1; i >= 0; i -= 1) {
      const modal = modals[i];
      if (!modal.querySelectorAll) continue;
      const hasControls = Array.from(modal.querySelectorAll('input, select, textarea')).some((el) => {
        if (el.disabled) return false;
        if (el.readOnly && !isFakeReadOnlyTrap(el)) return false;
        if (el.tagName.toLowerCase() === 'input') {
          const type = String(el.type || 'text').toLowerCase();
          if (IGNORED_INPUT_TYPES.has(type)) return false;
        }
        return !isElementHidden(el);
      });
      if (hasControls) return modal;
    }
    return null;
  }

  function getEligibleForms(scopeRoot) {
    const root = scopeRoot || document;
    if (!root || !root.querySelectorAll) return [];
    return Array.from(root.querySelectorAll('form')).filter((form) => !isExcludedForm(form));
  }

  function isSafeContentEditable(el, activeModal, eligibleForms, mainRoot) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.getAttribute && el.getAttribute('aria-readonly') === 'true') return false;
    if (isWidgetInternalControl(el) || isNonFormChromeElement(el) || isInInactiveSubtree(el)) return false;
    if (isNavigationalControl(el)) return false;

    if (activeModal) {
      if (!activeModal.contains || !activeModal.contains(el)) return false;
    } else if (eligibleForms.length > 0) {
      if (!eligibleForms.some((f) => f.contains && f.contains(el))) return false;
    } else {
      if (isDisallowedSubframe() || (typeof window !== 'undefined' && window.top && window !== window.top)) {
        return false;
      }
      if (mainRoot && mainRoot.contains && !mainRoot.contains(el)) return false;
      const role = el.getAttribute ? String(el.getAttribute('role') || '').toLowerCase() : '';
      const hasExplicitFieldHint = Boolean(
        role === 'textbox' ||
          (el.getAttribute &&
            (el.getAttribute('data-csv-field') ||
              el.getAttribute('name') ||
              el.getAttribute('aria-label') ||
              el.getAttribute('placeholder'))) ||
          getWireModel(el)
      );
      if (!hasExplicitFieldHint) return false;
    }

    // Never touch contenteditable containers that hold website structure or nested controls
    if (
      el.querySelector &&
      el.querySelector(
        'form, input, select, textarea, button, table, nav, header, footer, aside, section, article, main, ul, ol, h1, h2, h3, h4, h5, h6, iframe, img, svg'
      )
    ) {
      return false;
    }

    if (el.children && el.children.length > 0) {
      const childArr = Array.from(el.children);
      if (childArr.length > 3) return false;
      const allSimpleTextNodes = childArr.every(
        (child) =>
          (child.tagName === 'P' || child.tagName === 'BR' || child.tagName === 'SPAN') &&
          (!child.children ||
            child.children.length === 0 ||
            (child.children.length === 1 && child.children[0].tagName === 'BR'))
      );
      if (!allSimpleTextNodes) return false;
    }

    return true;
  }

  function isTableSelectionCheckbox(el) {
    if (!el || el.tagName.toLowerCase() !== 'input' || String(el.type || '').toLowerCase() !== 'checkbox') {
      return false;
    }
    if (el.form) return false;
    if (el.closest && el.closest('thead, .dataTables_wrapper, .table-responsive')) {
      const meta = `${el.id || ''} ${el.name || ''} ${el.className || ''}`;
      if (/\b(select.?all|check.?all|row.?select|bulk|table.?check)\b/i.test(meta) || el.closest('thead')) {
        return true;
      }
    }
    return false;
  }

  function isFakeReadOnlyTrap(el) {
    if (!el || !el.readOnly) return false;
    if (typeof el.getAttribute !== 'function') return false;
    const onFocus = String(el.getAttribute('onfocus') || '');
    const onClick = String(el.getAttribute('onclick') || '');
    const onMouseDown = String(el.getAttribute('onmousedown') || '');
    return /readonly/i.test(`${onFocus} ${onClick} ${onMouseDown}`);
  }

  function isIgnoredInputType(el, eligibleForms) {
    if (!el || el.tagName.toLowerCase() !== 'input') return false;
    const type = String(el.type || 'text').toLowerCase();
    if (type === 'search') {
      // Exclude global/standalone search bars, but allow search-typed fields inside multi-field data forms
      if (eligibleForms && eligibleForms.length > 0) {
        const ownerForm = eligibleForms.find((f) => f === el.form || (f.contains && f.contains(el)));
        if (ownerForm && ownerForm.querySelectorAll) {
          const formFieldCount = ownerForm.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
          if (formFieldCount >= 2) return false;
        }
      }
      return true;
    }
    return IGNORED_INPUT_TYPES.has(type);
  }

  function getEligibleElements() {
    if (isDisallowedSubframe()) return [];

    const activeModal = getActiveModalRoot();
    const eligibleForms = getEligibleForms(activeModal || document);
    const inSubframe = typeof window !== 'undefined' && window.top && window !== window.top;
    if (inSubframe && !activeModal && eligibleForms.length === 0) {
      return [];
    }

    let mainRoot = null;
    if (!activeModal && typeof document.querySelector === 'function') {
      const candidateMain = document.querySelector('main, [role="main"]');
      if (candidateMain && candidateMain.querySelectorAll) {
        const hasInputs = Array.from(candidateMain.querySelectorAll('input, select, textarea')).some((el) => {
          if (el.disabled) return false;
          if (el.readOnly && !isFakeReadOnlyTrap(el)) return false;
          if (el.tagName.toLowerCase() === 'input') {
            const type = String(el.type || 'text').toLowerCase();
            if (IGNORED_INPUT_TYPES.has(type)) return false;
          }
          return !isNonFormChromeElement(el) && !isInInactiveSubtree(el);
        });
        if (hasInputs) mainRoot = candidateMain;
      }
    }

    const totalFormControls = eligibleForms.reduce((sum, f) => {
      if (!f.querySelectorAll) return sum + 1;
      return sum + f.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
    }, 0);
    const useMainFallbackAlongsideTinyForm =
      Boolean(mainRoot) && eligibleForms.length > 0 && totalFormControls <= 1;

    const standard = Array.from(document.querySelectorAll('input, select, textarea')).filter((el) => {
      if (el.disabled) return false;
      if (el.readOnly && !isFakeReadOnlyTrap(el)) return false;
      if (isWidgetInternalControl(el)) return false;
      if (isNonFormChromeElement(el)) return false;
      if (isInInactiveSubtree(el)) return false;
      if (isNavigationalControl(el)) return false;
      if (isIgnoredInputType(el, eligibleForms)) return false;
      if (isTableSelectionCheckbox(el)) return false;

      if (activeModal) {
        const inModal =
          (activeModal.contains && activeModal.contains(el)) ||
          (el.form && activeModal.contains && activeModal.contains(el.form));
        if (!inModal) return false;
        if (eligibleForms.length > 0 && !eligibleForms.some((f) => f === el.form || (f.contains && f.contains(el)))) {
          return false;
        }
      } else if (eligibleForms.length > 0 && !useMainFallbackAlongsideTinyForm) {
        if (!eligibleForms.some((f) => f === el.form || (f.contains && f.contains(el)))) {
          return false;
        }
      } else if (mainRoot && mainRoot.contains && !mainRoot.contains(el)) {
        return false;
      }

      return true;
    });

    const editables = Array.from(document.querySelectorAll('[contenteditable="true"]')).filter((el) =>
      isSafeContentEditable(el, activeModal, eligibleForms, mainRoot)
    );
    return [...standard, ...editables];
  }

  function isCittaAchievementPage() {
    return Boolean(
      document.querySelector('[wire\\:model\\.live="achievementCategoryId"], [wire\\:model="achievementCategoryId"]') ||
      document.querySelector('[wire\\:model\\.live="actionType"], [wire\\:model="actionType"]')
    );
  }

  function sanitizeCittaName(val) {
    return String(val ?? '')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50);
  }

  function deriveCittaAchievementFields(record) {
    const derived = {};
    if (!record || typeof record !== 'object') return derived;

    const byNorm = new Map();
    for (const [k, v] of Object.entries(record)) {
      const nk = normalizeKey(k);
      if (nk && !byNorm.has(nk)) byNorm.set(nk, String(v ?? '').trim());
    }

    const pick = (...keys) => {
      for (const k of keys) {
        const val = byNorm.get(normalizeKey(k));
        if (val !== undefined && val !== '') return val;
      }
      return '';
    };

    const rawName = pick('Name', 'Achevement Name', 'Achievement Name', 'Title');
    if (rawName) derived.name = sanitizeCittaName(rawName);

    const game = pick('Game', 'Selected Games', 'Games');
    const explicitCategory = pick('Achievement Category', 'Category', 'achievementCategoryId');
    if (explicitCategory) {
      derived.achievementCategoryId = explicitCategory;
    } else if (game) {
      derived.achievementCategoryId = game;
    }

    const levelVal = pick('Level', 'Tier');
    if (levelVal) derived.level = levelVal;

    const parentVal = pick('Parent Achievement', 'parentAchievementConfigId');
    if (parentVal) derived.parentAchievementConfigId = parentVal;

    const activeVal = pick('Active', 'isActive', 'Confirmed');
    if (byNorm.has('active') || byNorm.has('isactive') || byNorm.has('confirmed')) {
      derived.isActive = activeVal || 'false';
    }

    const autoClaim = pick('Reward Auto Claim', 'isRewardAutoClaim');
    if (autoClaim) derived.isRewardAutoClaim = autoClaim;

    const userSpecific = pick('User Specific', 'isUserSpecific');
    if (userSpecific) derived.isUserSpecific = userSpecific;

    const duration = pick('Duration');
    if (duration) derived.duration = duration;

    const weekStart = pick('Week Start Day', 'weekStartDay');
    if (weekStart) derived.weekStartDay = weekStart;

    const displayLive = pick('Display Live Date', 'displayLiveAt');
    if (displayLive) derived.displayLiveAt = displayLive;

    const displayExpire = pick('Display Expire Date', 'displayExpireAt');
    if (displayExpire) derived.displayExpireAt = displayExpire;

    const startTime = pick('Start Time', 'startTime');
    if (startTime) derived.startTime = startTime;

    const endTime = pick('End Time', 'endTime');
    if (endTime) derived.endTime = endTime;

    const actionType = pick('Action Type', 'actionType');
    if (actionType) derived.actionType = actionType;

    const description = pick('Description', 'description');
    if (description) derived.description = description;

    const explicitCount = pick('Action Perform Count', 'action_perform_count', 'Action Count', 'Count');
    if (explicitCount) {
      derived.action_perform_count = explicitCount;
    } else if (description) {
      const countMatch = description.match(/\b(\d+)\b/);
      if (countMatch) derived.action_perform_count = countMatch[1];
    }

    const gameMode = pick('Selected Mode', 'Game Mode', 'game_mode_id');
    if (gameMode) derived.game_mode_id = gameMode;

    const selectedGames = pick('Selected Games', 'Games', 'game_ids', 'Game');
    if (selectedGames) derived.game_ids = selectedGames;

    const leaderboardIds = pick('Selected Leaderboard', 'Leaderboard', 'leaderboard_ids');
    if (leaderboardIds) derived.leaderboard_ids = leaderboardIds;

    const profileCat = pick('Selecte Profile Category', 'Profile Category', 'profile_update_category_id');
    if (profileCat) derived.profile_update_category_id = profileCat;

    const startRange = pick('Starting Range', 'leaderboard_starting_range');
    if (startRange) derived.leaderboard_starting_range = startRange;

    const endRange = pick('Ending Range', 'leaderboard_ending_range');
    if (endRange) derived.leaderboard_ending_range = endRange;

    const purchaseIds = pick('Selected Products', 'Products', 'purchase_ids');
    if (purchaseIds) derived.purchase_ids = purchaseIds;

    const allCompletion = pick('All Completion', 'isAllCompletionRequired');
    if (allCompletion) derived.isAllCompletionRequired = allCompletion;

    const streakToggle = pick('isStrickRequired');
    if (streakToggle) derived.isStrickRequired = streakToggle;

    const gameStreak = pick('Game Streak', 'game_streak');
    if (gameStreak) derived.game_streak = gameStreak;

    const gameRequired = pick('Game Required', 'isGameRequired');
    if (gameRequired) derived.isGameRequired = gameRequired;

    const rewardClaimCount = pick('Reward Claim Count', 'reward_claim_count');
    if (rewardClaimCount) derived.reward_claim_count = rewardClaimCount;

    const explicitRewardType = pick('Reward Type', 'rewardType');
    const explicitBonusCoin = pick('Bonus Coin', 'reward_coins');
    const explicitRewardGame = pick('Reward Game', 'Reward Selected Games', 'reward_game_ids');
    const explicitBetCoin = pick('Bet Coin', 'bet_coin');

    if (explicitRewardType) derived.rewardType = explicitRewardType;
    if (explicitBonusCoin) derived.reward_coins = explicitBonusCoin;
    if (explicitRewardGame) derived.reward_game_ids = explicitRewardGame;
    if (explicitBetCoin) derived.bet_coin = explicitBetCoin;

    const rawReward = pick('Reward');
    if (rawReward) {
      const betMatch = rawReward.match(/^(\d+)\s+bet\s*coins?\s+(.+)$/i);
      const coinMatch = rawReward.match(/^(\d+)\s*coins?$/i);
      if (betMatch) {
        if (!derived.rewardType) derived.rewardType = 'Game';
        if (!derived.bet_coin) derived.bet_coin = betMatch[1];
        if (!derived.reward_game_ids) derived.reward_game_ids = betMatch[2].trim();
      } else if (coinMatch) {
        if (!derived.rewardType) derived.rewardType = 'Win Coin';
        if (!derived.reward_coins) derived.reward_coins = coinMatch[1];
      }
    }

    return derived;
  }

  function resolveValue(element, record, normMap, customMappings, derivedFields) {
    const wireModel = getWireModel(element);
    const elemKeys = getElementMatchKeys(element);

    if (customMappings && typeof customMappings === 'object') {
      for (const [csvCol, target] of Object.entries(customMappings)) {
        if (!target || !Object.prototype.hasOwnProperty.call(record, csvCol)) continue;
        const trimmedTarget = String(target).trim();
        const normTarget = normalizeKey(trimmedTarget);
        let selectorMatch = false;
        if (/^[#.\[]/.test(trimmedTarget)) {
          try {
            selectorMatch = element.matches(trimmedTarget);
          } catch (_) {
            selectorMatch = false;
          }
        }
        const directAttrMatch =
          selectorMatch ||
          (wireModel && wireModel === trimmedTarget) ||
          (element.name && element.name === trimmedTarget) ||
          (element.id && element.id === trimmedTarget);

        // When target matches another element's exact wire:model, avoid label collision
        const exactWireMatch = directAttrMatch || (!wireModel && normTarget && elemKeys.includes(normTarget));
        if (exactWireMatch) {
          let val = record[csvCol];
          if (wireModel && Object.prototype.hasOwnProperty.call(derivedFields, wireModel)) {
            val = derivedFields[wireModel];
          }
          return { header: csvCol, value: val };
        }
      }
    }

    if (wireModel && Object.prototype.hasOwnProperty.call(derivedFields, wireModel)) {
      return { header: wireModel, value: derivedFields[wireModel] };
    }

    for (const key of elemKeys) {
      if (normMap.has(key)) {
        return normMap.get(key);
      }
    }

    if (wireModel) {
      const normWire = normalizeKey(wireModel);
      for (const [dKey, dVal] of Object.entries(derivedFields)) {
        if (normalizeKey(dKey) === normWire) {
          return { header: dKey, value: dVal };
        }
      }
    }

    return null;
  }

  function findBestSelectOption(options, rawValue) {
    const strVal = String(rawValue ?? '').trim();
    if (!strVal) return null;

    const nonPlaceholder = options.filter((o) => o.value !== '' || normalizeKey(o.textContent) !== 'select');
    const pool = nonPlaceholder.length > 0 ? nonPlaceholder : options;

    const needle = strVal.toLowerCase();
    const normNeedle = normalizeKey(strVal);

    // 1. Exact case-insensitive match
    let match = pool.find(
      (o) => o.value.trim().toLowerCase() === needle || o.textContent.trim().toLowerCase() === needle
    );
    if (match) return match;

    // 2. Normalized key match (strips $/@/#/punctuation/spaces)
    if (normNeedle) {
      match = pool.find(
        (o) => normalizeKey(o.value) === normNeedle || normalizeKey(o.textContent) === normNeedle
      );
      if (match) return match;

      // 3. Alias expansion
      const alias = SELECT_ALIASES[normNeedle];
      if (alias) {
        match = pool.find((o) => normalizeKey(o.textContent) === alias || normalizeKey(o.value) === alias);
        if (match) return match;
      }
    }

    // 4. Token-sorted match ("Play Game" <-> "Game Play", "Win Game" <-> "Game Win")
    const needleTokens = tokenize(strVal);
    if (needleTokens.length > 0) {
      const sortedNeedle = [...needleTokens].sort().join(' ');
      match = pool.find((o) => {
        const optSorted = tokenize(o.textContent).sort().join(' ');
        return optSorted && optSorted === sortedNeedle;
      });
      if (match) return match;
    }

    // 5. Fuzzy typo tolerance (e.g. "Galxy gunner" vs "Galaxy Gunner", "Solitire" vs "Solitaire")
    if (normNeedle.length >= 5) {
      let bestOpt = null;
      let bestDist = Infinity;
      let tie = false;
      for (const o of pool) {
        const optNorm = normalizeKey(o.textContent);
        if (optNorm.length < 5) continue;
        const dist = levenshtein(normNeedle, optNorm);
        const maxAllowed = normNeedle.length >= 8 ? 2 : 1;
        if (dist <= maxAllowed) {
          if (dist < bestDist) {
            bestDist = dist;
            bestOpt = o;
            tie = false;
          } else if (dist === bestDist) {
            tie = true;
          }
        }
      }
      if (bestOpt && !tie) return bestOpt;
    }

    // 6. Token subset match when unambiguous (e.g. "Breezy block" -> "Breezy blocks Puzzle")
    if (needleTokens.length >= 2) {
      const candidates = pool.filter((o) => {
        const optTextNorm = normalizeKey(o.textContent);
        return needleTokens.every((t) => optTextNorm.includes(t));
      });
      if (candidates.length === 1) return candidates[0];
    }

    return null;
  }

  function isSelect2Element(selectEl) {
    if (!selectEl) return false;
    if (selectEl.classList && selectEl.classList.contains('select2-hidden-accessible')) return true;
    const next = selectEl.nextElementSibling;
    return Boolean(next && next.classList && next.classList.contains('select2'));
  }

  function fillSelect(selectEl, rawValue) {
    const strVal = String(rawValue ?? '').trim();
    const options = Array.from(selectEl.options || []);

    if (selectEl.multiple) {
      const targets = strVal.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
      let matched = false;
      options.forEach((opt) => {
        opt.selected = false;
      });
      for (const t of targets) {
        const matchOpt = findBestSelectOption(options, t);
        if (matchOpt) {
          matchOpt.selected = true;
          matched = true;
        }
      }
      if (matched) {
        if (isSelect2Element(selectEl)) {
          selectEl.dataset.csvFilled = '1';
        }
        dispatchEvents(selectEl);
      }
      return matched;
    }

    const matchOpt = findBestSelectOption(options, strVal);
    if (!matchOpt) return false;
    matchOpt.selected = true;
    setNativeValue(selectEl, matchOpt.value);
    if (isSelect2Element(selectEl)) {
      selectEl.dataset.csvFilled = '1';
    }
    dispatchEvents(selectEl);
    return true;
  }

  function fillElement(element, rawValue) {
    if (element.isContentEditable) {
      const textVal = String(rawValue ?? '');
      if (element.children && element.children.length > 0) {
        const children = Array.from(element.children);
        const firstP = children.find((c) => c.tagName === 'P' || c.tagName === 'SPAN');
        if (firstP && children.every((c) => c.tagName === 'P' || c.tagName === 'BR' || c.tagName === 'SPAN')) {
          firstP.textContent = textVal;
          children.forEach((c) => {
            if (c !== firstP && c.tagName === 'P') c.textContent = '';
          });
        } else if (children.every((c) => c.tagName === 'BR')) {
          element.textContent = textVal;
        } else {
          return false;
        }
      } else {
        element.textContent = textVal;
      }
      dispatchEvents(element);
      return true;
    }

    const tag = element.tagName.toLowerCase();
    const type = tag === 'input' ? String(element.type || 'text').toLowerCase() : tag;

    if (tag === 'select') {
      return fillSelect(element, rawValue);
    }

    if (type === 'checkbox') {
      const scopeRoot = element.form || document;
      const sameName = element.name
        ? Array.from(scopeRoot.querySelectorAll('input[type="checkbox"]')).filter(
            (el) => el.name === element.name
          )
        : [];
      const cleanRawLower = String(rawValue ?? '').trim().toLowerCase();
      if (sameName.length > 1 && cleanRawLower !== 'true' && cleanRawLower !== 'false') {
        const targets = String(rawValue ?? '').split(/[,;|]/).map(normalizeKey).filter(Boolean);
        const valNorm = normalizeKey(element.value);
        const lblNorms = getAssociatedLabels(element).map(normalizeKey);
        setNativeChecked(
          element,
          targets.includes(valNorm) || lblNorms.some((l) => targets.includes(l))
        );
      } else {
        const attrVal = String(element.value || '').trim().toLowerCase();
        const check =
          attrVal && attrVal !== 'on' && cleanRawLower === attrVal ? true : isTruthyValue(rawValue);
        setNativeChecked(element, check);
      }
      dispatchEvents(element);
      return true;
    }

    if (type === 'radio') {
      const needle = normalizeKey(rawValue);
      const valMatch = normalizeKey(element.value) === needle;
      const lblMatch = getAssociatedLabels(element).some((l) => normalizeKey(l) === needle);
      if (valMatch || lblMatch) {
        setNativeChecked(element, true);
        dispatchEvents(element);
        return true;
      }
      return false;
    }

    if (isFakeReadOnlyTrap(element)) {
      element.readOnly = false;
      if (typeof element.removeAttribute === 'function') {
        element.removeAttribute('readonly');
      }
    }

    let finalVal = String(rawValue ?? '');
    if (type === 'date') {
      finalVal = normalizeDateValue(rawValue);
    } else if (type === 'datetime-local') {
      const hint = normalizeKey(
        `${getWireModel(element)} ${element.name || ''} ${element.id || ''} ${getAssociatedLabels(element).join(' ')}`
      );
      const defaultTime = hint.includes('expire') || hint.includes('end') ? '23:59' : '00:00';
      finalVal = normalizeDateTimeLocalValue(rawValue, defaultTime);
    } else if (type === 'time') {
      finalVal = normalizeTimeValue(rawValue);
    }

    setNativeValue(element, finalVal);
    dispatchEvents(element);
    return true;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForLivewireReady(checkFn, maxMs) {
    const start = Date.now();
    await sleep(260);
    while (Date.now() - start < maxMs) {
      if (checkFn()) return;
      await sleep(120);
    }
  }

  function buildNormMap(record) {
    const normMap = new Map();
    for (const [header, val] of Object.entries(record)) {
      const k = normalizeKey(header);
      if (k && !normMap.has(k)) normMap.set(k, { header, value: val });
    }
    return normMap;
  }

  const DEFAULT_FIELD_ALIASES = {
    livedate: 'displayliveat',
    expiredate: 'displayexpireat',
    expirydate: 'displayexpireat',
    achievementname: 'name',
    achevementname: 'name',
    category: 'achievementcategoryid',
  };

  function resolveDefaultValue(element, defaultFields) {
    if (!defaultFields) return null;
    const entries = Array.isArray(defaultFields)
      ? defaultFields.map((d) => [d.field, d.value])
      : Object.entries(defaultFields);

    if (entries.length === 0) return null;

    const wireModel = getWireModel(element);
    const elemKeys = getElementMatchKeys(element);

    // Priority 1: exact selector, wireModel, id, or name match
    for (const [target, val] of entries) {
      if (!target || val === undefined || val === null || String(val) === '') continue;
      const trimmed = String(target).trim();
      if (/^[#.\[]/.test(trimmed)) {
        try {
          if (element.matches(trimmed)) return { header: `default:${trimmed}`, value: val };
        } catch (_) {
          // Ignore invalid selector
        }
      }
      if (
        (wireModel && wireModel === trimmed) ||
        (element.id && element.id === trimmed) ||
        (element.name && element.name === trimmed)
      ) {
        return { header: `default:${trimmed}`, value: val };
      }
    }

    // Priority 2: normalized key / label / placeholder / alias match
    for (const [target, val] of entries) {
      if (!target || val === undefined || val === null || String(val) === '') continue;
      const normTarget = normalizeKey(target);
      const aliased = DEFAULT_FIELD_ALIASES[normTarget];
      if (
        (normTarget && elemKeys.includes(normTarget)) ||
        (aliased && elemKeys.includes(aliased))
      ) {
        return { header: `default:${target}`, value: val };
      }
    }

    return null;
  }

  function runFillPass(
    record,
    normMap,
    customMappings,
    derivedFields,
    defaultFields,
    alreadyFilledElements,
    intendedByKey
  ) {
    const elements = getEligibleElements();
    const filledFields = [];
    const filledRadioGroups = new Set();
    const triggeredWireModels = new Set();
    let filledCount = 0;

    elements.forEach((el, idx) => {
      if (alreadyFilledElements.has(el)) return;

      const match = resolveValue(el, record, normMap, customMappings, derivedFields);
      const isRadio = el.tagName.toLowerCase() === 'input' && String(el.type).toLowerCase() === 'radio';
      const wireModel = getWireModel(el);

      let filled = false;
      let filledHeader = '';
      let appliedValue = '';

      if (match && match.value !== '' && match.value !== null && match.value !== undefined) {
        if (fillElement(el, match.value)) {
          filled = true;
          filledHeader = match.header;
          appliedValue = match.value;
        }
      }

      if (!filled) {
        const defMatch = resolveDefaultValue(el, defaultFields);
        if (defMatch && fillElement(el, defMatch.value)) {
          filled = true;
          filledHeader = defMatch.header;
          appliedValue = defMatch.value;
        }
      }

      if (filled) {
        alreadyFilledElements.add(el);
        if (intendedByKey && !isRadio) {
          const stableKey = getFieldStableKey(el, idx);
          if (!stableKey.startsWith('idx:')) {
            intendedByKey.set(stableKey, {
              rawValue: appliedValue,
              type: el.tagName.toLowerCase() === 'input' ? String(el.type || 'text').toLowerCase() : el.tagName.toLowerCase(),
            });
          }
        }
        highlightElement(el);
        if (wireModel) triggeredWireModels.add(wireModel);

        if (isRadio && el.name) {
          if (!filledRadioGroups.has(el.name)) {
            filledRadioGroups.add(el.name);
            filledCount += 1;
            filledFields.push(el.name);
          }
        } else {
          filledCount += 1;
          filledFields.push(wireModel || el.name || el.id || el.placeholder || filledHeader);
        }
      }
    });

    return {
      filledCount,
      totalFields: elements.length,
      filledFields,
      triggeredWireModels,
    };
  }

  function isFieldStillEmpty(el) {
    if (!el) return false;
    if (el.isContentEditable) {
      return String(el.textContent || '').trim() === '';
    }
    const tag = el.tagName.toLowerCase();
    const type = tag === 'input' ? String(el.type || 'text').toLowerCase() : tag;
    if (tag === 'select') {
      if (getValidSelectOptions(el).length === 0) return false;
      const selOpt =
        (el.selectedOptions && el.selectedOptions[0]) ||
        Array.from(el.options || []).find((o) => o.selected || String(o.value ?? '') === String(el.value ?? ''));
      if (selOpt && isPlaceholderOption(selOpt)) return true;
      return String(el.value ?? '').trim() === '';
    }
    if (type === 'radio') {
      if (!el.name) return !el.checked;
      const radioScope = el.form || document;
      return !Array.from(radioScope.querySelectorAll('input[type="radio"]')).some(
        (r) => r.name === el.name && r.checked
      );
    }
    if (type === 'checkbox') {
      if (el.name) {
        const scopeRoot = el.form || document;
        const group = Array.from(scopeRoot.querySelectorAll('input[type="checkbox"]')).filter(
          (cb) => cb.name === el.name && !cb.disabled
        );
        if (group.length > 1) {
          return group.every((cb) => !cb.checked);
        }
      }
      return Boolean(el.required) && !el.checked;
    }
    return String(el.value ?? '').trim() === '';
  }

  function reconcileMorphedInputs(intendedByKey) {
    if (!intendedByKey || intendedByKey.size === 0) return false;
    let reapplied = false;
    const elements = getEligibleElements();
    elements.forEach((el, idx) => {
      const stableKey = getFieldStableKey(el, idx);
      const entry = intendedByKey.get(stableKey);
      if (!entry) return;
      if (entry.type === 'checkbox' || entry.type === 'radio') return;
      if (isFieldStillEmpty(el)) {
        if (fillElement(el, entry.rawValue)) {
          highlightElement(el);
          reapplied = true;
        }
      }
    });
    return reapplied;
  }

  async function fillPage(record, customMappings, defaultFields, options) {
    const onlyEmpty = Boolean(options && options.onlyEmpty);
    const hasDefaults = defaultFields && (Array.isArray(defaultFields) ? defaultFields.length > 0 : Object.keys(defaultFields).length > 0);
    if ((!record || typeof record !== 'object') && !hasDefaults) {
      return { filledCount: 0, totalFields: 0, filledFields: [] };
    }

    const safeRecord = record && typeof record === 'object' ? record : {};
    const normMap = buildNormMap(safeRecord);
    const derivedFields =
      isCittaAchievementPage() || Object.prototype.hasOwnProperty.call(safeRecord, 'Achevement Name')
        ? deriveCittaAchievementFields(safeRecord)
        : {};

    const alreadyFilled = new Set();
    if (onlyEmpty) {
      getEligibleElements().forEach((el) => {
        if (!isFieldStillEmpty(el)) alreadyFilled.add(el);
      });
    }
    const intendedByKey = new Map();
    const pass1 = runFillPass(
      safeRecord,
      normMap,
      customMappings,
      derivedFields,
      defaultFields,
      alreadyFilled,
      intendedByKey
    );
    let totalFilledCount = pass1.filledCount;
    const allFilledFields = [...pass1.filledFields];
    let latestTotalFields = pass1.totalFields;

    const hasLivewire = Boolean(document.querySelector('[wire\\:id]'));
    const livewireTriggers = ['actionType', 'rewardType', 'achievementCategoryId', 'duration'];
    const shouldWaitPass2 =
      hasLivewire && livewireTriggers.some((t) => pass1.triggeredWireModels.has(t));

    if (shouldWaitPass2) {
      await waitForLivewireReady(() => {
        const gamesWrap = document.querySelector('#selectGames')?.closest('.col-md-4');
        const rewardCoinsWrap = document.querySelector('[wire\\:model\\.live="reward_coins"]')?.closest('.col-md-4');
        const rewardGameWrap = document.querySelector('[wire\\:model\\.live="reward_game_ids"]')?.closest('.col-md-4');
        return Boolean(
          (gamesWrap && !gamesWrap.classList.contains('d-none')) ||
          (rewardCoinsWrap && !rewardCoinsWrap.classList.contains('d-none')) ||
          (rewardGameWrap && !rewardGameWrap.classList.contains('d-none'))
        );
      }, 1400);

      // Allow filling newly revealed or newly populated selects in Pass 2
      for (const el of Array.from(alreadyFilled)) {
        const wm = getWireModel(el);
        if (wm === 'bet_coin' || wm === 'parentAchievementConfigId') {
          alreadyFilled.delete(el);
        }
      }

      const pass2 = runFillPass(
        safeRecord,
        normMap,
        customMappings,
        derivedFields,
        defaultFields,
        alreadyFilled,
        intendedByKey
      );
      totalFilledCount += pass2.filledCount;
      allFilledFields.push(...pass2.filledFields);
      latestTotalFields = pass2.totalFields;

      if (pass2.triggeredWireModels.has('reward_game_ids') || pass1.triggeredWireModels.has('reward_game_ids')) {
        const betCoinEl = document.querySelector('[wire\\:model\\.live="bet_coin"], [wire\\:model="bet_coin"]');
        const hasBetVal =
          derivedFields.bet_coin ||
          safeRecord.bet_coin ||
          safeRecord['Bet Coin'] ||
          (betCoinEl && resolveDefaultValue(betCoinEl, defaultFields));
        if (betCoinEl && hasBetVal) {
          await waitForLivewireReady(() => betCoinEl.options && betCoinEl.options.length > 1, 1600);
          alreadyFilled.delete(betCoinEl);
          const pass3 = runFillPass(
            safeRecord,
            normMap,
            customMappings,
            derivedFields,
            defaultFields,
            alreadyFilled,
            intendedByKey
          );
          totalFilledCount += pass3.filledCount;
          allFilledFields.push(...pass3.filledFields);
          latestTotalFields = pass3.totalFields;
        }
      }
    }

    // Re-apply any datetime-local/time/text fields wiped by Livewire DOM morphing during select XHRs
    if (hasLivewire) {
      await sleep(220);
      if (reconcileMorphedInputs(intendedByKey)) {
        await sleep(220);
      }
    }

    return {
      filledCount: totalFilledCount,
      totalFields: latestTotalFields,
      filledFields: Array.from(new Set(allFilledFields)),
    };
  }

  function getNearestSectionTitle(el) {
    if (!el || typeof document === 'undefined') return '';
    let node = el.parentElement;
    while (node && node !== document.body) {
      let prev = node.previousElementSibling;
      while (prev) {
        if (/^H[1-6]$/.test(prev.tagName) || prev.matches('legend')) {
          const t = cleanLabelText(prev.textContent);
          if (t) return t;
        }
        const heading = prev.querySelector && prev.querySelector('h1, h2, h3, h4, h5, h6, legend');
        if (heading) {
          const t = cleanLabelText(heading.textContent);
          if (t) return t;
        }
        prev = prev.previousElementSibling;
      }
      if (node.tagName === 'FORM') break;
      node = node.parentElement;
    }
    return '';
  }

  function scanFields() {
    const seenRefs = new Set();
    const seenRadioNames = new Set();
    const fields = [];
    for (const el of getEligibleElements()) {
      const tag = el.isContentEditable ? 'contenteditable' : el.tagName.toLowerCase();
      const type = tag === 'input' ? String(el.type || 'text').toLowerCase() : '';

      if (type === 'radio' && el.name) {
        if (seenRadioNames.has(el.name)) continue;
        seenRadioNames.add(el.name);
      }

      const labels = getAssociatedLabels(el);
      const wireModel = getWireModel(el);
      const hidden = Boolean(el.closest && el.closest('.d-none')) || el.offsetParent === null;
      const label = labels[0] || el.getAttribute('aria-label') || '';
      const placeholder = el.placeholder || '';
      const elemName = el.name || (typeof el.getAttribute === 'function' ? el.getAttribute('name') : '') || '';
      const ref = wireModel || el.id || elemName || label || placeholder;
      if (!ref || seenRefs.has(ref)) continue;
      seenRefs.add(ref);

      let optionsPreview = '';
      let optionsList = [];
      if (tag === 'select') {
        const opts = getValidSelectOptions(el).map((o) => o.textContent.trim()).filter(Boolean);
        optionsList = opts.slice(0, 50);
        if (opts.length > 0) {
          const preview = opts.slice(0, 4);
          optionsPreview = preview.join(', ') + (opts.length > 4 ? ', ...' : '');
        }
      } else if (type === 'radio' && el.name) {
        const radioScope = el.form || document;
        const groupEls = Array.from(radioScope.querySelectorAll('input[type="radio"]')).filter(
          (r) => r.name === el.name && !r.disabled
        );
        optionsList = groupEls
          .map((r) => getAssociatedLabels(r)[0] || r.value)
          .filter(Boolean)
          .slice(0, 20);
        if (optionsList.length > 0) {
          optionsPreview = optionsList.slice(0, 4).join(', ');
        }
      }

      fields.push({
        ref,
        tag,
        type,
        name: elemName,
        id: el.id || '',
        wireModel,
        placeholder,
        label,
        section: getNearestSectionTitle(el),
        optionsPreview,
        options: optionsList,
        hidden,
        multiple: Boolean(el.multiple),
      });
    }
    return fields;
  }

  const RANDOM_POOLS = {
    firstNames: ['Aarav', 'Maya', 'Liam', 'Sofia', 'Kenji', 'Priya', 'Noah', 'Zara', 'Rohan', 'Elena'],
    lastNames: ['Sharma', 'Patel', 'Rodriguez', 'Takahashi', 'Verma', 'Walker', 'Nair', 'Bennett', 'Kapoor', 'Silva'],
    domains: ['example.com', 'mailtest.io', 'demo.org', 'citta-test.dev'],
    cities: ['Mumbai', 'Bengaluru', 'Pune', 'London', 'Austin', 'Tokyo', 'Madrid', 'Toronto'],
    states: ['Maharashtra', 'Karnataka', 'California', 'Texas', 'Ontario', 'England'],
    countries: ['India', 'United States', 'United Kingdom', 'Spain', 'Japan', 'Canada'],
    departments: ['Engineering', 'Product', 'Design', 'Operations', 'Data', 'Marketing'],
    roles: ['Software Engineer', 'Product Manager', 'QA Lead', 'UX Designer', 'Data Analyst'],
    companies: ['SpellenX Labs', 'Citta Studio', 'Nova Systems', 'Vertex Digital', 'Apex Interactive'],
    adjectives: ['Cosmic', 'Golden', 'Rapid', 'Shadow', 'Apex', 'Turbo', 'Crystal', 'Grand', 'Royal', 'Hyper'],
    nouns: ['Striker', 'Champion', 'Vanguard', 'Master', 'Voyager', 'Legend', 'Pioneer', 'Tactician', 'Winner', 'Ace'],
    sentences: [
      'Complete daily matches to unlock bonus rewards and climb the leaderboard.',
      'Play consecutive rounds with steady focus to earn milestone achievements.',
      'Win competitive games in public lobbies to progress this challenge.',
      'Automatically generated test description for form verification.',
    ],
  };

  function randomInt(min, max) {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi <= lo) return lo;
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }

  function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function isEnhancedHiddenControl(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') {
      if (
        el.classList &&
        (el.classList.contains('select2-hidden-accessible') ||
          el.classList.contains('selectpicker') ||
          el.classList.contains('chosen-select') ||
          el.classList.contains('tomselected') ||
          el.classList.contains('selectized') ||
          el.classList.contains('choices__input'))
      ) {
        return true;
      }
      const next = el.nextElementSibling;
      if (
        next &&
        next.classList &&
        (next.classList.contains('select2') ||
          next.classList.contains('chosen-container') ||
          next.classList.contains('ts-wrapper') ||
          next.classList.contains('selectize-control'))
      ) {
        return true;
      }
      if (el.closest && el.closest('.bootstrap-select, .choices')) return true;
    }
    if (tag === 'input') {
      const type = String(el.type || '').toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        if (
          (el.classList &&
            (el.classList.contains('sr-only') ||
              el.classList.contains('visually-hidden') ||
              el.classList.contains('btn-check') ||
              el.classList.contains('custom-control-input') ||
              el.classList.contains('form-check-input'))) ||
          (el.closest && el.closest('label'))
        ) {
          return true;
        }
      }
    }
    return false;
  }

  function isElementHidden(el) {
    if (!el) return true;
    if (el.closest && el.closest('.d-none, [hidden]')) return true;
    const useParentVisibility = isEnhancedHiddenControl(el);

    if (typeof window !== 'undefined' && window.getComputedStyle) {
      let node = useParentVisibility ? el.parentElement : el;
      while (node && node !== document.body) {
        const style = window.getComputedStyle(node);
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
        node = node.parentElement;
      }
    }
    return false;
  }

  function getFieldStableKey(el, fallbackIndex) {
    const wm = getWireModel(el);
    if (wm) return `wire:${wm}`;
    if (el.id) return `id:${el.id}`;
    if (el.name) return `name:${el.name}`;
    const labels = getAssociatedLabels(el);
    if (labels[0]) return `lbl:${normalizeKey(labels[0])}`;
    if (el.placeholder) return `ph:${normalizeKey(el.placeholder)}`;
    return `idx:${fallbackIndex}`;
  }

  function formatDateYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDateTimeLocal(date) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${formatDateYMD(date)}T${hh}:${mm}`;
  }

  function isPlaceholderOption(opt) {
    const val = String(opt && opt.value !== undefined ? opt.value : '').trim();
    const txt = normalizeKey(opt && opt.textContent);
    if (val === '') return true;
    if (!txt) return false;
    return (
      txt === 'select' ||
      txt === 'selectone' ||
      txt === 'pleaseselect' ||
      txt === 'choose' ||
      txt === 'chooseone' ||
      /^select[a-z]+$/.test(txt) && (val === '0' || val === '-1' || val === 'none' || val === 'null')
    );
  }

  function getValidSelectOptions(selectEl) {
    const all = Array.from(selectEl.options || []).filter((o) => !o.disabled);
    const nonEmpty = all.filter((o) => {
      const rawVal = o.value !== undefined ? o.value : o.textContent;
      return String(rawVal ?? '').trim() !== '';
    });
    if (nonEmpty.length > 0) {
      const nonPlaceholder = nonEmpty.filter((o) => !isPlaceholderOption(o));
      return nonPlaceholder.length > 0 ? nonPlaceholder : nonEmpty;
    }
    return all.filter((o) => {
      const txt = normalizeKey(o.textContent);
      return txt && txt !== 'select' && !txt.startsWith('choose') && !txt.startsWith('select');
    });
  }

  function stepDecimals(step) {
    const s = String(step);
    const idx = s.indexOf('.');
    return idx >= 0 ? s.length - idx - 1 : 0;
  }

  function parseYmdToDate(str) {
    const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatMonthYM(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatWeekYW(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  function matchesPattern(val, patternAttr) {
    if (!patternAttr) return true;
    try {
      return new RegExp(`^(?:${patternAttr})$`).test(val);
    } catch (_) {
      return true;
    }
  }

  function generatePatternFallback(patternAttr, minLength, maxLength) {
    const quantMatch = String(patternAttr || '').match(/\{(\d+)(?:,(\d*))?\}/);
    const targetLen = quantMatch ? Number(quantMatch[1]) : Math.max(minLength || 4, Math.min(maxLength || 8, 8));
    const len = maxLength > 0 ? Math.min(targetLen, maxLength) : targetLen;

    const digitsOnly = String(randomInt(Math.pow(10, Math.min(len - 1, 8)), Math.pow(10, Math.min(len, 9)) - 1))
      .padStart(len, '9')
      .slice(0, len);
    if (matchesPattern(digitsOnly, patternAttr)) return digitsOnly;

    const alphaUpper = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.repeat(3).slice(0, len);
    if (matchesPattern(alphaUpper, patternAttr)) return alphaUpper;

    const alphaLower = 'abcdefghjkmnpqrstuvwxyz'.repeat(3).slice(0, len);
    if (matchesPattern(alphaLower, patternAttr)) return alphaLower;

    const alphaOnly = 'TestValueSample'.repeat(3).slice(0, len);
    if (matchesPattern(alphaOnly, patternAttr)) return alphaOnly;

    return null;
  }

  function generateRandomValue(target) {
    const isDom = target && typeof target.getAttribute === 'function';
    const tag = isDom
      ? (target.isContentEditable ? 'contenteditable' : target.tagName.toLowerCase())
      : String(target.tag || 'input').toLowerCase();
    const type = isDom
      ? (tag === 'input' ? String(target.type || 'text').toLowerCase() : '')
      : String(target.type || (tag === 'input' ? 'text' : '')).toLowerCase();

    const wireModel = isDom ? getWireModel(target) : String(target.wireModel || '');
    const name = isDom ? String(target.name || '') : String(target.name || '');
    const id = isDom ? String(target.id || '') : String(target.id || '');
    const label = isDom ? (getAssociatedLabels(target)[0] || target.getAttribute('aria-label') || '') : String(target.label || '');
    const placeholder = isDom ? String(target.placeholder || '') : String(target.placeholder || '');
    const hint = normalizeKey(`${wireModel} ${name} ${id} ${label} ${placeholder}`);
    const maxLenAttr = isDom ? Number(target.maxLength) : Number(target.maxLength);
    const maxLength = Number.isFinite(maxLenAttr) && maxLenAttr > 0 ? maxLenAttr : 0;
    const minLenAttr = isDom ? Number(target.minLength) : Number(target.minLength);
    const minLength = Number.isFinite(minLenAttr) && minLenAttr > 0 ? minLenAttr : 0;
    const oninputAttr = isDom ? String(target.getAttribute('oninput') || '') : '';
    const inputModeAttr = isDom ? String(target.getAttribute('inputmode') || '').toLowerCase() : '';
    const patternAttr = isDom ? String(target.getAttribute('pattern') || '') : String(target.pattern || '');
    const minAttr = isDom ? target.min : target.min;
    const maxAttr = isDom ? target.max : target.max;

    if (tag === 'select') {
      const validOpts = isDom
        ? getValidSelectOptions(target)
        : (Array.isArray(target.options)
            ? target.options.filter((o) => String(o.value !== undefined ? o.value : o.textContent || '').trim() !== '')
            : []);
      if (validOpts.length === 0) return '';
      const optVal = (o) => String(o.value !== undefined ? o.value : o.textContent || '');
      const isMultiple = isDom ? Boolean(target.multiple) : Boolean(target.multiple);
      if (isMultiple) {
        const count = randomInt(1, Math.min(3, validOpts.length));
        const pool = [...validOpts];
        const picked = [];
        for (let i = 0; i < count && pool.length > 0; i += 1) {
          const idx = randomInt(0, pool.length - 1);
          picked.push(optVal(pool.splice(idx, 1)[0]));
        }
        return picked.join(',');
      }
      return optVal(randomPick(validOpts));
    }

    if (tag === 'textarea' || tag === 'contenteditable') {
      let text = randomPick(RANDOM_POOLS.sentences);
      if (hint.includes('address')) {
        text = `${randomInt(10, 999)} Park Avenue, ${randomPick(RANDOM_POOLS.cities)}`;
      }
      while (minLength > 0 && text.length < minLength) {
        text += ` ${randomPick(RANDOM_POOLS.sentences)}`;
      }
      return maxLength > 0 ? text.slice(0, maxLength) : text;
    }

    if (type === 'checkbox') {
      if (isDom && target.required) return 'true';
      return Math.random() < 0.7 ? 'true' : 'false';
    }

    if (type === 'radio') {
      const opts = Array.isArray(target.options) ? target.options : [];
      if (opts.length > 0) return randomPick(opts).value;
      return isDom ? target.value || 'true' : 'true';
    }

    if (type === 'email') {
      const fn = randomPick(RANDOM_POOLS.firstNames).toLowerCase();
      const ln = randomPick(RANDOM_POOLS.lastNames).toLowerCase();
      let email = `${fn}.${ln}${randomInt(10, 99)}@${randomPick(RANDOM_POOLS.domains)}`;
      if (maxLength > 0 && email.length > maxLength) {
        email = `${fn.slice(0, 3)}${randomInt(10, 99)}@a.co`.slice(0, maxLength);
      }
      return email;
    }

    if (type === 'tel') {
      const intlNum = `+91-9${randomInt(100000000, 999999999)}`;
      const plainNum = `9${randomInt(100000000, 999999999)}`;
      let num =
        (maxLength > 0 && maxLength <= 10) ||
        inputModeAttr === 'numeric' ||
        inputModeAttr === 'tel' ||
        /\[\^0-9\]|\\D/.test(oninputAttr)
          ? plainNum
          : intlNum;
      if (patternAttr && !matchesPattern(num, patternAttr)) {
        if (matchesPattern(plainNum, patternAttr)) {
          num = plainNum;
        } else {
          const patVal = generatePatternFallback(patternAttr, minLength, maxLength);
          if (patVal) num = patVal;
        }
      }
      return maxLength > 0 ? num.slice(0, maxLength) : num;
    }

    if (type === 'url') {
      let url = `https://example.com/${randomPick(RANDOM_POOLS.adjectives).toLowerCase()}-${randomInt(10, 99)}`;
      if (maxLength > 0 && url.length > maxLength) {
        url = 'https://a.co'.slice(0, maxLength);
      }
      return url;
    }

    if (type === 'number' || type === 'range') {
      const stepAttr = isDom ? target.step : target.step;
      const hasMin = minAttr !== '' && minAttr !== undefined && !Number.isNaN(Number(minAttr));
      const hasMax = maxAttr !== '' && maxAttr !== undefined && !Number.isNaN(Number(maxAttr));
      let min = hasMin ? Number(minAttr) : 1;
      let max = hasMax ? Number(maxAttr) : 100;
      if (hasMax && !hasMin && max < min) {
        min = Math.min(0, max);
      }
      const step = stepAttr !== '' && stepAttr !== undefined && Number(stepAttr) > 0 ? Number(stepAttr) : 1;

      const sliceMatch = oninputAttr.match(/\.slice\(\s*0\s*,\s*(\d+)\s*\)/);
      const digitCap = sliceMatch ? Number(sliceMatch[1]) : 0;

      if (!hasMax) {
        if (hint.includes('coin') || hint.includes('amount') || hint.includes('price')) {
          min = Math.max(min, 50);
          max = 5000;
        } else if (hint.includes('streak')) {
          max = 15;
        } else if (hint.includes('startrange') || hint.includes('startingrange')) {
          min = 1;
          max = 10;
        } else if (hint.includes('endrange') || hint.includes('endingrange')) {
          min = 11;
          max = 100;
        } else if (hint.includes('claimcount')) {
          min = 1;
          max = 5;
        } else if (hint.includes('age')) {
          min = Math.max(min, 18);
          max = 65;
        } else if (hint.includes('year')) {
          min = Math.max(min, 2000);
          max = 2026;
        }
      }
      if (digitCap > 0) {
        const capMax = Math.pow(10, digitCap) - 1;
        if (max > capMax) max = capMax;
        if (min > max) min = 0;
      }
      if (max < min) max = min + 10;
      const steps = Math.max(0, Math.floor((max - min) / step));
      let val = min + randomInt(0, steps) * step;
      if (hint.includes('coin') && step === 1 && val >= 50 && max >= 50 && min <= 50) {
        val = Math.min(max, Math.max(min, Math.round(val / 50) * 50));
      }
      const decimals = stepDecimals(step);
      let str = decimals > 0 ? val.toFixed(decimals) : String(Math.round(val));
      if (maxLength > 0 && str.length > maxLength) {
        str = str.slice(0, maxLength);
      }
      return str;
    }

    if (type === 'date') {
      const minDate = parseYmdToDate(minAttr);
      const maxDate = parseYmdToDate(maxAttr);
      let base = new Date();
      if (minDate && maxDate && minDate <= maxDate) {
        const spanDays = Math.max(0, Math.floor((maxDate - minDate) / 86400000));
        base = new Date(minDate.getTime());
        base.setDate(base.getDate() + randomInt(0, spanDays));
      } else if (minDate) {
        base = new Date(minDate.getTime());
        base.setDate(base.getDate() + randomInt(0, 30));
      } else if (maxDate) {
        base = new Date(maxDate.getTime());
        base.setDate(base.getDate() - randomInt(0, 30));
      } else {
        base.setDate(base.getDate() + randomInt(-60, 60));
      }
      return formatDateYMD(base);
    }

    if (type === 'month') {
      const now = new Date();
      now.setMonth(now.getMonth() + randomInt(-6, 6));
      return formatMonthYM(now);
    }

    if (type === 'week') {
      const now = new Date();
      now.setDate(now.getDate() + randomInt(-42, 42));
      return formatWeekYW(now);
    }

    if (type === 'datetime-local') {
      const minDate = parseYmdToDate(minAttr);
      const maxDate = parseYmdToDate(maxAttr);
      let now = new Date();
      if (minDate && maxDate && minDate <= maxDate) {
        const spanDays = Math.max(0, Math.floor((maxDate - minDate) / 86400000));
        now = new Date(minDate.getTime());
        now.setDate(now.getDate() + randomInt(0, spanDays));
      } else if (minDate) {
        now = new Date(minDate.getTime());
        now.setDate(now.getDate() + randomInt(1, 14));
      } else if (maxDate) {
        now = new Date(maxDate.getTime());
        now.setDate(now.getDate() - randomInt(1, 14));
      } else {
        const offsetDays = hint.includes('expire') || hint.includes('end') ? randomInt(7, 30) : randomInt(0, 5);
        now.setDate(now.getDate() + offsetDays);
      }
      now.setHours(randomInt(8, 20), randomPick([0, 15, 30, 45]), 0, 0);
      return formatDateTimeLocal(now);
    }

    if (type === 'time') {
      const hour = hint.includes('end') ? randomInt(13, 23) : randomInt(6, 12);
      const min = randomPick(['00', '15', '30', '45']);
      return `${String(hour).padStart(2, '0')}:${min}`;
    }

    if (type === 'color') {
      const hex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
      return `#${hex}`;
    }

    if (type === 'password') {
      let pwd = `Pass#${randomInt(1000, 9999)}Xy!`;
      while (minLength > 0 && pwd.length < minLength) pwd += 'a1';
      if (maxLength > 0) pwd = pwd.slice(0, maxLength);
      if (patternAttr && !matchesPattern(pwd, patternAttr)) {
        const patVal = generatePatternFallback(patternAttr, minLength, maxLength);
        if (patVal) return patVal;
      }
      return pwd;
    }

    // Respect numeric-only text inputs (oninput stripping non-digits, inputmode="numeric", digits pattern, or numeric hints)
    const isNumericOnlyText =
      inputModeAttr === 'numeric' ||
      inputModeAttr === 'decimal' ||
      /\[\^0-9\]|\\D/.test(oninputAttr) ||
      /^\^?(?:\[0-9\]|\\d)/.test(patternAttr);

    if (isNumericOnlyText) {
      if (patternAttr) {
        const patVal = generatePatternFallback(patternAttr, minLength, maxLength);
        if (patVal) return patVal;
      }
      const targetLen = maxLength > 0 ? Math.min(maxLength, Math.max(minLength || 1, 3)) : Math.max(minLength || 1, 3);
      let digits = String(randomInt(Math.pow(10, Math.min(targetLen - 1, 6)), Math.pow(10, Math.min(targetLen, 7)) - 1));
      if (maxLength > 0) digits = digits.slice(0, maxLength);
      while (digits.length < minLength) digits += '5';
      return digits;
    }

    // Semantic text matching based on field name/id/wireModel/label/placeholder
    let generated = '';
    if (hint.includes('firstname') || hint === 'fname') {
      generated = randomPick(RANDOM_POOLS.firstNames);
    } else if (hint.includes('lastname') || hint === 'lname') {
      generated = randomPick(RANDOM_POOLS.lastNames);
    } else if (hint.includes('fullname')) {
      generated = `${randomPick(RANDOM_POOLS.firstNames)} ${randomPick(RANDOM_POOLS.lastNames)}`;
    } else if (hint.includes('username')) {
      generated = `${randomPick(RANDOM_POOLS.firstNames).toLowerCase()}_${randomInt(10, 99)}`;
    } else if (hint.includes('email')) {
      generated = `${randomPick(RANDOM_POOLS.firstNames).toLowerCase()}.${randomPick(RANDOM_POOLS.lastNames).toLowerCase()}@example.com`;
    } else if (hint.includes('phone') || hint.includes('mobile') || hint.includes('contact')) {
      const plainPhone = `9${randomInt(100000000, 999999999)}`;
      generated = maxLength > 0 && maxLength <= 10 ? plainPhone : `+91-${plainPhone}`;
    } else if (hint.includes('city')) {
      generated = randomPick(RANDOM_POOLS.cities);
    } else if (hint.includes('state')) {
      generated = randomPick(RANDOM_POOLS.states);
    } else if (hint.includes('country')) {
      generated = randomPick(RANDOM_POOLS.countries);
    } else if (hint.includes('zip') || hint.includes('postal') || hint.includes('pincode')) {
      generated = maxLength === 5 ? String(randomInt(10000, 99999)) : String(randomInt(100000, 999999));
    } else if (hint.includes('otp') || hint.includes('cvv') || hint === 'pin' || hint.endsWith('pin')) {
      const pinLen = maxLength > 0 ? Math.min(maxLength, 6) : hint.includes('cvv') ? 3 : 4;
      generated = String(randomInt(Math.pow(10, pinLen - 1), Math.pow(10, pinLen) - 1));
    } else if (hint.includes('age')) {
      generated = String(randomInt(18, 65));
    } else if (hint.includes('qty') || hint.includes('quantity') || hint.includes('count') || hint.includes('score') || hint.includes('limit')) {
      generated = String(randomInt(1, 25));
    } else if (hint.includes('amount') || hint.includes('price') || hint.includes('salary') || hint.includes('total')) {
      generated = String(randomInt(100, 5000));
    } else if (hint.includes('year')) {
      generated = String(randomInt(2015, 2026));
    } else if (hint.includes('address')) {
      generated = `${randomInt(12, 999)} Main Street, ${randomPick(RANDOM_POOLS.cities)}`;
    } else if (hint.includes('company') || hint.includes('org')) {
      generated = randomPick(RANDOM_POOLS.companies);
    } else if (hint.includes('department')) {
      generated = randomPick(RANDOM_POOLS.departments);
    } else if (hint.includes('role') || hint.includes('designation') || hint.includes('job')) {
      generated = randomPick(RANDOM_POOLS.roles);
    } else if (hint.includes('description') || hint.includes('note') || hint.includes('bio') || hint.includes('comment')) {
      generated = randomPick(RANDOM_POOLS.sentences);
    } else if (hint.includes('name') || hint.includes('title') || hint.includes('achievement')) {
      generated = `${randomPick(RANDOM_POOLS.adjectives)} ${randomPick(RANDOM_POOLS.nouns)} ${randomInt(10, 99)}`;
    } else if (hint.includes('code') || hint.includes('key') || hint === 'id') {
      generated = `ID-${randomInt(1000, 9999)}`;
    } else {
      generated = `${randomPick(RANDOM_POOLS.adjectives)} ${randomPick(RANDOM_POOLS.nouns)}`;
    }

    if (oninputAttr.includes('[^a-zA-Z0-9\\s]')) {
      generated = sanitizeCittaName(generated);
    }

    while (minLength > 0 && generated.length < minLength) {
      generated += ` ${randomPick(RANDOM_POOLS.nouns)}`;
    }

    if (maxLength > 0) {
      generated = generated.slice(0, maxLength);
    }

    if (patternAttr && !matchesPattern(generated, patternAttr)) {
      const patVal = generatePatternFallback(patternAttr, minLength, maxLength);
      if (patVal) generated = patVal;
    }

    return generated;
  }

  function inspectForRandom(includeHidden) {
    const items = [];
    const seenRadioNames = new Set();
    const elements = getEligibleElements();

    elements.forEach((el, idx) => {
      const hidden = isElementHidden(el);
      if (!includeHidden && hidden) return;

      const tag = el.isContentEditable ? 'contenteditable' : el.tagName.toLowerCase();
      const type = tag === 'input' ? String(el.type || 'text').toLowerCase() : '';
      const wireModel = getWireModel(el);
      const label = getAssociatedLabels(el)[0] || el.getAttribute('aria-label') || '';

      if (type === 'radio' && el.name) {
        if (seenRadioNames.has(el.name)) return;
        seenRadioNames.add(el.name);
        const radioScope = el.form || document;
        const groupEls = Array.from(radioScope.querySelectorAll('input[type="radio"]')).filter(
          (r) => r.name === el.name && !r.disabled
        );
        const options = groupEls.map((r) => ({
          value: r.value,
          textContent: getAssociatedLabels(r)[0] || r.value,
        }));
        const desc = {
          key: `radio:${el.name}`,
          tag: 'input',
          type: 'radio',
          name: el.name,
          id: el.id || '',
          wireModel,
          label: label || el.name,
          placeholder: '',
          hidden,
          multiple: false,
          options,
        };
        desc.randomValue = generateRandomValue(desc);
        items.push(desc);
        return;
      }

      const key = getFieldStableKey(el, idx);
      const options = tag === 'select'
        ? getValidSelectOptions(el).map((o) => ({ value: o.value, textContent: o.textContent.trim() }))
        : undefined;

      const desc = {
        key,
        tag,
        type,
        name: el.name || '',
        id: el.id || '',
        wireModel,
        label,
        placeholder: el.placeholder || '',
        hidden,
        multiple: Boolean(el.multiple),
        min: el.min || '',
        max: el.max || '',
        step: el.step || '',
        maxLength: el.maxLength > 0 ? el.maxLength : 0,
        options,
      };
      desc.randomValue = generateRandomValue(el);
      items.push(desc);
    });

    return items;
  }

  function isElementAlreadyFilled(el) {
    if (el.isContentEditable) return el.textContent.trim() !== '';
    const tag = el.tagName.toLowerCase();
    const type = tag === 'input' ? String(el.type || 'text').toLowerCase() : tag;
    if (type === 'checkbox') return el.checked;
    if (type === 'radio') {
      if (!el.name) return el.checked;
      const radioScope = el.form || document;
      return Array.from(radioScope.querySelectorAll('input[type="radio"]')).some(
        (r) => r.name === el.name && r.checked
      );
    }
    if (tag === 'select') {
      const selOpt = el.selectedOptions && el.selectedOptions[0];
      if (selOpt && isPlaceholderOption(selOpt)) return false;
    }
    return String(el.value ?? '').trim() !== '';
  }

  function runRandomPass(opts, alreadyFilled, radioGroupChoice, intendedByKey) {
    const elements = getEligibleElements();
    const filledFields = [];
    const filledRadioGroups = new Set();
    const triggeredWireModels = new Set();
    const checkboxGroups = new Map();
    let filledCount = 0;

    const filledInteractive = [];
    elements.forEach((el, idx) => {
      if (alreadyFilled.has(el)) return;
      if (!opts.includeHidden && isElementHidden(el)) return;
      if (!opts.overwrite && isElementAlreadyFilled(el)) return;

      const tag = el.isContentEditable ? 'contenteditable' : el.tagName.toLowerCase();
      const type = tag === 'input' ? String(el.type || 'text').toLowerCase() : '';
      const wireModel = getWireModel(el);

      if (type === 'radio') {
        if (el.name) {
          if (filledRadioGroups.has(el.name)) return;
          const radioKey = `radio:${el.name}`;
          const radioScope = el.form || document;
          const groupEls = Array.from(radioScope.querySelectorAll('input[type="radio"]')).filter(
            (r) => r.name === el.name && !r.disabled
          );
          let targetVal = opts.previewValues && Object.prototype.hasOwnProperty.call(opts.previewValues, radioKey)
            ? opts.previewValues[radioKey]
            : radioGroupChoice.get(el.name);
          if (!targetVal && groupEls.length > 0) {
            targetVal = randomPick(groupEls).value;
            radioGroupChoice.set(el.name, targetVal);
          }
          const chosenRadio =
            groupEls.find(
              (r) =>
                normalizeKey(r.value) === normalizeKey(targetVal) ||
                getAssociatedLabels(r).some((l) => normalizeKey(l) === normalizeKey(targetVal))
            ) || groupEls[0];
          if (chosenRadio) {
            if (!fillElement(chosenRadio, targetVal)) {
              setNativeChecked(chosenRadio, true);
              dispatchEvents(chosenRadio);
            }
            filledRadioGroups.add(el.name);
            groupEls.forEach((r) => alreadyFilled.add(r));
            highlightElement(chosenRadio);
            filledCount += 1;
            filledFields.push(el.name);
            filledInteractive.push(chosenRadio);
          }
          return;
        }
        setNativeChecked(el, true);
        dispatchEvents(el);
        alreadyFilled.add(el);
        highlightElement(el);
        filledCount += 1;
        filledFields.push(wireModel || el.id || 'radio');
        filledInteractive.push(el);
        return;
      }

      if (type === 'checkbox' && el.name) {
        const list = checkboxGroups.get(el.name) || [];
        list.push(el);
        checkboxGroups.set(el.name, list);
      }

      const key = getFieldStableKey(el, idx);
      const val = opts.previewValues && Object.prototype.hasOwnProperty.call(opts.previewValues, key)
        ? opts.previewValues[key]
        : generateRandomValue(el);

      if (val === '' && tag === 'select') return;
      if (val === '' || val === null || val === undefined) return;

      let appliedVal = val;
      let didFill = fillElement(el, appliedVal);

      // If a page input mask (e.g., JS digits-only listener) cleared the input back to "", retry with safe digits
      if (
        didFill &&
        tag === 'input' &&
        type !== 'checkbox' &&
        type !== 'radio' &&
        String(el.value ?? '').trim() === ''
      ) {
        const numericFallback = String(randomInt(100, 9999)).slice(
          0,
          Number.isFinite(el.maxLength) && el.maxLength > 0 ? el.maxLength : 6
        );
        if (fillElement(el, numericFallback) && String(el.value ?? '').trim() !== '') {
          appliedVal = numericFallback;
        }
      }

      if (didFill) {
        alreadyFilled.add(el);
        if (intendedByKey && !key.startsWith('idx:')) {
          intendedByKey.set(key, {
            rawValue: appliedVal,
            type: type || tag,
          });
        }
        highlightElement(el);
        if (wireModel) triggeredWireModels.add(wireModel);
        filledCount += 1;
        filledFields.push(wireModel || el.name || el.id || el.placeholder || tag);
        if (tag === 'select' || type === 'checkbox') {
          filledInteractive.push(el);
        }
      }
    });

    // Ensure multi-checkbox groups never end up 100% unchecked when random-filling
    if (!opts.previewValues) {
      for (const [, group] of checkboxGroups.entries()) {
        if (group.length > 1 && group.every((cb) => !cb.checked)) {
          const pickCb = randomPick(group);
          setNativeChecked(pickCb, true);
          dispatchEvents(pickCb);
          highlightElement(pickCb);
        }
      }
    }

    return {
      filledCount,
      totalFields: elements.length,
      filledFields,
      triggeredWireModels,
      filledInteractiveCount: filledInteractive.length,
    };
  }

  async function fillPageRandom(options) {
    const opts = {
      overwrite: options && options.overwrite !== undefined ? Boolean(options.overwrite) : true,
      includeHidden: Boolean(options && options.includeHidden),
      previewValues: options && options.previewValues ? options.previewValues : null,
    };

    const alreadyFilled = new Set();
    const radioGroupChoice = new Map();
    const intendedByKey = new Map();
    const pass1 = runRandomPass(opts, alreadyFilled, radioGroupChoice, intendedByKey);
    let totalFilledCount = pass1.filledCount;
    const allFilledFields = [...pass1.filledFields];
    let latestTotalFields = pass1.totalFields;

    const hasLivewire = Boolean(document.querySelector('[wire\\:id]'));
    const livewireTriggers = ['actionType', 'rewardType', 'achievementCategoryId', 'duration'];
    const hasCittaLivewireTrigger =
      hasLivewire && livewireTriggers.some((t) => pass1.triggeredWireModels.has(t));

    if (hasCittaLivewireTrigger) {
      await waitForLivewireReady(() => {
        const dynamicWraps = [
          '#selectGames',
          '#selectLeaderboard',
          '#selectProduct',
          '#selectProfileUpdateCategory',
          '[wire\\:model\\.live="reward_coins"]',
          '[wire\\:model\\.live="reward_game_ids"]',
          '[wire\\:model\\.live="weekStartDay"]',
        ];
        return dynamicWraps.some((sel) => {
          const wrap = document.querySelector(sel)?.closest('.col-md-3, .col-md-4');
          return wrap && !wrap.classList.contains('d-none');
        });
      }, 1400);

      for (const el of Array.from(alreadyFilled)) {
        const wm = getWireModel(el);
        if (wm === 'bet_coin' || wm === 'parentAchievementConfigId') {
          alreadyFilled.delete(el);
        }
      }

      const pass2 = runRandomPass(opts, alreadyFilled, radioGroupChoice, intendedByKey);
      totalFilledCount += pass2.filledCount;
      allFilledFields.push(...pass2.filledFields);
      latestTotalFields = pass2.totalFields;

      if (pass2.triggeredWireModels.has('reward_game_ids') || pass1.triggeredWireModels.has('reward_game_ids')) {
        const betCoinEl = document.querySelector('[wire\\:model\\.live="bet_coin"], [wire\\:model="bet_coin"]');
        if (betCoinEl) {
          await waitForLivewireReady(() => betCoinEl.options && betCoinEl.options.length > 1, 1600);
          alreadyFilled.delete(betCoinEl);
          const pass3 = runRandomPass(opts, alreadyFilled, radioGroupChoice, intendedByKey);
          totalFilledCount += pass3.filledCount;
          allFilledFields.push(...pass3.filledFields);
          latestTotalFields = pass3.totalFields;
        }
      }
    } else if (pass1.filledInteractiveCount > 0) {
      const hasPendingEmptySelect = () =>
        getEligibleElements().some(
          (el) =>
            !alreadyFilled.has(el) &&
            el.tagName &&
            el.tagName.toLowerCase() === 'select' &&
            getValidSelectOptions(el).length === 0
        );

      const hasUnfilledSelectOrNew = () =>
        getEligibleElements().some((el) => {
          if (alreadyFilled.has(el)) return false;
          if (!opts.includeHidden && isElementHidden(el)) return false;
          if (el.tagName && el.tagName.toLowerCase() === 'select') {
            return getValidSelectOptions(el).length > 0;
          }
          return true;
        });

      const waitMs1 = hasLivewire ? 1200 : hasPendingEmptySelect() ? 900 : 180;
      await waitForLivewireReady(hasUnfilledSelectOrNew, waitMs1);
      const pass2 = runRandomPass(opts, alreadyFilled, radioGroupChoice, intendedByKey);
      totalFilledCount += pass2.filledCount;
      allFilledFields.push(...pass2.filledFields);
      latestTotalFields = pass2.totalFields;

      if (pass2.filledInteractiveCount > 0) {
        const waitMs2 = hasLivewire ? 900 : hasPendingEmptySelect() ? 700 : 160;
        await waitForLivewireReady(hasUnfilledSelectOrNew, waitMs2);
        const pass3 = runRandomPass(opts, alreadyFilled, radioGroupChoice, intendedByKey);
        totalFilledCount += pass3.filledCount;
        allFilledFields.push(...pass3.filledFields);
        latestTotalFields = pass3.totalFields;
      }
    }

    if (hasLivewire || pass1.filledInteractiveCount > 0) {
      await sleep(180);
      if (reconcileMorphedInputs(intendedByKey)) {
        await sleep(160);
      }
    }

    // Final verification sweep: check every visible eligible field and fill any that are still empty
    for (let verifyRound = 0; verifyRound < 3; verifyRound += 1) {
      reconcileMorphedInputs(intendedByKey);
      const remainingEmpty = getEligibleElements().filter((el) => {
        if (!opts.includeHidden && isElementHidden(el)) return false;
        return isFieldStillEmpty(el);
      });
      if (remainingEmpty.length === 0) break;

      remainingEmpty.forEach((el) => alreadyFilled.delete(el));
      const sweepPass = runRandomPass(
        { ...opts, overwrite: true },
        alreadyFilled,
        radioGroupChoice,
        intendedByKey
      );
      totalFilledCount += sweepPass.filledCount;
      allFilledFields.push(...sweepPass.filledFields);
      latestTotalFields = sweepPass.totalFields;

      if (sweepPass.filledCount === 0) break;
      await sleep(160);
    }

    return {
      filledCount: totalFilledCount,
      totalFields: latestTotalFields,
      filledFields: Array.from(new Set(allFilledFields)),
    };
  }

  async function sweepEmptyFieldsRandom(options) {
    const opts = {
      overwrite: true,
      includeHidden: Boolean(options && options.includeHidden),
      previewValues: options && options.previewValues ? options.previewValues : null,
    };
    const hasLivewire = Boolean(document.querySelector('[wire\\:id]'));
    const hasNewEmptyVisible = () =>
      getEligibleElements().some((el) => {
        if (!opts.includeHidden && isElementHidden(el)) return false;
        return isFieldStillEmpty(el);
      });

    await waitForLivewireReady(hasNewEmptyVisible, hasLivewire ? 1100 : 320);

    let totalFilledCount = 0;
    const allFilledFields = [];
    let latestTotalFields = 0;

    for (let round = 0; round < 3; round += 1) {
      const elements = getEligibleElements();
      latestTotalFields = elements.length;
      const alreadyFilled = new Set();
      let emptyCount = 0;

      elements.forEach((el) => {
        if (!opts.includeHidden && isElementHidden(el)) {
          alreadyFilled.add(el);
          return;
        }
        if (isFieldStillEmpty(el)) {
          emptyCount += 1;
        } else {
          alreadyFilled.add(el);
        }
      });

      if (emptyCount === 0) break;

      const pass = runRandomPass(opts, alreadyFilled, new Map(), new Map());
      totalFilledCount += pass.filledCount;
      allFilledFields.push(...pass.filledFields);
      latestTotalFields = pass.totalFields;

      if (pass.filledCount === 0) break;
      await sleep(hasLivewire ? 260 : 160);
    }

    return {
      filledCount: totalFilledCount,
      totalFields: latestTotalFields,
      filledFields: Array.from(new Set(allFilledFields)),
    };
  }

  window.__CSV_EXTENSION_FILLER__ = {
    fillPage,
    scanFields,
    deriveCittaAchievementFields,
    findBestSelectOption,
    generateRandomValue,
    inspectForRandom,
    fillPageRandom,
    sweepEmptyFieldsRandom,
    normalizeDateTimeLocalValue,
    normalizeTimeValue,
  };
})();
