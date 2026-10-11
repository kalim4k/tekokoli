// « Changer de compte » : feuille ouverte par les icônes de personnes en haut du profil.
// Chaque compte a son profil, ses vidéos et ses récompenses (voir stockage.js).
// Utilise les outils de script.js ($, etat, ouvrirCalque, afficherCompte…).

const feuilleComptes = $('#feuille-comptes');
const listeComptes = $('#comptes-liste');
const attenteCompte = $('#chargement-compte');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function afficherComptes() {
  const modele = $('#modele-compte').content.firstElementChild;
  const comptes = await Stockage.listeDesComptes();
  const lignes = await Promise.all(comptes.map(async (compte) => {
    const ligne = modele.cloneNode(true);
    const bouton = $('.compte', ligne);
    const actif = compte.id === Stockage.compteActif;
    bouton.dataset.id = compte.id;
    bouton.classList.toggle('actif', actif);
    if (actif) bouton.setAttribute('aria-current', 'true');
    $('.compte-photo', ligne).src = (await urlFichier(compte.cleAvatar))
      || (compte.principal ? 'images/avatar-recadre.jpg' : AVATAR_VIDE);
    $('.compte-nom', ligne).textContent = compte.nom.trim() || compte.utilisateur;
    $('.compte-utilisateur', ligne).textContent = compte.utilisateur ? `@${compte.utilisateur}` : '';
    return ligne;
  }));
  listeComptes.replaceChildren(...lignes);
}

async function ouvrirComptes() {
  await afficherComptes();
  ouvrirCalque(feuilleComptes);
}

// Ferme l'écran du dessus, puis fait l'action (une fois le retour dans l'historique terminé)
function fermerPuis(calque, action) {
  calque.addEventListener('fermeture', () => action(), { once: true });
  demanderFermeture();
}

// Affiche un autre compte, avec un court chargement comme dans l'application
async function changerDeCompte(compte) {
  attenteCompte.hidden = false;
  const debut = Date.now();
  try {
    await afficherCompte(await Stockage.changerDeCompte(compte));
    $('.tab[data-tab="videos"]').click();
    window.scrollTo(0, 0);
    signalerVideosModifiees();
  } catch (erreur) {
    console.error(erreur);
    afficherMessage('Impossible de changer de compte.');
  }
  await pause(Math.max(0, 450 - (Date.now() - debut)));
  attenteCompte.hidden = true;
}

for (const bouton of [$('#ouvrir-comptes'), $('#ouvrir-visiteurs')]) {
  bouton.addEventListener('click', ouvrirComptes);
}
$('#feuille-voile').addEventListener('click', demanderFermeture);

listeComptes.addEventListener('click', (evenement) => {
  const compte = evenement.target.closest('.compte')?.dataset.id;
  if (!compte) return;
  fermerPuis(feuilleComptes, () => {
    if (compte !== Stockage.compteActif) changerDeCompte(compte);
  });
});

// Nouveau compte vide : on l'affiche et on ouvre tout de suite son profil pour le personnaliser
$('#ajouter-compte').addEventListener('click', () => {
  fermerPuis(feuilleComptes, async () => {
    try {
      await changerDeCompte(await Stockage.creerCompte());
      $('#ouvrir-profil').click();
      afficherMessage('Compte ajouté : choisis son nom, sa photo et ses chiffres.');
    } catch (erreur) {
      console.error(erreur);
      afficherMessage("Impossible d'ajouter un compte.");
    }
  });
});

/* ---------- Supprimer le compte affiché (éditeur du profil) ---------- */

const zoneSuppression = $('#zone-supprimer-compte');
$('#ouvrir-profil').addEventListener('click', () => {
  zoneSuppression.hidden = Stockage.nombreDeComptes < 2;
});

$('#supprimer-compte').addEventListener('click', () => {
  const nom = etat.profil.nom.trim() || `@${etat.profil.utilisateur}`;
  if (!confirm(`Supprimer le compte « ${nom} » ? Son profil, ses vidéos et ses récompenses seront effacés de l'appli.`)) return;
  const compte = Stockage.compteActif;
  const fichiers = [Stockage.cleAvatar(), ...etat.videos.flatMap((video) => [
    cleMiniature(video),
    cleVideo(video),
    ...(video.commentairesAffiches ?? []).map((commentaire) => cleCommentaire(video, commentaire)),
  ])];
  fermerPuis($('#ecran-profil'), async () => {
    try {
      fichiers.forEach(oublierFichier);
      await changerDeCompte(await Stockage.supprimerCompte(compte));
      afficherMessage(`Compte « ${nom} » supprimé`);
    } catch (erreur) {
      console.error(erreur);
      afficherMessage('Impossible de supprimer ce compte.');
    }
  });
});
