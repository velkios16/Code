/* =============================================================
   Le Quart d'heure — module de grades et d'expérience
   -------------------------------------------------------------
   Autonome : aucune dépendance, aucune fonction d'index.html requise.
   Lit directement lqdh_v2_data (days[jour][difficulté].score) et
   recalcule l'XP à chaque affichage : rien n'est stocké en double,
   la progression est donc rétroactive, et l'import d'une sauvegarde
   met le grade à jour tout seul.

   Barème : 10 XP par bonne réponse en moyen, 20 en difficile.
   Vingt-deux grades, progression exponentielle : de Stagiaire à Major
   (10 000 XP) pour les militaires du rang et les sous-officiers, puis
   d'Aspirant à Général d'armée pour les officiers, et enfin Maréchal de
   France à 320 000 XP.

   Intégration :
     <div id="lqdh-niveau"></div>            (accueil)
     <div id="lqdh-niveau-resultat"></div>   (écran de résultat, optionnel)
     <script src="niveaux.js?v=3"></script>

   En fin de série, pour l'animation du gain :
     LQDH_NIVEAUX.rafraichir({ gain: score * (diff==="difficile"?20:10) });
   ============================================================= */
(function () {
  'use strict';
  if (window.LQDH_NIVEAUX) return;

  var LS_DATA  = 'lqdh_v2_data';
  var LS_GRADE = 'lqdh_niveaux_grade';   /* dernier grade vu, pour l'annonce de promotion */

  var XP_PAR_BONNE = { moyen: 10, difficile: 20 };

  /* Date de départ du décompte — TOUT LE MONDE COMMENCE STAGIAIRE.
     Les séries antérieures restent dans le tableau des jours et dans les
     statistiques, elles ne rapportent simplement aucun point.

     À FIGER UNE FOIS POUR TOUTES, au même titre que JOUR_ZERO : avancer cette
     date effacerait de l'XP déjà acquise, la reculer en distribuerait
     rétroactivement. Elle est dans le code et non dans le localStorage, afin
     que la remise à zéro survive à une réinstallation, à un changement
     d'appareil et à l'import d'une ancienne sauvegarde.

     Format : jour de jeu "AAAA-MM-JJ" (la journée bascule à 20 h). */
  var DEPART = '2026-08-21';

  /* -----------------------------------------------------------
     1. L'échelle des grades
     Seuils cumulés, croissance exponentielle : l'écart entre deux
     grades vaut environ 1,45 fois le précédent jusqu'à Major, puis
     environ 1,30 fois chez les officiers, pour que le sommet reste un
     objectif lointain sans devenir hors de portée.

     Repères (une série difficile parfaite = 300 XP) :
       Major             10 000 XP   ≈ 33 séries difficiles parfaites
       Colonel           83 000 XP   ≈ 8 mois à raison de deux séries par jour
       Maréchal de France 320 000 XP ≈ 2 ans et demi, mêmes conditions

     LES SEUILS DES DIX PREMIERS GRADES NE DOIVENT JAMAIS CHANGER : personne
     n'est rétrogradé, les nouveaux grades ne font que s'ajouter au-dessus.
     Le champ « k » range chaque grade dans son corps (voir CORPS).
     ----------------------------------------------------------- */
  var CORPS = {
    rang: { s:"Militaire du rang",   p:"Militaires du rang"   },
    sous: { s:"Sous-officier",       p:"Sous-officiers"       },
    sub:  { s:"Officier subalterne", p:"Officiers subalternes" },
    sup:  { s:"Officier supérieur",  p:"Officiers supérieurs" },
    gen:  { s:"Officier général",    p:"Officiers généraux"   },
    dign: { s:"Dignité d'État",      p:"Dignité d'État"       }
  };

  var PALIERS = [
    { n:1, k:"rang",  nom:"Stagiaire",         devise:"On vous a confié la machine à café",    xp:0,     c1:"#FFF7CC", c2:"#FFE98A", lueur:0.00 },
    { n:2, k:"rang",  nom:"Recrue",            devise:"Le pas cadencé, à peu près",            xp:150,   c1:"#FFEFA0", c2:"#FFE05C", lueur:0.10 },
    { n:3, k:"rang",  nom:"Soldat 1re classe", devise:"Sait lire une carte à l'endroit",       xp:400,   c1:"#FFE470", c2:"#FFD11A", lueur:0.18 },
    { n:4, k:"rang",  nom:"Caporal",           devise:"Deux galons et un avis sur tout",       xp:750,   c1:"#FFD84A", c2:"#FFC300", lueur:0.26 },
    { n:5, k:"rang",  nom:"Caporal-chef",      devise:"On vous écoute. Parfois.",              xp:1250,  c1:"#FFCC2E", c2:"#FFB000", lueur:0.34 },
    { n:6, k:"sous",  nom:"Sergent",           devise:"La voix qui porte au fond du couloir",  xp:2000,  c1:"#FFC01F", c2:"#FF9E00", lueur:0.42 },
    { n:7, k:"sous",  nom:"Sergent-chef",      devise:"Corrige les officiers, poliment",       xp:3050,  c1:"#FFB528", c2:"#FF8A0A", lueur:0.52 },
    { n:8, k:"sous",  nom:"Adjudant",          devise:"Plus personne ne discute",              xp:4600,  c1:"#FFAE3A", c2:"#F97316", lueur:0.62 },
    { n:9, k:"sous",  nom:"Adjudant-chef",     devise:"La mémoire vivante du régiment",        xp:6800,  c1:"#FFC24D", c2:"#EA6A0A", lueur:0.75 },
    { n:10, k:"sous", nom:"Major",             devise:"Le grade et la légende",                xp:10000, c1:"#FFF1A8", c2:"#FFB300", lueur:1.00 },
    { n:11, k:"sub", nom:"Aspirant", devise:"Un pied chez les officiers, l'autre à la cantine", xp:14200, c1:"#C9FBE8", c2:"#3EE0AE", lueur:1.04 },
    { n:12, k:"sub", nom:"Sous-lieutenant", devise:"Sait écouter son adjudant, ce qui est déjà beaucoup", xp:19600, c1:"#BAF9EE", c2:"#34DBC1", lueur:1.08 },
    { n:13, k:"sub", nom:"Lieutenant", devise:"La section suit. Le plus souvent.", xp:26600, c1:"#AEF4F7", c2:"#2DD3E0", lueur:1.12 },
    { n:14, k:"sub", nom:"Capitaine", devise:"Une compagnie et mille rapports à signer", xp:35700, c1:"#A6E9FF", c2:"#2FBEF2", lueur:1.16 },
    { n:15, k:"sup", nom:"Commandant", devise:"Voit la carte en grand, les notes de frais en petit", xp:47600, c1:"#AED6FF", c2:"#4F9DFF", lueur:1.20 },
    { n:16, k:"sup", nom:"Lieutenant-colonel", devise:"Le chef de corps en second, le diaporama en premier", xp:63000, c1:"#BAC7FF", c2:"#6F80FF", lueur:1.25 },
    { n:17, k:"sup", nom:"Colonel", devise:"Le régiment, c'est lui", xp:83000, c1:"#CCB9FF", c2:"#9265FF", lueur:1.30 },
    { n:18, k:"gen", nom:"Général de brigade", devise:"Deux étoiles. Le ciel se rapproche.", xp:109000, c1:"#E5B9FF", c2:"#BF5CF5", lueur:1.35 },
    { n:19, k:"gen", nom:"Général de division", devise:"Trois étoiles et un aide de camp", xp:143000, c1:"#FFB9E4", c2:"#F050B5", lueur:1.40 },
    { n:20, k:"gen", nom:"Général de corps d'armée", devise:"Quatre étoiles, un agenda déjà plein pour l'an prochain", xp:187000, c1:"#FFB5C0", c2:"#FF5F76", lueur:1.45 },
    { n:21, k:"gen", nom:"Général d'armée", devise:"Cinq étoiles, plus rien à prouver", xp:245000, c1:"#FFFFFF", c2:"#C8D2E6", lueur:1.50 },
    { n:22, k:"dign", nom:"Maréchal de France", devise:"Sept étoiles, un bâton, plus rien au-dessus", xp:320000, c1:"#FFFBE0", c2:"#FFC933", lueur:1.60 }
  ];

  /* Halo lumineux : les dix premiers grades gardent leur ambre d'origine,
     les grades d'officier prennent la teinte de leur propre dégradé. */
  function rgbDe(hex) {
    var h = String(hex).replace('#', '');
    var n = parseInt(h, 16);
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }
  PALIERS.forEach(function (x) { x.halo = x.n <= 10 ? '255,190,40' : rgbDe(x.c2); });

  var LIBELLE_OUVRIR = 'Voir les ' + PALIERS.length + ' grades';
  var LIBELLE_FERMER = 'Masquer les grades';

  /* -----------------------------------------------------------
     2. Lecture de la progression
     ----------------------------------------------------------- */
  function lire(cle) {
    try { var v = localStorage.getItem(cle); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }
  function ecrire(cle, val) {
    try { localStorage.setItem(cle, JSON.stringify(val)); } catch (e) {}
  }

  /* Somme de l'XP sur les séries jouées à partir de DEPART.
     L'entraînement libre n'écrit rien dans days : il ne rapporte donc rien,
     ce qui est cohérent — sinon la barre se remplirait sans limite. */
  function releve() {
    var d = lire(LS_DATA);
    var xp = 0, series = 0, bonnes = 0, ignorees = 0;
    if (!d || !d.days || typeof d.days !== 'object') return { xp:0, series:0, bonnes:0, ignorees:0 };

    for (var jour in d.days) {
      if (!Object.prototype.hasOwnProperty.call(d.days, jour)) continue;
      var entree = d.days[jour];
      if (!entree || typeof entree !== 'object') continue;

      /* Les jours de jeu sont au format AAAA-MM-JJ : la comparaison
         alphabétique est aussi la comparaison chronologique. */
      if (jour < DEPART) {
        if (entree.moyen) ignorees++;
        if (entree.difficile) ignorees++;
        continue;
      }

      for (var diff in XP_PAR_BONNE) {
        var r = entree[diff];
        if (!r || typeof r.score !== 'number' || !isFinite(r.score) || r.score < 0) continue;
        var plafond = (typeof r.total === 'number' && r.total > 0) ? r.total : 15;
        var sc = Math.min(Math.round(r.score), plafond);
        xp += sc * XP_PAR_BONNE[diff];
        bonnes += sc;
        series += 1;
      }
    }
    return { xp: xp, series: series, bonnes: bonnes, ignorees: ignorees };
  }

  /* "2026-08-21" -> "21 août 2026" */
  var MOIS = ['janvier','février','mars','avril','mai','juin',
              'juillet','août','septembre','octobre','novembre','décembre'];
  function joliDepart() {
    var p = DEPART.split('-');
    return Number(p[2]) + ' ' + MOIS[Number(p[1]) - 1] + ' ' + p[0];
  }

  /* -----------------------------------------------------------
     3. Position sur l'échelle
     ----------------------------------------------------------- */
  function progression(xp) {
    var i = 0;
    while (i < PALIERS.length - 1 && xp >= PALIERS[i + 1].xp) i++;
    var palier = PALIERS[i], suivant = PALIERS[i + 1] || null;

    if (!suivant) {
      return { xp:xp, palier:palier, suivant:null, pct:100, restant:0, max:true };
    }
    var dans = xp - palier.xp, requis = suivant.xp - palier.xp;
    return {
      xp: xp, palier: palier, suivant: suivant,
      pct: Math.max(0, Math.min(100, dans / requis * 100)),
      restant: Math.max(0, suivant.xp - xp),
      max: false
    };
  }

  /* -----------------------------------------------------------
     4. Styles — repris des variables :root de l'app
     ----------------------------------------------------------- */
  var CSS = [
    /* carte */
    '.lqn{--lqn-a:#FFE98A;--lqn-b:#FFD11A;--lqn-l:0;--lqn-rgb:255,190,40;position:relative;overflow:hidden;',
    'background:var(--velours,#1F1436);border:1px solid var(--ligne,#3B2A63);',
    'border-radius:var(--r,14px);padding:20px}',
    '.lqn::before{content:"";position:absolute;inset:0;pointer-events:none;',
    'background:radial-gradient(120% 150% at 10% 0%,var(--lqn-b),transparent 60%);',
    'opacity:calc(var(--lqn-l)*.13);transition:opacity .6s ease}',

    /* en-tête : écu + identité + rang */
    '.lqn-tete{position:relative;display:flex;align-items:center;gap:14px}',
    '.lqn-ecu{flex:0 0 44px;width:44px;height:50px;display:grid;place-items:center;',
    'clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);',
    'background:linear-gradient(155deg,var(--lqn-a),var(--lqn-b));color:var(--nuit,#150E29);',
    'font-family:var(--mono,monospace);font-weight:700;font-size:17px;',
    'box-shadow:0 0 calc(var(--lqn-l)*24px) rgba(var(--lqn-rgb),calc(var(--lqn-l)*.5));',
    'transition:background .6s ease,box-shadow .6s ease}',
    '.lqn-ident{flex:1;min-width:0}',
    '.lqn-corps{margin-bottom:3px;font-family:var(--mono,monospace);font-size:10px;',
    'letter-spacing:.1em;text-transform:uppercase;color:var(--brume,#A296C4);opacity:.85}',
    '.lqn-grade{font-family:var(--display,sans-serif);font-weight:800;font-size:20px;',
    'line-height:1.15;letter-spacing:-.2px;color:var(--craie,#F4EFFA)}',
    '.lqn-devise{font-size:13px;color:var(--brume,#A296C4);margin-top:3px;line-height:1.35}',
    '.lqn-rang{align-self:flex-start;padding-top:4px;white-space:nowrap;',
    'font-family:var(--mono,monospace);font-size:11px;letter-spacing:.08em;',
    'text-transform:uppercase;color:var(--brume,#A296C4);opacity:.75}',

    /* barre */
    '.lqn-piste{position:relative;height:12px;margin-top:18px;border-radius:6px;overflow:hidden;',
    'background:var(--relief,#2A1B48)}',
    '.lqn-jauge{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:6px;',
    'background:linear-gradient(90deg,var(--lqn-a),var(--lqn-b));',
    'box-shadow:0 0 calc(6px + var(--lqn-l)*16px) rgba(var(--lqn-rgb),calc(.28 + var(--lqn-l)*.45));',
    'transition:width 1.1s cubic-bezier(.22,1,.36,1),background .6s ease,box-shadow .6s ease}',
    '.lqn-jauge::after{content:"";position:absolute;inset:0;',
    'background:linear-gradient(100deg,transparent 20%,rgba(255,255,255,.5) 50%,transparent 80%);',
    'transform:translateX(-100%);animation:lqn-balayage 3.6s ease-in-out 1.1s infinite}',
    '@keyframes lqn-balayage{0%{transform:translateX(-100%)}55%,100%{transform:translateX(240%)}}',
    '.lqn.max .lqn-jauge{background:linear-gradient(90deg,#FFB300,#FFF1A8,#FFB300);',
    'background-size:220% 100%;animation:lqn-or 4.5s linear infinite}',
    '@keyframes lqn-or{to{background-position:-220% 0}}',

    /* pied */
    '.lqn-pied{display:flex;justify-content:space-between;align-items:baseline;gap:14px;',
    'margin-top:10px;font-family:var(--mono,monospace);font-size:12px;color:var(--brume,#A296C4)}',
    '.lqn-xp{color:var(--craie,#F4EFFA)}',
    '.lqn-xp b{color:var(--lqn-b);font-weight:700}',
    '.lqn-reste{text-align:right}',

    /* gain de la série qui vient de se terminer */
    '.lqn-gain{display:inline-block;margin-left:8px;padding:2px 9px;border-radius:999px;',
    'background:rgba(255,194,75,.14);border:1px solid rgba(255,194,75,.35);',
    'color:var(--ambre,#FFC24B);font-size:11px;font-weight:700;',
    'opacity:0;transform:translateY(4px);animation:lqn-gain .5s ease .35s forwards}',
    '@keyframes lqn-gain{to{opacity:1;transform:none}}',

    /* dépliant de l\'échelle */
    '.lqn-lien{margin-top:14px;background:none;border:0;padding:0;cursor:pointer;',
    'font-family:var(--body,sans-serif);font-size:13px;color:var(--menthe,#3EE0AE)}',
    '.lqn-lien:hover{text-decoration:underline}',
    '.lqn-lien:focus-visible{outline:2px solid var(--menthe,#3EE0AE);outline-offset:3px;border-radius:4px}',
    '.lqn-echelle{display:none;margin-top:14px;padding-top:12px;',
    'border-top:1px solid var(--ligne,#3B2A63)}',
    '.lqn-echelle.ouverte{display:block}',
    '.lqn-liste{position:relative;max-height:min(52vh,340px);overflow-x:hidden;overflow-y:auto;',
    'overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--ligne,#3B2A63) transparent}',
    '.lqn-corps-titre{margin:14px 0 3px;padding:0 8px;font-family:var(--mono,monospace);font-size:10px;',
    'letter-spacing:.1em;text-transform:uppercase;color:var(--brume,#A296C4);opacity:.8}',
    '.lqn-corps-titre:first-child{margin-top:0}',
    '.lqn-ligne{display:flex;align-items:center;gap:11px;padding:5px 8px;border-radius:8px;font-size:14px}',
    '.lqn-ligne.ici{background:rgba(255,255,255,.06)}',
    '.lqn-pastille{flex:0 0 10px;width:10px;height:10px;border-radius:3px;opacity:.28}',
    '.lqn-ligne.acquis .lqn-pastille{opacity:1}',
    '.lqn-nom{flex:1;color:var(--brume,#A296C4)}',
    '.lqn-ligne.acquis .lqn-nom{color:var(--craie,#F4EFFA)}',
    '.lqn-ligne.ici .lqn-nom{font-weight:600}',
    '.lqn-seuil{font-family:var(--mono,monospace);font-size:11px;color:var(--brume,#A296C4);opacity:.7}',
    '.lqn-depart{margin:14px 0 0;padding-top:12px;border-top:1px solid var(--ligne,#3B2A63);',
    'font-size:12.5px;line-height:1.5;color:var(--brume,#A296C4)}',

    /* annonce de promotion */
    '.lqn-promo{position:fixed;left:50%;bottom:26px;z-index:60;display:flex;align-items:center;gap:13px;',
    'padding:13px 20px 13px 15px;max-width:min(92vw,380px);border-radius:var(--r,14px);',
    'background:var(--velours,#1F1436);border:1px solid rgba(var(--lqn-rgb,255,194,75),.4);',
    'box-shadow:0 18px 46px rgba(0,0,0,.5),0 0 34px rgba(var(--lqn-rgb,255,190,40),.16);',
    'transform:translate(-50%,150%);transition:transform .55s cubic-bezier(.22,1,.36,1)}',
    '.lqn-promo.visible{transform:translate(-50%,0)}',
    '.lqn-promo-ecu{flex:0 0 34px;width:34px;height:39px;display:grid;place-items:center;',
    'clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);color:var(--nuit,#150E29);',
    'font-family:var(--mono,monospace);font-weight:700;font-size:14px}',
    '.lqn-promo-l{font-family:var(--mono,monospace);font-size:10px;letter-spacing:.1em;',
    'text-transform:uppercase;color:var(--brume,#A296C4)}',
    '.lqn-promo-g{font-family:var(--display,sans-serif);font-weight:800;font-size:18px;',
    'color:var(--craie,#F4EFFA);line-height:1.2}',

    '@media (max-width:420px){.lqn-devise,.lqn-mot{display:none}.lqn-grade{font-size:18px}',
    '.lqn-pied{font-size:11px}}',
    '@media (prefers-reduced-motion:reduce){.lqn-jauge,.lqn-promo{transition:none}',
    '.lqn-jauge::after,.lqn.max .lqn-jauge,.lqn-gain{animation:none}.lqn-gain{opacity:1;transform:none}}'
  ].join('');

  function injecterCss() {
    if (document.getElementById('lqn-css')) return;
    var s = document.createElement('style');
    s.id = 'lqn-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* -----------------------------------------------------------
     5. Rendu
     ----------------------------------------------------------- */
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F'); }

  function contenu(p, gain) {
    var corpsCourant = '';
    var echelle = PALIERS.map(function (x) {
      var cls = 'lqn-ligne' + (p.xp >= x.xp ? ' acquis' : '') + (x.n === p.palier.n ? ' ici' : '');
      var titre = '';
      if (x.k !== corpsCourant) {
        corpsCourant = x.k;
        titre = '<div class="lqn-corps-titre">' + CORPS[x.k].p + '</div>';
      }
      return titre + '<div class="' + cls + '">' +
               '<span class="lqn-pastille" style="background:linear-gradient(135deg,' + x.c1 + ',' + x.c2 + ')"></span>' +
               '<span class="lqn-nom">' + x.nom + '</span>' +
               '<span class="lqn-seuil">' + fmt(x.xp) + ' XP</span>' +
             '</div>';
    }).join('');

    return '<div class="lqn-tete">' +
             '<div class="lqn-ecu">' + p.palier.n + '</div>' +
             '<div class="lqn-ident">' +
               '<div class="lqn-corps">' + CORPS[p.palier.k].s + '</div>' +
               '<div class="lqn-grade">' + p.palier.nom + '</div>' +
               '<div class="lqn-devise">' + p.palier.devise + '</div>' +
             '</div>' +
             '<div class="lqn-rang"><span class="lqn-mot">grade </span>' + p.palier.n + ' / ' + PALIERS.length + '</div>' +
           '</div>' +
           '<div class="lqn-piste"><div class="lqn-jauge"></div></div>' +
           '<div class="lqn-pied">' +
             '<span class="lqn-xp"><b>' + fmt(p.xp) + '</b> XP' +
               (gain > 0 ? '<span class="lqn-gain">+' + fmt(gain) + '</span>' : '') +
             '</span>' +
             '<span class="lqn-reste">' +
               (p.max ? 'grade maximal' : fmt(p.restant) + ' XP avant ' + p.suivant.nom) +
             '</span>' +
           '</div>' +
           '<button type="button" class="lqn-lien" aria-expanded="false">' + LIBELLE_OUVRIR + '</button>' +
           '<div class="lqn-echelle"><div class="lqn-liste">' + echelle + '</div>' +
             '<p class="lqn-depart">10 XP par bonne réponse en série moyenne, 20 en difficile. ' +
             'Les points sont comptés à partir de la série du ' + joliDepart() + ' : ' +
             'tout le monde part Stagiaire.</p>' +
           '</div>';
  }

  function peindre(hote, p, gain) {
    var bloc = document.createElement('div');
    bloc.className = 'lqn' + (p.max ? ' max' : '');
    bloc.style.setProperty('--lqn-a', p.palier.c1);
    bloc.style.setProperty('--lqn-b', p.palier.c2);
    bloc.style.setProperty('--lqn-l', p.palier.lueur);
    bloc.style.setProperty('--lqn-rgb', p.palier.halo);
    bloc.setAttribute('role', 'group');
    bloc.setAttribute('aria-label', 'Grade ' + p.palier.nom + ', ' + p.xp + ' points d\'expérience');
    bloc.innerHTML = contenu(p, gain);

    hote.innerHTML = '';
    hote.appendChild(bloc);

    var jauge = bloc.querySelector('.lqn-jauge');
    requestAnimationFrame(function () {
      jauge.style.width = (p.max ? 100 : Math.max(p.pct, p.xp > 0 ? 2.5 : 0)) + '%';
    });

    var lien = bloc.querySelector('.lqn-lien');
    var liste = bloc.querySelector('.lqn-echelle');
    lien.addEventListener('click', function () {
      var ouvert = liste.classList.toggle('ouverte');
      lien.setAttribute('aria-expanded', String(ouvert));
      lien.textContent = ouvert ? LIBELLE_FERMER : LIBELLE_OUVRIR;
      if (ouvert) {
        /* L'échelle compte 22 lignes : on la fait défiler jusqu'au grade actuel. */
        var zone = bloc.querySelector('.lqn-liste');
        var ici = bloc.querySelector('.lqn-ligne.ici');
        if (zone && ici) {
          zone.scrollTop = Math.max(0, ici.offsetTop - zone.clientHeight / 2 + ici.offsetHeight / 2);
        }
      }
    });
  }

  /* -----------------------------------------------------------
     6. Annonce de promotion
     ----------------------------------------------------------- */
  function annoncer(palier) {
    if (document.querySelector('.lqn-promo')) return;
    var t = document.createElement('div');
    t.className = 'lqn-promo';
    t.setAttribute('role', 'status');
    t.style.setProperty('--lqn-rgb', palier.halo);
    t.innerHTML =
      '<div class="lqn-promo-ecu" style="background:linear-gradient(155deg,' + palier.c1 + ',' + palier.c2 + ')">' + palier.n + '</div>' +
      '<div><div class="lqn-promo-l">Promotion · ' + CORPS[palier.k].s + '</div>' +
      '<div class="lqn-promo-g">' + palier.nom + '</div></div>';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('visible'); });
    setTimeout(function () {
      t.classList.remove('visible');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 700);
    }, 4400);
  }

  function verifierPromotion(p) {
    var vu = lire(LS_GRADE);
    if (typeof vu !== 'number') { ecrire(LS_GRADE, p.palier.n); return; }
    if (p.palier.n !== vu) {
      ecrire(LS_GRADE, p.palier.n);
      if (p.palier.n > vu) annoncer(p.palier);
    }
  }

  /* -----------------------------------------------------------
     7. Montage et auto-réparation
     ----------------------------------------------------------- */
  var SELECTEUR = '#lqdh-niveau, #lqdh-niveau-resultat';

  function rafraichir(options) {
    var gain = (options && Number(options.gain)) || 0;
    var hotes = document.querySelectorAll(SELECTEUR);
    if (!hotes.length) return null;

    injecterCss();
    var p = progression(releve().xp);

    for (var i = 0; i < hotes.length; i++) {
      var h = hotes[i];
      /* Le gain n'est affiché que sur l'écran de résultat. */
      peindre(h, p, h.id === 'lqdh-niveau-resultat' ? gain : 0);
    }
    verifierPromotion(p);
    return p;
  }

  /* Si l'app reconstruit une vue et vide le conteneur, on le repeuple.
     Aucune modification du code existant n'est nécessaire pour cela. */
  function surveiller() {
    var attente = null;
    var obs = new MutationObserver(function () {
      if (attente) return;
      attente = setTimeout(function () {
        attente = null;
        var hotes = document.querySelectorAll(SELECTEUR), vide = false;
        for (var i = 0; i < hotes.length; i++) if (!hotes[i].querySelector('.lqn')) vide = true;
        if (vide) rafraichir();
      }, 150);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function demarrer() {
    rafraichir();
    surveiller();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) rafraichir();
    });
    window.addEventListener('storage', function (e) {
      if (e.key === LS_DATA) rafraichir();
    });
  }

  /* -----------------------------------------------------------
     8. Interface publique
     ----------------------------------------------------------- */
  window.LQDH_NIVEAUX = {
    PALIERS: PALIERS,
    CORPS: CORPS,
    XP_PAR_BONNE: XP_PAR_BONNE,
    DEPART: DEPART,

    /* Recalcule et redessine. { gain: n } anime le gain sur l'écran résultat. */
    rafraichir: rafraichir,

    /* État courant, sans effet de bord. */
    etat: function () {
      var r = releve(), p = progression(r.xp);
      p.series = r.series; p.bonnes = r.bonnes; p.ignorees = r.ignorees; p.depart = DEPART;
      return p;
    },

    /* XP qu'une série rapporte, pour affichage ailleurs si besoin. */
    gainSerie: function (diff, score) {
      return (Number(score) || 0) * (XP_PAR_BONNE[diff] || XP_PAR_BONNE.moyen);
    },

    /* Contrôle en console. */
    diagnostic: function () {
      var r = releve(), p = progression(r.xp);
      console.log('[grades] décompte depuis :', DEPART);
      console.log('[grades] séries comptées :', r.series, '— antérieures ignorées :', r.ignorees);
      console.log('[grades] bonnes réponses :', r.bonnes, '— XP total :', r.xp);
      console.log('[grades] grade           :', p.palier.n, p.palier.nom,
                  p.max ? '(maximal)' : '— ' + Math.round(p.pct) + ' % vers ' + p.suivant.nom);
      return { depart: DEPART, xp: r.xp, series: r.series, ignorees: r.ignorees,
               grade: p.palier.nom, pct: Math.round(p.pct) };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
