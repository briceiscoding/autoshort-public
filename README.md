# AutoShort

Éditeur local de shorts face cam (9:16) : tu déposes ta vidéo, l'app écrit les sous-titres, ajoute des zooms, place
tes images sur le bon mot, et exporte un MP4 prêt pour TikTok, YouTube Shorts et Reels. Tout tourne sur ton
ordinateur : ta vidéo ne part sur aucun serveur.

📄 **Pas développeur ?** Suis le [guide de démarrage en PDF](Guide-de-demarrage.pdf) (2 pages) : installation pas à pas
sur Windows et Mac, premier short, personnalisation et connexion à Claude.

## Ce qu'il te faut

- **Windows avec une carte graphique NVIDIA** (CUDA), ou un **Mac Apple Silicon** (M1 et plus, l'import est plus lent).
  Un PC sans carte NVIDIA ne peut pas transcrire.
- Environ 10 Go libres (les modèles d'IA sont téléchargés une seule fois au premier lancement).
- [Node.js 22](https://nodejs.org), [uv](https://docs.astral.sh/uv/getting-started/installation/) et
  [ffmpeg](https://ffmpeg.org/download.html) installés et accessibles dans le terminal.
- Optionnel : [Claude Code](https://claude.com/claude-code) pour la proposition de montage et les retours à Claude,
  avec un abonnement Claude Pro ou Max (ou une clé API Anthropic, facturée à l'usage). Le plan gratuit n'inclut pas
  Claude Code. Sans Claude, tout le reste fonctionne.

## Installation

1. Télécharge le repo (bouton **Code → Download ZIP**, puis décompresse) ou clone-le :
   `git clone https://github.com/briceiscoding/autoshort-public.git`
2. **Windows** : double-clique sur `start.bat`. **macOS** : `brew install node uv ffmpeg`, puis double-clique sur
   `launcher/AutoShort.command` (si macOS refuse : clic droit → Ouvrir).
3. Le premier lancement installe tout ce qui manque (plusieurs minutes, quelques Go), puis l'app s'ouvre dans sa
   propre fenêtre. Les lancements suivants prennent quelques secondes.

Pour Claude : bouton **Settings** sur l'accueil. Colle le jeton donné par `claude setup-token` (abonnement) ou une
clé API, ou laisse vide si tu t'es déjà connecté avec `claude` dans un terminal. Le bouton **Test the connection**
vérifie que tout marche. Fermer la fenêtre arrête l'app. Au premier lancement, une icône **AutoShort** apparaît sur ton bureau (et dans le
menu Démarrer sur Windows) : c'est elle que tu utilises ensuite. Sur Mac, autorise Terminal à contrôler le Finder si
macOS le demande.

## Ton premier short

1. **New short** sur l'accueil, puis dépose ta vidéo et tes images.
   Nomme une image `<mode>__<mot>.png` pour qu'elle apparaisse quand tu prononces ce mot :
   `logo__docker.png`, `screen__dashboard.png`, `full__resultat.jpg`, `bg__serveur.jpg` (derrière ta tête).
2. **Launch the video** : choisis si ta vidéo est déjà montée (rien n'est coupé) ou brute (silences, « euh » et
   répétitions coupés). Transcription, sous-titres et zooms sont faits automatiquement.
3. Optionnel : **Plan proposal (Claude)** propose des mots concepts, des schémas animés et place tes images. Dans
   l'onglet **Claude**, écris un retour (« moins de concepts », « un schéma sur les 3 étapes »…) : Claude révise le
   montage, et tu acceptes le brouillon en gardant ou non la version précédente dans l'historique.
4. Retouche : texte des sous-titres (Transcript), timeline (glisse la tête de lecture), Inspector, onglet **Styles**
   (polices, couleurs, contours). Dans l'aperçu, déplace, redimensionne (coin ou molette) et fais pivoter images,
   logos et rappel d'abonnement ; choisis leur entrée (pop, depuis un bord) dans l'Inspector. Suppr efface la sélection.
5. **Export the video** : le MP4 et ses sous-titres `.srt`, dans le projet et dans le dossier de ton choix.

## Personnaliser

AutoShort est livré avec un style **neutre** : tous les textes en Montserrat ExtraBold, en blanc, sans couleur d'accent,
**sans aucun son** et sans animation d'abonnement. L'app marche telle quelle, mais pour profiter de tous les effets,
importe tes sons et ton animation d'abonnement (page **Brand kit** de l'accueil), puis règle tes polices, couleurs et
style du mot CTA (onglet **Styles**, « Save as default for all videos »).

- `library/charte.md` : les règles de montage du style neutre (couleurs, polices, rythme). Adapte-le à ta marque :
  Claude le lit pour proposer chaque montage.
- `theme/theme.json` : les valeurs utilisées au rendu (aussi modifiables depuis l'onglet Styles).
- `library/` : tes polices, tes effets sonores et ton overlay d'abonnement (vides par défaut, sauf Montserrat ExtraBold),
  voir `library/README.md`.
- `theme/vocabulary.json` : les mots que la transcription écrit mal dans tes vidéos.

## Confidentialité

L'app ne collecte rien et n'envoie rien. Seule la proposition Claude (optionnelle) envoie la transcription de ta
vidéo à Claude, via ton propre compte Claude Code.

## Licences et crédits

- Code : [MIT](LICENSE).
- `ai/rvm/` : [Robust Video Matting](https://github.com/PeterL1n/RobustVideoMatting), GPL-3.0 (licence dans le
  dossier), utilisé pour le détourage derrière la tête.
- Rendu : [Remotion](https://www.remotion.dev), gratuit pour les particuliers et les petites équipes ; une entreprise de
  plus de 3 personnes doit prendre une [licence Remotion](https://www.remotion.dev/license).
- Transcription : WhisperX et Silero VAD. Police : Montserrat (SIL Open Font License). Icônes : Lucide (ISC) et Simple Icons (CC0).

Fourni tel quel, sans garantie ni support. Fait par [@briceiscoding](https://youtube.com/@briceiscoding) :
[YouTube](https://youtube.com/@briceiscoding) · [TikTok](https://tiktok.com/@briceiscoding) ·
[Instagram](https://instagram.com/briceiscoding).

## Développement

```
cd app
npm test               # vitest
npm run gen:schema     # régénère schema/*.json depuis le modèle zod
cd ../server
.venv/Scripts/python -m pytest -q     # macOS : .venv/bin/python -m pytest -q
```

Architecture : `docs/ARCHITECTURE.md`. Ports et chemins : `config.json` (surcharge locale dans `config.local.json`).
Le contrôle de types complet (`npm run typecheck`) demande un premier export, qui génère
`app/src/composition/custom/registry.generated.ts`.
