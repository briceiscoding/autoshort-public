# charte.md : direction artistique des shorts (style neutre par défaut, à adapter à ta marque)

Cette charte décrit le style NEUTRE livré avec AutoShort (textes blancs en Montserrat ExtraBold, aucun son, aucune couleur d'accent). Remplace couleurs, polices, sons et règles par les tiens pour qu'ils correspondent à ta marque. Claude la lit pour proposer chaque montage, et `theme/theme.json` contient les valeurs utilisées au rendu.

Cette charte est FIXE. Elle s'applique à chaque vidéo, sans exception, sauf si je demande explicitement autre chose pour une vidéo précise.
Toutes les valeurs en pixels sont données pour un canvas 1080 x 1920.

## 1. Format vidéo

- Ratio : 9:16
- Résolution : 1080 x 1920
- FPS : 30 (garder 60 si le rush est en 60)
- Codec : H.264, CRF 18, preset veryfast, pixel format yuv420p
- Audio : AAC 48 kHz, 192 kbps

## 2. Couleurs et polices (style neutre par défaut, à remplacer par les tiens)

| Rôle | Valeur |
|------|--------|
| Texte (sous-titres, mots mis en avant, concepts, schémas) | blanc `#FFFFFF` |
| Accent | aucun par défaut (blanc) : choisis ta couleur de marque |
| Fond schéma | `#1A1A1D` |
| Quadrillage schéma | `#FFFFFF` à 6 % d'opacité |
| Vert succès (uniquement les checks de validation dans les schémas) | `#22C55E` |
| Police de tous les textes | Montserrat ExtraBold |

Une seule police et pas de couleur d'accent tant que tu n'as pas défini les tiennes.

## 3. Zones de sécurité (interfaces TikTok, YouTube Shorts, Instagram Reels)

On prend la zone la plus prudente des trois plateformes pour qu'un seul export marche partout.

| Bord   | Marge minimale | Ce qui est recouvert |
|--------|----------------|----------------------|
| Haut   | 220 px | Pseudo, bouton suivre, onglets |
| Bas    | 480 px | Description, son, pseudo, bouton s'abonner |
| Droite | 150 px | Colonne like / commentaire / partage |
| Gauche | 90 px  | Marge de bord |

Zone utile : x de 90 à 930, y de 220 à 1440.
AUCUN texte, sous-titre, logo ou élément important hors de cette zone.

Repères de cadrage habituels (à vérifier sur chaque rush) : yeux vers y = 700, bouche entre y = 850 et y = 1100.

## 4. Ordre des calques (du fond vers l'avant)

1. Vidéo (rush)
2. Asset incrusté derrière la tête (mode `bg`)
3. Moi détouré (uniquement pendant un asset `bg`)
4. Plan de coupe plein écran : schéma animé, asset `full` ou `screen`
5. Logo (mode `logo`)
6. Mot concept
7. Sous-titres (toujours au-dessus de tout)
8. Overlay abonnement YouTube

Règle de calme : un seul élément "événement" à la fois parmi les calques 2, 4, 5 et 6. Jamais un logo et un mot concept en même temps, jamais un asset `bg` pendant un schéma.

## 5. Sous-titres (présents partout, y compris pendant les schémas et plans de coupe, sauf pendant un mot concept)

### Typographie
- Montserrat ExtraBold, 66 px (identique sur toute la vidéo ; un bloc trop long est réduit pour tenir sur sa ligne)
- Texte blanc, SANS contour et SANS ombre
- Casse normale, interligne 120 %

### Placement
- Centré horizontalement, largeur maximale du bloc 780 px
- Centre vertical autour de y = 1300, bas du bloc à y = 1420 maximum
- Ne couvre jamais la bouche. Si mon visage est plus bas que d'habitude sur un rush, signale-le au lieu de sortir de la zone de sécurité.

### Découpage
- 1 à 3 mots par bloc, UNE seule ligne, 18 caractères maximum (un mot long peut être seul dans son bloc)
- Un bloc reste au moins 0,4 s
- Coupe sur des groupes de sens (jamais un article seul en fin de bloc)
- Les mots sont exactement les miens (orthographe et termes techniques corrigés)

### Animation : pop des mots
- Chaque mot apparaît au moment exact où je le prononce
- Pop : scale 70 % > 110 % > 100 %, opacité 0 > 100 %, 150 ms, ease-out
- Le bloc disparaît d'un coup à la fin

### Mots mis en avant : effet loupe
- Par défaut sans fond ni couleur : texte blanc, sans contour et sans ombre (ajoute un fond ou une couleur de marque dans l'onglet Styles)
- Même police, même taille et même casse que le reste du sous-titre, jamais de majuscules forcées
- Effet loupe (blob) au moment où je prononce le mot : le mot et son fond gonflent en scale fluide 85 % > 130 % en 160 ms, puis reviennent à 100 % en 260 ms, ease-in-out, sans rebond sec. Le mot pousse ses voisins sans faire changer les lignes
- Mots visés : chiffres, noms d'outils, mot qui porte le sens, mots de contraste
- 1 mot par bloc maximum, jamais deux blocs consécutifs

## 6. Mots concepts

Rôle : faire ressortir les 2 à 5 idées clés de la vidéo, pas l'emphase d'une phrase (ça, c'est le mot mis en avant des sous-titres).

- Police : Montserrat ExtraBold, toujours en MAJUSCULES, 140 px jusqu'à 12 caractères, 90 px au-delà, 2 lignes maximum
- Couleur : blanc `#FFFFFF`, AUCUN fond, ombre noire 50 %, décalage 0 / 6 px, flou 14 px pour rester lisible sur l'image
- Contenu : 1 à 3 mots, le concept tel que je le dis ou sa forme courte ("Agents IA", "Gratuit", "Open source")
- Position : centré horizontalement, centre vertical vers y = 420 (au-dessus de la tête, dans la zone de sécurité). Si ma tête monte dans cette zone sur le rush, signale-le.
- Animation : effet machine à écrire, une lettre toutes les 45 ms, curseur fin blanc qui clignote pendant la frappe puis disparaît 200 ms après la dernière lettre
- Durée à l'écran : de l'apparition jusqu'à la fin des mots qu'il remplace (4 s maximum)
- Les sous-titres sont masqués pendant le concept pour ne pas faire doublon. Ils reviennent au début du fondu de sortie. Le premier mot du concept ouvre un nouveau bloc de sous-titres, et les mots masqués restent dans le `.srt`.
- Sortie : fondu 150 ms
- SFX (seulement si un son est choisi pour ce moment dans le Brand kit) : calé sur la frappe, coupé avec un fondu de 50 ms à la dernière lettre
- Fréquence : 1 concept toutes les 8 secondes maximum
- Un mot affiché en concept n'est PAS en plus mis en avant dans le sous-titre au même moment

## 7. Schémas animés (style dessiné)

Plan de coupe plein écran, ma voix continue, les sous-titres restent affichés.

### Fond
- Couleur `#1A1A1D`
- Quadrillage léger : carrés de 120 px, traits 2 px en pointillés, blanc à 6 %
- Le quadrillage apparaît en fondu 150 ms à l'ouverture du schéma

### Style du dessin
- Rendu dessiné à la main : traits légèrement irréguliers (style rough.js, roughness 1,2 à 1,6), jamais de formes vectorielles parfaites
- Traits blancs, épaisseur 7 px, bouts ronds
- Formes en "sticker" : remplissage blanc ou `#1A1A1D`, avec une ombre décalée pleine de la couleur d'accent (décalage 10 px vers le bas et la droite)
- Icônes : style trait simple (base Lucide), redessinées dans le même style
- Couleur d'accent (blanche par défaut) réservée à : l'élément clé du schéma et ses mots clés, les flèches / liaisons importantes, les ombres sticker, les points d'attention (point d'exclamation)
- Validation ou résultat réussi : gros check dessiné vert `#22C55E`, jamais d'étoile
- Textes dans le schéma : Montserrat ExtraBold, en MAJUSCULES, blancs, 60 à 72 px
- Effet "boil" (bloblob) sur TOUS les éléments, textes compris : le tracé change de graine toutes les 4 frames une fois dessiné, et tout le schéma ondule légèrement (déplacement SVG), pour un rendu vivant

### Animation
- Chaque trait se dessine (stroke-dashoffset), du début à la fin du trait, vitesse environ 1 200 px/s
- Ordre de dessin : contour du cadre principal > éléments un par un > liaisons > éléments d'accent en dernier
- Chaque élément apparaît au moment où j'en parle (timestamps de `transcript.json`), pas tous d'un coup
- Remplissages et ombres sticker : apparaissent en 120 ms juste après la fin du contour
- Sortie du schéma : cut sec vers la vidéo

### Contraintes
- Tout le schéma dans la zone de sécurité, et au-dessus de y = 1150 pour laisser la place aux sous-titres
- 6 éléments maximum par schéma, 3 mots maximum par étiquette
- Durée : 3 à 8 secondes

### SFX du schéma (seulement si des sons sont choisis dans le Brand kit)
- Ouverture du schéma : un son d'ouverture
- Chaque élément qui apparaît : un son court et discret
- Jamais plus de 2 sons qui se chevauchent

## 8. Assets de la vidéo (`projects/<slug>/assets/`)

Le mode d'affichage est donné par le préfixe du nom du fichier : `<mode>__<mot-déclencheur>.ext`.

### `bg` : incrusté derrière la tête
- Je suis détouré et placé au premier plan, l'asset est entre le décor et moi
- Asset dans une carte : coins arrondis 24 px, ombre noire 35 %, flou 40 px
- Largeur 900 px max, centré horizontalement, centre vertical vers y = 650 (derrière la tête et les épaules)
- Entrée : glissement depuis 40 px plus bas + fondu, 250 ms, ease-out
- Sortie : fondu 200 ms

### `screen` : capture devant moi
- Plan de coupe : la vidéo floutée (flou 30 px, assombrie à 50 %) en fond, la capture par-dessus dans une carte (coins 24 px, ombre)
- Largeur 900 px max, au-dessus de y = 1150
- Entrée : scale 90 % > 100 % + fondu, 200 ms

### `logo`
- Hauteur 180 px, centré horizontalement, centre vers y = 420
- Pop : scale 0 > 115 % > 100 %, 250 ms
- Durée : 1,5 à 2,5 s, sortie fondu 150 ms

### `full`
- Image ou vidéo en plein cadre, recadrée en 9:16 sans déformation (cover)
- Cut sec à l'entrée et à la sortie
- Si les sous-titres se lisent mal sur l'image (fond clair, rouge ou chargé), voile noir à 40 % sur l'asset, jamais de contour ni d'ombre sur le texte

Si un logo ou une image a un fond qui ne va pas (fond blanc sur un logo, par exemple), détoure-le automatiquement. Ne modifie jamais le fichier d'origine, travaille sur une copie (`data/cache/`).

## 9. Rythme et rétention

- 2 premières secondes : zéro temps mort, sous-titres dès la première frame de parole
- Zoom punch-in : 112 % instantané sur une phrase clé, retour à 100 % à la coupe suivante
- Alterner plan normal / plan zoomé toutes les 2 à 4 coupes
- Il se passe quelque chose à l'écran au moins toutes les 3 secondes
- Cuts secs, aucune transition, aucun fondu au début, aucun filtre couleur

## 10. Audio

- Voix normalisée à -12 LUFS intégré, true peak -1 dBTP
- Musique : un fichier audio ajouté aux assets de la vidéo, environ 20 dB sous la voix, ducking pendant la parole, fondu de sortie 0,5 s
- SFX : aucun par défaut ; uniquement les sons importés dans `library/sfx/` (Brand kit), environ 10 dB sous la voix, jamais par-dessus un mot important au point de le masquer
- Hors schémas et mots concepts : 1 SFX toutes les 3 s maximum en moyenne
- Pas de SFX pendant les 0,3 premières secondes

## 11. Branding

### Rappel abonnement YouTube
- Fichier : `library/brand/subscribe.mp4` (à fournir : ta propre animation d'abonnement sur fond vert ; sans ce fichier, aucun rappel n'est affiché)
- Affiché UNIQUEMENT si je dis une phrase d'appel à l'abonnement ("abonne-toi", "abonnez-vous", "rejoins la chaîne", "clique sur s'abonner", "pense à t'abonner", "suivez-moi"...)
- Démarre au premier mot de cette phrase, reste dans la zone de sécurité, ne recouvre pas les sous-titres
- Affiché en petit : fond vert détouré, réduit à 33 %, en haut et centré (haut de l'icône vers y = 225), sans couvrir les yeux. Il s'arrête au plus tard à la fin de la vidéo.
- Aucune phrase de ce type : aucun template

### Réseaux sociaux
- Si je parle de mes réseaux : rien à afficher pour l'instant

## 12. Interdits

- Pas d'emojis
- Pas d'animation générique (glitch, arc-en-ciel, texte qui tourne)
- Pas de formes vectorielles parfaites dans les schémas
- Pas d'autre couleur ni d'autre police que celles définies dans cette charte (style neutre : blanc et Montserrat ExtraBold ; seule exception : le vert des checks de schéma)
