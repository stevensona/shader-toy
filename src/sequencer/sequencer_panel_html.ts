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
    #toolbar { flex: 0 0 auto; padding: 6px 8px; background: #1e1e1e; color: #ddd; font-family: Consolas, monospace; font-size: 12px; border-bottom: 1px solid #333; }
    #toolbar button { cursor: pointer; }
    #toolbar .spacer { display: inline-block; width: 12px; }
    #toolbar #sequencer_time_label { display: inline-block; min-width: 72px; color: #9cdcfe; }
    #sequencer { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="sequencer_play_pause" type="button">Play</button>
    <span class="spacer"></span>
    <span>Time:</span>
    <span id="sequencer_time_label">0.00 s</span>
  </div>
  <div id="sequencer"></div>
  <script>
    window.ShaderToySequencerPanel = window.ShaderToySequencerPanel || {};
    window.ShaderToySequencerPanel.hacks = window.ShaderToySequencerPanel.hacks || {};

    // Non-standard tweak: change gauge text from ms -> seconds.
    window.ShaderToySequencerPanel.hacks.formatUnitsText = (val) => {
      const seconds = (val || 0) / 1000;
      return seconds.toFixed(2) + ' s';
    };
  </script>
  <script src="${timelineSrc}"></script>
  <script src="${panelScriptSrc}"></script>
</body>
</html>`;
};
