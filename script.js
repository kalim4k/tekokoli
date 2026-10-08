const $ = (selecteur, racine = document) => racine.querySelector(selecteur);

// Données affichées : chargées depuis le navigateur (voir stockage.js)
const etat = { profil: null, videos: [], recompenses: null };
let urlAvatar = 'images/avatar.jpg';
let urlAvatarRond = 'images/avatar-recadre.jpg'; // pour les petits ronds (sans la bulle de la capture)

const iconeLecture = '<svg viewBox="0 0 10 12" aria-hidden="true"><path d="M1.3 1.3 8.9 6l-7.6 4.7z"/></svg>';

// Photo par défaut d'un compte TikTok (silhouette grise)
const AVATAR_VIDE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#d0d1d3"/>'
  + '<circle cx="20" cy="15.5" r="7" fill="#fff"/><path d="M6 38c1.5-8 7-12 14-12s12.5 4 14 12z" fill="#fff"/></svg>',
)}`;

/* ---------- Utilitaires ---------- */

const enChiffres = (valeur) => String(valeur ?? '').trim().replace(/[\s  ]/g, '');

// "16600" → "16,6 K", "3319" → "3 319". Un texte déjà formaté ("16,6 K") est affiché tel quel.
function formaterNombre(valeur) {
  const texte = String(valeur ?? '').trim();
  const chiffres = enChiffres(valeur);
  if (!/^\d+$/.test(chiffres)) return texte;
  const nombre = Number(chiffres);
  const abreger = (diviseur, suffixe) =>
    `${String(Math.floor((nombre / diviseur) * 10) / 10).replace('.', ',')} ${suffixe}`;
  if (nombre >= 1e9) return abreger(1e9, 'Md');
  if (nombre >= 1e6) return abreger(1e6, 'M');
  if (nombre >= 1e4) return abreger(1e3, 'K');
  return String(nombre).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Sous la vidéo, TikTok écrit les vues autrement : "56300" → "56.3K"
function formaterVuesLecteur(valeur) {
  const chiffres = enChiffres(valeur);
  if (!/^\d+$/.test(chiffres)) return String(valeur ?? '').trim() || '0';
  const nombre = Number(chiffres);
  const abreger = (diviseur, suffixe) => `${Math.floor((nombre / diviseur) * 10) / 10}${suffixe}`;
  if (nombre >= 1e9) return abreger(1e9, 'B');
  if (nombre >= 1e6) return abreger(1e6, 'M');
  if (nombre >= 1e3) return abreger(1e3, 'K');
  return String(nombre);
}

// +1 / -1 quand on touche le cœur ou le signet (si le compteur est un nombre)
function ajusterCompteur(valeur, delta) {
  const chiffres = enChiffres(valeur);
  if (!/^\d+$/.test(chiffres)) return valeur;
  return String(Math.max(0, Number(chiffres) + delta));
}

// Date de publication → "Il y a 5 j", "Il y a 3 h", "Il y a 2 sem.", "08-10"…
function ilYa(dateTexte) {
  if (!dateTexte) return '';
  const date = new Date(dateTexte);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = (Date.now() - date.getTime()) / 60000;
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${Math.floor(minutes)} min`;
  const heures = minutes / 60;
  if (heures < 24) return `Il y a ${Math.floor(heures)} h`;
  const jours = heures / 24;
  if (jours < 7) return `Il y a ${Math.floor(jours)} j`;
  if (jours < 28) return `Il y a ${Math.floor(jours / 7)} sem.`;
  const jj = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return date.getFullYear() === new Date().getFullYear() ? `${jj}-${mm}` : `${date.getFullYear()}-${mm}-${jj}`;
}

// Valeur pour un champ <input type="date"> (AAAA-MM-JJ, heure locale)
function dateVersChamp(dateTexte) {
  const date = new Date(dateTexte);
  if (Number.isNaN(date.getTime())) return '';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const jj = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${jj}`;
}

function normaliserLien(lien) {
  const texte = lien.trim();
  if (!texte) return '';
  return /^(https?:\/\/|mailto:)/i.test(texte) ? texte : `https://${texte}`;
}

let minuteurMessage;
function afficherMessage(texte) {
  const toast = $('#toast');
  toast.textContent = texte;
  toast.classList.add('visible');
  clearTimeout(minuteurMessage);
  minuteurMessage = setTimeout(() => toast.classList.remove('visible'), 3500);
}

async function sauvegarder(action) {
  try {
    await action();
  } catch (erreur) {
    console.error(erreur);
    afficherMessage("Enregistrement impossible : l'espace de stockage du navigateur est peut-être plein.");
  }
}
const sauverProfil = () => sauvegarder(() => Stockage.enregistrerProfil(etat.profil));
const sauverVideos = () => sauvegarder(() => Stockage.enregistrerVideos(etat.videos));
const sauverRecompenses = () => sauvegarder(() => Stockage.enregistrerRecompenses(etat.recompenses));

// Prévient les écrans Studio / récompenses qu'une vidéo a changé (voir studio.js)
const signalerVideosModifiees = () => document.dispatchEvent(new Event('videos-modifiees'));

let avertissementAffiche = false;
function avertirSiNonPersistant() {
  if (Stockage.persistant || avertissementAffiche) return;
  avertissementAffiche = true;
  afficherMessage('Ce navigateur bloque la sauvegarde : tes modifications seront perdues au rechargement.');
}

/* ---------- Fichiers (images et vidéos enregistrées) ---------- */

const urlsFichiers = new Map(); // clé → Promise<URL | null>

function urlFichier(cle) {
  if (!urlsFichiers.has(cle)) {
    urlsFichiers.set(cle, Stockage.lireFichier(cle)
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null));
  }
  return urlsFichiers.get(cle);
}

function oublierFichier(cle) {
  const promesse = urlsFichiers.get(cle);
  if (!promesse) return;
  urlsFichiers.delete(cle);
  promesse.then((url) => url && URL.revokeObjectURL(url));
}

const cleMiniature = (video) => `${video.id}/miniature`;
const cleVideo = (video) => `${video.id}/video`;
const cleCommentaire = (video, commentaire) => `${video.id}/commentaire-${commentaire.id}`;

async function urlMiniature(video) {
  return video.image || (await urlFichier(cleMiniature(video))) || '';
}

async function urlPhotoCommentaire(video, commentaire) {
  return (commentaire.photo && (await urlFichier(cleCommentaire(video, commentaire)))) || AVATAR_VIDE;
}

const estUneVideo = (fichier) =>
  fichier.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/i.test(fichier.name);

function chargerImage(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image illisible'));
    };
    image.src = url;
  });
}

// Redessine une image (ou une image de vidéo) en JPEG, réduite si elle est très grande
function versJpeg(source, largeur, hauteur, tailleMax) {
  const echelle = Math.min(1, tailleMax / largeur, (tailleMax * 2) / hauteur);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(largeur * echelle));
  canvas.height = Math.max(1, Math.round(hauteur * echelle));
  const contexte = canvas.getContext('2d');
  contexte.fillStyle = '#fff';
  contexte.fillRect(0, 0, canvas.width, canvas.height);
  contexte.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('conversion impossible'))), 'image/jpeg', 0.85);
  });
}

async function photoReduite(fichier, tailleMax) {
  const image = await chargerImage(fichier);
  return versJpeg(image, image.naturalWidth, image.naturalHeight, tailleMax);
}

// 95 secondes → "01:35" (durée affichée sur les miniatures des récompenses)
function formaterDuree(secondes) {
  const total = Math.max(0, Math.round(secondes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Miniature d'une vidéo = sa toute première image (on note aussi sa durée)
function premiereImage(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const video = document.createElement('video');
    let termine = false;

    const terminer = (erreur, blob) => {
      if (termine) return;
      termine = true;
      clearTimeout(minuteur);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      if (erreur) reject(erreur);
      else resolve(blob);
    };
    const minuteur = setTimeout(() => terminer(new Error('vidéo trop longue à charger')), 20000);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('error', () => terminer(new Error('vidéo illisible')));
    video.addEventListener('loadeddata', () => {
      // Se placer explicitement au tout début : certains navigateurs (Safari) ne dessinent rien sans ça
      video.addEventListener('seeked', () => {
        const duree = Number.isFinite(video.duration) ? video.duration : 0;
        versJpeg(video, video.videoWidth, video.videoHeight, 720)
          .then((blob) => terminer(null, { miniature: blob, duree }), terminer);
      }, { once: true });
      video.currentTime = 0.001;
    }, { once: true });
    video.src = url;
  });
}

async function preparerFichier(fichier) {
  if (estUneVideo(fichier)) {
    const { miniature, duree } = await premiereImage(fichier);
    return { type: 'video', miniature, video: fichier, duree };
  }
  return { type: 'image', miniature: await photoReduite(fichier, 720) };
}

async function enregistrerMedias(video, medias) {
  await Stockage.ecrireFichier(cleMiniature(video), medias.miniature);
  if (medias.video) await Stockage.ecrireFichier(cleVideo(video), medias.video);
  else await Stockage.supprimerFichier(cleVideo(video));
  oublierFichier(cleMiniature(video));
  oublierFichier(cleVideo(video));
  video.type = medias.type;
  if (medias.duree) video.duree = formaterDuree(medias.duree);
  delete video.image;
  navigator.storage?.persist?.().catch(() => {});
}

const nouvelIdentifiant = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ---------- Page de profil ---------- */

function afficherProfil() {
  const profil = etat.profil;
  $('#profil-nom').textContent = profil.nom.trim();
  $('#topbar-nom').textContent = profil.nom.trim();
  $('#profil-utilisateur').textContent = `@${profil.utilisateur}`;
  $('#profil-suivis').textContent = formaterNombre(profil.suivis) || '0';
  $('#profil-followers').textContent = formaterNombre(profil.followers) || '0';
  $('#profil-jaime').textContent = formaterNombre(profil.jaime) || '0';

  const bio = $('#profil-bio');
  bio.textContent = profil.bio.trim();
  bio.hidden = !profil.bio.trim();

  const lien = $('#profil-lien');
  lien.textContent = profil.lien.trim();
  lien.href = normaliserLien(profil.lien) || '#';
  lien.hidden = !profil.lien.trim();

  document.title = `${profil.nom.trim() || 'Profil'} (@${profil.utilisateur}) | TikTok`;
}

async function afficherAvatar() {
  const photo = await urlFichier('avatar');
  urlAvatar = photo || 'images/avatar.jpg';
  // La photo d'origine contient la bulle de la capture en haut : version recadrée pour les petits ronds
  urlAvatarRond = photo || 'images/avatar-recadre.jpg';
  $('#profil-avatar').src = urlAvatar;
  $('#edition-avatar').src = urlAvatarRond;
}

async function afficherGrille() {
  const vignettes = await Promise.all(etat.videos.map(async (video) => {
    const vignette = document.createElement('a');
    vignette.className = 'thumb';
    vignette.href = '#';
    vignette.dataset.id = video.id;

    const image = new Image();
    image.alt = '';
    image.src = await urlMiniature(video);
    vignette.append(image);

    if (video.epingle) {
      const badge = document.createElement('span');
      badge.className = 'thumb-pin';
      badge.textContent = 'Épinglé';
      vignette.append(badge);
    }

    const vues = document.createElement('span');
    vues.className = 'thumb-views';
    vues.innerHTML = iconeLecture;
    vues.append(formaterNombre(video.vues) || '0');
    vignette.append(vues);
    return vignette;
  }));
  $('#grid').replaceChildren(...vignettes);
  $('#grille-vide').hidden = etat.videos.length > 0;
}

function mettreAJourVues(video) {
  const vues = $(`.thumb[data-id="${video.id}"] .thumb-views`);
  if (vues) vues.lastChild.textContent = formaterNombre(video.vues) || '0';
}

// Contenu des onglets autres que "Vidéos"
const etatsVides = {
  prive: {
    titre: 'Tes vidéos privées',
    texte: 'Pour rendre tes vidéos visibles uniquement par toi, définis leur visibilité sur « Privé » dans les paramètres.',
  },
  republications: {
    titre: 'Tes republications',
    texte: 'Les vidéos que tu republies apparaîtront ici.',
  },
  favoris: {
    titre: 'Tes favoris',
    texte: 'Les vidéos que tu enregistres apparaîtront ici.',
  },
  jaime: {
    titre: 'Vidéos que tu as aimées',
    texte: 'Les vidéos que tu aimes apparaîtront ici.',
  },
};

// Quand le grand nom disparaît sous la barre du haut, il s'affiche en petit au centre de la barre
function configurerBarreDuHaut() {
  const barre = $('.topbar');
  new IntersectionObserver(([entree]) => {
    barre.classList.toggle('compacte', !entree.isIntersecting && entree.boundingClientRect.top < barre.offsetHeight);
  }, { rootMargin: `-${barre.offsetHeight}px 0px 0px 0px` }).observe($('.name'));
}

function configurerOnglets() {
  const onglets = [...document.querySelectorAll('.tab')];
  const indicateur = $('.tab-indicator');

  onglets.forEach((onglet, index) => {
    onglet.addEventListener('click', () => {
      onglets.forEach((autre) => {
        autre.classList.toggle('active', autre === onglet);
        autre.setAttribute('aria-selected', autre === onglet);
      });
      indicateur.style.transform = `translateX(${index * 100}%)`;

      const nom = onglet.dataset.tab;
      $('#panel-videos').hidden = nom !== 'videos';
      $('#panel-empty').hidden = nom === 'videos';
      if (nom !== 'videos') {
        $('#empty-icon').innerHTML = onglet.innerHTML;
        $('#empty-title').textContent = etatsVides[nom].titre;
        $('#empty-text').textContent = etatsVides[nom].texte;
      }
    });
  });
}

/* ---------- Écrans empilés par-dessus la page (éditeurs, lecteur) ---------- */

const pileCalques = [];
let historiqueDisponible = true;

// Barre d'état du téléphone : noire dans le lecteur vidéo, blanche ailleurs (comme TikTok)
function mettreAJourCouleurTheme() {
  const dessus = pileCalques[pileCalques.length - 1];
  $('meta[name="theme-color"]').content = dessus?.id === 'lecteur' ? '#000000' : '#ffffff';
}

// Écrans et panneau ≡ : ouverture animée (classe "open"). Lecteur : simple affichage.
const estAnime = (calque) => calque.classList.contains('screen') || calque.classList.contains('tiroir');

function afficherCalque(calque, visible) {
  if (estAnime(calque)) calque.classList.toggle('open', visible);
  else calque.hidden = !visible;
}

// remplacer : l'écran du dessus est fermé et remplacé par le nouveau (ex. panneau ≡ → TikTok Studio)
function ouvrirCalque(calque, { remplacer = false } = {}) {
  if (pileCalques.includes(calque)) return;
  const remplace = remplacer ? pileCalques.pop() : null;
  if (remplace) {
    afficherCalque(remplace, false);
    remplace.dispatchEvent(new Event('fermeture'));
  }
  pileCalques.push(calque);
  // Le dernier écran ouvert passe toujours devant les autres, quelle que soit sa place dans la page
  calque.style.zIndex = String(20 + pileCalques.length);
  afficherCalque(calque, true);
  document.documentElement.classList.add('calque-ouvert');
  mettreAJourCouleurTheme();
  // Le bouton "retour" du téléphone ferme l'écran au lieu de quitter la page
  if (historiqueDisponible) {
    try {
      if (remplace) history.replaceState({ calque: calque.id }, '');
      else history.pushState({ calque: calque.id }, '');
    } catch {
      historiqueDisponible = false;
    }
  }
}

function fermerCalque() {
  const calque = pileCalques.pop();
  if (!calque) return;
  afficherCalque(calque, false);
  if (!pileCalques.length) document.documentElement.classList.remove('calque-ouvert');
  mettreAJourCouleurTheme();
  calque.dispatchEvent(new Event('fermeture'));
}

function demanderFermeture() {
  if (!pileCalques.length) return;
  if (historiqueDisponible) history.back();
  else fermerCalque();
}

window.addEventListener('popstate', fermerCalque);
document.addEventListener('keydown', (evenement) => {
  if (evenement.key === 'Escape') demanderFermeture();
});
document.querySelectorAll('.screen-back, .lecteur-retour').forEach((bouton) => {
  bouton.addEventListener('click', demanderFermeture);
});

/* ---------- Lecteur : une "diapo" par vidéo, on fait défiler vers le haut / le bas ---------- */

const lecteur = { observateur: null, active: null, animation: 0 };
const filLecteur = $('#lecteur-fil');

function ajusterCadrage(media) {
  const largeur = media.videoWidth || media.naturalWidth;
  const hauteur = media.videoHeight || media.naturalHeight;
  // Format vertical : plein écran comme sur TikTok. Format horizontal : bandes noires.
  if (largeur && hauteur) media.classList.toggle('couvrir', hauteur / largeur >= 1.2);
}

function remplirCompteur(diapo, selecteur, valeur) {
  $(`${selecteur} span`, diapo).textContent = formaterNombre(valeur) || '0';
}

function remplirActions(diapo, video) {
  remplirCompteur(diapo, '.diapo-jaime', video.jaime);
  remplirCompteur(diapo, '.diapo-commenter', video.commentaires);
  remplirCompteur(diapo, '.diapo-favori', video.favoris);
  const partages = String(video.partages ?? '').trim();
  $('.diapo-partager', diapo).hidden = !partages;
  if (partages) remplirCompteur(diapo, '.diapo-partager', partages);
  $('.diapo-jaime', diapo).classList.toggle('actif', Boolean(video.aime));
  $('.diapo-favori', diapo).classList.toggle('actif', Boolean(video.enFavori));
}

async function creerDiapo(video) {
  const diapo = $('#modele-diapo').content.firstElementChild.cloneNode(true);
  diapo.dataset.id = video.id;

  const miniature = await urlMiniature(video);
  let media;
  if (video.type === 'video') {
    media = document.createElement('video');
    media.poster = miniature;
    media.loop = true;
    media.playsInline = true;
    media.preload = 'none';
    media.classList.add('couvrir');
    media.addEventListener('loadedmetadata', () => ajusterCadrage(media));
    media.addEventListener('play', () => {
      diapo.classList.add('lecture');
      $('.diapo-pause', diapo).hidden = true;
    });
    media.addEventListener('pause', () => diapo.classList.remove('lecture'));
  } else {
    media = new Image();
    media.alt = '';
    media.addEventListener('load', () => ajusterCadrage(media));
    media.src = miniature;
  }
  $('.diapo-media', diapo).append(media);

  $('.diapo-avatar', diapo).src = urlAvatarRond;
  $('.diapo-disque', diapo).src = urlAvatarRond;
  remplirActions(diapo, video);
  $('.diapo-auteur strong', diapo).textContent = etat.profil.nom.trim();
  const date = ilYa(video.date);
  $('.diapo-date', diapo).textContent = date ? `· ${date}` : '';
  const vues = formaterVuesLecteur(video.vues);
  $('.diapo-vues > span', diapo).textContent = `${vues} ${/^[01]$/.test(vues) ? 'vue' : 'vues'}`;

  // Comme TikTok, on ne coupe pas les mots composés ("trois-cent-mille") en fin de ligne
  const sousTitre = $('.diapo-sous-titre', diapo);
  const morceaux = (video.sousTitre ?? '').trim().split(/(\s+)/).map((morceau) => {
    if (!morceau.includes('-')) return morceau;
    const insecable = document.createElement('span');
    insecable.style.whiteSpace = 'nowrap';
    insecable.textContent = morceau;
    return insecable;
  });
  sousTitre.replaceChildren(...morceaux);
  sousTitre.hidden = !sousTitre.textContent;

  const modeleBulle = $('#modele-bulle').content.firstElementChild;
  const commentaires = (video.commentairesAffiches ?? []).filter((c) => c.nom.trim() || c.texte.trim());
  const bulles = await Promise.all(commentaires.map(async (commentaire) => {
    const bulle = modeleBulle.cloneNode(true);
    $('img', bulle).src = await urlPhotoCommentaire(video, commentaire);
    $('.bulle-nom', bulle).textContent = commentaire.nom.trim();
    $('.bulle-message', bulle).textContent = commentaire.texte.trim();
    return bulle;
  }));
  $('.diapo-commentaires', diapo).replaceChildren(...bulles);
  return diapo;
}

const videoDeDiapo = (diapo) => etat.videos.find((video) => video.id === diapo.dataset.id);

async function chargerVideo(diapo) {
  const media = $('video', diapo);
  if (!media || media.getAttribute('src')) return media;
  const url = await urlFichier(cleVideo(videoDeDiapo(diapo)));
  if (url) {
    media.preload = 'auto';
    media.src = url;
  }
  return media;
}

async function activerDiapo(diapo) {
  if (lecteur.active === diapo) return;
  const precedente = lecteur.active;
  lecteur.active = diapo;
  if (precedente) $('video', precedente)?.pause();

  const media = await chargerVideo(diapo);
  if (media && lecteur.active === diapo) {
    media.currentTime = 0;
    media.play().catch(() => {
      // Lecture avec le son refusée par le navigateur : on relance sans le son
      media.muted = true;
      media.play().catch(() => {});
    });
  }
  // On prépare la vidéo suivante pour qu'elle démarre tout de suite
  if (diapo.nextElementSibling) chargerVideo(diapo.nextElementSibling);
}

function suivreProgression() {
  cancelAnimationFrame(lecteur.animation);
  const boucle = () => {
    const diapo = lecteur.active;
    const media = diapo && $('video', diapo);
    if (media && media.duration) {
      $('.diapo-progression span', diapo).style.width = `${(media.currentTime / media.duration) * 100}%`;
    }
    lecteur.animation = requestAnimationFrame(boucle);
  };
  boucle();
}

async function ouvrirLecteur(videoDepart) {
  const diapos = await Promise.all(etat.videos.map(creerDiapo));
  filLecteur.replaceChildren(...diapos);
  ouvrirCalque($('#lecteur'));
  filLecteur.scrollTop = etat.videos.indexOf(videoDepart) * filLecteur.clientHeight;

  lecteur.observateur = new IntersectionObserver((entrees) => {
    entrees.forEach((entree) => {
      if (entree.isIntersecting) activerDiapo(entree.target);
    });
  }, { root: filLecteur, threshold: 0.6 });
  diapos.forEach((diapo) => lecteur.observateur.observe(diapo));
  suivreProgression();
}

function arreterLecteur() {
  lecteur.observateur?.disconnect();
  lecteur.observateur = null;
  lecteur.active = null;
  cancelAnimationFrame(lecteur.animation);
  filLecteur.querySelectorAll('video').forEach((media) => {
    media.pause();
    media.removeAttribute('src');
    media.load();
  });
  filLecteur.replaceChildren();
}

$('#lecteur').addEventListener('fermeture', arreterLecteur);

function basculer(diapo, bouton, champEtat, champCompteur) {
  const video = videoDeDiapo(diapo);
  video[champEtat] = !video[champEtat];
  video[champCompteur] = ajusterCompteur(video[champCompteur], video[champEtat] ? 1 : -1);
  remplirActions(diapo, video);
  bouton.classList.remove('pop');
  void bouton.offsetWidth; // relance l'animation
  bouton.classList.add('pop');
  sauverVideos();
  if (champCompteur === 'jaime') afficherListe();
}

filLecteur.addEventListener('click', (evenement) => {
  const diapo = evenement.target.closest('.diapo');
  if (!diapo) return;
  const bouton = evenement.target.closest('button');
  if (bouton?.classList.contains('diapo-jaime')) basculer(diapo, bouton, 'aime', 'jaime');
  else if (bouton?.classList.contains('diapo-favori')) basculer(diapo, bouton, 'enFavori', 'favoris');
  else if (!bouton && evenement.target.closest('.diapo-scene')) {
    // Toucher la vidéo : pause / lecture
    const media = $('video', diapo);
    if (!media) return;
    if (media.paused) media.play().catch(() => {});
    else {
      media.pause();
      $('.diapo-pause', diapo).hidden = false;
    }
  }
});

$('#grid').addEventListener('click', (evenement) => {
  const vignette = evenement.target.closest('.thumb');
  if (!vignette) return;
  evenement.preventDefault();
  const video = etat.videos.find((element) => element.id === vignette.dataset.id);
  if (video) ouvrirLecteur(video);
});

/* ---------- Éditeur du profil (crayon) ---------- */

const formulaireProfil = $('#formulaire-profil');

function remplirFormulaireProfil() {
  for (const champ of formulaireProfil.elements) {
    if (champ.name) champ.value = etat.profil[champ.name] ?? '';
  }
}

formulaireProfil.addEventListener('input', (evenement) => {
  const champ = evenement.target;
  if (!champ.name) return;
  if (champ.name === 'utilisateur') {
    const propre = champ.value.replace(/^@+/, '').replace(/\s/g, '');
    if (propre !== champ.value) champ.value = propre;
  }
  etat.profil[champ.name] = champ.value;
  afficherProfil();
  sauverProfil();
});
formulaireProfil.addEventListener('submit', (evenement) => evenement.preventDefault());

$('#champ-avatar').addEventListener('change', async (evenement) => {
  const fichier = evenement.target.files[0];
  evenement.target.value = '';
  if (!fichier) return;
  try {
    await Stockage.ecrireFichier('avatar', await photoReduite(fichier, 640));
    oublierFichier('avatar');
    await afficherAvatar();
    afficherMessage('Photo de profil mise à jour');
  } catch (erreur) {
    console.error(erreur);
    afficherMessage("Impossible d'utiliser cette image.");
  }
});

$('#ouvrir-profil').addEventListener('click', () => {
  remplirFormulaireProfil();
  ouvrirCalque($('#ecran-profil'));
  avertirSiNonPersistant();
});

/* ---------- Gestion des vidéos (≡) ---------- */

const listeVideos = $('#liste-videos');
let videoARemplacer = null;

async function afficherListe() {
  const modele = $('#modele-ligne').content.firstElementChild;
  const lignes = await Promise.all(etat.videos.map(async (video, index) => {
    const ligne = modele.cloneNode(true);
    ligne.dataset.id = video.id;
    $('img', ligne).src = await urlMiniature(video);
    $('.ligne-type', ligne).textContent = video.type === 'video' ? 'Vidéo' : 'Image';
    $('.ligne-vues input', ligne).value = video.vues;
    $('.ligne-epingle input', ligne).checked = video.epingle;
    $('[data-action="monter"]', ligne).disabled = index === 0;
    $('[data-action="descendre"]', ligne).disabled = index === etat.videos.length - 1;
    return ligne;
  }));
  listeVideos.replaceChildren(...lignes);
  const total = etat.videos.length;
  $('#compteur-videos').textContent = total ? `${total} vidéo${total > 1 ? 's' : ''}` : 'Aucune vidéo';
}

const rafraichirVideos = () => {
  signalerVideosModifiees();
  return Promise.all([afficherGrille(), afficherListe()]);
};

function videoDeLigne(element) {
  const id = element.closest('.ligne')?.dataset.id;
  return etat.videos.find((video) => video.id === id);
}

async function ajouterFichiers(fichiers) {
  const bouton = $('#bouton-ajout');
  const champ = $('#champ-ajout');
  const texte = $('#ajout-texte');
  const texteInitial = texte.textContent;
  bouton.classList.add('occupe');
  champ.disabled = true;

  const nouvelles = [];
  for (const [index, fichier] of fichiers.entries()) {
    texte.textContent = fichiers.length > 1 ? `Préparation ${index + 1}/${fichiers.length}…` : 'Préparation…';
    try {
      const medias = await preparerFichier(fichier);
      const video = {
        id: nouvelIdentifiant(),
        type: medias.type,
        vues: '0',
        jaime: '0',
        commentaires: '0',
        favoris: '0',
        partages: '',
        date: new Date().toISOString(),
        epingle: false,
      };
      await enregistrerMedias(video, medias);
      nouvelles.push(video);
    } catch (erreur) {
      console.error(erreur);
      afficherMessage(`Impossible d'ajouter « ${fichier.name} » : format non lu par ce navigateur ou stockage plein.`);
    }
  }

  if (nouvelles.length) {
    // Comme sur TikTok : les nouveautés arrivent en premier, juste après les vidéos épinglées
    const position = etat.videos.findIndex((video) => !video.epingle);
    etat.videos.splice(position === -1 ? etat.videos.length : position, 0, ...nouvelles);
    await sauverVideos();
    await rafraichirVideos();
    afficherMessage(nouvelles.length > 1 ? `${nouvelles.length} éléments ajoutés à ton profil` : 'Ajouté à ton profil');
  }

  texte.textContent = texteInitial;
  bouton.classList.remove('occupe');
  champ.disabled = false;
}

async function remplacerFichier(video, fichier) {
  try {
    await enregistrerMedias(video, await preparerFichier(fichier));
    await sauverVideos();
    await rafraichirVideos();
    if (video === videoEnDetails) await afficherApercuDetails();
    afficherMessage('Miniature remplacée');
  } catch (erreur) {
    console.error(erreur);
    afficherMessage(`Impossible d'utiliser « ${fichier.name} ».`);
  }
}

async function supprimerVideo(video) {
  if (!confirm('Supprimer cette vidéo de ton profil ?')) return;
  etat.videos = etat.videos.filter((element) => element !== video);
  await sauverVideos();
  const cles = [cleMiniature(video), cleVideo(video), ...(video.commentairesAffiches ?? []).map((c) => cleCommentaire(video, c))];
  for (const cle of cles) {
    oublierFichier(cle);
    await Stockage.supprimerFichier(cle).catch(() => {});
  }
  await rafraichirVideos();
}

async function deplacerVideo(video, sens) {
  const index = etat.videos.indexOf(video);
  const cible = index + sens;
  if (cible < 0 || cible >= etat.videos.length) return;
  [etat.videos[index], etat.videos[cible]] = [etat.videos[cible], etat.videos[index]];
  await sauverVideos();
  await rafraichirVideos();
}

$('#champ-ajout').addEventListener('change', (evenement) => {
  const fichiers = [...evenement.target.files];
  evenement.target.value = '';
  if (fichiers.length) ajouterFichiers(fichiers);
});

$('#champ-remplacer').addEventListener('change', (evenement) => {
  const fichier = evenement.target.files[0];
  evenement.target.value = '';
  if (fichier && videoARemplacer) remplacerFichier(videoARemplacer, fichier);
});

listeVideos.addEventListener('input', (evenement) => {
  if (!evenement.target.matches('.ligne-vues input')) return;
  const video = videoDeLigne(evenement.target);
  video.vues = evenement.target.value.trim();
  mettreAJourVues(video);
  sauverVideos();
});

listeVideos.addEventListener('change', (evenement) => {
  if (!evenement.target.matches('.ligne-epingle input')) return;
  const video = videoDeLigne(evenement.target);
  video.epingle = evenement.target.checked;
  sauverVideos();
  afficherGrille();
});

listeVideos.addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('[data-action]');
  if (!bouton) return;
  const video = videoDeLigne(bouton);
  if (!video) return;
  switch (bouton.dataset.action) {
    case 'details':
      ouvrirDetails(video);
      break;
    case 'monter':
      deplacerVideo(video, -1);
      break;
    case 'descendre':
      deplacerVideo(video, 1);
      break;
    case 'supprimer':
      supprimerVideo(video);
      break;
    case 'remplacer':
      videoARemplacer = video;
      $('#champ-remplacer').click();
      break;
  }
});

// Ouvert depuis le mode édition (appui long sur ≡, voir studio.js)
function ouvrirGestionVideos() {
  afficherListe();
  ouvrirCalque($('#ecran-videos'));
  avertirSiNonPersistant();
}

/* ---------- Détails d'une vidéo (j'aime, commentaires, favoris, partages…) ---------- */

const formulaireDetails = $('#formulaire-details');
const listeCommentaires = $('#details-commentaires');
let videoEnDetails = null;
let commentairePourPhoto = null;

async function afficherApercuDetails() {
  const video = videoEnDetails;
  $('#details-miniature img').src = await urlMiniature(video);
  $('#details-miniature .ligne-type').textContent = video.type === 'video' ? 'Vidéo' : 'Image';
}

async function afficherCommentairesEdition() {
  const video = videoEnDetails;
  video.commentairesAffiches ??= [];
  const modele = $('#modele-commentaire').content.firstElementChild;
  const lignes = await Promise.all(video.commentairesAffiches.map(async (commentaire) => {
    const ligne = modele.cloneNode(true);
    ligne.dataset.id = commentaire.id;
    $('img', ligne).src = await urlPhotoCommentaire(video, commentaire);
    $('[data-champ="nom"]', ligne).value = commentaire.nom;
    $('[data-champ="texte"]', ligne).value = commentaire.texte;
    return ligne;
  }));
  listeCommentaires.replaceChildren(...lignes);
  $('#ajouter-commentaire').hidden = video.commentairesAffiches.length >= 3;
}

const commentaireDeLigne = (element) =>
  videoEnDetails.commentairesAffiches.find((commentaire) => commentaire.id === element.closest('.commentaire-edition')?.dataset.id);

async function ouvrirDetails(video) {
  videoEnDetails = video;
  for (const champ of formulaireDetails.elements) {
    if (!champ.name) continue;
    if (champ.type === 'checkbox') champ.checked = Boolean(video[champ.name]);
    else if (champ.type === 'date') champ.value = video.date ? dateVersChamp(video.date) : '';
    else champ.value = video[champ.name] ?? (['jaime', 'commentaires', 'favoris'].includes(champ.name) ? '0' : '');
  }
  await Promise.all([afficherApercuDetails(), afficherCommentairesEdition()]);
  afficherAideRpm(video); // studio.js
  ouvrirCalque($('#ecran-details'));
}

formulaireDetails.addEventListener('input', (evenement) => {
  const champ = evenement.target;
  const video = videoEnDetails;
  if (!video) return;
  if (champ.dataset.champ) {
    commentaireDeLigne(champ)[champ.dataset.champ] = champ.value;
    sauverVideos();
    return;
  }
  if (!champ.name) return;
  if (champ.type === 'checkbox') video[champ.name] = champ.checked;
  else if (champ.type === 'date') video.date = champ.value ? `${champ.value}T12:00:00` : '';
  else video[champ.name] = champ.value;
  sauverVideos();
  signalerVideosModifiees();
  if (champ.name === 'vues') mettreAJourVues(video);
  if (champ.name === 'epingle') afficherGrille();
});
formulaireDetails.addEventListener('submit', (evenement) => evenement.preventDefault());

$('#ajouter-commentaire').addEventListener('click', async () => {
  videoEnDetails.commentairesAffiches.push({ id: nouvelIdentifiant(), nom: '', texte: '', photo: false });
  await sauverVideos();
  await afficherCommentairesEdition();
  listeCommentaires.lastElementChild?.querySelector('[data-champ="nom"]').focus();
});

listeCommentaires.addEventListener('click', async (evenement) => {
  const bouton = evenement.target.closest('[data-action]');
  if (!bouton) return;
  const video = videoEnDetails;
  const commentaire = commentaireDeLigne(bouton);
  if (bouton.dataset.action === 'photo') {
    commentairePourPhoto = commentaire;
    $('#champ-photo-commentaire').click();
  } else if (bouton.dataset.action === 'supprimer') {
    video.commentairesAffiches = video.commentairesAffiches.filter((element) => element !== commentaire);
    oublierFichier(cleCommentaire(video, commentaire));
    await Stockage.supprimerFichier(cleCommentaire(video, commentaire)).catch(() => {});
    await sauverVideos();
    await afficherCommentairesEdition();
  }
});

$('#champ-photo-commentaire').addEventListener('change', async (evenement) => {
  const fichier = evenement.target.files[0];
  evenement.target.value = '';
  const video = videoEnDetails;
  const commentaire = commentairePourPhoto;
  if (!fichier || !commentaire) return;
  try {
    await Stockage.ecrireFichier(cleCommentaire(video, commentaire), await photoReduite(fichier, 160));
    oublierFichier(cleCommentaire(video, commentaire));
    commentaire.photo = true;
    await sauverVideos();
    await afficherCommentairesEdition();
  } catch (erreur) {
    console.error(erreur);
    afficherMessage("Impossible d'utiliser cette image.");
  }
});

$('#details-miniature').addEventListener('click', () => {
  videoARemplacer = videoEnDetails;
  $('#champ-remplacer').click();
});
$('#details-voir').addEventListener('click', () => ouvrirLecteur(videoEnDetails));
$('#ecran-details').addEventListener('fermeture', () => afficherListe());

/* ---------- Démarrage ---------- */

async function demarrer() {
  configurerBarreDuHaut();
  configurerOnglets();
  const donnees = await Stockage.charger();
  etat.profil = donnees.profil;
  etat.videos = donnees.videos;
  etat.recompenses = donnees.recompenses;
  afficherProfil();
  await Promise.all([afficherAvatar(), afficherGrille()]);
}

demarrer();

// Application installable (PWA). Le service worker ne fonctionne que sur un site en https (ou localhost).
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((erreur) => console.error(erreur));
}
