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

  /* Abonnements qui se terminent bientôt (admin) */
  var origAU = window.adminUsers;
  window.adminUsers = async function () {
    var h = await origAU();
    var now = Date.now();
    var soon = S.users.filter(function (u) {
      if (u.role === "admin" || !u.plan_expires_at || u.plan === "trial") return false;
      var t = new Date(u.plan_expires_at).getTime();
      return t > now && t < now + 7 * 864e5;
    }).sort(function (a, b) { return new Date(a.plan_expires_at) - new Date(b.plan_expires_at); });
    var corps = soon.length
      ? soon.map(function (u) {
          return `<div class="rk"><div class="grow"><b>${esc(u.full_name || "Sans nom")}</b><div class="small mut">${esc(u.phone || u.email)}</div></div><span class="small">${u.plan === "vip" ? "VIP" : "Premium"}, fin le ${esc(fmtShort(u.plan_expires_at))}</span></div>`;
        }).join("")
      : `<p class="mut small" style="padding:6px 0">Aucun abonnement ne se termine dans les 7 prochains jours.</p>`;
    return `<div class="box" style="margin-top:14px"><h3>⏰ Abonnements qui se terminent dans 7 jours</h3>${corps}</div>` + h;
  };
})();

(function () {
  /* Accueil : Top du jour */
  var origHome = window.pageHome;

  async function tauxReel(market) {
    try {
      var rows = await api("/rest/v1/predictions?select=is_correct&market=eq." + market + "&is_correct=not.is.null&order=id.desc&limit=100") || [];
      if (rows.length < 30) return null;
      return Math.round(rows.filter(function (r) { return r.is_correct; }).length * 100 / rows.length);
    } catch (e) { return null; }
  }

  async function topDuJour() {
    var from = encodeURIComponent(new Date().toISOString());
    var to = encodeURIComponent(new Date(Date.now() + 40 * 36e5).toISOString());
    var marches = ["double_chance", "over_under_25", "result_1x2"];
    if (S.access && S.access.vip) marches.push("away_goals");
    var q = "/rest/v1/predictions?select=market,pick,probability,matches!inner(id,kickoff_at,status,home:teams!home_team_id(name),away:teams!away_team_id(name),competition:competitions(name))"
      + "&market=in.(" + marches.join(",") + ")"
      + "&matches.status=in.(NS,TBD)&matches.kickoff_at=gte." + from + "&matches.kickoff_at=lte." + to
      + "&order=probability.desc&limit=80";
    var rows = [];
    try { rows = await api(q) || []; } catch (e) { return ""; }
    var rates = {};
    await Promise.all(marches.map(function (mk) { return tauxReel(mk).then(function (t) { rates[mk] = t; }); }));
    var vus = {}, top = [];
    rows.forEach(function (r) {
      var m = r.matches;
      if (!m || vus[m.id] || top.length >= 5) return;
      vus[m.id] = 1; top.push(r);
    });
    var corps = top.length ? top.map(function (r) {
      var m = r.matches, p = Math.round(Number(r.probability) || 0);
      var h = m.home && m.home.name, a = m.away && m.away.name, t = rates[r.market];
      return `<div class="rk" onclick="go('#/match/${Number(m.id)}')"><div class="grow"><b>${esc(h)} contre ${esc(a)}</b><div class="small">${esc(pickLabel(r.market, r.pick, h, a))}</div><div class="small mut">${esc(fmtDay(m.kickoff_at))} à ${fmtTime(m.kickoff_at)}${t !== null && t !== undefined ? " · ce type a réussi " + t + " % récemment" : ""}</div></div><b>${p} %</b></div>`;
    }).join("") : `<p class="mut small" style="padding:6px 0">Aucun pronostic assez fiable pour le moment.</p>`;
    return `<div id="topjour" class="box" style="margin-top:14px"><h3>🔥 Top du jour</h3><p class="small mut">Les pronostics les plus fiables des prochaines heures. Aucun pronostic n’est garanti.</p>${corps}</div>`;
  }

  window.pageHome = async function (token) {
    await origHome(token);
    try {
      if (token !== S.rt) return;
      var ancre = $(".tiles"); if (!ancre) return;
      var html = await topDuJour();
      if (token !== S.rt) return;
      var old = $("#topjour"); if (old) old.remove();
      if (html) ancre.insertAdjacentHTML("afterend", html);
    } catch (e) {}
  };

  /* Matchs : mes championnats */
  function favs() { try { return JSON.parse(store.get("pf_favs") || "[]"); } catch (e) { return []; } }
  window.toggleFav = function (id) {
    var a = favs(), i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    store.set("pf_favs", JSON.stringify(a));
    drawMatches();
  };
  window.toggleFavOnly = function () { S.favOnly = !S.favOnly; drawMatches(); };

  window.drawMatches = function () {
    var box = $("#mlist"); if (!box) return;
    var now = new Date(), tom = new Date(Date.now() + 864e5), q = S.mSearch.trim().toLowerCase();
    var fv = favs();
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
})();
