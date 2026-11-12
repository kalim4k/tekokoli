// Onglet Favoris : vidéos d'autres comptes que tu as enregistrées.
// Elles s'ajoutent dans Mode édition (appui long sur ≡) → Favoris. Pour chacune on choisit l'auteur
// (nom, photo, badge certifié), la légende, le son (titre et photo du disque), les compteurs,
// et si le cœur est rouge / le signet jaune. Le lecteur les affiche comme TikTok affiche la vidéo
// d'un autre compte (photo avec « + », légende, « Ajouter un commentaire… »).
// Utilise les outils de script.js ($, etat, ouvrirCalque, preparerFichier, urlFichier…).

const cleAuteur = (video) => `${video.id}/auteur`;
const cleSon = (video) => `${video.id}/son`;

async function urlPhotoAuteur(video) {
  return (video.photoAuteur && (await urlFichier(cleAuteur(video)))) || AVATAR_VIDE;
}

// Sans photo du son, le disque montre la photo de l'auteur (son original, comme sur TikTok)
async function urlPhotoSon(video) {
  return (video.photoSon && (await urlFichier(cleSon(video)))) || urlPhotoAuteur(video);
}

const clesFichiersFavori = (video) => [cleMiniature(video), cleVideo(video), cleAuteur(video), cleSon(video)];

/* ---------- Diapo du lecteur ---------- */

// Légende : #hashtags (gris) et @mentions (blanc) en gras. coupee = ajoute « …plus » à la fin.
function remplirLegende(element, texte, coupee = false) {
  const morceaux = texte.split(/([#@][^\s#@]+)/).filter(Boolean).map((morceau) => {
    if (!/^[#@]/.test(morceau)) return morceau;
    const gras = document.createElement('strong');
    gras.className = morceau.startsWith('#') ? 'hashtag' : 'mention';
    gras.textContent = morceau;
    return gras;
  });
  if (coupee) {
    const plus = document.createElement('strong');
    plus.className = 'plus';
    plus.textContent = '…plus';
    morceaux.push(plus);
  }
  element.replaceChildren(...morceaux);
}

// Comme TikTok : 2 lignes au plus, puis « …plus ». Appelé une fois la diapo affichée (il faut mesurer).
function couperLegende(diapo) {
  const element = $('.autre-legende', diapo);
  const texte = (videoDeDiapo(diapo)?.legende ?? '').trim();
  remplirLegende(element, texte);
  const hauteurMax = 2 * parseFloat(getComputedStyle(element).lineHeight) + 1;
  if (!texte || element.offsetHeight <= hauteurMax) return;
  let garde = 0;
  let trop = texte.length;
  while (trop - garde > 1) {
    const milieu = Math.floor((garde + trop) / 2);
    remplirLegende(element, texte.slice(0, milieu), true);
    if (element.offsetHeight <= hauteurMax) garde = milieu;
    else trop = milieu;
  }
  remplirLegende(element, texte.slice(0, garde), true);
}

async function creerDiapoFavori(video) {
  const diapo = $('#modele-diapo-autre').content.firstElementChild.cloneNode(true);
  diapo.dataset.id = video.id;
  await placerMedia(diapo, video);

  $('.diapo-avatar', diapo).src = await urlPhotoAuteur(video);
  $('.diapo-disque', diapo).src = await urlPhotoSon(video);
  remplirActions(diapo, video);

  const etiquette = $('.autre-etiquette', diapo);
  etiquette.textContent = (video.etiquette ?? '').trim();
  etiquette.hidden = !etiquette.textContent;

  $('.autre-auteur strong', diapo).textContent = (video.auteur ?? '').trim() || 'utilisateur';
  $('.autre-certifie', diapo).toggleAttribute('hidden', !video.certifie); // <svg> : pas de propriété .hidden
  const date = ilYa(video.date);
  $('.autre-auteur .diapo-date', diapo).textContent = date ? `· ${date}` : '';

  const legende = $('.autre-legende', diapo);
  remplirLegende(legende, (video.legende ?? '').trim());
  legende.hidden = !legende.textContent;

  const son = (video.son ?? '').trim();
  $('.autre-son', diapo).hidden = !son;
  $('.autre-son span', diapo).textContent = son;

  const recherche = (video.rechercheBas ?? '').trim();
  diapo.classList.toggle('avec-recherche', Boolean(recherche));
  const texteRecherche = $('.autre-recherche-texte', diapo);
  texteRecherche.textContent = `Recherche · ${recherche}`;
  return diapo;
}

/* ---------- Liste des favoris (Mode édition → Favoris) ---------- */

const listeFavoris = $('#liste-favoris');
let favoriARemplacer = null;

const resumeLegende = (video) => (video.legende ?? '').trim().replace(/\s+/g, ' ');

async function afficherListeFavoris() {
  const modele = $('#modele-ligne-favori').content.firstElementChild;
  const lignes = await Promise.all(etat.favoris.map(async (video, index) => {
    const ligne = modele.cloneNode(true);
    ligne.dataset.id = video.id;
    $('.ligne-miniature img', ligne).src = await urlMiniature(video);
    $('.ligne-type', ligne).textContent = video.type === 'video' ? 'Vidéo' : 'Image';
    $('.favori-resume-auteur img', ligne).src = await urlPhotoAuteur(video);
    $('.favori-resume-auteur strong', ligne).textContent = (video.auteur ?? '').trim() || 'Auteur à choisir';
    $('.favori-resume-legende', ligne).textContent = resumeLegende(video) || 'Pas de légende';
    $('[data-action="monter"]', ligne).disabled = index === 0;
    $('[data-action="descendre"]', ligne).disabled = index === etat.favoris.length - 1;
    return ligne;
  }));
  listeFavoris.replaceChildren(...lignes);
  const total = etat.favoris.length;
  $('#compteur-favoris').textContent = total ? `${total} vidéo${total > 1 ? 's' : ''} en favori` : 'Aucune vidéo en favori';
}

const rafraichirFavoris = () => Promise.all([afficherGrilleFavoris(), afficherListeFavoris()]);

function ouvrirGestionFavoris() {
  afficherListeFavoris();
  ouvrirCalque($('#ecran-favoris'));
  avertirSiNonPersistant();
}

async function ajouterFavoris(fichiers) {
  const bouton = $('#bouton-ajout-favori');
  const champ = $('#champ-ajout-favori');
  const texte = $('#ajout-favori-texte');
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
        auteur: '',
        certifie: false,
        date: new Date(Date.now() - 86400000).toISOString(), // « Il y a 1 j »
        legende: '',
        son: '',
        etiquette: '',
        vues: '0',
        jaime: '0',
        commentaires: '0',
        favoris: '1',
        partages: '0',
        aime: false,
        enFavori: true, // elle est dans tes favoris : signet jaune
        recherche: '',
        rechercheBas: '',
        photoAuteur: false,
        photoSon: false,
      };
      await enregistrerMedias(video, medias);
      nouvelles.push(video);
    } catch (erreur) {
      console.error(erreur);
      afficherMessage(`Impossible d'ajouter « ${fichier.name} » : format non lu par ce navigateur ou stockage plein.`);
    }
  }

  if (nouvelles.length) {
    // Le dernier favori enregistré apparaît en premier, comme sur TikTok
    etat.favoris.unshift(...nouvelles);
    await sauverFavoris();
    await rafraichirFavoris();
    if (nouvelles.length === 1) {
      ouvrirDetailsFavori(nouvelles[0]);
      afficherMessage('Ajoutée aux favoris : choisis son auteur, sa légende et ses chiffres.');
    } else {
      afficherMessage(`${nouvelles.length} vidéos ajoutées aux favoris`);
    }
  }

  texte.textContent = texteInitial;
  bouton.classList.remove('occupe');
  champ.disabled = false;
}

async function remplacerFichierFavori(video, fichier) {
  try {
    await enregistrerMedias(video, await preparerFichier(fichier));
    await sauverFavoris();
    await rafraichirFavoris();
    if (video === favoriEnDetails) await afficherApercuFavori();
    afficherMessage('Vidéo remplacée');
  } catch (erreur) {
    console.error(erreur);
    afficherMessage(`Impossible d'utiliser « ${fichier.name} ».`);
  }
}

async function supprimerFavori(video) {
  if (!confirm('Retirer cette vidéo de tes favoris ?')) return;
  etat.favoris = etat.favoris.filter((element) => element !== video);
  await sauverFavoris();
  for (const cle of clesFichiersFavori(video)) {
    oublierFichier(cle);
    await Stockage.supprimerFichier(cle).catch(() => {});
  }
  await rafraichirFavoris();
}

async function deplacerFavori(video, sens) {
  const index = etat.favoris.indexOf(video);
  const cible = index + sens;
  if (cible < 0 || cible >= etat.favoris.length) return;
  [etat.favoris[index], etat.favoris[cible]] = [etat.favoris[cible], etat.favoris[index]];
  await sauverFavoris();
  await rafraichirFavoris();
}

$('#champ-ajout-favori').addEventListener('change', (evenement) => {
  const fichiers = [...evenement.target.files];
  evenement.target.value = '';
  if (fichiers.length) ajouterFavoris(fichiers);
});

$('#champ-remplacer-favori').addEventListener('change', (evenement) => {
  const fichier = evenement.target.files[0];
  evenement.target.value = '';
  if (fichier && favoriARemplacer) remplacerFichierFavori(favoriARemplacer, fichier);
});

listeFavoris.addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('[data-action]');
  if (!bouton) return;
  const id = bouton.closest('.ligne')?.dataset.id;
  const video = etat.favoris.find((element) => element.id === id);
  if (!video) return;
  switch (bouton.dataset.action) {
    case 'details':
      ouvrirDetailsFavori(video);
      break;
    case 'monter':
      deplacerFavori(video, -1);
      break;
    case 'descendre':
      deplacerFavori(video, 1);
      break;
    case 'supprimer':
      supprimerFavori(video);
      break;
    case 'remplacer':
      favoriARemplacer = video;
      $('#champ-remplacer-favori').click();
      break;
  }
});

/* ---------- Une vidéo en favori : auteur, photos, légende, son, chiffres ---------- */

const formulaireFavori = $('#formulaire-favori');
let favoriEnDetails = null;
let photoAChanger = null; // "auteur" ou "son"

// Valeur pour un champ <input type="datetime-local"> (heure locale)
function dateHeureVersChamp(dateTexte) {
  const date = new Date(dateTexte);
  if (Number.isNaN(date.getTime())) return '';
  const deux = (nombre) => String(nombre).padStart(2, '0');
  return `${dateVersChamp(dateTexte)}T${deux(date.getHours())}:${deux(date.getMinutes())}`;
}

async function afficherApercuFavori() {
  const video = favoriEnDetails;
  $('#favori-miniature img').src = await urlMiniature(video);
  $('#favori-miniature .ligne-type').textContent = video.type === 'video' ? 'Vidéo' : 'Image';
}

async function afficherPhotosFavori() {
  const video = favoriEnDetails;
  $('.favori-photo[data-photo="auteur"] img').src = await urlPhotoAuteur(video);
  $('.favori-photo[data-photo="son"] img').src = await urlPhotoSon(video);
}

function remplirFormulaireFavori() {
  const video = favoriEnDetails;
  for (const champ of formulaireFavori.elements) {
    if (!champ.name) continue;
    if (champ.type === 'checkbox') champ.checked = Boolean(video[champ.name]);
    else if (champ.type === 'datetime-local') champ.value = video.date ? dateHeureVersChamp(video.date) : '';
    else champ.value = video[champ.name] ?? '';
  }
}

async function ouvrirDetailsFavori(video) {
  favoriEnDetails = video;
  remplirFormulaireFavori();
  await Promise.all([afficherApercuFavori(), afficherPhotosFavori()]);
  ouvrirCalque($('#ecran-favori'));
}

// Le cœur ou le signet a été touché dans le lecteur (voir basculer dans script.js)
function signalerFavorisModifies() {
  if (favoriEnDetails) remplirFormulaireFavori();
}

formulaireFavori.addEventListener('input', (evenement) => {
  const champ = evenement.target;
  const video = favoriEnDetails;
  if (!video || !champ.name) return;
  if (champ.type === 'checkbox') video[champ.name] = champ.checked;
  else if (champ.type === 'datetime-local') {
    const date = new Date(champ.value);
    video.date = Number.isNaN(date.getTime()) ? '' : date.toISOString();
  } else video[champ.name] = champ.value;
  sauverFavoris();
  if (champ.name === 'vues') afficherGrilleFavoris();
});
formulaireFavori.addEventListener('submit', (evenement) => evenement.preventDefault());

$('.favori-photos').addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('[data-photo]');
  if (!bouton) return;
  photoAChanger = bouton.dataset.photo;
  $('#champ-photo-favori').click();
});

$('#champ-photo-favori').addEventListener('change', async (evenement) => {
  const fichier = evenement.target.files[0];
  evenement.target.value = '';
  const video = favoriEnDetails;
  if (!fichier || !video || !photoAChanger) return;
  const cle = photoAChanger === 'son' ? cleSon(video) : cleAuteur(video);
  try {
    await Stockage.ecrireFichier(cle, await photoReduite(fichier, 320));
    oublierFichier(cle);
    video[photoAChanger === 'son' ? 'photoSon' : 'photoAuteur'] = true;
    await sauverFavoris();
    await afficherPhotosFavori();
    afficherMessage(photoAChanger === 'son' ? 'Photo du son mise à jour' : 'Photo de profil mise à jour');
  } catch (erreur) {
    console.error(erreur);
    afficherMessage("Impossible d'utiliser cette image.");
  }
});

$('#favori-miniature').addEventListener('click', () => {
  favoriARemplacer = favoriEnDetails;
  $('#champ-remplacer-favori').click();
});
$('#favori-voir').addEventListener('click', () => ouvrirLecteur(favoriEnDetails, 'favoris'));
$('#ecran-favori').addEventListener('fermeture', () => {
  favoriEnDetails = null;
  afficherListeFavoris();
});
