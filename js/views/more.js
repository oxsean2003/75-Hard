// "More" tab: rules, settings, backup.
(function (root) {
  'use strict';

  const ui = { sub: 'rules' };
  const SUBS = [['rules', 'חוקים'], ['plan', 'תוכנית אימונים'], ['settings', 'הגדרות'], ['backup', 'גיבוי']];

  function rulesHtml(app) {
    const { esc } = app;
    const names = app.state.settings.ruleNames;
    const sections = Rules.SECTIONS.map((s) => `<details class="card" open><summary>${esc(s.title)}</summary>
      <ul class="plain">${s.items.map((t) => `<li>${esc(t)}</li>`).join('')}
      ${s.id === 'digital' ? `<li>${esc(names.r2)}</li><li>${esc(names.r3)}</li>` : ''}</ul></details>`).join('');
    return `${sections}<div class="card reset"><h2 class="sub-h">סעיף האיפוס</h2><p>${esc(Rules.RESET)}</p></div>`;
  }

  function render(app) {
    const body = ui.sub === 'settings' ? Views.settings.settingsHtml(app)
      : ui.sub === 'plan' ? Views.settings.planHtml(app)
      : ui.sub === 'backup' ? Views.settings.backupHtml(app) : rulesHtml(app);
    return `<h1 class="page-h">עוד</h1>
      <div class="pills">${SUBS.map(([id, t]) => `<button class="pill${ui.sub === id ? ' on' : ''}" data-act="moreSub" data-id="${id}">${t}</button>`).join('')}</div>
      ${body}`;
  }

  function wire(app) {
    app.act('moreSub', (el) => { ui.sub = el.dataset.id; app.render(); });
    app.act('goBackup', () => { ui.sub = 'backup'; app.go('more'); });
  }

  root.Views = root.Views || {};
  root.Views.more = { render, wire };
})(typeof globalThis !== 'undefined' ? globalThis : this);
