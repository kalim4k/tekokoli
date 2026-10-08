// Panneau ≡ (menu de droite), TikTok Studio, Programme de récompenses et mode édition.
// Utilise les outils de script.js ($, etat, ouvrirCalque, urlMiniature…).

const tiroir = $('#tiroir');
const ecranStudio = $('#ecran-studio');
const ecranRecompenses = $('#ecran-recompenses');
const ecranRecompenseVideo = $('#ecran-recompense-video');
const formulaireRecompenses = $('#formulaire-recompenses');

/* ---------- Dates ---------- */

const formatJour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });                 // 7 oct.
const formatJourAnnee = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); // 7 oct. 2026
const formatMoisCourt = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' });           // oct. 2026
const formatMoisSeul = new Intl.DateTimeFormat('fr-FR', { month: 'short' });                             // oct.
const formatMoisLong = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });             // septembre 2026
const UN_JOUR = 86400000;

const debutDuJour = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const ajouterJours = (date, jours) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + jours);
const joursDansMois = (annee, mois) => new Date(annee, mois + 1, 0).getDate();
const jjmm = (date) => `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;

// Comme TikTok, les chiffres sont arrêtés à la veille ("Dernière mise à jour : 7 oct.")
const derniereMiseAJour = () => ajouterJours(debutDuJour(new Date()), -1);

/* ---------- Montants ---------- */

// "0,94" / "1 234.5" / "$12" → nombre (0 si illisible ou négatif)
function lireMontant(valeur) {
  let texte = String(valeur ?? '').replace(/[\s  $€]/g, '').replace(/US$/i, '');
  if (texte.includes(',') && texte.includes('.')) texte = texte.replace(/,/g, '');
  else texte = texte.replace(',', '.');
  const nombre = Number.parseFloat(texte);
  return Number.isFinite(nombre) && nombre > 0 ? nombre : 0;
}
const enCentimes = (valeur) => Math.round(lireMontant(valeur) * 100);
const chiffresDollars = (centimes) =>
  (centimes / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dollars = (centimes) => `$${chiffresDollars(centimes)}`;
const enTexte = (centimes) => (centimes / 100).toFixed(2);
const somme = (valeurs) => valeurs.reduce((a, b) => a + b, 0);

// Solde du panneau ≡ : écrit à la française, "0,94 $US" (espace insécable avant $US)
const formaterSolde = (valeur) =>
  `${lireMontant(valeur).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0$US`;

// "-1200" → "-1 200" ; garde le signe que formaterNombre ne gère pas
function nombreSigne(valeur) {
  const texte = String(valeur ?? '').trim();
  const signe = /^[-−]/.test(texte) ? '-' : '';
  return signe + (formaterNombre(texte.replace(/^[-+−]/, '')) || '0');
}

/* ---------- Répartition jour par jour (toujours la même pour un même montant) ---------- */

function aleatoire(texte) {
  let a = 2166136261;
  for (const caractere of texte) a = Math.imul(a ^ caractere.codePointAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Partage des centimes selon des poids, sans perdre un centime
function repartir(centimes, poids) {
  const somme = poids.reduce((a, b) => a + b, 0);
  if (!somme || centimes <= 0) return poids.map(() => 0);
  const bruts = poids.map((p) => (centimes * p) / somme);
  const parts = bruts.map(Math.floor);
  const reste = centimes - parts.reduce((a, b) => a + b, 0);
  const ordre = bruts.map((v, i) => [v - parts[i], i]).sort((x, y) => y[0] - x[0]);
  for (let k = 0; k < reste; k++) parts[ordre[k % ordre.length][1]]++;
  return parts;
}

function poidsAleatoires(nombre, graine, decroissance = 0) {
  const hasard = aleatoire(graine);
  return Array.from({ length: nombre }, (_, i) => (0.55 + hasard() * 0.9) * (decroissance ? Math.exp(-i / decroissance) : 1));
}

// Montants jour par jour : les formes dessinées dans l'éditeur (une pour le standard, une pour le
// supplémentaire) si elles existent, sinon une forme automatique.
// Les totaux standard et supplémentaire sont toujours respectés au centime près.
function repartirParJour(avecDonnees, standard, supplementaire, forme, graine, decroissance = 0) {
  const lire = (valeurs) => {
    const poids = valeurs && Array.from({ length: avecDonnees }, (_, i) => Math.max(0, Number(valeurs[i]) || 0));
    return poids?.some((p) => p > 0) ? poids : null;
  };
  // Ancien format : une seule forme pour le total, suivie par les deux types
  const formes = Array.isArray(forme) ? { standard: forme, supplementaire: forme } : forme ?? {};
  const automatique = poidsAleatoires(avecDonnees, graine, decroissance);
  const parStandard = repartir(standard, lire(formes.standard) ?? lire(formes.supplementaire) ?? automatique);
  const parSupplementaire = repartir(supplementaire, lire(formes.supplementaire) ?? lire(formes.standard) ?? automatique);
  return parStandard.map((montant, i) => ({ standard: montant, supplementaire: parSupplementaire[i] }));
}

/* ---------- Récompenses du compte (mois, paiements) ---------- */

const R = () => etat.recompenses;

// Montant d'un mois : mois en cours = saisi dans l'éditeur, 3 mois précédents = paiements récents
function montantsDuMois(annee, mois) {
  const reference = derniereMiseAJour();
  const ecart = (reference.getFullYear() - annee) * 12 + (reference.getMonth() - mois);
  const standardEnCours = enCentimes(R().moisStandard);
  const supplementaireEnCours = enCentimes(R().moisSupplementaire);
  if (ecart === 0) return { standard: standardEnCours, supplementaire: supplementaireEnCours };
  if (ecart >= 1 && ecart <= 3) {
    const total = enCentimes(R()[`paiement${ecart}`]);
    // Proportion standard / supplémentaire : celle dessinée pour ce mois, sinon celle du mois en cours
    const forme = R().formes?.[cleMois(annee, mois)];
    const dessine = forme && !Array.isArray(forme) ? [somme(forme.standard ?? []), somme(forme.supplementaire ?? [])] : [0, 0];
    const [s, p] = dessine[0] + dessine[1] ? dessine : [standardEnCours, supplementaireEnCours];
    const part = s + p ? p / (s + p) : 0;
    const supplementaire = Math.round(total * part);
    return { standard: total - supplementaire, supplementaire };
  }
  return { standard: 0, supplementaire: 0 };
}

const cleMois = (annee, mois) => `${annee}-${String(mois + 1).padStart(2, '0')}`; // "2026-10"

function joursDuMois(annee, mois) {
  const reference = derniereMiseAJour();
  const nombre = joursDansMois(annee, mois);
  const enCours = annee === reference.getFullYear() && mois === reference.getMonth();
  const avecDonnees = enCours ? reference.getDate() : nombre;
  const { standard, supplementaire } = montantsDuMois(annee, mois);
  const cle = cleMois(annee, mois);
  const parJour = repartirParJour(avecDonnees, standard, supplementaire, R().formes?.[cle], cle);
  return Array.from({ length: nombre }, (_, i) => ({
    date: new Date(annee, mois, i + 1),
    standard: parJour[i]?.standard ?? 0,
    supplementaire: parJour[i]?.supplementaire ?? 0,
    donnees: i < avecDonnees,
  }));
}

/* ---------- Récompenses d'une vidéo ---------- */

// Les vidéos sans date (celles d'origine) reçoivent une date régulière selon leur place sur le profil
function dateVideo(video) {
  const date = video.date ? new Date(video.date) : null;
  if (date && !Number.isNaN(date.getTime())) return debutDuJour(date);
  const position = Math.max(0, etat.videos.indexOf(video));
  return ajouterJours(derniereMiseAJour(), -(position + 1) * 3);
}

function dureeVideo(video) {
  const texte = String(video.duree ?? '').trim();
  const morceaux = texte.match(/^(\d+)(?:[:.,h ](\d{1,2}))?$/);
  if (morceaux) {
    const secondes = morceaux[2] === undefined ? Number(morceaux[1]) : Number(morceaux[1]) * 60 + Number(morceaux[2]);
    return formaterDuree(secondes);
  }
  if (texte) return texte;
  return formaterDuree(45 + Math.floor(aleatoire(video.id)() * 75)); // durée plausible, toujours la même
}

function chiffresVideo(video) {
  const standard = enCentimes(video.recStandard);
  const supplementaire = enCentimes(video.recSupplementaire);
  const total = standard + supplementaire;
  const vues = Number(enChiffres(video.vuesAdmissibles)) || 0;
  const rpm = vues >= 1000 ? Math.round((total / vues) * 1000) : null;
  return { standard, supplementaire, total, vues, rpm, eligible: !video.nonEligible };
}

const libelleVues = (vues) => (vues >= 1000 ? formaterNombre(String(vues)) : 'Moins de 1 000');

// 30 premiers jours après la publication, plus de récompenses les premiers jours
function joursVideo(video) {
  const debut = dateVideo(video);
  const reference = derniereMiseAJour();
  const avecDonnees = Math.max(0, Math.min(30, Math.round((reference - debut) / UN_JOUR) + 1));
  const { standard, supplementaire } = chiffresVideo(video);
  const parJour = repartirParJour(avecDonnees, standard, supplementaire, video.recForme, video.id, 7);
  return Array.from({ length: 30 }, (_, i) => ({
    date: ajouterJours(debut, i),
    standard: parJour[i]?.standard ?? 0,
    supplementaire: parJour[i]?.supplementaire ?? 0,
    donnees: i < avecDonnees,
  }));
}

/* ---------- Graphique en barres avec bulle au toucher ---------- */

const PAS_POSSIBLES = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];

function dessinerGraphique(graphique, { jours, etiquettes, libelle, selection }) {
  const maximum = Math.max(0, ...jours.map((jour) => jour.standard + jour.supplementaire)) / 100;
  // Sans récompense, l'axe va de 0 à 3 comme dans l'application
  const pas = maximum > 0 ? PAS_POSSIBLES.find((p) => p * 3 >= maximum) ?? Math.ceil(maximum / 3) : 1;
  const hauteurMax = pas * 3 * 100;
  const largeurJour = 100 / jours.length;

  const zone = document.createElement('div');
  zone.className = 'graphique-zone';
  const bande = document.createElement('div');
  bande.className = 'graphique-bande';
  zone.append(bande);

  jours.forEach((jour, i) => {
    const total = jour.standard + jour.supplementaire;
    if (!total) return;
    const barre = document.createElement('div');
    barre.className = 'graphique-barre';
    barre.style.left = `${(i + 0.2) * largeurJour}%`;
    barre.style.width = `${largeurJour * 0.6}%`;
    barre.style.height = `${(total / hauteurMax) * 100}%`;
    for (const type of ['standard', 'supplementaire']) {
      if (!jour[type]) continue;
      const part = document.createElement('span');
      part.className = type;
      part.style.height = `${(jour[type] / total) * 100}%`;
      barre.append(part);
    }
    zone.append(barre);
  });

  for (let k = 0; k <= 3; k++) {
    const haut = `${(1 - k / 3) * 100}%`;
    if (k) {
      const grille = document.createElement('div');
      grille.className = 'graphique-grille';
      grille.style.top = haut;
      zone.append(grille);
    }
    const valeur = document.createElement('span');
    valeur.className = 'graphique-y';
    valeur.style.top = haut;
    valeur.textContent = String(Math.round(pas * k * 100) / 100);
    zone.append(valeur);
  }
  const axe = document.createElement('div');
  axe.className = 'graphique-axe';
  zone.append(axe);
  for (const { index, texte } of etiquettes) {
    const etiquette = document.createElement('span');
    etiquette.className = 'graphique-x';
    etiquette.style.left = `${(index + 0.5) * largeurJour}%`;
    etiquette.textContent = texte;
    zone.append(etiquette);
  }

  const bulle = document.createElement('div');
  bulle.className = 'bulle-graphique';
  graphique.replaceChildren(zone, bulle);
  graphique.donnees = { jours, libelle, bande, bulle, zone, selection };
  choisirJour(graphique, selection);
}

function choisirJour(graphique, index) {
  const { jours, libelle, bande, bulle } = graphique.donnees;
  const i = Math.max(0, Math.min(jours.length - 1, index));
  graphique.donnees.selection = i;
  const jour = jours[i];
  const largeurJour = 100 / jours.length;
  bande.style.left = `${(i + 0.035) * largeurJour}%`;
  bande.style.width = `${largeurJour * 0.93}%`;
  const ligne = (type, texte, centimes) =>
    `<p><span class="carre ${type}"></span><span class="bulle-libelle">${texte}</span><span class="legende-valeur">${dollars(centimes)}</span></p>`;
  bulle.innerHTML = `<p class="bulle-entete">${libelle(jour.date)}<span class="legende-valeur">${dollars(jour.standard + jour.supplementaire)}</span></p>`
    + ligne('standard', 'Récompense standard', jour.standard)
    + ligne('supplementaire', 'Récompense supplémentaire', jour.supplementaire);
  placerBulle(graphique);
}

// À droite de la bande si elle tient, sinon à gauche
function placerBulle(graphique) {
  const { jours, bulle, zone, selection } = graphique.donnees ?? {};
  if (!zone || !zone.offsetWidth) return;
  const largeurJour = zone.offsetWidth / jours.length;
  const gauche = zone.offsetLeft + selection * largeurJour;
  const droite = gauche + largeurJour;
  const largeur = bulle.offsetWidth;
  let position = droite + 12.6;
  if (position + largeur > graphique.offsetWidth) position = gauche - 12.6 - largeur;
  bulle.style.left = `${Math.max(0, position)}px`;
  bulle.style.bottom = `${graphique.offsetHeight - zone.offsetTop - zone.offsetHeight + 13.9}px`;
}

function suivreDoigt(graphique) {
  let appui = false;
  const choisir = (evenement) => {
    const { zone, jours } = graphique.donnees ?? {};
    if (!zone) return;
    const rect = zone.getBoundingClientRect();
    choisirJour(graphique, Math.floor(((evenement.clientX - rect.left) / rect.width) * jours.length));
  };
  graphique.addEventListener('pointerdown', (evenement) => {
    appui = true;
    choisir(evenement);
  });
  graphique.addEventListener('pointermove', (evenement) => {
    if (appui || evenement.pointerType === 'mouse') choisir(evenement);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    graphique.addEventListener(type, () => { appui = false; });
  }
}

/* ---------- Faux chargement, comme dans l'application ---------- */

const minuteursChargement = new Map();
function simulerChargement(ecran, duree) {
  const attente = $('.page-chargement', ecran);
  ecran.classList.add('charge-en-cours');
  attente.hidden = false;
  $('.screen-panel', ecran).scrollTop = 0;
  clearTimeout(minuteursChargement.get(ecran));
  minuteursChargement.set(ecran, setTimeout(() => {
    ecran.classList.remove('charge-en-cours');
    attente.hidden = true;
    ecran.querySelectorAll('.graphique').forEach(placerBulle);
  }, duree));
}

window.addEventListener('resize', () => document.querySelectorAll('.graphique').forEach(placerBulle));

/* ---------- Panneau ≡ : appui simple = menu, appui long = mode édition ---------- */

const boutonMenu = $('#ouvrir-menu');
let minuteurAppuiLong = null;
let appuiLongFait = false;

function ouvrirTiroir() {
  $('#tiroir-solde').textContent = formaterSolde(R().solde);
  document.documentElement.classList.add('tiroir-ouvert');
  ouvrirCalque(tiroir);
}
tiroir.addEventListener('fermeture', () => document.documentElement.classList.remove('tiroir-ouvert'));
$('#tiroir-voile').addEventListener('click', demanderFermeture);

boutonMenu.addEventListener('pointerdown', (evenement) => {
  if (evenement.button) return;
  appuiLongFait = false;
  clearTimeout(minuteurAppuiLong);
  minuteurAppuiLong = setTimeout(() => {
    appuiLongFait = true;
    navigator.vibrate?.(25);
    ouvrirModeEdition();
  }, 800);
});
for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
  boutonMenu.addEventListener(type, () => clearTimeout(minuteurAppuiLong));
}
boutonMenu.addEventListener('contextmenu', (evenement) => evenement.preventDefault());
boutonMenu.addEventListener('click', (evenement) => {
  if (appuiLongFait) {
    appuiLongFait = false;
    return;
  }
  // Sur ordinateur : Maj + clic ouvre aussi le mode édition
  if (evenement.shiftKey) ouvrirModeEdition();
  else ouvrirTiroir();
});

/* ---------- TikTok Studio ---------- */

function evolution(element, valeur) {
  const nombre = Number(String(valeur ?? '').replace(',', '.').replace(/[\s%+]/g, '').replace('−', '-')) || 0;
  element.innerHTML = '<span class="tendance"></span><span class="evolution-valeur"></span><span class="periode-courte">7 j</span>';
  $('.tendance', element).classList.toggle('hausse', nombre > 0);
  $('.evolution-valeur', element).textContent = `${formaterNombre(String(Math.abs(Math.round(nombre))))} %`;
}

function afficherStudio() {
  $('#studio-vues').textContent = nombreSigne(R().vuesPublication);
  $('#studio-followers').textContent = nombreSigne(R().followersNets);
  $('#studio-jaime').textContent = nombreSigne(R().jaimeStudio);
  evolution($('#studio-vues-evolution'), R().vuesEvolution);
  evolution($('#studio-followers-evolution'), R().followersEvolution);
  evolution($('#studio-jaime-evolution'), R().jaimeEvolution);
}

function ouvrirStudio(options) {
  afficherStudio();
  simulerChargement(ecranStudio, 650);
  ouvrirCalque(ecranStudio, options);
}

$('#tiroir-studio').addEventListener('click', () => ouvrirStudio({ remplacer: true }));
$('#ouvrir-studio').addEventListener('click', (evenement) => {
  evenement.preventDefault();
  ouvrirStudio();
});
$('#studio-programme').addEventListener('click', () => ouvrirRecompenses());

/* ---------- Programme de récompenses ---------- */

const vue = { mode: 'mois', annee: 0, mois: 0 };
const graphiqueEstimees = $('#graphique-estimees');
suivreDoigt(graphiqueEstimees);

function afficherEstimees() {
  const reference = derniereMiseAJour();
  let jours;
  let etiquettes;
  let libelle;
  let titrePeriode;
  let debut;
  let fin;
  let precedentPossible;
  let suivantPossible;

  if (vue.mode === 'mois') {
    jours = joursDuMois(vue.annee, vue.mois);
    etiquettes = jours.map((_, i) => i).filter((i) => i % 3 === 0).map((i) => ({ index: i, texte: String(i + 1) }));
    libelle = (date) => formatJour.format(date);
    titrePeriode = formatMoisCourt.format(new Date(vue.annee, vue.mois, 1));
    debut = new Date(vue.annee, vue.mois, 1);
    const enCours = vue.annee === reference.getFullYear() && vue.mois === reference.getMonth();
    fin = enCours ? reference : new Date(vue.annee, vue.mois, jours.length);
    const ecart = (reference.getFullYear() - vue.annee) * 12 + reference.getMonth() - vue.mois;
    precedentPossible = ecart < 12;
    suivantPossible = ecart > 0;
  } else {
    // Par an : une barre par mois
    const enCours = vue.annee === reference.getFullYear();
    jours = Array.from({ length: 12 }, (_, m) => {
      const montants = joursDuMois(vue.annee, m).filter((jour) => jour.donnees);
      return {
        date: new Date(vue.annee, m, 1),
        standard: montants.reduce((s, jour) => s + jour.standard, 0),
        supplementaire: montants.reduce((s, jour) => s + jour.supplementaire, 0),
        donnees: !enCours || m <= reference.getMonth(),
      };
    });
    etiquettes = [0, 3, 6, 9].map((m) => ({ index: m, texte: formatMoisSeul.format(new Date(vue.annee, m, 1)) }));
    libelle = (date) => formatMoisCourt.format(date);
    titrePeriode = String(vue.annee);
    debut = new Date(vue.annee, 0, 1);
    fin = enCours ? reference : new Date(vue.annee, 11, 31);
    precedentPossible = vue.annee > reference.getFullYear() - 1;
    suivantPossible = !enCours;
  }

  const avecDonnees = jours.filter((jour) => jour.donnees);
  const standard = avecDonnees.reduce((s, jour) => s + jour.standard, 0);
  const supplementaire = avecDonnees.reduce((s, jour) => s + jour.supplementaire, 0);
  const dernier = avecDonnees[avecDonnees.length - 1] ?? jours[0];

  $('#periode-texte').textContent = titrePeriode;
  $('#periode-precedente').disabled = !precedentPossible;
  $('#periode-suivante').disabled = !suivantPossible;
  $('#estimees-total').textContent = chiffresDollars(standard + supplementaire);
  const variation = $('#estimees-variation');
  variation.textContent = dollars(dernier.standard + dernier.supplementaire);
  const dateVariation = document.createElement('span');
  dateVariation.className = 'variation-date';
  dateVariation.textContent = `(${libelle(dernier.date)})`;
  variation.append(dateVariation);
  $('#estimees-plage').textContent = `${formatJourAnnee.format(debut)} - ${formatJourAnnee.format(fin)}`;
  $('#estimees-standard').textContent = dollars(standard);
  $('#estimees-supplementaire').textContent = dollars(supplementaire);
  dessinerGraphique(graphiqueEstimees, { jours, etiquettes, libelle, selection: jours.indexOf(dernier) });
}

function afficherPaiements() {
  const reference = derniereMiseAJour();
  const lignes = [1, 2, 3].map((ecart) => {
    const ligne = document.createElement('li');
    const mois = document.createElement('span');
    mois.textContent = formatMoisLong.format(new Date(reference.getFullYear(), reference.getMonth() - ecart, 1));
    const montant = document.createElement('span');
    montant.textContent = dollars(enCentimes(R()[`paiement${ecart}`]));
    ligne.append(mois, montant);
    return ligne;
  });
  $('#liste-paiements').replaceChildren(...lignes);
}

async function afficherVideosRecompenses() {
  const modele = $('#modele-video-recompense').content.firstElementChild;
  // "Les plus récentes" : de la plus récente à la plus ancienne
  const videos = [...etat.videos].sort((a, b) => dateVideo(b) - dateVideo(a));
  const elements = await Promise.all(videos.map(async (video) => {
    const element = modele.cloneNode(true);
    const bouton = $('.video-recompense', element);
    const chiffres = chiffresVideo(video);
    bouton.dataset.id = video.id;
    bouton.classList.toggle('est-non-eligible', !chiffres.eligible);
    $('img', element).src = await urlMiniature(video);
    $('.duree', element).textContent = dureeVideo(video);
    const titre = $('.video-recompense-titre', element);
    titre.textContent = video.titre?.trim() || 'Publication sans titre';
    titre.classList.toggle('sans-titre', !video.titre?.trim());
    $('.video-recompense-date', element).textContent = formatJourAnnee.format(dateVideo(video));
    $('.vr-total', element).textContent = dollars(chiffres.total);
    $('.vr-rpm', element).textContent = dollars(chiffres.rpm ?? 0);
    return element;
  }));
  $('#liste-videos-recompenses').replaceChildren(...elements);
}

function afficherRecompenses() {
  $('#recompenses-maj').textContent = `Dernière mise à jour : ${formatJour.format(derniereMiseAJour())}`;
  afficherEstimees();
  afficherPaiements();
  return afficherVideosRecompenses();
}

function ouvrirRecompenses() {
  const reference = derniereMiseAJour();
  Object.assign(vue, { mode: 'mois', annee: reference.getFullYear(), mois: reference.getMonth() });
  document.querySelectorAll('#recompenses-vues [data-vue]').forEach((pastille) => {
    pastille.classList.toggle('active', pastille.dataset.vue === 'mois');
  });
  afficherRecompenses();
  simulerChargement(ecranRecompenses, 900);
  ouvrirCalque(ecranRecompenses);
}

$('#recompenses-vues').addEventListener('click', (evenement) => {
  const pastille = evenement.target.closest('[data-vue]');
  if (!pastille || pastille.dataset.vue === vue.mode) return;
  const reference = derniereMiseAJour();
  Object.assign(vue, { mode: pastille.dataset.vue, annee: reference.getFullYear(), mois: reference.getMonth() });
  document.querySelectorAll('#recompenses-vues [data-vue]').forEach((autre) => autre.classList.toggle('active', autre === pastille));
  afficherEstimees();
});

function changerPeriode(sens) {
  if (vue.mode === 'mois') {
    const date = new Date(vue.annee, vue.mois + sens, 1);
    vue.annee = date.getFullYear();
    vue.mois = date.getMonth();
  } else {
    vue.annee += sens;
  }
  afficherEstimees();
}
$('#periode-precedente').addEventListener('click', () => changerPeriode(-1));
$('#periode-suivante').addEventListener('click', () => changerPeriode(1));

// Cartes que l'on peut fermer (jusqu'au prochain chargement de la page)
ecranRecompenses.addEventListener('click', (evenement) => {
  const fermer = evenement.target.closest('[data-fermer-carte]');
  if (fermer) fermer.closest('.carte').hidden = true;
});
$('#conseils-bascule').addEventListener('click', (evenement) => {
  const carte = $('#carte-conseils');
  carte.classList.toggle('replie');
  evenement.currentTarget.setAttribute('aria-expanded', !carte.classList.contains('replie'));
});

$('#liste-videos-recompenses').addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('.video-recompense');
  const video = bouton && etat.videos.find((element) => element.id === bouton.dataset.id);
  if (video) ouvrirRecompenseVideo(video);
});

/* ---------- Récompenses par vidéo ---------- */

const graphiqueVideo = $('#graphique-video');
suivreDoigt(graphiqueVideo);
let videoRecompense = null;

async function afficherRecompenseVideo() {
  const video = videoRecompense;
  const chiffres = chiffresVideo(video);
  const titre = $('#pv-titre');
  titre.textContent = video.titre?.trim() || 'Publication sans titre';
  titre.classList.toggle('sans-titre', !video.titre?.trim());
  $('#pv-date').textContent = formatJourAnnee.format(dateVideo(video));
  $('#pv-total').textContent = chiffresDollars(chiffres.total);
  $('#pv-maj').textContent = `Dernière mise à jour : ${formatJourAnnee.format(derniereMiseAJour())}`;
  $('#pv-createurs').textContent = dollars(chiffres.total);
  $('#pv-standard').textContent = dollars(chiffres.standard);
  $('#pv-supplementaire').textContent = dollars(chiffres.supplementaire);
  $('#pv-calcul-recompenses').textContent = dollars(chiffres.total);
  $('#pv-rpm').textContent = chiffres.rpm === null ? '--' : dollars(chiffres.rpm);
  $('#pv-vues').textContent = libelleVues(chiffres.vues);
  // En gris tant que le calcul n'est pas disponible (comme « -- » et « Moins de 1 000 »)
  $('#pv-rpm').classList.toggle('gris', chiffres.rpm === null);
  $('#pv-vues').classList.toggle('gris', chiffres.rpm === null);
  $('#pv-message').hidden = chiffres.rpm !== null;

  const jours = joursVideo(video);
  const etiquettes = [0, 7, 14, 21, 28].map((i) => ({ index: i, texte: jjmm(jours[i].date) }));
  const derniers = jours.filter((jour) => jour.donnees);
  dessinerGraphique(graphiqueVideo, {
    jours,
    etiquettes,
    libelle: (date) => formatJour.format(date),
    selection: derniers.length ? derniers.length - 1 : 0,
  });
  $('#pv-miniature').src = await urlMiniature(video);
}

function ouvrirRecompenseVideo(video) {
  videoRecompense = video;
  afficherRecompenseVideo();
  simulerChargement(ecranRecompenseVideo, 500);
  ouvrirCalque(ecranRecompenseVideo);
}

// Une vidéo modifiée (récompenses, date, miniature…) : on met à jour les écrans ouverts
document.addEventListener('videos-modifiees', () => {
  if (ecranRecompenses.classList.contains('open')) afficherVideosRecompenses();
  if (ecranRecompenseVideo.classList.contains('open') && videoRecompense) {
    if (etat.videos.includes(videoRecompense)) afficherRecompenseVideo();
    else demanderFermeture();
  }
  if (typeof videoEnDetails !== 'undefined' && videoEnDetails) afficherAideRpm(videoEnDetails);
});

// Sous les champs de récompenses de la fiche vidéo
function afficherAideRpm(video) {
  const { total, rpm } = chiffresVideo(video);
  $('#details-rpm').textContent = rpm === null
    ? `Total ${dollars(total)}. RPM affiché « -- » tant que les vues admissibles sont sous 1 000.`
    : `Total ${dollars(total)} · RPM calculé : ${dollars(rpm)} pour 1 000 vues.`;
}

/* ---------- Mode édition (appui long sur ≡) ---------- */

function ouvrirModeEdition() {
  ouvrirCalque($('#ecran-edition'));
  avertirSiNonPersistant();
}

$('#ecran-edition').addEventListener('click', (evenement) => {
  const entree = evenement.target.closest('[data-ouvrir]');
  if (!entree) return;
  if (entree.dataset.ouvrir === 'videos') ouvrirGestionVideos();
  else if (entree.dataset.ouvrir === 'recompenses') ouvrirEditionRecompenses();
  else $('#ouvrir-profil').click();
});

function remplirFormulaireRecompenses() {
  for (const champ of formulaireRecompenses.elements) {
    if (champ.name) champ.value = R()[champ.name] ?? '';
  }
}

function ouvrirEditionRecompenses() {
  const reference = derniereMiseAJour();
  remplirFormulaireRecompenses();
  formulaireRecompenses.querySelectorAll('[data-mois-paiement]').forEach((libelle) => {
    const date = new Date(reference.getFullYear(), reference.getMonth() - Number(libelle.dataset.moisPaiement), 1);
    libelle.textContent = formatMoisLong.format(date);
  });
  $('#edition-mois-titre').textContent = `Récompenses estimées · ${formatMoisLong.format(reference)}`;
  ouvrirCalque($('#ecran-edition-recompenses'));
}

formulaireRecompenses.addEventListener('input', (evenement) => {
  const champ = evenement.target;
  if (!champ.name) return;
  R()[champ.name] = champ.value;
  sauverRecompenses();
  afficherStudio();
  if (ecranRecompenses.classList.contains('open')) {
    afficherEstimees();
    afficherPaiements();
  }
});
formulaireRecompenses.addEventListener('submit', (evenement) => evenement.preventDefault());

/* ---------- Dessiner le graphique jour par jour (mode édition) ---------- */
// On choisit la couleur à dessiner (standard en bleu, supplémentaire en turquoise posé dessus),
// puis on glisse le doigt sur les barres : le haut de cette couleur suit le doigt.
// Changer un montant agrandit ou réduit sa couleur d'un coup en gardant sa forme.

const ecranDessin = $('#ecran-graphique');
const zoneDessin = $('#ge-graphique');
const TYPES = ['standard', 'supplementaire'];
const champsTotaux = { standard: $('#ge-total-standard'), supplementaire: $('#ge-total-supplementaire'), total: $('#ge-total') };
const champsJour = { standard: $('#ge-jour-standard'), supplementaire: $('#ge-jour-supplementaire') };
const ECHELLES = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000, 100000];
const dessin = { source: null, standard: [], supplementaire: [], type: 'standard', echelle: 1, jour: 0, barres: [], bande: null };

const nombreJours = () => dessin.standard.length;
const totalDuJour = (i) => dessin.standard[i] + dessin.supplementaire[i];
const autreType = (type) => (type === 'standard' ? 'supplementaire' : 'standard');
const NOMS = {
  standard: { court: 'standard', couleur: 'bleu' },
  supplementaire: { court: 'supplémentaire', couleur: 'turquoise' },
};

// Mois en cours (ecart 0) ou un des 3 mois des paiements récents (ecart 1 à 3)
function sourceMois(ecart) {
  const reference = derniereMiseAJour();
  const debut = new Date(reference.getFullYear(), reference.getMonth() - ecart, 1);
  const annee = debut.getFullYear();
  const mois = debut.getMonth();
  const jours = joursDuMois(annee, mois);
  const nomMois = formatMoisLong.format(debut);
  return {
    ecart,
    titre: `Graphique de ${nomMois}`,
    explication: ecart === 0
      ? `Une barre par jour de ${nomMois}, jusqu'à hier (${formatJour.format(reference)}) : c'est le graphique « Récompenses estimées ».`
      : `Une barre par jour de ${nomMois}. Le total devient le paiement de ce mois dans « Paiements récents ».`,
    jours,
    etiquettes: [0, 4, 9, 14, 19, 24, 29].filter((i) => i < jours.length).map((i) => ({ index: i, texte: String(i + 1) })),
    enregistrer({ standard, supplementaire }) {
      R().formes = { ...R().formes, [cleMois(annee, mois)]: { standard, supplementaire } };
      if (ecart === 0) {
        R().moisStandard = enTexte(somme(standard));
        R().moisSupplementaire = enTexte(somme(supplementaire));
      } else {
        R()[`paiement${ecart}`] = enTexte(somme(standard) + somme(supplementaire));
      }
      sauverRecompenses();
    },
  };
}

// Comme « 30 premiers jours » dans TikTok : les 30 jours qui suivent la publication de la vidéo
function sourceVideo(video) {
  const jours = joursVideo(video);
  const passes = jours.filter((jour) => jour.donnees).length;
  return {
    video,
    titre: '30 jours après la publication',
    explication: `Comme « 30 premiers jours » dans TikTok : une barre par jour pendant les 30 jours qui suivent la publication, du ${formatJour.format(jours[0].date)} au ${formatJourAnnee.format(jours[29].date)}.`
      + (passes < 30 ? ` Seuls les jours déjà passés se dessinent (${passes} sur 30).` : ''),
    jours,
    etiquettes: [0, 7, 14, 21, 28].map((i) => ({ index: i, texte: jjmm(jours[i].date) })),
    enregistrer({ standard, supplementaire }) {
      video.recForme = { standard, supplementaire };
      video.recStandard = enTexte(somme(standard));
      video.recSupplementaire = enTexte(somme(supplementaire));
      sauverVideos();
    },
  };
}

// Hauteur du graphique : un peu au-dessus du plus grand jour, pour pouvoir dessiner plus haut
function echelleDessin() {
  const maximum = Math.max(0, ...dessin.standard.map((_, i) => totalDuJour(i))) / 100;
  return maximum ? ECHELLES.find((e) => e >= maximum * 1.3) ?? Math.ceil(maximum * 1.3) : 1;
}

function ouvrirDessin(source) {
  dessin.source = source;
  const jours = source.jours.filter((jour) => jour.donnees);
  dessin.standard = jours.map((jour) => jour.standard);
  dessin.supplementaire = jours.map((jour) => jour.supplementaire);
  dessin.jour = Math.max(0, jours.length - 1);
  dessin.echelle = echelleDessin();
  $('#ge-titre').textContent = source.titre;
  $('#ge-explication').textContent = source.explication;
  const periode = $('#ge-periode');
  periode.hidden = source.ecart === undefined;
  if (!periode.hidden) {
    $('#ge-periode-texte').textContent = formatMoisCourt.format(source.jours[0].date);
    $('#ge-precedent').disabled = source.ecart >= 3;
    $('#ge-suivant').disabled = source.ecart <= 0;
  }
  $('#ge-vide').hidden = jours.length > 0;
  construireDessin();
  choisirType(dessin.type);
  if (!pileCalques.includes(ecranDessin)) ouvrirCalque(ecranDessin);
}

// Couleur dessinée au doigt (l'autre est pâlie et ne bouge pas)
function choisirType(type) {
  dessin.type = type;
  zoneDessin.dataset.type = type;
  document.querySelectorAll('#ge-types [data-type]').forEach((bouton) => {
    bouton.setAttribute('aria-pressed', String(bouton.dataset.type === type));
  });
  const { couleur } = NOMS[type];
  $('#ge-consigne').textContent = type === 'standard'
    ? 'Glisse le doigt sur le graphique : le haut du bleu suit ton doigt (le turquoise reste posé dessus).'
    : 'Glisse le doigt sur le graphique : le haut du turquoise suit ton doigt, au-dessus du bleu qui ne bouge pas.';
  $('#ge-modeles-titre').textContent = `Formes toutes prêtes pour le ${couleur} (son total ne change pas)`;
  $('#ge-modeles [data-forme=copier]').textContent = `Comme le ${NOMS[autreType(type)].couleur}`;
}

function construireDessin() {
  const { jours, etiquettes } = dessin.source;
  const largeur = 100 / jours.length;
  const barres = document.createElement('div');
  barres.className = 'ge-barres';
  dessin.bande = document.createElement('span');
  dessin.bande.className = 'ge-bande';
  dessin.bande.style.width = `${largeur}%`;
  barres.append(dessin.bande);
  dessin.barres = jours.map((jour, i) => {
    const barre = document.createElement('span');
    barre.className = jour.donnees ? 'ge-barre' : 'ge-barre inactive';
    barre.style.left = `${(i + 0.12) * largeur}%`;
    barre.style.width = `${largeur * 0.76}%`;
    if (jour.donnees) {
      for (const type of TYPES) {
        const part = document.createElement('span');
        part.className = type;
        barre.append(part);
      }
    }
    barres.append(barre);
    return barre;
  });
  for (const { index, texte } of etiquettes) {
    const etiquette = document.createElement('span');
    etiquette.className = 'ge-x';
    etiquette.style.left = `${(index + 0.5) * largeur}%`;
    etiquette.textContent = texte;
    barres.append(etiquette);
  }
  const lignes = [3, 2, 1, 0].map((k) => {
    const ligne = document.createElement('div');
    ligne.className = 'ge-ligne';
    ligne.style.top = `${(1 - k / 3) * 100}%`;
    ligne.append(document.createElement('span'));
    return ligne;
  });
  zoneDessin.replaceChildren(...lignes, barres);
  mettreAJourDessin();
}

function mettreAJourDessin() {
  const { echelle, jour, barres, source, bande } = dessin;
  const nombre = nombreJours();
  barres.forEach((barre, i) => {
    if (i >= nombre) return;
    const total = totalDuJour(i);
    barre.style.height = `${Math.min(100, (total / (echelle * 100)) * 100)}%`;
    barre.classList.toggle('vide', !total);
    TYPES.forEach((type, k) => {
      barre.children[k].style.height = total ? `${(dessin[type][i] / total) * 100}%` : '0';
    });
  });
  bande.hidden = !nombre;
  bande.style.left = `${(jour / source.jours.length) * 100}%`;
  zoneDessin.querySelectorAll('.ge-ligne span').forEach((etiquette, k) => {
    etiquette.textContent = dollars(Math.round(((3 - k) / 3) * echelle * 100));
  });
  const totaux = { standard: somme(dessin.standard), supplementaire: somme(dessin.supplementaire) };
  totaux.total = totaux.standard + totaux.supplementaire;
  for (const [cle, champ] of Object.entries(champsTotaux)) {
    champ.disabled = !nombre;
    if (document.activeElement !== champ) champ.value = enTexte(totaux[cle]);
  }
  $('#ge-jour-date').textContent = nombre ? formatJourAnnee.format(source.jours[jour].date) : '';
  $('#ge-jour-total').textContent = nombre ? dollars(totalDuJour(jour)) : '';
  for (const type of TYPES) {
    const champ = champsJour[type];
    champ.disabled = !nombre;
    if (document.activeElement !== champ) champ.value = nombre ? enTexte(dessin[type][jour]) : '';
  }
}

// Enregistre, ajuste la hauteur si besoin et met à jour tous les écrans concernés
function terminerDessin({ reechelonner = false } = {}) {
  dessin.source.enregistrer({ standard: dessin.standard.slice(), supplementaire: dessin.supplementaire.slice() });
  const maximum = Math.max(0, ...dessin.standard.map((_, i) => totalDuJour(i))) / 100;
  if (reechelonner || maximum > dessin.echelle * 0.85 || maximum < dessin.echelle * 0.3) dessin.echelle = echelleDessin();
  mettreAJourDessin();
  afficherStudio();
  if (ecranRecompenses.classList.contains('open')) {
    afficherEstimees();
    afficherPaiements();
  }
  if (dessin.source.video) signalerVideosModifiees();
}

// Position du doigt → jour et hauteur (en centimes)
function pointDessin(evenement) {
  const zone = $('.ge-barres', zoneDessin).getBoundingClientRect();
  const nombre = dessin.source.jours.length;
  const jour = Math.max(0, Math.min(nombre - 1, Math.floor(((evenement.clientX - zone.left) / zone.width) * nombre)));
  const hauteur = Math.max(0, Math.min(1, (zone.bottom - evenement.clientY) / zone.height));
  return { jour, montant: hauteur * dessin.echelle * 100 };
}

// Trait entre deux points : les jours sautés par un geste rapide sont remplis en ligne droite.
// Le doigt place le haut de la couleur choisie ; le supplémentaire est posé sur le standard.
function peindre(depart, arrivee) {
  const pas = Math.sign(arrivee.jour - depart.jour) || 1;
  for (let jour = depart.jour; jour !== arrivee.jour + pas; jour += pas) {
    if (jour >= nombreJours()) continue;
    const t = arrivee.jour === depart.jour ? 1 : (jour - depart.jour) / (arrivee.jour - depart.jour);
    const haut = Math.round(depart.montant + (arrivee.montant - depart.montant) * t);
    if (dessin.type === 'standard') dessin.standard[jour] = haut;
    else dessin.supplementaire[jour] = Math.max(0, haut - dessin.standard[jour]);
  }
  dessin.jour = Math.min(arrivee.jour, nombreJours() - 1);
  mettreAJourDessin();
}

let trace = null;
zoneDessin.addEventListener('pointerdown', (evenement) => {
  if (evenement.button || !nombreJours()) return;
  try {
    zoneDessin.setPointerCapture(evenement.pointerId); // le trait continue même si le doigt sort du graphique
  } catch {}
  trace = { x: evenement.clientX, y: evenement.clientY, bouge: false, dernier: null };
  // Un simple toucher choisit le jour (pour taper ses montants exacts)
  const point = pointDessin(evenement);
  if (point.jour < nombreJours()) {
    dessin.jour = point.jour;
    mettreAJourDessin();
  }
});
zoneDessin.addEventListener('pointermove', (evenement) => {
  if (!trace) return;
  if (!trace.bouge) {
    if (Math.hypot(evenement.clientX - trace.x, evenement.clientY - trace.y) < 4) return;
    trace.bouge = true;
    trace.dernier = pointDessin({ clientX: trace.x, clientY: trace.y });
    peindre(trace.dernier, trace.dernier);
  }
  const point = pointDessin(evenement);
  peindre(trace.dernier, point);
  trace.dernier = point;
});
for (const type of ['pointerup', 'pointercancel']) {
  zoneDessin.addEventListener(type, () => {
    if (trace?.bouge) terminerDessin();
    trace = null;
  });
}

$('#ge-types').addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('[data-type]');
  if (bouton) choisirType(bouton.dataset.type);
});

// Nouveau montant d'une couleur : elle grandit ou rétrécit en gardant sa forme
// (si elle est vide, elle prend la forme de l'autre couleur, sinon une forme régulière)
function changerTotal(type, centimes) {
  const forme = [dessin[type], dessin[autreType(type)]].find((valeurs) => somme(valeurs))
    ?? MODELES.regulier(nombreJours(), Math.random);
  dessin[type] = repartir(centimes, forme);
}

for (const type of TYPES) {
  champsTotaux[type].addEventListener('change', () => {
    if (!nombreJours()) return;
    changerTotal(type, enCentimes(champsTotaux[type].value));
    champsTotaux[type].blur();
    terminerDessin({ reechelonner: true });
  });
  champsJour[type].addEventListener('change', () => {
    if (!nombreJours()) return;
    dessin[type][dessin.jour] = enCentimes(champsJour[type].value);
    champsJour[type].blur();
    terminerDessin({ reechelonner: true });
  });
}

// Nouveau total : standard et supplémentaire gardent leur proportion
champsTotaux.total.addEventListener('change', () => {
  if (!nombreJours()) return;
  const total = enCentimes(champsTotaux.total.value);
  const standard = somme(dessin.standard);
  const supplementaire = somme(dessin.supplementaire);
  const part = standard + supplementaire ? supplementaire / (standard + supplementaire) : Number(dessin.type === 'supplementaire');
  const nouveauSupplementaire = Math.round(total * part);
  changerTotal('standard', total - nouveauSupplementaire);
  changerTotal('supplementaire', nouveauSupplementaire);
  champsTotaux.total.blur();
  terminerDessin({ reechelonner: true });
});

// Formes toutes prêtes pour la couleur choisie : elles gardent son total
const MODELES = {
  regulier: (n, r) => Array.from({ length: n }, () => 0.9 + r() * 0.2),
  hausse: (n, r) => Array.from({ length: n }, (_, i) => (0.25 + i / Math.max(1, n - 1)) * (0.9 + r() * 0.2)),
  baisse: (n, r) => Array.from({ length: n }, (_, i) => (1.25 - i / Math.max(1, n - 1)) * (0.9 + r() * 0.2)),
  viral: (n, r) => Array.from({ length: n }, (_, i) => (i === 0 ? 0.35 : Math.exp(-(i - 1) / 3)) * (0.85 + r() * 0.3) + 0.02),
  pic: (n, r) => {
    const sommet = Math.floor(n * (0.3 + r() * 0.4));
    return Array.from({ length: n }, (_, i) => Math.exp(-(((i - sommet) / Math.max(1.5, n / 10)) ** 2)) + 0.05 * r());
  },
  aleatoire: (n, r) => Array.from({ length: n }, () => 0.15 + r()),
  lisser: () => dessin[dessin.type].map((_, i, v) => (v[i - 1] ?? v[i]) + 2 * v[i] + (v[i + 1] ?? v[i])),
  copier: () => dessin[autreType(dessin.type)],
};

$('#ge-modeles').addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('[data-forme]');
  if (!bouton || !nombreJours()) return;
  const type = dessin.type;
  const forme = bouton.dataset.forme;
  if (forme === 'effacer') {
    dessin[type] = dessin[type].map(() => 0);
  } else {
    const total = somme(dessin[type]);
    if (!total) {
      afficherMessage(`Écris d'abord le montant ${NOMS[type].court} en haut (ex. 25), ou dessine directement au doigt.`);
      return;
    }
    const poids = MODELES[forme](nombreJours(), Math.random);
    if (!somme(poids)) {
      afficherMessage(`Le ${NOMS[autreType(type)].couleur} est vide : il n'y a pas de forme à copier.`);
      return;
    }
    dessin[type] = repartir(total, poids);
  }
  terminerDessin({ reechelonner: true });
});

$('#ge-precedent').addEventListener('click', () => ouvrirDessin(sourceMois(dessin.source.ecart + 1)));
$('#ge-suivant').addEventListener('click', () => ouvrirDessin(sourceMois(dessin.source.ecart - 1)));
$('#dessiner-mois').addEventListener('click', () => ouvrirDessin(sourceMois(0)));
$('#dessiner-video').addEventListener('click', () => ouvrirDessin(sourceVideo(videoEnDetails)));

// En revenant, les formulaires affichent les nouveaux totaux
ecranDessin.addEventListener('fermeture', () => {
  remplirFormulaireRecompenses();
  const video = dessin.source?.video;
  if (video && video === videoEnDetails) {
    formulaireDetails.elements.recStandard.value = video.recStandard;
    formulaireDetails.elements.recSupplementaire.value = video.recSupplementaire;
  }
});
