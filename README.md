# Form Auto-Filler (CSV Form Auto-Filler)

A Manifest V3 Chrome Extension for inspecting web forms, auto-filling them with smart random test data, or importing tabular records from CSV and document/spreadsheet files to fill forms by record ID.

---

## Folder & File Structure

```text
form-filler-chrome-extension/
├── manifest.json                         # Chrome Extension MV3 manifest & permissions
├── README.md                             # Project documentation & architecture flow
├── assets/
│   └── logos/
│       ├── logo16.png
│       ├── logo48.png
│       └── logo128.png
└── src/
    ├── constants/
    │   ├── app-constants.js              # Storage keys, popup routes, limits, sample CSV & preset mappings
    │   ├── parser-constants.js           # CSV delimiters, ID column candidates, PDF escapes & file signatures
    │   └── filler-constants.js           # Input filters, aliases, Livewire triggers, chrome selectors & random pools
    ├── parsers/
    │   ├── csv-parser.js                 # RFC-4180 CSV/TSV parser, delimiter & ID detector, record indexer
    │   └── file-importer.js              # Multi-format importer (XLSX, ODS, DOCX, PDF, RTF, HTML, JSON, Markdown, XML)
    ├── content/
    │   └── content-filler.js             # Injected page scanner, smart field matcher, form filler & random generator
    └── popup/
        ├── popup.html                    # Extension popup & stay-open window markup
        ├── popup.css                     # Popup styling & animations
        └── popup.js                      # Popup state, chrome.storage persistence, UI rendering & scripting bridge
```

---

## Architecture & Data Flow

1. **Constants Layer (`src/constants/`)**
   - Centralizes all static configuration, lookup tables, preset mappings, DOM filter selectors, and random data pools away from runtime logic.
   - [`app-constants.js`](src/constants/app-constants.js): Loaded by `popup.html` as `window.AppConstants` (`STORAGE_KEYS`, `POPUP_ROUTES`, `PINNED_WINDOW_SIZE`, `LIMITS`, `SAMPLE_CSV`, `ACHIEVEMENT_PRESET_MAPPINGS`, `PREVIEW_HEADER_PREFERENCE_GROUPS`, `DATETIME_DEFAULT_KEYS`, `TIME_DEFAULT_KEYS`).
   - [`parser-constants.js`](src/constants/parser-constants.js): Loaded by `csv-parser.js` and `file-importer.js` as `ParserConstants` (`CSV_DELIMITERS`, `ID_CANDIDATES`, `JSON_COLLECTION_KEYS`, `PDF_ESCAPE_MAP`, `FILE_SIGNATURES`, `PARSER_MESSAGES`).
   - [`filler-constants.js`](src/constants/filler-constants.js): Injected before `content-filler.js` as `FillerConstants` (`IGNORED_INPUT_TYPES`, `TRUTHY_VALUES`, `FALSY_VALUES`, `SELECT_ALIASES`, `DEFAULT_FIELD_ALIASES`, `ACHIEVEMENT_FIELD_MAP`, `LIVEWIRE_TRIGGER_MODELS`, `LIVEWIRE_DYNAMIC_WRAPS`, `CHROME_CONTAINER_SELECTOR`, `SIDEBAR_CLASS_SELECTOR`, `RANDOM_POOLS`).

2. **Parsers Layer (`src/parsers/`)**
   - [`csv-parser.js`](src/parsers/csv-parser.js): Parses delimited text (`parseCSVRows`, `parseCSV`), detects delimiters and ID columns (`detectIdColumn`), deduplicates headers (`deduplicateHeaders`), and indexes rows (`buildIndex`).
   - [`file-importer.js`](src/parsers/file-importer.js): Detects binary signatures/text formats and normalizes `.xlsx`, `.ods`, `.docx`, `.pdf`, `.rtf`, HTML `<table>`, XML, Markdown tables, and JSON into a unified dataset matrix (`importFile`, `parseArrayBuffer`, `parseTextToMatrix`, `matrixToDataset`).

3. **Popup Controller (`src/popup/`)**
   - [`popup.html`](src/popup/popup.html) + [`popup.css`](src/popup/popup.css) + [`popup.js`](src/popup/popup.js): Manages tabs (`1. Random Data Fill` and `2. CSV & Fill Page`), drag-and-drop/file upload/paste imports, Quick ID searchable dropdown, record cards, Defaults & Field Mapping, JSON config export/import, and stay-open popup windows (`📌 Keep Open`).
   - Injects `['src/constants/filler-constants.js', 'src/content/content-filler.js']` into all frames of the active tab via `chrome.scripting.executeScript`.

4. **Injected Page Engine (`src/content/`)**
   - [`content-filler.js`](src/content/content-filler.js): Exposes `window.__CSV_EXTENSION_FILLER__` on the target page to scan eligible fields (`scanFields`), fill records/defaults (`fillPage`), generate/preview/apply random values (`generateRandomValue`, `inspectForRandom`, `fillPageRandom`, `sweepEmptyFieldsRandom`), and handle multi-pass Livewire updates, Select2 syncs, and DOM morph reconciliation.

---

## Features

- **Random Data Fill**: Auto-generates valid values by `tagName`, `type`, `name`, `id`, `wire:model`, `label`, `placeholder`, and HTML constraints (`min`, `max`, `step`, `minLength`, `maxLength`, `pattern`, `inputmode`), with inline preview editing and single/full re-roll.
- **Multi-Format Import**: Upload, drag-and-drop, or paste CSV, TSV, Excel (`.xlsx`), OpenDocument (`.ods`), Word (`.docx`), PDF (`.pdf`), RTF (`.rtf`), JSON, Markdown tables, XML, or HTML tables.
- **Defaults, Mappings & Config Sharing**: Configure fallback defaults, map dataset columns to page fields (including **Achievement Preset**), and share configs via JSON clipboard copy/import (Merge or Replace).
- **Stay-Open Mode**: Launch a persistent popup window bound to the target browser tab.

---

## Installation (Load Unpacked in Chrome)

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `form-filler-chrome-extension` folder.
5. Pin **CSV Form Auto-Filler** from the Chrome Extensions menu.

---

## Permissions

Declared in [`manifest.json`](manifest.json):
- `storage`: Persists imported datasets, ID column selection, custom mappings, default fields, and active UI tab in `chrome.storage.local`.
- `activeTab`: Grants temporary access to the active tab when interacting with the extension.
- `scripting`: Injects `src/constants/filler-constants.js` and `src/content/content-filler.js`, and runs Select2 `MAIN`-world sync on the active tab.
- `host_permissions`: `http://localhost:3000/*` and `http://127.0.0.1:3000/*`.
