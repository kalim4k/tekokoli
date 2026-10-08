// Sauvegarde du profil et des vidéos dans le navigateur (IndexedDB).
// Les textes sont dans le magasin "donnees", les images et vidéos (Blob) dans "fichiers".
const Stockage = (() => {
  const NOM_BASE = 'tiktok-profil';
  const VERSION = 1;

  const profilParDefaut = {
    nom: 'REMIALDE',
    utilisateur: 'ia.tool6',
    suivis: '15',
    followers: '3 319',
    jaime: '16,6 K',
    bio: "Je te montre étape par étape à créer ton propre jeu sans coder avec l'IA et le monétiser avec Google adsense 👇👇",
    lien: 'https://gamebuild-delta.vercel.app/',
  };

  // "image" = miniature fournie avec le site. Les vidéos ajoutées ensuite ont leur miniature dans "fichiers".
  const videosParDefaut = [
    { id: 'v1', type: 'image', image: 'images/video-1.jpg', vues: '96', epingle: true },
    { id: 'v2', type: 'image', image: 'images/video-2.jpg', vues: '1', epingle: false },
    { id: 'v3', type: 'image', image: 'images/video-3.jpg', vues: '14', epingle: false },
    { id: 'v4', type: 'image', image: 'images/video-4.jpg', vues: '20', epingle: false },
    { id: 'v5', type: 'image', image: 'images/video-5.jpg', vues: '61', epingle: false },
    { id: 'v6', type: 'image', image: 'images/video-6.jpg', vues: '66', epingle: false },
    { id: 'v7', type: 'image', image: 'images/video-7.jpg', vues: '56300', epingle: false },
    { id: 'v8', type: 'image', image: 'images/video-8.jpg', vues: '86300', epingle: false },
    { id: 'v9', type: 'image', image: 'images/video-9.jpg', vues: '192', epingle: false },
  ];

  let base = null;            // IDBDatabase, ou null si IndexedDB est indisponible
  const memoire = new Map();  // repli : rien n'est conservé après rechargement

  function ouvrir() {
    return new Promise((resolve) => {
      let requete;
      try {
        requete = indexedDB.open(NOM_BASE, VERSION);
      } catch {
        resolve(null);
        return;
      }
      requete.onupgradeneeded = () => {
        requete.result.createObjectStore('donnees');
        requete.result.createObjectStore('fichiers');
      };
      requete.onsuccess = () => resolve(requete.result);
      requete.onerror = () => resolve(null);
      requete.onblocked = () => resolve(null);
    });
  }

  function transaction(magasin, mode, action) {
    return new Promise((resolve, reject) => {
      const tx = base.transaction(magasin, mode);
      const requete = action(tx.objectStore(magasin));
      tx.oncomplete = () => resolve(requete.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  function lire(magasin, cle) {
    if (!base) return Promise.resolve(memoire.get(`${magasin}/${cle}`));
    return transaction(magasin, 'readonly', (store) => store.get(cle));
  }

  function ecrire(magasin, cle, valeur) {
    if (!base) {
      memoire.set(`${magasin}/${cle}`, valeur);
      return Promise.resolve();
    }
    return transaction(magasin, 'readwrite', (store) => store.put(valeur, cle));
  }

  function supprimer(magasin, cle) {
    if (!base) {
      memoire.delete(`${magasin}/${cle}`);
      return Promise.resolve();
    }
    return transaction(magasin, 'readwrite', (store) => store.delete(cle));
  }

  return {
    get persistant() {
      return base !== null;
    },

    async charger() {
      base = 'indexedDB' in window ? await ouvrir() : null;
      let profil;
      let videos;
      try {
        profil = await lire('donnees', 'profil');
        videos = await lire('donnees', 'videos');
      } catch {
        base = null; // base inutilisable : on continue sans sauvegarde
      }
      return {
        profil: { ...profilParDefaut, ...profil },
        videos: videos ?? videosParDefaut.map((video) => ({ ...video })),
      };
    },

    enregistrerProfil: (profil) => ecrire('donnees', 'profil', profil),
    enregistrerVideos: (videos) => ecrire('donnees', 'videos', videos),
    lireFichier: (cle) => lire('fichiers', cle),
    ecrireFichier: (cle, blob) => ecrire('fichiers', cle, blob),
    supprimerFichier: (cle) => supprimer('fichiers', cle),
  };
})();
