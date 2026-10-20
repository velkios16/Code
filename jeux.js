/* =============================================================
   Le Quart d'heure — mini-jeux
   -------------------------------------------------------------
   Module autonome (comme partage.js, niveaux.js…) : aucune
   dépendance, styles injectés, aucun effet sur la progression.

   · S'installe tout seul dans <div id="lqdh-jeux"></div>
   · Les contenus sont dans jeux-data.js (window.LQDH_JEUX_DATA)
   · Les images sont des photos libres de Wikipédia, récupérées à
     la volée (aucune image n'est stockée dans le dépôt)
   · Les records sont gardés à part, sous la clé « lqdh_jeux » :
     le grade, les séries et les statistiques ne sont jamais touchés

   Ajouter un jeu du même type (photo → nom) :
     1. ajouter une liste dans jeux-data.js
     2. ajouter une entrée dans JEUX ci-dessous
   ============================================================= */
(function () {
  "use strict";

  var DATA = window.LQDH_JEUX_DATA || {};
  var TAILLE = 10;            /* questions par partie */
  var RESERVE = 3;            /* photos de rechange si une image ne charge pas */
  var LOT = 14;               /* nombre d'éléments interrogés à la fois sur Wikipédia */
  var TAILLE_IMG = 960;       /* largeur des photos (palier standard de Wikimedia) */
  var TAILLE_VIGNETTE = 250;  /* palier standard, pour la vue diagnostic */
  var LS_SCORES = "lqdh_jeux";
  var LS_IMAGES = "lqdh_jeux_img_v1";
  var LS_VUS = "lqdh_jeux_vus";     /* derniers éléments montrés, pour ne pas les redonner tout de suite */
  var MAX_VUS = 40;
  var VIE_OK = 30 * 864e5;    /* un résultat de recherche est gardé 30 jours */
  var VIE_KO = 3 * 864e5;     /* un échec, 3 jours seulement */
  var API = "https://fr.wikipedia.org/w/api.php";

  /* ---------- 0. Description des jeux ---------- */
  var JEUX = [
    {
      id: "plats",
      etiquette: "Mini-jeu",
      titre: "Quel est ce plat ?",
      puce: "Plats du monde",
      question: "Quel est ce plat ?",
      accroche: "Dix photos de plats venus du monde entier. À toi de retrouver leur nom, sans aucun indice.",
      accent: "ambre",
      items: DATA.plats || [],
      messages: [
        "Le tour du monde n'est pas terminé : direction les fourneaux !",
        "Pas mal : il reste quelques tables à découvrir.",
        "Beau palmarès de gourmet voyageur.",
        "Presque parfait : un vrai globe-trotter du goût.",
        "Sans faute : tu as le palais du monde entier !"
      ]
    },
    {
      id: "plantes",
      etiquette: "Mini-jeu",
      titre: "Quelle est cette plante ?",
      puce: "Plantes, fleurs et arbres",
      question: "Quelle plante, quelle fleur ou quel arbre est-ce ?",
      accroche: "Dix photos de plantes, de fleurs et d'arbres. Retrouve leur nom en français.",
      accent: "menthe",
      items: DATA.plantes || [],
      messages: [
        "Il est temps de sortir se promener !",
        "Bon début : le jardin n'a pas livré tous ses secrets.",
        "Tu as l'œil vert.",
        "Presque parfait : un vrai botaniste.",
        "Sans faute : tu as la main verte !"
      ]
    }
  ];

  /* ---------- 1. Petits outils ---------- */
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function melanger(t) {
    var a = t.slice(), i, j, x;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }
  function lire(cle, defaut) {
    try { var r = localStorage.getItem(cle); return r ? JSON.parse(r) : defaut; } catch (e) { return defaut; }
  }
  function ecrire(cle, val) {
    try { localStorage.setItem(cle, JSON.stringify(val)); } catch (e) { /* stockage bloqué : on continue sans */ }
  }
  function titres(it) { return Array.isArray(it.wp) ? it.wp : [it.wp || it.n]; }
  function jeuParId(id) { for (var i = 0; i < JEUX.length; i++) if (JEUX[i].id === id) return JEUX[i]; return null; }
  function clePhoto(jeu, it) { return jeu.id + ":" + it.n; }
  function lienCommons(f) { return "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(f.replace(/ /g, "_")); }
  function lienWikipedia(t) { return "https://fr.wikipedia.org/wiki/" + encodeURIComponent(t.replace(/ /g, "_")); }

  /* ---------- 2. Records (séparés de la progression) ---------- */
  function lireScores() { return lire(LS_SCORES, {}) || {}; }
  function enregistrer(id, score) {
    var s = lireScores(), r = s[id] || { best: 0, parties: 0 };
    var record = score > r.best;
    r.parties = (r.parties || 0) + 1;
    if (record) r.best = score;
    r.dernier = score;
    s[id] = r;
    ecrire(LS_SCORES, s);
    return { record: record, premier: r.parties === 1, best: r.best };
  }

  function lireVus(id) { var v = lire(LS_VUS, {}) || {}; return v[id] || []; }
  function noterVu(id, nom) {
    var v = lire(LS_VUS, {}) || {};
    var l = (v[id] || []).filter(function (n) { return n !== nom; });
    l.push(nom);
    v[id] = l.slice(-MAX_VUS);
    ecrire(LS_VUS, v);
  }

  /* ---------- 3. Photos : Wikipédia, avec mémoire locale ---------- */
  var memoire = null;                         /* chargée à la demande */
  function cache() {
    if (!memoire) memoire = lire(LS_IMAGES, {}) || {};
    return memoire;
  }
  function sauverCache() { ecrire(LS_IMAGES, memoire || {}); }
  function enMemoire(jeu, it) {
    var r = cache()[clePhoto(jeu, it)];
    if (!r) return null;
    var vie = r.s ? VIE_OK : VIE_KO;
    if (Date.now() - r.d > vie) return null;
    return r;
  }
  function marquerMauvaise(jeu, it) {
    cache()[clePhoto(jeu, it)] = { x: 1, d: Date.now() };
    sauverCache();
  }

  /* Interroge l'API de Wikipédia pour un lot d'éléments.
     Une seule requête : toutes les variantes de titre sont demandées d'un coup,
     les redirections sont suivies par le serveur. */
  function appelerApi(jeu, lot) {
    var tous = [];
    lot.forEach(function (it) { titres(it).forEach(function (t) { if (tous.indexOf(t) < 0) tous.push(t); }); });
    var url = API + "?action=query&format=json&formatversion=2&origin=*&redirects=1"
      + "&prop=pageimages%7Cpageprops&piprop=thumbnail%7Cname&pithumbsize=" + TAILLE_IMG
      + "&pilicense=free&ppprop=disambiguation&titles=" + encodeURIComponent(tous.join("|"));
    var ctl = ("AbortController" in window) ? new AbortController() : null;
    var minuteur = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    return fetch(url, ctl ? { signal: ctl.signal } : undefined).then(function (rep) {
      clearTimeout(minuteur);
      if (!rep.ok) throw new Error("HTTP " + rep.status);
      return rep.json();
    }).then(function (json) {
      var q = (json && json.query) || {}, norm = {}, redir = {}, pages = {};
      (q.normalized || []).forEach(function (n) { norm[n.from] = n.to; });
      (q.redirects || []).forEach(function (r) { redir[r.from] = r.to; });
      (q.pages || []).forEach(function (p) { pages[p.title] = p; });
      function finale(t) {
        var a = norm[t] || t, k = 0;
        while (redir[a] && k++ < 4) a = redir[a];
        return a;
      }
      lot.forEach(function (it) {
        var trouve = null;
        titres(it).forEach(function (t) {
          if (trouve) return;
          var p = pages[finale(t)];
          if (!p || p.missing || !p.thumbnail || !p.thumbnail.source) return;
          if (p.pageprops && ("disambiguation" in p.pageprops)) return;
          if (!/\.(jpe?g|png|webp)$/i.test(p.pageimage || "")) return;    /* ni schéma ni dessin vectoriel */
          trouve = { s: p.thumbnail.source, f: p.pageimage, t: p.title, d: Date.now() };
        });
        cache()[clePhoto(jeu, it)] = trouve || { x: 1, d: Date.now() };
      });
      sauverCache();
    }, function (err) { clearTimeout(minuteur); throw err; });
  }

  function resoudre(jeu, items) {
    var manquants = items.filter(function (it) { return !enMemoire(jeu, it); });
    if (!manquants.length) return Promise.resolve();
    return appelerApi(jeu, manquants);
  }

  /* Précharge une image ; vrai si elle s'affiche, faux sinon (ou après 14 s). */
  function precharger(src) {
    return new Promise(function (ok) {
      var im = new Image(), fini = false;
      function fin(v) { if (!fini) { fini = true; ok(v); } }
      im.onload = function () { fin(true); };
      im.onerror = function () { fin(false); };
      setTimeout(function () { fin(false); }, 14000);
      im.decoding = "async";
      im.src = src;
    });
  }

  /* ---------- 4. Préparation d'une partie ---------- */
  function preparer(jeu) {
    var vus = lireVus(jeu.id);
    var dispo = jeu.items.filter(function (it) {
      var m = enMemoire(jeu, it);
      return !(m && m.x);                           /* on écarte les éléments sans photo */
    });
    /* les éléments pas encore vus récemment passent en premier */
    var pool = melanger(dispo.filter(function (it) { return vus.indexOf(it.n) < 0; }))
      .concat(melanger(dispo.filter(function (it) { return vus.indexOf(it.n) >= 0; })));
    var prets = [], i = 0, erreur = null;

    function bons(lot) {
      var r = [];
      lot.forEach(function (it) {
        var m = enMemoire(jeu, it);
        if (m && m.s) r.push({ it: it, img: m });
      });
      return r;
    }
    /* Résout le lot suivant ; renvoie les éléments qui ont une photo. */
    function lotSuivant() {
      if (i >= pool.length) return Promise.resolve([]);
      var lot = pool.slice(i, i + LOT); i += LOT;
      return resoudre(jeu, lot).then(function () { return bons(lot); }, function (e) {
        erreur = e;                                  /* hors ligne : on garde ce qui est déjà en mémoire */
        return bons(lot);
      });
    }
    function etape() {
      if (prets.length >= TAILLE + RESERVE || i >= pool.length) return Promise.resolve();
      return lotSuivant().then(function (b) { prets = prets.concat(b); return etape(); });
    }
    return etape().then(function () {
      if (prets.length < TAILLE) {
        throw erreur || new Error("pas assez de photos");
      }
      /* suite() permet de repiocher en cours de partie si trop de photos échouent */
      return { cands: prets, suite: lotSuivant, reste: function () { return i < pool.length; } };
    });
  }

  /* Trois mauvaises réponses plausibles : deux du même groupe si possible. */
  function propositions(jeu, it) {
    var autres = jeu.items.filter(function (o) {
      return o.n !== it.n && (it.x || []).indexOf(o.n) < 0 && (o.x || []).indexOf(it.n) < 0;
    });
    var groupe = it.g || it.t;
    var proches = melanger(autres.filter(function (o) { return (o.g || o.t) === groupe; }));
    var loin = melanger(autres.filter(function (o) { return (o.g || o.t) !== groupe; }));
    var choix = proches.slice(0, 2).concat(loin).slice(0, 3);
    if (choix.length < 3) choix = choix.concat(proches.slice(2)).slice(0, 3);
    return melanger([it.n].concat(choix.map(function (o) { return o.n; })));
  }

  /* ---------- 5. Styles ---------- */
  var CSS = "\n"
    + ".jx-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}\n"
    + "@media(max-width:620px){.jx-grid{grid-template-columns:1fr}}\n"
    + ".jx-card{background:var(--velours,#1F1436);border:1px solid var(--ligne,#3B2A63);border-radius:var(--r,14px);padding:20px;display:flex;flex-direction:column;gap:10px}\n"
    + ".jx-lbl{font-family:var(--mono,monospace);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--menthe,#3EE0AE)}\n"
    + ".jx-card.ambre .jx-lbl{color:var(--ambre,#FFC24B)}\n"
    + ".jx-titre{font-family:var(--display,sans-serif);font-weight:800;font-size:20px;line-height:1.25;margin:0}\n"
    + ".jx-txt{font-size:14px;color:var(--brume,#A296C4);margin:0;flex:1}\n"
    + ".jx-rec{font-family:var(--mono,monospace);font-size:12px;color:var(--brume,#A296C4);min-height:18px}\n"
    + ".jx-rec b{color:var(--craie,#F4EFFA)}\n"
    + ".jx-btn{appearance:none;border:0;border-radius:12px;padding:13px 18px;font-weight:600;font-size:15px;cursor:pointer;font-family:inherit;background:var(--menthe,#3EE0AE);color:#0B2A20;transition:transform .08s ease,filter .15s ease}\n"
    + ".jx-btn:hover{filter:brightness(1.07)} .jx-btn:active{transform:scale(.98)}\n"
    + ".jx-card.ambre .jx-btn.jx-go{background:var(--ambre,#FFC24B);color:#3A2A00}\n"
    + ".jx-btn.jx-ghost{background:transparent;color:var(--brume,#A296C4);border:1px solid var(--ligne,#3B2A63)}\n"
    + ".jx-btn.jx-ghost:hover{color:var(--craie,#F4EFFA);border-color:var(--brume,#A296C4);filter:none}\n"
    /* plein écran */
    + ".jx-ov{position:fixed;inset:0;z-index:60;background:var(--nuit,#150E29);color:var(--craie,#F4EFFA);overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:var(--body,sans-serif);line-height:1.55}\n"
    + ".jx-ov *{box-sizing:border-box}\n"
    + ".jx-wrap{max-width:560px;margin:0 auto;padding:calc(16px + env(safe-area-inset-top)) 18px calc(40px + env(safe-area-inset-bottom))}\n"
    + ".jx-top{display:flex;align-items:center;gap:10px;margin-bottom:12px}\n"
    + ".jx-x{appearance:none;background:transparent;border:1px solid var(--ligne,#3B2A63);color:var(--brume,#A296C4);border-radius:10px;width:38px;height:38px;font-size:18px;line-height:1;cursor:pointer;flex:none}\n"
    + ".jx-x:hover{color:var(--craie,#F4EFFA);border-color:var(--brume,#A296C4)}\n"
    + ".jx-chip{font-family:var(--mono,monospace);font-size:12px;letter-spacing:.06em;text-transform:uppercase;background:var(--relief,#2A1B48);border:1px solid var(--ligne,#3B2A63);border-radius:99px;padding:5px 12px;color:var(--menthe,#3EE0AE);margin-right:auto}\n"
    + ".jx-chip.ambre{color:var(--ambre,#FFC24B)}\n"
    + ".jx-cpt{font-family:var(--mono,monospace);font-size:13px;color:var(--brume,#A296C4)}\n"
    + ".jx-bande{display:flex;gap:4px;margin-bottom:18px}\n"
    + ".jx-bande i{flex:1;height:6px;border-radius:3px;background:var(--relief,#2A1B48)}\n"
    + ".jx-bande i.on{background:var(--ligne,#3B2A63)} .jx-bande i.ok{background:var(--menthe,#3EE0AE)} .jx-bande i.ko{background:var(--grenat,#FF5F76)}\n"
    + ".jx-photo{position:relative;margin:0 0 16px;border-radius:14px;overflow:hidden;background:var(--velours,#1F1436);border:1px solid var(--ligne,#3B2A63);aspect-ratio:4/3}\n"
    + ".jx-fond{position:absolute;inset:-20px;background-size:cover;background-position:center;filter:blur(22px) brightness(.55);opacity:0;transition:opacity .3s}\n"
    + ".jx-photo img{position:relative;display:block;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .25s}\n"
    + ".jx-photo.pret img,.jx-photo.pret .jx-fond{opacity:1}\n"
    + ".jx-spin{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid var(--ligne,#3B2A63);border-top-color:var(--menthe,#3EE0AE);animation:jx-tourne .8s linear infinite}\n"
    + ".jx-photo.pret .jx-spin{display:none}\n"
    + ".jx-spin.seul{position:relative;left:auto;top:auto;margin:0 auto}\n"
    + "@keyframes jx-tourne{to{transform:rotate(360deg)}}\n"
    + ".jx-q{font-family:var(--display,sans-serif);font-weight:600;font-size:22px;line-height:1.3;margin:0 0 16px}\n"
    + ".jx-opts{display:flex;flex-direction:column;gap:8px}\n"
    + ".jx-opt{display:flex;align-items:center;gap:12px;text-align:left;background:var(--velours,#1F1436);border:1px solid var(--ligne,#3B2A63);border-radius:12px;padding:12px 14px;font-size:16px;color:var(--craie,#F4EFFA);cursor:pointer;font-family:inherit;transition:border-color .12s ease,background .12s ease}\n"
    + ".jx-opt:hover:not([disabled]){border-color:var(--menthe,#3EE0AE)}\n"
    + ".jx-opt .jx-num{font-family:var(--mono,monospace);font-size:12px;color:var(--brume,#A296C4);border:1px solid var(--ligne,#3B2A63);border-radius:6px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;flex:none}\n"
    + ".jx-opt.juste{border-color:var(--menthe,#3EE0AE);background:rgba(62,224,174,.12)}\n"
    + ".jx-opt.faux{border-color:var(--grenat,#FF5F76);background:rgba(255,95,118,.12)}\n"
    + ".jx-opt[disabled]{cursor:default}\n"
    + ".jx-verdict{margin-top:16px;border-radius:12px;border:1px solid var(--ligne,#3B2A63);background:var(--velours,#1F1436);padding:16px 18px;animation:jx-pop .18s ease}\n"
    + "@keyframes jx-pop{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}\n"
    + ".jx-verdict .jx-vt{font-family:var(--display,sans-serif);font-weight:800;font-size:17px;margin:0 0 4px}\n"
    + ".jx-verdict.ok .jx-vt{color:var(--menthe,#3EE0AE)} .jx-verdict.ko .jx-vt{color:var(--grenat,#FF5F76)}\n"
    + ".jx-verdict .jx-vn{font-size:14px;color:var(--brume,#A296C4);margin:0 0 8px}\n"
    + ".jx-verdict .jx-vn b{color:var(--craie,#F4EFFA);font-size:16px}\n"
    + ".jx-tag{display:inline-block;font-family:var(--mono,monospace);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--brume,#A296C4);border:1px solid var(--ligne,#3B2A63);border-radius:99px;padding:2px 9px;margin:0 6px 8px 0}\n"
    + ".jx-verdict .jx-ve{font-size:15px;margin:0;line-height:1.6}\n"
    + ".jx-credit{margin-top:10px;font-family:var(--mono,monospace);font-size:11px;color:var(--brume,#A296C4);display:flex;gap:14px;flex-wrap:wrap}\n"
    + ".jx-credit a{color:var(--brume,#A296C4);text-decoration:none;border-bottom:1px solid var(--ligne,#3B2A63)}\n"
    + ".jx-credit a:hover{color:var(--menthe,#3EE0AE);border-bottom-color:var(--menthe,#3EE0AE)}\n"
    + ".jx-suite{margin-top:14px;display:flex;justify-content:flex-end}\n"
    /* résultat */
    + ".jx-res{text-align:center;padding:14px 0 4px}\n"
    + ".jx-score{font-family:var(--mono,monospace);font-size:56px;font-weight:700}\n"
    + ".jx-score.vert{color:var(--menthe,#3EE0AE)} .jx-score.orange{color:var(--ambre,#FFC24B)} .jx-score.rouge{color:var(--grenat,#FF5F76)}\n"
    + ".jx-msg{color:var(--craie,#F4EFFA);margin:4px 0 0;font-size:17px}\n"
    + ".jx-rec2{color:var(--brume,#A296C4);font-size:14px;margin:6px 0 0}\n"
    + ".jx-jauge{height:10px;border-radius:5px;background:var(--relief,#2A1B48);margin:20px 0 22px;overflow:hidden}\n"
    + ".jx-jauge>div{height:100%;background:var(--menthe,#3EE0AE);border-radius:5px}\n"
    + ".jx-h{font-family:var(--display,sans-serif);font-weight:800;font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--brume,#A296C4);margin:26px 0 10px}\n"
    + ".jx-recap{display:grid;grid-template-columns:1fr 1fr;gap:10px;list-style:none;margin:0;padding:0}\n"
    + "@media(max-width:380px){.jx-recap{grid-template-columns:1fr}}\n"
    + ".jx-ri{display:flex;align-items:center;gap:10px;background:var(--velours,#1F1436);border:1px solid var(--ligne,#3B2A63);border-left:4px solid var(--ligne,#3B2A63);border-radius:10px;padding:6px 10px 6px 6px;font-size:14px;min-width:0}\n"
    + ".jx-ri.ok{border-left-color:var(--menthe,#3EE0AE)} .jx-ri.ko{border-left-color:var(--grenat,#FF5F76)}\n"
    + ".jx-ri img{width:46px;height:46px;object-fit:cover;border-radius:7px;flex:none;background:var(--relief,#2A1B48)}\n"
    + ".jx-ri span{min-width:0;overflow:hidden;text-overflow:ellipsis}\n"
    + ".jx-note{font-size:13px;color:var(--brume,#A296C4);text-align:center;margin:22px 0 0}\n"
    + ".jx-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:26px}\n"
    + ".jx-mess{text-align:center;padding:48px 8px}\n"
    + ".jx-mess p{color:var(--brume,#A296C4);margin:14px 0 22px}\n"
    /* diagnostic */
    + ".jx-diag{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;margin-top:8px}\n"
    + ".jx-d{background:var(--velours,#1F1436);border:1px solid var(--ligne,#3B2A63);border-radius:10px;overflow:hidden;font-size:12px}\n"
    + ".jx-d img,.jx-d .jx-d0{display:block;width:100%;height:84px;object-fit:cover;background:var(--relief,#2A1B48)}\n"
    + ".jx-d .jx-d0{display:flex;align-items:center;justify-content:center;color:var(--grenat,#FF5F76);font-size:22px}\n"
    + ".jx-d b{display:block;padding:5px 7px 0;font-weight:600}\n"
    + ".jx-d small{display:block;padding:0 7px 6px;color:var(--brume,#A296C4);word-break:break-word}\n"
    + ".jx-d.ko{border-color:var(--grenat,#FF5F76)}\n"
    + "@media(prefers-reduced-motion:reduce){.jx-ov *{animation:none!important;transition:none!important}}\n";

  function styles() {
    if (document.getElementById("lqdh-jeux-css")) return;
    var s = document.createElement("style");
    s.id = "lqdh-jeux-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- 6. Accueil : cartes des jeux ---------- */
  var hote = null;

  function textRecord(id) {
    var r = lireScores()[id];
    if (!r || !r.parties) return "Pas encore joué";
    return "Meilleur score : " + r.best + " / " + TAILLE + " · " + r.parties + (r.parties > 1 ? " parties" : " partie");
  }

  function monter(conteneur) {
    styles();
    hote = conteneur || hote;
    if (!hote) return;
    hote.textContent = "";
    var grille = el("div", "jx-grid");
    JEUX.forEach(function (jeu) {
      var c = el("div", "jx-card " + jeu.accent);
      c.appendChild(el("div", "jx-lbl", jeu.etiquette));
      c.appendChild(el("h3", "jx-titre", jeu.titre));
      c.appendChild(el("p", "jx-txt", jeu.accroche));
      var rec = el("div", "jx-rec");
      var r = lireScores()[jeu.id];
      if (r && r.parties) {
        rec.appendChild(document.createTextNode("Meilleur score : "));
        rec.appendChild(el("b", null, r.best + " / " + TAILLE));
        rec.appendChild(document.createTextNode(" · " + r.parties + (r.parties > 1 ? " parties" : " partie")));
      } else rec.textContent = "Pas encore joué";
      c.appendChild(rec);
      var b = el("button", "jx-btn jx-go", "Jouer");
      b.type = "button";
      if (jeu.items.length < TAILLE + 4) { b.disabled = true; b.textContent = "Bientôt disponible"; }
      b.addEventListener("click", function () { ouvrir(jeu.id); });
      c.appendChild(b);
      grille.appendChild(c);
    });
    hote.appendChild(grille);
  }

  /* ---------- 7. Plein écran : fenêtre, historique, clavier ---------- */
  var ov = null, corps = null, haut = null, G = null, poussee = false, ecouteClavier = null;

  function ouvrirFenetre(chipTexte, accent) {
    styles();
    fermerFenetre(true);
    ov = el("div", "jx-ov");
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    var wrap = el("div", "jx-wrap");
    haut = el("div", "jx-top");
    var x = el("button", "jx-x", "✕");
    x.type = "button"; x.setAttribute("aria-label", "Fermer le mini-jeu");
    x.addEventListener("click", function () { fermer(); });
    haut.appendChild(x);
    var chip = el("span", "jx-chip" + (accent === "ambre" ? " ambre" : ""), chipTexte);
    haut.appendChild(chip);
    var cpt = el("span", "jx-cpt", "");
    cpt.id = "jx-cpt";
    haut.appendChild(cpt);
    wrap.appendChild(haut);
    corps = el("div", "jx-corps");
    wrap.appendChild(corps);
    ov.appendChild(wrap);
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    try { history.pushState({ lqdhJeu: 1 }, ""); poussee = true; } catch (e) { poussee = false; }
    ecouteClavier = function (e) {
      if (e.key === "Escape") { fermer(); return; }
      if (!G || !G.actif) return;
      if (e.key >= "1" && e.key <= "4" && !G.repondu) {
        var bs = ov.querySelectorAll(".jx-opt"), b = bs[+e.key - 1];
        if (b) b.click();
      } else if ((e.key === "Enter" || e.key === " ") && G.repondu) {
        var suite = ov.querySelector(".jx-suite .jx-btn");
        if (suite && document.activeElement !== suite) { e.preventDefault(); suite.click(); }
      }
    };
    document.addEventListener("keydown", ecouteClavier);
    x.focus();
  }

  function fermerFenetre(silence) {
    if (!ov) return;
    document.removeEventListener("keydown", ecouteClavier);
    ov.parentNode && ov.parentNode.removeChild(ov);
    ov = corps = haut = null;
    document.body.style.overflow = "";
    if (G) G.actif = false;
    if (!silence && hote) monter(hote);
  }

  function fermer() {
    if (!ov) return;
    var avait = poussee;
    poussee = false;
    fermerFenetre();
    if (avait) { try { if (history.state && history.state.lqdhJeu) history.back(); } catch (e) {} }
  }

  window.addEventListener("popstate", function () {
    if (ov) { poussee = false; fermerFenetre(); }          /* le retour du téléphone ferme le jeu */
  });

  function compteur(txt) { var c = document.getElementById("jx-cpt"); if (c) c.textContent = txt; }

  function message(titre, texte, boutons) {
    corps.textContent = "";
    var m = el("div", "jx-mess");
    m.appendChild(el("h2", "jx-q", titre));
    m.appendChild(el("p", null, texte));
    var a = el("div", "jx-actions");
    boutons.forEach(function (b) {
      var n = el("button", "jx-btn" + (b.ghost ? " jx-ghost" : ""), b.texte);
      n.type = "button";
      n.addEventListener("click", b.action);
      a.appendChild(n);
    });
    m.appendChild(a);
    corps.appendChild(m);
  }

  /* ---------- 8. Une partie ---------- */
  function ouvrir(id) {
    var jeu = jeuParId(id);
    if (!jeu) return;
    ouvrirFenetre(jeu.puce, jeu.accent);
    demarrer(jeu);
  }

  function demarrer(jeu) {
    G = { jeu: jeu, actif: true, repondu: false, pos: 0, score: 0, cand: [], suivant: 0, histo: [] };
    compteur("");
    corps.textContent = "";
    var ancienne = ov.querySelector(".jx-bande");
    if (ancienne) ancienne.parentNode.removeChild(ancienne);
    var att = el("div", "jx-mess");
    att.appendChild(el("div", "jx-spin seul"));
    att.appendChild(el("p", null, "Préparation des photos…"));
    corps.appendChild(att);
    var courant = G;
    preparer(jeu).then(function (prep) {
      if (G !== courant || !G.actif) return;
      G.cand = prep.cands; G.suite = prep.suite; G.reste = prep.reste;
      bande();
      question();
    }, function () {
      if (G !== courant || !G.actif) return;
      message("Impossible de charger les photos",
        "Ce mini-jeu a besoin d'une connexion à Internet pour récupérer les images. Vérifie ta connexion, puis réessaie.",
        [{ texte: "Réessayer", action: function () { demarrer(jeu); } },
         { texte: "Revenir à l'accueil", ghost: true, action: fermer }]);
    });
  }

  function bande() {
    var ancienne = ov.querySelector(".jx-bande");
    if (ancienne) ancienne.parentNode.removeChild(ancienne);
    var b = el("div", "jx-bande");
    for (var i = 0; i < TAILLE; i++) b.appendChild(el("i", i === 0 ? "on" : ""));
    haut.parentNode.insertBefore(b, corps);
  }
  function majBande() {
    var cases = ov.querySelectorAll(".jx-bande i");
    G.histo.forEach(function (h, i) { if (cases[i]) cases[i].className = h.ok ? "ok" : "ko"; });
    if (cases[G.histo.length] && G.histo.length < TAILLE) cases[G.histo.length].className = "on";
  }

  /* Choisit la prochaine photo qui s'affiche réellement ; écarte les autres. */
  function prochainePhoto() {
    var g = G;
    if (g.histo.length >= TAILLE) return Promise.resolve(null);
    var c = g.cand[g.suivant];
    if (!c) {
      /* plus de photo prête (certaines n'ont pas chargé) : on en cherche d'autres */
      if (!g.suite || !g.reste()) return Promise.resolve(null);
      return g.suite().then(function (plus) {
        if (G !== g || !g.actif || !plus.length && !g.reste()) return null;
        g.cand = g.cand.concat(plus);
        return prochainePhoto();
      });
    }
    if (!c.pre) c.pre = precharger(c.img.s);
    return c.pre.then(function (ok) {
      if (G !== g || !g.actif) return null;
      if (ok) return c;
      marquerMauvaise(g.jeu, c.it);
      g.cand.splice(g.suivant, 1);
      return prochainePhoto();
    });
  }

  function question() {
    var g = G;
    g.repondu = false;
    corps.textContent = "";
    compteur((g.histo.length + 1) + " / " + TAILLE);
    majBande();

    var photo = el("figure", "jx-photo");
    photo.appendChild(el("div", "jx-fond"));
    photo.appendChild(el("div", "jx-spin"));
    var im = el("img");
    im.alt = "";
    im.decoding = "async";
    photo.appendChild(im);
    corps.appendChild(photo);
    var q = el("h2", "jx-q", g.jeu.question);
    corps.appendChild(q);
    var liste = el("div", "jx-opts");
    corps.appendChild(liste);

    prochainePhoto().then(function (c) {
      if (G !== g || !g.actif) return;
      if (!c) { resultat(); return; }
      im.src = c.img.s;
      photo.firstChild.style.backgroundImage = "url(\"" + c.img.s + "\")";
      photo.classList.add("pret");
      noterVu(g.jeu.id, c.it.n);
      /* on précharge déjà la suivante */
      var n = g.cand[g.suivant + 1];
      if (n && !n.pre) n.pre = precharger(n.img.s);

      var props = propositions(g.jeu, c.it);
      props.forEach(function (nom, i) {
        var b = el("button", "jx-opt");
        b.type = "button";
        b.appendChild(el("span", "jx-num", String(i + 1)));
        b.appendChild(el("span", null, nom));
        b.addEventListener("click", function () { repondre(c, nom, b, liste, photo); });
        liste.appendChild(b);
      });
    });
  }

  function repondre(c, choix, bouton, liste, photo) {
    var g = G;
    if (g.repondu) return;
    g.repondu = true;
    var ok = choix === c.it.n;
    if (ok) g.score++;
    g.histo.push({ it: c.it, img: c.img, ok: ok, choix: choix });
    g.suivant++;
    majBande();
    var boutons = liste.querySelectorAll(".jx-opt");
    for (var i = 0; i < boutons.length; i++) {
      boutons[i].disabled = true;
      var nom = boutons[i].lastChild.textContent;
      if (nom === c.it.n) boutons[i].classList.add("juste");
      else if (boutons[i] === bouton) boutons[i].classList.add("faux");
    }
    var img = photo.querySelector("img");
    if (img) img.alt = c.it.n;

    var v = el("div", "jx-verdict " + (ok ? "ok" : "ko"));
    v.setAttribute("role", "status");
    v.appendChild(el("p", "jx-vt", ok ? "Bonne réponse !" : "Raté !"));
    var vn = el("p", "jx-vn");
    vn.appendChild(document.createTextNode(ok ? "C'est bien : " : "C'était : "));
    vn.appendChild(el("b", null, c.it.n));
    v.appendChild(vn);
    if (c.it.p) v.appendChild(el("span", "jx-tag", c.it.p));
    if (c.it.t) v.appendChild(el("span", "jx-tag", c.it.t));
    v.appendChild(el("p", "jx-ve", c.it.e || ""));
    var cr = el("div", "jx-credit");
    var a1 = el("a", null, "Photo : Wikimedia Commons ↗");
    a1.href = lienCommons(c.img.f); a1.target = "_blank"; a1.rel = "noopener noreferrer";
    var a2 = el("a", null, "Wikipédia ↗");
    a2.href = lienWikipedia(c.img.t); a2.target = "_blank"; a2.rel = "noopener noreferrer";
    cr.appendChild(a1); cr.appendChild(a2);
    v.appendChild(cr);
    liste.parentNode.appendChild(v);

    var s = el("div", "jx-suite");
    var dernier = g.histo.length >= TAILLE || (!g.cand[g.suivant] && !g.reste());
    var bs = el("button", "jx-btn", dernier ? "Voir mon score" : "Continuer");
    bs.type = "button";
    bs.addEventListener("click", function () { if (dernier) resultat(); else question(); });
    s.appendChild(bs);
    liste.parentNode.appendChild(s);
    if (v.scrollIntoView) { try { s.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {} }
  }

  function resultat() {
    var g = G, jeu = g.jeu, total = g.histo.length;
    g.actif = true; g.repondu = true;
    corps.textContent = "";
    compteur("");
    var cases = ov.querySelectorAll(".jx-bande i");
    g.histo.forEach(function (h, i) { if (cases[i]) cases[i].className = h.ok ? "ok" : "ko"; });

    var rec = { record: false, premier: false, best: g.score };
    if (total === TAILLE) rec = enregistrer(jeu.id, g.score);

    var classe = g.score >= 8 ? "vert" : (g.score >= 5 ? "orange" : "rouge");
    var palier = g.score <= 3 ? 0 : g.score <= 6 ? 1 : g.score <= 8 ? 2 : g.score === 9 ? 3 : 4;
    var tete = el("div", "jx-res");
    tete.appendChild(el("div", "jx-score " + classe, g.score + " / " + total));
    tete.appendChild(el("p", "jx-msg", jeu.messages[palier]));
    if (total === TAILLE) {
      tete.appendChild(el("p", "jx-rec2", rec.record && !rec.premier ? "Nouveau record personnel !" : (rec.premier ? "Premier score enregistré." : "Record à battre : " + rec.best + " / " + TAILLE)));
    }
    corps.appendChild(tete);
    var jauge = el("div", "jx-jauge");
    var bar = el("div"); bar.style.width = (total ? g.score / total * 100 : 0) + "%";
    jauge.appendChild(bar);
    corps.appendChild(jauge);

    corps.appendChild(el("h3", "jx-h", "Les dix réponses"));
    var ul = el("ul", "jx-recap");
    g.histo.forEach(function (h) {
      var li = el("li", "jx-ri " + (h.ok ? "ok" : "ko"));
      var im = el("img"); im.alt = ""; im.src = (h.img.s.indexOf("/" + TAILLE_IMG + "px-") > 0) ? h.img.s.replace("/" + TAILLE_IMG + "px-", "/" + TAILLE_VIGNETTE + "px-") : h.img.s;
      im.loading = "lazy";
      li.appendChild(im);
      li.appendChild(el("span", null, (h.ok ? "✓ " : "✗ ") + h.it.n));
      ul.appendChild(li);
    });
    corps.appendChild(ul);

    var act = el("div", "jx-actions");
    var r = el("button", "jx-btn", "Rejouer");
    r.type = "button"; r.addEventListener("click", function () { demarrer(jeu); });
    var f = el("button", "jx-btn jx-ghost", "Revenir à l'accueil");
    f.type = "button"; f.addEventListener("click", fermer);
    act.appendChild(r); act.appendChild(f);
    corps.appendChild(act);
    corps.appendChild(el("p", "jx-note", "Ce mini-jeu est sans effet sur ton grade, tes séries et tes statistiques."));
    ov.scrollTop = 0;
  }

  /* ---------- 9. Diagnostic : quelles photos répondent ? ---------- */
  /* Ouvrir l'application avec  ?jeux=diag  à la fin de l'adresse. */
  function diagnostic() {
    ouvrirFenetre("Diagnostic des photos", "menthe");
    G = null;
    corps.textContent = "";
    corps.appendChild(el("p", "jx-rec2", "Interrogation de Wikipédia…"));
    var chaine = Promise.resolve();
    JEUX.forEach(function (jeu) {
      for (var i = 0; i < jeu.items.length; i += LOT) {
        (function (lot) {
          chaine = chaine.then(function () {
            /* on force une nouvelle interrogation pour le diagnostic */
            lot.forEach(function (it) { delete cache()[clePhoto(jeu, it)]; });
            return appelerApi(jeu, lot);
          });
        })(jeu.items.slice(i, i + LOT));
      }
    });
    chaine.then(function () {
      if (!ov) return;
      corps.textContent = "";
      JEUX.forEach(function (jeu) {
        var ok = 0, cassees = 0;
        var liste = el("div", "jx-diag");
        var titre = el("h3", "jx-h", "");
        function maj() {
          titre.textContent = jeu.puce + " — " + ok + " / " + jeu.items.length + " photos trouvées"
            + (cassees ? " (dont " + cassees + " image" + (cassees > 1 ? "s" : "") + " inaccessible" + (cassees > 1 ? "s" : "") + ")" : "");
        }
        jeu.items.forEach(function (it) {
          var m = cache()[clePhoto(jeu, it)];
          var d = el("div", "jx-d" + (m && m.s ? "" : " ko"));
          var legende = el("small", null, m && m.s ? m.t : "photo introuvable");
          if (m && m.s) {
            ok++;
            var im = el("img"); im.alt = ""; im.loading = "lazy";
            im.onerror = function () {
              var c = el("div", "jx-d0", "✗");
              if (im.parentNode) im.parentNode.replaceChild(c, im);
              d.classList.add("ko");
              legende.textContent = "image inaccessible";
              cassees++; maj();
            };
            im.src = (m.s.indexOf("/" + TAILLE_IMG + "px-") > 0) ? m.s.replace("/" + TAILLE_IMG + "px-", "/" + TAILLE_VIGNETTE + "px-") : m.s;
            d.appendChild(im);
          } else d.appendChild(el("div", "jx-d0", "✗"));
          d.appendChild(el("b", null, it.n));
          d.appendChild(legende);
          liste.appendChild(d);
        });
        maj();
        corps.appendChild(titre);
        corps.appendChild(liste);
      });
    }, function (e) {
      if (!ov) return;
      corps.textContent = "";
      corps.appendChild(el("p", "jx-rec2", "Échec de l'interrogation de Wikipédia : " + (e && e.message ? e.message : e)));
    });
  }

  /* ---------- 10. Démarrage ---------- */
  function auto() {
    var h = document.getElementById("lqdh-jeux");
    if (h) monter(h);
    if (/[?&]jeux=diag\b/.test(location.search)) diagnostic();
  }

  window.LQDH_JEUX = { monter: monter, ouvrir: ouvrir, diagnostic: diagnostic, jeux: JEUX };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
  else auto();
})();
