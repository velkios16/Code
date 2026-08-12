/* Le Quart d'heure — module de sauvegarde (export / import)
   Autonome : aucune dépendance, aucune fonction d'index.html requise.
   Intégration :
     <div id="lqdh-sauvegarde"></div>
     <script src="sauvegarde.js?v=3.8"></script>
   ou, à la main : LQDH_SAUVEGARDE.monter(document.getElementById('mon-conteneur'))
*/
(function () {
  'use strict';

  var LS_DATA = 'lqdh_v2_data';
  var FORMAT = 1;

  /* ---------- styles (alignés sur les variables :root du site) ---------- */
  var CSS = [
    '.sv-bloc{margin:28px 0 8px;font-family:"Instrument Sans",system-ui,sans-serif}',
    '.sv-titre{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.72rem;',
    'letter-spacing:.14em;text-transform:uppercase;opacity:.55;margin:0 0 10px}',
    '.sv-rangee{display:flex;flex-wrap:wrap;gap:10px}',
    '.sv-btn{flex:1 1 160px;padding:12px 16px;border-radius:12px;cursor:pointer;',
    'font:600 .95rem/1.2 "Instrument Sans",system-ui,sans-serif;',
    'background:transparent;color:var(--menthe,#3EE0AE);',
    'border:1px solid color-mix(in srgb,var(--menthe,#3EE0AE) 45%,transparent);',
    'transition:background .15s ease,transform .1s ease}',
    '.sv-btn:hover{background:color-mix(in srgb,var(--menthe,#3EE0AE) 12%,transparent)}',
    '.sv-btn:active{transform:translateY(1px)}',
    '.sv-btn:focus-visible{outline:2px solid var(--menthe,#3EE0AE);outline-offset:2px}',
    '.sv-btn.sv-danger{color:var(--grenat,#FF5F76);',
    'border-color:color-mix(in srgb,var(--grenat,#FF5F76) 45%,transparent)}',
    '.sv-btn.sv-danger:hover{background:color-mix(in srgb,var(--grenat,#FF5F76) 12%,transparent)}',
    '.sv-msg{margin:12px 0 0;font-size:.88rem;line-height:1.45;min-height:1.2em}',
    '.sv-msg.sv-ok{color:var(--menthe,#3EE0AE)}',
    '.sv-msg.sv-err{color:var(--grenat,#FF5F76)}',
    '.sv-msg.sv-info{opacity:.7}',
    '.sv-panneau{margin-top:12px;padding:14px 16px;border-radius:12px;',
    'border:1px solid color-mix(in srgb,var(--ambre,#FFC24B) 40%,transparent);',
    'background:color-mix(in srgb,var(--ambre,#FFC24B) 8%,transparent)}',
    '.sv-panneau p{margin:0 0 12px;font-size:.9rem;line-height:1.5}',
    '.sv-chiffre{font-family:"JetBrains Mono",ui-monospace,monospace;color:var(--ambre,#FFC24B)}',
    '.sv-cache{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
    '@media (prefers-reduced-motion:reduce){.sv-btn{transition:none}}'
  ].join('');

  function injecterCss() {
    if (document.getElementById('sv-css')) return;
    var s = document.createElement('style');
    s.id = 'sv-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- utilitaires ---------- */
  function estObjet(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function lireLocal() {
    try {
      var brut = localStorage.getItem(LS_DATA);
      return brut ? JSON.parse(brut) : null;
    } catch (e) {
      return null;
    }
  }

  function ecrireLocal(obj) {
    localStorage.setItem(LS_DATA, JSON.stringify(obj));
  }

  // Compte les séries jouées, quelle que soit la forme exacte de la sauvegarde :
  // tout objet portant un champ "score" numérique est une série.
  function compterSeries(noeud, vus) {
    vus = vus || 0;
    if (!estObjet(noeud)) return vus;
    if (typeof noeud.score === 'number') return vus + 1;
    for (var k in noeud) {
      if (Object.prototype.hasOwnProperty.call(noeud, k)) {
        vus = compterSeries(noeud[k], vus);
      }
    }
    return vus;
  }

  // Fusion générique, tolérante à la structure exacte de lqdh_v2_data.
  // Règles : deux séries en conflit -> on garde celle qui a le meilleur score ;
  // nombres -> maximum ; booléens -> ou logique ; reste -> valeur locale.
  function fusionner(local, ext) {
    if (local === undefined) return ext;
    if (ext === undefined) return local;

    if (estObjet(local) && estObjet(ext)) {
      if (typeof local.score === 'number' && typeof ext.score === 'number') {
        return ext.score > local.score ? ext : local;
      }
      var out = {};
      var k;
      for (k in local) if (Object.prototype.hasOwnProperty.call(local, k)) out[k] = local[k];
      for (k in ext) {
        if (Object.prototype.hasOwnProperty.call(ext, k)) {
          out[k] = Object.prototype.hasOwnProperty.call(local, k)
            ? fusionner(local[k], ext[k])
            : ext[k];
        }
      }
      return out;
    }

    if (Array.isArray(local) && Array.isArray(ext)) {
      return ext.length > local.length ? ext : local;
    }
    if (typeof local === 'number' && typeof ext === 'number') {
      return Math.max(local, ext);
    }
    if (typeof local === 'boolean' && typeof ext === 'boolean') {
      return local || ext;
    }
    return local;
  }

  function horodatage() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function versionApp() {
    try {
      /* jshint ignore:start */
      if (typeof APP_VERSION !== 'undefined') return String(APP_VERSION);
      /* jshint ignore:end */
    } catch (e) {}
    return '';
  }

  /* ---------- export ---------- */
  function exporter(msg) {
    var data = lireLocal();
    if (!data) {
      msg('Aucune progression à exporter pour le moment.', 'err');
      return;
    }
    var enveloppe = {
      app: 'lqdh',
      format: FORMAT,
      version: versionApp(),
      exporte: new Date().toISOString(),
      data: data
    };
    var texte = JSON.stringify(enveloppe);
    var nom = 'quart-dheure-' + horodatage() + '.json';

    try {
      var blob = new Blob([texte], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = nom;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      msg(nom + ' — ' + compterSeries(data) + ' séries enregistrées.', 'ok');
    } catch (e) {
      // Repli : presse-papiers (utile sur certains navigateurs mobiles verrouillés)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texte).then(function () {
          msg('Téléchargement impossible : la sauvegarde a été copiée dans le presse-papiers.', 'ok');
        }, function () {
          msg('Export impossible sur ce navigateur.', 'err');
        });
      } else {
        msg('Export impossible sur ce navigateur.', 'err');
      }
    }
  }

  /* ---------- import ---------- */
  function validerEnveloppe(txt) {
    var obj = JSON.parse(txt); // peut lever
    if (!estObjet(obj)) throw new Error('forme');
    // Enveloppe v1, ou fichier brut (ancienne sauvegarde) : on accepte les deux.
    var data = (obj.app === 'lqdh' && estObjet(obj.data)) ? obj.data : obj;
    if (!estObjet(data)) throw new Error('forme');
    return { data: data, exporte: obj.exporte || null, version: obj.version || null };
  }

  function monterPanneau(zone, paquet, msg, apres) {
    var local = lireLocal() || {};
    var nLocal = compterSeries(local);
    var nExt = compterSeries(paquet.data);
    var date = paquet.exporte ? new Date(paquet.exporte).toLocaleDateString('fr-FR') : 'date inconnue';

    zone.innerHTML = '';
    var pan = document.createElement('div');
    pan.className = 'sv-panneau';

    var p = document.createElement('p');
    p.innerHTML = 'Sauvegarde du ' + date +
      ' : <span class="sv-chiffre">' + nExt + '</span> séries. ' +
      'Sur cet appareil : <span class="sv-chiffre">' + nLocal + '</span>.';
    pan.appendChild(p);

    var rangee = document.createElement('div');
    rangee.className = 'sv-rangee';

    var bFus = document.createElement('button');
    bFus.type = 'button';
    bFus.className = 'sv-btn';
    bFus.textContent = 'Fusionner';
    bFus.addEventListener('click', function () {
      var fusion = fusionner(local, paquet.data);
      ecrireLocal(fusion);
      msg('Fusion terminée — ' + compterSeries(fusion) + ' séries. Rechargement…', 'ok');
      zone.innerHTML = '';
      setTimeout(function () { location.reload(); }, 900);
    });

    var bRem = document.createElement('button');
    bRem.type = 'button';
    bRem.className = 'sv-btn sv-danger';
    bRem.textContent = 'Remplacer';
    bRem.addEventListener('click', function () {
      if (!confirm('Remplacer la progression de cet appareil par celle du fichier ? Les séries présentes ici et absentes du fichier seront perdues.')) return;
      ecrireLocal(paquet.data);
      msg('Progression remplacée — ' + nExt + ' séries. Rechargement…', 'ok');
      zone.innerHTML = '';
      setTimeout(function () { location.reload(); }, 900);
    });

    var bAnn = document.createElement('button');
    bAnn.type = 'button';
    bAnn.className = 'sv-btn';
    bAnn.textContent = 'Annuler';
    bAnn.addEventListener('click', function () {
      zone.innerHTML = '';
      msg('', 'info');
      if (apres) apres();
    });

    rangee.appendChild(bFus);
    rangee.appendChild(bRem);
    rangee.appendChild(bAnn);
    pan.appendChild(rangee);
    zone.appendChild(pan);
  }

  /* ---------- montage ---------- */
  function monter(hote) {
    if (!hote) return;
    injecterCss();
    hote.innerHTML = '';

    var bloc = document.createElement('div');
    bloc.className = 'sv-bloc';

    var titre = document.createElement('p');
    titre.className = 'sv-titre';
    titre.textContent = 'Sauvegarde';
    bloc.appendChild(titre);

    var rangee = document.createElement('div');
    rangee.className = 'sv-rangee';

    var bExp = document.createElement('button');
    bExp.type = 'button';
    bExp.className = 'sv-btn';
    bExp.textContent = 'Exporter ma progression';

    var bImp = document.createElement('button');
    bImp.type = 'button';
    bImp.className = 'sv-btn';
    bImp.textContent = 'Importer une sauvegarde';

    var champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = 'application/json,.json';
    champ.className = 'sv-cache';
    champ.id = 'sv-fichier';

    rangee.appendChild(bExp);
    rangee.appendChild(bImp);
    bloc.appendChild(rangee);
    bloc.appendChild(champ);

    var zone = document.createElement('div');
    bloc.appendChild(zone);

    var ligne = document.createElement('p');
    ligne.className = 'sv-msg sv-info';
    ligne.setAttribute('role', 'status');
    ligne.textContent = 'Le fichier exporté peut être rouvert sur un autre appareil.';
    bloc.appendChild(ligne);

    function msg(texte, type) {
      ligne.textContent = texte;
      ligne.className = 'sv-msg sv-' + (type || 'info');
    }

    bExp.addEventListener('click', function () { exporter(msg); });
    bImp.addEventListener('click', function () { champ.click(); });

    champ.addEventListener('change', function () {
      var f = champ.files && champ.files[0];
      if (!f) return;
      var lecteur = new FileReader();
      lecteur.onload = function () {
        var paquet;
        try {
          paquet = validerEnveloppe(String(lecteur.result));
        } catch (e) {
          msg('Ce fichier n’est pas une sauvegarde du Quart d’heure.', 'err');
          champ.value = '';
          return;
        }
        msg('', 'info');
        monterPanneau(zone, paquet, msg, function () { champ.value = ''; });
        champ.value = '';
      };
      lecteur.onerror = function () {
        msg('Lecture du fichier impossible.', 'err');
        champ.value = '';
      };
      lecteur.readAsText(f);
    });

    hote.appendChild(bloc);
  }

  function auto() {
    var h = document.getElementById('lqdh-sauvegarde');
    if (h) monter(h);
  }

  window.LQDH_SAUVEGARDE = { monter: monter, fusionner: fusionner, compterSeries: compterSeries };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', auto);
  } else {
    auto();
  }
})();
