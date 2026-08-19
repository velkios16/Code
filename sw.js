/* =========================================================
   Le Quart d'heure — service worker
   ---------------------------------------------------------
   Objectif : l'application s'ouvre et se joue sans réseau.
   Trois caches distincts, pour pouvoir les vider séparément :
     · coquille   → index.html, manifeste, icônes, scripts
     · polices    → Google Fonts (CSS + woff2)
     · images     → drapeaux et illustrations, plafonnées

   IMPORTANT — la banque de questions n'est PAS listée ici.
   C'est la page qui envoie au service worker l'URL réelle de
   ses scripts (questions.js?v=…) une fois chargée. Tu peux donc
   incrémenter le ?v= dans index.html sans jamais toucher à ce
   fichier : le nouveau numéro est une nouvelle URL, donc un
   nouveau téléchargement, et l'ancienne entrée est purgée.
   ========================================================= */
"use strict";

const VERSION   = "2";
const COQUILLE  = "lqdh-coquille-" + VERSION;
const POLICES   = "lqdh-polices-"  + VERSION;
const IMAGES    = "lqdh-images";          /* non versionné : les images ne périment pas */
const MAX_IMAGES = 250;

/* Le strict minimum pour afficher l'accueil hors ligne. */
const NOYAU = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

const estPolice = u => u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";
const estImage  = u => u.hostname === "flagcdn.com"
                    || u.hostname.endsWith("wikimedia.org")
                    || /\.(png|jpe?g|webp|svg|gif|avif)$/i.test(u.pathname);

/* ---------------------------------------------------------
   Installation : on met le noyau en cache, fichier par fichier.
   Un addAll() global échouerait en bloc si une seule icône
   manquait ; ici un fichier absent n'empêche pas l'installation.
   --------------------------------------------------------- */
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(COQUILLE);
    await Promise.all(NOYAU.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})));
  })());
});

/* ---------------------------------------------------------
   Activation : ménage des versions précédentes.
   --------------------------------------------------------- */
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const garder = [COQUILLE, POLICES, IMAGES];
    const noms = await caches.keys();
    await Promise.all(noms.filter(n => n.startsWith("lqdh-") && !garder.includes(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* ---------------------------------------------------------
   Stratégies de lecture
   --------------------------------------------------------- */

/* Réseau d'abord, cache en secours : pour le HTML, afin qu'une
   mise en ligne soit visible dès la connexion suivante. */
async function reseauPuisCache(req, cache) {
  try {
    const rep = await fetch(req);
    if (rep && rep.ok) (await caches.open(cache)).put(req, rep.clone());
    return rep;
  } catch (e) {
    const c = await caches.match(req);
    return c || caches.match("./index.html");
  }
}

/* Cache d'abord : pour tout ce qui porte un numéro de version
   dans son URL, et pour les images et polices, immuables. */
async function cachePuisReseau(req, cache, plafond) {
  const c = await caches.open(cache);
  const hit = await c.match(req);
  if (hit) return hit;
  const rep = await fetch(req);
  if (rep && (rep.ok || rep.type === "opaque")) {
    c.put(req, rep.clone());
    if (plafond) elaguer(cache, plafond);
  }
  return rep;
}

/* Cache d'abord mais rafraîchi en arrière-plan : les polices. */
async function cacheEtRafraichi(req) {
  const c = await caches.open(POLICES);
  const hit = await c.match(req);
  const reseau = fetch(req).then(rep => {
    if (rep && (rep.ok || rep.type === "opaque")) c.put(req, rep.clone());
    return rep;
  }).catch(() => hit);
  return hit || reseau;
}

/* Plafond du cache d'images : on supprime les plus anciennes entrées. */
async function elaguer(nom, max) {
  const c = await caches.open(nom);
  const cles = await c.keys();
  if (cles.length <= max) return;
  await Promise.all(cles.slice(0, cles.length - max).map(k => c.delete(k)));
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  /* Navigation : réseau d'abord, index.html en secours hors ligne. */
  if (req.mode === "navigate") {
    e.respondWith(reseauPuisCache(req, COQUILLE));
    return;
  }

  if (estPolice(url))                     { e.respondWith(cacheEtRafraichi(req)); return; }
  if (url.origin !== self.location.origin && estImage(url)) {
    e.respondWith(cachePuisReseau(req, IMAGES, MAX_IMAGES).catch(() => Response.error()));
    return;
  }

  /* Même origine : scripts, styles, icônes. */
  if (url.origin === self.location.origin) {
    e.respondWith(cachePuisReseau(req, COQUILLE).catch(async () => (await caches.match(req)) || Response.error()));
  }
});

/* ---------------------------------------------------------
   Messages venus de la page
   · CACHE_ASSETS : la page déclare ses scripts réels (avec leur
     ?v=…), on les met en cache et on purge les versions périmées.
   · SKIP_WAITING : l'utilisateur a accepté la mise à jour.
   --------------------------------------------------------- */
self.addEventListener("message", e => {
  const d = e.data || {};

  if (d.type === "SKIP_WAITING") self.skipWaiting();

  if (d.type === "CACHE_ASSETS" && Array.isArray(d.urls)) {
    e.waitUntil((async () => {
      const c = await caches.open(COQUILLE);
      const vivants = d.urls.map(u => new URL(u, self.location.href).href);

      await Promise.all(vivants.map(async u => {
        if (await c.match(u)) return;
        try { await c.add(new Request(u, { cache: "reload" })); } catch (err) {}
      }));

      /* Purge des anciens ?v= : on ne garde qu'une version par script. */
      const bases = new Set(vivants.map(u => u.split("?")[0]));
      const cles = await c.keys();
      await Promise.all(cles.map(async k => {
        const base = k.url.split("?")[0];
        if (bases.has(base) && !vivants.includes(k.url)) await c.delete(k);
      }));
    })());
  }
});
