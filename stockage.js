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

  // Chiffres du panneau ≡ (solde), de TikTok Studio et du Programme de récompenses.
  // Les évolutions sont en % sur 7 jours : négatif ou 0 = flèche vers le bas.
  // Les récompenses par vidéo sont rangées dans chaque vidéo (recStandard, recSupplementaire…).
  const recompensesParDefaut = {
    solde: '0,94',
    vuesPublication: '1454',
    vuesEvolution: '-60',
    followersNets: '-47',
    followersEvolution: '0',
    jaimeStudio: '12',
    jaimeEvolution: '-79',
    moisStandard: '0',
    moisSupplementaire: '0',
    paiement1: '0', // mois dernier
    paiement2: '0', // il y a 2 mois
    paiement3: '0', // il y a 3 mois
  };

  // Compte ajouté avec « Ajouter un compte » : il démarre vide, comme un vrai nouveau compte TikTok
  const profilVide = {
    nom: 'Nouveau compte',
    utilisateur: '',
    suivis: '0',
    followers: '0',
    jaime: '0',
    bio: '',
    lien: '',
  };
  const recompensesVides = {
    ...recompensesParDefaut,
    solde: '0,00',
    vuesPublication: '0',
    vuesEvolution: '0',
    followersNets: '0',
    followersEvolution: '0',
    jaimeStudio: '0',
    jaimeEvolution: '0',
  };

  // Plusieurs comptes : le premier garde ses clés d'origine (profil, videos, recompenses, avatar),
  // les suivants rangent les leurs sous leur identifiant ("c…/profil", "c…/avatar"…)
  const PRINCIPAL = 'principal';
  let comptes = { actif: PRINCIPAL, liste: [PRINCIPAL] };
  const cle = (nom, compte = comptes.actif) => (compte === PRINCIPAL ? nom : `${compte}/${nom}`);

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

  function cles(magasin) {
    if (!base) {
      const prefixe = `${magasin}/`;
      return Promise.resolve([...memoire.keys()].filter((c) => c.startsWith(prefixe)).map((c) => c.slice(prefixe.length)));
    }
    return transaction(magasin, 'readonly', (store) => store.getAllKeys());
  }

  // Données d'un compte, complétées par les valeurs de départ
  async function donneesDuCompte(compte) {
    const principal = compte === PRINCIPAL;
    const profil = await lire('donnees', cle('profil', compte));
    const videos = await lire('donnees', cle('videos', compte));
    const recompenses = await lire('donnees', cle('recompenses', compte));
    return {
      profil: { ...(principal ? profilParDefaut : profilVide), ...profil },
      videos: videos ?? (principal ? videosParDefaut.map((video) => ({ ...video })) : []),
      recompenses: { ...(principal ? recompensesParDefaut : recompensesVides), ...recompenses },
    };
  }

  const enregistrerComptes = () => ecrire('donnees', 'comptes', comptes);

  return {
    get persistant() {
      return base !== null;
    },
    get compteActif() {
      return comptes.actif;
    },
    get estPrincipal() {
      return comptes.actif === PRINCIPAL;
    },
    get nombreDeComptes() {
      return comptes.liste.length;
    },
    // Photo de profil du compte affiché (ou d'un autre compte)
    cleAvatar: (compte) => cle('avatar', compte),

    async charger() {
      base = 'indexedDB' in window ? await ouvrir() : null;
      try {
        const enregistres = await lire('donnees', 'comptes');
        if (enregistres?.liste?.length) comptes = enregistres;
        if (!comptes.liste.includes(comptes.actif)) comptes.actif = comptes.liste[0];
        return await donneesDuCompte(comptes.actif);
      } catch {
        base = null; // base inutilisable : on continue sans sauvegarde
        comptes = { actif: PRINCIPAL, liste: [PRINCIPAL] };
        return donneesDuCompte(PRINCIPAL);
      }
    },

    // Nom, nom d'utilisateur et clé de la photo de chaque compte, dans l'ordre
    async listeDesComptes() {
      return Promise.all(comptes.liste.map(async (compte) => {
        const { profil } = await donneesDuCompte(compte);
        return { id: compte, nom: profil.nom, utilisateur: profil.utilisateur, principal: compte === PRINCIPAL, cleAvatar: cle('avatar', compte) };
      }));
    },

    async changerDeCompte(compte) {
      if (!comptes.liste.includes(compte)) throw new Error('compte inconnu');
      comptes.actif = compte;
      await enregistrerComptes();
      return donneesDuCompte(compte);
    },

    // Nouveau compte vide (avec un nom d'utilisateur au hasard, comme TikTok) ; il n'est pas encore affiché
    async creerCompte() {
      const compte = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const chiffres = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('');
      await ecrire('donnees', cle('profil', compte), { ...profilVide, utilisateur: `user${chiffres}` });
      comptes.liste.push(compte);
      await enregistrerComptes();
      return compte;
    },

    // Supprime un compte avec sa photo et les fichiers de ses vidéos ; renvoie le compte affiché ensuite
    async supprimerCompte(compte) {
      if (comptes.liste.length < 2 || !comptes.liste.includes(compte)) return comptes.actif;
      const { videos } = await donneesDuCompte(compte);
      const prefixes = videos.map((video) => `${video.id}/`);
      for (const fichier of await cles('fichiers')) {
        if (fichier === cle('avatar', compte) || prefixes.some((p) => String(fichier).startsWith(p))) await supprimer('fichiers', fichier);
      }
      for (const nom of ['profil', 'videos', 'recompenses']) await supprimer('donnees', cle(nom, compte));
      comptes.liste = comptes.liste.filter((c) => c !== compte);
      if (comptes.actif === compte) comptes.actif = comptes.liste[0];
      await enregistrerComptes();
      return comptes.actif;
    },

    enregistrerProfil: (profil) => ecrire('donnees', cle('profil'), profil),
    enregistrerVideos: (videos) => ecrire('donnees', cle('videos'), videos),
    enregistrerRecompenses: (recompenses) => ecrire('donnees', cle('recompenses'), recompenses),
    lireFichier: (cleFichier) => lire('fichiers', cleFichier),
    ecrireFichier: (cleFichier, blob) => ecrire('fichiers', cleFichier, blob),
    supprimerFichier: (cleFichier) => supprimer('fichiers', cleFichier),
  };
})();
