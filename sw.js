// Service worker : rend l'application installable et utilisable sans connexion.
// Change VERSION à chaque mise en ligne pour que les téléphones récupèrent les nouveaux fichiers.
const VERSION = 'tiktok-v3';

const FICHIERS = [
  './',
  './index.html',
  './style.css',
  './stockage.js',
  './script.js',
  './studio.js',
  './manifest.webmanifest',
  './images/avatar.jpg',
  './images/avatar-recadre.jpg',
  './images/visiteur.jpg',
  './images/video-1.jpg',
  './images/video-2.jpg',
  './images/video-3.jpg',
  './images/video-4.jpg',
  './images/video-5.jpg',
  './images/video-6.jpg',
  './images/video-7.jpg',
  './images/video-8.jpg',
  './images/video-9.jpg',
  './images/studio-suggestion.jpg',
  './images/promo-recompenses.jpg',
  './images/inspiration-1.jpg',
  './images/inspiration-2.jpg',
  './images/inspiration-3.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (evenement) => {
  evenement.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Un fichier manquant ne doit pas empêcher l'installation
    await Promise.all(FICHIERS.map((fichier) => cache.add(fichier).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil((async () => {
    const anciens = (await caches.keys()).filter((cle) => cle !== VERSION);
    await Promise.all(anciens.map((cle) => caches.delete(cle)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin === self.location.origin) {
    evenement.respondWith(reseauPuisCache(requete));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    evenement.respondWith(cachePuisReseau(requete));
  }
});

// Fichiers du site : la dernière version si on est connecté, sinon celle du cache
async function reseauPuisCache(requete) {
  const cache = await caches.open(VERSION);
  try {
    const reponse = await fetch(requete);
    if (reponse.ok) cache.put(requete, reponse.clone());
    return reponse;
  } catch {
    const enCache = await cache.match(requete, { ignoreSearch: true });
    if (enCache) return enCache;
    if (requete.mode === 'navigate') return cache.match('./index.html');
    return Response.error();
  }
}

// Polices Google : elles ne changent jamais, le cache suffit
async function cachePuisReseau(requete) {
  const cache = await caches.open(VERSION);
  const enCache = await cache.match(requete);
  if (enCache) return enCache;
  const reponse = await fetch(requete);
  if (reponse.ok || reponse.type === 'opaque') cache.put(requete, reponse.clone());
  return reponse;
}
