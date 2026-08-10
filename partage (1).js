/* =============================================================
   Le Quart d'heure — module de partage
   -------------------------------------------------------------
   Autonome : aucune dépendance, aucun style à ajouter ailleurs.
   Les couleurs sont reprises des variables :root de l'app
   (--menthe, --grenat, --nuit, --brume) avec repli en dur.

   Utilisation :
     Partage.monter(conteneur, { jour, diff, resultats, serie });

   jour      : numéro public de la série (entier)
   diff      : "moyen" | "difficile"
   resultats : tableau de 15 booléens (true = bonne réponse)
   serie     : nombre de jours d'affilée (optionnel)
   ============================================================= */

const Partage = (() => {

  const CONFIG = {
    nom:        "Le Quart d'heure",
    url:        'https://velkios16.github.io/Code/',
    parLigne:   5,          // 15 questions -> 3 lignes de 5
    bon:        '🟩',
    mauvais:    '🟥',
    bonDur:     '🟪',       // difficile : carré aubergine, clin d'œil à la palette
    mauvaisDur: '🟥'
  };

  /* ---------- 1. Construction du texte ---------- */

  function texte({ jour, diff, resultats, serie }) {
    const dur   = diff === 'difficile';
    const bon   = dur ? CONFIG.bonDur : CONFIG.bon;
    const mauv  = dur ? CONFIG.mauvaisDur : CONFIG.mauvais;
    const score = resultats.filter(Boolean).length;

    const grille = [];
    for (let i = 0; i < resultats.length; i += CONFIG.parLigne) {
      grille.push(
        resultats.slice(i, i + CONFIG.parLigne)
                 .map(ok => (ok ? bon : mauv))
                 .join('')
      );
    }

    const entete = `${CONFIG.nom} — Jour ${jour} · ${dur ? 'Difficile' : 'Moyen'}`;
    const ligne2 = serie && serie > 1
      ? `${score}/${resultats.length} · ${serie} jours d'affilée`
      : `${score}/${resultats.length}`;

    return `${entete}\n${ligne2}\n\n${grille.join('\n')}\n\n${CONFIG.url}`;
  }

  /* ---------- 2. Copie / partage natif ---------- */

  async function envoyer(txt) {
    // Mobile : feuille de partage native quand elle existe
    if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ text: txt });
        return 'partage';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'annule';
      }
    }
    // Desktop : presse-papier
    try {
      await navigator.clipboard.writeText(txt);
      return 'copie';
    } catch (e) { /* contexte non sécurisé ou permission refusée */ }

    // Dernier recours (vieux navigateurs)
    const zone = document.createElement('textarea');
    zone.value = txt;
    zone.setAttribute('readonly', '');
    zone.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(zone);
    zone.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(zone);
    return ok ? 'copie' : 'echec';
  }

  /* ---------- 3. Styles (injectés une seule fois) ---------- */

  const CSS = `
  .qh-partage{
    margin-top:34px;display:flex;flex-direction:column;align-items:center;gap:18px;
  }
  .qh-grille{
    display:grid;grid-template-columns:repeat(5,20px);gap:6px;justify-content:center;
  }
  .qh-case{
    width:20px;height:20px;border-radius:5px;
    background:var(--grenat,#FF5F76);
    opacity:0;transform:scale(.4);
    animation:qh-pop .32s cubic-bezier(.34,1.56,.64,1) forwards;
  }
  .qh-case.ok{ background:var(--menthe,#3EE0AE); }
  @keyframes qh-pop{ to{ opacity:1;transform:scale(1); } }
  @media (prefers-reduced-motion:reduce){
    .qh-case{ animation:none;opacity:1;transform:none; }
  }
  .qh-bouton{
    font-family:var(--body,"Instrument Sans",system-ui,sans-serif);
    font-size:15px;font-weight:600;letter-spacing:.01em;
    color:var(--nuit,#150E29);background:var(--menthe,#3EE0AE);
    border:none;border-radius:999px;padding:13px 30px;cursor:pointer;
    transition:transform .12s ease,box-shadow .18s ease,filter .18s ease;
    box-shadow:0 4px 18px rgba(62,224,174,.22);
  }
  .qh-bouton:hover{ transform:translateY(-1px);filter:brightness(1.07);box-shadow:0 6px 24px rgba(62,224,174,.32); }
  .qh-bouton:active{ transform:translateY(1px); }
  .qh-bouton:focus-visible{ outline:2px solid var(--menthe,#3EE0AE);outline-offset:3px; }
  .qh-bouton[data-etat="fait"]{ filter:brightness(.78);box-shadow:none; }
  .qh-note{
    font-family:var(--mono,"JetBrains Mono",ui-monospace,monospace);
    font-size:11px;letter-spacing:.06em;text-transform:uppercase;
    color:var(--brume,#A296C4);margin:0;min-height:14px;text-align:center;
  }`;

  function styles() {
    if (document.getElementById('qh-partage-css')) return;
    const s = document.createElement('style');
    s.id = 'qh-partage-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- 4. Montage du bloc ---------- */

  function monter(conteneur, donnees) {
    styles();
    const txt = texte(donnees);

    const bloc = document.createElement('div');
    bloc.className = 'qh-partage';

    const grille = document.createElement('div');
    grille.className = 'qh-grille';
    grille.setAttribute('aria-hidden', 'true');
    donnees.resultats.forEach((ok, i) => {
      const c = document.createElement('span');
      c.className = 'qh-case' + (ok ? ' ok' : '');
      c.style.animationDelay = (i * 45) + 'ms';
      grille.appendChild(c);
    });

    const bouton = document.createElement('button');
    bouton.className = 'qh-bouton';
    bouton.type = 'button';
    bouton.textContent = 'Partager mon résultat';

    const note = document.createElement('p');
    note.className = 'qh-note';
    note.setAttribute('role', 'status');

    bouton.addEventListener('click', async () => {
      const etat = await envoyer(txt);
      if (etat === 'annule') return;
      if (etat === 'echec') {
        note.textContent = 'Copie impossible — sélectionne le texte à la main';
        return;
      }
      bouton.textContent = etat === 'copie' ? 'Copié ✓' : 'Partagé ✓';
      bouton.dataset.etat = 'fait';
      note.textContent = etat === 'copie' ? 'Colle-le où tu veux' : '';
      setTimeout(() => {
        bouton.textContent = 'Partager mon résultat';
        delete bouton.dataset.etat;
        note.textContent = '';
      }, 2400);
    });

    bloc.append(grille, bouton, note);
    conteneur.appendChild(bloc);
    return bloc;
  }

  return { monter, texte, envoyer, CONFIG };
})();
