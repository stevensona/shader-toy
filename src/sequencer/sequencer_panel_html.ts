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
    #toolbar { flex: 0 0 auto; padding: 6px 8px; background: #1e1e1e; color: #ddd; font-family: Consolas, monospace; font-size: 12px; border-bottom: 1px solid #333; display: flex; flex-direction: column; align-items: stretch; gap: 6px; }
    #toolbar .toolbar-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    #toolbar .toolbar-row.status { justify-content: flex-start; color: #c586c0; }
    #toolbar button { cursor: pointer; border: 1px solid #333; border-radius: 3px; background: #252526; color: #ddd; font-family: Consolas, monospace; font-size: 12px; height: 22px; padding: 0 8px; }
    #toolbar button:hover:not(:disabled) { background: rgba(0,0,0,0.35); }
    #toolbar button:active:not(:disabled) { background: rgba(0,0,0,0.45); }
    #toolbar button.on { background: rgba(156, 220, 254, 0.18); border-color: rgba(156, 220, 254, 0.35); color: #9cdcfe; }
    #toolbar button:disabled { opacity: 0.45; cursor: default; }
    #toolbar select, #toolbar input { background: #252526; color: #ddd; border: 1px solid #333; padding: 2px 4px; }
    #toolbar #sequencer_time_label { display: inline-block; min-width: 72px; color: #9cdcfe; }
    #toolbar #sequencer_key_id { color: #c586c0; }
    #content { flex: 1 1 auto; min-height: 0; display: flex; }
    #sequencer_outline { flex: 0 0 220px; min-width: 160px; max-width: 360px; overflow: auto; background: #1e1e1e; border-right: 1px solid #333; font-family: Consolas, monospace; font-size: 12px; color: #ddd; }
    #sequencer_outline .outline-header-spacer { height: 48px; border-bottom: 1px solid #333; }
    #sequencer_outline .outline-item { height: 24px; padding: 0 6px; border-bottom: 2px solid transparent; cursor: pointer; user-select: none; display: flex; align-items: center; gap: 6px; }
    #sequencer_outline .outline-controls { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
    #sequencer_outline .outline-btn { width: 18px; height: 18px; padding: 0; margin: 0; border: 1px solid #333; border-radius: 3px; background: #252526; color: #ddd; font-family: Consolas, monospace; font-size: 10px; line-height: 16px; cursor: pointer; }
    #sequencer_outline .outline-btn.on { background: rgba(156, 220, 254, 0.18); border-color: rgba(156, 220, 254, 0.35); color: #9cdcfe; }
    #sequencer_outline .outline-btn.off { opacity: 0.55; }
    #sequencer_outline .outline-label { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 24px; }
    #sequencer_outline .outline-item.selected { background: rgba(156, 220, 254, 0.12); }
    #sequencer { flex: 1 1 auto; min-width: 0; }
  </style>
</head>
<body>
  <div id="toolbar">
    <div class="toolbar-row">
      <button id="sequencer_export" type="button">Export JSON</button>
      <button id="sequencer_import" type="button">Import JSON</button>
    </div>

    <div class="toolbar-row">
      <button id="sequencer_play_pause" type="button">Play</button>
      <button id="sequencer_loop" type="button">Loop: On</button>

      <span>Time:</span>
      <span id="sequencer_time_label">0.00 s</span>

      <label for="sequencer_scope_start">Start:</label>
      <input id="sequencer_scope_start" type="number" step="any" style="width: 96px;" />
      <label for="sequencer_scope_end">End:</label>
      <input id="sequencer_scope_end" type="number" step="any" style="width: 96px;" />

      <label for="sequencer_snap_step">Snap:</label>
      <select id="sequencer_snap_step" style="width: 78px;"></select>
    </div>

    <div class="toolbar-row">
      <label for="sequencer_track_select">Track:</label>
      <select id="sequencer_track_select"></select>

      <label for="sequencer_value_input">Value:</label>
      <input id="sequencer_value_input" type="number" step="any" style="width: 120px;" />

      <button id="sequencer_add_key" type="button">Add/Replace</button>
      <button id="sequencer_update_key" type="button">Update</button>
      <button id="sequencer_delete_key" type="button">Delete</button>
    </div>

    <div class="toolbar-row status">
      <span id="sequencer_key_id"></span>
    </div>
  </div>
  <div id="content">
    <div id="sequencer_outline"></div>
    <div id="sequencer"></div>
  </div>
  <script src="${timelineSrc}"></script>
  <script src="${panelScriptSrc}"></script>
</body>
</html>`;
};
