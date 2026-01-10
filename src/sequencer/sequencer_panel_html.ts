'use strict';

export const getSequencerPanelHtml = (timelineSrc: string, panelScriptSrc: string): string => {
    return `\
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    body { display: flex; flex-direction: column; }
    #toolbar { flex: 0 0 auto; padding: 6px 8px; background: #1e1e1e; color: #ddd; font-family: Consolas, monospace; font-size: 12px; border-bottom: 1px solid #333; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    #toolbar button { cursor: pointer; }
    #toolbar select, #toolbar input { background: #252526; color: #ddd; border: 1px solid #333; padding: 2px 4px; }
    #toolbar .spacer { display: inline-block; width: 12px; }
    #toolbar #sequencer_time_label { display: inline-block; min-width: 72px; color: #9cdcfe; }
    #toolbar #sequencer_key_id { color: #c586c0; }
    #sequencer { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="sequencer_play_pause" type="button">Play</button>
    <button id="sequencer_loop" type="button">Loop: On</button>
    <button id="sequencer_export" type="button">Export JSON</button>
    <button id="sequencer_import" type="button">Import JSON</button>
    <span class="spacer"></span>
    <span>Time:</span>
    <span id="sequencer_time_label">0.00 s</span>

    <span class="spacer"></span>
    <label for="sequencer_scope_start">Start:</label>
    <input id="sequencer_scope_start" type="number" step="any" style="width: 96px;" />
    <label for="sequencer_scope_end">End:</label>
    <input id="sequencer_scope_end" type="number" step="any" style="width: 96px;" />

    <span class="spacer"></span>
    <label for="sequencer_track_select">Track:</label>
    <select id="sequencer_track_select"></select>

    <label for="sequencer_value_input">Value:</label>
    <input id="sequencer_value_input" type="number" step="any" style="width: 120px;" />

    <button id="sequencer_add_key" type="button">Add/Replace Key</button>
    <button id="sequencer_update_key" type="button">Update Selected</button>
    <button id="sequencer_delete_key" type="button">Delete Selected</button>
    <span id="sequencer_key_id"></span>
  </div>
  <div id="sequencer"></div>
  <script src="${timelineSrc}"></script>
  <script src="${panelScriptSrc}"></script>
</body>
</html>`;
};
