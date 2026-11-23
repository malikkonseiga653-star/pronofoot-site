/* ===== 1. Administrateurs ===== */
(function () {
  var OWNER = "malikkonseiga653@gmail.com";

  window.drawUsers = function (q) {
    var box = $("#ulist"); if (!box) return;
    q = (q || "").toLowerCase();
    var isOwner = S.session && S.session.email && S.session.email.toLowerCase() === OWNER;
    var list = S.users.filter(function (u) {
      return !q || [u.email, u.full_name, u.phone].join(" ").toLowerCase().includes(q);
    }).slice(0, 80);
    box.innerHTML = list.map(function (u) {
      var s = userState(u), open = S.openUser === u.id, isAdm = u.role === "admin";
      var id = esc(u.id);
      var plans = isAdm ? "" :
        `<button class="btn sm sec" onclick="setPlan('${id}','premium',30)">Premium 30 j</button>` +
        `<button class="btn sm sec" onclick="setPlan('${id}','premium',365)">Premium 1 an</button>` +
        `<button class="btn sm sec" onclick="setPlan('${id}','vip',30)">VIP 30 j</button>` +
        `<button class="btn sm sec" onclick="setPlan('${id}','vip',365)">VIP 1 an</button>` +
        `<button class="btn sm line" onclick="setPlan('${id}','trial',0)">Retirer l’abonnement</button>`;
      var role = "";
      if (isOwner && S.profile && u.id !== S.profile.id) {
        role = isAdm
          ? `<button class="btn sm line" onclick="setRole('${id}','user')">Retirer l’administrateur</button>`
          : `<button class="btn sm ok" onclick="setRole('${id}','admin')">Nommer administrateur</button>`;
      }
      return `<div class="r"><div class="top2" onclick="toggleUser('${id}')"><div class="grow"><b>${esc(u.full_name || "Sans nom")}</b><div class="small mut">${esc(u.email)}</div></div><span class="pillst ${s.c}">${s.t}</span></div>` +
        (open ? `<div class="small mut" style="margin-top:6px">Téléphone : ${esc(u.phone || "non renseigné")}<br>Inscrit le ${esc(fmtShort(u.created_at))}${u.plan_expires_at && !isAdm ? "<br>Abonnement jusqu’au " + esc(fmtShort(u.plan_expires_at)) : ""}</div><div class="acts">${plans}${role}</div>` : "") +
        `</div>`;
    }).join("") || `<div class="empty">Aucun utilisateur trouvé.</div>`;
  };

  window.setRole = async function (id, role) {
    var msg = role === "admin" ? "Nommer ce compte administrateur ?" : "Retirer les droits d’administrateur à ce compte ?";
    if (!confirm(msg)) return;
    try {
      var r = await api("/rest/v1/rpc/admin_set_role", { method: "POST", body: { p_user: id, p_role: role } });
      if (r && r.ok) { toast(role === "admin" ? "Administrateur nommé" : "Droits retirés", "ok"); route(); }
      else toast((r && r.message) || "Échec", "err");
    } catch (e) { toast(frErr(e.message), "err"); }
  };
})();

/* ===== 2. Admin : relances, revenus, export ===== */
(function () {
  var origAU = window.adminUsers;

  function tel(u) { var d = digits(u.phone); if (d.length === 8) d = "226" + d; return d; }
  function lienRelance(u) {
    var d = tel(u); if (d.length < 9) return "";
    var nom = (u.full_name || "").split(" ")[0] || "";
    var txt = "Bonjour " + nom + ", ton abonnement PRONOFOOT " + (u.plan === "vip" ? "VIP" : "Premium") + " se termine le " + fmtShort(u.plan_expires_at) + ". Pour renouveler : " + location.origin + "/#/abo";
    return "https://wa.me/" + d + "?text=" + encodeURIComponent(txt);
  }

  async function revenus() {
    var d = new Date();
    var debut = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    var rows = await api("/rest/v1/activation_codes?select=plan,duration_days&status=eq.used&used_at=gte." + encodeURIComponent(debut)) || [];
    var tot = 0;
    rows.forEach(function (r) {
      var per = Number(r.duration_days) >= 365 ? "year" : "month";
      tot += Number(S.settings["price_" + r.plan + "_" + per]) || 0;
    });
    return { n: rows.length, tot: tot };
  }

  window.exportClients = function () {
    try {
      var rows = [["Nom", "Email", "Téléphone", "Formule", "Fin abonnement", "Inscrit le"]];
      S.users.forEach(function (u) {
        rows.push([u.full_name || "", u.email || "", u.phone || "", u.role === "admin" ? "Admin" : userState(u).t,
          u.plan_expires_at ? new Date(u.plan_expires_at).toLocaleDateString("fr-FR") : "",
          u.created_at ? new Date(u.created_at).toLocaleDateString("fr-FR") : ""]);
      });
      var csv = "\ufeff" + rows.map(function (r) {
        return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(";");
      }).join("\n");
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = "clients-pronofoot.csv";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast("Téléchargement impossible sur cet appareil", "err"); }
  };

  if (origAU) {
    window.adminUsers = async function () {
      var h = await origAU();
      var now = Date.now();
      var soon = S.users.filter(function (u) {
        if (u.role === "admin" || !u.plan_expires_at || u.plan === "trial") return false;
        var t = new Date(u.plan_expires_at).getTime();
        return t > now && t < now + 7 * 864e5;
      }).sort(function (a, b) { return new Date(a.plan_expires_at) - new Date(b.plan_expires_at); });
      var corps = soon.length ? soon.map(function (u) {
        var l = lienRelance(u);
        return `<div class="rk"><div class="grow"><b>${esc(u.full_name || "Sans nom")}</b><div class="small mut">${esc(u.phone || u.email)} · ${u.plan === "vip" ? "VIP" : "Premium"}, fin le ${esc(fmtShort(u.plan_expires_at))}</div></div>${l ? `<a class="btn ok sm" href="${l}" target="_blank" rel="noopener">Relancer</a>` : ""}</div>`;
      }).join("") : `<p class="mut small" style="padding:6px 0">Aucun abonnement ne se termine dans les 7 prochains jours.</p>`;
      var rev = "";
      try {
        var r = await revenus();
        rev = `<div class="box" style="margin-top:14px"><h3>💰 Revenus du mois (estimation)</h3><div class="kv"><span>Codes utilisés ce mois</span><span>${r.n}</span></div><div class="kv"><span>Total estimé</span><span>${fmtF(r.tot)}</span></div><p class="small mut" style="padding:6px 0">Calculé avec tes prix actuels. Les abonnements donnés à la main ne sont pas comptés.</p></div>`;
      } catch (e) {}
      return rev +
        `<div class="box" style="margin-top:14px"><h3>⏰ Abonnements qui se terminent dans 7 jours</h3>${corps}</div>` +
        `<div style="margin-top:14px"><button class="btn sec sm" onclick="exportClients()">Télécharger la liste des clients (CSV)</button></div>` + h;
    };
  }
})();

/* ===== 3. Fonctions pour les clients ===== */
(function () {
  var origHome = window.pageHome;
  var origMatch = window.pageMatch;
  var origProfile = window.pageProfile;

  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); window._pfInstall = e; });
  window.pfInstall = function () {
    var e = window._pfInstall; if (!e) return;
    e.prompt();
    e.userChoice.then(function () { window._pfInstall = null; var b = $("#pfinst"); if (b) b.remove(); });
  };

  function lire(cle, defaut) { try { var v = JSON.parse(store.get(cle) || "null"); return v === null ? defaut : v; } catch (e) { return defaut; } }
  function titre(mk) { var m = MARKETS.find(function (x) { return x.id === mk; }); return m ? m.title : mk; }

  async function stats(market) {
    try {
      var rows = await api("/rest/v1/predictions?select=is_correct&market=eq." + market + "&is_correct=not.is.null&order=id.desc&limit=100") || [];
      if (rows.length < 30) return null;
      var w = rows.filter(function (r) { return r.is_correct; }).length;
      return { w: w, t: rows.length, p: Math.round(w * 100 / rows.length) };
    } catch (e) { return null; }
  }

  /* --- Accueil --- */
  async function topDuJour(st) {
    var from = encodeURIComponent(new Date().toISOString());
    var to = encodeURIComponent(new Date(Date.now() + 40 * 36e5).toISOString());
    var marches = ["double_chance", "over_under_25", "result_1x2"];
    if (S.access && S.access.vip) marches.push("away_goals");
    var q = "/rest/v1/predictions?select=market,pick,probability,matches!inner(id,kickoff_at,status,home:teams!home_team_id(name),away:teams!away_team_id(name))"
      + "&market=in.(" + marches.join(",") + ")"
      + "&matches.status=in.(NS,TBD)&matches.kickoff_at=gte." + from + "&matches.kickoff_at=lte." + to
      + "&order=probability.desc&limit=80";
    var rows = [];
    try { rows = await api(q) || []; } catch (e) { return ""; }
    var vus = {}, top = [];
    rows.forEach(function (r) {
      var m = r.matches;
      if (!m || vus[m.id] || top.length >= 5) return;
      vus[m.id] = 1; top.push(r);
    });
    var corps = top.length ? top.map(function (r) {
      var m = r.matches, p = Math.round(Number(r.probability) || 0);
      var h = m.home && m.home.name, a = m.away && m.away.name, s = st[r.market];
      return `<div class="rk" onclick="go('#/match/${Number(m.id)}')"><div class="grow"><b>${esc(h)} contre ${esc(a)}</b><div class="small">${esc(pickLabel(r.market, r.pick, h, a))}</div><div class="small mut">${esc(fmtDay(m.kickoff_at))} à ${fmtTime(m.kickoff_at)}${s ? " · ce type a réussi " + s.p + " % récemment" : ""}</div></div><b>${p} %</b></div>`;
    }).join("") : `<p class="mut small" style="padding:6px 0">Aucun pronostic assez fiable pour le moment.</p>`;
    return `<div class="box" style="margin-top:14px"><h3>🔥 Top du jour</h3><p class="small mut">Les pronostics les plus fiables des prochaines heures. Aucun pronostic n’est garanti.</p>${corps}</div>`;
  }

  function bilanHTML(st) {
    var lignes = ["double_chance", "over_under_25", "result_1x2", "btts"].map(function (mk) {
      var s = st[mk]; if (!s) return "";
      return `<div class="kv"><span>${esc(titre(mk))}</span><span>${s.p} % (${s.w}/${s.t})</span></div>`;
    }).join("");
    if (!lignes) return "";
    return `<div class="box" style="margin-top:14px"><h3>📊 Nos résultats récents</h3><p class="small mut">Sur les 100 derniers pronostics vérifiés de chaque type.</p>${lignes}<p class="small mut" style="padding:8px 0">Les résultats passés ne garantissent pas les résultats futurs.</p></div>`;
  }

  async function mesSelections() {
    var ids = lire("pf_sel", []).slice(-10).map(Number).filter(Boolean);
    if (!ids.length) return "";
    try {
      var rows = await api("/rest/v1/matches?select=id,kickoff_at,status,home_goals,away_goals,home:teams!home_team_id(name),away:teams!away_team_id(name),predictions(market,pick,is_correct)&id=in.(" + ids.join(",") + ")&predictions.market=eq.result_1x2&order=kickoff_at.desc") || [];
      if (!rows.length) return "";
      var corps = rows.map(function (m) {
        var p = (m.predictions || [])[0];
        var fini = ["FT", "AET", "PEN"].indexOf(m.status) >= 0 && m.home_goals !== null;
        var badge = p && p.is_correct === true ? `<span class="badge win">Réussi</span>` : p && p.is_correct === false ? `<span class="badge loss">Raté</span>` : `<span class="small mut">${fini ? "" : "à venir"}</span>`;
        var h = m.home && m.home.name, a = m.away && m.away.name;
        return `<div class="rk" onclick="go('#/match/${Number(m.id)}')"><div class="grow">${esc(h)} contre ${esc(a)}<div class="small mut">${esc(fmtDay(m.kickoff_at))}${fini ? " · " + m.home_goals + " - " + m.away_goals : ""}</div></div>${badge}</div>`;
      }).join("");
      return `<div class="box" style="margin-top:14px"><h3>⭐ Mes sélections</h3>${corps}</div>`;
    } catch (e) { return ""; }
  }

  function extrasHTML() {
    var h = "", p = S.profile, a = S.access || {};
    if (p && (a.kind === "premium" || a.kind === "vip") && p.plan_expires_at) {
      var j = Math.ceil((new Date(p.plan_expires_at).getTime() - Date.now()) / 864e5);
      if (j <= 5) h += `<div class="notice" style="margin-top:14px"><b>Ton abonnement se termine ${j <= 1 ? "bientôt" : "dans " + j + " jours"}.</b><div style="height:8px"></div><button class="btn sm" onclick="go('#/abo')">Renouveler</button></div>`;
    }
    if (p && a.kind === "trial") {
      var jt = Math.ceil((new Date(p.trial_started_at).getTime() + 7 * 864e5 - Date.now()) / 864e5);
      if (jt <= 2) h += `<div class="notice" style="margin-top:14px"><b>Ton essai gratuit se termine ${jt <= 1 ? "bientôt" : "dans " + jt + " jours"}.</b><div style="height:8px"></div><button class="btn sm" onclick="go('#/abo')">Choisir une formule</button></div>`;
    }
    var standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    if (window._pfInstall && !standalone) h += `<button id="pfinst" class="btn sec" style="margin-top:14px" onclick="pfInstall()">📲 Installer PRONOFOOT sur mon téléphone</button>`;
    return h;
  }

  function showWelcome() {
    if (store.get("pf_welcome")) return;
    var steps = [
      ["⚽", "Bienvenue sur PRONOFOOT", "Des analyses et des pronostics de football calculés à partir de résultats réels, mis à jour chaque jour."],
      ["📊", "Comment lire un pronostic", "Une probabilité de 80 % veut dire environ 8 réussites sur 10 dans des cas semblables. Aucun pronostic n’est garanti."],
      ["🛡️", "Joue de façon responsable", "Réservé aux personnes de 18 ans et plus. Ne dépense que ce que tu peux te permettre de perdre. Tu peux fixer ta limite dans Mon compte."]
    ];
    var i = 0;
    var ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:100;background:rgba(5,12,32,.92);display:flex;align-items:center;justify-content:center;padding:20px";
    function dessiner() {
      ov.innerHTML = '<div style="max-width:420px;width:100%;background:var(--surface);border:1px solid var(--g);border-radius:14px;padding:22px;color:var(--ink)"><div style="font-size:2.4rem">' + steps[i][0] + '</div><h2 style="margin:8px 0">' + steps[i][1] + '</h2><p class="mut">' + steps[i][2] + '</p><div class="small mut" style="margin:12px 0">' + (i + 1) + ' / ' + steps.length + '</div><button class="btn" id="pfnext">' + (i < steps.length - 1 ? "Suivant" : "Commencer") + '</button></div>';
      ov.querySelector("#pfnext").onclick = function () {
        if (i < steps.length - 1) { i++; dessiner(); } else { store.set("pf_welcome", "1"); ov.remove(); }
      };
    }
    dessiner();
    document.body.appendChild(ov);
  }

  if (origHome) {
    window.pageHome = async function (token) {
      await origHome(token);
      try {
        if (token !== S.rt) return;
        var hero = $(".hero"), tiles = $(".tiles");
        if (!hero || !tiles) return;
        var mk = ["double_chance", "over_under_25", "result_1x2", "btts", "away_goals"], st = {};
        await Promise.all(mk.map(function (m) { return stats(m).then(function (s) { st[m] = s; }); }));
        var res = await Promise.all([topDuJour(st), mesSelections()]);
        if (token !== S.rt) return;
        hero.insertAdjacentHTML("afterend", extrasHTML());
        tiles.insertAdjacentHTML("afterend", res[0] + bilanHTML(st) + res[1]);
        showWelcome();
      } catch (e) {}
    };
  }

  /* --- Matchs : mes championnats --- */
  window.toggleFav = function (id) {
    var a = lire("pf_favs", []), i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    store.set("pf_favs", JSON.stringify(a));
    drawMatches();
  };
  window.toggleFavOnly = function () { S.favOnly = !S.favOnly; drawMatches(); };

  window.drawMatches = function () {
    var box = $("#mlist"); if (!box) return;
    var now = new Date(), tom = new Date(Date.now() + 864e5), q = S.mSearch.trim().toLowerCase();
    var fv = lire("pf_favs", []);
    var bar = `<div style="margin:10px 0 2px"><button class="chip ${S.favOnly ? "on" : ""}" onclick="toggleFavOnly()">⭐ Mes championnats (${fv.length})</button><span class="small mut" style="margin-left:8px">Touche ☆ à côté d’un championnat pour le suivre</span></div>`;
    var list = S.matches.filter(function (m) {
      var d = new Date(m.kickoff_at);
      if (S.mFilter === "today" && !sameDay(d, now)) return false;
      if (S.mFilter === "tomorrow" && !sameDay(d, tom)) return false;
      if (S.favOnly && !(m.competition && fv.indexOf(m.competition.id) >= 0)) return false;
      if (q) {
        var s = [m.home && m.home.name, m.away && m.away.name, m.competition && m.competition.name, m.competition && m.competition.country].join(" ").toLowerCase();
        if (!s.includes(q)) return false;
      }
      return true;
    });
    if (!list.length) {
      box.innerHTML = bar + `<div class="empty"><b>${S.favOnly ? "Aucun match dans tes championnats" : "Aucun match pour le moment"}</b>${S.favOnly ? "Touche ☆ à côté d’un championnat pour le suivre, ou enlève le filtre." : "Les nouvelles analyses apparaissent ici dès qu’elles sont prêtes."}</div>`;
      return;
    }
    var groups = new Map();
    list.forEach(function (m) {
      var c = m.competition || { id: 0, name: "Autres", country: "" };
      if (!groups.has(c.id)) groups.set(c.id, { c: c, items: [] });
      groups.get(c.id).items.push(m);
    });
    var arr = Array.from(groups.values()).sort(function (a, b) {
      return new Date(a.items[0].kickoff_at) - new Date(b.items[0].kickoff_at) || (a.c.name || "").localeCompare(b.c.name || "");
    });
    box.innerHTML = bar + arr.map(function (g) {
      var star = g.c.id ? `<button class="link" style="margin-left:auto;font-size:1.2rem" onclick="toggleFav(${Number(g.c.id)})">${fv.indexOf(g.c.id) >= 0 ? "★" : "☆"}</button>` : "";
      return `<div class="comp">${g.c.logo ? `<img src="${esc(g.c.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ""}${esc(g.c.name)} <span>${esc(g.c.country || "")}</span>${star}</div>`
        + g.items.map(function (m) {
          var p = predOf(m, "result_1x2");
          var hn = m.home && m.home.name, an = m.away && m.away.name;
          var day = sameDay(new Date(m.kickoff_at), now) ? "auj." : sameDay(new Date(m.kickoff_at), tom) ? "demain" : "";
          return `<div class="m" onclick="go('#/match/${Number(m.id)}')">
            <div class="t">${fmtTime(m.kickoff_at)}<small>${day}</small></div>
            <div class="grow"><div class="tm">${logo(m.home)}<span>${esc(hn)}</span></div>
            <div class="tm" style="margin-top:4px">${logo(m.away)}<span>${esc(an)}</span></div></div>
            ${p ? `<div class="pk"><b>${pct(p.probability)}</b><span>${esc(pickLabel(p.market, p.pick, hn, an))}</span></div>` : ""}</div>`;
        }).join("");
    }).join("");
  };

  /* --- Fiche d'un match : partager et suivre --- */
  window.toggleSel = function (id) {
    var a = lire("pf_sel", []).map(Number), i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    store.set("pf_sel", JSON.stringify(a));
    var b = $("#selbtn"); if (b) b.textContent = i >= 0 ? "☆ Suivre ce match" : "★ Suivi";
  };

  if (origMatch) {
    window.pageMatch = async function (token, id) {
      await origMatch(token, id);
      try {
        if (token !== S.rt) return;
        var pitch = $(".pitch"); if (!pitch) return;
        var noms = Array.prototype.map.call(document.querySelectorAll(".side2 div"), function (d) { return d.textContent.trim(); });
        var txt = (noms[0] || "") + " contre " + (noms[1] || "") + " : analyse et pronostics sur PRONOFOOT 🇧🇫 " + location.origin;
        var suivi = lire("pf_sel", []).map(Number).indexOf(Number(id)) >= 0;
        pitch.insertAdjacentHTML("afterend", `<div class="row" style="margin-top:10px"><a class="btn ok sm grow" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">Partager sur WhatsApp</a><button id="selbtn" class="btn sec sm grow" onclick="toggleSel(${Number(id)})">${suivi ? "★ Suivi" : "☆ Suivre ce match"}</button></div>`);
      } catch (e) {}
    };
  }

  /* --- Mon compte : jours restants, budget, aide --- */
  function moisCle() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1); }
  function budget() {
    var b = lire("pf_budget", null);
    if (!b) b = { limit: 0, spent: 0, m: moisCle() };
    if (b.m !== moisCle()) { b.m = moisCle(); b.spent = 0; }
    return b;
  }
  function budgetHTML() {
    var b = budget(), reste = Math.max(0, b.limit - b.spent);
    var resume = b.limit > 0
      ? `<div class="kv"><span>Limite</span><span>${fmtF(b.limit)}</span></div><div class="kv"><span>Dépensé</span><span>${fmtF(b.spent)}</span></div><div class="kv"><span>Reste</span><span>${fmtF(reste)}</span></div>` + (b.spent >= b.limit ? `<div class="notice bad">Tu as atteint ta limite du mois. Arrête-toi là.</div>` : "")
      : "";
    return `<div id="pfbudget" class="panel"><h3>💰 Mon budget du mois</h3><p class="small mut">Fixe une limite et note ce que tu dépenses. Ces chiffres restent seulement sur ton téléphone.</p>${resume}<label for="pflim">Ma limite du mois (F)</label><input id="pflim" type="number" inputmode="numeric" value="${b.limit || ""}"><div style="height:8px"></div><button class="btn sec sm" onclick="pfBudgetLimit()">Enregistrer la limite</button><label for="pfadd">J’ai dépensé (F)</label><input id="pfadd" type="number" inputmode="numeric"><div style="height:8px"></div><button class="btn sm" onclick="pfBudgetAdd()">Ajouter</button></div>`;
  }
  window.pfBudgetLimit = function () {
    var b = budget(); b.limit = Math.max(0, Number($("#pflim").value) || 0);
    store.set("pf_budget", JSON.stringify(b));
    $("#pfbudget").outerHTML = budgetHTML();
  };
  window.pfBudgetAdd = function () {
    var b = budget(); b.spent += Math.max(0, Number($("#pfadd").value) || 0);
    store.set("pf_budget", JSON.stringify(b));
    $("#pfbudget").outerHTML = budgetHTML();
  };

  function joursHTML() {
    var p = S.profile, a = S.access || {}, fin = null, tot = 30;
    if (!p) return "";
    if (a.kind === "trial") { fin = new Date(p.trial_started_at).getTime() + 7 * 864e5; tot = 7; }
    else if ((a.kind === "premium" || a.kind === "vip") && p.plan_expires_at) fin = new Date(p.plan_expires_at).getTime();
    if (!fin) return "";
    var j = Math.max(0, Math.ceil((fin - Date.now()) / 864e5));
    if (a.kind !== "trial") tot = j > 31 ? 365 : 30;
    var pc = Math.min(100, Math.round(j * 100 / tot));
    return `<div class="panel"><b>Il te reste ${j} jour${j > 1 ? "s" : ""}</b><div class="bar" style="margin-top:8px"><i style="width:${pc}%"></i></div></div>`;
  }

  function aideHTML() {
    var wa = digits(S.settings.whatsapp_admin);
    var S1 = '<summary style="cursor:pointer;font-weight:600;padding:8px 0">';
    return `<div class="panel"><h3>❓ Aide et jeu responsable</h3>
      <details>${S1}Comment lire un pronostic ?</summary><p class="small mut">Chaque pronostic a une probabilité estimée. 80 % veut dire environ 8 réussites sur 10 dans des cas semblables, pas une certitude.</p></details>
      <details>${S1}Premium ou VIP ?</summary><p class="small mut">Premium : analyse complète, résultat, double chance, total de buts et les deux équipes marquent. VIP : en plus, score exact, résultat à la mi-temps et buts de chaque équipe.</p></details>
      <details>${S1}Les pronostics sont-ils garantis ?</summary><p class="small mut">Non. Ce sont des estimations statistiques. Aucun résultat n’est garanti, et les résultats passés ne garantissent pas les résultats futurs.</p></details>
      <details>${S1}Jeu responsable</summary><p class="small mut">Réservé aux personnes de 18 ans et plus. Ne dépense que ce que tu peux te permettre de perdre, fixe-toi une limite, et ne cherche jamais à te refaire après une perte. Si le jeu devient un problème, parle-en à un proche.</p></details>
      ${wa.length > 6 ? `<details>${S1}Contacter l’assistance</summary><p class="small"><a class="link" href="https://wa.me/${wa}" target="_blank" rel="noopener">Écrire sur WhatsApp</a></p></details>` : ""}
    </div>`;
  }

  if (origProfile) {
    window.pageProfile = function (token) {
      origProfile(token);
      try {
        var v = $("#view");
        if (!v || token !== S.rt) return;
        v.insertAdjacentHTML("beforeend", joursHTML() + budgetHTML() + aideHTML());
      } catch (e) {}
    };
  }
})();
