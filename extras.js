/* ===== PRONOFOOT : fonctions en plus ===== */

/* 1. Alerte robot sur l'accueil (administrateurs seulement) */
(function () {
  var origHome = window.pageHome;
  if (!origHome) return;
  window.pageHome = async function (token) {
    await origHome(token);
    try {
      if (token !== S.rt || !S.profile || S.profile.role !== "admin") return;
      var hero = $(".hero"); if (!hero) return;
      var logs = await api("/rest/v1/sync_logs?select=status,message,started_at&order=id.desc&limit=1") || [];
      var l = logs[0];
      if (!l || l.status === "ok" || token !== S.rt) return;
      var old = $("#pfalert"); if (old) old.remove();
      hero.insertAdjacentHTML("beforebegin", `<div id="pfalert" class="notice bad" style="margin-top:14px"><b>⚠️ Alerte robot</b><div class="small" style="margin-top:4px">La dernière exécution du ${esc(fmtShort(l.started_at))} à ${fmtTime(l.started_at)} n’est pas « ok » (${esc(l.status)}).${l.message ? " " + esc(String(l.message).slice(0, 140)) : ""}</div><div style="height:8px"></div><button class="btn sm" onclick="S.adminTab='bot';go('#/admin')">Voir le robot</button></div>`);
    } catch (e) {}
  };
})();

/* 2. Admin : code cadeau de 3 jours */
(function () {
  var origCodes = window.adminCodes;
  if (origCodes) {
    window.adminCodes = async function () {
      var h = await origCodes();
      return h + `<div class="panel"><b>🎁 Code cadeau</b><p class="small mut">Un essai Premium de 3 jours à offrir à un ami ou à un prospect.</p><button class="btn" onclick="pfGift()">Générer un code cadeau (3 jours)</button><div id="pfgift"></div></div>`;
    };
  }
  window.pfGift = async function () {
    try {
      var code = await api("/rest/v1/rpc/admin_generate_code", { method: "POST", body: { p_plan: "premium", p_duration_days: 3, p_note: "Cadeau 3 jours" } });
      var msg = "Voici ton code cadeau PRONOFOOT (3 jours d’essai Premium) : " + code + ". Valable 24 heures, à saisir dans Abonnement : " + location.origin + "/#/abo";
      $("#pfgift").innerHTML = `<div class="code">${esc(code)}</div><div class="row" style="margin-top:10px"><button class="btn sec sm grow" onclick="copy('${esc(code)}')">Copier le code</button><a class="btn ok sm grow" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Envoyer par WhatsApp</a></div>`;
      toast("Code généré", "ok");
    } catch (e) { toast(frErr(e.message), "err"); }
  };
})();

/* 3. Admin : bilan des 7 derniers jours */
(function () {
  var orig = window.adminUsers;
  if (!orig) return;
  window.adminUsers = async function () {
    var h = await orig();
    try {
      var sem = Date.now() - 7 * 864e5, now = Date.now();
      var nouveaux = S.users.filter(function (u) { return new Date(u.created_at).getTime() > sem; }).length;
      var actifs = S.users.filter(function (u) { return u.role !== "admin" && u.plan !== "trial" && u.plan_expires_at && new Date(u.plan_expires_at).getTime() > now; }).length;
      var essais = S.users.filter(function (u) { return u.role !== "admin" && u.plan === "trial" && u.phone && now < new Date(u.trial_started_at).getTime() + 7 * 864e5; }).length;
      var codes = await countRows("/rest/v1/activation_codes?select=code&status=eq.used&used_at=gte." + encodeURIComponent(new Date(sem).toISOString()));
      return `<div class="box" style="margin-top:14px"><h3>📅 Bilan des 7 derniers jours</h3><div class="kv"><span>Nouveaux comptes</span><span>${nouveaux}</span></div><div class="kv"><span>Codes utilisés</span><span>${codes === null ? "?" : codes}</span></div><div class="kv"><span>Abonnés actifs maintenant</span><span>${actifs}</span></div><div class="kv"><span>Essais en cours</span><span>${essais}</span></div></div>` + h;
    } catch (e) { return h; }
  };
})();

/* 4. Résultats : réussite par championnat */
(function () {
  var orig = window.pageHistory;
  if (!orig) return;
  window.pageHistory = async function (token) {
    await orig(token);
    try {
      if (token !== S.rt) return;
      var v = $("#view"); if (!v) return;
      var st = v.querySelector(".stats"); if (!st) return;
      var rows = await api("/rest/v1/predictions?select=is_correct,matches(competition:competitions(name))&market=eq.result_1x2&is_correct=not.is.null&order=id.desc&limit=600") || [];
      var g = {};
      rows.forEach(function (r) {
        var n = r.matches && r.matches.competition && r.matches.competition.name;
        if (!n) return;
        g[n] = g[n] || { w: 0, t: 0 };
        g[n].t++;
        if (r.is_correct) g[n].w++;
      });
      var list = Object.keys(g).filter(function (k) { return g[k].t >= 8; }).map(function (k) {
        return { n: k, w: g[k].w, t: g[k].t, p: Math.round(g[k].w * 100 / g[k].t) };
      }).sort(function (a, b) { return b.p - a.p; }).slice(0, 12);
      if (!list.length || token !== S.rt) return;
      st.insertAdjacentHTML("afterend", `<h2>Réussite par championnat</h2><p class="small mut">Résultat du match, sur les pronostics vérifiés (championnats avec au moins 8 matchs).</p>` + list.map(function (x) {
        return `<div class="kv"><span>${esc(x.n)}</span><span>${x.p} % (${x.w}/${x.t})</span></div>`;
      }).join(""));
    } catch (e) {}
  };
})();

/* 5. Fiche d'un match : compte à rebours du coup d'envoi */
(function () {
  var orig = window.pageMatch;
  if (!orig) return;
  window.pageMatch = async function (token, id) {
    await orig(token, id);
    try {
      if (token !== S.rt) return;
      var w = $(".when"); if (!w) return;
      var rows = await api("/rest/v1/matches?id=eq." + Number(id) + "&select=kickoff_at") || [];
      var m = rows[0]; if (!m) return;
      var ms = new Date(m.kickoff_at).getTime() - Date.now();
      if (ms <= 0 || token !== S.rt) return;
      var h = Math.floor(ms / 36e5), mi = Math.floor((ms % 36e5) / 6e4);
      var txt = h >= 24 ? "Coup d’envoi dans " + Math.floor(h / 24) + " j " + (h % 24) + " h" : "Coup d’envoi dans " + h + " h " + (mi < 10 ? "0" : "") + mi;
      w.insertAdjacentHTML("afterend", `<div style="text-align:center;margin-top:6px;color:var(--onmut)" class="small">⏱️ ${txt}</div>`);
    } catch (e) {}
  };
})();
