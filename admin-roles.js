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
      var r = awai
