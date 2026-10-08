// Settings, reminder times and backup/restore (all on-device).
(function (root) {
  'use strict';

  const D = Day;

  // ---- file helpers ----
  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  // iOS: the share sheet offers "Save to Files"; elsewhere fall back to a download.
  async function saveFile(name, text) {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return true; }
      catch (e) { if (e && e.name === 'AbortError') return false; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return true;
  }

  const stamp = () => new Date().toISOString().slice(0, 10);

  function backupAgo(app) {
    const t = app.state.lastBackupAt;
    if (!t) return 'עוד לא בוצע גיבוי';
    const days = Math.floor((app.now() - t) / 86400000);
    return days <= 0 ? 'גיבוי אחרון: היום' : `גיבוי אחרון: לפני ${days} ימים`;
  }

  function settingsHtml(app) {
    const { esc } = app, s = app.state.settings;
    const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, t]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    const rem = Reminders.LIST.map((r) => `<label class="field rm"><span>${esc(r.label)}</span>
      <input type="time" id="rm_${r.id}" value="${esc(s.reminders[r.id] || '')}"></label>`).join('');
    return `<div class="card">
        <h2 class="sub-h">יום ושעות</h2>
        <label class="field"><span>שעת סגירה אוטומטית של היום</span>
          ${sel('stCutoff', [[3, '03:00'], [4, '04:00'], [5, '05:00'], [6, '06:00'], [7, '07:00']], s.cutoffHour)}</label>
        <p class="note-l">אם לא לחצתם "סיים את היום", הוא ייסגר אוטומטית בשעה הזו. שינוי באמצע האתגר משפיע מיד.</p>
        <label class="field"><span>מרווח מינימלי בין האימונים</span>
          ${sel('stGap', [[3, '3 שעות'], [3.5, '3.5 שעות'], [4, '4 שעות']], s.gapHours)}</label>
        <div class="two"><label class="field"><span>גודל בקבוק (מ״ל)</span><input type="number" id="stBottle" inputmode="numeric" min="100" max="3000" value="${s.bottleMl}"></label>
        <label class="field"><span>גודל כוס (מ״ל)</span><input type="number" id="stGlass" inputmode="numeric" min="50" max="1000" value="${s.glassMl}"></label></div>
        <h2 class="sub-h">שמות הכללים האישיים</h2>
        <p class="note-l">השמות נשמרים רק במכשיר שלכם.</p>
        <label class="field"><span>כלל אישי 2 (יומי)</span><input type="text" id="stR2" maxlength="60" value="${esc(s.ruleNames.r2)}"></label>
        <label class="field"><span>כלל אישי 3 (מוגבל בשבוע)</span><input type="text" id="stR3" maxlength="60" value="${esc(s.ruleNames.r3)}"></label>
        <h2 class="sub-h">שעות תזכורת</h2>
        <p class="note-l">מופיעות כהודעה באפליקציה כשהזמן עבר והמשימה עוד לא בוצעה. בלי שרת, אייפון לא יכול לשלוח התראות כשהאפליקציה סגורה — להתראות אמיתיות צרו תזכורות באפליקציית "תזכורות" או "שעון" (הרשימה למטה).</p>
        <div class="rmgrid">${rem}</div>
        <button class="btn primary" data-act="saveSettings">שמירת הגדרות</button></div>
      <div class="card"><h2 class="sub-h">רשימה ליצירה ב"תזכורות" של האייפון</h2>
        <pre class="remlist">${esc(Reminders.text(app.state))}</pre>
        <button class="btn" data-act="copyReminders">העתקת הרשימה</button></div>`;
  }

  function backupHtml(app) {
    return `<div class="card"><h2 class="sub-h">גיבוי ושחזור</h2>
      <p>כל הנתונים נשמרים רק בדפדפן של המכשיר הזה. מחיקת נתוני אתר או החלפת טלפון מוחקות אותם — לכן שווה לגבות.</p>
      <p class="note-l">${esc0(backupAgo(app))}</p>
      <div class="btns col">
        <button class="btn primary" data-act="exportBackup" data-full="1">גיבוי מלא (כולל תמונות)</button>
        <button class="btn" data-act="exportBackup" data-full="0">גיבוי נתונים בלבד (קטן, בלי תמונות)</button>
        <label class="btn">שחזור מקובץ גיבוי<input class="vh" type="file" accept=".json,application/json" data-change="importPicked"></label>
      </div></div>
      <div class="card"><h2 class="sub-h">איפוס</h2>
        <p class="note-l">מוחק את כל הנתונים והתמונות מהמכשיר ומחזיר את האפליקציה להתחלה.</p>
        <button class="btn danger" data-act="resetAll">מחיקת הכול</button></div>`;
  }
  const esc0 = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function wire(app) {
    app.act('saveSettings', () => {
      const v = (id) => document.getElementById(id).value;
      const s = app.state.settings;
      const bottle = parseInt(v('stBottle'), 10), glass = parseInt(v('stGlass'), 10);
      if (!(bottle >= 100 && bottle <= 3000) || !(glass >= 50 && glass <= 1000)) { app.toast('גודל בקבוק או כוס לא תקין'); return; }
      s.cutoffHour = parseInt(v('stCutoff'), 10);
      s.gapHours = Number(v('stGap'));
      s.bottleMl = bottle; s.glassMl = glass;
      s.ruleNames.r2 = v('stR2').trim() || 'כלל אישי 2';
      s.ruleNames.r3 = v('stR3').trim() || 'כלל אישי 3 — מקס׳ פעם בשבוע';
      Reminders.LIST.forEach((r) => { const t = v('rm_' + r.id); if (Reminders.minutes(t) != null) s.reminders[r.id] = t; });
      D.sync(app.state, app.now());
      app.commit(); app.render(); app.toast('ההגדרות נשמרו');
    });

    app.act('copyReminders', async () => {
      try { await navigator.clipboard.writeText(Reminders.text(app.state)); app.toast('הרשימה הועתקה'); }
      catch (e) { app.toast('אי אפשר להעתיק אוטומטית — סמנו את הטקסט ידנית', 4000); }
    });

    app.act('exportBackup', async (el) => {
      const full = el.dataset.full === '1';
      try {
        const payload = { app: '75hard', exportedAt: Date.now(), state: app.state };
        if (full) {
          payload.photos = {};
          for (const k of await Photos.keys()) payload.photos[k] = await blobToDataUrl(await Photos.get(k));
        }
        const ok = await saveFile(`75hard-backup-${stamp()}${full ? '-full' : ''}.json`, JSON.stringify(payload));
        if (ok) { app.state.lastBackupAt = app.now(); app.commit(); app.render(); app.toast('הגיבוי נשמר'); }
      } catch (e) { app.toast('הגיבוי נכשל. נסו שוב.', 4000); }
    });

    app.act('importPicked', (el) => {
      const file = el.files && el.files[0];
      el.value = '';
      if (!file) return;
      file.text().then((text) => {
        let parsed;
        try { parsed = Store.parseBackup(text); } catch (e) { app.toast('זה לא קובץ גיבוי תקין של האפליקציה', 4000); return; }
        const n = Object.keys(parsed.photos).length;
        app.confirm({
          title: 'לשחזר מהגיבוי?',
          body: `כל הנתונים הנוכחיים במכשיר יוחלפו${n ? ` (כולל ${n} תמונות)` : ''}. הפעולה אינה הפיכה.`,
          ok: 'שחזור', danger: true,
          onOk: async () => {
            try {
              await Photos.clearAll();
              for (const [k, url] of Object.entries(parsed.photos)) await Photos.put(k, await (await fetch(url)).blob());
              app.state = parsed.state; app.fix = false;
              D.sync(app.state, app.now());
              app.commit(); app.go('today'); app.toast('השחזור הושלם');
            } catch (e) { app.toast('השחזור נכשל', 4000); }
          }
        });
      }).catch(() => app.toast('אי אפשר לקרוא את הקובץ', 4000));
    });

    app.act('resetAll', () => app.confirm({
      title: 'למחוק את כל הנתונים?', body: 'כל הימים, התמונות וההגדרות יימחקו מהמכשיר.', ok: 'המשך', danger: true,
      onOk: () => app.confirm({
        title: 'בטוחים לגמרי?', body: 'אי אפשר לשחזר בלי קובץ גיבוי.', ok: 'מחיקת הכול', danger: true,
        onOk: async () => {
          try { await Photos.clearAll(); } catch (e) { /* storage may be unavailable */ }
          app.state = D.newState(); app.fix = false;
          app.commit(); app.go('today'); app.toast('הכול נמחק');
        }
      })
    }));
  }

  root.Views = root.Views || {};
  root.Views.settings = { settingsHtml, backupHtml, wire };
})(typeof globalThis !== 'undefined' ? globalThis : this);
