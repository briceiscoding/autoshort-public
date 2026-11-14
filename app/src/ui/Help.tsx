// Help: a guide to every feature of the app, in French like the README and the PDF guide. Each section has an id so a
// "?" link elsewhere in the app can open it directly (#/~help/<id>). The search box filters sections by their text.
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ColorModeToggle} from './colorMode';
import {Icon} from './icons';
import {HomeFooter} from './links';

type Section = {id: string; title: string; body: React.ReactNode};

const K: React.FC<{children: React.ReactNode}> = ({children}) => <kbd>{children}</kbd>;
const B: React.FC<{children: React.ReactNode}> = ({children}) => <strong>{children}</strong>;

export const HELP_SECTIONS: Section[] = [
	{
		id: 'demarrer',
		title: "Démarrer : l'accueil",
		body: (
			<>
				<p>
					L'accueil liste tes shorts. <B>New short</B> en crée un : donne-lui un nom, puis tu arrives dans sa page. Survole un short et clique sur la
					corbeille pour le supprimer (il part dans la corbeille de l'ordinateur, tu peux le récupérer).
				</p>
				<ul>
					<li><B>Brand kit</B> : ce que tous tes shorts partagent (rappel d'abonnement, sons, polices). AutoShort est livré sans sons ni animation d'abonnement : importe les tiens ici pour profiter de tous les effets.</li>
					<li><B>Settings</B> : la connexion à Claude (optionnelle).</li>
					<li>La lune / le soleil en haut à droite : thème sombre ou clair.</li>
				</ul>
			</>
		),
	},
	{
		id: 'importer',
		title: 'Ajouter ta vidéo et lancer le montage',
		body: (
			<>
				<ol>
					<li>Dépose <B>la vidéo que tu as filmée</B> (mp4, mov, mkv). L'app en garde une copie, ton original n'est jamais modifié.</li>
					<li>
						Dépose tes <B>images, vidéos et musiques</B> (optionnel, tu pourras en ajouter plus tard). Un fichier nommé <code>mode__mot</code> est placé tout
						seul quand tu dis ce mot : voir <a href="#/~help/images">Images et vidéos</a>.
					</li>
					<li>
						<B>Launch the video</B>. Choisis si ta vidéo est <B>déjà montée</B> (rien n'est coupé) ou <B>brute</B> (silences, « euh » et répétitions coupés).
						L'app transcrit, fait les sous-titres, les zooms et un premier montage.
					</li>
				</ol>
				<p className="muted">Le champ « Vocabulary hint » aide la transcription à écrire les noms propres et le jargon (Claude, Next.js…).</p>
			</>
		),
	},
	{
		id: 'apercu',
		title: "L'aperçu : déplacer, agrandir, faire pivoter",
		body: (
			<>
				<p>
					Sélectionne un élément (sur la timeline ou dans l'aperçu) : un <B>cadre bleu</B> l'entoure dans l'aperçu quand il est à l'écran.
				</p>
				<ul>
					<li><B>Glisse le cadre</B> pour le déplacer. Il s'aimante aux lignes du centre (ligne rose).</li>
					<li><B>Le carré bleu dans le coin</B> ou <B>la molette de la souris</B> au-dessus du cadre l'agrandit ou le réduit.</li>
					<li><B>La poignée ronde</B> au-dessus du cadre le fait pivoter. Elle s'aimante aux angles droits ; avec <K>Maj</K>, par crans de 15°.</li>
				</ul>
				<p>
					Ça marche pour les images et vidéos, les logos, le rappel d'abonnement, les concepts, et pour la position des sous-titres (onglet Styles).
				</p>
				<p>
					Au-dessus de l'aperçu : <B>Safe zone</B> montre les zones cachées par l'interface de TikTok / Reels, <B>Face box</B> le visage détecté,{' '}
					<B>Mute</B> coupe le son. Si l'aperçu s'arrête sur une erreur : <B>Reload the preview</B>, ton montage n'est pas touché.
				</p>
			</>
		),
	},
	{
		id: 'timeline',
		title: 'La timeline',
		body: (
			<>
				<ul>
					<li>
						<B>Se déplacer dans le temps</B> : glisse la poignée rose de la tête de lecture, ou clique et glisse sur la règle (ligne « Time ») ou sur le fond
						d'une piste. Boutons <B>début</B> / <B>lecture</B> / <B>fin</B> à gauche, curseur <B>Zoom</B> pour voir plus ou moins de détail.
					</li>
					<li><B>Déplacer un élément</B> : glisse sa barre. <B>Changer sa durée</B> : glisse son bord gauche ou droit.</li>
					<li><B>Sélectionner</B> : clique sur une barre, ses réglages s'ouvrent dans l'Inspector (à droite).</li>
					<li>Les petits traits <B>rouges</B> sur « Segments » sont des coupes : clique dessus pour les voir ou les annuler.</li>
					<li>Sur la piste <B>SFX</B> : les sons gris sont automatiques, les bleus ajoutés à la main (glisse-les pour les déplacer).</li>
				</ul>
			</>
		),
	},
	{
		id: 'soustitres',
		title: 'Sous-titres et transcription',
		body: (
			<>
				<p>Onglet <B>Transcript</B> : le texte de ta vidéo, mot par mot.</p>
				<ul>
					<li>
						<B>Clique sur un mot</B> pour corriger son texte (corrige, n'invente pas), le <B>mettre en surbrillance</B> (style « highlight »), ou commencer un
						nouveau bloc de sous-titres à ce mot.
					</li>
					<li>
						<K>Maj</K> + clic sélectionne une suite de mots : <B>Cut selection</B> la coupe, <B>Restore selection</B> la remet, <B>Make concept</B> en fait un
						mot-clé à l'écran.
					</li>
					<li>
						<B>Mot du CTA</B> (le mot à commenter, ex. « MONTAGE ») : clique dessus puis coche <B>CTA word</B>. Il prend son propre style
						(Styles → <B>CTA word</B>) : majuscules, couleur, contour, fond et guillemets « » ou “ ”. Corrige son texte si la transcription l'a mal écrit.
					</li>
					<li><B>Re-split captions</B> redécoupe tous les blocs selon les réglages de longueur.</li>
					<li>Les mots soulignés en pointillés sont mal entendus par la transcription : réécoute-les.</li>
				</ul>
				<p>
					L'onglet <B>Checks</B> liste les conseils (sous-titres trop longs, mots douteux, éléments qui se chevauchent…). Clique sur un conseil pour y aller.
					Ce ne sont que des conseils : rien n'empêche d'exporter.
				</p>
			</>
		),
	},
	{
		id: 'styles',
		title: 'Polices, couleurs et styles du texte',
		body: (
			<>
				<p>
					Onglet <B>Styles</B>, puis choisis quoi régler : <B>Captions</B> (sous-titres), <B>Highlighted words</B>, <B>Concepts</B>, <B>Screen pictures</B>,{' '}
					<B>Behind-head pictures</B>.
				</p>
				<ul>
					<li>
						<B>Ajouter une police</B> : tape le nom d'une famille Google Fonts (ex. Bebas Neue) puis <B>Import</B>, ou <B>Add a font file</B> pour un fichier{' '}
						<code>.ttf</code> / <code>.otf</code>. Elle est ensuite disponible dans tous tes shorts.
					</li>
					<li>Taille, gras, italique, majuscules, couleur, espacement, interligne, <B>contour</B>, <B>ombre</B>, <B>fond</B> (boîte derrière le texte).</li>
					<li>Position : glisse le texte dans l'aperçu, ou règle les valeurs en bas.</li>
					<li>
						Tes réglages valent pour ce short. <B>Save as default for all videos</B> en fait le style de tous tes futurs shorts.
					</li>
				</ul>
				<p>
					Style par défaut, volontairement neutre : tous les textes en <B>Montserrat ExtraBold</B>, en blanc, sans couleur d'accent. Mets tes polices, tes
					couleurs, tes fonds et tes contours pour que tes shorts aient ta marque.
				</p>
				<p className="muted">Vérifie la licence d'une police avant de publier (les Google Fonts sont libres).</p>
			</>
		),
	},
	{
		id: 'images',
		title: 'Images et vidéos (b-rolls)',
		body: (
			<>
				<p>
					Onglet <B>Catalog</B> : dépose tes fichiers, puis place-les <B>à la tête de lecture</B> avec un bouton. Trois façons de les montrer :
				</p>
				<ul>
					<li><B>screen</B> : une carte qui flotte sur ta vidéo floutée (idéal pour une capture ou une image paysage).</li>
					<li><B>full</B> : plein écran (pour une image ou vidéo verticale 9:16).</li>
					<li><B>bg</B> : derrière ta tête, tu restes devant (l'app te détoure ; lance « Prepare media » dans Jobs si besoin).</li>
				</ul>
				<p>
					<B>Placement automatique</B> : nomme un fichier <code>mode__mot</code> pour qu'il apparaisse quand tu dis ce mot : <code>screen__dashboard.png</code>,{' '}
					<code>full__resultat.mp4</code>, <code>bg__serveur.jpg</code>, <code>logo__docker.png</code>.
				</p>
				<p>Sélectionne-la, puis dans l'Inspector :</p>
				<ul>
					<li><B>Entrance</B> : comment elle arrive (pop, ou depuis le haut, le bas, la gauche, la droite).</li>
					<li><B>Shake</B> (tremblement), <B>Rotation</B>, <B>Dark veil</B> (voile sombre), <B>Zoom</B> en plein écran.</li>
					<li>Pour une vidéo : <B>Skip first seconds</B> pour sauter son début.</li>
					<li><B>Frame</B> : coins arrondis, bordure et ombre de cette image.</li>
					<li><B>Sound on entry</B> : le son de son apparition (celui choisi dans le Brand kit).</li>
				</ul>
				<p>Déplace, agrandis et fais pivoter dans l'aperçu (voir <a href="#/~help/apercu">L'aperçu</a>). <K>Suppr</K> la retire.</p>
			</>
		),
	},
	{
		id: 'logos',
		title: 'Logos',
		body: (
			<>
				<p>
					Dans le <B>Catalog</B>, bouton <B>logo</B> sur une image : un logo qui « pop » à la tête de lecture (ou nomme le fichier <code>logo__mot.png</code>).
				</p>
				<ul>
					<li>Taille, position, <B>rotation</B>, <B>entrée</B> (pop ou depuis un bord) et <B>tremblement</B> dans l'Inspector.</li>
					<li><B>Background removal</B> : retire le fond d'un logo (luma key pour un logo blanc sur noir, rembg pour le reste).</li>
				</ul>
			</>
		),
	},
	{
		id: 'concepts',
		title: "Concepts (mots-clés à l'écran)",
		body: (
			<>
				<p>Un concept est un mot ou une courte phrase en grand, pour marquer une idée forte.</p>
				<ul>
					<li>Clique sur un mot (Transcript) puis <B>Make it a concept</B>, ou sélectionne plusieurs mots avec <K>Maj</K> puis <B>Make concept</B>.</li>
					<li>Ou <B>+ Concept</B> dans le Catalog, à la tête de lecture.</li>
					<li>Change son texte, sa durée et son look dans l'Inspector ; son style par défaut se règle dans Styles → Concepts.</li>
					<li>« Hide captions during concepts » (Inspector sans sélection) masque les sous-titres pendant un concept.</li>
				</ul>
			</>
		),
	},
	{
		id: 'schemas',
		title: 'Schémas animés',
		body: (
			<>
				<p>
					Dans le <B>Catalog</B>, « Diagram at playhead » : choisis un modèle (arbre, hub, balance, interdit, étapes, comparaison). Il se dessine à la main,
					élément par élément.
				</p>
				<ul>
					<li>Sélectionne-le : chaque <B>élément</B> a un texte, une icône (nom Lucide, ex. <code>database</code>), une image, et les options accent / barré / coché.</li>
					<li><B>Entrée</B> dans le texte d'un élément crée une nouvelle ligne. Un texte trop long rétrécit tout seul pour rester dans l'écran.</li>
					<li><B>+ Element at playhead</B> ajoute un élément qui apparaît à cet instant ; les flèches ↑ ↓ changent l'ordre.</li>
					<li>Un son à l'ouverture et un par élément, si tu les as choisis dans le Brand kit : décoche <B>Sounds</B> pour les retirer de ce schéma.</li>
				</ul>
			</>
		),
	},
	{
		id: 'sons',
		title: 'Effets sonores (SFX)',
		body: (
			<>
				<ul>
					<li>
						<B>Sons automatiques</B> : un son par moment (image qui apparaît, logo, zoom, mot tapé, schéma…). AutoShort est livré <B>sans aucun son</B> :
						importe les tiens dans le <a href="#/~brand-kit">Brand kit</a> (des liens vers des sons gratuits y sont donnés). Un moment sans son reste
						silencieux.
					</li>
					<li><B>Ajouter un son à un instant précis</B> : Catalog → SFX, bouton ▶ pour écouter, <B>add</B> pour le poser à la tête de lecture.</li>
					<li>Sur la piste SFX, glisse un son bleu pour le déplacer ; sélectionne-le pour régler son volume (Gain) ou le supprimer.</li>
					<li>Pour enlever le son d'un seul élément : décoche « Sound on entry » (ou « Sounds » pour un schéma) dans son Inspector.</li>
				</ul>
				<p className="muted">Un son sans durée réglée joue au plus 6 secondes.</p>
			</>
		),
	},
	{
		id: 'musique',
		title: 'Musique',
		body: (
			<>
				<p>
					Dépose un fichier audio dans le <B>Catalog</B>, puis bouton <B>music</B>. Sélectionne la piste <B>Music</B> de la timeline pour régler de combien de
					décibels elle reste sous ta voix. Le mixage exact (la musique baisse quand tu parles) est fait à l'export ; l'aperçu la joue doucement.
				</p>
			</>
		),
	},
	{
		id: 'cta',
		title: "Rappel d'abonnement (CTA)",
		body: (
			<>
				<p>
					Une petite animation « abonne-toi » apparaît quand tu dis une phrase d'appel à l'action (« abonne-toi », « suis-moi »…) et reste jusqu'à la fin.
					AutoShort n'en fournit pas : importe la tienne dans le <a href="#/~brand-kit">Brand kit</a>, sans elle aucun rappel n'est affiché.
				</p>
				<ul>
					<li>Pas détecté ? Inspector sans sélection : <B>Add subscribe overlay at playhead</B>.</li>
					<li>Sélectionne la barre « subscribe » (piste Overlay) : déplace, agrandis et fais pivoter dans l'aperçu, choisis son entrée et son tremblement.</li>
					<li>
						<B>Ton animation</B> : dans le <a href="#/~brand-kit">Brand kit</a>, importe une vidéo sur fond vert (le vert est retiré à l'export).
					</li>
					<li><K>Suppr</K> le retire de ce short.</li>
				</ul>
			</>
		),
	},
	{
		id: 'coupes',
		title: 'Coupes, segments et zooms',
		body: (
			<>
				<ul>
					<li>La piste <B>Segments</B> montre les morceaux gardés de ta vidéo ; un « Z » signale un zoom.</li>
					<li>
						Sélectionne un segment : <B>Zoom punch-in</B> (zoom avant), son du zoom, bords à déplacer mot par mot, <B>Split at playhead</B> (le couper en deux
						pour zoomer une partie), <B>Cut this segment</B>.
					</li>
					<li>Une vidéo déjà montée n'est jamais coupée ; si elle l'a été, <B>Restore all cuts</B> remet tout.</li>
				</ul>
			</>
		),
	},
	{
		id: 'claude',
		title: 'Claude : proposition de montage et retours',
		body: (
			<>
				<p>
					Optionnel. Claude Code propose un montage (concepts, schémas, images placées) et le révise d'après tes retours. Il faut un abonnement Claude Pro ou
					Max, ou une clé API Anthropic.
				</p>
				<ol>
					<li>
						<B>Connexion</B> : dans <a href="#/~settings">Settings</a>, colle le jeton donné par <code>claude setup-token</code>, puis{' '}
						<B>Test the connection</B>.
					</li>
					<li><B>Première proposition</B> : onglet Jobs, <B>Plan proposal (Claude)</B>.</li>
					<li>
						<B>Retours</B> : onglet <B>Claude</B>, écris ce que tu veux changer (« moins de concepts », « un schéma sur les 3 étapes »…), puis{' '}
						<B>Revise with this feedback</B> (<K>Ctrl</K> + <K>Entrée</K>).
					</li>
					<li>
						Le résultat arrive en <B>brouillon</B> en haut : <B>Accept the draft</B> ou <B>Discard</B>. Coche « Keep the current version in History » pour
						pouvoir revenir en arrière.
					</li>
				</ol>
				<p>
					Claude garde ce que tu as réglé à la main (position, rotation, cadre…). Pour lui donner tes règles : <code>library/charte.md</code> (tous les
					shorts) et un <code>notes.md</code> parmi les fichiers d'un short (ce short).
				</p>
			</>
		),
	},
	{
		id: 'historique',
		title: 'Annuler et historique',
		body: (
			<>
				<p>
					Tout s'enregistre tout seul. <K>Ctrl</K> + <K>Z</K> annule, <K>Ctrl</K> + <K>Y</K> rétablit. L'onglet <B>History</B> garde des versions de ton
					montage (au plus une par minute, avant un export et avant un brouillon de Claude) : <B>Restore</B> en remet une, <B>Snapshot now</B> en crée une.
				</p>
			</>
		),
	},
	{
		id: 'export',
		title: 'Exporter la vidéo',
		body: (
			<>
				<p>
					Bouton <B>Export</B> en haut (ou onglet Jobs) puis <B>Export the video</B>. Tu obtiens un MP4 et ses sous-titres <code>.srt</code> dans le dossier{' '}
					<code>exports</code> du short ; choisis aussi un dossier et un nom pour une copie. Un export n'écrase jamais le précédent (v1, v2…).
				</p>
				<p className="muted">Le premier export prend plus de temps : il prépare aussi les médias (détourages, animation d'abonnement).</p>
			</>
		),
	},
	{
		id: 'raccourcis',
		title: 'Raccourcis clavier',
		body: (
			<table className="shortcuts">
				<tbody>
					<tr><td><K>Espace</K></td><td>Lecture / pause</td></tr>
					<tr><td><K>←</K> <K>→</K></td><td>Une image en arrière / en avant (avec <K>Maj</K> : une seconde)</td></tr>
					<tr><td><K>Début</K> <K>Fin</K></td><td>Aller au début / à la fin</td></tr>
					<tr><td><K>Suppr</K> ou <K>Retour arrière</K></td><td>Supprimer l'élément sélectionné</td></tr>
					<tr><td><K>Ctrl</K> + <K>Z</K> / <K>Ctrl</K> + <K>Y</K></td><td>Annuler / rétablir</td></tr>
					<tr><td><K>Maj</K> + clic</td><td>Sélectionner plusieurs mots (Transcript)</td></tr>
					<tr><td><K>Maj</K> en faisant pivoter</td><td>Rotation par crans de 15°</td></tr>
					<tr><td>Molette sur la sélection</td><td>Agrandir / réduire dans l'aperçu</td></tr>
				</tbody>
			</table>
		),
	},
	{
		id: 'depannage',
		title: 'Si ça coince',
		body: (
			<ul>
				<li>L'aperçu s'arrête : <B>Reload the preview</B>. Si ça revient, note le message affiché.</li>
				<li>Claude ne répond pas : <a href="#/~settings">Settings</a> → <B>Test the connection</B> dit ce qui manque.</li>
				<li>Un job échoue : onglet Jobs, clique sur le job pour voir son journal ; les détails sont aussi dans le dossier <code>logs</code>.</li>
				<li>La transcription échoue sur PC : mets à jour le pilote de la carte NVIDIA.</li>
				<li>L'app ne s'ouvre plus : relance l'icône AutoShort ; en dernier recours <code>stop.bat</code> (ou <code>stop.sh</code>) puis relance.</li>
			</ul>
		),
	},
];

// Plain text of a section, for the search box.
const textOf = (node: React.ReactNode): string => {
	if (node == null || typeof node === 'boolean') return '';
	if (typeof node === 'string' || typeof node === 'number') return String(node);
	if (Array.isArray(node)) return node.map(textOf).join(' ');
	if (React.isValidElement(node)) return textOf((node.props as {children?: React.ReactNode}).children);
	return '';
};
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const HelpPage: React.FC<{section?: string}> = ({section}) => {
	const [query, setQuery] = useState('');
	const content = useRef<HTMLDivElement>(null);
	const index = useMemo(() => HELP_SECTIONS.map((s) => ({id: s.id, text: fold(`${s.title} ${textOf(s.body)}`)})), []);
	const words = fold(query).split(/\s+/).filter(Boolean);
	const shown = HELP_SECTIONS.filter((s) => {
		const text = index.find((i) => i.id === s.id)!.text;
		return words.every((w) => text.includes(w));
	});

	// #/~help/<id>: open on that section.
	useEffect(() => {
		if (!section) return;
		document.getElementById(`help-${section}`)?.scrollIntoView({block: 'start'});
	}, [section]);

	return (
		<div className="home help">
			<a href="#/" className="back-link">
				<Icon name="back" />
				All shorts
			</a>
			<header className="home-header">
				<h1>Aide</h1>
				<span className="spacer" />
				<ColorModeToggle />
			</header>
			<p className="muted lead">Tout ce que fait AutoShort, fonction par fonction. Cherche un mot (police, son, rotation…) ou choisis un sujet.</p>
			<div className="help-layout">
				<nav className="help-toc" aria-label="Sujets">
					<label className="help-search">
						<Icon name="search" />
						<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher dans l'aide" aria-label="Chercher dans l'aide" />
					</label>
					{shown.map((s) => (
						<a key={s.id} href={`#/~help/${s.id}`} className={section === s.id ? 'active' : ''}>
							{s.title}
						</a>
					))}
				</nav>
				<div className="help-content" ref={content}>
					{shown.length ? null : <p className="muted">Rien trouvé pour « {query} ».</p>}
					{shown.map((s) => (
						<section key={s.id} id={`help-${s.id}`} className="card help-section">
							<h2>{s.title}</h2>
							{s.body}
						</section>
					))}
				</div>
			</div>
			<HomeFooter />
		</div>
	);
};

// Small "?" link to a help section, for the Inspector and the panels.
export const HelpLink: React.FC<{to: string; label?: string}> = ({to, label = 'Aide'}) => (
	<a className="help-link" href={`#/~help/${to}`} target="_blank" rel="noopener" title={`${label} : ouvre l'aide dans une nouvelle fenêtre`}>
		<Icon name="help" size={15} />
	</a>
);
